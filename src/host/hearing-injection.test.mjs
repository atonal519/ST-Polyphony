import '../../scripts/source-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {hearingScenePrompt,installHearingInjection}=await import('./hearing-injection.ts');
const {createPluginSettings}=await import('./plugin-settings.ts');
const {generate_interceptor:hook}=JSON.parse(readFileSync(new URL('../../manifest.json',import.meta.url)));
function fixture(){
  const world={id:'s',lastHearingWindow:{id:'w'},simulationRanges:[{id:'w',throughSeq:3}],
    people:[{id:'a',name:'周青',aliases:['小青']},{id:'b',name:'陆平'}],activities:[],events:[]};
  const write=(id,description,extra={})=>{
    world.activities.push({id,status:'active',currentStateWindowId:'w'});
    world.events.push({activityId:id,description,publicCue:description,participantIds:['a'],simulationWindowId:'w',...extra});
  };
  write('one','修车摊挂出了蓝灯。');world.activities.at(-1).currentStateWindowId='earlier';
  write('closed','已经收摊。');world.activities.at(-1).status='completed';
  write('old','旧招牌还在。');world.events.push({activityId:'old',description:'换掉了。',participantIds:['a'],simulationWindowId:'w'});
  write('two','街口多了一面招牌。');
  write('corrected','错误的招牌。',{correction:{}});
  write('private','周青私下买了车锁。');
  return world;
}
test('only open, relevant, current public excerpts enter the short prompt',()=>{
  const world=fixture(),prompt=hearingScenePrompt(world,'小青在吗？',4);
  assert.deepEqual(prompt.split('\n').slice(1),['街口多了一面招牌。','修车摊挂出了蓝灯。']);
  assert.equal(hearingScenePrompt(world,'无关的人',4),'');
  assert.equal(hearingScenePrompt(world,'周青',2),'');
  assert.equal(hearingScenePrompt({...world,lastHearingWindow:undefined},'周青',4),'');
});
test('host injects into one system slot only, honors switches, scope and generation type, cleans up races',async()=>{
  const globals={},events=new Map(),calls=[],chat=Array.from({length:4},()=>({mes:'小青'}));
  let scope='s',world=fixture(),reads=0,resolve;
  const host={extensionSettings:{'st-dollars':{other:7}},saveSettingsDebounced(){},chat,
    eventTypes:{CHAT_CHANGED:'chat',GENERATION_ENDED:'end'},eventSource:{on:(k,f)=>events.set(k,f),off:k=>events.delete(k)},
    setExtensionPrompt:(...args)=>calls.push(args)};
  const settings=createPluginSettings(()=>host);
  const installed=installHearingInjection({scope:()=>scope,world:()=>world,enabled:()=>settings.hearingInjectionEnabled()&&settings.isEnabled(),async refresh(){reads++;await new Promise(done=>resolve=done);}},()=>host,globals);
  const run=(type='normal')=>globals[hook](chat,4096,()=>assert.fail('cannot abort'),type);
  await run();assert.equal(calls.length,0);
  settings.saveHearingInjection(true);assert.equal(host.extensionSettings['st-dollars'].other,7);
  await run('quiet');await run('impersonate');assert.equal(calls.length,0);
  await run();assert.match(calls[0][1],/蓝灯/);assert.deepEqual(calls[0].slice(2,6),[1,1,false,0]);assert.equal(reads,0);
  scope='other';assert.equal(calls[0][6](),false);
  events.get('chat')();assert.equal(calls.at(-1)[1],'');
  const waiting=run();events.get('end')();scope='s';resolve();await waiting;
  assert.equal(calls.length,2);assert.ok(chat.every(row=>row.mes==='小青'));
  await run();settings.saveHearingInjection(false);installed.clear();
  assert.equal(calls.at(-1)[1],'');installed.dispose();assert.equal(globals[hook],undefined);
});
