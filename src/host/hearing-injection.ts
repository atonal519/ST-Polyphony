import type {WorldSnapshot} from '../domain/world';
import {mentionsName, narrativeEvidence, normalizedMention, readPublicCue, uniqueStoryNames} from '../simulation/story-evidence';
import {getHostContext} from './host-context';
import {currentQQJScope} from '../sources/qqj-readiness';

const slot = 'st-polyphony-hearing';
const hook = 'polyphony_hearing_interceptor';
type Floor = {mes?:string; is_system?:boolean; index?:number};

/** The prompt uses only a relevant public detail from the latest progress of each open line. */
export function hearingScenePrompt(world:WorldSnapshot, scene:string, throughSeq:number):string {
  if (!scene || !world.lastHearingWindow) return '';
  const windows=(world.simulationRanges??[]).filter(row=>!row.purpose&&!row.referenceSources);
  const latest=windows.at(-1);
  if (!latest || latest.id!==world.lastHearingWindow.id || latest.throughSeq>throughSeq) return '';
  const recent=new Map(windows.slice(-3).map((row,index)=>[row.id,index]));
  const names=uniqueStoryNames(world.people.map(person=>({id:person.id,names:[person.name,...(person.aliases??[])]})));
  const text=normalizedMention(scene);
  const relevant=new Set([...names].filter(([name,id])=>id&&mentionsName(text,name)).map(([,id])=>id));
  if (!relevant.size) return '';
  const open=new Map(world.activities.filter(row=>row.status!=='completed').map(row=>[row.id,row]));
  const seen=new Set<string>(), cues=new Set<string>();
  for (let i=world.events.length-1;i>=Math.max(0,world.events.length-80)&&cues.size<2;i--) {
    const event=world.events[i], activity=event.activityId&&open.get(event.activityId);
    if (!activity||seen.has(activity.id)) continue;
    seen.add(activity.id);
    const when=recent.get(event.simulationWindowId??'');
    const checkpoint=recent.get(activity.currentStateWindowId??'');
    if (event.correction || when===undefined || checkpoint!==undefined && checkpoint>when ||
        !event.participantIds.some(id=>relevant.has(id))) continue;
    const cue=readPublicCue(event);
    if(cue&&!text.includes(normalizedMention(cue))) cues.add(cue);
  }
  return cues.size?'场外近况（可选）。仅在眼前场景自然碰上时描写可见迹象，人物需亲自看见或听说才知情。\n'+[...cues].join('\n'):'';
}

export function installHearingInjection(options:{
  enabled:()=>boolean; world:()=>WorldSnapshot; refresh:()=>Promise<void>; scope?:()=>string|null;
},getContext=getHostContext, globals=globalThis as unknown as Record<string,unknown>) {
  const scope=options.scope??currentQQJScope;
  const context=getContext();
  const bus=context?.eventSource as {on?:(e:string,f:()=>void)=>void;removeListener?:(e:string,f:()=>void)=>void;off?:(e:string,f:()=>void)=>void}|undefined;
  const types=(context?.eventTypes??context?.event_types) as Record<string,string>|undefined;
  let epoch=0, active=false;
  function clear() {
    epoch++;
    if(!active) return;
    active=false;
    const host=getContext();
    if(typeof host?.setExtensionPrompt==='function') host.setExtensionPrompt(slot,'',1,1,false,0);
  }
  async function intercept(chat:Floor[],_size:unknown,_abort:unknown,type='normal') {
    clear();
    const token=epoch;
    if(!['normal','regenerate','swipe','continue','group_chat'].includes(type)||!options.enabled()||!Array.isArray(chat)) return;
    const host=getContext(), current=scope();
    if(!current||typeof host?.setExtensionPrompt!=='function'||!Array.isArray(host.chat))return;
    const tail=chat.filter(row=>row&&!row.is_system&&typeof row.mes==='string').slice(-2);
    const scene=tail.map(row=>narrativeEvidence(row.mes!).slice(-1600)).join('\n');
    if(!scene.trim())return;
    const lastIndex=tail.at(-1)?.index;
    const throughSeq=Number.isSafeInteger(lastIndex)?Math.min(host.chat.length,lastIndex!+1):host.chat.length-(type==='swipe'?1:0);
    if(options.world().id!==current)await options.refresh();
    const world=options.world();
    if(token!==epoch||world.id!==current||scope()!==current||!options.enabled())return;
    const prompt=hearingScenePrompt(world,scene,throughSeq);
    if(!prompt)return;
    host.setExtensionPrompt(slot,prompt,1,1,false,0,()=>epoch===token&&options.enabled()&&scope()===current);
    active=true;
  }
  globals[hook]=intercept;
  const cleanupEvents=['CHAT_CHANGED','GENERATION_STARTED','GENERATION_ENDED','GENERATION_STOPPED'].map(key=>types?.[key]).filter((e):e is string=>!!e);
  for(const event of cleanupEvents)bus?.on?.(event,clear);
  return {clear,dispose(){
    clear();
    if(globals[hook]===intercept)delete globals[hook];
    for(const event of cleanupEvents)(bus?.removeListener??bus?.off)?.call(bus,event,clear);
  }};
}
