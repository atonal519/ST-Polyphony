import type {Knowledge, WorldEvent} from '../domain/world';
import {list} from './trajectory';
import {privateProse} from './story-evidence';
import {classifyKnowledge} from '../domain/world-facts';

type Access = 'direct' | 'report';
type Claim = Record<string, any>;

/** Only index supplied events. A shared activity, social circle or ongoing consequence confers no access. */
export function hearingKnowledge(events: WorldEvent[], knowledge: Knowledge[]) {
  const rights = new Map<string, Map<string, Access>>();
  function grant(eventId: string, personId: string, access: Access) {
    const people = rights.get(eventId) ?? new Map<string, Access>();
    if (people.get(personId) !== 'direct') people.set(personId, access);
    rights.set(eventId, people);
  }
  const restricted=new Set<string>();
  function register(event:WorldEvent) {
    if(event.visibility==='private'||event.participantIds.length===1||privateProse.test(event.description)) restricted.add(event.id);
    if(!event.correction) for(const id of event.participantIds) grant(event.id,id,'direct');
  }
  const byId = new Map(events.map(event => [event.id, event]));
  events.forEach(register);
  for (const item of knowledge) {
    const event = byId.get(item.eventId);
    if (!event) continue;
    const classification = classifyKnowledge(item, event);
    if (classification === 'invalidated') { rights.get(event.id)?.delete(item.personId); continue; }
    // For an outside recipient the recorded reason describes what actually reached them.
    if (classification === 'retained-report') rights.get(event.id)?.delete(item.personId);
    grant(event.id, item.personId, classification === 'fact' && event.participantIds.includes(item.personId) ? 'direct' : 'report');
  }
  return {
    grant, register,
    views() {
      const rows = new Map<string, {personId:string; direct:string[]; report:string[]}>();
      for (const [eventId, people] of rights) for (const [personId, access] of people) {
        const row = rows.get(personId) ?? {personId, direct:[], report:[]};
        row[access].push(eventId);
        rows.set(personId, row);
      }
      return [...rows.values()];
    },
    permits(row: Claim, actors: string[], refs: Map<string,string>) {
      // An explicit private cause still has to be attributable when an older-style reply omits usesKnowledge.
      for(const link of list(row.eventLinks)) {
        const id=refs.get(link.eventId)??link.eventId;
        if(link.kind!=='caused-by'||!restricted.has(id))continue;
        const named=Array.isArray(row.usesKnowledge)&&row.usesKnowledge.some((use:Claim|null)=>use&&(refs.get(use.eventId)??use.eventId)===id);
        if(!named && (!actors.length||!actors.every(actor=>rights.get(id)?.get(actor)==='direct'))) return false;
      }
      if (row.usesKnowledge === undefined) return true;
      return Array.isArray(row.usesKnowledge) && row.usesKnowledge.every((use: Claim | null) => {
        if (!use || !actors.includes(use.personId)) return false;
        const access = rights.get(refs.get(use.eventId) ?? use.eventId)?.get(use.personId);
        return access === 'direct' || access === 'report' && use.as === 'report';
      });
    },
  };
}
