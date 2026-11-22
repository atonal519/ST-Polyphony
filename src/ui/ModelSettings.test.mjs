import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import vue from '@vitejs/plugin-vue';
import {createSSRApp} from 'vue';
import {renderToString} from 'vue/server-renderer';
let server,ModelSettings,ApiEditorDialog;
test.before(async()=>{server=await createServer({configFile:false,plugins:[vue()],server:{middlewareMode:true,hmr:false},appType:'custom'});({default:ModelSettings}=await server.ssrLoadModule('/src/ui/ModelSettings.vue'));({default:ApiEditorDialog}=await server.ssrLoadModule('/src/ui/ApiEditorDialog.vue'));});
test.after(async()=>{await server?.close();});
test('API overview keeps both usage selections and edit actions, with one global add and no live connection fields',async()=>{
 const html=await renderToString(createSSRApp(ModelSettings,{refreshKey:0,config:{}}));
 assert.match(html,/aria-label="主模型 API"/);assert.match(html,/aria-label="副模型 API"/);assert.match(html,/aria-label="编辑主模型 API"/);assert.match(html,/aria-label="编辑副模型 API"/);assert.equal((html.match(/新增 API/g)||[]).length,1);assert.doesNotMatch(html,/<input|另存为|重命名|测试/);
});
test('new API editor renders blank connection fields and six collapsed advanced parameters without starting requests',async()=>{
 const html=await renderToString(createSSRApp(ApiEditorDialog,{config:{},role:null,initial:{name:'',url:'',model:'',hasKey:false},hint:'新增不会切换用途'}));
 for(const label of ['预设名称','API 地址','API Key（留空保留已保存 Key）','模型名称'])assert.ok(html.includes(`aria-label="${label}"`));
 for(const field of ['排除参数','附加参数（JSON）','超时秒数','失败重试次数','百面相温度','流式请求'])assert.ok(html.includes('aria-label="'+field+'"'));assert.match(html,/<details class="[^"]*bmx-api-advanced[^"]*">/);assert.match(html,/拉取模型/);assert.match(html,/测试/);assert.doesNotMatch(html,/另存为|确认删除/);assert.match(html,/新增不会切换用途/);
});
