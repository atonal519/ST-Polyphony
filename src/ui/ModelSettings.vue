<script setup lang="ts">
import { nextTick, onMounted, reactive, ref, watch } from 'vue';
import type { ApiEditorTarget, ConfigService, ConfigSnapshot, PublicModelProfile, SharedModelPresetSummary } from '../application/contracts';
import InlineSelect from './InlineSelect.vue';
import ApiEditorDialog from './ApiEditorDialog.vue';
const props = defineProps<{ config: ConfigService; refreshKey: number; active?: boolean }>();
type Role = 'primary' | 'secondary';
const busy = ref(false), loading = ref(false), message = ref('');
const presets = ref<SharedModelPresetSummary[]>([]), selection = reactive({ primary: 'own', secondary: 'follow' });
const editor = ref<{ role: Role | null; target?: ApiEditorTarget; initial: PublicModelProfile & { name: string }; hint: string } | null>(null);
let trigger: HTMLElement | null = null;
let pendingEditor: object | null = null;
let pendingConfig: Promise<ConfigSnapshot> | undefined;
const isActive = () => props.active !== false;
function refresh() {
  return pendingConfig ??= props.config.getConfig().then(value => {
    presets.value = value.presets;
    selection.primary = value.primaryPresetId ? `preset:${value.primaryPresetId}` : 'own';
    selection.secondary = value.secondaryFollowsPrimary ? 'follow' : value.secondaryPresetId ? `preset:${value.secondaryPresetId}` : 'own';
    return value;
  }).finally(() => { pendingConfig = undefined; });
}
async function load() {
  if (loading.value) return;
  loading.value = true;
  try { await refresh(); message.value = ''; }
  catch (error) { message.value = error instanceof Error ? error.message : '读取 API 设置失败。'; }
  finally { loading.value = false; }
}
async function changeSelection(role: Role, value: string) {
  if (busy.value || loading.value) return;
  busy.value = true;
  try { await props.config.selectApi(role, { mode: value === 'follow' ? 'follow' : value.startsWith('preset:') ? 'preset' : 'own', ...(value.startsWith('preset:') ? { presetId: value.slice(7) } : {}) }); await refresh(); message.value = 'API 选择已保存并立即生效。'; }
  catch (error) { message.value = error instanceof Error ? error.message : '保存 API 选择失败。'; }
  finally { busy.value = false; }
}
async function edit(role: Role | null, event: MouseEvent) {
  if (!isActive() || busy.value || (role && loading.value)) return;
  trigger = event.currentTarget as HTMLElement; message.value = '';
  if (!role) { editor.value = { role: null, initial: { name: '', url: '', model: '', hasKey: false }, hint: '创建共享连接后，各用途可自行选择；新增不会切换当前配置。' }; return; }
  const opening = {}; pendingEditor = opening;
  busy.value = true;
  try {
    const value = await refresh();
    if (!isActive() || pendingEditor !== opening) return;
    const targetRole = role === 'secondary' && value.secondaryFollowsPrimary ? 'primary' : role;
    const id = targetRole === 'primary' ? value.primaryPresetId : value.secondaryPresetId, preset = id ? value.presets.find(item => item.id === id) : null;
    if (id && !preset) throw new Error('这条共享预设已不存在，请重新选择。');
    editor.value = { role, target: { role: targetRole, ...(id ? { presetId: id } : {}) }, initial: { ...(preset ?? value[targetRole]), name: preset?.name ?? (targetRole === 'primary' ? '主配置' : '独立配置') }, hint: `${role === 'secondary' && targetRole === 'primary' ? '副模型跟随主模型，当前编辑其实际使用的配置。' : ''}${preset ? '名称和连接参数共享，保存会影响使用此预设的插件。' : '保存仅更新百面相的独立连接。'}` };
  } catch (error) { message.value = error instanceof Error ? error.message : '读取 API 设置失败。'; }
  finally { if (pendingEditor === opening) pendingEditor = null; busy.value = false; }
}
function close() { editor.value = null; void nextTick(() => trigger?.focus({ preventScroll: true })); }
async function saved(shouldClose: boolean) { if (shouldClose) close(); try { await refresh(); } catch (error) { message.value = error instanceof Error ? error.message : '读取共享预设失败。'; } }
watch(() => props.active, active => { if (active === false) { pendingEditor = null; editor.value = null; } });
onMounted(load); watch(() => props.refreshKey, () => { void load(); });
</script>
<template>
  <section class="model-settings bmx-api-body">
    <div class="bmx-api-purpose"><span>主模型 API</span><div class="bmx-api-purpose-row"><InlineSelect :model-value="selection.primary" :options="[{ value: 'own', label: '主配置' }, ...presets.map(preset => ({ value: `preset:${preset.id}`, label: preset.name }))]" ariaLabel="主模型 API" :disabled="busy || loading" @update:model-value="changeSelection('primary', $event)" /><button type="button" class="bmx-api-secondary" aria-label="编辑主模型 API" :disabled="busy || loading" @click="edit('primary', $event)">编辑</button></div></div>
    <div class="bmx-api-purpose"><span>副模型 API</span><div class="bmx-api-purpose-row"><InlineSelect :model-value="selection.secondary" :options="[{ value: 'follow', label: '跟随主模型' }, { value: 'own', label: '独立配置' }, ...presets.map(preset => ({ value: `preset:${preset.id}`, label: preset.name }))]" ariaLabel="副模型 API" :disabled="busy || loading" @update:model-value="changeSelection('secondary', $event)" /><button type="button" class="bmx-api-secondary" aria-label="编辑副模型 API" :disabled="busy || loading" @click="edit('secondary', $event)">编辑</button></div></div>
    <div class="bmx-api-actions"><button type="button" class="bmx-api-secondary" :disabled="busy" @click="edit(null, $event)">新增 API</button></div>
    <p class="bmx-api-hint">新增连接后，可在各用途中选择。</p>
    <p class="bmx-api-result" role="status">{{ loading ? '正在读取 API 设置…' : message }}</p>
    <ApiEditorDialog v-if="editor" v-bind="editor" :config="config" @cancel="close" @saved="saved" />
  </section>
</template>
