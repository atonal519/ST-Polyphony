<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch, ref } from 'vue';
import { createPeopleWorld } from '@/application/people-world';
import type {TasteCircleEdit} from '@/domain/social-circles';
import type { ControllerDependencies, ControllerState, QuestionMaterialReader } from '@/application/contracts';
import PanelShell from '@/ui/PanelShell.vue';
import SettingsPage from '@/ui/SettingsPage.vue';
import FourSenses from '@/ui/FourSenses.vue';
import DevelopmentControls from '@/ui/DevelopmentControls.vue';
import { subscribeStoryCompletion } from '@/host/story-completion';
import {completedStorySeq,hasCompletedStoryReplies} from '@/host/story-history';
import {currentQQJScope} from '@/sources/qqj-readiness';
import {createSmellGeneration} from '@/application/smell-generation';
import type {createPluginSettings} from '@/host/plugin-settings';
import type { DevelopmentView } from '@/application/development';
import { watchDevelopmentFailure } from '@/ui/development-notice';
import type { AppearancePreferences } from '@/host/appearance-settings';
import type { AppearanceState } from '@/ui/appearance';
import type {GeneralSettings} from '@/host/general-settings';

const props = defineProps<{ general:GeneralSettings; updates:any; renderMarkdown:(value:string)=>string; dependencies: ControllerDependencies; materialReader: QuestionMaterialReader; config: ControllerDependencies['config']; enabledSettings: ReturnType<typeof createPluginSettings>; visible: boolean; appearance: AppearanceState; preferences: AppearancePreferences; saveAppearance(patch: Partial<AppearancePreferences>): void; destroyAppearance(): void; syncFab(): void }>();
const emit = defineEmits<{ close: [restoreFocus?: boolean] }>();
const controller = createPeopleWorld(props.dependencies);
controller.configureDevelopment(props.enabledSettings);
watchDevelopmentFailure(controller.developmentView);
const history=props.dependencies.history;
const smell=props.dependencies.publicMessages&&history?createSmellGeneration({
  repo:props.dependencies.publicMessages,getScope:currentQQJScope,
  getSchedule:props.enabledSettings.getSmellSchedule,setSchedule:props.enabledSettings.saveSmellSchedule,enabled:props.enabledSettings.isEnabled,
  frontier:completedStorySeq,repliesDue:hasCompletedStoryReplies,
  readStory:(scope,through)=>history.readStoryHistory({scopeId:scope,fromSeq:Math.max(1,through-8),readyThroughSeq:through,stableOnly:true}),
  directory:props.dependencies.directory,materials:props.materialReader,config:props.config,createModelRequester:props.dependencies.createModelRequester,
  diagnostics:props.dependencies.diagnostics,world:()=>controller.state.value.world as ControllerState['world'],
}):undefined;
let unsubscribe = () => {};
onMounted(() => {
  const subscription=subscribeStoryCompletion((id,type,source) => {
    const seq=typeof id==='number'?id+1:null;
    const kind=typeof type==='string'?type:undefined;
    void controller.onStoryCompleted({source,eventSeq:seq,eventType:kind??''});
    if(source==='rendered'&&seq!==null)void smell?.onRendered(seq,kind);
    if(source==='qqj-ready'&&props.visible&&smell&&['smell','settings'].includes(page.value)&&smell.view.value.scopeId!==currentQQJScope()){
      if(page.value==='smell')void smell.refresh();
      else smell.syncScope();
    }
  },undefined,props.dependencies.readiness);
  unsubscribe=subscription;
});
const everyReplies = ref(props.enabledSettings.getEveryReplies());
const intervalError = ref('');
function setEveryReplies(value: number) { try { props.enabledSettings.saveEveryReplies(value); everyReplies.value = value; intervalError.value = ''; controller.inspectDevelopment(); } catch (error) { intervalError.value = error instanceof Error ? error.message : '请输入正整数回复数。'; } }
const page=ref('sight');
const smellOpen=ref(false);
const senses=ref<InstanceType<typeof FourSenses>>();
const settings=computed(()=>page.value==='settings');
const enabled = ref(props.enabledSettings.isEnabled());
const operationBusy = computed(() => controller.state.value.busy);
const enabledStore={isEnabled:()=>props.enabledSettings.isEnabled(),get:()=>({pluginEnabled:props.enabledSettings.isEnabled()}),update:(patch:{pluginEnabled:boolean})=>props.enabledSettings.saveEnabled(patch.pluginEnabled)};
function onEnabledChange(next:boolean){enabled.value=next;if(!next){controller.stopDevelopment();smell?.stop();}props.syncFab();}

watch(() => props.visible, visible => { if (visible) void controller.refresh().then(controller.inspectDevelopment); }, { immediate: true });
watch([()=>props.visible,page,()=>controller.state.value.world.id],([visible,tab])=>{
  if(!visible)return;
  if(tab==='smell')void smell?.refresh();
  else if(tab==='settings')smell?.syncScope();
});
onBeforeUnmount(() => { unsubscribe(); controller.stopDevelopment(); smell?.stop(); props.destroyAppearance(); });

const appearanceError = ref('');
function saveHeaderAppearance(patch: Partial<AppearancePreferences>) {
  try { props.saveAppearance(patch); appearanceError.value = ''; }
  catch (error) { appearanceError.value = error instanceof Error ? error.message : '保存外观设置失败。'; }
}
function cycleTheme() {
  const mode = props.preferences.appearanceTheme;
  saveHeaderAppearance({ appearanceTheme: mode === 'auto' ? 'day' : mode === 'day' ? 'night' : 'auto' });
}
function toggleFab() { saveHeaderAppearance({ fabShow: !props.preferences.fabShow }); }

async function editCircle(edit:TasteCircleEdit) {
  if(currentQQJScope()!==edit.scopeId)throw Error('聊天已切换，请回到对应聊天编辑。');
  await controller.editTasteCircle(edit);
}
function handleEscape() { if(smellOpen.value)void senses.value?.closeSmell();else emit('close'); }
</script>

<template>
  <PanelShell :visible="props.visible" :page="page" :theme-mode="preferences.appearanceTheme" :fab-shown="preferences.fabShow" :texture-colors="appearance.glass.textureColors" :smell-open="smellOpen" @theme="cycleTheme" @fab="toggleFab" @close="emit('close',$event)" @navigate="page=$event" @escape="handleEscape">
    <template #default="{stage,panel}">
    <p v-if="appearanceError" class="bmx-theme-error" role="alert">{{ appearanceError }}</p>
    <div class="bmx-world-content" :class="{'is-sight':page==='sight'}" v-show="!settings">
      <div v-if="controller.state.value.error || ['error','unavailable'].includes(controller.state.value.source.status)" class="bmx-reload"><button type="button" @click="controller.refresh().then(controller.inspectDevelopment)">重新读取</button></div>
      <FourSenses ref="senses" :state="controller.state.value as ControllerState" :page="page" :visible="props.visible" :stage="stage" :panel="panel" :public-messages="props.dependencies.publicMessages" :smell="smell" :enabled="enabled" :edit-circle="editCircle" :development="controller.developmentView.value as DevelopmentView" @navigate="page=$event" @smell-open="smellOpen=$event"/>

    </div>
    <SettingsPage v-show="settings" :active="settings && props.visible" :enabled="enabled" :every-replies="everyReplies" :interval-error="intervalError" :smell="smell" @interval="setEveryReplies" :busy="operationBusy" :config="props.config" :general="props.general" :updates="props.updates" :render-markdown="props.renderMarkdown" :enabled-store="enabledStore" :on-enabled-change="onEnabledChange" :preferences="preferences" :save-appearance="saveAppearance" :appearance="appearance">
      <template #world><DevelopmentControls :state="controller.state.value as ControllerState" :development="controller.developmentView.value as DevelopmentView" :enabled="enabled" @construct="controller.constructWorld" @start="controller.startDevelopment" @stop="controller.stopDevelopment" @save="controller.saveDevelopment" @reload="controller.reloadDevelopment" /></template>
    </SettingsPage>
    </template>
  </PanelShell>
</template>
