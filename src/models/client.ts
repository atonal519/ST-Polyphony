import type { ModelProfile, ModelRequester } from '../application/contracts';
import { getHostContext } from '../host/host-context';
import { getSharedProcessingPrompt, prependProcessingPrompt, resolveSharedProcessingPrompt } from '../host/shared-processing-prompt.js';
import { jsonRequestHeaders } from '../host/request-headers';
import { createPersonCodes, decodeModelResponse, encodePersonReferences } from './person-references';
import {recordDiagnostic,protectDiagnostic,diagnosticError,type DiagnosticTrace} from '../diagnostics/development';

import { generationBody, ModelError, readCompletion, withModelAttempts } from './transport';
export { ModelError, normalizeApiUrl } from './transport';

export function createModelClient({ fetchImpl = (...args: Parameters<typeof fetch>) => fetch(...args), getHeaders = () => getHostContext()?.getRequestHeaders?.() ?? {}, getProcessingPrompt = () => getSharedProcessingPrompt(getHostContext()?.extensionSettings) }: { fetchImpl?: typeof fetch; getHeaders?: () => HeadersInit; getProcessingPrompt?: () => string } = {}) {
  return {
    async generate(profile: ModelProfile, messages: { role: string; content: string }[], maxTokens: number, signal?: AbortSignal, onStarted?: () => void, diagnostic?:DiagnosticTrace, acceptCompleteRows=false): Promise<string> {
      protectDiagnostic(diagnostic,[profile.key,profile.url]);
      if (!profile.url || !profile.model || !profile.key) throw new ModelError('请先完整配置百面相模型 API。', undefined, 'api_not_configured');
      signal?.throwIfAborted();
      const prefix = resolveSharedProcessingPrompt(getProcessingPrompt());
      const systemIndex = messages.findIndex(message => message.role === 'system');
      messages = systemIndex >= 0 ? messages.map((message, index) => index === systemIndex ? { ...message, content: prependProcessingPrompt(message.content, prefix) } : message) : prefix.trim() ? [{ role: 'system', content: prefix }, ...messages] : messages;
      const body = JSON.stringify(generationBody(profile, messages, maxTokens));
      return withModelAttempts(profile, signal, async (attemptSignal, attempt) => {
        onStarted?.();
        recordDiagnostic(diagnostic,'model-dispatched',{model:profile.model,maxTokens,attempt:attempt+1});
        const response=await fetchImpl('/api/backends/chat-completions/generate', {
          method:'POST', headers:jsonRequestHeaders(getHeaders()), signal:attemptSignal, body,
        });
        const logResponse=(raw:string)=>recordDiagnostic(diagnostic,'model-response',()=>({
          httpStatus:response.status, jobId:response.headers?.get?.('x-luker-generation-id'),responseCharacters:raw.length,rawResponse:raw,
        }));
        const {text,finish}=await readCompletion(response,attemptSignal,logResponse);
        attemptSignal.throwIfAborted();
        if (finish==='length'||finish==='max_tokens') {
          if (!acceptCompleteRows) throw new ModelError('模型输出达到长度上限，结果不完整；可在设置中更换支持更长输出的模型后重新更新。',response.status,'output_truncated');
          recordDiagnostic(diagnostic,'partial-response',{finishReason:finish,contentCharacters:text.length});
        }
        if (!text.trim()) throw new ModelError('模型返回了空内容。',response.status,'empty_response');
        return text.trim();
      });
    },
  };
}

export function createModelRequester(profiles: { primary: ModelProfile; secondary: ModelProfile }, client = createModelClient()): ModelRequester {
  return { async request({ task, instructions, input, signal, onStarted, diagnostic }) {
    const profile = task === 'plan' ? profiles.secondary : profiles.primary;
    const record = input !== null && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
    const people = record.people ?? record.knownPeople ?? (task==='atmosphere'?(record.background as {people?:unknown}|undefined)?.people:undefined);
    const personCodes = createPersonCodes(people);
    recordDiagnostic(diagnostic,'model-encoding',{personCodes:Object.fromEntries([...personCodes].map(([id,code])=>[code,id]))});
    try {
    const response = await client.generate(profile, [
      { role: 'system', content: instructions },
      { role: 'user', content: JSON.stringify(encodePersonReferences(input, personCodes)) },
    ], ['trajectory-batch','development','atmosphere','world-construction'].includes(task) ? 65536 : task === 'plan' ? 4096 : 8192, signal, onStarted, diagnostic, task==='world-construction'||task==='smell');
    const decoded=decodeModelResponse(response, personCodes, task);
    recordDiagnostic(diagnostic,'model-decoded',()=>({decodedKind:typeof decoded,recognizedFields:decoded&&typeof decoded==='object'?Object.keys(decoded):[]}));
    return decoded;
    } catch(error) {recordDiagnostic(diagnostic,'model-failed',diagnosticError(error));throw error;}
  } };
}
