import test from 'node:test';
import assert from 'node:assert/strict';
import {h,ref} from 'vue';
import {readFileSync} from 'node:fs';
import {compileStyle} from 'vue/compiler-sfc';
import {createMemoryHost,settle} from './testing/production-vue.mjs';
const {default:ModelSettings}=await import('./ModelSettings.vue');
const {createConfigService}=await import('../models/config.ts');
function service(presetName = '原预设'){
 let record={data:{marker:'keep',primaryPresetId:'p',secondaryFollowsPrimary:true},revision:1};
 let presets=[{id:'p',name:presetName,url:'https://p.invalid/v1',key:'key-1',model:'model-1',extra:'keep'},{id:'other',name:'另一预设',url:'https://other.invalid/v1',key:'other-key',model:'other-model'}];
 let writes=0,fail=false;
 const pool={async update(id,patch){if(fail)throw Error('模拟保存失败');presets=presets.map(p=>p.id===id?{...p,...patch}:p);writes++;},async create(p){if(fail)throw Error('模拟保存失败');presets.push(p);writes++;},async delete(id){presets=presets.filter(p=>p.id!==id);writes++;},async rename(){throw Error('unused');}};
 const client={async get(){return structuredClone(record);},async put(_c,_id,data,revision){record={data,revision:revision+1};writes++;}};
 const config=createConfigService(client,()=>presets,pool);
 return{config,client,get record(){return record;},get presets(){return presets;},get writes(){return writes;},set fail(value){fail=value;}};
}
async function mount({width=390,scale=.85,presetName,beforeMount}={}){
 const host=createMemoryHost(),state=service(presetName),active=ref(true),refreshKey=ref(0);
 beforeMount?.(state);
 host.viewport.innerWidth=width;
 host.viewport.visualViewport.width=width;
 host.root.host.style.setProperty('--qqj-ui-scale',String(scale));
 await host.mount({setup:()=>()=>h(ModelSettings,{config:state.config,active:active.value,refreshKey:refreshKey.value})});
 const query=label=>host.root.querySelector(`[aria-label="${label}"]`);
 const buttons=text=>host.root.querySelectorAll('button').filter(node=>node.textContent===text);
 const click=async text=>{const node=buttons(text)[0];assert.ok(node,'missing button '+text);node.fire('click');await settle();};
 const input=async(label,value)=>{const node=query(label);assert.ok(node,'missing input '+label);node.value=value;node.fire('input');await settle();};
 return{host,state,active,refreshKey,query,buttons,click,input};
}
test('real Vue cancel/Escape/backdrop discard drafts with zero writes, restore focus, and remove independent layer',async()=>{
 const f=await mount();try{
  const trigger=f.query('编辑主模型 API');trigger.fire('click');await settle();assert.equal(f.host.root.querySelectorAll('.bmx-api-dialog-layer').length,1);
  await f.input('API 地址','https://draft.invalid/v1');await f.click('取消');assert.equal(f.state.writes,0);assert.ok(f.query('API 地址')===null,'API editor must be closed');assert.equal(f.host.root.activeElement,trigger);assert.equal(f.host.root.querySelectorAll('.bmx-api-dialog-layer').length,0);
  trigger.fire('click');await settle();assert.equal(f.query('API 地址').value,'https://p.invalid/v1');f.query('API 地址').fire('keydown',{key:'Escape'});await settle();assert.ok(f.query('API 地址')===null,'API editor must be closed');assert.equal(f.state.writes,0);
  trigger.fire('click');await settle();const overlay=f.host.root.querySelector('.bmx-api-dialog-overlay');overlay.fire('pointerdown');overlay.fire('pointerup');overlay.fire('click');await settle();assert.ok(f.query('API 地址')===null,'API editor must be closed');assert.equal(f.state.writes,0);
 }finally{f.host.cleanup();}
});
test('long preset labels retain the edit and cancel path at 320/390 and 85/125 percent',async()=>{
 const presetName='百面相长配置名称示例'.repeat(5)+'veryLongModelConfiguration';
 for(const width of [320,390])for(const scale of [.85,1.25]){
  const f=await mount({width,scale,presetName});
  try{
   const trigger=f.query('主模型 API');
   assert.equal(trigger.querySelector('.bmx-inline-select-value').textContent,presetName);
   trigger.fire('keydown',{key:'Enter'});await settle();
   const option=f.host.root.querySelectorAll('[role=option]').find(node=>node.textContent===presetName);
   assert.ok(option);
   option.fire('keydown',{key:'Escape'});await settle();
   f.query('编辑主模型 API').fire('click');await settle();
   assert.equal(f.query('预设名称').value,presetName);
   await f.click('取消');
   assert.equal(f.query('API 地址'),null);
   assert.equal(f.state.writes,0);
  }finally{f.host.cleanup();}
 }
});

test('real Vue followed editor saves its captured preset with newest blank key and leaves routes unchanged',async()=>{
 const f=await mount();try{
  f.query('编辑副模型 API').fire('click');await settle();await f.input('模型名称','edited-model');
  f.state.presets[0].key='rotated-key';f.state.presets[0].url='https://changed-by-other.invalid/v1';
  await f.state.config.selectApi('primary',{mode:'preset',presetId:'other'});const before=structuredClone(f.state.record);
  await f.click('保存');assert.ok(f.query('API 地址')===null,'API editor must be closed');assert.deepEqual(f.state.record,before);
  assert.equal(f.state.presets[0].model,'edited-model');assert.equal(f.state.presets[0].key,'rotated-key');assert.equal(f.state.presets[0].url,'https://changed-by-other.invalid/v1');assert.equal(f.state.presets[0].extra,'keep');
 }finally{f.host.cleanup();}
});
test('real Vue save failure retains fields and allows same draft to save once',async()=>{
 const f=await mount();try{
  f.query('编辑主模型 API').fire('click');await settle();await f.input('模型名称','retained-draft');f.state.fail=true;await f.click('保存');
  assert.equal(f.query('模型名称').value,'retained-draft');assert.match(f.host.root.textContent,/模拟保存失败/);assert.equal(f.state.writes,0);assert.equal(f.state.presets[0].model,'model-1');
  f.state.fail=false;await f.click('保存');assert.equal(f.query('模型名称'),null);assert.equal(f.state.presets[0].model,'retained-draft');assert.equal(f.state.writes,1);
 }finally{f.host.cleanup();}
});
test('real Vue new and copy save create connections without selecting a use; delete retains inputs',async()=>{
 const f=await mount();try{
  const before=structuredClone(f.state.record);await f.click('新增 API');await f.input('预设名称','新连接');await f.input('API 地址','https://new.invalid/v1');await f.input('API Key（留空保留已保存 Key）','new-key');await f.input('模型名称','new-model');await f.click('保存');assert.deepEqual(f.state.record,before);assert.equal(f.state.presets.length,3);
  f.query('编辑主模型 API').fire('click');await settle();await f.click('另存为');await f.input('副本名称','副本');await f.click('保存副本');assert.deepEqual(f.state.record,before);assert.equal(f.state.presets.length,4);assert.equal(f.state.presets[3].key,'key-1');
  await f.click('删除');await f.click('确认删除');assert.equal(f.state.presets.some(p=>p.id==='p'),false);assert.equal(f.query('模型名称').value,'model-1');assert.match(f.host.root.textContent,/原输入仍保留/);
 }finally{f.host.cleanup();}
});
test('a pending API settings read leaves the shared connection editor usable',async()=>{
 const gate=Promise.withResolvers();
 const f=await mount({beforeMount(state){
  const get=state.client.get;
  state.client.get=async()=>{await gate.promise;return get();};
 }});
 try{
  assert.equal(f.query('编辑主模型 API').props.disabled,true);
  assert.notEqual(f.buttons('新增 API')[0].props.disabled,true);
  await f.click('新增 API');
  await f.input('预设名称','等待时新增');
  await f.input('API 地址','https://new.invalid/v1');
  await f.input('API Key（留空保留已保存 Key）','new-key');
  await f.input('模型名称','new-model');
  await f.click('保存');
  assert.equal(f.query('模型名称'),null);
  assert.equal(f.state.presets.at(-1).name,'等待时新增');
  gate.resolve();await settle();
  assert.equal(f.query('编辑主模型 API').props.disabled,false);
  assert.equal(f.state.record.data.primaryPresetId,'p');
 }finally{gate.resolve();f.host.cleanup();}
});
test('real model-list draft tool uses captured latest key; search Enter/IME never saves or invokes another tool',async()=>{
 const f=await mount(),previous=globalThis.fetch;let calls=0;
 globalThis.fetch=async(_url,options)=>{calls++;const body=JSON.parse(options.body);assert.equal(body.reverse_proxy,'https://draft.invalid/v1');assert.equal(body.proxy_password,'rotated-key');return new Response(JSON.stringify({data:[{id:'model-z'},{id:'model-a'}]}),{status:200});};
 try{
  f.query('编辑副模型 API').fire('click');await settle();f.state.presets[0].key='rotated-key';await f.input('API 地址','https://draft.invalid/v1');await f.click('拉取模型');assert.equal(calls,1);
  await f.input('搜索模型','model-a');assert.equal(f.host.root.querySelectorAll('.bmx-model-list-item').length,1);
  const search=f.query('搜索模型');const key=search.fire('keydown',{key:'Enter'});assert.equal(key.defaultPrevented,true);assert.equal(f.state.writes,0);assert.ok(f.query('模型名称'));
  search.fire('keydown',{key:'Enter',isComposing:true,keyCode:229});await settle();assert.equal(f.state.writes,0);assert.equal(calls,1);
  await f.click('model-a');assert.equal(f.query('模型名称').value,'model-a');await f.click('取消');assert.equal(f.state.writes,0);
 }finally{globalThis.fetch=previous;f.host.cleanup();}
});
test('late getConfig cannot reopen editor after leaving; closing/reopening the panel discards a visible draft',async()=>{
 const f=await mount();try{
  const get=f.state.config.getConfig;let release;f.state.config.getConfig=()=>new Promise(resolve=>{release=()=>get().then(resolve);});
  f.query('编辑主模型 API').fire('click');await settle();assert.equal(typeof release,'function');f.active.value=false;await settle();f.active.value=true;await settle();await release();await settle();assert.ok(f.query('API 地址')===null,'API editor must be closed');assert.equal(f.host.root.querySelectorAll('.bmx-api-dialog-layer').length,0);
  f.state.config.getConfig=get;f.active.value=true;await settle();f.query('编辑主模型 API').fire('click');await settle();await f.input('模型名称','will-discard');f.active.value=false;await settle();assert.equal(f.query('模型名称'),null);f.active.value=true;await settle();f.query('编辑主模型 API').fire('click');await settle();assert.equal(f.query('模型名称').value,'model-1');assert.equal(f.state.writes,0);
 }finally{f.host.cleanup();}
});

test('real dialog Tab reaches the model summary forward and backward, including collapsed lists',async()=>{
 const f=await mount(),previous=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({data:[{id:'one'}]}),{status:200});
 try{
  f.query('编辑主模型 API').fire('click');await settle();await f.click('拉取模型');
  const search=f.query('搜索模型'),summary=f.host.root.querySelector('.bmx-model-list-summary'),fetch=f.buttons('拉取模型')[0];
  search.focus();search.fire('keydown',{key:'Tab',shiftKey:true});assert.ok(f.host.root.activeElement===summary,'unexpected Tab focus');
  summary.fire('keydown',{key:'Tab',shiftKey:true});assert.ok(f.host.root.activeElement===fetch,'unexpected Tab focus');
  fetch.fire('keydown',{key:'Tab'});assert.ok(f.host.root.activeElement===summary,'unexpected Tab focus');
  summary.fire('keydown',{key:'Tab'});assert.ok(f.host.root.activeElement===search,'unexpected Tab focus');
  summary.fire('click');assert.equal(summary.parent.props.open,false);summary.focus();summary.fire('keydown',{key:'Tab'});assert.ok(f.host.root.activeElement===f.buttons('测试')[0],'collapsed model list must skip its hidden inputs');
  summary.focus();summary.fire('keydown',{key:'Enter'});assert.equal(summary.parent.props.open,true);summary.fire('keydown',{key:'Tab'});assert.ok(f.host.root.activeElement===search,'unexpected Tab focus');
 }finally{globalThis.fetch=previous;f.host.cleanup();}
});
test('editor compact layout follows QQJ short-height breakpoint at 540px',()=>{
 const source=readFileSync(new URL('./api-settings.css',import.meta.url),'utf8');
 const result=compileStyle({source,filename:'api-settings.css',id:'test'});assert.deepEqual(result.errors,[]);
 const applied=(selector,width,height)=>{const styles={};result.rawResult.root.walkRules(rule=>{if(!rule.selector.split(',').includes(selector))return;let parent=rule.parent;while(parent){if(parent.type==='atrule'&&parent.name==='media'){const condition=parent.params;const heightLimit=/max-height:\s*(\d+)px/.exec(condition),widthLimit=/max-width:\s*(\d+)px/.exec(condition);if(heightLimit&&height>Number(heightLimit[1])||widthLimit&&width>Number(widthLimit[1])||condition.includes('prefers-reduced-motion'))return;}parent=parent.parent;}rule.walkDecls(decl=>styles[decl.prop]=decl.value);});return styles;};
 const tall=applied('.bmx-api-config-dialog',390,844);assert.equal(tall['max-height'],'min(80dvh,100%)');assert.equal(tall.padding,undefined);
 const short=applied('.bmx-api-config-dialog',641,480);assert.equal(short['max-height'],'100%');assert.equal(short.padding,'12px 14px');assert.equal(short.gap,'8px');
 assert.equal(applied('.bmx-api-dialog-overlay.is-editor',641,480).padding,'10px');assert.equal(applied('.bmx-api-dialog-overlay.is-editor',390,844).padding,undefined);
});
