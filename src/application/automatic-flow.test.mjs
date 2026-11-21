import '../../scripts/source-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const {createPeopleWorld}=await import('./people-world.ts');
const {createStoryHistoryReader}=await import('../host/story-history.ts');
const {subscribeStoryCompletion}=await import('../host/story-completion.ts');
const {createEmptyState}=await import('../domain/world-state.ts');
const {createQQJReadinessReader}=await import('../sources/qqj-readiness.ts');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
const person={id:'p',displayName:'店主甲',aliases:[],description:'经营小店',source:{kind:'plugin',id:'p',label:'资料'}};
function fixture({every=1,automatic=true,blockSave=false,blockLoad=false,failSave=false,failHearing=false,reply}={}) {
 let stored={...createEmptyState('q'),processedThroughSeq:1,automaticDevelopmentEnabled:automatic,
  foundation:{throughSeq:1,windowId:'base',people:[{id:'p',name:'店主甲',aliases:[],identity:'店主',sources:[],establishedWindowId:'base',currentStateWindowId:'base'}],groups:[],relations:[]}};
 let revision=1,throughSeq=null,readyStatus='ready',scopeId='q',stopped=false,loads=0,peopleReads=0;
 const listeners=new Map(),readyListeners=new Set(),pending=new Set(),calls=[],saves=[],traces=[],gate=deferred(),loadGate=deferred();
 const context={chat:[{mes:'旧正文',is_user:false},{mes:'继续开店',is_user:true},{mes:'上一楼已完成。',is_user:false},{mes:'新的选择',is_user:true}],
  eventTypes:{USER_MESSAGE_RENDERED:'user',GENERATION_STARTED:'started',CHARACTER_MESSAGE_RENDERED:'rendered'},
  eventSource:{on(name,fn){listeners.set(name,fn);},removeListener(name,fn){assert.equal(listeners.get(name),fn);listeners.delete(name);}}};
 const bridge={schemaVersion:1,kind:'qqj-public-memory-bridge',getReadiness(){return{status:readyStatus==='waiting'?'not-ready':readyStatus,identity:{qqjChatId:scopeId},readyThroughMessageIndex:throughSeq===null?null:throughSeq-1};},
  subscribeReadiness(fn){readyListeners.add(fn);return()=>readyListeners.delete(fn);},getSnapshot(){throw Error('no full snapshot');}};
 const readiness=createQQJReadinessReader({getGlobals:()=>({qqj_v3_public_bridge_v1:bridge})});
 const app=createPeopleWorld({directory:{readPeople(){peopleReads++;return{status:'ready',scopeId,people:[person],message:''};}},history:createStoryHistoryReader({getContext:()=>context}),readiness,
  repository:{async load(scope){loads++;if(blockLoad)await loadGate.promise;return{state:{...structuredClone(stored),scopeId:scope},revision};},async save(_scope,state,expected){assert.equal(expected,revision);if(blockSave&&saves.length===0)await gate.promise;if(failSave)throw Error('save failed');stored=structuredClone(state);saves.push(stored);return{state:structuredClone(stored),revision:++revision};}},
  diagnostics:{begin(trigger){traces.push(trigger);return{id:trigger,protect(){},record(){}};}},
  story:{readStoryInput(){throw Error('legacy');}},config:{getProfile:async()=>({url:'https://offline.invalid',model:'mock',key:'fake'})},
  materials:{async readForQuestion(){return{status:'empty',message:'',routerText:'',materials:[],coverage:{partial:false}};}},
  createModelRequester:()=>({async request(request){request.onStarted?.();calls.push(request);if(failHearing&&request.task==='development')throw Error('hearing failed');return reply?.(request)??(request.task==='atmosphere'?{atmosphereUpdates:[],quietReason:'店内照常经营。'}:{activities:[],events:[],knowledge:[],quietReason:'本段没有新事务。'});}}),advancer:{advance(){throw Error('legacy');}}});
 app.configureDevelopment({isEnabled:()=>true,getEveryReplies:()=>every});
 const subscription=subscribeStoryCompletion((id,type,source)=>{if(stopped)return;const work=app.onStoryCompleted({source,eventSeq:typeof id==='number'?id+1:null,eventType:type});pending.add(work);work.finally(()=>pending.delete(work));},()=>context,readiness);
 async function settle(){for(let i=0;i<50&&(pending.size||app.state.value.busy);i++)await tick();assert.equal(pending.size,0);assert.equal(app.state.value.busy,false);}
 return{app,context,calls,saves,traces,readiness,gate,loadGate,listeners,async emit(name,...args){listeners.get(name)?.(...args);await settle();},
  progress(seq,status='ready',identity=scopeId){throughSeq=seq;readyStatus=status;scopeId=identity;for(const fn of readyListeners)fn();},settle,
  get stored(){return stored;},get loads(){return loads;},get peopleReads(){return peopleReads;},close(){if(stopped)return;stopped=true;subscription();},get readySubscribers(){return readyListeners.size;}};
}
test('new user/start → summary pending/CSE pending → saved readiness runs taste and hearing before main AI finishes',async()=>{
 const f=fixture();try{
  await f.app.refresh();await f.emit('user',3);f.context.chat.push({mes:'新楼还在生成',is_user:false});f.context.streamingProcessor={isFinished:false,isStopped:false,messageId:4};await f.emit('started','normal',{},false);
  assert.equal(f.calls.length,0);f.progress(null);await f.settle();assert.equal(f.calls.length,0);
  f.progress(3);await f.settle();assert.deepEqual(f.calls.map(c=>c.task),['atmosphere','development']);assert.equal(f.context.streamingProcessor.isFinished,false);assert.equal(f.stored.processedThroughSeq,3);
  for(const call of f.calls){assert.equal(call.input.throughSeq,3);assert.doesNotMatch(JSON.stringify(call.input),/新楼还在生成|新的选择/);}
  f.progress(3);await f.settle();await f.emit('rendered',4,'normal');assert.equal(f.calls.length,2);
 }finally{f.close();}
});
test('N=3 counts ready assistant bodies, then duplicates and teardown cannot run again',async()=>{
 const f=fixture({every:3});try{await f.app.refresh();await f.emit('started','normal');f.progress(3);await f.settle();assert.equal(f.calls.length,0);
  f.context.chat.push({mes:'第二段已完成。',is_user:false},{mes:'下一选择',is_user:true});f.progress(5);await f.settle();assert.equal(f.calls.length,0);
  f.context.chat.push({mes:'第三段已完成。',is_user:false},{mes:'最新选择',is_user:true});f.progress(7);await f.settle();assert.equal(f.calls.length,2);assert.equal(f.stored.processedThroughSeq,7);
  f.progress(7);await f.emit('rendered',6);assert.equal(f.calls.length,2);f.close();assert.equal(f.listeners.size,0);assert.equal(f.readySubscribers,0);f.progress(7);await tick();assert.equal(f.calls.length,2);
 }finally{f.close();}
});
test('loaded worlds inspect QQJ notifications without rereading people or world; reaching N refreshes once before dispatch',async()=>{
 const f=fixture({every:3});try{
  await f.app.refresh();assert.equal(f.loads,1);await f.emit('user',3);assert.equal(f.loads,2);await f.emit('started','normal',{},false);assert.equal(f.loads,3);
  const loaded=f.loads,peopleRead=f.peopleReads;
  for(let i=0;i<3;i++){f.progress(null,'waiting');await f.settle();}assert.equal(f.loads,loaded);assert.equal(f.peopleReads,peopleRead);assert.equal(f.calls.length,0);
  f.progress(3);await f.settle();f.progress(3);await f.settle();assert.equal(f.loads,loaded);assert.equal(f.peopleReads,peopleRead);
  f.context.chat.push({mes:'第二段已完成。',is_user:false},{mes:'下一选择',is_user:true});f.progress(5);await f.settle();assert.equal(f.calls.length,0);assert.equal(f.loads,loaded);
  f.context.chat.push({mes:'第三段已完成。',is_user:false},{mes:'新一楼选择',is_user:true},{mes:'仍在流式生成',is_user:false});f.context.streamingProcessor={isFinished:false,isStopped:false,messageId:8};
  f.progress(7);await f.settle();assert.equal(f.calls.length,2);assert.equal(f.loads,loaded+1);assert.equal(f.peopleReads,peopleRead+1);assert.equal(f.context.streamingProcessor.isFinished,false);assert.equal(f.stored.processedThroughSeq,7);
  for(let i=0;i<3;i++){f.progress(7);await f.settle();}assert.equal(f.loads,loaded+1);assert.equal(f.peopleReads,peopleRead+1);assert.equal(f.calls.length,2);
  await f.emit('rendered',8,'normal');assert.equal(f.loads,loaded+2);assert.equal(f.calls.length,2);
 }finally{f.close();}
});
test('cold chat readiness shares an in-flight world read and does not trace a turn with no new story',async()=>{
 const f=fixture({blockLoad:true});
 try{
  f.progress(1);f.progress(1);f.progress(1);
  await tick();
  assert.equal(f.loads,1);
  f.loadGate.resolve();
  await f.settle();
  assert.equal(f.app.state.value.world.id,'q');
  assert.deepEqual(f.calls,[]);
  assert.deepEqual(f.traces,[]);
  await f.app.refresh();
  assert.equal(f.loads,2);
 }finally{f.loadGate.resolve();f.close();}
});
test('manual flow consumes the ready latest AI without waiting for another AI slot',async()=>{
 const f=fixture({automatic:false});try{f.context.chat.pop();await f.app.refresh();f.progress(3);await f.settle();assert.equal(f.calls.length,0);await f.app.startDevelopment();assert.equal(f.calls.length,2);assert.equal(f.stored.processedThroughSeq,3);}finally{f.close();}
});
test('unavailable, bad and wrong-scope readiness cannot consume a floor',async()=>{
 for(const status of ['waiting','unavailable','error']){const f=fixture();try{await f.app.refresh();f.progress(3,status);await f.emit('started','normal');assert.equal(f.calls.length,0);assert.equal(f.stored.processedThroughSeq,1);}finally{f.close();}}
 const f=fixture();try{await f.app.refresh();f.readiness.read=()=>({status:'waiting',throughSeq:null,message:'身份不符'});f.progress(3);await f.emit('rendered',2);assert.equal(f.calls.length,0);}finally{f.close();}
});
test('ready notification received during save is consumed by the existing after-save check',async()=>{
 const f=fixture({blockSave:true});try{await f.app.refresh();f.progress(3);for(let i=0;i<50&&!f.calls.length;i++)await tick();assert.equal(f.calls.length,1);
  f.context.chat.push({mes:'第二段已完成。',is_user:false},{mes:'再下一楼',is_user:true});f.progress(5);await tick();assert.equal(f.calls.length,1);f.gate.resolve();await f.settle();assert.equal(f.calls.length,4);assert.equal(f.stored.processedThroughSeq,5);
 }finally{f.gate.resolve();f.close();}
});
test('readiness cannot restore stopped, failed or unsaved candidate work',async()=>{
 for(const mode of ['stop','error','candidate']){const f=fixture({blockSave:mode==='stop',failHearing:mode==='error',failSave:mode==='candidate'});try{
  await f.app.refresh();f.progress(3);if(mode==='stop'){for(let i=0;i<50&&!f.calls.length;i++)await tick();f.app.stopDevelopment();f.gate.resolve();}await f.settle();assert.equal(f.app.developmentView.value.status,mode==='stop'?'stopped':'error');const count=f.calls.length;
  f.progress(3);await f.emit('started','normal');await f.emit('rendered',2);assert.equal(f.calls.length,count);if(mode==='candidate')assert.equal(f.app.developmentView.value.canSave,true);
 }finally{f.gate.resolve();f.close();}}
});

test('hearing saves usable rows when it omits the only stage already established by taste',async()=>{
 const f=fixture({reply:({task,input})=>task==='atmosphere'
  ? {stages:[{key:'story-'+input.throughSeq,sourceSeqs:[input.throughSeq],onstagePersonIds:[],offstagePersonIds:[]}],quietReason:'店里照常营业。'}
  : input.throughSeq!==3 ? {quietReason:'眼下还是照常营业。'} : {activities:[
    {key:'shelf',description:'把修好的旧货架挪回店门口。',status:'completed',participantIds:['p'],stageKey:'s1',assertedPersonIds:['p'],assertsUser:false},
    {key:'protected',description:'擅自替主角答应送货。',status:'completed',participantIds:['p'],stageKey:'s1',assertedPersonIds:['p'],assertsUser:true},
  ]}});
 try{
  await f.app.refresh();
  f.progress(3);await f.settle();
  assert.deepEqual(f.calls.map(call=>call.task),['atmosphere','development']);
  assert.deepEqual(f.calls[1].input.referenceStages,[{key:'story-3',sourceSeqs:[3],onstagePersonIds:[],offstagePersonIds:[]}]);
  assert.equal(f.stored.processedThroughSeq,3);
  assert.deepEqual(f.stored.activities.map(row=>row.description),['把修好的旧货架挪回店门口。']);
  f.context.chat.push({mes:'又过了一会儿。',is_user:false},{mes:'下一次选择',is_user:true});
  f.progress(5);await f.settle();
  assert.equal(f.calls.length,4);
  assert.equal(f.stored.processedThroughSeq,5);
 }finally{f.close();}
});

test('automatic flow treats protected-only proposals as a quiet floor and develops the next scene',async()=>{
 const f=fixture({reply:({task,input:{throughSeq}})=>{
  const stageKey='story-'+throughSeq,first=throughSeq===3;
  if(task==='atmosphere')return {
   stages:[{key:stageKey,sourceSeqs:[throughSeq],onstagePersonIds:first?['p']:[],offstagePersonIds:first?[]:['p']}],
   atmosphereUpdates:[],quietReason:'没有新的风向。',
  };
  const subjects={stageKey,participantIds:['p'],assertedPersonIds:['p'],assertsUser:false};
  if(first)return {
   activities:[{...subjects,key:'shelf',description:'替正文人物修好了货架。',status:'active'}],
   events:[{...subjects,key:'shelf-step',description:'替正文人物拧紧了螺丝。',activityId:'shelf'}],
   routines:[{personId:'p',activeHours:[[9,17]],basis:'随提案编出的作息'}],
  };
  return {events:[{...subjects,key:'errand',description:'离开铺面后去找木匠。'}]};
 }});
 try{
  await f.app.refresh();f.progress(3);await f.settle();
  assert.equal(f.stored.processedThroughSeq,3);
  assert.equal(f.app.developmentView.value.status,'saved');
  assert.equal(f.calls.length,2);
  assert.deepEqual(f.stored.activities,[]);
  assert.deepEqual(f.stored.events,[]);
  assert.equal(f.stored.developmentRoutines,undefined);
  const firstHearing=f.calls[1].input;
  assert.deepEqual(firstHearing.narrativeRoles.storyControlled.map(row=>row.personId),['p']);
  assert.deepEqual(firstHearing.narrativeRoles.autonomous,[]);
  assert.equal(Boolean(firstHearing.creativeAngles?.length),false);

  f.context.chat.push({mes:'店主甲明确离开铺面。',is_user:false},{mes:'下一次选择',is_user:true});
  f.progress(5);await f.settle();
  assert.deepEqual(f.calls.map(call=>call.task),['atmosphere','development','atmosphere','development']);
  assert.deepEqual(f.calls[3].input.narrativeRoles.autonomous.map(row=>row.personId),['p']);
  assert.equal(f.stored.processedThroughSeq,5);
  assert.deepEqual(f.stored.events.map(row=>row.description),['离开铺面后去找木匠。']);
 }finally{f.close();}
});

test('protected and unbound rows leave no changes and do not pause an established flow',async()=>{
 const f=fixture({reply:({task,input:{throughSeq}})=>task==='atmosphere'
  ? {stages:[{key:'now',sourceSeqs:[throughSeq],onstagePersonIds:['p'],offstagePersonIds:[]}],quietReason:'没有新的风向。'}
  : {events:[
   {key:'protected',description:'替正文人物做决定。',participantIds:['p'],stageKey:'now',assertedPersonIds:['p'],assertsUser:false},
   {key:'unbound',description:'无法确认在哪一幕。',participantIds:['p'],stageKey:'unknown',assertedPersonIds:['p'],assertsUser:false},
  ]}});
 try{
  await f.app.refresh();f.progress(3);await f.settle();
  assert.equal(f.app.developmentView.value.status,'saved');
  assert.match(f.app.developmentView.value.message,/没有可保存/);
  assert.equal(f.stored.processedThroughSeq,3);
  assert.deepEqual(f.stored.events,[]);
  f.context.chat.push({mes:'第二段已完成。',is_user:false},{mes:'再下一楼',is_user:true});
  f.progress(5);await f.settle();
  assert.equal(f.stored.processedThroughSeq,5);
  assert.equal(f.calls.length,4);
 }finally{f.close();}
});

test('hearing can bind a uniquely declared local activity written in id without reviving an unknown durable id',async()=>{
 const missingSavedId='7c425475-3dd3-4d00-9965-c40932b95851';
 const f=fixture({reply:({task,input:{throughSeq}})=>{
  const stageKey='story-'+throughSeq;
  if(task==='atmosphere')return {stages:[{key:stageKey,sourceSeqs:[throughSeq],onstagePersonIds:[],offstagePersonIds:[]}],quietReason:'风向未变。'};
  const subjects={stageKey,participantIds:['p'],assertedPersonIds:['p'],assertsUser:false};
  return {
   activities:[
    {...subjects,id:'fix-shelf',description:'店主开始修货架。',status:'active'},
    {...subjects,id:missingSavedId,description:'这是对未知旧事务的更新。',status:'active'},
    {...subjects,id:'unbound-ref',description:'没有同答引用。',status:'active'},
   ],
   events:[
    {...subjects,key:'shelf-step',activityId:'fix-shelf',description:'拧紧了货架上的两颗螺丝。'},
    {...subjects,key:'missing-step',activityId:missingSavedId,description:'找不到原事务的参考。'},
   ],
   knowledge:[{personId:'p',stageKey,eventId:'shelf-step',reason:'亲自修理',assertedPersonIds:['p'],assertsUser:false}],
  };
 }});
 try{
  await f.app.refresh();f.progress(3);await f.settle();
  assert.equal(f.stored.processedThroughSeq,3);
  assert.equal(f.calls.length,2);
  assert.deepEqual(f.stored.activities.map(row=>row.description),['店主开始修货架。']);
  assert.notEqual(f.stored.activities[0].id,'fix-shelf');
  assert.deepEqual(f.stored.events.map(row=>row.description),['拧紧了货架上的两颗螺丝。']);
  assert.equal(f.stored.events[0].activityId,f.stored.activities[0].id);
  assert.equal(f.stored.knowledge[0].eventId,f.stored.events[0].id);
 }finally{f.close();}
});

test('an unreadable hearing response retains the previous progress and reports a real failure',async()=>{
 const f=fixture({reply:({task})=>task==='development'?{activities:null,events:'无格式返回'}:undefined});
 try{
  await f.app.refresh();f.progress(3);await f.settle();
  assert.equal(f.stored.processedThroughSeq,1);
  assert.equal(f.app.developmentView.value.status,'error');
 }finally{f.close();}
});

test('a paused flow raises one toast with the host timing without an open panel',async()=>{
 const {watchDevelopmentFailure}=await import('../ui/development-notice.ts');
 const f=fixture({failHearing:true});
 const messages=[],cleared=[];
 const original=globalThis.toastr;
 globalThis.toastr={error(...args){messages.push(args);return messages.length;},remove(notice){cleared.push(notice);}};
 const stop=watchDevelopmentFailure(f.app.developmentView);
 try{
  await f.app.refresh();f.progress(3);await f.settle();
  assert.equal(messages.length,1);
  const [message,title,options]=messages[0];
  assert.match(title,/百面相.*暂停/);
  assert.match(message,/听|人物事务/);
  assert.match(message,/百相流转/);
  assert.deepEqual(options,{escapeHtml:true});
  await f.emit('started','normal');f.progress(3);await f.settle();
  assert.equal(messages.length,1);
  await f.app.startDevelopment();await f.settle();
  assert.deepEqual(cleared,[1]);
  assert.equal(messages.length,2);
 }finally{stop();globalThis.toastr=original;f.close();}
});
