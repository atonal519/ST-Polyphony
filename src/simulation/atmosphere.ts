import {advanceEmotion,updateEmotion,EMOTION_RULES} from '../domain/emotion';
import {applyPresentation,presentationRequests,normalizeAtmosphereVisual,PROFILE_RELATION_INSTRUCTIONS} from '../domain/presentation';
import type {AdvanceDependencies} from '../application/contracts';
import {recordBody} from '../domain/world';
import type {DevelopmentAtmosphere,SourceRef,SimulationWindow} from '../domain/world';
import {effectiveAtmospheres,type NpcWorldState} from '../domain/world-state';
import {recordDiagnostic,diagnosticError,type DiagnosticTrace} from '../diagnostics/development';
import {prepareDevelopment,type DevelopmentInput,type DevelopmentPreparation} from './development';
import {selectCreativeFrame} from './creative-frame';
import {developmentBoundary,type BoundaryRejection,type SceneStage} from './stage-boundary';
import {asObject,list,newId,responseObject,savedEndpoint,strings} from './trajectory';
import {applyFoundation,foundationReferences,foundationSources,needsFoundationSupplement,FOUNDATION_CONTRACT} from './foundation';
import {focusCircles,flowFoundation,flowPeople,focusAtmospheres,circleEmotionContext,shortText} from './flow-context';
import {selectWorldMemory} from './world-memory';
import {encodePersonReferences} from '../models/person-references';
import {socialContexts,resolveCircleReference,atmosphereCircleReference,atmosphereFitsCircle,circleLabel,circleTitle,setTasteCircleSettings} from '../domain/social-circles';
import {hasPublicQuote,narrativeEvidence,privateProse} from './story-evidence';
import {returnedIdentity} from './returned-identity';
import {JSON_OUTPUT_RULES} from './json';

export const ATMOSPHERE_INSTRUCTIONS=`你整理“味”：首要说清这群人现在是什么气氛、公开缘由、比以前怎样变化。逐一检查background.circles的有效群与明确两人关系，结合background.foundation、人物长期关切和旧background.atmospheres，承接各圈共同纽带、日常相处、成员差异及已有约束，再看最近偏移。薄群说明可在本次foundation沿旧id细化，不必重新构筑；不同圈各有侧重，同人保重叠，不因char连通合圈，直接关系不必造群。不要求每圈必产风向，也不强造圈数或人均结果；未变或未知省略沿用，不统一心情/知情。
description直接展示给用户。每个圈本轮的说明尽量控制在100字以内，background.description和change.description合计。用一两句话写出眼下的气氛，挑一个大家看得见的细节带出原因；有变化才点明和先前的差别。只保留最能说明变化的细节；旧友身份、上轮经过、关系履历不用重新交代。“公开”是认知约束，不是每段说明的显示标签；不写“公开缘由：”这类栏目头，不要求同一开头或收尾，不造未落定事项或关切。成分和数字只在内部使用，publicBasis仍作内部依据，不替代description。无新的模型说明时保留已接纳原文，不按分数改写成另一段故事。
background是持续作者参考，changes是本批完整变化依据。先看旧圈与底色，再用changes.story及background.events/materials检查成员进退、关系变化、新圈形成与有据结束，foundation只回新增或实变，说明细化/重命名仍沿原id；已有稳定共同事由与真实联系的未命名圈可归纳。味只整理已知资料、正式正文或有效既有经历的社会意义，不创造结交行动；需要新场外行动由听发展，其结果下次味承接。风向沿原id给完整background，新增偏移单列change；省略/空updates沿用旧底色，明确结束才settled。低烈度、温吞复杂，不把不快逐轮升级，不把现场或user当下感受当整个圈背景。不输出人物行动、事务、事件、知情、作息或下一步计划。
同答stages每项含{key,sourceSeqs,onstagePersonIds,offstagePersonIds}，按changes.story实际入离场，sourceSeqs只选changes.sourceContract.storySeqs。从changes.previousOnstagePersonIds承接，changes.cameraPersonIds与user受正文负责；changes.narrativeRoles仅旧归属，未提及、同地点或别人回来不算离场。calibrationEligible=false仅时间参考，不能新增/解除在场。人物在圈内不等于本轮可替其断言；范围personIds与新增断言assertedPersonIds分开。已知关系/职责形成的作者底色可含在场成员，纯背景assertedPersonIds:[]、assertsUser:false；新断言须准确列主体及stageKey，user与在场者未给的感受/行动不代演，也不借空主体编造。
正式正文已经写明的公开互动，可归纳为该圈风向。在change中用observation:{sourceSeq,quote,participantIds}指明同一stage里的合格正式楼号、逐字公开言行原句和正文已经涉及的圈内人物；参与者留在observation和范围，不列为新增断言。只归纳可观察的气氛变化，不补任何人物或user的行动、感受、缺席、去向，不扩大公开范围。例：正文「甲当着两家店主说账已结清。」→ change:{description:"两家商户听到结账消息，气氛稍缓。",stageKey:"该段key",sourceSeqs:[本楼],assertedPersonIds:[],assertsUser:false,observation:{sourceSeq:本楼,quote:"甲当着两家店主说账已结清。",participantIds:["甲的P代号"]}}。内心描写、私语和秘密不用作observation，公开标签或楼号本身不足。
来源只用background.events的有效id、foundationReferences.id（含background.circles.id）、本批foundationSources.id、background.materials精确公共sources.id或明确唯一memoryId/floorId，以及合格正文sourceSeqs；至少一种有效。不造事件给背景找依据；同圈和材料路由摘要不给人物知情。foundation先声明并真正接纳，其局部key可供同答风向引用。
新圈（含第一次写风向的两人关系）应单独取名，不能借用其他圈名的格式。先分析这些人为什么会长期来往，从本圈真实的共同地点、常做的事、渊源或相处习惯里挑最有辨识度的一点，想一个自然、简短的名字。不要编地点，不拼名字，不写泛泛的关系类别或当日气氛。已有圈名可沿用。circleNameRepairs只列可补名的旧圈引用，有依据时顺手补名即可。圈名可独立于风向交付，circleNameUpdates每项为{circleRef,title}，用已有圈的准确引用或本答新增的群/关系key。首次写风向的圈也可以直接在atmosphereUpdates.title交名字。人工名字与成员优先。atmosphereRepairs中的旧无归属风向只供本次修正：沿旧id给明确circleRef及完整该圈背景，确属错误现场记录可settled；不把它原样延为圈。
只输出一个JSON：stages、atmosphereUpdates、circleNameUpdates（无新名给[]）、按需foundation、可选presentationUpdates、quietReason；foundationPendingPersonIds是附带待补列表；有把握时同一JSON尽力补foundation，缺项保持待补，不挤占当前情绪任务，不要求先补全才能形成风向。每条风向用新key或已有id，circleRef逐字选background.circles.id或同答真正接纳的群/关系key，含personIds/status（active或settled）、background及可选change：background:{description,basisEventIds,basisMaterialRefs,sourceSeqs}只复述/归纳已给长期资料与已知有效经历；change:{description,basisEventIds,basisMaterialRefs,sourceSeqs,stageKey,assertedPersonIds,assertsUser}写有据新增偏移。两个分段各自接纳，不把行动和私人现场混入背景。同一圈的同一股风向沿用background.atmospheres里的原id，直接给出本轮可独立阅读的现状。背景确有必要才用短句交代；只有新变化时可只给change。没有新增断言的background可省略断言字段；一旦外层或分段显式给断言/时段须如实遵守，不能以子段空数组解除。背景保留有据的成员差异，不从旧自由文拆回，不增成员情绪表。结束旧风向只需id/status:"settled"；未知来源不填占位ID。
材料不等于圈内公开。people与materials.profileText、foundation人物短块只作人设与长期关系约束，不能据私人心事推全圈心情。未公开的不满、秘密、猜测即使原材料明确，也不进入共享风向、publicBasis或听的共享依据；不建立人均情绪表。events只提供有共同参与者的公开候选，audiencePersonIds只表示原有参与范围，不表示整个圈知道其全部内容；从公开言语、态度、互动和正文判断，不能扩散知情。主楼中的内心描写也不是公开表现。
本次必须评估当前公开情绪，每条有效风向必须给出emotion，列出主要成分各自的独立强弱和公开依据；无变化时承接输入旧值，新刺激及其变化评估放change，长期承接放background，不得仅交visual代替情绪任务。结构为background/change.emotion:{values:{affinity,satisfaction,excitement,relaxation,anticipation,worry,fear,disappointment,sadness,dissatisfaction,aversion},publicBasis（只写公开缘由与对象，不用强烈/适度等成分分档描述替代自然说明）,visibility:"public",change:"none|minor|major|correction",ongoing:boolean,ongoingEvidence:{sourceSeq,quote}可选,affinityChanged:boolean可选}。十一项依次是亲近/满足/兴奋/松弛/期待/担忧/恐惧/失望/悲伤/不满/反感，独立0–100，不要求合计100，数字只内部；缺项沿用。先承接输入已按故事时间回落的emotion，再评估本批公开变化。未变、同一来源重述不加码；新小摩擦仅小幅回升且负面限日常45以内。重大冲突慎重，必须有本批正式主剧情事实，change段emotion额外给majorEvidence:{sourceSeq,quote}，quote逐字引用该合格正文中支持重大事态的完整原句；仅自称major无效。不自主制造背叛、决裂、伤害，也不把多轮小事堆成大事。明确事实可纠正旧判断，下降无须另造冲突。ongoing:true仅表示造成当前情绪的具体原因确实持续且未解决；普通长期关系或日常继续本身不算ongoing，缺乏具体依据不要笼统填true，也不能仅凭旧标记推出有悬案或关切。ongoing:true还需在change.emotion用ongoingEvidence引用本段正式正文明确仍未解决的公开原因；确有依据时保留适量担忧，解决后给false。亲近是长期成分，仅当公开依据确实显示关系改变时在change.emotion给affinityChanged:true并更新affinity。同场时间未知先保持，由新交流改变；不用现实钟、调用轮次淡化。时间回落只影响短时情绪，不改长期关系。亲近对人、反感对做法可共存，请在publicBasis分清对象；松弛/兴奋同高取轻松但有兴致的中间气氛。听承接有效强弱及自然降温方向，颜色占比不反推人物感受。
visual可选{temperature:"cold|neutral|warm",rhythm:"calm|flowing|agitated"}，只是展示分类，不评分，不因此造风向。${PROFILE_RELATION_INSTRUCTIONS}不输出思考或索要新请求。`;

export interface ReferenceNormalization {key:string|null;part?:string;field:string;kind:'alias'|'discard-auxiliary';from:unknown;to?:string}
export interface AtmosphereResult {state:NpcWorldState;changed:boolean;changedAtmospheres:number;stages:SceneStage[];boundaryRejections:BoundaryRejection[];rejections:Array<{key:string|null;part?:string;reason:string}>;referenceNormalizations:ReferenceNormalization[];foundationRejections:Array<{kind:string;key:string|null;reason:string}>}
type AtmosphereInput=DevelopmentInput&{prepared:DevelopmentPreparation;foundationRefs?:Map<string,string>};
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);

function tasteSelection(input:DevelopmentInput,prepared:DevelopmentPreparation) {
  const {focus,worldSettings}=prepared;
  const circles=focusCircles(input.people,input.state,focus);
  const memory=focus?input.state.events:selectWorldMemory(input.people,input.state).events;
  const affected=focus&&new Set(focus.personIds);
  const carried=effectiveAtmospheres(input.state).map(row=>{const emotion=row.sources.some(source=>source.kind==='manual')?row.emotion:advanceEmotion(row.emotion,prepared.currentClock);return emotion?{...row,emotion}:row;});
  const allBound=focusAtmospheres(input.people,{...input.state,developmentAtmospheres:carried});
  const included=new Set(circles.map(circle=>circle.id));
  const atmospheres=allBound.filter(row=>row.circleRef&&included.has(row.circleRef));
  const bound=new Set(allBound.map(row=>row.id));
  const editedRefs=new Set([
    ...(input.state.foundation?.groups??[]).filter(row=>row.taste?.hidden||row.taste?.personIds).map(row=>'foundation:group:'+row.id),
    ...(input.state.foundation?.relations??[]).filter(row=>row.taste?.hidden||row.taste?.personIds).map(row=>'foundation:relation:'+row.id),
  ]);
  const repairs=carried.filter(row=>!bound.has(row.id)
    &&!(row.circleRef?[row.circleRef]:row.basisMaterialRefs??[]).some(ref=>editedRefs.has(ref))
    &&(!affected||row.personIds.some(id=>affected.has(id))));
  const nameRepairs=circles.flatMap(circle=>{
    const winds=atmospheres.filter(wind=>wind.circleRef===circle.id);
    if(circle.kind==='relation'&&!winds.length&&!circle.taste?.personIds)return [];
    const name=circleLabel(circle,input.people,winds.map(wind=>wind.title));
    return name.provisional?[{circleRef:circle.id}]:[];
  });
  const publicIds=new Set<string>();
  const supported=new Set(atmospheres.flatMap(row=>row.basisEventIds));
  for(const circle of circles){
    const members=new Set(circle.personIds);
    const eligible=memory.filter(event=>!event.correction&&event.visibility!=='private'&&!privateProse.test(recordBody(event))&&new Set(event.participantIds.filter(id=>members.has(id))).size>=2);
    const direct=eligible.filter(event=>!affected||event.participantIds.some(id=>affected.has(id)));
    for(const event of affected?[...direct.slice(-2),...eligible.filter(row=>supported.has(row.id)).slice(-2)]:eligible)publicIds.add(event.id);
  }
  const events=memory.filter(event=>publicIds.has(event.id));
  const suppliedEvents=focus?events:memory.filter(event=>event.visibility!=='private');
  const foundation=flowFoundation(input,{focus,circles,worldSettings,events:suppliedEvents});
  if(focus)foundation.foundationReferences=foundation.foundationReferences.filter(ref=>ref.entityKind!=='person'&&ref.basisEventIds.every(id=>publicIds.has(id)));
  return{circles,atmospheres,repairs,nameRepairs,events,suppliedEvents,foundation};
}

function publicReferences(input:AtmosphereInput,view:ReturnType<typeof tasteSelection>,localRefs:Map<string,string>) {
  const sources=new Map<string,SourceRef>(),aliases=new Map<string,Set<string>>(),dependencies=new Map<string,string[]>();
  const bind=(alias:string,id:string)=>{const values=aliases.get(alias)??new Set<string>();values.add(id);aliases.set(alias,values);};
  for(const batch of input.prepared.focus?[]:input.prepared.materials)for(const material of batch.materials)for(const source of material.sources)if(source.kind==='plugin') {
    sources.set(source.id,source);
    if(!source.id.startsWith('qqj-context:'))continue;
    let memoryId:unknown;try{memoryId=JSON.parse(source.id.slice('qqj-context:'.length))[1];}catch{continue;}
    for(const ref of material.refs)if(ref.memoryId===memoryId){bind(ref.memoryId,source.id);for(const floorId of ref.floorIds)bind(floorId,source.id);}
  }
  const accepted=new Set(localRefs.values());
  const supplied=new Set(view.foundation.foundationReferences.map(ref=>ref.id));
  for(const ref of foundationReferences(input.state.foundation,input.state.events)) {
    dependencies.set(ref.id,ref.basisEventIds);
    if(!supplied.has(ref.id)&&(!accepted.has(ref.entityId)||input.prepared.focus&&ref.entityKind==='person'))continue;
    sources.set(ref.id,{kind:'simulation',id:ref.id,label:ref.label});bind(ref.entityId,ref.id);
  }
  for(const source of view.foundation.sources.values())if(source.kind==='character'||source.kind==='world-book')sources.set(source.id,source);
  return {sources,dependencies,resolve(value:unknown){if(typeof value!=='string')return undefined;if(sources.has(value))return value;const ids=aliases.get(localRefs.get(value)??value);return ids?.size===1?[...ids][0]:undefined;}};
}

/** Taste organizes lasting author context; the complete story remains a separate change/evidence section. */
export function atmosphereContext(input:DevelopmentInput,prepared:DevelopmentPreparation,view=tasteSelection(input,prepared)) {
  const {focus,worldSettings}=prepared,{sources:_,foundation,foundationReferences,...references}=view.foundation;
  const pendingNames=new Set(view.nameRepairs.map(row=>row.circleRef));
  const circles=view.circles.map(({name,...circle})=>circle.kind==='relation'||pendingNames.has(circle.id)?circle:{...circle,name});
  const groups=foundation?.groups.map(({name,...group})=>pendingNames.has('foundation:group:'+group.id)?group:{...group,name});
  const atmospheres=view.atmospheres.map(({visual,title,...row})=>pendingNames.has(row.circleRef!)?row:{...row,title});
  const materials=prepared.materials.map(batch=>({status:batch.status,coverage:batch.coverage,materials:batch.materials.flatMap(material=>focus&&!material.profileText?[]:[{personId:material.personId,profileText:material.profileText}])}));
  const events=view.events.map(event=>focus?{id:event.id,description:shortText(recordBody(event),500),audiencePersonIds:event.participantIds}:({...event,audiencePersonIds:event.participantIds}));
  const story=input.story.turns;
  return {
    initial:input.initial,throughSeq:input.story.throughSeq,
    background:{circles,foundation:foundation?{...foundation,groups}:undefined,atmospheres,circleEmotions:circleEmotionContext(view.atmospheres),people:flowPeople(input.people,focus),worldSettings,materials,events},
    atmosphereRepairs:view.repairs.map(({visual,emotion,title,...row})=>row),
    ...(view.nameRepairs.length?{circleNameRepairs:view.nameRepairs}:{}),
    changes:{story,sourceContract:{storySeqs:story.map(turn=>turn.seq),calibrationSeqs:story.flatMap(turn=>turn.calibrationEligible!==false?[turn.seq]:[]),eventIds:events.map(event=>event.id)},previousStoryTime:input.initial?null:input.state.storyTime,currentClock:prepared.currentClock,previousOnstagePersonIds:input.state.developmentOnstagePersonIds??[],cameraPersonIds:input.cameraPersonIds??[],narrativeRoles:prepared.narrativeRoles},
    creativeFrame:{intensity:prepared.creativeFrame?.intensity},emotionRules:EMOTION_RULES,...references,
    foundationReferences:foundationReferences.map(({label,...ref})=>pendingNames.has(ref.id)?ref:{...ref,label}),
  };
}

export async function generateAtmosphere(input:DevelopmentInput&{prepared?:DevelopmentPreparation;dependencies:AdvanceDependencies;signal?:AbortSignal;diagnostic?:DiagnosticTrace}):Promise<AtmosphereResult> {
  input.signal?.throwIfAborted();const prepared=input.prepared??await prepareDevelopment(input);
  const view=tasteSelection(input,prepared);
  const focused=prepared.focus&&new Set(prepared.focus.personIds);
  const supplement='本次主任务是当前公开情绪及变化。只更新确有变化的相关圈，其他沿用；用本批资料附带补已有基础的缺项，人工决定优先。';
  const instructions=supplement+'\n'+ATMOSPHERE_INSTRUCTIONS+'\n'+FOUNDATION_CONTRACT+`
${JSON_OUTPUT_RULES}
顶层结构如下。没有可确认的变化时保留空数组，quietReason 写具体缘由。
{"stages":[],"atmosphereUpdates":[],"circleNameUpdates":[],"foundation":{"people":[],"groups":[],"relations":[]},"presentationUpdates":[],"quietReason":""}
返回前核对场段的 key、sourceSeqs、onstagePersonIds 和 offstagePersonIds。只引用输入给出的楼号和人物。每条风向的 circleRef 必须能对应输入圈子或本答声明的圈子，新增变化补齐场段、断言主体和公开依据。`;
  const response=await input.dependencies.model.request({task:'atmosphere',instructions,input:{...atmosphereContext(input,prepared,view),presentationRequests:presentationRequests(input.people.filter(person=>!focused||focused.has(person.id)),input.state.developmentPresentation)},signal:input.signal,diagnostic:input.diagnostic});
  input.signal?.throwIfAborted();recordDiagnostic(input.diagnostic,'apply-started');
  try{const result=applyAtmosphere({...input,prepared},response,view);recordDiagnostic(input.diagnostic,'applied',{atmosphereCount:result.state.developmentAtmospheres?.length??0,changedAtmospheres:result.changedAtmospheres,backgroundChanged:result.changed,foundationRejections:result.foundationRejections.slice(0,24),atmosphereRejections:result.rejections.slice(0,24),boundaryRejectionCount:result.boundaryRejections.length,referenceNormalizationCount:result.referenceNormalizations.length});return result;}
  catch(error){recordDiagnostic(input.diagnostic,'apply-failed',diagnosticError(error));throw error;}
}

export function applyAtmosphere(input:AtmosphereInput,response:unknown,view=tasteSelection(input,input.prepared)):AtmosphereResult {
  const outer=responseObject(response);let data=asObject(outer.olfaction)??asObject(outer.atmosphere)??outer;
  if(!['foundation','atmosphereUpdates','circleNameUpdates','quietReason','presentationUpdates'].some(key=>Object.hasOwn(data,key)))throw Error('局部风向结果无法读取，请重新更新。');
  let foundationChanged=false,localRefs=new Map(input.foundationRefs),foundationRejections:AtmosphereResult['foundationRejections']=[];
  let boundary=developmentBoundary(input,data,localRefs);const personBoundaryRejections:BoundaryRejection[]=[];
  const supplement=asObject(data.foundation);
  if(supplement&&['people','groups','relations'].some(key=>Array.isArray(supplement[key]))&&input.story.throughSeq!==null) {
    const point=savedEndpoint(input.state)??{id:newId(),text:input.state.storyTime?.text??input.prepared.currentClock??'当前资料时点',sourceSeqs:input.story.turns.map(turn=>turn.seq)};
    const references=[...view.foundation.sources.values(),...view.suppliedEvents.flatMap(event=>[...event.sources,{kind:'simulation' as const,id:event.simulationWindowId??event.id,label:'已有经历依据'}])];
    const window:SimulationWindow={id:newId(),kind:'current',from:point,to:point,throughSeq:input.story.throughSeq,referenceSources:[...new Map(references.map(source=>[source.kind+':'+source.id,source])).values()]};
    const eventIds=new Set(view.suppliedEvents.map(event=>event.id)),suppliedSources=input.prepared.focus?view.foundation.sources:undefined;
    const peopleBuilt=applyFoundation({...input,worldSettings:input.prepared.worldSettings},{people:list(supplement.people)},window,{static:true,eventIds,suppliedSources,allows:(row,ids)=>boundary.allows(row,ids,'person',true)});
    personBoundaryRejections.push(...boundary.rejected);
    data=encodePersonReferences(data,peopleBuilt.refs) as typeof data;
    const socialInput={...input,people:peopleBuilt.people,state:{...input.state,foundation:peopleBuilt.foundation}};
    boundary=developmentBoundary(socialInput,data,peopleBuilt.refs);
    const social=asObject(data.foundation)!;
    const socialBuilt=applyFoundation({...socialInput,worldSettings:input.prepared.worldSettings},{groups:list(social.groups),relations:list(social.relations)},window,{static:true,eventIds,suppliedSources,allows:(row,ids)=>boundary.allows(row,ids,'social-change',true)});
    const built={...socialBuilt,accepted:peopleBuilt.accepted+socialBuilt.accepted,rejections:[...peopleBuilt.rejections,...socialBuilt.rejections],refs:new Map([...peopleBuilt.refs,...socialBuilt.refs])};
    localRefs=built.refs;foundationRejections=built.rejections;
    const semantic=(value:unknown)=>{const f=asObject(value);return f?['people','groups','relations'].map(key=>list(f[key]).map(({currentStateWindowId,...row})=>row)):null;};
    const reviewed={...input.state,foundation:built.foundation,simulationRanges:[...(input.state.simulationRanges??[]),window]};
    const newlyReviewed=!input.prepared.focus&&input.people.some(person=>needsFoundationSupplement([person],input.state)&&!needsFoundationSupplement([person],reviewed));
    foundationChanged=built.accepted>0&&(newlyReviewed||!equal(semantic(input.state.foundation),semantic(built.foundation)));
    input={...input,people:built.people,state:foundationChanged?{...input.state,foundation:built.foundation,simulationRanges:[...(input.state.simulationRanges??[]),window]}:input.state};
    data=encodePersonReferences(data,localRefs) as typeof data;
  }
  const ids=new Set(input.people.map(person=>person.id));
  const original=new Map(effectiveAtmospheres(input.state).map(row=>[row.id,row]));
  const current=new Map([...original].map(([id,row])=>{const emotion=row.sources.some(source=>source.kind==='manual')?row.emotion:advanceEmotion(row.emotion,input.prepared.currentClock);return [id,emotion?{...row,emotion}:row];}));
  const publicEvents=view.events,validEvents=new Set(publicEvents.map(event=>event.id));
  const eligible=new Set(input.story.turns.filter(turn=>turn.calibrationEligible!==false).map(turn=>turn.seq));
  const publicQuote=(sourceSeq:unknown,quote:unknown)=>{
    if(typeof sourceSeq!=='number'||!eligible.has(sourceSeq)||typeof quote!=='string'||!quote.trim())return false;
    const floor=input.story.turns.find(turn=>turn.seq===sourceSeq&&!turn.isUser);
    return Boolean(floor&&hasPublicQuote(narrativeEvidence(floor.text),quote.trim()));
  };
  const suppliedCircles=new Set([...view.circles.map(circle=>circle.entityId),...localRefs.values()]);
  const circles=socialContexts(input.people,input.state).filter(circle=>!input.prepared.focus||suppliedCircles.has(circle.entityId));
  const circlesById=new Map(circles.map(circle=>[circle.id,circle]));
  let renamedFoundation=input.state.foundation;
  const savedTitles=new Map<string,string[]>();
  for(const wind of original.values()){
    const ref=atmosphereCircleReference(wind,circles);
    if(!ref)continue;
    const titles=savedTitles.get(ref)??[];
    titles.push(wind.title);savedTitles.set(ref,titles);
  }
  for(const row of list(data.circleNameUpdates)){
    const ref=resolveCircleReference(row.circleRef,circles,localRefs);
    const title=typeof row.title==='string'&&!privateProse.test(row.title)?row.title.trim():'';
    if(!ref||!title||!renamedFoundation)continue;
    const circle=circlesById.get(ref)!;
    if(!circleLabel(circle,input.people,savedTitles.get(ref)).provisional)continue;
    const name=circleLabel(circle,input.people,[title]);
    if(name.provisional||name.title!==title)continue;
    const taste={...circle.taste,generatedTitle:title};
    renamedFoundation=setTasteCircleSettings(renamedFoundation,circle,taste);
    circlesById.set(ref,{...circle,taste});
  }
  const titleFor=(circleRef:string,proposal?:string)=>circleTitle(circlesById.get(circleRef)!,input.people,
    [proposal,...[...current.values()].filter(wind=>atmosphereCircleReference(wind,circles)===circleRef).map(wind=>wind.title)]);
  const suppliedWinds=new Set([...view.atmospheres,...view.repairs].map(row=>row.id));
  const references=publicReferences(input,view,localRefs),rejections:AtmosphereResult['rejections']=[],referenceNormalizations:ReferenceNormalization[]=[];
  const eventsById=new Map(input.state.events.map(event=>[event.id,event]));
  const seen=new Set<string>();
  for(const item of list(data.atmosphereUpdates)) {
    const row=returnedIdentity(item,current);
    if(!row){rejections.push({key:typeof item.key==='string'?item.key:null,reason:'identity'});continue;}
    const key=typeof(row.key??row.id)==='string'?(row.key??row.id).trim():null;
    const reject=(reason:string,part?:string)=>rejections.push({key,...(part?{part}:{}),reason});
    const old=typeof row.id==='string'?current.get(row.id.trim()):undefined;
    if(row.id&&(!old||input.prepared.focus&&!suppliedWinds.has(old.id))){reject('identity');continue;}
    if(old?.sources.some(source=>source.kind==='manual')){reject('manual');continue;}
    if(row.status==='settled'){if(old)current.delete(old.id);else reject('identity');continue;}
    if(!['active',undefined].includes(row.status)||!old&&(!key||seen.has(key))){reject('content');continue;}
    const hasCircle=Object.hasOwn(row,'circleRef'),explicitCircle=hasCircle?resolveCircleReference(row.circleRef,circles,localRefs):undefined;
    if(hasCircle&&!explicitCircle){reject('circle');continue;}
    const proposal=typeof row.title==='string'&&!privateProse.test(row.title)?row.title.trim():undefined;
    if(old&&Object.hasOwn(row,'title')&&Object.keys(row).every(field=>['id','key','circleRef','title'].includes(field))){
      if(!explicitCircle||explicitCircle!==atmosphereCircleReference(old,circles)){reject('circle');continue;}
      const title=titleFor(explicitCircle,proposal);
      if(title!==titleFor(explicitCircle))current.set(old.id,{...old,title});
      continue;
    }
    const personIds=strings(row.personIds);
    if(!Array.isArray(row.personIds)||!personIds.length||personIds.length!==row.personIds.length||personIds.some(id=>!ids.has(id))){reject('range');continue;}
    const privateEvent=(id:string)=>{const event=eventsById.get(id);return !!event&&(event.visibility==='private'||new Set(event.participantIds).size<2||!personIds.every(personId=>event.participantIds.includes(personId)));};
    const privateReference=(ref:string)=>Boolean(input.prepared.focus&&(references.dependencies.get(ref)??[]).some(privateEvent));
    const publicReference=(ref:string)=>{const resolved=references.resolve(ref);return resolved&&!privateReference(resolved)?resolved:undefined;};
    const segmented=Object.hasOwn(row,'background')||Object.hasOwn(row,'change');
    const parts=segmented?(['background','change'] as const).filter(part=>Object.hasOwn(row,part)).map(part=>({part,value:asObject(row[part])})):[{part:undefined,value:row}];
    const accepted:Array<{description:string;eventIds:string[];materialRefs:string[];sourceSeqs:number[];emotion?:unknown;part?:string;majorAllowed:boolean;ongoingBasis?:string;affinityAllowed:boolean}>=[];
    for(const {part,value} of parts) {
      if(!value||typeof value.description!=='string'||!value.description.trim()){reject('content',part);continue;}
      const providedMaterials=strings(value.basisMaterialRefs);
      const assessment=asObject(value.emotion);
      const privateScope=privateProse.test(value.description)||typeof assessment?.publicBasis==='string'&&privateProse.test(assessment.publicBasis)||value.visibility==='private'||row.visibility==='private'||asObject(value.emotion)?.visibility==='private'||strings(value.basisEventIds).some(privateEvent)||
        providedMaterials.some(ref=>privateReference(references.resolve(ref)??resolveCircleReference(ref,circles,localRefs)??ref));
      if(privateScope){reject('private-scope',part);continue;}
      const background=part==='background',guards=segmented?[value,row]:[value];
      let invalid=false;const subjects=new Set<string>();let assertsUser=false;
      for(const guard of guards) {
        if(Object.hasOwn(guard,'assertedPersonIds')){if(!Array.isArray(guard.assertedPersonIds)||guard.assertedPersonIds.some((id:unknown)=>typeof id!=='string'||!ids.has(id))){invalid=true;break;}for(const id of guard.assertedPersonIds)subjects.add(id);}
        else if(guard===value&&!background&&(!segmented||!Object.hasOwn(row,'assertedPersonIds'))){invalid=true;break;}
        if(Object.hasOwn(guard,'assertsUser')){if(typeof guard.assertsUser!=='boolean'){invalid=true;break;}assertsUser ||= guard.assertsUser;}
        else if(guard===value&&!background&&(!segmented||!Object.hasOwn(row,'assertsUser'))){invalid=true;break;}
      }
      if(invalid){reject('subjects',part);continue;}
      if(assertsUser||[...subjects].some(id=>input.people.some(person=>person.id===id&&person.specialRole==='user'))){reject('story-user',part);continue;}
      const constrained={...row,...value,assertedPersonIds:[...subjects],assertsUser};
      // A supplied stage is a real constraint, including when a child defaults to known background.
      const stages=segmented?guards.filter(guard=>Object.hasOwn(guard,'stageKey')):[constrained];
      if((subjects.size||segmented&&stages.length)&&(!stages.length||stages.some(guard=>!boundary.allows({...constrained,stageKey:guard.stageKey},[],'atmosphere',true)))){reject('boundary',part);continue;}
      const observation=asObject(value.observation);
      const observations=Array.isArray(observation?.participantIds)?observation.participantIds:[];
      const observedSeq=observation?.sourceSeq;
      const circle=circles.find(circle=>circle.id===(explicitCircle??old?.circleRef));
      const observed=part==='change'&&observation&&observation.visibility!=='private'&&value.assertsUser===false&&!subjects.size
        && Array.isArray(value.assertedPersonIds)&&value.assertedPersonIds.length===0
        && observations.length>0&&observations.every(id=>personIds.includes(id)&&circle?.personIds.includes(id))
        && stages.length>0&&stages.every(guard=>boundary.includesFloor(guard,observedSeq))
        && publicQuote(observedSeq,observation.quote);
      if(Object.hasOwn(value,'observation')&&!observed){reject('observation',part);continue;}
      if(part==='change'&&!observed&&stages.some(guard=>boundary.isProtected(guard,personIds))
        && Array.isArray(value.sourceSeqs)&&value.sourceSeqs.length&&!subjects.size){reject('observation',part);continue;}
      const eventIds=strings(value.basisEventIds).filter(id=>validEvents.has(id));
      const materialRefs=providedMaterials.flatMap(ref=>{const resolved=publicReference(ref);if(resolved&&resolved!==ref)referenceNormalizations.push({key,part,field:'basisMaterialRefs',kind:'alias',from:ref,to:resolved});return resolved?[resolved]:[];});
      const circleBasis=explicitCircle&&publicReference(explicitCircle);
      if(background&&circleBasis&&!materialRefs.includes(circleBasis))materialRefs.push(circleBasis);
      const sourceSeqs=(Array.isArray(value.sourceSeqs)?value.sourceSeqs:[]).filter((seq:unknown):seq is number=>Number.isInteger(seq)&&eligible.has(seq as number));
      if(observed&&!sourceSeqs.includes(observedSeq))sourceSeqs.push(observedSeq);
      if(!eventIds.length&&!materialRefs.length&&!sourceSeqs.length){reject('basis',part);continue;}
      if(circleBasis&&!materialRefs.includes(circleBasis))materialRefs.push(circleBasis);
      for(const ref of materialRefs)for(const id of references.dependencies.get(ref)??[])if(!eventIds.includes(id))eventIds.push(id);
      for(const [field,values,valid] of [['basisEventIds',value.basisEventIds,eventIds],['basisMaterialRefs',value.basisMaterialRefs,providedMaterials.filter(publicReference)],['sourceSeqs',value.sourceSeqs,sourceSeqs]] as const)if(Array.isArray(values))for(const ref of values)if(!(valid as unknown[]).includes(ref))referenceNormalizations.push({key,part,field,kind:'discard-auxiliary',from:ref});
      const majorEvidence=asObject(assessment?.majorEvidence);
      const citedQuote=(evidence:Record<string,any>|null)=>evidence&&sourceSeqs.includes(evidence.sourceSeq)
        && (!stages.length||stages.every(guard=>boundary.includesFloor(guard,evidence.sourceSeq)))
        && publicQuote(evidence.sourceSeq,evidence.quote);
      const majorAllowed=part==='change'&&Boolean(citedQuote(majorEvidence));
      const ongoingEvidence=asObject(assessment?.ongoingEvidence);
      const ongoingBasis=part==='change'&&citedQuote(ongoingEvidence)?ongoingEvidence!.quote.trim():undefined;
      const affinityAllowed=part==='change'&&(Boolean(observed)||eventIds.length>0)&&assessment?.affinityChanged===true;
      accepted.push({description:value.description.trim(),eventIds,materialRefs,sourceSeqs,part,majorAllowed,ongoingBasis,affinityAllowed,...(assessment?{emotion:assessment}:{})});
    }
    if(!accepted.length)continue;
    const circleRef=explicitCircle??atmosphereCircleReference({...(old?.circleRef?{circleRef:old.circleRef}:{}),basisMaterialRefs:accepted.flatMap(part=>part.materialRefs)},circles);
    if(!circleRef){reject('circle');continue;}
    if(!atmosphereFitsCircle({personIds},circlesById.get(circleRef)!)){reject('circle-members');continue;}
    const visual=normalizeAtmosphereVisual(row.visual)??old?.visual;
    let emotion=old?.emotion;
    // A valid change assessment wins over background; invalid optional fields keep the usable earlier part.
    for(const part of accepted)if(part.emotion)emotion=updateEmotion(emotion?{...emotion,throughSeq:old?.emotion?.throughSeq??null}:undefined,{...asObject(part.emotion),publicBasis:asObject(part.emotion)?.publicBasis??part.description},{clock:input.prepared.currentClock,throughSeq:input.story.throughSeq,refs:[...part.sourceSeqs.filter(seq=>seq>(old?.emotion?.throughSeq??input.state.processedThroughSeq??0)).map(seq=>'story:'+seq),...part.eventIds.filter(id=>{const event=publicEvents.find(event=>event.id===id),window=input.state.simulationRanges?.find(window=>window.id===event?.simulationWindowId);return window&&window.throughSeq>(old?.emotion?.throughSeq??input.state.processedThroughSeq??0)&&window.throughSeq<=(input.story.throughSeq??0);}).map(id=>'event:'+id)],newChange:part.part==='change'&&(part.sourceSeqs.length>0||part.eventIds.length>0),majorAllowed:part.majorAllowed,ongoingBasis:part.ongoingBasis,affinityAllowed:part.affinityAllowed});
    const title=titleFor(circleRef,proposal);
    const summary={...(circleRef?{circleRef}:{}),...(visual?{visual}:{}),...(emotion?{emotion}:{}),title,personIds:[...new Set(personIds)],description:[...new Set(accepted.map(part=>part.description))].join('\n\n'),basisEventIds:[...new Set(accepted.flatMap(part=>part.eventIds))],basisMaterialRefs:[...new Set(accepted.flatMap(part=>part.materialRefs))],sourceSeqs:[...new Set(accepted.flatMap(part=>part.sourceSeqs))]};
    const comparable=(value:DevelopmentAtmosphere)=>({... (value.visual?{visual:value.visual}:{}),...(value.emotion?{emotion:value.emotion}:{}),circleRef:value.circleRef,title:value.title,personIds:value.personIds,description:value.description,basisEventIds:value.basisEventIds,basisMaterialRefs:value.basisMaterialRefs??[],sourceSeqs:value.sourceSeqs??[]});
    if(old&&equal(comparable(old),summary)){seen.add(key!);continue;}
    const sources:SourceRef[]=[...summary.basisMaterialRefs.map(id=>references.sources.get(id)!),...summary.sourceSeqs.map(seq=>({kind:'chat' as const,id:'history-floor:'+seq,label:`第 ${seq} 楼正文`})),{kind:'simulation',id:'atmosphere:'+newId(),label:input.prepared.currentClock?`${input.prepared.currentClock}的作者层局部风向推断`:'作者层局部风向推断'}];
    const next:DevelopmentAtmosphere={id:old?.id??newId(),...summary,sources,...(input.prepared.currentClock?{storyTime:{text:input.prepared.currentClock}}:{})};
    current.set(next.id,next);seen.add(key!);
  }
  const frame=input.prepared.creativeFrame??selectCreativeFrame(input.state.scopeId,input.prepared.currentClock,input.state.developmentCreativeFrame);
  const storedFrame={key:frame.key,version:frame.version,recipeId:frame.recipeId};
  const renamed=renamedFoundation!==input.state.foundation;
  const state={...input.state,...(renamed?{foundation:renamedFoundation}:{}),developmentCreativeFrame:storedFrame,developmentAtmospheres:[...current.values()],developmentPresentation:applyPresentation(input.people,input.state.developmentPresentation,data.presentationUpdates)};
  const changedAtmospheres=[...new Set([...original.keys(),...current.keys()])].filter(id=>!equal(original.get(id),current.get(id))).length;
  return {state,changedAtmospheres,changed:foundationChanged||renamed||!equal(state.developmentPresentation,input.state.developmentPresentation??[])||!equal(state.developmentAtmospheres,input.state.developmentAtmospheres??[])||!equal(storedFrame,input.state.developmentCreativeFrame),stages:boundary.stages,boundaryRejections:[...personBoundaryRejections,...boundary.rejected],rejections,referenceNormalizations,foundationRejections};
}
