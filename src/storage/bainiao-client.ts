import { getHostContext } from '../host/host-context';
import { jsonRequestHeaders } from '../host/request-headers';
import {recordDiagnostic,diagnosticError,type DiagnosticTrace} from '../diagnostics/development';
import { createTauriBackendFetch, isTauriTavern } from './tauri-backend.js';

export class StorageError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); this.name = 'StorageError'; }
}
export interface BainiaoBatchRow {recordId:string;status:number;envelope?:{revision:number;data:unknown}}

// TauriTavern has no Node server plugins; the default transport serves the same BaiNiao routes from TT's native store.
let tauriFetch: typeof fetch | undefined;
const defaultFetch: typeof fetch = (...args) => isTauriTavern() ? (tauriFetch ??= createTauriBackendFetch())(...args) : fetch(...args);

export function createBainiaoClient({ fetchImpl = defaultFetch, getHeaders = () => getHostContext()?.getRequestHeaders?.() as HeadersInit ?? {}, baseUrl = '' }: { fetchImpl?: typeof fetch; getHeaders?: () => HeadersInit; baseUrl?: string } = {}) {
  async function request(path:string,method:'GET'|'PUT'|'POST',body?:unknown,diagnostic?:DiagnosticTrace) {
    const url = `${baseUrl.replace(/\/$/, '')}/api/plugins/st-bainiaodata/v1/${path}`;
    let response: Response;
    let raw: string;
    try {
      response = await fetchImpl(url, { method, headers: body === undefined ? getHeaders() : jsonRequestHeaders(getHeaders()), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      raw = await response.text();
    } catch(error) {recordDiagnostic(diagnostic,'storage-failed',diagnosticError(error));throw new StorageError(0, 'network_error', '白鳥数据连接失败，请重新读取当前数据后再继续。'); }
    let payload: Record<string, unknown> = {};
    try { payload = raw ? JSON.parse(raw) as Record<string, unknown> : {}; }
    catch {recordDiagnostic(diagnostic,'storage-response',()=>({httpStatus:response.status,code:'invalid_response',returnedRevisionPresent:false,returnedDataPresent:false}));if (response.ok) throw new StorageError(response.status, 'invalid_response', '白鳥返回的数据无法读取。'); }
    recordDiagnostic(diagnostic,'storage-response',()=>({httpStatus:response.status,returnedRevisionPresent:Object.hasOwn(payload,'revision'),ackRevision:typeof payload.revision==='number'?payload.revision:null,returnedDataPresent:Object.hasOwn(payload,'data'),code:response.ok?'':payload.error}));
    if (!response.ok) {
      const code = String(payload.error ?? (response.status === 409 ? 'conflict' : 'storage_error'));
      const message = response.status === 409 ? '数据已被其他更新修改，请重新读取后再推进。' : method !== 'PUT' ? '读取百面相数据失败，请重新打开页面后再试。' : response.status === 0 ? '保存结果暂时无法确认，请重新读取当前数据。' : '保存百面相数据失败，请重新读取当前数据后再决定下一步。';
      throw new StorageError(response.status, code, message);
    }
    return {payload,status:response.status};
  }
  const record=(collection:string,id:string)=>`records/st-dollars/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`;
  async function batch(collection:string,method:'POST'|'PUT',body:unknown,diagnostic?:DiagnosticTrace):Promise<BainiaoBatchRow[]> {
    const {payload}=await request(`record-batch/st-dollars/${encodeURIComponent(collection)}`,method,body,diagnostic);
    if(!Array.isArray(payload))throw new StorageError(200,'invalid_response','白鳥返回的批量结果无法读取。');
    return payload;
  }
  return {
    async listRecordIds(collection:string):Promise<{ids:string[];complete:boolean}> {
      const {payload,status}=await request('record-ids/st-dollars/'+encodeURIComponent(collection),'GET');
      if(!Array.isArray(payload))throw new StorageError(status,'invalid_response','白鳥返回的消息目录无法读取。');
      return {ids:payload.filter((id):id is string=>typeof id==='string'),complete:status!==206};
    },
    async get(collection: string, id: string) {
      try { return (await request(record(collection,id),'GET')).payload; }
      catch (error) { if (error instanceof StorageError && error.status === 404) return null; throw error; }
    },
    async put(collection: string, id: string, data: unknown, expectedRevision: number, diagnostic?:DiagnosticTrace) { return (await request(record(collection,id),'PUT',{data,expectedRevision},diagnostic)).payload; },
    readBatch(collection:string,recordIds:string[]) {return batch(collection,'POST',{recordIds});},
    writeBatch(collection:string,records:Array<{recordId:string;data:unknown;expectedRevision:number}>,diagnostic?:DiagnosticTrace) {return batch(collection,'PUT',{records},diagnostic);},
  };
}
