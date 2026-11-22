import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'vite';
let server,createWorld,modelRequester,repository;
test.before(async()=>{server=await createServer({configFile:false,server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});({createPeopleWorld:createWorld}=await server.ssrLoadModule('/src/application/people-world.ts'));({createModelRequester:modelRequester}=await server.ssrLoadModule('/src/models/client.ts'));({createWorldRepository:repository}=await server.ssrLoadModule('/src/storage/world-repository.ts'));});test.after(()=>server?.close());
const qid='qqj:["scope","q"]',bookId='world-book:["book","npc"]';
function fixture({failConstructionSave=false,onlyOwned=false,started=false,every=100}={}) {
 let through=8,envelope=null,calls=[],reads=[],saves=[],historyReads=[],worldReads=0,fail=failConstructionSave;
 const q={id:qid,displayName:'教师甲',description:'已给职业',aliases:[],qqjPersonId:qid,source:{kind:'plugin',id:qid,label:'QQJ'}};
 const noise=Array.from({length:40},(_,i)=>({id:'noise'+i,activityId:null,title:'独立旧事'+i,description:'不相关旧事',participantIds:[qid],sources:[],storyTime:null}));
 envelope={revision:1,data:{schemaVersion:1,scopeId:'scope',processedThroughSeq:2,automaticDevelopmentEnabled:started,storyTime:null,activities:[],events:[{id:'origin',activityId:null,title:'待承接起因',description:'旧约定',participantIds:[qid],continuingForPersonIds:[qid],sources:[{kind:'simulation',id:'past',label:'过去'}],storyTime:null},...noise],knowledge:[]}};
 const repo=repository({async get(){return structuredClone(envelope);},async put(collection,id,state,expected){assert.equal(id,'world');assert.equal(expected,envelope.revision);if(fail){fail=false;throw Error('isolated failed save');}envelope={revision:expected+1,data:structuredClone(state)};saves.push(structuredClone(state));return structuredClone(envelope);}});
 const app=createWorld({directory:{readPeople:()=>({status:onlyOwned?'empty':'ready',message:'',scopeId:'scope',people:onlyOwned?[]:[q]})},repository:repo,history:{readStoryHistory(options){historyReads.push(options);const {fromSeq=1,toSeq}=options;const end=toSeq??through;return{status:fromSeq>end?'empty':'ready',throughSeq:end,latestAiSeq:through+1,turns:fromSeq>end?[]:[{seq:end,isUser:false,text:'稳定剧情'}],source:{kind:'chat',id:'scope:'+end},message:''};}},story:{readStoryInput(){throw Error('legacy');}},worldSettings:{async read(){worldReads++;return{characterDescription:'',books:[{name:'book',entries:[{id:'npc',content:'书店店主乙独立经营，与教师甲互助。'}]}],partial:false};}},materials:{async readForQuestion(request){reads.push(structuredClone(request));assert.deepEqual(request.personIds,[qid]);return{status:'empty',message:'',routerText:'',materials:[],coverage:{partial:false,cseStatus:'ready'}};}},config:{getProfile:async()=>({url:'https://offline.invalid',key:'fake',model:'fixture'})},createModelRequester:profiles=>modelRequester(profiles,{async generate(_profile,messages,_max,_signal,onStarted){onStarted?.();const input=JSON.parse(messages[1].content);const actors=input.people??input.background?.people;calls.push({input,system:messages[0].content});
   if(messages[0].content.includes('本次必须返回foundation。'))return JSON.stringify({foundation:{people:[...(!onlyOwned?[{id:input.people[0].id,identity:'教师',sourceIds:[qid]}]:[]),{key:'W',name:'店主乙',identity:'书店店主',sourceIds:[bookId]}],groups:[{key:'G',name:'街区互助',description:'长期互助',members:[...(!onlyOwned?[{personId:input.people[0].id}]:[]),{personId:'W'}],sourceIds:[bookId]}],relations:[]},activities:[],atmosphereUpdates:[],quietReason:'基础明确'});
   const stage={key:'now',sourceSeqs:[input.throughSeq],onstagePersonIds:[],offstagePersonIds:[]};
   if(Object.hasOwn(input,'presentationRequests'))return JSON.stringify({stages:[stage],atmosphereUpdates:[{key:'mood'+input.throughSeq,circleRef:input.background.circles[0].id,title:'互助中的日常',description:'各自照常做事，愿意保留自然往来。',personIds:actors.map(p=>p.id),sourceSeqs:[input.throughSeq],basisEventIds:[],basisMaterialRefs:[],assertedPersonIds:[],assertsUser:false}],quietReason:'氛围平稳'});
   const w=input.people.find(p=>p.name==='店主乙').id,q=input.people.find(p=>p.name==='教师甲')?.id;
   if(input.throughSeq===8)return JSON.stringify({stages:[stage],activities:[],events:[{key:'E',activityId:null,title:'首次自创进展',description:'落实旧约定',participantIds:[w],stageKey:'now',assertedPersonIds:[w],assertsUser:false,eventLinks:onlyOwned?[]:[{eventId:'origin',kind:'continues'}]}],knowledge:q?[{personId:w,eventId:'E',reason:'本人落实旧约定',stageKey:'now',assertedPersonIds:[w],assertsUser:false}]:[],foundation:{people:[],groups:[{id:input.foundation.groups[0].id,description:'已有一次实际协作',members:[],basisEventIds:['E'],stageKey:'now',assertedPersonIds:[w],assertsUser:false}],relations:[]}});
   return JSON.stringify({stages:[stage],activities:[],events:[],knowledge:[],quietReason:'等待下一步条件'});
 }}),advancer:{advance(){throw Error('legacy');}}});
 app.configureDevelopment({isEnabled:()=>true,getEveryReplies:()=>every});return{app,calls,reads,saves,historyReads,get state(){return envelope.data;},get worldReads(){return worldReads;},next(){through=10;}};
}
test('production codec/controller/repository persist 1+2+2 with all actors and actual linked memory in the next round',async()=>{
 const f=fixture();await f.app.refresh();await f.app.startDevelopment();assert.equal(f.app.developmentView.value.error,'');assert.equal(f.calls.length,3);assert.equal(f.state.foundation.people.length,2);assert.equal(f.state.events.length,42);assert.equal(f.state.knowledge.length,1);assert.equal(f.saves.length,3);const w=f.state.foundation.people.find(p=>p.name==='店主乙');assert.ok(f.app.state.value.world.people.some(p=>p.id===w.id));assert.ok(f.calls[1].input.changes.narrativeRoles.autonomous.some(p=>p.name==='店主乙'));assert.equal(f.worldReads,1);assert.ok(f.reads.length>=1);
 await f.app.refresh();assert.ok(f.app.state.value.world.people.some(p=>p.id===w.id));f.next();await f.app.startDevelopment();assert.equal(f.calls.length,5);assert.equal(f.saves.length,5);assert.equal(f.worldReads,1);for(const call of f.calls.slice(3)){const view=call.input.background??call.input;if(call.input.background){assert.deepEqual(view.events,[]);assert.equal(view.knowledge,undefined);}else{assert.ok(view.events.some(e=>e.description==='落实旧约定'));assert.ok(view.events.some(e=>e.id==='origin'));assert.equal(view.knowledge.length,1);}assert.ok(view.events.length<42);if(call.input.background)assert.deepEqual(call.input.changes.sourceContract.eventIds,view.events.map(e=>e.id));else assert.equal(call.input.sourceContract.eventIds,undefined);assert.ok(!view.worldSettings);}
 assert.equal(f.state.events.length,42);assert.ok(f.state.events.some(e=>e.id==='noise0'));await f.app.constructWorld();assert.equal(f.calls.length,6);assert.equal(f.app.developmentView.value.modelCalls,1);
});
test('construction save retry resumes only remaining requests and only-owned worlds make no QQJ reads',async()=>{
 const f=fixture({failConstructionSave:true,onlyOwned:true});await f.app.refresh();await f.app.startDevelopment();assert.equal(f.calls.length,1);assert.equal(f.app.developmentView.value.canSave,true);await f.app.saveDevelopment();assert.equal(f.app.developmentView.value.error,'');assert.equal(f.calls.length,3);assert.equal(f.reads.length,0);assert.equal(f.state.automaticDevelopmentEnabled,true);assert.equal(f.state.foundation.people.length,1);assert.equal(f.app.state.value.source.status,'ready');await f.app.refresh();assert.equal(f.app.state.value.world.people.length,1);
});

test('an already automatic legacy world builds once at stable current S without losing its start permission',async()=>{const f=fixture({started:true,every:1});await f.app.refresh();await f.app.onStoryCompleted();assert.equal(f.calls.length,3);assert.ok(f.historyReads.some(read=>read.currentOnly===true&&read.stableOnly===true));assert.deepEqual(f.calls[0].input.story.map(turn=>turn.seq),[8]);assert.equal(f.state.simulationRanges.at(-1).kind,'current');assert.equal(f.state.automaticDevelopmentEnabled,true);f.next();await f.app.onStoryCompleted();assert.equal(f.calls.length,5);});

test('sparse existing foundation uses formal current evidence, then sends its taste ACK to hearing without another read',async()=>{
 const people=Array.from({length:19},(_,i)=>{const id='qqj:'+JSON.stringify(['scope','q'+i]);return{id,qqjPersonId:id,displayName:'人物'+i,description:'',aliases:[],profileMaterialProvided:true,source:{kind:'plugin',id,label:'QQJ'}};});
 const fields={identity:'',motivations:'',disposition:'',interests:'',life:''};
 const point={id:'S',text:'当前起点',sourceSeqs:[2]};
 let through=8,bookReads=0,materialReads=0;
 const calls=[],saves=[];
 let envelope={revision:5,data:{schemaVersion:1,scopeId:'scope',processedThroughSeq:2,automaticDevelopmentEnabled:true,storyTime:null,activities:[],events:[],knowledge:[],simulationRanges:[{id:'base',kind:'current',from:point,to:point,throughSeq:2,referenceSources:[{kind:'world-book',id:bookId,label:'book'}]}],foundation:{throughSeq:2,windowId:'base',people:people.slice(0,2).map(p=>({id:p.id,name:p.displayName,aliases:[],...fields,sources:[p.source],establishedWindowId:'base',currentStateWindowId:'base'})),groups:[],relations:[]}}};
 const repo=repository({async get(){return structuredClone(envelope);},async put(_c,_id,state,expected){assert.equal(expected,envelope.revision);envelope={revision:expected+1,data:structuredClone(state)};saves.push(structuredClone(state));return structuredClone(envelope);}});
 const app=createWorld({
  directory:{readPeople:()=>({status:'ready',message:'',scopeId:'scope',people})},repository:repo,
  history:{readStoryHistory({fromSeq=1}){return{status:fromSeq>through?'empty':'ready',throughSeq:through,latestAiSeq:through+1,turns:fromSeq>through?[]:[{seq:through,isUser:false,text:'教师人物2和书店店主乙一起帮邻居这件事又被提到。'}],source:{kind:'chat',id:'scope'},message:''};}},
  story:{readStoryInput(){throw Error('legacy');}},
  worldSettings:{async read(){bookReads++;throw Error('normal flow must not scan books');}},
  materials:{async readForQuestion(request){materialReads++;assert.deepEqual(request.personIds,[people[2].id]);return{status:'empty',message:'',routerText:'',materials:[],coverage:{partial:false}};}},
  config:{getProfile:async()=>({url:'https://offline.invalid',key:'fake',model:'fixture'})},
  createModelRequester:profiles=>modelRequester(profiles,{async generate(_profile,messages,_max,_signal,onStarted){
   onStarted?.();const input=JSON.parse(messages[1].content);
   calls.push({input,materialReads,ack:envelope.revision});
   if(Object.hasOwn(input,'presentationRequests')){
    assert.equal(input.background.worldSettings,undefined);
    assert.ok(!messages[0].content.includes('本次必须返回foundation。'));
    if(through!==8)return JSON.stringify({atmosphereUpdates:[]});
    assert.deepEqual(input.foundationPendingPersonIds,['P3']);
    const sourceSeqs=[8];
    return JSON.stringify({foundation:{people:[{id:'P3',identity:'教师',sourceSeqs},{key:'N1',name:'店主乙',identity:'书店店主',sourceSeqs}],groups:[{key:'G',name:'长期互助',members:[{personId:'P3'},{personId:'N1'}],sourceSeqs}],relations:[]},atmosphereUpdates:[{key:'bg',title:'互助的底色',description:'日常往来保留分寸与自然互助。',personIds:['P3','N1'],basisMaterialRefs:['G'],assertedPersonIds:[],assertsUser:false}]});
   }
   assert.equal(input.people.length,20);
   assert.equal(input.foundation.people.length,2);
   assert.equal(input.foundation.people.find(p=>p.id==='P3').identity,'教师');
   assert.ok(!input.people.find(p=>p.name==='人物2').description.includes('教师'));
   assert.ok(input.narrativeRoles.autonomous.some(p=>p.name==='店主乙'));
   assert.equal(input.worldSettings,undefined);
   assert.equal(input.atmospheres.length,1);
   assert.ok(envelope.revision>=6);
   return JSON.stringify({quietReason:'没有新变化'});
  }}),advancer:{advance(){throw Error('legacy');}},
 });
 app.configureDevelopment({isEnabled:()=>true,getEveryReplies:()=>1});
 await app.refresh();await app.startDevelopment();
 assert.equal(app.developmentView.value.error,'');assert.equal(calls.length,2);assert.equal(bookReads,0);
 assert.equal(saves.length,2);assert.equal(calls[1].materialReads,calls[0].materialReads);assert.equal(calls[1].ack,6);
 assert.equal(app.state.value.world.people.length,20);
 through=10;await app.startDevelopment();
 assert.equal(app.developmentView.value.error,'');assert.equal(calls.length,4);assert.equal(bookReads,0);
 assert.equal(materialReads,2);assert.equal(calls[3].materialReads,calls[2].materialReads);
 assert.equal(envelope.data.foundation.people.length,4);
});
