import test from 'node:test';
import assert from 'node:assert/strict';
import '../../scripts/source-loader.mjs';
const {createModelClient}=await import('./client.ts');
const {createConfigService}=await import('./config.ts');
const profile={url:'https://transport.invalid',key:'fixture-key',model:'gpt-5'};
const ok=()=>new Response(JSON.stringify({choices:[{message:{content:'OK'}}]}));
function client(fetchImpl){return createModelClient({fetchImpl,getHeaders:()=>({}),getProcessingPrompt:()=>''});}

test('local parameters round trip by preset and independent role without changing other plugins',async()=>{
  const before=globalThis.SillyTavern;
  const shared={id:'p',name:'shared',...profile,qqjAdditionalParams:'{"top_p":0.2}',timeoutSec:70,stream:true};
  const owner={apiPresets:[shared]};
  const settings={'schedule-planner':owner};
  globalThis.SillyTavern={getContext:()=>({extensionSettings:settings,saveSettingsDebounced(){}})};
  let record={data:{primaryPresetId:'p',secondaryFollowsPrimary:true},revision:0};
  const config=createConfigService({async get(){return structuredClone(record);},async put(_s,_k,data,revision){assert.equal(revision,record.revision);record={data,revision:revision+1};}});
  try {
    assert.deepEqual(await config.getProfile('secondary'),profile);
    const advanced={additionalParams:'{"thinking":{"type":"disabled"}}',excludeParams:['top_p'],temperature:0,timeoutSec:40,retryCount:2,stream:true};
    await config.saveEditor('secondary',{advanced});
    assert.deepEqual((await config.getProfiles()).primary.advanced,advanced);
    assert.deepEqual((await config.getConfig()).presets[0].advanced,advanced);
    let raw=settings['schedule-planner'].apiPresets[0];
    assert.deepEqual(raw,{...shared,polyphonyAdvanced:advanced});
    await config.saveConfig({primaryPresetId:'p',primary:{},secondaryFollowsPrimary:false,secondary:{...profile,advanced:{stream:false,temperature:1}}});
    assert.deepEqual((await config.getProfiles()).secondary.advanced,{stream:false,temperature:1});
    const copied=await config.savePresetAs('primary','new',profile,undefined,{select:false});
    await config.saveEditor('primary',{advanced:{temperature:null,additionalParams:'',retryCount:0}});
    assert.equal((await config.getProfile('primary')).advanced.temperature,null);
    assert.deepEqual((await config.getProfile('primary',{role:'primary',presetId:copied})).advanced,advanced);
    assert.equal(settings['schedule-planner'].apiPresets[0].qqjAdditionalParams,shared.qqjAdditionalParams);
    await assert.rejects(config.saveEditor('primary',{advanced:{additionalParams:'[1]'}}),/JSON/);
  } finally {if(before)globalThis.SillyTavern=before;else delete globalThis.SillyTavern;}
});

test('additional JSON survives native custom routing, exclusions win and token budgets are unambiguous',async()=>{
  let payload;
  const api=client(async(_url,init)=>{payload=JSON.parse(init.body);return ok();});
  const advanced={additionalParams:'{"thinking":{"type":"disabled"},"temperature":1,"max_tokens":384}',excludeParams:['temperature','top_k'],temperature:0.5};
  await api.generate({...profile,advanced},[],20);
  assert.equal(payload.chat_completion_source,'custom');
  assert.deepEqual(JSON.parse(payload.custom_include_body),{thinking:{type:'disabled'},max_tokens:384});
  assert.deepEqual(JSON.parse(payload.custom_exclude_body),['temperature','top_k']);
  assert.equal(JSON.parse(payload.custom_include_headers).Authorization,'Bearer fixture-key');
  for(const key of ['max_completion_tokens','max_tokens','reverse_proxy','proxy_password','temperature'])assert.ok(!(key in payload));
  await api.generate({...profile,advanced:{temperature:0}},[],250);
  assert.equal(payload.chat_completion_source,'openai');assert.equal(payload.temperature,0);assert.equal(payload.max_completion_tokens,250);
  await assert.rejects(api.generate({...profile,advanced:{additionalParams:'{"messages":[]}' }},[],1),/不能覆盖/);
});

test('streaming collects fragmented SSE up to DONE, ignores reasoning and accepts ordinary JSON gateways',async()=>{
  const messages=[': ping','data: '+JSON.stringify({choices:[{delta:{reasoning_content:'unused'}}]}),'data: '+JSON.stringify({choices:[{delta:{content:'阿'}}]}),'data: '+JSON.stringify({choices:[{delta:{content:'青'},finish_reason:'stop'}]}),'data: [DONE]'].join('\r\n\r\n')+'\r\n\r\n';
  const bytes=new TextEncoder().encode(messages);let cancelled=false;
  const api=client(async(_p,init)=>{
    assert.equal(JSON.parse(init.body).stream,true);
    return new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=5)c.enqueue(bytes.slice(i,i+5));},cancel(){cancelled=true;}}),{headers:{'content-type':'text/event-stream'}});
  });
  assert.equal(await api.generate({...profile,advanced:{stream:true}},[],100),'阿青');assert.equal(cancelled,true);
  assert.equal(await client(async()=>ok()).generate({...profile,advanced:{stream:true}},[],100),'OK');
});

test('retry budget covers transient failures only and abort interrupts backoff',async()=>{
  let calls=0,started=0;
  const api=client(async()=>++calls===1?new Response('',{status:429}):ok());
  assert.equal(await api.generate({...profile,advanced:{retryCount:1}},[],20,undefined,()=>started++),'OK');assert.equal(started,2);
  calls=0;
  await assert.rejects(client(async()=>{calls++;return new Response('',{status:401});}).generate({...profile,advanced:{retryCount:2}},[],20),e=>e.httpStatus===401);
  assert.equal(calls,1);
  calls=0;
  const embedded=client(async()=>++calls===1?Response.json({error:{code:'rate_limit_exceeded'}}):ok());
  assert.equal(await embedded.generate({...profile,advanced:{retryCount:1}},[],20),'OK');assert.equal(calls,2);
  const abort=new AbortController();
  calls=0;
  await assert.rejects(client(async()=>{calls++;setTimeout(()=>abort.abort(),10);return new Response('',{status:503});}).generate({...profile,advanced:{retryCount:2}},[],20,abort.signal),{name:'AbortError'});
  assert.equal(calls,1);
});

test('per-attempt timeout aborts an unanswered request',async()=>{
  const api=client(async(_p,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true})));
  await assert.rejects(api.generate({...profile,advanced:{timeoutSec:5}},[],20),e=>e.code==='timeout');
});
