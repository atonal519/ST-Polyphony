import {readonly,shallowRef} from 'vue';
import type {ConfigService,ControllerDependencies,PeopleDirectoryReader,PublicMessageRepository,QuestionMaterialReader,StoryInput} from './contracts';
import {mergeWorldPeople} from '../domain/world-foundation';
import type {WorldSnapshot} from '../domain/world';
import {defaultSmellSchedule,type PublicMessageRef,type SmellSchedule} from '../domain/public-messages';
import {beginDiagnostic,recordDiagnostic,diagnosticError} from '../diagnostics/development';
import {generatePublicMessages} from '../simulation/public-messages';
import {newId} from '../simulation/trajectory';

export interface SmellGenerationView {
  scopeId:string|null;
  refs:PublicMessageRef[];
  schedule:SmellSchedule;
  busy:boolean;
  message:string;
  error:string;
  directoryError:string;
}

interface Dependencies {
  repo:PublicMessageRepository;
  getScope():string|null;
  getSchedule(scopeId:string):SmellSchedule;
  setSchedule(scopeId:string,schedule:SmellSchedule):void;
  enabled():boolean;
  frontier(scopeId:string):number|null;
  repliesDue(scopeId:string,after:number,through:number,interval:number):boolean;
  readStory(scopeId:string,through:number):StoryInput;
  directory:PeopleDirectoryReader;
  materials:QuestionMaterialReader;
  config:Pick<ConfigService,'getProfile'>;
  createModelRequester:ControllerDependencies['createModelRequester'];
  diagnostics?:ControllerDependencies['diagnostics'];
  world():WorldSnapshot;
}

const blank=(scopeId:string|null,schedule=defaultSmellSchedule):SmellGenerationView=>({scopeId,schedule,refs:[],busy:false,message:'',error:'',directoryError:''});
const errorText=(error:unknown,fallback:string)=>error instanceof Error?error.message:fallback;

export function createSmellGeneration(input:Dependencies) {
  const view=shallowRef(blank(null));
  let loaded:string|null=null;
  let directoryRead:{scope:string;job:Promise<PublicMessageRef[]>}|undefined;
  let running:{scope:string;signal:AbortController;automatic:boolean}|undefined;
  let lastAttempt:{scope:string;through:number}|undefined;
  function select(scope:string|null){
    if(view.value.scopeId===scope)return;
    if(running&&running.scope!==scope)running.signal.abort();
    loaded=null;
    directoryRead=undefined;
    view.value=blank(scope,scope?input.getSchedule(scope):defaultSmellSchedule);
  }
  function publish(scope:string|null,diff:Partial<SmellGenerationView>){
    if(view.value.scopeId===scope)view.value={...view.value,...diff};
  }
  function readDirectory(scope:string,force=false){
    if(directoryRead?.scope===scope)return directoryRead.job;
    if(!force&&loaded===scope)return Promise.resolve(view.value.refs);
    const read=input.repo.list(scope);
    const job=read.then(({refs,complete})=>{
      if(directoryRead?.job!==job)return refs;
      const known=complete?refs:[...new Map([...view.value.refs,...refs].map(ref=>[ref.recordId,ref])).values()];
      loaded=complete?scope:null;
      publish(scope,{refs:known,directoryError:complete?'':'部分公开消息暂未读到，重新打开「嗅」可重试。'});
      return known;
    }).catch(error=>{
      if(directoryRead?.job===job){
        loaded=null;
        publish(scope,{directoryError:errorText(error,'公开消息目录暂时读不到。')});
      }
      throw error;
    }).finally(()=>{if(directoryRead?.job===job)directoryRead=undefined;});
    directoryRead={scope,job};
    return job;
  }

  async function refresh(){
    const scope=input.getScope();
    select(scope);
    if(!scope||loaded===scope||running?.scope===scope)return;
    try{await readDirectory(scope);}
    catch{/* The directory read has reported the failure in the view. */}
  }

  function changeSchedule(change:(schedule:SmellSchedule,scope:string)=>SmellSchedule){
    const scope=input.getScope();
    select(scope);
    if(!scope){publish(null,{error:'打开一个聊天并等千千结准备好后，即可设置自动更新。'});return;}
    try{
      const schedule=change(input.getSchedule(scope),scope);
      input.setSchedule(scope,schedule);
      publish(scope,{schedule,error:''});
      if(schedule.enabledAfter===null&&running?.scope===scope&&running.automatic)running.signal.abort();
    }catch(error){publish(scope,{error:errorText(error,'嗅设置保存失败。')});}
  }
  function setAutomatic(enabled:boolean){
    changeSchedule((schedule,scope)=>({...schedule,enabledAfter:enabled?input.frontier(scope)??0:null}));
  }
  function setInterval(value:number){
    changeSchedule(schedule=>{
      if(!Number.isSafeInteger(value)||value<1)throw Error('更新间隔需要填正整数。');
      return {...schedule,everyReplies:value};
    });
  }

  async function run(scope:string,through:number,automatic:boolean){
    if(running)return;
    select(scope);
    const signal=new AbortController();
    running={scope,signal,automatic};
    publish(scope,{busy:true,error:'',message:'正在准备公开消息…'});
    let diagnostic:ReturnType<typeof beginDiagnostic>;
    try{
      const refs=await readDirectory(scope,automatic).catch(()=>null);
      if(!refs){publish(scope,{message:''});return;}
      const armed=input.getSchedule(scope);
      const lastPublished=refs.reduce((max,ref)=>Math.max(max,ref.throughSeq),0);
      if(automatic&&(armed.enabledAfter===null||!input.repliesDue(scope,Math.max(armed.enabledAfter,lastPublished),through,armed.everyReplies))){
        publish(scope,{message:''});
        return;
      }
      signal.signal.throwIfAborted();
      if(input.getScope()!==scope)throw Error('聊天已切换，请在当前聊天重新新增。');
      const story=input.readStory(scope,through);
      if(story.status!=='ready'||!story.turns.some(turn=>!turn.isUser)||story.throughSeq===null){
        publish(scope,{message:'',error:'等有一楼已完成的剧情，再新增消息。'});
        return;
      }
      const people=input.directory.readPeople();
      if(people.scopeId!==scope)throw Error('等千千结准备好当前聊天，再新增消息。');
      if(automatic)lastAttempt={scope,through};
      const world=input.world();
      diagnostic=beginDiagnostic(input.diagnostics,automatic?'smell-automatic':'smell-manual',{scopeId:scope,throughSeq:through});
      publish(scope,{message:'正在生成公开消息…'});
      const entries=await generatePublicMessages({
        story,people:world.id===scope?mergeWorldPeople(people.people,world):people.people,protectedIds:world.id===scope?world.developmentOnstagePersonIds??[]:[],
        recentEvents:world.id===scope && (world.simulationRanges?.at(-1)?.throughSeq??Infinity)<=through ? world.events.slice(-40) : undefined,
        channels:[...new Set([...refs,...(world.id===scope?world.publicMessageIndex??[]:[])].map(ref=>ref.medium))],
        creativeSeed:JSON.stringify([scope,through,automatic?'automatic':newId()]),
        materials:input.materials,diagnostic,signal:signal.signal,
        model:{async request(request){
          if(input.getScope()!==scope)throw Error('聊天已切换，请在当前聊天重新新增。');
          if(!input.enabled()||automatic&&input.getSchedule(scope).enabledAfter===null)signal.abort();
          signal.signal.throwIfAborted();
          const primary=await input.config.getProfile('primary');
          signal.signal.throwIfAborted();
          if(input.getScope()!==scope)throw Error('聊天已切换，请在当前聊天重新新增。');
          return input.createModelRequester({primary,secondary:primary}).request(request);
        }},
      });
      signal.signal.throwIfAborted();
      if(input.getScope()!==scope)throw Error('聊天已切换，请在当前聊天重新新增。');
      if(!entries.length)throw Error('模型已返回，这批没有可归档的公开消息。');
      publish(scope,{message:'正在归档公开消息…'});
      let saved:PublicMessageRef[];
      try{saved=await input.repo.write(scope,{id:newId(),throughSeq:story.throughSeq},entries,diagnostic);}
      catch(error){if(loaded===scope)loaded=null;throw error;}
      const count=saved.reduce((total,ref)=>total+ref.count,0);
      recordDiagnostic(diagnostic,'smell-published',{acceptedWork:count,submittedWork:entries.length});
      if(count<entries.length&&loaded===scope)loaded=null;
      if(!count)throw Error('本批消息没有收到保存确认。重新打开嗅可以核对已归档内容。');
      publish(scope,{refs:[...refs,...saved],message:`新增 ${count} 条公开消息。`,error:count<entries.length?`已新增 ${count} 条，另有 ${entries.length-count} 条未获保存确认。`:''});
    }catch(error){
      if(!signal.signal.aborted){
        recordDiagnostic(diagnostic,'smell-failed',diagnosticError(error));
        publish(scope,{message:'',error:errorText(error,'这次公开消息更新失败。')});
      }else publish(scope,{message:''});
    }finally{
      if(running?.signal===signal){running=undefined;publish(scope,{busy:false});}
    }
  }

  async function generate(){
    if(!input.enabled()||running)return;
    const scope=input.getScope();
    select(scope);
    if(!scope){publish(null,{error:'打开一个聊天并等千千结准备好后，再新增消息。'});return;}
    const through=input.frontier(scope);
    if(through===null){publish(scope,{error:'等有一楼已完成的剧情，再新增消息。'});return;}
    await run(scope,through,false);
  }
  async function onRendered(seq:number,kind?:string){
    if(!input.enabled()||running||kind==='first_message'||kind==='swipe'||kind==='regenerate'||kind==='continue')return;
    const scope=input.getScope();
    if(!scope)return;
    const schedule=input.getSchedule(scope);
    if(schedule.enabledAfter===null)return;
    const through=input.frontier(scope);
    if(through!==seq)return;
    const latest=loaded===scope?view.value.refs.reduce((max,ref)=>Math.max(max,ref.throughSeq),0):0;
    const anchor=Math.max(schedule.enabledAfter,latest,lastAttempt?.scope===scope?lastAttempt.through:0);
    if(input.repliesDue(scope,anchor,through,schedule.everyReplies))await run(scope,through,true);
  }
  function stop(){running?.signal.abort();}
  return {view:readonly(view),syncScope:()=>select(input.getScope()),refresh,generate,setAutomatic,setInterval,onRendered,stop};
}

export type SmellGeneration=ReturnType<typeof createSmellGeneration>;
