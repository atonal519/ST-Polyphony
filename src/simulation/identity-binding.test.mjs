import '../../scripts/source-loader.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

const {generateWorldConstruction}=await import('./world-construction.ts');
const {generateAtmosphere}=await import('./atmosphere.ts');
const {generateDevelopment}=await import('./development.ts');
const {createModelRequester}=await import('../models/client.ts');
const {createEmptyState,projectWorldState}=await import('../domain/world-state.ts');
const {mergeWorldPeople}=await import('../domain/world-foundation.ts');
const {projectSourcePerson}=await import('../domain/source-people.ts');

const scope='identity-test';
const bookId='world-book:'+JSON.stringify(['港口','bio']);
const worldSettings={characterDescription:'',partial:false,books:[{name:'港口',entries:[{id:'bio',comment:'人物专条',content:'简行，又名小简，在港口修桥。'}]}]};
function provider(entityId,displayName,options={}) {
 const id='qqj:'+JSON.stringify([scope,entityId]);
 return {id,qqjPersonId:id,displayName,aliases:[],description:'公开资料：'+displayName,profileMaterialProvided:true,
  source:{kind:'plugin',id,label:'模拟 QQJ 档案'},...options};
}
const remote=provider('arrived-late','简行',{aliases:['小简'],manualProfile:{personality:''},
 presentationSource:{personality:'',relations:'陈晓是同事'}});
const other=provider('other','陈晓');
const story=seq=>({status:'ready',throughSeq:seq,turns:[{seq,isUser:false,text:'简行和陈晓说「桥板都齐了」。'}],source:{kind:'chat',id:scope}});
const stage=(onstagePersonIds=[])=>({key:'now',sourceSeqs:[111],onstagePersonIds,offstagePersonIds:[]});
const claims=(participantIds)=>({participantIds,assertedPersonIds:participantIds,assertsUser:false,stageKey:'now'});
const graph=(people,groups=[],relations=[])=>({people,groups,relations});
function harness(reply) {
 const calls=[], reads=[];
 const dependencies={worldSettings:{async read(){return worldSettings;}},
  materials:{async readForQuestions(requests){reads.push(requests);return requests.map(()=>({status:'empty',routerText:'',materials:[],coverage:{partial:false}}));}},
  model:createModelRequester({primary:{},secondary:{}},{async generate(_profile,messages){
   const wire=JSON.parse(messages[1].content);
   calls.push(wire);
   return JSON.stringify(reply(wire));
  }})};
 return {dependencies,calls,reads};
}
async function fixture(qqj=remote) {
 const {dependencies}=harness(()=>({foundation:graph([{key:'N1',name:'简行',aliases:['小简'],identity:'旧档身份',sourceIds:[bookId]}])}));
 const first=await generateWorldConstruction({people:[other],state:createEmptyState(scope),story:story(109),initial:true,dependencies});
 const local=first.state.foundation.people[0].id;
 return {input:{people:mergeWorldPeople([qqj,other],first.state),state:first.state,story:story(111),initial:false},local};
}
function codes(wire) {
 const people=wire.people??wire.background.people;
 const stable=(wire.foundation??wire.background.foundation).people.find(row=>row.name==='简行').id;
 const maybeAlias=people.find(person=>person.name==='简行'&&person.id!==stable)?.id;
 return {stable,qqj:maybeAlias,other:people.find(person=>person.name==='陈晓').id};
}
function responseRows({stable,qqj},reverse,source={sourceSeqs:[111]}) {
 assert.ok(qqj,'the model received two real people codes before the binding');
 const binding={id:stable,qqjPersonId:qqj,identity:'原人物的明确身份',...source};
 const supplement={id:qqj,identity:'重复行的身份',interests:'修钟表',sourceIds:[remote.id],...source};
 return reverse?[supplement,binding]:[binding,supplement];
}
const publish=(input,state)=>projectWorldState(scope,mergeWorldPeople(input.people,state).map(projectSourcePerson),state);

test('same name, aliases and book evidence without an explicit pair keep the late directory row separate',async()=>{
 const {input}=await fixture();
 const mock=harness(wire=>{
  const r=codes(wire);
  assert.ok(r.qqj);
  return {foundation:graph([{id:r.qqj,aliases:['小简'],identity:'旧档身份',sourceIds:[bookId]}])};
 });
 const result=await generateWorldConstruction({...input,dependencies:mock.dependencies});
 assert.equal(result.state.foundation.people.filter(row=>row.name==='简行').length,2);
 assert.equal(publish(input,result.state).people.filter(row=>row.name==='简行').length,2);
 assert.equal(mock.calls.length,1);
});

test('an existing QQJ record can echo its own binding after its source is projected from a book',async()=>{
 const {input}=await fixture();
 const known={...input.state.foundation.people[0],id:remote.id,qqjPersonId:remote.id};
 const state={...input.state,foundation:{...input.state.foundation,people:[known]}};
 const mock=harness(wire=>{
  const {stable}=codes(wire);
  return {foundation:graph([{id:stable,qqjPersonId:stable,interests:'修钟表',sourceSeqs:[111]}])};
 });
 const result=await generateWorldConstruction({...input,state,people:mergeWorldPeople([remote,other],state),dependencies:mock.dependencies});
 assert.deepEqual(result.foundationRejections,[]);
 assert.deepEqual(result.state.foundation.people.map(p=>[p.id,p.qqjPersonId,p.interests]),[[remote.id,remote.id,'修钟表']]);
});

test('construction binds either row order, supplements gaps, and uses the stable ID in groups, relations and baseline activities',async()=>{
 const {input,local}=await fixture();
 for(const reverse of [false,true]){
  const mock=harness(wire=>{
   const r=codes(wire),sources={sourceSeqs:[111]};
   return {stages:[stage([r.qqj])],
    foundation:graph(responseRows(r,reverse,sources),
     [{key:'G1',name:'修桥组',members:[{personId:r.qqj},{personId:r.stable},{personId:r.other}],...sources}],
     [{key:'R1',fromPersonId:r.qqj,toPersonId:r.other,fromRole:'同事',toRole:'同事',directed:false,...sources}]),
    activities:[{key:'A1',description:'等桥板交接。',status:'waiting',participantIds:[r.qqj],...sources}],
    presentationUpdates:[{personId:r.qqj,profileRelations:[{fromPersonId:r.qqj,toPersonId:r.other,fromRole:'同事',toRole:'同事',directed:false}]}]};
  });
  const result=await generateWorldConstruction({...input,dependencies:mock.dependencies});
  const {state}=result;
  assert.deepEqual(result.foundationRejections,[]);
  const [row]=state.foundation.people.filter(p=>p.name==='简行');
  assert.deepEqual(state.foundation.people.filter(p=>p.name==='简行').map(p=>p.id),[local]);
  assert.deepEqual([row.qqjPersonId,row.identity,row.interests],[remote.id,'原人物的明确身份','修钟表']);
  assert.ok(row.sources.some(ref=>ref.id===remote.id)&&row.sources.some(ref=>ref.id===bookId));
  assert.deepEqual(state.foundation.groups[0].members.map(member=>member.personId),[local,other.id]);
  assert.deepEqual([state.foundation.relations[0].fromPersonId,state.foundation.relations[0].toPersonId],[local,other.id]);
  assert.deepEqual(state.activities[0].participantIds,[local]);
  assert.deepEqual(state.developmentOnstagePersonIds,[local]);
  assert.equal(state.developmentPresentation.find(row=>row.personId===local)?.profileRelations?.items[0]?.fromPersonId,local);
  const live=mergeWorldPeople(input.people,state).find(row=>row.id===local);
  assert.equal(live.profileReferenceDescription,remote.description);
  assert.deepEqual(live.manualProfile,remote.manualProfile);
  assert.equal(mock.calls.length,1);
 }
});

test('two incompatible claims and a committed external record leave the pair separate while other rows still apply',async()=>{
 const {input,local}=await fixture();
 const previous=input.state.foundation.people[0];
 for(const scenario of ['conflict','committed','occupied-group','manual']){
  const persons=scenario==='conflict'?[previous,{...previous,id:'second-person',name:'另一个候选'}]:
   scenario==='committed'?[previous,{...previous,id:remote.id,qqjPersonId:remote.id}]:
   scenario==='manual'?[{...previous,sources:[{kind:'manual',id:'manual',label:'已确认'}]}]:[previous];
  const oldActivity={id:'previous-activity',status:'waiting',description:'之前的交接。',participantIds:[remote.id],sources:[]};
  const priorGroup={id:'old-group',name:'旧修桥组',members:[{personId:remote.id,fromWindowId:'earlier'}],
   sources:[],establishedWindowId:'earlier',currentStateWindowId:'earlier'};
  const state={...input.state,foundation:{...input.state.foundation,people:persons,groups:scenario==='occupied-group'?[priorGroup]:[]},
   activities:scenario==='committed'?[oldActivity]:[]};
  const source={...input,state,people:mergeWorldPeople([remote,other],state)};
  const mock=harness(wire=>{
   const r=codes(wire);
   const rows=responseRows(r,false);
   if(scenario==='conflict')rows.push({id:wire.people.find(p=>p.name==='另一个候选').id,qqjPersonId:r.qqj,sourceSeqs:[111]});
   rows.push({id:r.other,identity:'可独立更新的同事',sourceSeqs:[111]});
   return {foundation:graph(rows)};
  });
  const result=await generateWorldConstruction({...source,dependencies:mock.dependencies});
  assert.ok(result.foundationRejections.length);
  assert.equal(result.state.foundation.people.find(p=>p.id===local).qqjPersonId,undefined);
  assert.ok(result.state.foundation.people.some(p=>p.id===remote.id));
  assert.equal(result.state.foundation.people.find(p=>p.id===other.id).identity,'可独立更新的同事');
  assert.deepEqual(result.state.activities,state.activities);
  assert.deepEqual(result.state.foundation.groups,state.foundation.groups);
 }
});

test('taste binds its current group observation, and hearing reads the single disclosed identity',async()=>{
 const {input,local}=await fixture();
 const taste=harness(wire=>{
  const r=codes(wire);
  return {stages:[stage([r.qqj])],
   foundation:graph(responseRows(r,true),[{key:'G1',name:'修桥组',members:[{personId:r.qqj},{personId:r.other}],sourceSeqs:[111]}]),
   atmosphereUpdates:[{key:'mood',circleRef:'G1',personIds:[r.qqj,r.other],stageKey:'now',
    change:{description:'他们公开确认桥板已齐。',assertedPersonIds:[],assertsUser:false,
     observation:{sourceSeq:111,participantIds:[r.qqj,r.other],quote:'桥板都齐了'}}}]};
 });
 const result=await generateAtmosphere({...input,dependencies:taste.dependencies});
 const next={...input,state:result.state,people:mergeWorldPeople(input.people,result.state)};
 assert.deepEqual(next.people.filter(p=>p.displayName==='简行').map(p=>p.id),[local]);
 assert.deepEqual(next.state.developmentAtmospheres[0]?.personIds,[local,other.id]);
 const hearing=harness(wire=>{
  assert.equal(codes(wire).qqj,undefined);
  return {quietReason:'这轮暂无其他实际变化。'};
 });
 await generateDevelopment({...next,dependencies:hearing.dependencies});
 assert.equal(taste.calls.length+hearing.calls.length,2);
});

test('hearing rewrites events and knowledge through accepted aliases and still enforces player, stage and source boundaries',async()=>{
 for(const protection of ['offstage','onstage','camera','user','invalid-source','invalid-supplement']){
  const {input,local}=await fixture(protection==='user'?{...remote,specialRole:'user'}:remote);
  const mock=harness(wire=>{
   const r=codes(wire),rows=responseRows(r,true);
   if(protection==='invalid-source')Object.assign(rows[1],{sourceSeqs:[999],sourceIds:['not-supplied']});
   if(protection==='invalid-supplement')Object.assign(rows[0],{sourceSeqs:[999],sourceIds:['not-supplied']});
   return {stages:[stage(protection==='onstage'?[r.qqj]:[])],foundation:graph(rows),
    events:[{key:'remote-event',description:'做了一次小检查。',...claims([r.qqj,r.stable])},
     {key:'other-event',description:'陈晓取回料单。',...claims([r.other])}],
    knowledge:[{personId:r.qqj,eventId:'remote-event',reason:'亲自做过检查。',...claims([r.qqj])}]};
  });
  const result=await generateDevelopment({...input,...(protection==='camera'?{cameraPersonIds:[remote.id]}:{}),dependencies:mock.dependencies});
  const admitted=['offstage','invalid-source','invalid-supplement'].includes(protection);
  assert.equal(result.addedEvents,admitted?2:1,protection);
  assert.ok(result.state.events.some(row=>row.description==='陈晓取回料单。'));
  if(protection==='invalid-source'){
   assert.equal(result.state.foundation.people.find(p=>p.id===local).qqjPersonId,undefined);
   assert.deepEqual(result.state.events[0].participantIds,[remote.id,local]);
  } else {
   assert.equal(result.state.foundation.people.find(p=>p.id===local).qqjPersonId,remote.id);
   if(protection==='invalid-supplement')assert.equal(result.state.foundation.people.find(p=>p.id===local).interests,'');
   if(admitted){
    assert.deepEqual(result.state.events[0].participantIds,[local]);
    assert.equal(result.state.knowledge[0].personId,local);
   } else {
    assert.ok(result.boundaryRejections.some(row=>row.key==='remote-event'&&row.reason===(protection==='user'?'story-user':'onstage')));
    if(protection==='user')assert.equal(mergeWorldPeople(input.people,result.state).find(p=>p.id===local).specialRole,'user');
   }
  }
  assert.equal(mock.calls.length,1);
 }
});
