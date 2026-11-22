<script setup lang="ts">
import { computed, reactive, ref, onBeforeUnmount } from 'vue';
import type { ApiAdvanced, ApiEditorTarget, ConfigService, PublicModelProfile } from '../application/contracts';
import { defaultTimeoutSec, validateAdvanced } from '../models/advanced';
import ApiPresetDialog from './ApiPresetDialog.vue';
import { createModelSettingsTools } from '../models/settings-tools';
const props = defineProps<{ config: ConfigService; role: 'primary' | 'secondary' | null; target?: ApiEditorTarget; initial: PublicModelProfile & { name: string }; hint: string }>();
const emit = defineEmits<{ cancel: []; saved: [close: boolean] }>();
const draft = reactive({ name: props.initial.name, url: props.initial.url, model: props.initial.model, key: '' });
const savedAdvanced = props.initial.advanced ?? {};
const initialAdvanced = {
  excludeParams: savedAdvanced.excludeParams?.join('\n') ?? '', additionalParams: savedAdvanced.additionalParams ?? '',
  timeoutSec: String(savedAdvanced.timeoutSec ?? defaultTimeoutSec), retryCount: String(savedAdvanced.retryCount ?? 0),
  temperature: savedAdvanced.temperature == null ? '' : String(savedAdvanced.temperature), stream: savedAdvanced.stream === true,
};
const advanced = reactive({ ...initialAdvanced });
function advancedChanges(): {advanced?: ApiAdvanced} {
  const patch: ApiAdvanced = {};
  if (advanced.excludeParams !== initialAdvanced.excludeParams) patch.excludeParams = [...new Set(advanced.excludeParams.split(/[\n,，]/).map(item => item.trim()).filter(Boolean))];
  if (advanced.additionalParams !== initialAdvanced.additionalParams) patch.additionalParams = advanced.additionalParams.trim();
  if (String(advanced.timeoutSec) !== initialAdvanced.timeoutSec) patch.timeoutSec = Number(advanced.timeoutSec);
  if (String(advanced.retryCount) !== initialAdvanced.retryCount) patch.retryCount = String(advanced.retryCount).trim() ? Number(advanced.retryCount) : NaN;
  if (String(advanced.temperature) !== initialAdvanced.temperature) patch.temperature = String(advanced.temperature).trim() ? Number(advanced.temperature) : null;
  if (advanced.stream !== initialAdvanced.stream) patch.stream = advanced.stream;
  validateAdvanced({ ...savedAdvanced, ...patch });
  return Object.keys(patch).length ? { advanced: patch } : {};
}
const busy = ref(''), message = ref(''), tone = ref(''), mode = ref<'' | 'copy' | 'delete'>(''), copyName = ref(''), deleted = ref(false);
const modelNames = ref<string[]>([]), modelQuery = ref(''), modelsOpen = ref(false);
const visibleModels = computed(() => modelNames.value.filter(name => name.toLocaleLowerCase().includes(modelQuery.value.trim().toLocaleLowerCase())));
let alive = true;
onBeforeUnmount(() => { alive = false; });
const isNew = props.role === null;
const title = isNew ? '新增 API' : `编辑${props.role === 'primary' ? '主模型' : '副模型'} API`;
async function run(kind: string, action: () => Promise<void>) {
  if (busy.value) return;
  busy.value = kind; message.value = '';
  try { await action(); }
  catch (error) { if (alive) { message.value = error instanceof Error ? error.message : '操作失败，请重试。'; tone.value = 'error'; } }
  finally { busy.value = ''; }
}
function close() { if (busy.value) return; alive = false; emit('cancel'); }
async function profile() {
  const saved = isNew || deleted.value ? { url: '', key: '', model: '' } : await props.config.getProfile(props.role!, props.target);
  return { url: draft.url.trim(), model: draft.model.trim(), key: draft.key.trim() || saved.key, advanced: { ...('advanced' in saved ? saved.advanced : savedAdvanced), ...advancedChanges().advanced } };
}
async function save() {
  await run('save', async () => {
    if (!draft.name.trim()) throw new Error('请输入预设名称。');
    if (isNew) await props.config.createPreset(draft.name, { ...draft, ...advancedChanges() });
    else {
      if (deleted.value) throw new Error('原连接已删除，请另存为新预设。');
      await props.config.saveEditor(props.role!, { ...(draft.url !== props.initial.url ? { url: draft.url } : {}), ...(draft.model !== props.initial.model ? { model: draft.model } : {}), key: draft.key, ...advancedChanges(), ...(props.target?.presetId && draft.name !== props.initial.name ? { name: draft.name } : {}) }, props.target);
    }
    if (alive) { alive = false; emit('saved', true); }
  });
}
async function saveCopy() {
  await run('copy', async () => {
    if (!copyName.value.trim()) throw new Error('请输入副本名称。');
    if (deleted.value) await props.config.createPreset(copyName.value, { ...draft, advanced: { ...savedAdvanced, ...advancedChanges().advanced } });
    else await props.config.savePresetAs(props.role!, copyName.value, { ...draft, ...advancedChanges() }, props.target, { select: false });
    if (alive) { mode.value = ''; message.value = '共享预设已另存，当前用途保持不变。'; tone.value = 'success'; emit('saved', false); }
  });
}
async function remove() {
  await run('delete', async () => {
    await props.config.deletePreset(props.target!.presetId!);
    if (alive) { deleted.value = true; mode.value = ''; message.value = '连接已删除；原输入仍保留，填写密钥后可另存。'; tone.value = ''; emit('saved', false); }
  });
}
async function fetchModels() {
  await run('models', async () => {
    const values = await createModelSettingsTools().fetchModels(await profile());
    if (alive) { modelNames.value = values; modelsOpen.value = true; message.value = `已拉取 ${values.length} 个模型。`; tone.value = 'success'; }
  });
}
function onModelSearchKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); event.stopPropagation(); }
}
async function testConnection() {
  await run('test', async () => { await createModelSettingsTools().testConnection(await profile()); if (alive) { message.value = '连接成功，模型已返回文本。'; tone.value = 'success'; } });
}
</script>
<template>
  <ApiPresetDialog :title="title" body="" confirm-text="保存" editor :busy="Boolean(busy)" @cancel="close" @confirm="mode === 'copy' ? saveCopy() : save()">
    <form class="bmx-api-config-fields" @submit.prevent="mode === 'copy' ? saveCopy() : save()">
      <p v-if="hint" class="bmx-api-hint">{{ hint }}</p>
      <label class="bmx-api-field"><span>预设名称</span><input v-model="draft.name" class="bmx-api-input" aria-label="预设名称" :disabled="!isNew && !target?.presetId" autocomplete="off"></label>
      <label class="bmx-api-field"><span>URL</span><input v-model="draft.url" class="bmx-api-input" type="url" aria-label="API 地址" autocomplete="url" placeholder="https://example.invalid/v1"></label>
      <label class="bmx-api-field"><span>Key</span><input v-model="draft.key" class="bmx-api-input" type="password" aria-label="API Key（留空保留已保存 Key）" autocomplete="new-password" :placeholder="deleted ? '原连接已删除，另存请输入 Key' : initial.hasKey ? '已保存，留空保持不变' : '输入 API Key'"></label>
      <label class="bmx-api-field"><span>模型</span><div class="bmx-api-inline"><input v-model="draft.model" class="bmx-api-input" aria-label="模型名称" autocomplete="off" placeholder="模型名称"><button type="button" class="bmx-api-secondary" :disabled="Boolean(busy)" @click="fetchModels">{{ busy === 'models' ? '正在拉取…' : '拉取模型' }}</button></div></label>
      <details v-if="modelsOpen" open class="bmx-model-list-section"><summary class="bmx-model-list-summary">已加载 {{ modelNames.length }} 个模型</summary><input v-model="modelQuery" class="bmx-api-input bmx-model-list-search" type="search" placeholder="搜索模型…" aria-label="搜索模型" @keydown="onModelSearchKeydown"><div class="bmx-model-list-items"><button v-for="name in visibleModels" :key="name" type="button" class="bmx-model-list-item" :class="{ active: name === draft.model.trim() }" :disabled="Boolean(busy)" @click="draft.model = name">{{ name }}</button><p v-if="!visibleModels.length" class="bmx-api-hint">{{ modelQuery ? '无匹配项' : '暂无模型' }}</p></div></details>
      <details class="bmx-model-list-section bmx-api-advanced"><summary class="bmx-model-list-summary">高级参数</summary>
        <div class="bmx-api-config-fields">
          <p class="bmx-api-hint">这些参数只用于百面相。</p>
          <label class="bmx-api-field"><span>排除参数</span><textarea v-model="advanced.excludeParams" class="bmx-api-input" rows="2" aria-label="排除参数" placeholder="每行一个参数名，也可用逗号分隔"></textarea></label>
          <label class="bmx-api-field"><span>附加参数（JSON）</span><textarea v-model="advanced.additionalParams" class="bmx-api-input" rows="3" aria-label="附加参数（JSON）" placeholder="{}" spellcheck="false"></textarea></label>
          <label class="bmx-api-field"><span>超时秒数</span><input v-model="advanced.timeoutSec" class="bmx-api-input" type="number" min="5" max="600" step="1" aria-label="超时秒数"></label>
          <label class="bmx-api-field"><span>失败重试次数</span><input v-model="advanced.retryCount" class="bmx-api-input" type="number" min="0" step="1" aria-label="失败重试次数"></label>
          <label class="bmx-api-field"><span>百面相温度（0–2）</span><input v-model="advanced.temperature" class="bmx-api-input" type="number" min="0" max="2" step="any" aria-label="百面相温度" placeholder="留空使用接口默认值"></label>
          <label><input v-model="advanced.stream" type="checkbox" aria-label="流式请求"> 流式请求</label>
        </div>
      </details>
      <div class="bmx-api-actions"><button type="button" class="bmx-api-secondary" :disabled="Boolean(busy)" @click="testConnection">{{ busy === 'test' ? '测试中' : '测试' }}</button><template v-if="!isNew"><button type="button" class="bmx-api-secondary" :disabled="Boolean(busy)" @click="mode = 'copy'; copyName = draft.name">另存为</button><button v-if="target?.presetId" type="button" class="bmx-api-secondary bmx-api-danger" :disabled="Boolean(busy) || deleted" @click="mode = 'delete'">删除</button></template></div>
      <div v-if="mode === 'copy'" class="bmx-api-config-fields"><label class="bmx-api-field"><span>副本名称</span><input v-model="copyName" class="bmx-api-input" aria-label="副本名称" @keydown.enter.prevent.stop="!$event.isComposing && saveCopy()"></label><div class="bmx-api-actions"><button type="button" class="bmx-api-secondary" :disabled="Boolean(busy)" @click="mode = ''">取消另存</button><button type="button" class="bmx-api-secondary" :disabled="Boolean(busy)" @click="saveCopy">保存副本</button></div></div>
      <div v-if="mode === 'delete'" class="bmx-api-config-fields"><p class="bmx-api-hint">删除「{{ initial.name }}」？百面相内引用会清理，其它插件需重新选择。</p><div class="bmx-api-actions"><button type="button" class="bmx-api-secondary" :disabled="Boolean(busy)" @click="mode = ''">返回编辑</button><button type="button" class="bmx-api-secondary bmx-api-danger" :disabled="Boolean(busy)" @click="remove">确认删除</button></div></div>
      <p class="bmx-api-result" :class="tone" role="status">{{ message }}</p>
    </form>
  </ApiPresetDialog>
</template>
