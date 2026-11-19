// TauriTavern does not run the ST-BaiNiaoData Node server plugin. This transport
// serves the BaiNiao V1 routes used by 百面相 from TT's native extension.store.
// It is private to the BaiNiao client and never replaces window.fetch.
//
// Storage namespace, slot format, table/key hashing and the lock registry are the
// same as 千千结's TT adapter (ST-MyriadKnots src/tauri-backend.js), so both
// plugins share one local BaiNiao store as they share one backend on a server.
const API_PREFIX = '/api/plugins/st-bainiaodata/v1/';
const STORAGE_NAMESPACE = 'qqj-bainiao-v1';
const MEDIA_INDEX_NAMESPACE = 'st-dollars-media-index-v1';
const RECORD_KEY = /^r-[0-9a-f]{64}$/;
const LOCKS = Symbol.for('qqj.bainiao.tt.locks.v1');
const BATCH_LIMIT = 64, BATCH_WRITE_BYTES = 1048576, READ_CONCURRENCY = 8, WRITE_CONCURRENCY = 4;
const encoder = new TextEncoder();
const error = (status, message) => Object.assign(new Error(message), { status });
const abort = signal => { if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError'); };
const errorCode = status => status === 409 ? 'conflict' : status === 404 ? 'not_found' : status === 400 ? 'validation' : 'storage_error';
const hasMediaIndex = (namespace, collection) => namespace === 'st-dollars' && collection.startsWith('npc-media-');
const mediaIndexOptions = table => ({ namespace: MEDIA_INDEX_NAMESPACE, table, key: 'record-ids' });

async function readMediaIndex(store, table) {
  try {
    const { found, value } = await store.tryGetJson(mediaIndexOptions(table));
    if (found && value && typeof value === 'object' && !Array.isArray(value)) {
      return new Map(Object.entries(value).filter(([key, id]) => RECORD_KEY.test(key) && typeof id === 'string'));
    }
  } catch {
    // The authoritative record keys can reconstruct this derived directory.
    return null;
  }
  return new Map();
}

// Called with the shared storage lock. A recovered index can be merged with IDs
// written while the directory was reading the remaining legacy slots.
async function rememberMediaIds(store, table, entries) {
  if (!entries.size) return;
  const index = await readMediaIndex(store, table);
  if (!index) return;
  let changed = false;
  for (const [key, id] of entries) {
    if (index.get(key) === id) continue;
    index.set(key, id);
    changed = true;
  }
  if (!changed) return;
  try {
    await store.setJson({ ...mediaIndexOptions(table), value: Object.fromEntries(index) });
  } catch {
    // The record is already saved. Its key will be discovered on the next list.
  }
}

async function sha256(value, globalRef) {
  const bytes = encoder.encode(String(value));
  if (globalRef.crypto?.subtle) {
    const digest = await globalRef.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  const fallback = globalRef.SillyTavern?.libs?.sha256;
  if (typeof fallback !== 'function') throw error(500, 'SHA-256 unavailable');
  return fallback(bytes);
}

// Rust JSON maps may reorder object fields; carry the complete JS serialization
// across the native boundary so stored data keeps its original key order.
const encodeSlot = slot => ({ format: 'qqj-tt-json-v2', serialized: JSON.stringify(slot) });
function decodeSlot(value) {
  if (value?.format !== 'qqj-tt-json-v2') return value;
  if (typeof value.serialized !== 'string') throw error(500, 'Invalid stored serialization');
  try { return JSON.parse(value.serialized); } catch { throw error(500, 'Invalid stored serialization'); }
}

function segment(value) {
  if (typeof value !== 'string' || !value || value.length > 128 || encoder.encode(value).length > 512
    || value === '.' || value === '..' || /[/\\\u0000-\u001f\u007f]/u.test(value)) throw error(400, 'Invalid record key');
  return value;
}
function revision(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw error(400, 'Invalid expectedRevision');
  return value;
}
function envelope(value) {
  if (!value || value.schemaVersion !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 1
    || typeof value.generationId !== 'string' || typeof value.createdAt !== 'string'
    || typeof value.updatedAt !== 'string' || !Object.hasOwn(value, 'data')) throw error(500, 'Invalid stored envelope');
  return value;
}
function parseBody(init) {
  try { return JSON.parse(init.body); } catch { throw error(400, 'Invalid JSON'); }
}

function abortable(operation, signal) {
  if (!signal) return operation();
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    if (signal.aborted) { onAbort(); return; }
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve().then(operation).then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

async function locked(globalRef, name, action) {
  // One queue per BaiNiao namespace, shared with every bundle using this store.
  const queues = globalRef[LOCKS] ??= new Map();
  const previous = queues.get(name) ?? Promise.resolve();
  const pending = previous.catch(() => {}).then(() => {
    if (globalRef.navigator?.locks?.request) return globalRef.navigator.locks.request(name, action);
    return action();
  });
  const settled = pending.then(() => {}, () => {}).finally(() => {
    if (queues.get(name) === settled) queues.delete(name);
  });
  queues.set(name, settled);
  return pending;
}

export function isTauriTavern(globalRef = globalThis) {
  return Boolean(globalRef.__TAURITAVERN__ || globalRef.__TAURITAVERN_MAIN_READY__);
}

export function createTauriBackendFetch({ globalRef = globalThis } = {}) {
  const ready = async () => {
    await (globalRef.__TAURITAVERN__?.ready ?? globalRef.__TAURITAVERN_MAIN_READY__);
    const store = globalRef.__TAURITAVERN__?.api?.extension?.store;
    for (const method of ['tryGetJson', 'setJson', 'listKeys', 'listTables']) {
      if (typeof store?.[method] !== 'function') throw new Error('TT 本地存储接口不可用，请确认 TauriTavern 版本并重启应用');
    }
    return store;
  };
  const options = (table, key) => ({ namespace: STORAGE_NAMESPACE, table, key });
  const tableFor = (namespace, collection) => sha256(JSON.stringify([namespace, collection]), globalRef).then(hash => `r-${hash}`);
  const keyFor = recordId => sha256(recordId, globalRef).then(hash => `r-${hash}`);
  const validateSlot = (value, namespace, collection, recordId) => {
    if (!value || value.format !== 'qqj-tt-record-v1' || value.namespace !== namespace
      || (collection !== undefined && value.collection !== collection)
      || (recordId !== undefined && value.recordId !== recordId) || !Array.isArray(value.trash)
      || !Object.hasOwn(value, 'current')) throw error(500, 'Invalid stored record');
    segment(value.collection); segment(value.recordId);
    if (value.current !== null) envelope(value.current);
    return value;
  };
  const read = async (store, table, key, namespace, collection, recordId) => {
    const result = await store.tryGetJson(options(table, key));
    if (result?.found === false) return null;
    if (result?.found !== true) throw error(500, 'Invalid storage response');
    return validateSlot(decodeSlot(result.value), namespace, collection, recordId);
  };
  const emptySlot = (namespace, collection, recordId) => ({ format: 'qqj-tt-record-v1', namespace, collection, recordId, current: null, trash: [] });
  const saveSlot = async (store, table, key, slot, body, signal) => {
    const expected = revision(body?.expectedRevision), actual = slot.current?.revision ?? 0;
    if (actual !== expected) throw error(409, 'Revision conflict');
    if (!Object.hasOwn(body, 'data') || actual === Number.MAX_SAFE_INTEGER) throw error(400, 'Invalid record data or revision');
    const timestamp = new Date().toISOString();
    const generationId = slot.current?.generationId ?? globalRef.SillyTavern?.getContext?.()?.uuidv4?.() ?? globalRef.crypto?.randomUUID?.();
    if (!generationId) throw error(500, 'UUID unavailable');
    const next = { ...slot, current: { schemaVersion: 1, revision: actual + 1, generationId,
      createdAt: slot.current?.createdAt ?? timestamp, updatedAt: timestamp, data: body.data } };
    abort(signal);
    await store.setJson({ ...options(table, key), value: encodeSlot(next) });
    return next.current;
  };

  const readBatch = async (store, namespace, collection, body, signal) => {
    if (!Array.isArray(body?.recordIds) || body.recordIds.length < 1 || body.recordIds.length > BATCH_LIMIT) throw error(400, 'Invalid recordIds');
    const ids = body.recordIds.map(segment), table = await tableFor(namespace, collection), results = new Array(ids.length);
    const lockName = `${STORAGE_NAMESPACE}:${namespace}`;
    for (let start = 0; start < ids.length; start += READ_CONCURRENCY) {
      abort(signal);
      // Writes may run between groups, never during submitted native reads.
      await locked(globalRef, lockName, async () => {
        await Promise.allSettled(ids.slice(start, start + READ_CONCURRENCY).map(async (recordId, offset) => {
          const index = start + offset;
          try {
            const slot = await read(store, table, await keyFor(recordId), namespace, collection, recordId);
            results[index] = slot?.current ? { recordId, status: 200, envelope: slot.current }
              : { recordId, status: 404, error: 'not_found', message: 'Record not found' };
          } catch {
            results[index] = { recordId, status: 500, error: 'storage_error', message: 'Unable to read record' };
          }
        }));
      });
    }
    abort(signal);
    return results;
  };

  const writeBatch = async (store, namespace, collection, init, signal) => {
    if (typeof init.body !== 'string' || encoder.encode(init.body).length > BATCH_WRITE_BYTES) throw error(400, 'Batch body exceeds 1048576 bytes');
    const body = parseBody(init);
    if (!Array.isArray(body?.records) || body.records.length < 1 || body.records.length > BATCH_LIMIT) throw error(400, 'records must contain between 1 and 64 items');
    const records = body.records.map(item => {
      if (!item || typeof item !== 'object' || !Object.hasOwn(item, 'data')) throw error(400, 'Invalid batch record');
      return { recordId: segment(item.recordId), expectedRevision: revision(item.expectedRevision), data: item.data };
    });
    if (new Set(records.map(item => item.recordId)).size !== records.length) throw error(400, 'Duplicate record ID');
    return locked(globalRef, `${STORAGE_NAMESPACE}:${namespace}`, async () => {
      abort(signal);
      const table = await tableFor(namespace, collection), results = new Array(records.length);
      const indexed = hasMediaIndex(namespace, collection) ? new Map() : null;
      let cursor = 0;
      const worker = async () => {
        while (cursor < records.length) {
          abort(signal);
          const index = cursor++, item = records[index];
          try {
            const key = await keyFor(item.recordId);
            const slot = await read(store, table, key, namespace, collection, item.recordId) ?? emptySlot(namespace, collection, item.recordId);
            results[index] = { recordId: item.recordId, status: 200, envelope: await saveSlot(store, table, key, slot, item, signal) };
            indexed?.set(key, item.recordId);
          } catch (cause) {
            if (signal?.aborted) throw cause;
            const status = [400, 409].includes(cause?.status) ? cause.status : 500;
            results[index] = { recordId: item.recordId, status, error: errorCode(status), message: status === 409 ? 'Revision conflict' : status === 400 ? cause.message : 'Unable to save record' };
          }
        }
      };
      // Submitted native writes cannot be cancelled; drain every worker before releasing the queue.
      const workers = await Promise.allSettled(Array.from({ length: Math.min(WRITE_CONCURRENCY, records.length) }, worker));
      abort(signal);
      const failed = workers.find(item => item.status === 'rejected');
      if (failed) throw failed.reason;
      if (indexed) await rememberMediaIds(store, table, indexed);
      return results;
    });
  };

  const listRecordIds = async (store, namespace, collection, signal) => {
    const table = await tableFor(namespace, collection), lockName = `${STORAGE_NAMESPACE}:${namespace}`;
    const indexMedia = hasMediaIndex(namespace, collection);
    const { keys, index } = await locked(globalRef, lockName, async () => {
      const keys = await store.listKeys({ namespace: STORAGE_NAMESPACE, table });
      if (!Array.isArray(keys)) throw error(500, 'Invalid storage listing');
      const recordKeys = keys.filter(key => typeof key === 'string' && RECORD_KEY.test(key));
      const index = indexMedia && recordKeys.length ? await readMediaIndex(store, table) : null;
      return { keys: recordKeys, index };
    });
    const ids = [];
    const missing = keys.filter(key => {
      const id = index?.get(key);
      if (id === undefined) return true;
      ids.push(id);
      return false;
    });
    const recovered = new Map();
    let failed = 0;
    // Recover IDs from unindexed slots in groups so queued writes can run between them.
    for (let start = 0; start < missing.length; start += READ_CONCURRENCY) {
      abort(signal);
      await locked(globalRef, lockName, () => Promise.all(missing.slice(start, start + READ_CONCURRENCY).map(async key => {
        try {
          const slot = await read(store, table, key, namespace, collection);
          if (slot?.current && key === await keyFor(slot.recordId)) {
            ids.push(slot.recordId);
            recovered.set(key, slot.recordId);
          }
        } catch { failed++; }
      })));
    }
    abort(signal);
    if (indexMedia && recovered.size) {
      await locked(globalRef, lockName, () => rememberMediaIds(store, table, recovered));
    }
    if (failed && !ids.length) throw error(503, 'Unable to read record directory');
    // Same order as the server, which sorts the `<recordId>.json` file names.
    return respond(failed ? 206 : 200, ids.sort((a, b) => `${a}.json`.localeCompare(`${b}.json`)));
  };

  const dispatch = async (url, init) => {
    if (typeof url !== 'string' || !url.startsWith(API_PREFIX)) throw error(400, 'Unsupported local backend URL');
    const parts = url.slice(API_PREFIX.length).split('/').map(value => {
      try { return decodeURIComponent(value); } catch { throw error(400, 'Invalid URL'); }
    });
    const method = (init.method ?? 'GET').toUpperCase(), signal = init.signal;
    abort(signal);
    const store = await ready();
    abort(signal);
    if (parts.length === 1 && parts[0] === 'health' && method === 'GET') {
      await store.listTables({ namespace: STORAGE_NAMESPACE });
      return respond(200, { ok: true, plugin: { id: 'st-bainiaodata', name: 'Bainiao Data (TT)', version: '0.1.0-tt' },
        api: { current: 1, supported: [1] }, storage: { scope: 'tauritavern-data-root', envelopeSchemaVersion: 1 },
        capabilities: { records: true, recordBatchRead: true, recordBatchWrite: true, recordIdList: true, optimisticRevision: true } });
    }
    if (parts.length < 3) throw error(404, 'Unsupported local backend route');
    const namespace = segment(parts[1]), collection = segment(parts[2]);
    if (namespace === 'system-trash') throw error(400, 'Reserved namespace');
    if (parts[0] === 'record-ids' && parts.length === 3 && method === 'GET') return listRecordIds(store, namespace, collection, signal);
    if (parts[0] === 'record-batch' && parts.length === 3 && method === 'POST') return respond(200, await readBatch(store, namespace, collection, parseBody(init), signal));
    if (parts[0] === 'record-batch' && parts.length === 3 && method === 'PUT') return respond(200, await writeBatch(store, namespace, collection, init, signal));
    if (parts[0] === 'records' && parts.length === 4 && ['GET', 'PUT'].includes(method)) {
      const recordId = segment(parts[3]), body = method === 'PUT' ? parseBody(init) : undefined;
      // Reads wait for queued writes of the same namespace, as with the server's write queue.
      return locked(globalRef, `${STORAGE_NAMESPACE}:${namespace}`, async () => {
        abort(signal);
        const table = await tableFor(namespace, collection), key = await keyFor(recordId);
        const slot = await read(store, table, key, namespace, collection, recordId);
        if (method === 'GET') {
          if (!slot?.current) throw error(404, 'Record not found');
          return respond(200, slot.current);
        }
        const saved = await saveSlot(store, table, key, slot ?? emptySlot(namespace, collection, recordId), body, signal);
        if (hasMediaIndex(namespace, collection)) await rememberMediaIds(store, table, new Map([[key, recordId]]));
        return respond(200, saved);
      });
    }
    throw error(404, 'Unsupported local backend route');
  };

  const respond = (status, value) => {
    const text = JSON.stringify(value);
    return { ok: status >= 200 && status < 300, status, headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => text, json: async () => JSON.parse(text) };
  };
  return async function tauriBackendFetch(url, init = {}) {
    try {
      return await abortable(() => dispatch(String(url), init), init.signal);
    } catch (cause) {
      // Unknown failures (TT not ready, native exceptions, aborts) reject like a network error.
      if (!Number.isInteger(cause?.status)) throw cause;
      return respond(cause.status, { error: errorCode(cause.status), message: cause.message });
    }
  };
}
