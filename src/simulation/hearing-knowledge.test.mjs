import '../../scripts/source-loader.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
const {generateDevelopment}=await import('./development.ts');
const {createEmptyState}=await import('../domain/world-state.ts');
const {createModelRequester}=await import('../models/client.ts');

test('one hearing call separates private motives, witnessed exchanges and reports across three people',async()=>{
  const people=['林青','陈伯','周宁'].map((name,i)=>({id:'formal-'+i,displayName:name,aliases:[],description:'',source:{kind:'plugin',id:'test'}}));
  const [a,b,c]=people.map(p=>p.id);
  const state={...createEmptyState('demo'),automaticDevelopmentEnabled:true,processedThroughSeq:1,
    activities:[{id:'work',participantIds:[a,b,c],description:'三人各自备货。',sources:[],status:'active'}],
    events:[{id:'secret',participantIds:[a],continuingForPersonIds:[c],activityId:'work',description:'林青独自换了账柜的锁。',sources:[],storyTime:null}]};
  const at=(key,participantIds,description,usesKnowledge=[],extra={})=>({stageKey:'s',assertsUser:false,assertedPersonIds:participantIds,key,participantIds,description,usesKnowledge,...extra});
  const claim=(who,as='direct',eventId='secret')=>({personId:who,eventId,as});
  const exchange='林青当面告诉陈伯，明早请晚点来。';
  const publicProgress='周宁把新菜单贴在临街橱窗。原来的价目写在柜子后面，排在门外的人看不清，每到午市都得挤进去问。他今天试着把菜名和价钱分开两列，留了一行空白给每天临时送来的菜，又把纸向下挪了一掌。下午打烊前，已经有人隔着玻璃指给同伴看，约好明天回来尝那碗面。';
  assert.ok(publicProgress.length>100);
  const receipt={personId:'P2',eventId:'secret',fromPersonId:'P1',viaEventId:'meet',reason:'明早请晚点来',assertsUser:false,stageKey:'s',assertedPersonIds:['P1','P2']};
  let calls=0;
  const model=createModelRequester({primary:{},secondary:{}},{async generate(_p,messages){
    calls++;
    const req=JSON.parse(messages[1].content);
    assert.deepEqual(req.viewpoints,[{personId:'P1',direct:['secret'],report:[]}]);
    assert.match(messages[0].content,/viaEventId/);
    assert.match(messages[0].content,/每条线本次更新的进展尽量写在100字以内/);
    return JSON.stringify({stages:[{key:'s',sourceSeqs:[2],onstagePersonIds:[],offstagePersonIds:[]}],
      activities:[at('unearned-plan',['P3'],'周宁按锁的消息提前动身。',[claim('P3')])],
      events:[
        at('premature',['P2'],'先听到了消息。',[claim('P2','report')]),
        at('meet',['P1','P2'],exchange,[claim('P1')],{publicCue:exchange}),
        at('reaction',['P2'],'陈伯决定明早晚些出门。',[claim('P2','report')]),
        at('invented',['P2'],'陈伯按锁芯型号买了新钥匙。',[claim('P2')]),
        at('uncited',['P3'],'周宁赶去取钥匙。',[],{eventLinks:[{eventId:'secret',kind:'caused-by'}]}),
        at('outsider',['P3'],'周宁也知道换了锁。',[claim('P3','report')]),
        at('own',['P3'],publicProgress,[],{activityId:'work',publicCue:'新菜单贴在临街橱窗。'}),
        at('bad-cue',['P1'],'林青私下翻看小册子。',[],{publicCue:'翻看小册子。'})],
      knowledge:[receipt,{...receipt,personId:'P3'}, {...receipt,eventId:'no-such-fact'},
        {personId:'P3',eventId:'secret',reason:'同圈所以听说了',stageKey:'s',assertedPersonIds:['P3'],assertsUser:false}]});
  }});
  const result=await generateDevelopment({people,state,initial:false,
    story:{throughSeq:2,turns:[{seq:2,isUser:false,text:'午后市集照常。'}],source:{kind:'chat',id:'demo'}},
    dependencies:{model,materials:{readForQuestion:async()=>({status:'empty',routerText:'',materials:[],coverage:{partial:false}})}}});
  assert.equal(calls,1);
  assert.equal(result.state.activities.length,1);
  assert.deepEqual(result.state.events.slice(1).map(e=>e.description),[exchange,'陈伯决定明早晚些出门。',publicProgress,'林青私下翻看小册子。']);
  const [record]=result.state.knowledge;
  assert.equal(result.addedKnowledge,1);
  assert.equal(result.state.events[1].visibility,'private');
  assert.deepEqual([record.personId,record.fromPersonId,record.viaEventId,record.reason],[b,a,result.state.events[1].id,'明早请晚点来']);
  assert.deepEqual(result.state.events.flatMap(e=>e.publicCue?[e.publicCue]:[]),['新菜单贴在临街橱窗。']);
});
