import type { ModelProfile } from '../application/contracts';
import { requestPolicy, validateAdvanced } from './advanced';

export class ModelError extends Error {
  constructor(message: string, readonly httpStatus: number | undefined, readonly code: string, readonly retryAfterMs = 0) { super(message); this.name = 'ModelError'; }
}
const REASONING_MODEL = /^(?:openai\/)?(?:gpt-[56]|o[134])(?:$|[.-])/iu;
export function normalizeApiUrl(value: string): string {
  const url = String(value || '').trim().replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(url)) return url.replace(/\/chat\/completions$/i, '');
  return /^https?:\/\/[^/?#]+$/i.test(url) ? url + '/v1' : url;
}

export function generationBody(profile: ModelProfile, messages: {role:string;content:string}[], maxTokens: number) {
  const advanced = profile.advanced ?? {};
  const extra = validateAdvanced(advanced);
  const excluded = new Set(advanced.excludeParams);
  const body: Record<string, unknown> = {model:profile.model, messages, stream:advanced.stream === true};
  const completionLimit = Object.hasOwn(extra,'max_completion_tokens') || !Object.hasOwn(extra,'max_tokens') && REASONING_MODEL.test(profile.model.trim());
  const limitKey = completionLimit ? 'max_completion_tokens' : 'max_tokens';
  delete extra[completionLimit ? 'max_tokens' : 'max_completion_tokens'];
  if (!excluded.has(limitKey) && !Object.hasOwn(extra,limitKey)) body[limitKey] = maxTokens;
  if (advanced.temperature != null && !excluded.has('temperature')) body.temperature = advanced.temperature;
  for(const key of excluded) delete extra[key];
  const url = normalizeApiUrl(profile.url);
  if (!Object.keys(extra).length && !excluded.size) return {...body,chat_completion_source:'openai',reverse_proxy:url,proxy_password:profile.key};
  // Native ST forwards arbitrary body fields through the Custom adaptor.
  return {...body,chat_completion_source:'custom',custom_url:url,custom_include_headers:JSON.stringify({Authorization:'Bearer '+profile.key}),
    custom_include_body:JSON.stringify(extra),custom_exclude_body:JSON.stringify([...excluded])};
}

function providerFailure(response:Response, data:any) {
  const error=data?.error;
  let status = response.status;
  if (response.ok) {
    const reported = Number(error?.status ?? data?.status ?? error?.code);
    const codes = [error?.code, error?.type];
    if (reported >= 400 && reported <= 599) status = reported;
    else if (codes.some(code => ['rate_limit_exceeded','too_many_requests','rate_limit_error'].includes(code))) status = 429;
    else if (codes.some(code => ['internal_server_error','server_error','service_unavailable','overloaded_error'].includes(code))) status = 503;
  }
  const detail=typeof error?.message==='string'?error.message:typeof error==='string'?error:typeof data?.message==='string'?data.message:'';
  const wait=response.headers?.get?.('retry-after');
  const delay=wait ? (/^\d+(\.\d+)?$/.test(wait)?Number(wait)*1000:Date.parse(wait)-Date.now()) : 0;
  const message=status===429?'模型服务暂时限流，请稍后再试。':status>=500?'模型服务暂时出错（HTTP '+status+'），请稍后再试。':'模型请求失败（HTTP '+status+'），请检查 API 配置。';
  return new ModelError(detail || message,status,status===429?'rate_limit':'http_error',Number.isFinite(delay)?Math.max(0,delay):0);
}

type Completion = {text: string; finish?: string};
function contentText(content:unknown):string {
  return typeof content==='string'?content:Array.isArray(content)?content.map(part=>typeof part?.text==='string'?part.text:'').join(''):'';
}
function streamParser(response: Response) {
  const parts:string[]=[];
  let finish:string|undefined;
  return {
    event(block:string) {
      const data=block.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n').trim();
      if(!data)return false;
      if(data==='[DONE]')return true;
      let chunk;
      try { chunk=JSON.parse(data); } catch { throw new ModelError('模型接口返回了无法读取的流式数据。',response.status,'invalid_json'); }
      if(chunk.error) throw providerFailure(response,chunk);
      const choice=chunk.choices?.find((item:any)=>(item?.index??0)===0);
      const delta=contentText(choice?.delta?.content ?? choice?.text);
      if(delta)parts.push(delta);
      else if(choice?.message?.content && !parts.length)parts.push(contentText(choice.message.content));
      if(choice?.finish_reason)finish=choice.finish_reason;
      return false;
    },
    result():Completion {return {text:parts.join(''),finish};}
  };
}
export async function readCompletion(response:Response,signal:AbortSignal,log:(raw:string)=>void):Promise<Completion> {
  const streaming=response.headers?.get?.('content-type')?.includes('text/event-stream');
  if(response.ok && streaming && response.body) {
    const reader=response.body.getReader(), decoder=new TextDecoder(), parser=streamParser(response);
    const cancel=()=>{void reader.cancel().catch(()=>{});};
    signal.addEventListener('abort',cancel,{once:true});
    let buffer='';
    try {
      for(;;) {
        signal.throwIfAborted();
        const {value,done}=await reader.read();
        signal.throwIfAborted();
        buffer+=decoder.decode(value,{stream:!done});
        const blocks=buffer.split(/\r?\n\r?\n/);
        buffer=blocks.pop()!;
        if(done && buffer)blocks.push(buffer);
        if(blocks.some(block=>parser.event(block)) || done){
          const result=parser.result();log(result.text);return result;
        }
      }
    } finally {signal.removeEventListener('abort',cancel);cancel();reader.releaseLock();}
  }
  const raw=await response.text();
  log(raw);
  signal.throwIfAborted();
  if(response.ok && /^(?:data:|:)[^\n]*/.test(raw.trimStart())) {
    const parser=streamParser(response);
    raw.trim().split(/\r?\n\r?\n/).some(block=>parser.event(block));
    return parser.result();
  }
  let data;
  try { data=raw?JSON.parse(raw):{}; } catch {
    if(!response.ok)throw providerFailure(response,null);
    throw new ModelError('模型接口返回了无法读取的结果。',response.status,'invalid_json');
  }
  if(!response.ok||data?.error)throw providerFailure(response,data);
  const choice=data?.choices?.[0];
  return {text:contentText(choice?.message?.content ?? choice?.text),finish:choice?.finish_reason};
}

function pause(ms:number, signal?:AbortSignal) {
  signal?.throwIfAborted();
  return new Promise<void>((resolve,reject)=>{
    const cancel=()=>{clearTimeout(timer);reject(signal?.reason);};
    const timer=setTimeout(()=>{signal?.removeEventListener('abort',cancel);resolve();},ms);
    signal?.addEventListener('abort',cancel,{once:true});
  });
}

export async function withModelAttempts<T>(profile:ModelProfile, signal:AbortSignal|undefined, request:(attemptSignal:AbortSignal,attempt:number)=>Promise<T>):Promise<T> {
  const {timeoutSec,retryCount}=requestPolicy(profile.advanced ?? {});
  for(let attempt=0;;attempt++) {
    signal?.throwIfAborted();
    const controller=new AbortController();
    const cancel=()=>controller.abort(signal?.reason);
    signal?.addEventListener('abort',cancel,{once:true});
    const timeout = new ModelError('模型请求超时，可在高级参数中调整超时秒数。',undefined,'timeout');
    const timer=setTimeout(()=>controller.abort(timeout),timeoutSec*1000);
    let delay=0;
    try {
      return await request(controller.signal,attempt);
    } catch(caught) {
      signal?.throwIfAborted();
      if (!controller.signal.aborted && caught instanceof Error && caught.name === 'AbortError') throw caught;
      const error=controller.signal.aborted?timeout:caught instanceof ModelError?caught:new ModelError('连接模型接口失败，请检查网络和 API 配置。',undefined,'network_error');
      const retryable=['timeout','network_error','rate_limit','empty_response','invalid_json'].includes(error.code)||error.httpStatus===408||(error.httpStatus??0)>=500;
      if(!retryable||attempt>=retryCount)throw error;
      // Respect long Retry-After values without overflowing the platform's timer.
      if (error.retryAfterMs > 2_147_483_647) throw error;
      delay=Math.max(Math.min(500*2**attempt,5000),error.retryAfterMs);
    } finally {clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
    await pause(delay,signal);
  }
}
