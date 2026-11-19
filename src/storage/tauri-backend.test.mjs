import test from 'node:test';
import assert from 'node:assert/strict';
import { createTauriBackendFetch, isTauriTavern } from './tauri-backend.js';

const API = '/api/plugins/st-bainiaodata/v1/';
// Simulates TT's native boundary: values are re-parsed and object keys come back sorted, as Rust JSON maps would.
const sortKeys = value => Array.isArray(value) ? value.map(sortKeys)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sortKeys(value[key])])) : value;
function createNativeStore() {
  const files = new Map(), reads = [];
  const id = ({ namespace, table = 'main', key }) => `${namespace}/${table}/${key}`;
  return { files, reads, api: {
    async tryGetJson(options) { reads.push(id(options)); const raw = files.get(id(options)); return raw === undefined ? { found: false } : { found: true, value: sortKeys(JSON.parse(raw)) }; },
    async setJson(options) { files.set(id(options), JSON.stringify(options.value)); },
    async deleteJson(options) { files.delete(id(options)); },
    async listKeys({ namespace, table = 'main' }) { const prefix = `${namespace}/${table}/`; return [...files.keys()].filter(key => key.startsWith(prefix)).map(key => key.slice(prefix.length)); },
    async listTables({ namespace }) { return [...new Set([...files.keys()].filter(key => key.startsWith(`${namespace}/`)).map(key => key.split('/')[1]))]; },
  } };
}
function createGlobal(store = createNativeStore()) {
  let uuid = 0;
  return { store, globalRef: { __TAURITAVERN__: { ready: Promise.resolve(), api: { extension: { store: store.api } } }, crypto: globalThis.crypto,
    SillyTavern: { getContext: () => ({ uuidv4: () => `uuid-${++uuid}` }) } } };
}
const send = async (fetch, path, method = 'GET', body) => {
  const response = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, ok: response.ok, payload: JSON.parse(await response.text()) };
};

test('detects TauriTavern only from its host globals', () => {
  assert.equal(isTauriTavern({}), false);
  assert.equal(isTauriTavern({ __TAURITAVERN__: {} }), true);
  assert.equal(isTauriTavern({ __TAURITAVERN_MAIN_READY__: Promise.resolve() }), true);
});

test('single records follow BaiNiao revisions, 404 and conflicts and keep key order across the native boundary', async () => {
  const { globalRef } = createGlobal(), fetch = createTauriBackendFetch({ globalRef });
  const missing = await send(fetch, 'records/st-dollars/npc-world-1/world');
  assert.equal(missing.status, 404); assert.equal(missing.payload.error, 'not_found');
  const created = await send(fetch, 'records/st-dollars/npc-world-1/world', 'PUT', { data: { zeta: 1, alpha: { b: 2, a: 1 } }, expectedRevision: 0 });
  assert.equal(created.status, 200); assert.equal(created.payload.revision, 1); assert.equal(created.payload.generationId, 'uuid-1');
  const read = await send(fetch, 'records/st-dollars/npc-world-1/world');
  assert.deepEqual(read.payload, created.payload);
  assert.deepEqual(Object.keys(read.payload.data), ['zeta', 'alpha']);
  const stale = await send(fetch, 'records/st-dollars/npc-world-1/world', 'PUT', { data: {}, expectedRevision: 0 });
  assert.equal(stale.status, 409); assert.equal(stale.payload.error, 'conflict');
  const updated = await send(fetch, 'records/st-dollars/npc-world-1/world', 'PUT', { data: { next: true }, expectedRevision: 1 });
  assert.equal(updated.payload.revision, 2); assert.equal(updated.payload.generationId, 'uuid-1'); assert.equal(updated.payload.createdAt, created.payload.createdAt);
  const invalid = await send(fetch, 'records/st-dollars/npc-world-1/..', 'GET');
  assert.equal(invalid.status, 400);
});

test('record IDs, batch reads and batch writes match the server contract', async () => {
  const { globalRef } = createGlobal(), fetch = createTauriBackendFetch({ globalRef });
  const written = await send(fetch, 'record-batch/st-dollars/messages', 'PUT', { records: [
    { recordId: 'b', data: { text: 'B' }, expectedRevision: 0 },
    { recordId: 'a', data: { text: 'A' }, expectedRevision: 0 },
  ] });
  assert.deepEqual(written.payload.map(row => [row.recordId, row.status, row.envelope.revision]), [['b', 200, 1], ['a', 200, 1]]);
  const partial = await send(fetch, 'record-batch/st-dollars/messages', 'PUT', { records: [
    { recordId: 'a', data: { text: 'A2' }, expectedRevision: 1 }, { recordId: 'b', data: {}, expectedRevision: 0 },
  ] });
  assert.deepEqual(partial.payload.map(row => [row.recordId, row.status, row.error ?? null]), [['a', 200, null], ['b', 409, 'conflict']]);
  assert.deepEqual((await send(fetch, 'record-ids/st-dollars/messages')).payload, ['a', 'b']);
  assert.deepEqual((await send(fetch, 'record-ids/st-dollars/empty')).payload, []);
  const batch = await send(fetch, 'record-batch/st-dollars/messages', 'POST', { recordIds: ['a', 'missing', 'b'] });
  assert.deepEqual(batch.payload.map(row => [row.recordId, row.status, row.envelope?.data?.text ?? null]), [['a', 200, 'A2'], ['missing', 404, null], ['b', 200, 'B']]);
  assert.equal((await send(fetch, 'record-batch/st-dollars/messages', 'POST', { recordIds: [] })).status, 400);
  const duplicate = await send(fetch, 'record-batch/st-dollars/messages', 'PUT', { records: [{ recordId: 'a', data: 1, expectedRevision: 2 }, { recordId: 'a', data: 2, expectedRevision: 2 }] });
  assert.equal(duplicate.status, 400);
});

test('uses the same native slots as 千千结 TT adapter so one local BaiNiao store is shared', async () => {
  const { store, globalRef } = createGlobal(), fetch = createTauriBackendFetch({ globalRef });
  await send(fetch, 'records/st-dollars/settings/api', 'PUT', { data: { main: 'x' }, expectedRevision: 0 });
  const [[path, raw]] = [...store.files];
  assert.match(path, /^qqj-bainiao-v1\/r-[0-9a-f]{64}\/r-[0-9a-f]{64}$/);
  const value = JSON.parse(raw);
  assert.equal(value.format, 'qqj-tt-json-v2');
  const slot = JSON.parse(value.serialized);
  assert.deepEqual([slot.format, slot.namespace, slot.collection, slot.recordId, slot.trash], ['qqj-tt-record-v1', 'st-dollars', 'settings', 'api', []]);
  // A record stored by another namespace in the same native store stays invisible to this collection.
  const other = await send(fetch, 'records/qqj/settings/api');
  assert.equal(other.status, 404);
});

test('record IDs skip unreadable slots and follow the server file-name order', async () => {
  const { store, globalRef } = createGlobal(), fetch = createTauriBackendFetch({ globalRef });
  for (const id of ['b', 'a-1', 'a']) await send(fetch, `records/st-dollars/list/${id}`, 'PUT', { data: id, expectedRevision: 0 });
  const [table] = [...store.files.keys()][0].split('/').slice(1, 2);
  store.files.set(`qqj-bainiao-v1/${table}/broken`, '{"format":"qqj-tt-json-v2","serialized":"{"}');
  const ids = await send(fetch, 'record-ids/st-dollars/list');
  assert.equal(ids.status, 200);
  assert.deepEqual(ids.payload, ['a', 'b', 'a-1'].map(id => `${id}.json`).sort((x, y) => x.localeCompare(y)).map(name => name.slice(0, -5)));
});

test('the media directory survives restart without reading any indexed article bodies', async () => {
  const { store, globalRef } = createGlobal(), fetch = createTauriBackendFetch({ globalRef });
  const route = 'record-ids/st-dollars/npc-media-fixture';
  await send(fetch, 'record-batch/st-dollars/npc-media-fixture', 'PUT', { records: ['a', 'b'].map(recordId => ({
    recordId, data: { body: '旧稿正文'.repeat(800) }, expectedRevision: 0,
  })) });
  await send(fetch, 'records/st-dollars/npc-media-fixture/c', 'PUT', { data: { body: '新稿' }, expectedRevision: 0 });
  const reopened = createTauriBackendFetch(createGlobal(store));
  store.reads.length = 0;
  assert.deepEqual(await send(reopened, route), { status: 200, ok: true, payload: ['a', 'b', 'c'] });
  assert.equal(store.reads.filter(path => path.startsWith('qqj-bainiao-v1/')).length, 0);
  assert.equal(store.reads.length, 1);
});

test('legacy media slots are reconciled incrementally when some reads fail, without losing saved records', async () => {
  const { store, globalRef } = createGlobal(), fetch = createTauriBackendFetch({ globalRef });
  const route = 'record-ids/st-dollars/npc-media-legacy';
  const setJson = store.api.setJson;
  store.api.setJson = async options => {
    if (options.namespace !== 'qqj-bainiao-v1') throw Error('index temporarily unavailable');
    return setJson(options);
  };
  for (const id of ['a', 'b']) {
    const saved = await send(fetch, `records/st-dollars/npc-media-legacy/${id}`, 'PUT', { data: id, expectedRevision: 0 });
    assert.equal(saved.status, 200);
  }
  store.api.setJson = setJson;
  const tryGet = store.api.tryGetJson;
  let unavailable = new Set(store.files.keys());
  store.api.tryGetJson = async options => {
    if (unavailable.has(`${options.namespace}/${options.table}/${options.key}`)) throw Error('native read failed');
    return tryGet(options);
  };
  assert.equal((await send(fetch, route)).status, 503);
  unavailable.delete([...unavailable][0]);
  assert.deepEqual(await send(fetch, route), { status: 206, ok: true, payload: ['a'] });
  unavailable.clear();
  store.reads.length = 0;
  assert.deepEqual(await send(fetch, route), { status: 200, ok: true, payload: ['a', 'b'] });
  assert.equal(store.reads.filter(path => path.startsWith('qqj-bainiao-v1/')).length, 1);
  const [deleted] = [...store.files.keys()];
  store.files.delete(deleted);
  assert.deepEqual((await send(fetch, route)).payload, ['b']);
});

test('concurrent writers of one record are serialized and only one wins the revision', async () => {
  const { globalRef } = createGlobal(), fetch = createTauriBackendFetch({ globalRef });
  const results = await Promise.all([1, 2, 3].map(value => send(fetch, 'records/st-dollars/c/r', 'PUT', { data: value, expectedRevision: 0 })));
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409, 409]);
});

test('unavailable TT store rejects like a network failure instead of pretending success', async () => {
  const fetch = createTauriBackendFetch({ globalRef: { __TAURITAVERN__: { ready: Promise.resolve(), api: {} } } });
  await assert.rejects(fetch(API + 'records/st-dollars/c/r'), /TT 本地存储接口不可用/);
  const unsupported = await createTauriBackendFetch(createGlobal())(API + 'trash/st-dollars');
  assert.equal(unsupported.status, 404);
});
