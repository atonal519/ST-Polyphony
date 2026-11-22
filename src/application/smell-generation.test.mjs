import '../../scripts/source-loader.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
const {createSmellGeneration}=await import('./smell-generation.ts');
const {drawSmellDice}=await import('../simulation/smell.ts');
const {createPublicMessageRepository}=await import('../storage/public-message-repository.ts');
const {createBainiaoClient}=await import('../storage/bainiao-client.ts');

const story={status:'ready',message:'',throughSeq:12,turns:[{seq:12,isUser:false,text:'东棚旁的几家食铺开门，路面还带着雨水。'}],source:{kind:'chat',id:'test-story',label:'正文'}};
const note={medium:'纸媒',type:'便签',source:'东棚入口',title:'入口提醒',body:'门口湿滑，走木板。',mode:'created',visibility:'public',sourceSeq:12,assertedPersonIds:[],assertsUser:false};
const radio={...note,medium:'广播',type:'广播',source:'街口广播',title:'城东路况',body:'东棚附近石板还湿。带货的小车慢些过坡，下桥往右即可进棚。'};
const feature={...note,medium:'纸媒',type:'地方纪事',source:'东棚街刊',title:'一场雨后的集市',body:('雨后的摊主朝街口望去，等积水退到铺门外，再把抬起的木板一块一块搬回原位。'.repeat(6)+'\n\n').repeat(3).trim()};
const serial={...feature,type:'小报连载',title:'副刊故事·找路的伞',body:('一把青布伞总在天晴时出现在桥头。替人修伞的年轻学徒拾起它，沿着湿脚印走过了桥。'.repeat(5)+'\n\n').repeat(3).trim()};
const directory={status:'empty',message:'',scopeId:'test',people:[]};

test('smell dice draws compact independent options for every public folder',()=>{
  const first=drawSmellDice('test|manual|same-floor|one');
  const second=drawSmellDice('test|manual|same-floor|two');
  assert.deepEqual(Object.keys(first),['传闻','纸媒','广播','公告','专题','副刊']);
  assert.ok(Object.values(first).every(options=>options.length===3&&options.every(option=>typeof option==='string'&&option.length<=24)));
  assert.notDeepEqual(first,second);
  assert.doesNotMatch(JSON.stringify(first),/东棚|路况|石板|广播稿/);
});

function fixture(people=[],mediaRepo){
  const wire={calls:[],profiles:[],writes:[],lists:[],snapshotReads:0,scope:'test',frontier:12,schedule:{everyReplies:2,enabledAfter:null}};
  const repo=mediaRepo??{
    async list(scope){wire.lists.push(scope);return{refs:[],complete:true};},
    async write(scope,window,entries){wire.writes.push({scope,window,entries});return entries.map((entry,index)=>({medium:entry.medium,count:1,recordId:'record-'+index,throughSeq:window.throughSeq,batchKey:'batch',publishedAt:1}));},
  };
  const controller=createSmellGeneration({
    repo,getScope:()=>wire.scope,getSchedule:()=>wire.schedule,setSchedule:(_scope,next)=>wire.schedule=next,enabled:()=>true,
    frontier:()=>wire.frontier,repliesDue:(_scope,after,through,interval)=>(through-after)>=interval*2,
    readStory:(_scope,through)=>({...story,throughSeq:through,turns:story.turns.map(turn=>({...turn,seq:through}))}),
    directory:{readPeople(){wire.snapshotReads++;return {...directory,people,scopeId:wire.scope};}},
    materials:{readForQuestion(){throw Error('there are no people');}},
    config:{getProfile:async(role)=>{wire.profiles.push(role);return{url:'https://offline.invalid',model:'fixture',key:'none'};}},
    createModelRequester:()=>({request:async(request)=>{
      wire.calls.push(request);const sourceSeq=request.input.story.at(-1).seq;
      return wire.reply??{publicMessages:[{...note,sourceSeq},null,{...radio,sourceSeq}, {...radio,sourceSeq:999},{...note,sourceSeq,assertsUser:true}]};
    }}),
    world:()=>({id:null,people:[],activities:[],events:[],knowledge:[]}),
  });
  return{controller,wire};
}

test('empty media can generate with one primary request and keep both good rows',async()=>{
  const {controller,wire}=fixture();
  await controller.onRendered(12);
  assert.deepEqual(wire.calls,[]);
  assert.deepEqual(wire.lists,[]);
  await controller.refresh();
  assert.deepEqual(controller.view.value.refs,[]);
  await controller.generate();
  assert.deepEqual(wire.profiles,['primary']);
  assert.equal(wire.calls.length,1);
  assert.equal(wire.calls[0].task,'smell');
  assert.deepEqual(Object.keys(wire.calls[0].input.creativeOptions),['传闻','纸媒','广播','公告','专题','副刊']);
  assert.ok(Object.values(wire.calls[0].input.creativeOptions).every(options=>options.length===3));
  assert.equal(Object.hasOwn(wire.calls[0].input,'dicePool'),false);
  assert.equal(wire.writes[0].scope,'test');
  assert.deepEqual(wire.writes[0].entries.map(row=>row.title),[note.title,radio.title]);
  assert.deepEqual(wire.writes[0].entries.map(row=>row.medium),['公告','广播']);
  assert.equal(controller.view.value.refs.length,2);
});

test('repeated manual generation at the same floor receives a different smell draw',async()=>{
  const {controller,wire}=fixture();
  await controller.generate();
  const first=structuredClone(wire.calls[0].input.creativeOptions);
  await controller.generate();
  assert.equal(wire.calls.length,2);
  assert.notDeepEqual(wire.calls[1].input.creativeOptions,first);
});

test('one batch can publish a public feature and literary serial with their full long bodies',async()=>{
  const {controller,wire}=fixture();
  assert.ok([feature,serial].every(row=>row.body.length>=500&&row.body.length<=1000));
  wire.reply={publicMessages:[note,feature,{...feature,visibility:'private'},serial]};
  await controller.generate();
  assert.equal(wire.calls.length,1);
  assert.match(wire.calls[0].instructions,/500–1000 字/);
  assert.match(wire.calls[0].instructions,/公开刊出的虚构作品/);
  assert.deepEqual(wire.writes[0].entries.map(row=>[row.medium,row.body]),[['公告',note.body],['专题',feature.body],['副刊',serial.body]]);
});

test('keeps a complete public row when the model cuts off the next record',async()=>{
  const {controller,wire}=fixture();
  wire.reply='{"publicMessages":['+JSON.stringify(note)+',{"body":"未写完';
  await controller.generate();
  assert.equal(wire.calls.length,1);
  assert.deepEqual(wire.writes[0].entries.map(entry=>entry.title),[note.title]);
});

test('unescaped dialogue quotes in long prose preserve the original words and neighboring articles',async()=>{
  const {controller,wire}=fixture();
  const body='摊主写下"先借后还"。\n\n"拿吧，"路人指着门边说，"回头再带来。"';
  const malformed=JSON.stringify({...feature,body}).replaceAll('\\"','"');
  wire.reply='```json\n{"publicMessages":['+malformed+','+JSON.stringify({...serial,visibility:'private'})+','+JSON.stringify(radio)+']}\n```';
  await controller.generate();
  assert.equal(wire.calls.length,1);
  assert.equal(controller.view.value.error,'');
  assert.deepEqual(wire.writes[0].entries.map(entry=>entry.body),[body,radio.body]);
});

test('a malformed reply reports an unreadable smell result and never asks to reconstruct the world',async()=>{
  const {controller,wire}=fixture();
  wire.reply='```json\n稿件无法读取';
  await controller.generate();
  assert.match(controller.view.value.error,/模型已返回.*稿件.*格式/u);
  assert.doesNotMatch(controller.view.value.error,/世界构建/u);
  assert.equal(wire.writes.length,0);
});

test('received drafts filtered by protected character name and references get a specific error',async()=>{
  const {controller,wire}=fixture([{id:'main',displayName:'林夏',aliases:['小夏'],specialRole:'user'}]);
  wire.reply={publicMessages:[{...note,assertedPersonIds:['main']},{...radio,body:'小夏端走最后一块木板。'}]};
  await controller.generate();
  assert.match(controller.view.value.error,/返回了 2 篇.*受保护人物/u);
  assert.equal(wire.writes.length,0);
});

test('neighborhood rumors can name two offstage NPCs while keeping the player and private material outside the draft',async()=>{
  const people=[{id:'host',displayName:'周青',aliases:['青哥'],specialRole:'user'},
    {id:'seller',displayName:'林岚',aliases:[],description:'她私下掌握暗号'},
    {id:'maker',displayName:'陈川',aliases:[],description:'他怀疑掌柜'}];
  const {controller,wire}=fixture(people);
  const rumor={...note,medium:'传闻',type:'茶余饭后',source:'河边茶棚',
    title:'怎么多摆了一张椅子',body:'林岚给陈川留了张椅子，旁桌就猜两人准备搭伙。卖茶的笑说，那张椅子原先就缺一条腿。',assertedPersonIds:['seller','maker']};
  wire.reply={publicMessages:[rumor,{...rumor,body:'青哥当众说两个人要合伙了。'},
    {...rumor,body:'林岚私下告诉陈川实情。'},{...rumor,medium:'纸媒',type:'地方小报'}]};
  await controller.generate();
  const [request]=wire.calls;
  assert.equal(wire.calls.length,1);
  assert.deepEqual(request.input.rumorCandidates.map(row=>row.personId).sort(),['maker','seller']);
  assert.doesNotMatch(JSON.stringify(request.input),/暗号|怀疑掌柜/);
  assert.deepEqual(wire.writes[0].entries.map(e=>e.body),[rumor.body]);
});

test('automatic cadence starts at enabling and duplicate ready floors cause one dispatch',async()=>{
  const {controller,wire}=fixture();
  await controller.setAutomatic(true);
  assert.deepEqual(wire.schedule,{everyReplies:2,enabledAfter:12});
  wire.frontier=14;
  await controller.onRendered(14);
  assert.deepEqual(wire.calls,[]);
  wire.frontier=16;
  await Promise.all([controller.onRendered(16),controller.onRendered(16)]);
  assert.equal(wire.calls.length,1);
  await controller.onRendered(16);
  assert.equal(wire.calls.length,1);
  await controller.setAutomatic(false);
  wire.frontier=20;
  await controller.onRendered(20);
  assert.equal(wire.calls.length,1);
});

test('a partial media directory displays usable refs and retries the same chat after native read failures',async()=>{
  const partial=['smell~8~a~first~1~广播'],all=[...partial,'smell~10~b~second~1~专题'];
  const replies=[
    Response.json({error:'storage_error'},{status:503}),
    Response.json(partial,{status:206}),
    Response.json(all),
  ];
  const client=createBainiaoClient({fetchImpl:async url=>{
    assert.match(url,/record-ids\/st-dollars\/npc-media-test$/);
    return replies.shift();
  }});
  const {controller}=fixture([],createPublicMessageRepository(client));
  await controller.refresh();
  assert.match(controller.view.value.directoryError,/读取.*失败/u);
  await controller.refresh();
  assert.deepEqual(controller.view.value.refs.map(ref=>ref.recordId),partial);
  assert.match(controller.view.value.directoryError,/部分公开消息/u);
  await controller.refresh();
  assert.deepEqual(controller.view.value.refs.map(ref=>ref.recordId),all);
  assert.equal(controller.view.value.directoryError,'');
  assert.equal(replies.length,0);
});

test('media records list via IDs only, retain partial saves and stay scoped',async()=>{
  const data=new Map(),operations=[];
  const client={
    async listRecordIds(collection){operations.push('ids');return {ids:[...data.keys()].filter(key=>key.startsWith(collection+'/')).map(key=>key.slice(collection.length+1)),complete:true};},
    async writeBatch(collection,records){operations.push('write');return records.map(({recordId,data:value},index)=>{
      if(index===1) return {recordId,status:500};
      const envelope={revision:1,data:value};data.set(collection+'/'+recordId,envelope);
      return{recordId,status:200,envelope};
    });},
    async readBatch(collection,ids){operations.push('read');return ids.map(recordId=>({recordId,status:200,envelope:data.get(collection+'/'+recordId)}));}
  };
  const repo=createPublicMessageRepository(client);
  const refs=await repo.write('test',{id:'test-run',throughSeq:12},[{...feature,medium:'专题'},radio]);
  assert.equal(refs.length,1);
  assert.deepEqual(await repo.list('test'),{refs,complete:true});
  assert.deepEqual(await repo.list('different'),{refs:[],complete:true});
  assert.deepEqual(operations,['write','ids','ids']);
  assert.equal((await repo.read('test',refs))[0].entries[0].body,feature.body);
});
