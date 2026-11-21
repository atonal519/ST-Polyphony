import {emotionGuidance} from '../domain/emotion';
import {collectLifeMaterials} from './life-materials';
import {mergeLifeRhythm} from './life-rhythm';
import {readStoryClock,normalizeStoryTime,storyMinutes} from '../host/story-clock';
import type { AdvanceDependencies, StoryInput,WorldSettings } from '../application/contracts';
import type { SourcePerson } from '../domain/source-people';
import {recordBody} from '../domain/world';
import type { Activity, Knowledge, SimulationWindow, SourceRef, WorldEvent } from '../domain/world';
import type { NpcWorldState } from '../domain/world-state';
import {discardInvalidAtmospheres} from '../domain/world-state';
import {selectCreativeFrame,type CreativeFrame} from './creative-frame';
import {developmentGate} from './life-rhythm';
import { activityChange, applyCalibration, eligibleCalibration, InvalidCalibrationCorrection, modelReferenceContract, type Calibration, type CalibrationRejection } from './calibration';
import { asObject, list, newId, responseObject, savedEndpoint, savedStoryClock, boundaryClock, strings } from './trajectory';
import { factEvidenceKind, historyFactSeqs } from './fact-sources';
import { developmentBoundary, type BoundaryRejection, type SceneStage } from './stage-boundary';
import {recordDiagnostic,diagnosticError,type DiagnosticTrace} from '../diagnostics/development';
import {selectWorldMemory,selectFlowMemory,type SuppliedMemory} from './world-memory';
import {applyFoundation,FOUNDATION_CONTRACT,needsFoundationSupplement} from './foundation';
import {encodePersonReferences} from '../models/person-references';
import {selectFlowFocus,type FlowFocus} from './flow-focus';
import {focusCircles,focusAtmospheres,flowFoundation,flowPeople,circleEmotionContext,shortText} from './flow-context';
import {returnedIdentity} from './returned-identity';
import {drawAngles} from '../vendor/gouhua-vectors/draw';
import {JSON_OUTPUT_RULES} from './json';

export const DEVELOPMENT_INSTRUCTIONS = `你负责共同创作“听”的参考性场外NPC日常。narrativeRoles按本批末尾已识别的镜头归属提供候选。从narrativeRoles.autonomous优先挑选能在镜头外行动的人。storyControlled里的在场人物按正文同步，回顾他们已有明确离场的时段时用对应的场段。若没有可写的场外变化，给出quietReason。优先想一件本人在镜头外会主动发起、有来由的新目标、新机遇或关系动作。用他的职责、兴趣、承诺、日程和已有结果发散，用具体细节写清他怎么选、做了什么、有什么结果。可以独自试一个办法、做一件小企划、遇见新的人，或利用资源和环境的变化。有自然交集时可以几人同行。旧事在等或在办的人也有自己的另一段生活。
creativeAngles里的短语只是给相应人物的创作素材。可择用、组合或跳过，没抽到的人也照场景取材。角度不提供已发生的事实、参与资格或知情。candidates.storyMentions供定位正文，openMatterIds是碰到同一事项的取材线索；提名不表示在场、关系成立或已经行动。沿用已有作息，休息、等候和零新增都可以。人物目录供引用，正文校准照实同步。
有可读进展的独立新事可写activities和关联events，有意思的可走几步或留可延续的下一步，纯过场只写event。completed表示整条事项已经收束，当窗结清的独立短事也可用。只完成一个步骤时，经过和结果写进event.description，沿原活动ID继续推进或等下一步，保持active/waiting。按目的和对象分辨新旧，修邻居的门与自家窗帘是独立的事。同一笔房租、同一件事换工位或换视角仍沿已有ID。核对最新进展，有新的可行动条件、实际决定或自然变化才返回旧事项续进或结清。只提到某人、同义换词、再查看、例行等待时保留旧现状。不因换参与者、称呼或等待视角另建，参与者进出不自动结束事项。共同经历只记一次，保实际参与人。只发展已过去的时段，未来约定只写事项计划，无可信耗时不猜日期或提前办完。重大冲突和关键世界变化依正文，不从小事或创作角度硬推。
已完成的旧事项只供理解来龙去脉，不在自主推进里续写或改回未完成。正文明确补充旧事时用calibration同步，之后出现的新目标可以另起新线。
承接已接纳atmospheres与circleEmotions，不另评风向。按emotionGuidance承接当前强弱，已缓和的情绪不按旧措辞升级。风向、人物长档和QQJ材料不授予人物知情；各人只按实际获知及途径行动，retained-report只是收到过的旧说法。正文中的草稿、注释、图片包装不是已发生事实。
stages有序，每项{key,sourceSeqs,onstagePersonIds,offstagePersonIds}，可同楼分段。从previousOnstagePersonIds承接，正文明确离场或镜头交接才解除，重入场交回正文；未提及或他人入场不解除原在场者。cameraPersonIds不能解除；user始终不自主。只从sourceContract.storySeqs引用楼号，calibrationEligible=false仅供时间参考，不能据此变更镜头归属或正文事实。在场者和user的未给行动、回应、缺席、去向保持未决，不编转述或目击替其定案。
有referenceStages时，按同一批正文的场段逐字引用既有key，可省略stages。若需调整场段或补入新场段，返回所有用到的完整stages并按全文的出入场顺序排列。
只返回JSON增量。描述内的引语用中文引号。activities、events、knowledge、continuingEffects各项必有stageKey、assertedPersonIds和assertsUser（布尔），断言涵盖直接与间接受影响的人。每个stageKey引用本轮实际场段。activities用id或新key、description、status、participantIds，状态planned/active/waiting/completed，description写终点情况、结果和具体下一步。
events用key、description、participantIds和可空activityId，依发生顺序；事项与经历直接写正文，不返回title，经历可以多段。event.storyTime仅写已经发生且有据的时间，不超过currentClock，eventLinks的continues与caused-by区别开，event.activityChange只记当时的实际变化，不能塞回终点概况。knowledge用personId/eventId/reason，continuingEffects用eventId/personIds。人物只用输入P代号或已声明新人物key；旧活动、经历用实际给过的ID，新记录只用本答有效key。storyTime用text/sourceSeqs/elapsed，保原精度。新作息仅有依据时回routines:{personId,activeHours,tentative,basis}数组，activeHours为0–24时段，可跨夜；arrangements:{personId,kind:"active|rest",from,to,sourceSeqs}数组只同步正式正文明确的临时安排。无变化可省，平静给具体quietReason。
calibration只同步正文事实，四组按需返回：facts新项{key,description,participantIds,sourceSeqs,storyTime可选,activityId可选}，既有只用sourceContract.factIds中的id；activityUpdates:{id或新key,change:{description,status,participantIds},sourceSeqs}。正文明确推进或结清原事项时，facts写一次已发生结果，只通过facts的activityId标明所属事项，填本次activities已给的旧ID或本答确实成立的事项key。只连处理同一件事的事实。同人、同楼只是候选；一楼可以有多条事实。例：「甲交货，乙邀甲入队」拆两条：交货挂原交货ID，邀入队另写一条并省略activityId。facts的participantIds只列该条事实的直接当事人；同一事项若有新增直接当事人，在同源activityUpdates的change.participantIds明确纳入。activityUpdates的change.description只写该事项的现况。未兑现的计划只写事项，不写facts或events，也不自动知情。包括在场者和user已确定的事，只涉未登记user时显式participantIds:[]。新事实引用sourceContract.calibrationSeqs的正式楼号；已有事项还可引用已给正文事实的原楼号。eventCorrections:{eventId,byEventId,reason}只修已被推翻的旧事，byEventId取已给正文事实id或本答facts.key；旧事的每位已有知情者需给knowledgeCorrections:{personId,eventId,byEventId,treatment:"invalidated|retained-report",reason}，保实际收到过的说法，不替人物获取新事实。人工与合格正文不可覆盖，创作进展不用calibration。不要重述输入或索要新请求。`;

export interface DevelopmentInput { people: SourcePerson[]; state: NpcWorldState; story: StoryInput; initial: boolean; cameraPersonIds?: string[]; diagnostic?:DiagnosticTrace }
/** A rebuilt current baseline may refer to older stable prose without moving the existing world back. */
export const processedCurrentReference=(input:DevelopmentInput)=>input.initial&&input.state.processedThroughSeq!==null&&(input.story.throughSeq===null||input.story.throughSeq<=input.state.processedThroughSeq);
export const developmentClock=(input:DevelopmentInput)=>processedCurrentReference(input)?input.state.storyTime?.text??null:readStoryClock(input.story.turns);
export interface DevelopmentResult { state: NpcWorldState; window: SimulationWindow; addedEvents: number; addedKnowledge: number; changedActivities: number; boundaryRejections: BoundaryRejection[]; calibrationRejections:CalibrationRejection[]; acceptedWork:number; submittedWork:number; noNewWork:boolean }
export interface DevelopmentPreparation {materials:Awaited<ReturnType<typeof collectLifeMaterials>>['materials'];materialPersonIds?:string[];worldSettings?:WorldSettings;currentClock:string|null;creativeFrame:CreativeFrame;narrativeRoles:{storyControlled:Array<{personId:string;name:string}>;autonomous:Array<{personId:string;name:string}>;policy:string};restHint:ReturnType<typeof developmentGate>;focus?:FlowFocus;referenceStages?:SceneStage[]}
export function rebaseDevelopmentPreparation(input:DevelopmentInput,prepared:DevelopmentPreparation):DevelopmentPreparation {
 if(prepared.referenceStages?.length){
  const {onstagePersonIds}=developmentBoundary(input,{stages:prepared.referenceStages});
  // Only the request's candidate selection uses this projection. The durable boundary still uses the original story and stages.
  input={...input,state:{...input.state,developmentOnstagePersonIds:onstagePersonIds}};
 }
 if(!prepared.focus)return withDevelopmentRoles(input,prepared);
 const savedTaste=input.state.simulationRanges?.at(-1);
 const floors=new Set(input.story.turns.filter(turn=>turn.calibrationEligible!==false&&turn.seq>(input.state.processedThroughSeq??0)).map(turn=>'history-floor:'+turn.seq));
 // A formal name learned in this taste ACK helps match this batch, without overriding QQJ's aliases.
 const aliases=new Map(savedTaste?.referenceSources&&savedTaste.throughSeq===input.story.throughSeq
   ? (input.state.foundation?.people??[]).filter(row=>row.currentStateWindowId===savedTaste.id&&row.sources.some(source=>source.kind==='chat'&&floors.has(source.id))).map(row=>[row.id,row.aliases] as const)
   : []);
 const matching=input.people.map(person=>aliases.has(person.id)?{...person,aliases:[...person.aliases,...aliases.get(person.id)!]}:person);
 const focus=selectFlowFocus(matching,input.state,input.story.turns,prepared.currentClock,input.cameraPersonIds);
 const ids=new Set(focus.personIds);
 const materials=prepared.materials.map(batch=>({...batch,materials:batch.materials.filter(row=>ids.has(row.personId))}));
 return withDevelopmentRoles(input,{...prepared,focus,materials});
}
function withDevelopmentRoles(input:DevelopmentInput,prepared:DevelopmentPreparation):DevelopmentPreparation {
 const controlled=new Set([...(input.state.developmentOnstagePersonIds??[]),...(input.cameraPersonIds??[]),...input.people.filter(person=>person.specialRole==='user').map(person=>person.id)]);
 const focused=prepared.focus&&new Set(prepared.focus.personIds);
 const roles=(predicate:(person:SourcePerson)=>boolean)=>input.people.filter(predicate).map(person=>({personId:person.id,name:person.displayName}));
 return {...prepared,narrativeRoles:{storyControlled:roles(person=>controlled.has(person.id)),autonomous:roles(person=>!controlled.has(person.id)&&(!focused||focused.has(person.id))),policy:prepared.narrativeRoles.policy},restHint:input.initial?{generate:true,reason:'initial'}:developmentGate(input.state,input.people.filter(person=>!focused||focused.has(person.id)),prepared.currentClock)};
}
const manual = (value: { sources: Array<{kind: string}> }) => value.sources.some(source => source.kind === 'manual');
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function unchangedActivityReference(row:Record<string,any>,old:Activity,ids:Set<string>,change:ReturnType<typeof activityChange>) {
 if(row.id!==old.id||row.assertsUser!==false||!Array.isArray(row.assertedPersonIds)||row.assertedPersonIds.some((id:unknown)=>typeof id!=='string'||!old.participantIds.includes(id)))return false;
 for(const field of ['description'])if(Object.hasOwn(row,field)&&(typeof row[field]!=='string'||!row[field].trim()))return false;
 if(Object.hasOwn(row,'status')&&!['planned','active','waiting','completed'].includes(row.status))return false;
 for(const field of ['participantIds','personIds'])if(Object.hasOwn(row,field)&&(!Array.isArray(row[field])||row[field].some((id:unknown)=>typeof id!=='string'||!ids.has(id))))return false;
 return equal({...old,...change},old);
}

export async function prepareDevelopment(input:DevelopmentInput & {dependencies:AdvanceDependencies;worldSettings?:WorldSettings;prepared?:DevelopmentPreparation;signal?:AbortSignal;diagnostic?:DiagnosticTrace}):Promise<DevelopmentPreparation> {
  input.signal?.throwIfAborted();
  const currentClock=developmentClock(input);
  const afterConstruction=input.initial&&input.prepared&&!input.prepared.focus;
  const focus=input.state.foundation&&!afterConstruction?selectFlowFocus(input.people,input.state,input.story.turns,currentClock,input.cameraPersonIds):undefined;
  const needReferences=!focus&&needsFoundationSupplement(input.people,input.state);
  let worldSettings=needReferences?input.worldSettings:undefined;
  if(needReferences&&!worldSettings&&input.dependencies.worldSettings)try{worldSettings=await input.dependencies.worldSettings.read();}catch{worldSettings={characterDescription:'',books:[],partial:true};}
  input.signal?.throwIfAborted();
  const focused=focus&&new Set(focus.personIds),supplied=new Set(input.prepared?.materialPersonIds);
  const pending=input.people.filter(person=>(!focused||focused.has(person.id))&&!supplied.has(person.id));
  const collected=await collectLifeMaterials(pending,input.state,input.dependencies.materials,input.story.throughSeq,{focusActivityIds:focus?.mentionedActivityIds,turns:input.story.turns});
  const materials=[...(input.prepared?.materials??[]),...collected.materials].map(batch=>focused?{...batch,materials:batch.materials.filter(row=>focused.has(row.personId))}:batch);
  recordDiagnostic(input.diagnostic,'materials-read',{materialReads:collected.readCount,materialCharacters:collected.characters,requestedCharacters:collected.requestedCharacters,throughSeq:input.story.throughSeq,candidatePeople:focus?.personIds.length,candidateActivities:focus?.activityIds.length});
  input.signal?.throwIfAborted();
  return withDevelopmentRoles(input,{materials,materialPersonIds:[...supplied,...pending.map(person=>person.id)],worldSettings,currentClock,focus,creativeFrame:selectCreativeFrame(input.state.scopeId,currentClock,input.state.developmentCreativeFrame),narrativeRoles:{storyControlled:[],autonomous:[],policy:'自主候选供择机，提名不表示在场。依本批正文声明stages，未明确离场不解除，user不自主。'},restHint:{generate:true,reason:'preparation'}});
}

function hearingSelection(input:DevelopmentInput,prepared:DevelopmentPreparation) {
  const {focus,worldSettings}=prepared;
  const circles=focus?focusCircles(input.people,input.state,focus):undefined;
  const memory:SuppliedMemory&{personContexts?:unknown}=focus?selectFlowMemory(input.state,focus,circles!):selectWorldMemory(input.people,input.state);
  const foundation=flowFoundation(input,{focus,worldSettings,events:memory.events,circles});
  return {circles,memory,foundation};
}

export function developmentContext(input:DevelopmentInput,prepared:DevelopmentPreparation,options:{view?:ReturnType<typeof hearingSelection>;construction?:boolean}={}) {
  const {materials,worldSettings,focus}=prepared;
  const view=options.view??hearingSelection(input,prepared);
  const {memory,circles,foundation:{sources:_,...foundation}}=view;
  const atmospheres=focusAtmospheres(input.people,input.state,circles);
  const circleEmotions=circleEmotionContext(atmospheres),focusIds=focus&&new Set(focus.personIds);
  const selectedIds=new Set(memory.events.map(row=>row.id));
  const latestProgress=new Map<string,WorldEvent>();
  for(const event of memory.events)if(event.activityId&&!event.correction)latestProgress.set(event.activityId,event);
  const activities=focus?memory.activities.map(row=>{
    const progress=latestProgress.get(row.id);
    return {...row,description:progress&&recordBody(progress)===recordBody(row)?undefined:shortText(recordBody(row),750),...(progress?{latestEventId:progress.id}:{})};
  }):memory.activities;
  const events=memory.events.map(event=>({...event,...(focus?{description:shortText(recordBody(event),650),eventLinks:event.eventLinks?.filter(ref=>selectedIds.has(ref.eventId)),activityChange:undefined}:{}),evidenceKind:factEvidenceKind(event,input.state.scopeId)}));
  const references=modelReferenceContract(memory,input.story.turns);
  const storyControlled=new Set(prepared.narrativeRoles?.storyControlled.map(row=>row.personId));
  const creativeAngles=options.construction||input.story.throughSeq===null?[]:drawAngles(
    JSON.stringify([input.state.scopeId,input.story.throughSeq]),
    (focus?.everyday??selectFlowFocus(input.people,input.state,input.story.turns,prepared.currentClock,input.cameraPersonIds).everyday).map(row=>row.personId).filter(id=>!storyControlled.has(id)),
  );
  recordDiagnostic(input.diagnostic,'memory-selected',{selectedEvents:memory.events.length,totalEvents:input.state.events.length,selectedKnowledge:memory.knowledge.length,selectedActivities:memory.activities.length});
  return {
    initial: input.initial, throughSeq: input.story.throughSeq,
    people:flowPeople(input.people,focus),
    ...(focus?{candidates:{storyMentions:focus.mentions,openMatterIds:focus.mentionedActivityIds}}:{}),
    story: input.story.turns, previousStoryTime: input.initial?null:input.state.storyTime, currentClock:prepared.currentClock, worldSettings,
    routines:(input.state.developmentRoutines??[]).filter(row=>!focusIds||focusIds.has(row.personId)),arrangements:(input.state.developmentArrangements??[]).filter(row=>!focusIds||focusIds.has(row.personId)),
    referencePolicy:'QQJ非空人工决定与正文事实优先；有用当前字段继续参考，空或不适用的普通自动字段由同次模型对照许可卡书及已存基础选择补充，不回灌旧QQJ简介。人物资料不是历史快照或当前行动/知情证据。',
    previousOnstagePersonIds: input.state.developmentOnstagePersonIds ?? [], cameraPersonIds: input.cameraPersonIds ?? [],
    ...(prepared.referenceStages?.length?{referenceStages:prepared.referenceStages}:{}),
    activities,events,knowledge:memory.knowledge,
    circleEmotions,
    ...(options.construction?{creativeFrame:prepared.creativeFrame}:creativeAngles.length?{creativeAngles}:{}),
    atmospheres:atmospheres.map(({visual,...semantic})=>({...semantic,...(semantic.emotion?{emotionGuidance:emotionGuidance(semantic.emotion)}:{})})),narrativeRoles:prepared.narrativeRoles,restHint:prepared.restHint,
    ...foundation,materials,
    ...(focus?{sourceContract:{storySeqs:references.sourceContract.storySeqs,calibrationSeqs:references.sourceContract.calibrationSeqs,factIds:references.sourceContract.factIds}}:{personContexts:memory.personContexts,...references}),
  };
}

export async function generateDevelopment(input: DevelopmentInput & { dependencies: AdvanceDependencies; prepared?:DevelopmentPreparation;signal?: AbortSignal; onStarted?: () => void; diagnostic?:DiagnosticTrace }): Promise<DevelopmentResult> {
  input.signal?.throwIfAborted();
  const prepared=input.prepared??await prepareDevelopment(input);
  const view=hearingSelection(input,prepared);
  const instructions=DEVELOPMENT_INSTRUCTIONS+'\n'+FOUNDATION_CONTRACT+`
同答foundation.groups/relations可引用已接纳event key。从实际行动结果判断成员与关系变化，不为造圈另创行动。eventLinks须是有据延续或因果，不由同人、时间相邻推原因。
${JSON_OUTPUT_RULES}
顶层结构如下。无条目的数组用 []。已有场段可直接引用，此时 stages 用 []。确实没有可写的场外变化时给出具体的 quietReason。
{"stages":[],"activities":[],"events":[],"knowledge":[],"continuingEffects":[],"foundation":{"people":[],"groups":[],"relations":[]},"calibration":{"facts":[],"activityUpdates":[],"eventCorrections":[],"knowledgeCorrections":[]},"quietReason":""}
返回前核对每条事务与经历。旧条目用输入给出的 id，新条目用本答唯一的 key。events.activityId 只填已给的旧事务 id、本答新事务的 key 或 null。每条新行动及其知情、后续影响都给有效的 stageKey、assertedPersonIds 和布尔 assertsUser。只保留可确认的人物与引用。`;
  const response = await input.dependencies.model.request({ task: 'development', instructions, signal: input.signal, onStarted: input.onStarted, input:developmentContext(input,prepared,{view}) });
  input.signal?.throwIfAborted();
  recordDiagnostic(input.diagnostic,'apply-started');
  try{const result=applyDevelopment(input,response,{memory:view.memory,sources:prepared.focus?view.foundation.sources:undefined,referenceStages:prepared.referenceStages});recordDiagnostic(input.diagnostic,'applied',()=>({addedEvents:result.addedEvents,addedKnowledge:result.addedKnowledge,changedActivities:result.changedActivities,acceptedWork:result.acceptedWork,submittedWork:result.submittedWork,calibrationRejections:result.calibrationRejections.slice(0,24),boundaryRejections:result.boundaryRejections.slice(0,24),boundaryRejectionCount:result.boundaryRejections.length}));return result;}
  catch(error){recordDiagnostic(input.diagnostic,'apply-failed',diagnosticError(error));throw error;}
}

function reuseReferenceStages(input: DevelopmentInput, data: Record<string, any>, stages?: SceneStage[]) {
  if (!stages?.length || data.stages != null && !(Array.isArray(data.stages) && !data.stages.length)) return data;
  const [stage] = stages;
  if (stages.length === 1 && !stage.offstagePersonIds.length) {
    const official = input.story.turns.filter(turn => !turn.isUser && turn.calibrationEligible !== false);
    const foundation = asObject(data.foundation);
    const rows = [data.activities, data.events ?? data.results, data.knowledge, data.continuingEffects, foundation?.people, foundation?.groups, foundation?.relations];
    const keys = new Set(rows.flatMap(list).map(row => row.stageKey).filter(key => typeof key === 'string' && key.trim()));
    // An undeclared key can refer to the sole stage only if it spans this whole batch and releases nobody.
    if (keys.size === 1 && !keys.has(stage.key) && official.length && official.every(turn => stage.sourceSeqs.includes(turn.seq))) {
      const [key] = keys;
      return { ...data, stages: [{ ...stage, key }] };
    }
  }
  return { ...data, stages };
}

function normalizeLocalActivityIds(activities:Record<string,any>[],events:Record<string,any>[],savedIds:Set<string>,calibration:unknown) {
  const linked=new Set(events.map(row=>row.activityId??row.activityRef??row.activityKey));
  const claims=new Map<string,number>();
  for(const row of [...activities,...list(calibration)]) {
    for(const ref of new Set([row.id,row.key]))if(typeof ref==='string')claims.set(ref.trim(),(claims.get(ref.trim())??0)+1);
  }
  return activities.map(row=>{
    const {id,...rest}=row;
    if(typeof id!=='string'||!id||Object.hasOwn(row,'key')||savedIds.has(id.trim())||claims.get(id.trim())!==1||!linked.has(id))return row;
    // A persisted ID can identify unavailable or deleted work. Only a linked, unique local declaration is repairable.
    if(/^bmx-\d+-|^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id.trim()))return row;
    return {...rest,key:id};
  });
}

export function applyDevelopment(input: DevelopmentInput, response: unknown, selection?:{memory:SuppliedMemory;sources?:Map<string,SourceRef>;referenceStages?:SceneStage[]}): DevelopmentResult {
  const suppliedMemory=selection?.memory??selectWorldMemory(input.people,input.state),initialFoundation=input.state.foundation;
  const suppliedEvents=new Set(suppliedMemory.events.map(event=>event.id));
  const existingEventIds=new Set(input.state.events.map(event=>event.id));
  const suppliedActivities=selection?.sources&&new Set(suppliedMemory.activities.map(activity=>activity.id));
  const availableEvent=(id:string)=>!selection?.sources||suppliedEvents.has(id)||!existingEventIds.has(id);
  const outer = responseObject(response); let data = asObject(outer.development) ?? outer;
  if (!['foundation','activities','events','results','knowledge','continuingEffects','calibration','routines','arrangements','quietReason'].some(key => Object.hasOwn(data, key))) throw new Error('人物发展结果无法读取，请重新更新。');
  data = reuseReferenceStages(input, data, selection?.referenceStages);
  let ids = new Set(input.people.map(person => person.id));
  let boundary = developmentBoundary(input, data);
  const seqs = new Set(input.story.turns.filter(turn=>turn.calibrationEligible!==false).map(turn => turn.seq));
  const endpoint = asObject(data.windowEnd ?? data.storyTime);
  let text = typeof endpoint?.text === 'string' ? normalizeStoryTime(endpoint.text.trim()) : '';
  let sources = Array.isArray(endpoint?.sourceSeqs) ? endpoint.sourceSeqs : [];
  const oldEnd = savedEndpoint(input.state);
  const previousClock = savedStoryClock(input.state);
  const fromClock = oldEnd?.sourceSeqs.length ? boundaryClock(oldEnd.text) : null;
  const clockFloor = input.story.turns.filter(turn=>!turn.isUser).at(-1);
  let from = oldEnd ? {...oldEnd,text:fromClock??oldEnd.text} : {id:newId(),text:previousClock??input.state.storyTime?.text??'当前起点',sourceSeqs:input.story.turns.map(turn=>turn.seq)};
  let validEnd = Boolean(text && (text === input.state.storyTime?.text || sources.length > 0 && sources.every((seq: number) => seqs.has(seq))));
  const currentClock=developmentClock(input),referenceCurrent=processedCurrentReference(input);
  const formalClock=!referenceCurrent&&clockFloor&&(input.initial||clockFloor.calibrationEligible!==false)?currentClock:null;
  const cutoff=storyMinutes(formalClock);
  const knownStart=[storyMinutes(previousClock),storyMinutes(fromClock)].filter((time):time is number=>time!==null);
  const previous=knownStart.length?Math.max(...knownStart):null;
  const olderClock=cutoff!==null&&previous!==null&&cutoff<previous;
  if(referenceCurrent){text=currentClock??'';sources=oldEnd?.sourceSeqs??[];validEnd=Boolean(text);}
  else if(formalClock){text=formalClock;sources=[clockFloor!.seq];validEnd=!olderClock;}
  // The first flow refines the baseline's same instant.
  const baselineCurrent=input.initial&&input.state.worldBaseline?.needsCurrentDevelopment===true;
  const sameClock=cutoff!==null&&storyMinutes(from.text)===cutoff;
  const to = baselineCurrent ? validEnd ? {...from,text,sourceSeqs:[...new Set<number>(sources)]} : from : input.initial&&!validEnd ? {id:newId(),text:'当前起点',sourceSeqs:input.story.turns.map(turn=>turn.seq)} : validEnd&&text!==from.text&&!sameClock ? {id:newId(),text,sourceSeqs:[...new Set<number>(sources)]} : from;
  if(input.initial)from=to;
  const throughSeq = input.story.throughSeq;
  if (throughSeq === null) throw new Error('尚无可处理的正式正文。');
  const elapsed=formalClock?previous!==null&&cutoff!==null&&cutoff>previous:endpoint?.elapsed===true;
  const window: SimulationWindow = {id:newId(),kind:validEnd&&elapsed&&from.text!=='当前起点'&&from.id!==to.id?'elapsed':'current',from,to,throughSeq};
  const factTime=(value:unknown)=>{
    if(typeof value!=='string'||!value.trim())return null;
    const time=normalizeStoryTime(value.trim());
    const sameDay=cutoff!==null&&previous!==null&&Math.floor(cutoff/1440)===Math.floor(previous/1440);
    const date=sameDay?formalClock?.split(/[T ]/,1)[0]:undefined;
    const exact=storyMinutes(time)??(date&&/^\d{1,2}:\d{2}(?::\d{2})?$/.test(time)?storyMinutes(date+'T'+time):null);
    return cutoff!==null&&exact!==null&&exact>cutoff?null:time;
  };
  const source = {kind:'simulation' as const,id:window.id,label:from.id === to.id ? to.text : `${from.text} → ${to.text}`};
  let foundationAccepted=0,foundationSubmitted=0;
  const graph=asObject(data.foundation);
  if(graph&&list(graph.people).length) {
    const built=applyFoundation(input,{people:graph.people,groups:[],relations:[]},window,{eventIds:suppliedEvents,suppliedSources:selection?.sources,allows:(row,ids)=>boundary.allows(row,ids,'person',true)});
    foundationAccepted=built.accepted;
    foundationSubmitted=built.submitted;
    if(built.accepted)input={...input,people:built.people,state:{...input.state,foundation:built.foundation}};
    data=encodePersonReferences(data,built.refs) as typeof data;
    ids=new Set(input.people.map(person=>person.id));
    boundary=developmentBoundary(input,data,built.refs);
  }
  const rawCalibration=asObject(data.calibration),knownActivityIds=new Set(input.state.activities.map(row=>row.id));
  const creativeEvents=list(data.events??data.results),rawFacts=list(rawCalibration?.facts);
  const eventKeys=new Set<string>(),ambiguousEventKeys=new Set<string>();
  const eventKey=(row:Record<string,any>)=>typeof row.key==='string'?row.key.trim():'';
  for(const row of [...creativeEvents,...rawFacts]){
    const key=eventKey(row);if(!key)continue;
    if(eventKeys.has(key))ambiguousEventKeys.add(key);
    eventKeys.add(key);
  }
  if(ambiguousEventKeys.size)recordDiagnostic(input.diagnostic,'event-keys-rejected',{reason:'duplicate-event-key',submittedWork:ambiguousEventKeys.size});
  const creativeActivities=normalizeLocalActivityIds(list(data.activities),creativeEvents,knownActivityIds,rawCalibration?.activityUpdates);
  const resultTables=[data.activities,data.events??data.results,data.knowledge,data.continuingEffects];
  // Normalize the complete correction dependency set before facts and their consumers are applied.
  const calibration=rawCalibration?eligibleCalibration({
    facts:rawFacts.filter(row=>!ambiguousEventKeys.has(eventKey(row))&&(!row.id||availableEvent(row.id))),
    eventCorrections:list(rawCalibration.eventCorrections).filter(row=>availableEvent(row.eventId)&&availableEvent(row.byEventId)),
    activityUpdates:list(rawCalibration.activityUpdates).map(row=>returnedIdentity(row,knownActivityIds)??row).filter(row=>!row.id||!suppliedActivities||suppliedActivities.has(row.id)),
    knowledgeCorrections:list(rawCalibration.knowledgeCorrections).filter(row=>availableEvent(row.eventId)&&availableEvent(row.byEventId)),
  } as Calibration,input.story.turns,input.state.knowledge):null;
  let acceptedWork=foundationAccepted;
  const calibrationRejections:CalibrationRejection[]=[];
  let submittedWork=foundationSubmitted+resultTables.reduce((sum,value)=>sum+list(value).length,0)+['facts','eventCorrections','activityUpdates','knowledgeCorrections'].reduce((sum,key)=>sum+list(rawCalibration?.[key]).length,0);
  const activityRefs = new Map<string,string>(); const eventRefs = new Map<string,string>();
  // Establish only sourced factual identities before creative rows refer to them; final calibration still wins.
  const candidates = list(calibration?.activityUpdates).filter(item => !Object.hasOwn(item,'id'));
  const activityKeyCounts = new Map<string,number>();
  for(const item of candidates) if(typeof item.key==='string') {
    const key=item.key.trim();
    activityKeyCounts.set(key,(activityKeyCounts.get(key)??0)+1);
  }
  const ambiguousActivityKeys=new Set([...activityKeyCounts].filter(([,count])=>count>1).map(([key])=>key));
  const activityUpdates=list(calibration?.activityUpdates).filter(item=>typeof item.key!=='string'||!ambiguousActivityKeys.has(item.key.trim()));
  const knownActivities=activityUpdates.filter(item=>!Object.hasOwn(item,'id'));
  const authority = knownActivities.length ? applyCalibration({state:input.state,people:input.people,turns:input.story.turns,calibration:{facts:[],eventCorrections:[],knowledgeCorrections:[],activityUpdates:knownActivities},activityRefs,rejections:calibrationRejections}) : input.state;
  const knownActivityKeys = new Set(activityRefs.keys());
  const bindActivity=(key:unknown,id:string)=>{
    if(typeof key!=='string'||!key.trim())return;
    const ref=key.trim();
    if(ambiguousActivityKeys.has(ref))return;
    const bound=activityRefs.get(ref);
    if(bound&&bound!==id){
      ambiguousActivityKeys.add(ref);
      activityRefs.delete(ref);
      return;
    }
    activityRefs.set(ref,id);
  };
  const bindEvent=(key:unknown,id:string)=>{
    if(typeof key!=='string'||!key.trim())return;
    const ref=key.trim();
    eventRefs.set(ref,id);
  };
  const activities = new Map(authority.activities.map(activity=>[activity.id,activity]));
  const closed = new Set(authority.activities.filter(activity=>activity.status==='completed').map(activity=>activity.id));
  const identityParticipants = new Map(authority.activities.map(activity=>[activity.id,activity.participantIds]));
  const checkpoints = new Set<string>();
  const deferred = new Map<string,{row:Record<string,any>;participants:string[]}>();
  const eventStages = new Map<string,number>();
  const intermediateChanges = new Set<string>();
  for (const item of boundary.ordered(creativeActivities)) {
    const row=returnedIdentity(item,activities);if(!row)continue;
    const reference = typeof row.id === 'string' ? row.id.trim() : '';
    const key = typeof row.key === 'string' ? row.key.trim() : '';
    const resolved = reference ? activities.has(reference) ? reference : activityRefs.get(reference) ?? reference : knownActivityKeys.has(key) ? activityRefs.get(key) : undefined;
    const old = resolved ? activities.get(resolved) : undefined;
    if (reference && (!old||suppliedActivities&&knownActivityIds.has(old.id)&&!suppliedActivities.has(old.id))) continue;
    if (old && closed.has(old.id)) continue;
    const participants = strings(row.participantIds ?? row.personIds);
    if (participants.some(id=>!ids.has(id))) continue;
    // A rejected cutoff summary can still declare the identity used by an explicit earlier event.
    let declaredId:string|undefined;
    if(!old && boundary.index(row)!==undefined && typeof row.key==='string'&&row.key.trim()&&recordBody(row)&&participants.length&&Array.isArray(row.assertedPersonIds)&&row.assertedPersonIds.every((id:string)=>ids.has(id))&&row.assertsUser===false) {
      declaredId=newId();bindActivity(row.key,declaredId);deferred.set(declaredId,{row,participants});identityParticipants.set(declaredId,participants);
    }
    const involved=[...(old?.participantIds ?? []),...(old?identityParticipants.get(old.id)??[]:[]),...participants];
    const change = activityChange({...row,...(row.personIds ? {participantIds:participants} : {})},ids);
    // A repeated protected snapshot is only an old reference; offstage final checkpoints keep their precedence.
    if(old&&boundary.isProtected(row,involved)&&!involved.some(id=>input.people.some(person=>person.id===id&&person.specialRole==='user'))&&unchangedActivityReference(row,old,ids,change)) {bindActivity(row.key,old.id);submittedWork--;continue;}
    if (!boundary.allows(row,involved,'activity')) { if(old)bindActivity(row.key,old.id); continue; }
    if (!boundary.allows(row,involved,'activity-checkpoint',true)) {
      if(old)bindActivity(row.key,old.id);
      continue;
    }
    if (old) { acceptedWork++;bindActivity(row.key,old.id); checkpoints.add(old.id); if (manual(old)) continue; const updated={...old,...change}; if (!equal(updated,old)) activities.set(old.id,updated); }
    else {
      if (typeof row.key !== 'string' || !row.key.trim() || !recordBody(row) || !participants.length) continue;
      const id=declaredId??newId();bindActivity(row.key,id);activities.set(id,{id,description:recordBody(row),status:change.status??'planned',participantIds:participants,sources:[source]});identityParticipants.set(id,participants);checkpoints.add(id);acceptedWork++;
    }
  }
  let events: WorldEvent[] = [...authority.events]; let addedEvents=0;const newEventRows=new Map<string,Record<string,any>>(),knownEventIds=new Set(events.map(event=>event.id));
  for (const item of boundary.ordered(creativeEvents)) {
    if(ambiguousEventKeys.has(eventKey(item)))continue;
    const row=returnedIdentity(item,knownEventIds);if(!row)continue;
    if (typeof row.id==='string' && row.id.trim()) { if (availableEvent(row.id.trim())&&events.some(event=>event.id===row.id.trim())) {bindEvent(row.key,row.id.trim());submittedWork--;} continue; }
    const reference=row.activityId ?? row.activityRef ?? row.activityKey ?? null;
    const activityId=typeof reference==='string' ? activityRefs.get(reference)??reference : null;
    if (reference !== null && (!activityId || !activities.has(activityId)&&!deferred.has(activityId))) continue;
    if (activityId && closed.has(activityId)) continue;
    if (activityId&&suppliedActivities&&knownActivityIds.has(activityId)&&!suppliedActivities.has(activityId)) continue;
    if (!recordBody(row)||row.occurred===false||row.status==='planned') continue;
    const participants=strings(row.participantIds??row.personIds);if(participants.some(id=>!ids.has(id)))continue;
    let activity=activityId ? activities.get(activityId) : undefined;
    const pending=activityId?deferred.get(activityId):undefined;
    const statedChange=activityChange(row.activityChange,ids);
    if (!boundary.allows(row,[...participants,...(activity?.participantIds ?? pending?.participants ?? []),...(activityId?identityParticipants.get(activityId)??[]:[]),...(statedChange.participantIds ?? []),...strings(row.continuingForPersonIds)],'event')) continue;
    if(pending && !activity) {
      // Only an explicit first-event snapshot establishes a past activity whose cutoff summary was withheld.
      if(!statedChange.status)continue;
      activity={id:activityId!,description:recordBody(asObject(row.activityChange)??{})||recordBody(row),status:statedChange.status??'planned',participantIds:statedChange.participantIds??pending.participants,sources:[source]};
      activities.set(activity.id,activity);
    }
    const change=activity && manual(activity) ? {} : statedChange;
    const id=newId();bindEvent(row.key,id);
    const statedTime=asObject(row.storyTime)?.text??row.storyTime;
    const event:WorldEvent={id,activityId,description:recordBody(row),participantIds:participants,storyTime:{text:factTime(statedTime)??source.label,source},sources:[source],simulationWindowId:window.id,...(Object.keys(change).length?{activityChange:change}:{}),...(Array.isArray(row.continuingForPersonIds)?{continuingForPersonIds:strings(row.continuingForPersonIds).filter(id=>ids.has(id))}:{})};
    events.push(event);addedEvents++;acceptedWork++;eventStages.set(id,boundary.index(row)!);
    newEventRows.set(id,row);
    // Returning to the same final state still anchors this period after its intermediate changes.
    if(activity && checkpoints.has(activity.id) && Object.keys(change).some(key=>!equal(activity[key as keyof Activity],change[key as keyof typeof change]))) intermediateChanges.add(activity.id);
    // Explicit event changes update current state only when no separate end checkpoint was supplied.
    if(activity && !checkpoints.has(activity.id) && Object.keys(change).length) {
      const updated={...activity,...change};
      activities.set(activity.id,updated);
    }
  }
  const factActivityRefs=new Map<string,string>();
  // Accept each sourced fact once before its same-answer dependent references; corrections still apply last.
  if(calibration&&list(calibration.facts).length)events=applyCalibration({state:{...authority,activities:[...activities.values()],events},calibration:{facts:list(calibration.facts),activityUpdates:[],eventCorrections:[],knowledgeCorrections:[]} as Calibration,people:input.people,turns:input.story.turns,refs:eventRefs,authorFacts:suppliedMemory.events,factTime,rejections:calibrationRejections,onFactAccepted:(item,id)=>{if(typeof item.activityId==='string'&&item.activityId.trim())factActivityRefs.set(id,item.activityId.trim());},onAccepted:()=>{acceptedWork++;},onReference:()=>{submittedWork--;}}).events;
  const originalEvents=new Set(input.state.events.map(event=>event.id)),acceptedEvents=new Set([...suppliedEvents,...events.filter(event=>!originalEvents.has(event.id)).map(event=>event.id)]);
  for(const event of events)if(newEventRows.has(event.id)){const row=newEventRows.get(event.id)!;const links=list(row.eventLinks).flatMap(link=>{const id=eventRefs.get(link.eventId)??link.eventId;return typeof id==='string'&&id!==event.id&&acceptedEvents.has(id)&&['continues','caused-by'].includes(link.kind)?[{eventId:id,kind:link.kind as 'continues'|'caused-by'}]:[];});if(links.length)event.eventLinks=links;}
  for (const effect of boundary.ordered(data.continuingEffects)) {
    const event=events.find(event=>event.id===(eventRefs.get(effect.eventId)??effect.eventId));
    if(!event||!availableEvent(event.id)||manual(event)||!Array.isArray(effect.personIds)||effect.personIds.some((id:string)=>!ids.has(id)))continue;
    if(!boundary.acceptsEventReference(effect,eventStages.get(event.id),'continuing-effect'))continue;
    if (!boundary.allows(effect,[...(event.continuingForPersonIds ?? []),...strings(effect.personIds)],'continuing-effect',true)) continue;
    events[events.indexOf(event)]={...event,continuingForPersonIds:[...new Set<string>(effect.personIds)]};
    acceptedWork++;
  }
  const knowledge:Knowledge[]=[...authority.knowledge];let addedKnowledge=0;
  for(const row of boundary.ordered(data.knowledge)) {
    const eventId=eventRefs.get(row.eventId)??row.eventId;
    if(!ids.has(row.personId)||!availableEvent(eventId)||!events.some(event=>event.id===eventId)||typeof row.reason!=='string'||!row.reason.trim())continue;
    if(knowledge.some(item=>item.personId===row.personId&&item.eventId===eventId)){submittedWork--;continue;}
    if(!boundary.acceptsEventReference(row,eventStages.get(eventId),'knowledge')||!boundary.allows(row,[row.personId],'knowledge'))continue;
    acceptedWork++;
    knowledge.push({personId:row.personId,eventId,reason:row.reason.trim(),sources:[source]});addedKnowledge++;
  }
  // Narrative corrections are authoritative at the cutoff, after earlier offscreen changes.
  const creative={...authority,activities:[...activities.values()],events,knowledge};
  const originalActivities=new Map(input.state.activities.map(activity=>[activity.id,activity]));
  const confirmedParticipants=new Map<string,Array<{participantIds:string[];sourceSeqs:number[]}>>();
  const recordActivityParticipants=(id:string,participantIds:string[],sourceSeqs:number[])=>{
    const updates=confirmedParticipants.get(id)??[];
    updates.push({participantIds,sourceSeqs});
    confirmedParticipants.set(id,updates);
  };
  let calibrated=activityUpdates.length?applyCalibration({state:creative,calibration:{facts:[],eventCorrections:[],knowledgeCorrections:[],activityUpdates},people:input.people,turns:input.story.turns,refs:eventRefs,authorFacts:suppliedMemory.events,activityRefs,rejections:calibrationRejections,onActivityParticipants:recordActivityParticipants,onAccepted:()=>{acceptedWork++;},onReference:()=>{submittedWork--;}}):creative;
  if(calibration&&(list(calibration.eventCorrections).length||list(calibration.knowledgeCorrections).length)){
    let correctedCount=0;
    try{
      calibrated=applyCalibration({state:calibrated,calibration:{...calibration,facts:[],activityUpdates:[]},people:input.people,turns:input.story.turns,refs:eventRefs,authorFacts:suppliedMemory.events,onAccepted:()=>{correctedCount++;}});
      acceptedWork+=correctedCount;
    }catch(error){
      if(!(error instanceof InvalidCalibrationCorrection))throw error;
      recordDiagnostic(input.diagnostic,'corrections-rejected',diagnosticError(error));
    }
  }
  if(factActivityRefs.size){
    const resolvedActivities=new Set(calibrated.activities.map(activity=>activity.id));
    const suppliedFactActivities=new Set(suppliedMemory.activities.map(activity=>activity.id));
    for(const rejection of calibrationRejections)if(rejection.reason==='activity-key-conflict'&&rejection.key)ambiguousActivityKeys.add(rejection.key);
    const linked=calibrated.events.map(event=>{
      const ref=factActivityRefs.get(event.id);
      if(!ref)return event;
      const id=resolvedActivities.has(ref)?ref:ambiguousActivityKeys.has(ref)?undefined:activityRefs.get(ref);
      if(!id||!resolvedActivities.has(id)||knownActivityIds.has(id)&&!suppliedFactActivities.has(id))return event;
      // Only a same-answer participant declaration covering the fact's sources can constrain the link.
      const factSeqs=historyFactSeqs(event);
      const sameSource=confirmedParticipants.get(id)?.filter(update=>factSeqs.every(seq=>update.sourceSeqs.includes(seq)));
      if(sameSource?.length){
        const allowed=new Set([...(originalActivities.get(id)?.participantIds??[]),...sameSource.flatMap(update=>update.participantIds)]);
        if(event.participantIds.some(personId=>!allowed.has(personId)))return event;
      }
      return {...event,activityId:id,simulationWindowId:window.id};
    });
    calibrated={...calibrated,events:linked};
  }
  if(graph){const updated={...asObject(data.foundation),people:[],groups:list(asObject(data.foundation)?.groups).map(row=>({...row,basisEventIds:strings(row.basisEventIds).map(id=>eventRefs.get(id)??id)})),relations:list(asObject(data.foundation)?.relations).map(row=>({...row,basisEventIds:strings(row.basisEventIds).map(id=>eventRefs.get(id)??id)}))};const oldIds=new Set(input.state.events.map(event=>event.id));const allowedEvents=new Set([...suppliedEvents,...calibrated.events.filter(event=>!oldIds.has(event.id)).map(event=>event.id)]);const built=applyFoundation({...input,state:calibrated},updated,window,{eventIds:allowedEvents,allows:(row,ids)=>boundary.allows(row,ids,'social-change',true)});submittedWork+=built.submitted;acceptedWork+=built.accepted;if(built.accepted)calibrated={...calibrated,foundation:built.foundation};recordDiagnostic(input.diagnostic,'foundation-updated',{accepted:built.accepted,rejections:built.rejections});}
  const changed=calibrated.activities.filter(activity=>!equal(activity,originalActivities.get(activity.id)));
  const progressed=new Set(changed.filter(activity=>{
    const old=originalActivities.get(activity.id);
    return !old||activity.status!==old.status||recordBody(activity)!==recordBody(old)||!equal(activity.participantIds,old.participantIds);
  }).map(activity=>activity.id));
  const actualChange=changed.length||addedEvents||addedKnowledge||!equal(calibrated.events,input.state.events)||!equal(calibrated.knowledge,input.state.knowledge)||!equal(calibrated.foundation,initialFoundation);
  const quiet=typeof data.quietReason==='string'&&Boolean(data.quietReason.trim());
  const readable=quiet||resultTables.some(value=>Array.isArray(value)?!value.length||value.some(asObject):Boolean(asObject(value)));
  const hasNewBody=input.story.turns.some(turn=>!turn.isUser&&turn.calibrationEligible!==false&&turn.seq>(input.state.processedThroughSeq??0));
  const noNewWork=!actualChange&&!input.initial&&input.state.automaticDevelopmentEnabled===true&&readable&&hasNewBody;
  if(!actualChange&&!noNewWork&&(submittedWork>0&&acceptedWork===0 || !quiet)){
    recordDiagnostic(input.diagnostic,'work-rejected',{acceptedWork,submittedWork,calibrationRejections:calibrationRejections.slice(0,24),boundaryRejections:boundary.rejected.slice(0,24),boundaryRejectionCount:boundary.rejected.length});
    throw new Error(submittedWork?'本次返回的事务与经历未能接纳，尚未保存；可点百相流转重新更新。':'本次没有新的变化或明确平静说明，尚未保存，可点百相流转重新更新。');
  }
  const rejectedProposals=noNewWork&&acceptedWork===0&&submittedWork>0;
  if(rejectedProposals)recordDiagnostic(input.diagnostic,'no-side-story-change',{reason:'no-adoptable-proposals',throughSeq,submittedWork});
  const rhythm=rejectedProposals?{}:mergeLifeRhythm(calibrated,input.people,data,currentClock,input.story.turns,{fillMissing:!selection?.sources});
  const savedActivities=calibrated.activities.map(activity=>(progressed.has(activity.id)||intermediateChanges.has(activity.id))&&!manual(activity)?{...activity,currentStateWindowId:window.id}:activity);
  const lastHearingWindow={id:window.id,checkpointActivityIds:savedActivities.filter(activity=>activity.currentStateWindowId===window.id).map(activity=>activity.id)};
  const state:NpcWorldState={...calibrated,...rhythm,...(input.state.worldBaseline?{worldBaseline:{...input.state.worldBaseline,needsCurrentDevelopment:false}}:{}),activities:savedActivities,lastHearingWindow,processedThroughSeq:Math.max(input.state.processedThroughSeq??0,throughSeq),currentTimeStartedThroughSeq:Math.max(input.state.currentTimeStartedThroughSeq??0,throughSeq),automaticDevelopmentEnabled:true,developmentOnstagePersonIds:boundary.onstagePersonIds,simulationRanges:[...(input.state.simulationRanges??[]),window],storyTime:referenceCurrent||olderClock?input.state.storyTime:validEnd?{text:formalClock??to.text,source}:input.initial?null:input.state.storyTime};
  return{state:discardInvalidAtmospheres(state),window,addedEvents,addedKnowledge,changedActivities:changed.length,boundaryRejections:boundary.rejected,calibrationRejections,acceptedWork,submittedWork,noNewWork};
}
