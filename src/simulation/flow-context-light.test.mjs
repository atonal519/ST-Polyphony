import '../../scripts/source-loader.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

const {prepareDevelopment,generateDevelopment,developmentContext,rebaseDevelopmentPreparation}=await import('./development.ts');
const {atmosphereContext,generateAtmosphere}=await import('./atmosphere.ts');
const {prepareWorldConstruction}=await import('./world-construction.ts');
const {createModelRequester}=await import('../models/client.ts');
const {mergeWorldPeople}=await import('../domain/world-foundation.ts');

const person=(key,displayName,extra={})=>({id:`qqj:["chat","${key}"]`,displayName,aliases:[],description:`${displayName}有自己的日常。`,identityDescription:'整理馆藏',source:{kind:'plugin',id:`profile-${key}`},...extra});
const [lin,zhou,xu,chen,you,spare]=[person('lin','林青',{aliases:['小林']}),person('zhou','周岚'),person('xu','许宁'),person('chen','陈岸'),person('you','来客',{specialRole:'user'}),person('spare','罗平')];
const names=[lin,zhou,xu,chen,you,spare,...Array.from({length:32},(_,n)=>person('extra'+n,'馆员'+n,{identityDescription:undefined}))];
const activity=(id,title,status,people,description)=>({id,title,status,participantIds:people.map(p=>p.id),description,sources:[{kind:'simulation',id:'past'}]});
const event=(id,activityId,people,description,extra={})=>({id,activityId,title:id,description,participantIds:people.map(p=>p.id),sources:[{kind:'simulation',id:'past'}],storyTime:null,...extra});
function sample() {
 const work=activity('work','整理书架','active',[lin,zhou],'已经分类，等待归位。');
 const waiting=activity('wait','等水电单','waiting',[chen],'等房东先发明细。');
 const events=[event('cause',null,[lin],'过去明确留下的调整理由。'),...Array.from({length:20},(_,n)=>event('old-'+n,work.id,[lin,zhou],'旧步骤'+n)),event('latest',work.id,[lin,zhou],'已经分类，等待归位。',{eventLinks:[{eventId:'cause',kind:'caused-by'}]}),event('wait-history',waiting.id,[chen],'房东还没有发明细。')];
 const foundation={throughSeq:3,windowId:'base',people:[{id:lin.id,name:lin.displayName,aliases:[],identity:'整理馆藏',motivations:'',disposition:'谨慎',interests:'',life:'',sources:[{kind:'world-book',id:'book'}],establishedWindowId:'base',currentStateWindowId:'base'}],groups:[{id:'working',name:'馆藏组',description:'共同维护',members:[{personId:lin.id,fromWindowId:'base'},{personId:zhou.id,fromWindowId:'base'}],sources:[],establishedWindowId:'base',currentStateWindowId:'base'},{id:'far',name:'远处一群',description:'无关底色',members:[{personId:names.at(-1).id,fromWindowId:'base'},{personId:names.at(-2).id,fromWindowId:'base'}],sources:[],establishedWindowId:'base',currentStateWindowId:'base'}],relations:[]};
 const state={schemaVersion:1,scopeId:'chat',processedThroughSeq:3,storyTime:{text:'2027-01-01T09:00'},activities:[work,waiting],events,knowledge:[{personId:spare.id,eventId:'latest',reason:'当时收到实际说明。',sources:[]}],foundation,developmentOnstagePersonIds:[zhou.id],developmentRoutines:[{personId:xu.id,activeHours:[[8,12]]},{personId:lin.id,activeHours:[[8,12]]}],developmentAtmospheres:[]};
 return{people:names,state,story:{throughSeq:4,turns:[{seq:3,text:'陈岸确认过房东安排。',isUser:false,calibrationEligible:false},{seq:4,text:'<!-- QQJ-end 2027-01-01T10:00 -->小林提到许宁，店里仍照常。',isUser:false}],source:{kind:'chat',id:'body'}},initial:false};
}
const empty={status:'empty',materials:[],routerText:'',coverage:{partial:false,cseStatus:'ready'}};
function readers() {
 const calls=[],books=[];
 return{calls,books,dependencies:{materials:{async readForQuestions(requests,scope){calls.push({requests,scope});return requests.map(()=>empty);},async readForQuestion(){throw Error('batch expected');}},worldSettings:{async read(){books.push(true);return{books:[],characterDescription:'世界书只给构筑',partial:false};}}}};
}

test('normal flow first narrows people and matters and reads one anchored QQJ question, while construction still reads books',async()=>{
 const input=sample(),r=readers(),prepared=await prepareDevelopment({...input,dependencies:r.dependencies});
 assert.equal(r.books.length,0);assert.equal(r.calls.length,1);assert.equal(r.calls[0].requests.length,1);assert.equal(r.calls[0].scope.throughSeq,4);
 const req=r.calls[0].requests[0];assert.ok(req.personIds.includes(lin.id)&&req.personIds.includes(xu.id));assert.ok(req.personIds.length<names.length/2);assert.ok(!req.personIds.includes(chen.id));
 const ctx=developmentContext(input,prepared);
 assert.equal(ctx.people.length,names.length);assert.equal(ctx.people.find(row=>row.id===names.at(-1).id).description,undefined);
 assert.ok(ctx.activities.some(row=>row.id==='work')); // Zhou is onstage; Lin can still carry the affair's context.
 assert.ok(!ctx.activities.some(row=>row.id==='wait'));
 await prepareWorldConstruction({...input,dependencies:r.dependencies});assert.equal(r.books.length,1);
});

test('quiet waiting is held and the same open record returns when its condition or participant is touched',async()=>{
 const input=sample(),r=readers();
 let prepared=await prepareDevelopment({...input,dependencies:r.dependencies});
 const model={async request(){return{events:[],quietReason:'未到可推进时点。'};}};
 const quiet=await generateDevelopment({...input,prepared,dependencies:{...r.dependencies,model}});
 assert.deepEqual(quiet.state.activities.find(a=>a.id==='wait'),input.state.activities.find(a=>a.id==='wait'));
 input.story={...input.story,turns:[{seq:4,text:'陈岸说，房东发来了水电明细。',isUser:false}]};
 prepared=await prepareDevelopment({...input,dependencies:r.dependencies});
 assert.ok(developmentContext(input,prepared).activities.some(row=>row.id==='wait'));
 assert.ok(r.calls.at(-1).requests[0].personIds.includes(chen.id));
 input.state.developmentArrangements=[{personId:chen.id,kind:'active',from:'2027-01-01T10:00',to:'2027-01-01T11:00',sourceSeqs:[3]}];
 input.story.turns=[{seq:4,text:'<!-- SDC-end 2027-01-01T10:05 -->',isUser:false}];
 prepared=await prepareDevelopment({...input,dependencies:r.dependencies});
 assert.ok(prepared.focus.activityIds.includes('wait'));
 input.state.storyTime.text='2027-01-01T10:05';
 input.story.turns=[{seq:4,text:'<!-- SDC-end 2027-01-01T10:20 -->',isUser:false}];
 prepared=await prepareDevelopment({...input,dependencies:r.dependencies});
 assert.ok(!prepared.focus.activityIds.includes('wait'));
});

test('selected evidence keeps the latest meaningful result, actual cause and knowledge while omitted old IDs cannot be cited',async()=>{
 const input=sample(),r=readers(),prepared=await prepareDevelopment({...input,dependencies:r.dependencies});
 const captured=[];
 const stage={key:'now',sourceSeqs:[4],onstagePersonIds:['P2'],offstagePersonIds:[]};
 const model=createModelRequester({primary:{model:'main'},secondary:{model:'never'}},{async generate(profile,messages){assert.equal(profile.model,'main');const sent=JSON.parse(messages[1].content);captured.push(sent);return JSON.stringify({stages:[stage],events:[{key:'valid',title:'归位',description:'林青归好书册。',activityId:null,participantIds:['P1'],assertedPersonIds:['P1'],assertsUser:false,stageKey:'now',eventLinks:[{eventId:'cause',kind:'caused-by'},{eventId:'old-0',kind:'continues'}]},{key:'blocked',title:'不应代演',participantIds:['P2'],assertedPersonIds:['P2'],assertsUser:false,stageKey:'now'}]});}});
 const result=await generateDevelopment({...input,prepared,dependencies:{...r.dependencies,model}});const wire=captured[0];
 assert.ok(wire.events.length<8);assert.ok(wire.events.some(row=>row.id==='latest'));assert.ok(wire.events.some(row=>row.id==='cause'));assert.ok(!wire.events.some(row=>row.id==='old-0'));
 assert.deepEqual(wire.knowledge.map(row=>[row.personId,row.eventId]),[['P6','latest']]);
 assert.ok(!wire.personContexts);assert.equal(result.addedEvents,1);assert.deepEqual(result.state.events.at(-1).eventLinks,[{eventId:'cause',kind:'caused-by'}]);
 assert.deepEqual(result.state.events.slice(0,-1),input.state.events);
});

test('taste starts from the same focus, sees its relevant circle and audience, and leaves unrelated winds in the saved state',async()=>{
 const input=sample(),r=readers();input.state.developmentAtmospheres=[{id:'far-wind',circleRef:'foundation:group:far',title:'远处一群',personIds:[names.at(-1).id,names.at(-2).id],description:'无关组的存量描述',basisEventIds:[],sources:[]}];
 input.state.foundation.groups[0].basisEventIds=['cause']; // The group can exist while that memory is one person's.
 const prepared=await prepareDevelopment({...input,dependencies:r.dependencies});
 const ctx=atmosphereContext(input,prepared);
 assert.deepEqual(ctx.background.circles.map(c=>c.entityId),['working']);assert.ok(ctx.background.events.some(e=>e.id==='latest'));assert.ok(!ctx.background.events.some(e=>e.id==='cause'));assert.ok(!ctx.background.atmospheres.some(a=>a.id==='far-wind'));
 assert.ok(!ctx.foundationReferences.some(ref=>ref.id==='foundation:group:working'));
 const result=await generateAtmosphere({...input,prepared,dependencies:{...r.dependencies,model:{async request(){return{atmosphereUpdates:[
  {id:'far-wind',status:'settled'},
  {key:'working',circleRef:'foundation:group:working',personIds:[lin.id,zhou.id],background:{description:'共同整理书架气氛平和。',basisEventIds:['latest']},
   change:{description:'把一个人所知当成全组态度。',basisMaterialRefs:['foundation:group:working'],assertedPersonIds:[],assertsUser:false}},
 ],quietReason:'当前没有气氛变化。'};}}}});
 assert.deepEqual(result.state.developmentAtmospheres.find(row=>row.id==='far-wind'),input.state.developmentAtmospheres[0]);
 assert.equal(result.state.developmentAtmospheres.find(row=>row.circleRef==='foundation:group:working').description,'共同整理书架气氛平和。');
});

test('the saved taste foundation makes formal newcomers and updated aliases candidates in the hearing wire without another read',async()=>{
 const input=sample(),r=readers(),heard=[];
 input.story.turns=[{seq:4,text:'林青谈到金婉秋，并说之后可以先问阿罗。',isUser:false}];
 input.state.foundation.people[0].sources=[lin.source];
 input.people=input.people.map(p=>p.id===lin.id?{...p,profileMaterialProvided:true,presentationSource:{personality:'',relations:''}}:p);
 const prepared=await prepareDevelopment({...input,dependencies:r.dependencies});
 assert.ok(!prepared.focus.mentions.some(row=>row.personId===spare.id));
 const model=createModelRequester({primary:{model:'main'},secondary:{model:'unused'}},{async generate(profile,messages){
  assert.equal(profile.model,'main');
  const wire=JSON.parse(messages[1].content);
  if(wire.background)return JSON.stringify({foundation:{people:[
   {id:'P1',disposition:'遇事先核实。',sourceIds:['profile-lin']},
   {id:'P6',aliases:['阿罗'],sourceSeqs:[4]},
   {key:'N1',name:'金婉秋',identity:'林青提过的熟人',sourceSeqs:[4]},
  ]},quietReason:'当前无风向变化。'});
  heard.push(wire);
  return JSON.stringify({quietReason:'当前没有已发生的额外变化。'});
 }});
 const taste=await generateAtmosphere({...input,prepared,dependencies:{...r.dependencies,model}});
 const ack={...input,state:structuredClone(taste.state),people:mergeWorldPeople(input.people,taste.state)};
 const rebased=rebaseDevelopmentPreparation(ack,prepared);
 const result=await generateDevelopment({...ack,prepared:rebased,dependencies:{...r.dependencies,model}});
 const wire=heard[0],newcomer=wire.people.find(p=>p.name==='金婉秋');
 assert.match(newcomer.id,/^P\d+$/);
 assert.ok(wire.candidates.storyMentions.some(row=>row.personId===newcomer.id&&row.sourceSeqs[0]===4));
 assert.ok(wire.candidates.storyMentions.some(row=>row.personId==='P6'&&row.sourceSeqs[0]===4));
 assert.ok(wire.narrativeRoles.autonomous.some(row=>row.personId===newcomer.id));
 assert.equal(wire.foundation.people.find(p=>p.id===newcomer.id).identity,'林青提过的熟人');
 assert.equal(wire.foundation.people.find(p=>p.id==='P1').disposition,'遇事先核实。');
 assert.deepEqual(result.state.developmentOnstagePersonIds,[zhou.id]);
 assert.equal(r.calls.length,1);
});

test('daily opportunities stay small, include credible recent duties without a routine, and rotate after quiet saves',async()=>{
 const input=sample(),r=readers();
 input.story.turns=[{seq:4,text:'<!-- SDC-end 2027-01-01T10:00 -->外面仍旧是个普通上午。',isUser:false}];
 input.state.activities=[];
 input.state.developmentRoutines=[];
 input.people=[lin,xu,chen,spare];
 input.state.events=input.people.map(p=>event('duty-'+p.id,null,[p],p.displayName+'上次已确认常规交接。'));
 const first=await prepareDevelopment({...input,dependencies:r.dependencies});
 assert.equal(first.focus.everyday.length,3);
 const result=await generateDevelopment({...input,prepared:first,dependencies:{...r.dependencies,model:{async request(){return{quietReason:'照常，暂无新进展。'};}}}});
 const next={...input,state:result.state,story:{...input.story,throughSeq:5,turns:[{seq:5,text:'<!-- SDC-end 2027-01-01T11:00 -->街道仍旧安静。',isUser:false}]}};
 const second=await prepareDevelopment({...next,dependencies:r.dependencies});
 assert.equal(second.focus.everyday.length,3);
 assert.equal(new Set([...first.focus.everyday,...second.focus.everyday].map(row=>row.personId)).size,4);
});

test('hearing gives eligible people their own angles even with active or waiting work, without turning a mention into progress',async()=>{
 const input=sample(),r=readers();
 input.people=[lin,zhou,chen,you,xu,spare];
 input.cameraPersonIds=[spare.id];
 input.story.turns=[{seq:4,text:'<!-- QQJ-end 2027-01-01T10:00 -->只顺口提了许宁和林青的名字。',isUser:false}];
 input.state.developmentRoutines=[{personId:chen.id,activeHours:[[8,12]]},{personId:lin.id,activeHours:[[8,12]]},{personId:xu.id,activeHours:[[14,16]]}];
 input.state.developmentCreativeFrame={key:'legacy',version:1,recipeId:'steady'};
 const captured=[];
 const model=createModelRequester({primary:{model:'main'},secondary:{model:'unused'}},{async generate(profile,messages){
  assert.equal(profile.model,'main');
  captured.push({wire:JSON.parse(messages[1].content),instructions:messages[0].content});
  const actor={participantIds:['P3'],assertedPersonIds:['P3'],assertsUser:false,stageKey:'here'};
  return JSON.stringify({stages:[{key:'here',sourceSeqs:[captured.at(-1).wire.throughSeq],onstagePersonIds:[],offstagePersonIds:[]}],
   events:[{key:'solo',description:'陈岸记下两处愿意交换旧花盆的门口，准备亲手育一批香草。',...actor},
    {key:'camera',description:'罗平擅自回应了陈岸。',...actor,assertedPersonIds:['P3','P6']}]});
 }});
 const prepared=await prepareDevelopment({...input,dependencies:r.dependencies});
 const run=source=>generateDevelopment({...source,prepared,dependencies:{...r.dependencies,model}});
 const first=await run(input);
 const {wire,instructions}=captured[0];
 assert.equal(wire.creativeFrame,undefined);
 assert.deepEqual(new Set(wire.creativeAngles.map(row=>row.personId)),new Set(['P1','P3']));
 assert.ok(wire.creativeAngles.every(row=>Object.keys(row).length===2&&row.angles.length===3&&row.angles.every(angle=>typeof angle==='string'&&angle.length<25)));
 assert.ok(wire.candidates.storyMentions.some(row=>row.personId==='P5'));
 assert.deepEqual(wire.candidates.openMatterIds,[]);
 assert.ok(wire.activities.some(row=>row.id==='work')&&wire.activities.some(row=>row.id==='wait'));
 assert.match(instructions,/参考性场外NPC日常/);
 assert.match(instructions,/例行等待/);
 assert.match(instructions,/只写event/);
 assert.equal(r.calls.length,1);
 assert.equal(r.calls[0].requests[0].question,'');
 assert.ok(r.calls[0].requests[0].personIds.includes(chen.id));
 assert.equal(first.addedEvents,1);
 assert.ok(first.boundaryRejections.some(row=>row.key==='camera'&&row.reason==='onstage'));
 assert.deepEqual(first.state.activities,input.state.activities);
 assert.deepEqual(first.state.developmentCreativeFrame,input.state.developmentCreativeFrame);
 assert.equal(first.state.events.at(-1).activityId,null);
 await run(input);
 assert.deepEqual(captured[1].wire.creativeAngles,wire.creativeAngles);
 await run({...input,story:{...input.story,throughSeq:5,turns:input.story.turns.map(turn=>({...turn,seq:5}))}});
 assert.notDeepEqual(captured[2].wire.creativeAngles,wire.creativeAngles);
 await run({...input,state:{...input.state,scopeId:'another-chat'}});
 assert.notDeepEqual(captured[3].wire.creativeAngles,wire.creativeAngles);
 assert.equal(r.calls.length,1);
});

test('established role and genuine past life get angles ahead of awake one-off mentions',async()=>{
 const input=sample(),r=readers();
 const cameos=Array.from({length:4},(_,index)=>person('a'+index,'过路客'+index,{identityDescription:'正文里短暂路过的人',source:{kind:'chat',id:'history-floor:4'}}));
 const past=person('z','老郑',{identityDescription:undefined});
 input.people=[...cameos,lin,chen,past];
 input.state.activities=[activity('work','组装新柜子','active',[lin],'柜脚已经锯好。'),activity('rent','月底租金','waiting',[chen],'等核对到账。')];
 input.state.events=[event('old-past',null,[past],'老郑昨天去借工具，把菜地旁的木栏收拾好了。')];
 input.state.developmentRoutines=input.people.map(p=>({personId:p.id,activeHours:[[8,12]]}));
 input.story.turns=[{seq:4,text:'<!-- QQJ-end 2027-01-01T10:00 -->只听人提到过路客0和过路客1。',isUser:false}];
 const prepared=await prepareDevelopment({...input,dependencies:r.dependencies});
 const wire=developmentContext(input,prepared);
 assert.deepEqual(new Set(wire.creativeAngles.map(row=>row.personId)),new Set([lin.id,chen.id,past.id]));
 assert.ok(wire.activities.some(row=>row.id==='rent'));
});

test('hearing sends only two unrelated active matters and preserves both text and participant matches',async()=>{
 const input=sample(),r=readers();
 input.people=[lin,zhou,chen,spare];
 input.state.activities=[
  activity('direct','重新悬挂蓝窗帘','active',[zhou],'旧帘子一直没有拆下。'),
  activity('by-person','等收货凭据','waiting',[lin],'收据还在寄送中。'),
  activity('waiting-context','月底那笔房租','waiting',[chen],'等对方到账回复。'),
  ...Array.from({length:5},(_,index)=>activity('unrelated-'+index,'其它旧事项'+index,'active',[spare],'有过旧进展。')),
 ];
 input.state.events=[];
 input.state.developmentRoutines=[{personId:chen.id,activeHours:[[8,12]]}];
 input.story.turns=[{seq:4,text:'<!-- QQJ-end 2027-01-01T10:00 -->本子上写着重新悬挂蓝窗帘。林青只顺路来打了个招呼。',isUser:false}];
 const prepared=await prepareDevelopment({...input,dependencies:r.dependencies});
 const calls=[];
 await generateDevelopment({...input,prepared,dependencies:{...r.dependencies,model:{async request(request){
  calls.push(request);return {quietReason:'旧事按原状态等待。'};
 }}}});
 const [{input:wire,instructions}]=calls;
 assert.deepEqual(wire.candidates.openMatterIds,['direct']);
 assert.deepEqual(wire.activities.map(row=>row.id),['direct','by-person','waiting-context','unrelated-3','unrelated-4']);
 assert.match(instructions,/同一笔房租.*沿.*ID/);
 assert.match(instructions,/修邻居的门.*独立/);
 assert.match(instructions,/纯过场只写event/);
 assert.match(instructions,/各项必有stageKey、assertedPersonIds和assertsUser/);
 assert.match(instructions,/每个stageKey引用本轮实际场段/);
 assert.doesNotMatch(instructions,/"stageKey":"s1"/);
 assert.equal(r.calls.length,1);
});

test('hearing with no available people still sends one quiet request while construction and taste keep their legacy frame',async()=>{
 const input=sample(),r=readers();
 input.people=[you,xu];
 input.story.turns=[{seq:4,text:'<!-- QQJ-end 2027-01-01T10:00 -->许宁仍在睡。',isUser:false}];
 input.state.developmentRoutines=[{personId:xu.id,activeHours:[[14,16]]}];
 const calls=[];
 const model={async request(request){calls.push(request);return {quietReason:'没有可展开的场外变化。'};}};
 const prepared=await prepareDevelopment({...input,dependencies:r.dependencies});
 const result=await generateDevelopment({...input,prepared,dependencies:{...r.dependencies,model}});
 assert.equal(calls.length,1);
 assert.equal(calls[0].input.creativeAngles,undefined);
 assert.equal(calls[0].input.creativeFrame,undefined);
 assert.equal(result.addedEvents,0);
 assert.ok(atmosphereContext(input,prepared).creativeFrame.intensity);
});

test('a completed checkpoint with no event remains referable when the same matter is named again',async()=>{
 const input=sample(),r=readers();
 const completed=activity('formal-closed','报修屋门','completed',[chen],'已由房东确认修好。');
 const unrelated=activity('unrelated-closed','登记门票','completed',[names.at(-1)],'已经登记。');
 input.state.activities.push(completed,unrelated);
 input.story.turns=[{seq:4,text:'又说到之前的报修屋门。',isUser:false}];
 const prepared=await prepareDevelopment({...input,dependencies:r.dependencies});
 const wire=developmentContext(input,prepared);
 assert.ok(wire.activities.some(row=>row.id===completed.id&&row.status==='completed'));
 assert.ok(!wire.activities.some(row=>row.id===unrelated.id));
 assert.ok(!wire.candidates.openMatterIds.includes(completed.id));
});

test('compact hearing still accepts a sourced correction with all previous witnesses and does not grant new knowledge',async()=>{
 const input=sample(),r=readers();
 input.story.turns=[{seq:4,text:'林青收到正式通知：原本的分类安排已经取消。',isUser:false}];
 input.state.knowledge.push({personId:names.at(-1).id,eventId:'latest',reason:'只收到早先未核实的消息。',sources:[]});
 const prepared=await prepareDevelopment({...input,dependencies:r.dependencies});
 const model=createModelRequester({primary:{},secondary:{}},{async generate(_profile,messages){
  const wire=JSON.parse(messages[1].content);
  assert.equal(wire.calibrationContract,undefined);
  assert.match(messages[0].content,/calibration只同步正文事实.*eventCorrections.*knowledgeCorrections/);
  assert.deepEqual(wire.sourceContract.calibrationSeqs,[4]);
  const witnesses=wire.knowledge.filter(row=>row.eventId==='latest');
  assert.equal(witnesses.length,2);
  return JSON.stringify({calibration:{
   facts:[{key:'confirmed',title:'取消分类',description:'正式通知已取消分类。',participantIds:['P1'],sourceSeqs:[4]}],
   eventCorrections:[{eventId:'latest',byEventId:'confirmed',reason:'正式通知否定了原进展。'}],
   knowledgeCorrections:witnesses.map((row,n)=>({personId:row.personId,eventId:row.eventId,byEventId:'confirmed',treatment:n?'invalidated':'retained-report',reason:'旧消息的知情仍须另行处理。'})),
  }});
 }});
 const {state}=await generateDevelopment({...input,prepared,dependencies:{...r.dependencies,model}});
 const fact=state.events.find(row=>row.description==='正式通知已取消分类。');
 assert.equal(state.events.find(row=>row.id==='latest').correction.byEventId,fact.id);
 assert.deepEqual(state.knowledge.map(row=>row.correction.treatment),['retained-report','invalidated']);
 assert.ok(!state.knowledge.some(row=>row.eventId===fact.id));
});
