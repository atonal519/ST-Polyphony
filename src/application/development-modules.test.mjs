import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
let server,createPeopleWorld,createStoryHistoryReader,createModelClient,createModelRequester,createConfigService;
test.before(async()=>{server=await createServer({configFile:false,server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});({createPeopleWorld}=await server.ssrLoadModule('/src/application/people-world.ts'));({createStoryHistoryReader}=await server.ssrLoadModule('/src/host/story-history.ts'));({createModelClient,createModelRequester}=await server.ssrLoadModule('/src/models/client.ts'));({createConfigService}=await server.ssrLoadModule('/src/models/config.ts'));});
test.after(()=>server?.close());
const person={id:'p',displayName:'林青',description:'经营文具店',aliases:[],qqjPersonId:'qqj:[\"s\",\"fixture\"]',source:{kind:'plugin',id:'p',label:'人物'}};
const quiet={stages:[{key:'now',sourceSeqs:[2],onstagePersonIds:[],offstagePersonIds:[]}],activities:[],events:[],knowledge:[],quietReason:'仍在等货'};
const smell={stages:quiet.stages,atmosphereUpdates:[{key:'shop',circleRef:'foundation:group:shop-circle',title:'文具店的备货节奏',personIds:['P1'],description:'等候新货期间仍倾向按原计划办事。',basisEventIds:[],sourceSeqs:[2],assertedPersonIds:[],assertsUser:false}]};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
const firstMain={model:'gemini-3.8-flash',url:'https://main-before.invalid/v1',key:'fake-main-key-before'};
const latestMain={model:'gemini-3.8-flash',url:'https://main-after.invalid/v1',key:'fake-main-key-after'};
const secondary={model:'gpt-6-luna',url:'https://taste.invalid/v1',key:'fake-taste-key'};
const sentProfiles=sent=>sent.map(({model,reverse_proxy,proxy_password})=>({model,url:reverse_proxy,key:proxy_password}));

function fixture({failSave=0,blockSave=0,failHearing=false,firstReply=smell,follow=false,secondaryPresetId}={}) {
 let stored={schemaVersion:1,foundation:{throughSeq:0,windowId:'fixture-foundation',people:[{id:'p',name:'林青',aliases:[],identity:'',motivations:'',disposition:'',interests:'',life:'',sources:[{kind:'world-book',id:'fixture-book',label:'既已整理的设定'}],establishedWindowId:'fixture-foundation',currentStateWindowId:'fixture-foundation'}],groups:[{id:'shop-circle',name:'街区经营组',description:'长期协作',members:[{personId:'p',fromWindowId:'fixture-foundation'}],sources:[],establishedWindowId:'fixture-foundation',currentStateWindowId:'fixture-foundation'}],relations:[]},scopeId:'s',storyTime:{text:'2027-03-20T08:00'},processedThroughSeq:1,automaticDevelopmentEnabled:true,activities:[],events:[{id:'old-event',activityId:null,title:'订货已确认',description:'已安排普通进货',participantIds:['p'],storyTime:null,sources:[{kind:'simulation',id:'old-window',label:'已存经历'}]}],knowledge:[]},revision=3,puts=0,materialReads=0,referenceReads=0;
 let primary=firstMain,settingsReads=0;
 const config=createConfigService({
  async get(collection,id){
   assert.deepEqual([collection,id],['settings','api']);
   settingsReads++;
   return {data:{primaryPresetId:'main',secondary,secondaryPresetId,secondaryFollowsPrimary:follow},revision:1};
  },
 },()=>[{id:'main',name:'Fake shared primary',...primary}]);
 const saved=[],sent=[],runs=[],gate=deferred();
 const chat=[{mes:'<!-- SDC-end 2027-03-20T08:00 -->',is_user:false},{mes:'<!-- SDC-end 2027-03-20T09:00 -->店里照常营业。',is_user:false},{mes:'尚未稳定',is_user:false}];
 const client=createModelClient({getHeaders:()=>({}),getProcessingPrompt:()=>'',fetchImpl:async(path,options)=>{assert.equal(path,'/api/backends/chat-completions/generate');const wire=JSON.parse(options.body);sent.push(wire);if(failHearing&&sent.length>1){failHearing=false;return new Response(JSON.stringify({error:'upstream'}),{status:503});}return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(sent.length===1?firstReply:quiet)},finish_reason:'stop'}]}));}});
 const app=createPeopleWorld({directory:{readPeople:()=>({status:'ready',scopeId:'s',people:[person],message:''})},repository:{async load(){return{state:structuredClone(stored),revision};},async save(_scope,next,expected){puts++;assert.equal(expected,revision);if(puts===blockSave)await gate.promise;if(puts===failSave)throw Error('private save failed');stored=JSON.parse(JSON.stringify(next));if(puts===1){stored.developmentAtmospheres[0].description+='（ACK）';if(stored.developmentAtmospheres[0].emotion)stored.developmentAtmospheres[0].emotion.values.worry=22;primary=latestMain;}saved.push(structuredClone(stored));return{state:structuredClone(stored),revision:++revision};}},history:createStoryHistoryReader({getContext:()=>({chat})}),story:{readStoryInput(){throw Error('legacy');}},config,createModelRequester:profiles=>createModelRequester(profiles,client),materials:{async readForQuestion(){materialReads++;return{status:'empty',message:'',routerText:'',materials:[],coverage:{partial:false,cseStatus:'ready'}};}},worldSettings:{async read(){referenceReads++;return{characterDescription:'日间小店',books:[],partial:false};}},diagnostics:{begin(trigger,details){const run={id:String(runs.length+1),trigger,details,events:[]};runs.push(run);return{id:run.id,record(stage,data){run.events.push({stage,data});},protect(){}};}},advancer:{advance(){throw Error('legacy');}}});
 app.configureDevelopment({isEnabled:()=>true,getEveryReplies:()=>1});
 return{app,saved,sent,runs,gate,chat,get stored(){return stored;},get puts(){return puts;},get settingsReads(){return settingsReads;},get materialReads(){return materialReads;},get referenceReads(){return referenceReads;}};
}
test('independent taste uses secondary and hearing consumes the saved ACK and latest primary',async()=>{
 const f=fixture();await f.app.refresh();await f.app.startDevelopment();
 assert.equal(f.sent.length,2);assert.equal(f.saved.length,2);assert.equal(f.saved[0].processedThroughSeq,1);assert.equal(f.saved[0].storyTime.text,'2027-03-20T08:00');assert.equal(f.saved[0].simulationRanges,undefined);
 const hearing=JSON.parse(f.sent[1].messages[1].content);assert.equal(hearing.atmospheres[0].description,'等候新货期间仍倾向按原计划办事。（ACK）');assert.deepEqual(sentProfiles(f.sent),[secondary,latestMain]);assert.equal(f.settingsReads,2);assert.equal(f.stored.processedThroughSeq,2);assert.equal(f.materialReads,1);assert.equal(f.referenceReads,0);
 const [tastePrompt,hearingPrompt]=f.sent.map(request=>request.messages[0].content);
 for(const prompt of [tastePrompt,hearingPrompt])assert.match(prompt,/最终答复只返回一个标准 JSON 对象/);
 assert.match(tastePrompt,/"stages":\[\],"atmosphereUpdates":\[\],"circleNameUpdates":\[\]/);
 assert.match(hearingPrompt,/旧条目用输入给出的 id，新条目用本答唯一的 key/);
 assert.match(hearingPrompt,/events\.activityId 只填已给的旧事务 id、本答新事务的 key 或 null/);
 assert.equal(f.sent[0].max_completion_tokens,65536);assert.equal(Object.hasOwn(f.sent[0],'max_tokens'),false);
 assert.equal(f.sent[1].max_tokens,65536);assert.equal(Object.hasOwn(f.sent[1],'max_completion_tokens'),false);
 assert.equal(f.app.developmentView.value.modelCalls,2);assert.equal(f.app.developmentView.value.remainingCalls,0);
 const rawRuns=f.runs.filter(run=>run.events.some(e=>e.stage==='model-response'));assert.equal(rawRuns.length,2);assert.notEqual(rawRuns[0].id,rawRuns[1].id);assert.equal(rawRuns[0].details.parentId,rawRuns[1].details.parentId);
});
test('following taste uses the saved primary and hearing rereads the shared primary after ACK',async()=>{
 const f=fixture({follow:true});await f.app.refresh();await f.app.startDevelopment();
 assert.deepEqual(sentProfiles(f.sent),[firstMain,latestMain]);assert.equal(f.settingsReads,2);
 assert.equal(f.saved.length,2);assert.equal(f.app.developmentView.value.modelCalls,2);
});
test('an unavailable independent taste preset does not send a model request or save',async()=>{
 const f=fixture({secondaryPresetId:'missing-fake-secondary'});await f.app.refresh();await f.app.startDevelopment();
 assert.match(f.app.developmentView.value.error,/共享 API 预设已失效/);
 assert.equal(f.settingsReads,1);assert.equal(f.sent.length,0);assert.equal(f.puts,0);
 assert.equal(f.app.developmentView.value.modelCalls,0);
});
test('resaving a failed smell candidate does not regenerate it and then continues the one unissued hearing request',async()=>{
 const f=fixture({failSave:1});await f.app.refresh();await f.app.startDevelopment();assert.equal(f.sent.length,1);assert.equal(f.app.developmentView.value.canSave,true);assert.match(f.app.developmentView.value.error,/继续|剩余/);
 await f.app.saveDevelopment();assert.equal(f.sent.length,2);assert.equal(f.puts,3);assert.equal(f.stored.processedThroughSeq,2);assert.equal(f.materialReads,1);
});
test('stop during the first save waits for ACK and a later explicit update only issues hearing',async()=>{
 const f=fixture({blockSave:1});await f.app.refresh();const work=f.app.startDevelopment();while(!f.puts&&f.app.state.value.busy)await new Promise(r=>setImmediate(r));assert.equal(f.puts,1);f.app.stopDevelopment();f.gate.resolve();await work;
 assert.equal(f.sent.length,1);assert.equal(f.saved.length,1);assert.equal(f.stored.processedThroughSeq,1);assert.equal(f.app.developmentView.value.status,'stopped');await f.app.onStoryCompleted();assert.equal(f.sent.length,1);
 await f.app.startDevelopment();assert.equal(f.sent.length,2);assert.equal(f.stored.processedThroughSeq,2);assert.equal(f.materialReads,1);
});
test('hearing API failure reports partial completion and only explicit retry resumes hearing with coherent call counts',async()=>{
 const f=fixture({failHearing:true});await f.app.refresh();await f.app.startDevelopment();assert.equal(f.sent.length,2);assert.equal(f.saved.length,1);assert.match(f.app.developmentView.value.error,/背景/);await f.app.onStoryCompleted();assert.equal(f.sent.length,2);
 await f.app.startDevelopment();assert.equal(f.sent.length,3);assert.equal(f.saved.length,2);assert.equal(f.materialReads,1);assert.equal(f.app.developmentView.value.modelCalls,3);assert.equal(f.app.developmentView.value.totalCalls,3);assert.equal(f.app.developmentView.value.remainingCalls,0);
});
test('resaving a failed hearing candidate saves the existing result with no more model calls',async()=>{
 const f=fixture({failSave:2});await f.app.refresh();await f.app.startDevelopment();assert.equal(f.sent.length,2);assert.equal(f.saved.length,1);assert.equal(f.app.developmentView.value.canSave,true);
 await f.app.saveDevelopment();assert.equal(f.sent.length,2);assert.equal(f.puts,3);assert.equal(f.stored.processedThroughSeq,2);assert.equal(f.app.developmentView.value.remainingCalls,0);
});

test('controller hearing and next taste use the actual serialized numeric ACK, never the unsaved candidate',async()=>{
 const reply={...smell,atmosphereUpdates:[{...smell.atmosphereUpdates[0],background:{description:'订单尚未送达，公开讨论时仍有牵挂。',sourceSeqs:[2],emotion:{values:{worry:40,affinity:60},publicBasis:'公开讨论过等待条件',change:'none',ongoing:true,visibility:'public'}}}]};
 const f=fixture({firstReply:reply});await f.app.refresh();await f.app.startDevelopment();assert.equal(f.sent.length,2);const hearing=JSON.parse(f.sent[1].messages[1].content);assert.equal(hearing.atmospheres[0].emotion.values.worry,22);assert.equal(hearing.circleEmotions[0].values.worry,22);assert.equal(f.saved[0].developmentAtmospheres[0].emotion.values.worry,22);
 f.chat[2]={mes:'<!-- SDC-end 2027-03-20T09:00 -->继续照常经营，尚无新进展。',is_user:false};f.chat.push({mes:'新不稳定',is_user:false});await f.app.refresh();await f.app.startDevelopment();assert.equal(f.sent.length,4);const nextTaste=JSON.parse(f.sent[2].messages[1].content);assert.equal(nextTaste.background.atmospheres[0].emotion.values.worry,22);assert.equal(nextTaste.background.circleEmotions[0].values.worry,22);assert.equal(f.stored.processedThroughSeq,3);
});
