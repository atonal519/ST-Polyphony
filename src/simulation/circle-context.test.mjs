import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'vite';
let server,generate,requester,collect,select,mergeRhythm,tasteCircles,boundAtmospheres,socialContexts;
test.before(async()=>{server=await createServer({configFile:false,server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});({generateAtmosphere:generate}=await server.ssrLoadModule('/src/simulation/atmosphere.ts'));({createModelRequester:requester}=await server.ssrLoadModule('/src/models/client.ts'));({collectLifeMaterials:collect}=await server.ssrLoadModule('/src/simulation/life-materials.ts'));({selectWorldMemory:select}=await server.ssrLoadModule('/src/simulation/world-memory.ts'));({mergeLifeRhythm:mergeRhythm}=await server.ssrLoadModule('/src/simulation/life-rhythm.ts'));({tasteCircles,boundAtmospheres,socialContexts}=await server.ssrLoadModule('/src/domain/social-circles.ts'));});test.after(()=>server?.close());
const source={kind:'world-book',id:'book:npc',label:'书'},q=id=>'qqj:'+JSON.stringify(['s',id]);
const people=['p','q','r','owned'].map(id=>({id:id==='owned'?id:q(id),...(id==='owned'?{}:{qqjPersonId:q(id)}),displayName:id,aliases:[],description:'当前必要人物资料'+id,identityDescription:'本人的长期职责'+id,source}));
const [p,qid,r,w]=people.map(p=>p.id),fields={identity:'已知职责',motivations:'长期关切',disposition:'各有原则',interests:'各有兴趣',life:''};
const state=()=>({schemaVersion:1,scopeId:'s',processedThroughSeq:1,automaticDevelopmentEnabled:true,storyTime:null,activities:[{id:'task',title:'修理水泵',description:'等材料到齐',status:'waiting',participantIds:[p],sources:[]}],events:[{id:'bad',activityId:null,title:'已纠正背景',description:'不再成立',participantIds:[p],sources:[],storyTime:null,correction:{byEventId:'truth',reason:'已纠正'}}],knowledge:[],foundation:{throughSeq:1,windowId:'base',people:people.map(row=>({id:row.id,name:row.displayName,aliases:[],...fields,sources:[source],establishedWindowId:'base',currentStateWindowId:'base'})),groups:[{id:'g1',name:'社区互助圈',description:'分工互助',members:[{personId:p,fromWindowId:'base'},{personId:qid,fromWindowId:'base'},{personId:r,fromWindowId:'base',toWindowId:'left'}],sources:[source],establishedWindowId:'base',currentStateWindowId:'base'},{id:'g2',name:'夜班伙伴',description:'不同作息下合作',members:[{personId:p,fromWindowId:'base'},{personId:r,fromWindowId:'base'},{personId:w,fromWindowId:'base'}],sources:[source],establishedWindowId:'base',currentStateWindowId:'base'},{id:'ended',name:'旧圈',members:[{personId:p,fromWindowId:'base'}],sources:[source],establishedWindowId:'base',currentStateWindowId:'base',endedWindowId:'end'},{id:'invalid',name:'被纠正圈',members:[{personId:p,fromWindowId:'base'}],sources:[source],basisEventIds:['bad'],establishedWindowId:'base',currentStateWindowId:'base'}],relations:[{id:'rel',fromPersonId:qid,toPersonId:r,fromRole:'委托方',toRole:'受托方',directed:true,sources:[source],establishedWindowId:'base'},{id:'old-rel',fromPersonId:p,toPersonId:r,fromRole:'旧同事',toRole:'旧同事',sources:[source],establishedWindowId:'base',endedWindowId:'end'}]}});
const story={status:'ready',throughSeq:4,turns:[{seq:3,isUser:true,text:'完整用户正文'},{seq:4,isUser:false,text:'完整正式正文'+ '长尾资料'.repeat(3000)}],source:{kind:'chat',id:'s'}};
test('real taste wire leads with effective overlapping circles and keeps the whole story in a separate changes section',async()=>{let sent,system;const model=requester({primary:{},secondary:{}},{async generate(_profile,messages){sent=JSON.parse(messages[1].content);system=messages[0].content;return JSON.stringify({atmosphereUpdates:[]});}});await generate({people,state:state(),story,initial:false,prepared:{materials:[],currentClock:null,creativeFrame:{key:'steady',version:1,recipeId:'steady'},narrativeRoles:{storyControlled:[],autonomous:[],policy:''},restHint:{generate:true,reason:'unknown-time'}},dependencies:{model}});assert.ok(sent.background);assert.match(system,/每条有效风向必须给出emotion/);assert.match(system,/无变化时承接输入旧值/);assert.match(system,/description直接展示给用户/);assert.match(system,/“公开”是认知约束/);assert.match(system,/普通长期关系或日常继续本身不算ongoing/);assert.match(system,/stages每项含\{key,sourceSeqs,onstagePersonIds,offstagePersonIds\}/);assert.deepEqual(sent.changes.story,story.turns);assert.deepEqual(sent.changes.sourceContract.storySeqs,[3,4]);assert.deepEqual(sent.background.circles.map(c=>c.id),['foundation:group:g1','foundation:group:g2','foundation:relation:rel']);assert.deepEqual(sent.background.circles[0].personIds,['P1','P2']);assert.deepEqual(sent.background.circles[1].personIds,['P1','P3','P4']);assert.equal(sent.background.circles[2].fromRole,'委托方');assert.equal(sent.people,undefined);assert.match(sent.background.people[0].description,/当前必要人物资料/);for(const key of ['routines','arrangements','restHint','calibrationContract'])assert.equal(sent[key],undefined);});
test('the one shared retrieval pool retains circles, direct relations, long-term roles and personal affairs within four themes/40k',async()=>{const calls=[];const result=await collect(people,state(),{async readForQuestion(request){calls.push(request);return{status:'empty',routerText:'',materials:[],coverage:{partial:false}};}},4);assert.equal(result.readCount,calls.length);assert.ok(calls.length<=5);assert.ok(calls.reduce((n,r)=>n+r.maxCharacters,0)<=40000);assert.ok(calls.every(row=>row.personIds.every(id=>[p,qid,r].includes(id))));const all=calls.map(row=>row.question).join('\n');for(const text of ['社区互助圈','夜班伙伴','委托方','修理水泵','本人的长期职责p'])assert.ok(all.includes(text),text);assert.doesNotMatch(all,/旧圈|被纠正圈|旧同事/);assert.ok(calls.some(row=>row.question.includes('修理水泵')&&row.question.includes('本人的长期职责p')));});
test('a completed factual activity without an event stays available by identity without becoming a current todo or inventing memory',()=>{const s=state();s.activities=[{id:'done',title:'正文已完成的交接',description:'交接已完成，材料已交清',status:'completed',participantIds:[p],sources:[{kind:'chat',id:'history-floor:1',label:'正文'}]}];s.events=[];const view=select(people,s);assert.equal(view.activities[0]?.id,'done');assert.equal(view.activities[0]?.status,'completed');assert.deepEqual(view.personContexts.find(c=>c.personId===p).activityIds,[]);assert.deepEqual(view.events,[]);assert.deepEqual(view.knowledge,[]);});
test('flat numeric activeHours normalize mechanically while nested, empty and invalid updates retain their prior semantics',()=>{const s=state();s.developmentRoutines=[{personId:p,activeHours:[[8,22]],tentative:true}];const next=mergeRhythm(s,people,{routines:[{personId:p,activeHours:[11,2],tentative:true,basis:'已有夜间职责'}]},null);assert.deepEqual(next.developmentRoutines[0],{personId:p,activeHours:[[11,2]],tentative:true,basis:'已有夜间职责'});for(const hours of [[],[24,0],[11,'2'],[11,11],[[11,2],[2,2]]])assert.deepEqual(mergeRhythm(s,people,{routines:[{personId:p,activeHours:hours}]},null).developmentRoutines[0],s.developmentRoutines[0]);assert.deepEqual(mergeRhythm(s,people,{routines:[{personId:p,activeHours:[[11,2],[4,7]]}]},null).developmentRoutines[0].activeHours,[[11,2],[4,7]]);});

test('recent completion selection stays bounded while latest saved completion and untouched authority remain available',()=>{const s=state(),point={id:'S',text:'当前',sourceSeqs:[1]};s.simulationRanges=[{id:'new',kind:'current',from:point,to:point,throughSeq:4}];s.activities=Array.from({length:20},(_,i)=>({id:'done'+i,title:'完成'+i,description:'完成摘要'+i,status:'completed',participantIds:[p],sources:[],...(i===0?{currentStateWindowId:'new'}:{})}));s.events=[];const view=select(people,s);assert.equal(view.activities.length,4);assert.ok(view.activities.some(a=>a.id==='done0'));assert.ok(view.activities.some(a=>a.id==='done19'));assert.equal(s.activities.length,20);assert.deepEqual(view.personContexts.find(c=>c.personId===p).activityIds,[]);});
test('long affair descriptions cannot crowd social names, roles and personal identities out of the same bounded queries',async()=>{const s=state();s.activities=people.map((row,i)=>({id:'a'+i,title:'事务'+i,description:'长描述'.repeat(6000),status:'active',participantIds:[row.id],sources:[]}));const calls=[];await collect(people,s,{async readForQuestion(r){calls.push(r);return{status:'empty',routerText:'',materials:[],coverage:{partial:false}};}},4);const theme=calls.filter(r=>r.question);assert.ok(theme.length<=4);assert.ok(theme.every(r=>r.question.length<=8000));const text=theme.map(r=>r.question).join('\n');for(const value of ['社区互助圈','夜班伙伴','委托方','长期职责','事务0','事务1','事务2'])assert.ok(text.includes(value),value);assert.ok(calls.reduce((n,r)=>n+r.maxCharacters,0)<=40000);});


function namedCircleWorld() {
 const names=['林澈','许闻','沈青岚','甲','乙','丙','丁'];
 const people=names.map((displayName,i)=>({id:'person-'+i,displayName}));
 const relations=people.slice(1).map((person,i)=>({id:'relation-'+i,fromPersonId:people[0].id,toPersonId:person.id,fromRole:'委托方',toRole:'受托方',directed:true,sources:[],establishedWindowId:'base'}));
 const group={id:'alliance',name:'西桥跨院同盟',description:'已知群体说明',members:people.map(person=>({personId:person.id,role:'成员',fromWindowId:'base'})),sources:[],establishedWindowId:'base',currentStateWindowId:'base'};
 const circles=[{ref:'foundation:group:alliance',personIds:[people[0].id,people[1].id]},...relations.slice(0,5).map(relation=>({ref:'foundation:relation:'+relation.id,personIds:[relation.fromPersonId,relation.toPersonId]}))];
 const titles=['旧气氛标题','林澈与许闻','旧街与邻里互助圈','甲和林澈','林澈 、 乙','同行护持'];
 const atmospheres=circles.map((circle,i)=>({id:'wind-'+i,circleRef:circle.ref,title:titles[i],description:'原有背景与成员差异'+i,personIds:circle.personIds,basisEventIds:[],basisMaterialRefs:[circle.ref],sources:[{kind:'simulation',id:'saved-'+i,label:'原依据'}],visual:{temperature:'warm',rhythm:'calm'}}));
 return {people,foundation:{people:[],groups:[group],relations},events:[],atmospheres};
}

test('projection keeps thematic titles and falls back to explicit roles for legacy endpoint strings',()=>{
 const world=namedCircleWorld(),before=structuredClone(world),contexts=socialContexts(world.people,world);
 const cards=tasteCircles(world),bound=boundAtmospheres(world.people,world);
 assert.deepEqual(cards.map(card=>card.title),['西桥跨院同盟','委托方与受托方往来','旧街与邻里互助圈','委托方与受托方往来','委托方与受托方往来','同行护持']);
 assert.deepEqual(cards.map(({title,...card})=>card),world.atmospheres.map(row=>({id:row.circleRef,description:row.description,personIds:contexts.find(circle=>circle.id===row.circleRef).personIds,atmosphereIds:[row.id],visual:row.visual})));
 assert.deepEqual(bound,world.atmospheres.map((row,i)=>({...row,title:cards[i].title})));
 assert.deepEqual(socialContexts(world.people,world),contexts);
 assert.deepEqual(contexts.map(circle=>circle.kind),['group',...Array(6).fill('relation')]);
 assert.equal(contexts[1].name,'林澈（委托方）—许闻（受托方）');
 assert.deepEqual(world,before);
});

test('one circle shows a repeated background once and keeps the complete text of each change',()=>{
 const world=namedCircleWorld(),wind=world.atmospheres[1];
 const background='两人是多年的旧友。';
 const longChange='他们平日碰面就能说笑。'.repeat(12)+'今天却要等同伴先开口。';
 wind.description=background+'\n\n午餐时还能随意打趣。';
 const second={...wind,id:'second-wind',description:background+'\r\n\r\n'+longChange};
 world.atmospheres.push(second);
 const before=structuredClone(world);
 assert.ok(longChange.length>100);
 assert.equal(tasteCircles(world)[1].description,[background,'午餐时还能随意打趣。',longChange].join('\n\n'));
 assert.deepEqual(world,before);
});

test('multiple saved winds for one relation retain one subject title and every original description and atmosphere identity',()=>{
 const world=namedCircleWorld();
 world.atmospheres.push({...world.atmospheres[1],id:'second-wind',title:'街坊熟人圈',description:'另一段有效背景'});
 // Legacy exact basis references resolve to the same relation without rewriting the row.
 delete world.atmospheres[1].circleRef;
 const before=structuredClone(world),cards=tasteCircles(world),bound=boundAtmospheres(world.people,world),card=cards[1];
 assert.equal(cards.length,6);
 assert.equal(card.title,'街坊熟人圈');
 assert.deepEqual(card.atmosphereIds,['wind-1','second-wind']);
 assert.equal(card.description,'原有背景与成员差异1\n\n另一段有效背景');
 assert.deepEqual(card.personIds,['person-0','person-1']);
 assert.equal(card.visual,undefined);
 assert.deepEqual(bound.filter(row=>row.circleRef===card.id).map(row=>row.title),[card.title,card.title]);
 assert.deepEqual(world,before);
});

test('exact aliases also identify the legacy name pair and a thematic title survives unavailable endpoint labels',()=>{
 const world=namedCircleWorld();
 world.people[0].displayName='林澈新名';
 world.people[0].aliases=['林澈'];
 world.people[1]={id:'person-1',name:'许闻本名',aliases:['许闻']};
 world.people.reverse();
 const before=structuredClone(world),context=socialContexts(world.people,world)[1];
 assert.equal(tasteCircles(world)[1].title,'委托方与受托方往来');
 assert.equal(boundAtmospheres(world.people,world)[1].title,'委托方与受托方往来');
 assert.deepEqual([context.fromPersonId,context.toPersonId,context.fromRole,context.toRole,context.directed],['person-0','person-1','委托方','受托方',true]);
 assert.deepEqual(world,before);
 world.people.find(person=>person.id==='person-1').name='';
 world.atmospheres[1].title='街坊熟人圈';
 assert.equal(tasteCircles(world)[1].title,'街坊熟人圈');
 assert.equal(boundAtmospheres(world.people,world)[1].title,'街坊熟人圈');
});

test('long role descriptions yield a familiar short fallback or an unclassified everyday label',()=>{
 const world=namedCircleWorld();
 const roles=[['常因发薪晚而拖延交租的年轻租客','每月收租与水电的包租公'],['故友独子，受关照的后辈','亡母闺蜜，常送汤的长辈'],['住在巷尾的一家旧识','偶尔到访帮忙的人']];
 for(const [index,[fromRole,toRole]] of roles.entries()){
  Object.assign(world.foundation.relations[index],{fromRole,toRole});
  world.atmospheres[index+1].title='林澈及'+world.people[index+1].displayName;
 }
 assert.deepEqual(tasteCircles(world).slice(1,4).map(card=>card.title),['租住往来','长幼往来','日常往来']);
});

test('the existing taste request saves a same-circle subject and preserves it on a normal update with no title',async()=>{
 const s=state(),circleRef='foundation:relation:rel';
 const wind={id:'wind',title:'q与r',circleRef,personIds:[qid,r],description:'一向合作照料街边店铺。',basisEventIds:[],basisMaterialRefs:[circleRef],sources:[source]};
 s.developmentAtmospheres=[wind];
 const calls=[];
 async function run(state,reply) {
  const model=requester({primary:{},secondary:{}},{async generate(_profile,messages){
   calls.push(messages[0].content);
   return JSON.stringify({atmosphereUpdates:[reply(JSON.parse(messages[1].content))]});
  }});
  const prepared={materials:[],currentClock:null,creativeFrame:{key:'steady',version:1,recipeId:'steady'},narrativeRoles:{storyControlled:[],autonomous:[],policy:''},restHint:{generate:true,reason:'unknown-time'}};
  return generate({people,state,story,initial:false,prepared,dependencies:{model}});
 }
 const renamed=await run(s,()=>({id:wind.id,circleRef,title:'街坊熟人圈'}));
 assert.equal(renamed.changedAtmospheres,1);
 assert.deepEqual(renamed.rejections,[]);
 assert.deepEqual(renamed.state.developmentAtmospheres,[{...wind,title:'街坊熟人圈'}]);
 assert.deepEqual(renamed.state.foundation,s.foundation);
 const refreshed=await run(renamed.state,wire=>{
  const circle=wire.background.circles.find(c=>c.id===circleRef);
  assert.equal(wire.background.atmospheres[0].title,'街坊熟人圈');
  return {id:wind.id,circleRef,personIds:circle.personIds,background:{description:'继续照料街边店铺，往来仍熟络。',basisMaterialRefs:[circleRef]}};
 });
 assert.deepEqual(refreshed.rejections,[]);
 assert.equal(refreshed.state.developmentAtmospheres[0].title,'街坊熟人圈');
 assert.equal(tasteCircles({...refreshed.state,people}).find(card=>card.id===circleRef).title,'街坊熟人圈');
 const bad=await run(refreshed.state,()=>({id:wind.id,circleRef:'foundation:group:g1',title:'误指别处'}));
 assert.equal(bad.changedAtmospheres,0);
 assert.equal(bad.state.developmentAtmospheres[0].circleRef,circleRef);
 assert.equal(calls.length,3);
});

test('a regular taste pass requests provisional names and adopts a naming-only response without rewriting saved winds',async()=>{
 const base=state(),group='foundation:group:g1',relation='foundation:relation:rel';
 base.foundation.groups[0].name='未命名圈';
 const wind={id:'wind',title:'租住往来',circleRef:relation,personIds:[qid,r],description:'一向合作照料街边店铺。',basisEventIds:[],basisMaterialRefs:[relation],sources:[source]};
 base.developmentAtmospheres=[wind];
 let calls=0;
 const model=requester({primary:{},secondary:{}},{async generate(_profile,messages){
  calls++;
  assert.deepEqual(JSON.parse(messages[1].content).circleNameRepairs.map(row=>row.circleRef),[group,relation]);
  return JSON.stringify({circleNameUpdates:[
   {circleRef:group,title:'未命名圈'},
   {circleRef:group,title:'东棚互助圈'},
   {circleRef:relation,title:'q和r'},
   {circleRef:relation,title:'街坊熟人圈'},
   {circleRef:'foundation:group:g2',title:'错改原名'},
  ]});
 }});
 const prepared={materials:[],currentClock:null,creativeFrame:{key:'steady',version:1,recipeId:'steady'},narrativeRoles:{storyControlled:[],autonomous:[],policy:''},restHint:{generate:true,reason:'unknown-time'}};
 const updated=await generate({people,state:base,story,initial:false,prepared,dependencies:{model}});
 assert.equal(calls,1);
 assert.equal(updated.changedAtmospheres,0);
 assert.deepEqual(updated.state.developmentAtmospheres,[wind]);
 const cards=tasteCircles({...updated.state,people,atmospheres:updated.state.developmentAtmospheres});
 assert.deepEqual(cards.map(row=>row.title),['东棚互助圈','夜班伙伴','街坊熟人圈']);
});

test('the first wind and a same-answer circle can receive their own name without copying old placeholder labels',async()=>{
 const base=state(),oldGroup='foundation:group:g1',newRelation='foundation:relation:rel';
 base.foundation.groups[0].name='租住往来';
 base.developmentAtmospheres=[{id:'old-wind',circleRef:oldGroup,title:'租住往来',personIds:[p,qid],
  description:'一直一起维护社区公用设备。',basisEventIds:[],basisMaterialRefs:[oldGroup],sources:[source]}];
 const prepared={materials:[],currentClock:null,creativeFrame:{key:'steady',version:1,recipeId:'steady'},narrativeRoles:{storyControlled:[],autonomous:[],policy:''},restHint:{generate:true,reason:'unknown-time'}};
 const model=requester({primary:{},secondary:{}},{async generate(_profile,messages){
  const wire=JSON.parse(messages[1].content),system=messages[0].content;
  assert.match(system,/只输出一个JSON：[^；]*circleNameUpdates/);
  assert.match(system,/新圈.*不能借用其他圈名的格式/);
  assert.ok(!messages[1].content.includes('租住往来'));
  assert.equal(wire.background.circles.find(row=>row.id===newRelation).name,undefined);
  return JSON.stringify({
   foundation:{groups:[{key:'market-roof',name:'日常往来',description:'共同维护东棚雨布。',members:[{personId:'P1'},{personId:'P2'}],sourceSeqs:[4]}]},
   circleNameUpdates:[
    {circleRef:'missing',title:'无归属的名称'},
    {circleRef:newRelation,title:'租住往来'},
    {circleRef:newRelation,title:'塘口看铺搭档'},
    {circleRef:'market-roof',title:'东棚守摊人'},
   ],
   atmosphereUpdates:[{key:'new-wind',circleRef:newRelation,personIds:['P2','P3'],
    title:'租住往来',background:{description:'两人近来轮流代看临水店铺。',basisMaterialRefs:[newRelation]}}],
  });
 }});
 const updated=await generate({people,state:base,story,initial:false,prepared,dependencies:{model}});
 assert.deepEqual(updated.rejections,[]);
 assert.deepEqual(updated.state.developmentAtmospheres[0],base.developmentAtmospheres[0]);
 const cards=tasteCircles({...updated.state,people,atmospheres:updated.state.developmentAtmospheres});
 assert.equal(cards.find(row=>row.id===oldGroup).title,'租住往来');
 assert.equal(cards.find(row=>row.id===newRelation).title,'塘口看铺搭档');
 assert.ok(cards.some(row=>row.title==='东棚守摊人'));
});
