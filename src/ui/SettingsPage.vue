<script setup lang="ts">
import {onBeforeUnmount,ref,watch,nextTick} from 'vue';
import ModelSettings from './ModelSettings.vue';
import AppearanceSettings from './AppearanceSettings.vue';
import {createDialogManager,createMasterSwitch,createPromptsSettings,createSourcePermissionView} from './native-settings.js';
import type {ConfigService} from '../application/contracts';
import type {AppearancePreferences} from '../host/appearance-settings';
import type {AppearanceState} from './appearance';
import type {GeneralSettings} from '../host/general-settings';
import type {SmellGeneration} from '../application/smell-generation';
const props=defineProps<{active:boolean;enabled:boolean;everyReplies?:number;intervalError?:string;injectHearing?:boolean;injectionError?:string;busy:boolean;config:ConfigService;general:GeneralSettings;updates:any;renderMarkdown:(value:string)=>string;enabledStore:any;onEnabledChange:(enabled:boolean)=>void;preferences:AppearancePreferences;saveAppearance(patch:Partial<AppearancePreferences>):void;appearance:AppearanceState;smell?:SmellGeneration}>();
const emit=defineEmits<{interval:[value:number];injection:[value:boolean]}>();
const root=ref<HTMLElement>(),master=ref<HTMLElement>(),worldbooks=ref<HTMLElement>(),prompts=ref<HTMLElement>(),notice=ref<HTMLElement>();
const apiRefreshKey=ref(0),apiOpened=ref(false);let mounted=false,dialog:any,promptView:any,masterView:any;
function syncDialogAppearance() {
  const value = props.appearance;
  dialog?.setAppearance({ ...value, palette: value.glass.nativeDialog });
}
watch(() => props.appearance, syncDialogAppearance);
function refreshApiDrawer(event:Event){
 if(!(event.currentTarget as HTMLDetailsElement).open)return;
 if(apiOpened.value)apiRefreshKey.value++;
 else apiOpened.value=true;
}
watch(()=>props.active,async active=>{if(!active){dialog?.closeAll();return;}await nextTick();if(!props.active||mounted)return;mounted=true;
 dialog=createDialogManager({documentRef:document});root.value?.getRootNode().appendChild(dialog.host);
 syncDialogAppearance();
 masterView=createMasterSwitch({settings:props.enabledStore,onPluginEnabledChange:props.onEnabledChange,pluginUpdates:props.updates,dialog,renderUpdateMarkdown:props.renderMarkdown});master.value?.append(masterView.node);notice.value?.append(masterView.noticeRow);
 worldbooks.value?.append(createSourcePermissionView({permissions:props.general}).renderSettings());
 promptView=createPromptsSettings({settings:props.general,subscribeSettingsChange:props.general.subscribe,customImpl:(options:any)=>dialog.custom(options)});prompts.value?.append(promptView.node);
 void props.updates.ensureChecked();
},{immediate:true});
onBeforeUnmount(()=>{masterView?.dispose();promptView?.dispose();dialog?.closeAll();dialog?.host.remove();});
</script>
<template>
 <section ref="root" class="bmx-settings-page settings-page" aria-label="百面相设置">
  <div ref="master"></div>
  <details class="settings-group"><summary class="settings-group-summary"><h3>通用设置</h3></summary><div class="settings-group-body">
   <details class="settings-sub bmx-api-editor" @toggle="refreshApiDrawer"><summary class="settings-sub-summary"><h4>API 配置</h4></summary><ModelSettings v-if="apiOpened" :config="config" :refresh-key="apiRefreshKey" :active="active" /></details>
   <div ref="worldbooks"></div><div ref="prompts"></div>
   <details class="settings-sub"><summary class="settings-sub-summary"><h4>外观</h4></summary><div class="settings-sub-body"><AppearanceSettings :preferences="preferences" :save="saveAppearance" /></div></details>
  </div></details>
  <details class="settings-group"><summary class="settings-group-summary"><h3>内容设置</h3></summary><div class="settings-group-body bmx-content-settings">
   <label class="bmx-development-interval"><span>更新间隔</span><input class="settings-input settings-num" type="number" min="1" step="1" :value="everyReplies??1" aria-label="更新间隔" :aria-invalid="Boolean(intervalError)" @change="emit('interval',Number(($event.target as HTMLInputElement).value))" /></label>
   <p v-if="intervalError" class="settings-result error" role="alert">{{intervalError}}</p>
   <label class="setting-switch bmx-smell-switch"><span>将「听」的公开线索带入正文</span><input type="checkbox" :checked="injectHearing" @change="emit('injection',($event.target as HTMLInputElement).checked)" /></label>
   <p v-if="injectionError" class="settings-result error" role="alert">{{injectionError}}</p>
   <template v-if="smell">
    <label class="setting-switch bmx-smell-switch"><span>嗅自动新增（当前聊天）</span><input type="checkbox" :disabled="!smell.view.value.scopeId" :checked="smell.view.value.schedule.enabledAfter!==null" @change="smell.setAutomatic(($event.target as HTMLInputElement).checked)" /></label>
    <label class="bmx-development-interval"><span>嗅的间隔（正文回复数）</span><input class="settings-input settings-num" type="number" min="1" step="1" :disabled="!smell.view.value.scopeId" :value="smell.view.value.schedule.everyReplies" @change="smell.setInterval(Number(($event.target as HTMLInputElement).value))" /></label>
    <p v-if="smell.view.value.error" class="settings-result error" role="alert">{{ smell.view.value.error }}</p>
   </template>
  </div></details>
  <details class="settings-group" open><summary class="settings-group-summary"><h3>世界观</h3></summary><div class="settings-group-body bmx-world-settings"><slot name="world" /></div></details>
  <div ref="notice"></div>
 </section>
</template>
