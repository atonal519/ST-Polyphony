import type {PublicMessageRepository} from '../application/contracts';
import {readPublicMessage,smellRecordRef,type PublicMessage} from '../domain/public-messages';
import type {BainiaoBatchRow,createBainiaoClient} from './bainiao-client';

const collection=(scopeId:string)=>'npc-media-'+scopeId;
function confirmed(row:BainiaoBatchRow|undefined,id:string) {
  return row?.recordId===id&&row.status===200&&row.envelope?.revision===1?row.envelope.data:undefined;
}

export function createPublicMessageRepository(client:Pick<ReturnType<typeof createBainiaoClient>,'listRecordIds'|'readBatch'|'writeBatch'>):PublicMessageRepository {
  return {
    async list(scopeId) {
      const {ids,complete}=await client.listRecordIds(collection(scopeId));
      const refs=ids.flatMap(id=>{const ref=smellRecordRef(id);return ref?[ref]:[];});
      return {refs,complete};
    },
    async write(scopeId,window,messages,diagnostic) {
      if(!messages.length)return [];
      const groups=new Map<string,PublicMessage[]>();
      for(const {medium,...message} of messages){
        const entries=groups.get(medium)??[];
        entries.push(message);
        groups.set(medium,entries);
      }
      const publishedAt=Date.now().toString(36);
      const records=[...groups].map(([medium,entries])=>({
        recordId:`smell~${window.throughSeq}~${publishedAt}~${window.id}~${entries.length}~${medium}`,expectedRevision:0,data:{medium,entries},
      }));
      const rows=await client.writeBatch(collection(scopeId),records,diagnostic);
      return records.flatMap(({recordId,data},index)=>{
        const ref=smellRecordRef(recordId);
        return ref&&JSON.stringify(confirmed(rows[index],recordId))===JSON.stringify(data)?[ref]:[];
      });
    },
    async read(scopeId,refs) {
      if(!refs.length)return [];
      const rows=await client.readBatch(collection(scopeId),refs.map(ref=>ref.recordId));
      return refs.flatMap((ref,index)=>{
        const data=confirmed(rows[index],ref.recordId) as {medium?:unknown;entries?:unknown}|undefined;
        if(data?.medium!==ref.medium||!Array.isArray(data.entries)||data.entries.length!==ref.count)return [];
        const entries=data.entries.flatMap(item=>{
          const entry=readPublicMessage(item);
          return entry&&entry.sourceSeq<=ref.throughSeq?[entry]:[];
        });
        return entries.length?[{recordId:ref.recordId,entries}]:[];
      });
    },
  };
}
