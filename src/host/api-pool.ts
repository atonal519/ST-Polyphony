import type { ApiAdvanced } from '../application/contracts';
import { getHostContext } from './host-context';

export interface SharedApiPreset { id: string; name: string; url: string; key: string; model: string; advanced?: ApiAdvanced }
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Read the shared pool from its owning extension settings; never copy or cache it. */
export function readSharedApiPresets(context = getHostContext()): SharedApiPreset[] {
  const settings = context?.extensionSettings as Record<string, unknown> | undefined;
  const shared = settings?.['schedule-planner'];
  const list = object(shared) ? shared.apiPresets : undefined;
  if (!Array.isArray(list)) return [];
  return list.flatMap(value => {
    if (!object(value)) return [];
    const id = text(value.id);
    return id ? [{ id, name: text(value.name) || '未命名预设', url: text(value.url), key: text(value.key), model: text(value.model), ...(object(value.polyphonyAdvanced) ? { advanced: value.polyphonyAdvanced as ApiAdvanced } : {}) }] : [];
  });
}

function mutablePool(allowMissing = false) {
  const context = getHostContext();
  const extensionSettings = context?.extensionSettings;
  if (!context || !extensionSettings || typeof context.saveSettingsDebounced !== 'function') throw new Error('无法保存共享 API 池设置。');
  const current = extensionSettings['schedule-planner'];
  const shared = object(current) ? current : {};
  if (!Array.isArray(shared.apiPresets) && (!allowMissing || Object.prototype.hasOwnProperty.call(shared, 'apiPresets'))) throw new Error('共享 API 池当前不可用，未修改设置。');
  const items: unknown[] = Array.isArray(shared.apiPresets) ? shared.apiPresets : [];
  return { extensionSettings, current, shared, items, save: context.saveSettingsDebounced.bind(context) };
}

// Failed editor saves undo only their own unchanged fields, retaining concurrent shared edits.
async function savePool(pool: ReturnType<typeof mutablePool>, items: unknown[]) {
  const before = structuredClone(pool.items), applied = structuredClone(items);
  pool.extensionSettings['schedule-planner'] = { ...pool.shared, apiPresets: items };
  try { await pool.save(); }
  catch (error) {
    const shared = pool.extensionSettings['schedule-planner'];
    if (object(shared) && Array.isArray(shared.apiPresets)) {
      let latest = shared.apiPresets as unknown[];
      const ids = new Set([...before, ...applied].filter(object).map(item => text(item.id)).filter(Boolean));
      for (const id of ids) {
        const old = before.find(item => object(item) && text(item.id) === id);
        const next = applied.find(item => object(item) && text(item.id) === id);
        if (same(old, next)) continue;
        const index = latest.findIndex(item => object(item) && text(item.id) === id);
        if (!old) { if (index >= 0 && same(latest[index], next)) latest = latest.filter((_, at) => at !== index); }
        else if (!next) { if (index < 0) latest = [...latest, old]; }
        else if (index >= 0 && object(latest[index]) && object(old) && object(next)) {
          const current = { ...latest[index] as Record<string, unknown> };
          for (const key of new Set([...Object.keys(old), ...Object.keys(next)])) {
            if (same(old[key], next[key]) || !same(current[key], next[key]) || Object.hasOwn(current, key) !== Object.hasOwn(next, key)) continue;
            if (Object.hasOwn(old, key)) current[key] = old[key]; else delete current[key];
          }
          latest = latest.map((value, at) => at === index ? current : value);
        }
      }
      shared.apiPresets = latest;
      if (!Object.hasOwn(pool.shared, 'apiPresets') && !latest.length) delete shared.apiPresets;
      if (!object(pool.current) && !Object.keys(shared).length) {
        if (pool.current === undefined) delete pool.extensionSettings['schedule-planner']; else pool.extensionSettings['schedule-planner'] = pool.current;
      }
    }
    throw error;
  }
}

export async function updateSharedApiPreset(id: string, patch: { url: string; key: string; model: string; name?: string; advanced?: ApiAdvanced }): Promise<void> {
  const pool = mutablePool(); let found = false;
  const apiPresets = pool.items.map(item => {
    if (!object(item) || text(item.id) !== id) return item;
    const { advanced, ...connection } = patch;
    found = true; return { ...item, ...connection, ...(advanced ? { polyphonyAdvanced: advanced } : {}) };
  });
  if (!found) throw new Error('所选共享 API 预设已失效，请重新选择。');
  await savePool(pool, apiPresets);
}

export async function createSharedApiPreset(preset: SharedApiPreset, baseId = ''): Promise<void> {
  const pool = mutablePool(true), base = pool.items.find(item => object(item) && text(item.id) === baseId);
  const { advanced, ...connection } = preset;
  await savePool(pool, [...pool.items, { ...(object(base) ? base : {}), ...connection, ...(advanced ? { polyphonyAdvanced: advanced } : {}) }]);
}

export async function deleteSharedApiPreset(id: string): Promise<void> {
  const pool = mutablePool();
  if (!pool.items.some(item => object(item) && text(item.id) === id)) throw new Error('这个共享预设已不存在。');
  await savePool(pool, pool.items.filter(item => !object(item) || text(item.id) !== id));
}

export async function renameSharedApiPreset(id: string, name: string): Promise<void> {
  const selected = text(id), label = text(name);
  if (!label) throw new Error('请输入预设名称。');
  const pool = mutablePool();
  if (!selected || !pool.items.some(item => object(item) && text(item.id) === selected)) throw new Error('这个共享预设已不存在。');
  await savePool(pool, pool.items.map(item => object(item) && text(item.id) === selected ? { ...item, name: label } : item));
}
