import {combineEmotions,readEmotion,type EmotionValues} from './emotion';
import type {DevelopmentAtmosphere,WorldEvent,WorldSnapshot} from './world';
import {foundationReferences,type TasteCircleSettings,type WorldFoundation} from './world-foundation';
import {effectiveAtmospheres} from './world-state';
type Identity={id:string;name?:string;displayName?:string;aliases?:string[]};
type SocialWorld={foundation?:WorldFoundation;events:WorldEvent[];developmentAtmospheres?:DevelopmentAtmosphere[];atmospheres?:DevelopmentAtmosphere[]};
export interface SocialContext {id:string;entityId:string;kind:'group'|'relation';name:string;description:string;personIds:string[];members?:Array<{personId:string;role?:string}>;fromPersonId?:string;toPersonId?:string;fromRole?:string;toRole?:string;directed?:boolean;taste?:TasteCircleSettings}
export interface TasteCircle {id:string;title:string;description:string;personIds:string[];atmosphereIds:string[];visual?:DevelopmentAtmosphere['visual'];emotionValues?:EmotionValues}
export type TasteCircleEdit={scopeId:string;circleId:string}&({kind:'update';title?:string;personIds?:string[]}|{kind:'delete'});

export function setTasteCircleSettings(foundation:WorldFoundation,circle:Pick<SocialContext,'kind'|'entityId'>,taste:TasteCircleSettings):WorldFoundation {
 const update=<T extends {id:string;taste?:TasteCircleSettings}>(row:T):T=>row.id===circle.entityId?{...row,taste}:row;
 return circle.kind==='group'?{...foundation,groups:foundation.groups.map(update)}:{...foundation,relations:foundation.relations.map(update)};
}

/** A taste edit only affects the circle projection. The foundation's facts and history stay intact. */
function editContext(circle:SocialContext,taste:TasteCircleSettings|undefined,names:Map<string,string>):SocialContext[] {
 if(taste?.hidden===true)return [];
 if(!taste)return [circle];
 if(!Array.isArray(taste.personIds))return [{...circle,taste}];
 const personIds=[...new Set(taste.personIds.filter(id=>names.has(id)))];
 const members=circle.members?.map(member=>[member.personId,member] as const);
 const memberById=new Map(members);
 return [{...circle,taste,personIds,...(members?{members:personIds.map(personId=>memberById.get(personId)??{personId})}:{})}];
}
/** The foundation owns the current social object; mood never creates membership or a group. */
export function socialContexts(people:Identity[],state:Pick<SocialWorld,'foundation'|'events'>):SocialContext[] {
 const names=new Map(people.map(person=>[person.id,person.displayName??person.name??'']));
 const valid=new Set(foundationReferences(state.foundation,state.events).map(ref=>ref.id));
 const groups=(state.foundation?.groups??[]).flatMap(group=>{
  const id='foundation:group:'+group.id;if(!valid.has(id))return [];
  const members=group.members.filter(member=>!member.toWindowId&&names.has(member.personId)).map(({personId,role})=>({personId,...(role?{role}:{})}));
  return editContext({id,entityId:group.id,kind:'group',name:group.name,description:group.description,personIds:members.map(member=>member.personId),members},group.taste,names);
 });
 const relations=(state.foundation?.relations??[]).flatMap(relation=>{
  const id='foundation:relation:'+relation.id;if(!valid.has(id)||!names.has(relation.fromPersonId)||!names.has(relation.toPersonId))return [];
  return editContext({id,entityId:relation.id,kind:'relation',name:`${names.get(relation.fromPersonId)}（${relation.fromRole}）—${names.get(relation.toPersonId)}（${relation.toRole}）`,description:'已明确的直接关系',personIds:[relation.fromPersonId,relation.toPersonId],fromPersonId:relation.fromPersonId,toPersonId:relation.toPersonId,fromRole:relation.fromRole,toRole:relation.toRole,directed:relation.directed},relation.taste,names);
 });
 return [...groups,...relations];
}
/** Exact references only: a rejected/ambiguous identity cannot be replaced by a name or member guess. */
export function resolveCircleReference(value:unknown,circles:SocialContext[],aliases?:Map<string,string>):string|undefined {
 if(typeof value!=='string'||!value.trim())return undefined;const key=aliases?.get(value.trim())??value.trim();
 const found=circles.filter(circle=>circle.id===key||circle.entityId===key);return found.length===1?found[0].id:undefined;
}
export function atmosphereCircleReference(row:{circleRef?:unknown;basisMaterialRefs?:string[]},circles:SocialContext[]):string|undefined {
 if(Object.hasOwn(row,'circleRef'))return resolveCircleReference(row.circleRef,circles);
 const refs=[...new Set((row.basisMaterialRefs??[]).flatMap(ref=>{const id=resolveCircleReference(ref,circles);return id?[id]:[];}))];return refs.length===1?refs[0]:undefined;
}
const genericCircleName=/^(?:未命名(?:社交)?圈?|待命名|暂未命名|社交圈|日常往来|租住往来|长幼往来|邻里往来|未定圈名)$/u;
/** A placeholder is identified separately from a stable title so the next taste pass can name it. */
export function circleLabel(circle:SocialContext,people:Identity[],titles:readonly unknown[]=[]):{title:string;provisional:boolean} {
 const manual=typeof circle.taste?.manualTitle==='string'?circle.taste.manualTitle.trim():'';
 if(manual)return {title:manual,provisional:false};
 const names=(id:string|undefined)=>{
  const person=people.find(person=>person.id===id);
  const aliases=Array.isArray(person?.aliases)?person.aliases:[];
  return [person?.displayName,person?.name,...aliases].flatMap(value=>typeof value==='string'&&value.trim()?[value.trim()]:[]);
 };
 const [from,to]=circle.kind==='relation'?[circle.fromPersonId,circle.toPersonId]:circle.personIds.length===2?circle.personIds:[];
 const fromNames=names(from),toNames=names(to);
 const paired=(title:string,from:string,to:string)=>{
  if(!title.startsWith(from))return false;
  const rest=title.slice(from.length).trimStart();
  return ['与','和','、','及','跟','&','＆','—','-'].some(separator=>rest.startsWith(separator)
    &&[to,to+'圈',to+'关系',to+'往来'].includes(rest.slice(separator.length).trim()));
 };
 const roles=[...new Set([circle.fromRole?.trim(),circle.toRole?.trim()].filter(Boolean))];
 const roleText=roles.join(' ');
 let fallback='日常往来';
 if(/租客|租户|房客|房东|包租/u.test(roleText))fallback='租住往来';
 else if(/长辈|前辈/u.test(roleText)&&/晚辈|后辈/u.test(roleText))fallback='长幼往来';
 else if(roles.length&&roles.every(role=>/^[\p{L}\p{N}]{1,4}$/u.test(role??'')))fallback=roles.join('与')+'往来';
 const groupName=circle.kind==='group'&&typeof circle.name==='string'?circle.name.trim():'';
 const candidates=[groupName,circle.taste?.generatedTitle,...titles];
 for(const value of candidates){
  const name=typeof value==='string'?value.trim():'';
  if(name&&name!==fallback&&!genericCircleName.test(name)&&!fromNames.some(from=>toNames.some(to=>paired(name,from,to)||paired(name,to,from))))return {title:name,provisional:false};
 }
 return {title:genericCircleName.test(groupName)?groupName:fallback,provisional:true};
}
export const circleTitle=(circle:SocialContext,people:Identity[],titles:readonly unknown[]=[])=>circleLabel(circle,people,titles).title;

export function atmosphereFitsCircle(row:Pick<DevelopmentAtmosphere,'personIds'>,circle:SocialContext) {
 return !Array.isArray(circle.taste?.personIds)||row.personIds.every(id=>circle.personIds.includes(id));
}
function ownedAtmospheres(state:SocialWorld,circles:SocialContext[],people:Identity[]) {
 const byId=new Map(circles.map(circle=>[circle.id,circle]));
 const rows=effectiveAtmospheres({events:state.events,developmentAtmospheres:state.developmentAtmospheres??state.atmospheres}).flatMap(row=>{
  const circle=byId.get(atmosphereCircleReference(row,circles)??'');
  return circle&&atmosphereFitsCircle(row,circle)?[{...row,circleRef:circle.id}]:[];
 });
 const titles=new Map<string,string[]>();
 for(const row of rows){
  const names=titles.get(row.circleRef)??[];names.push(row.title);titles.set(row.circleRef,names);
 }
 const circleTitles=new Map([...titles].map(([id,names])=>[id,circleTitle(byId.get(id)!,people,names)]));
 return rows.map(row=>({...row,title:circleTitles.get(row.circleRef)!}));
}
/** Unbound legacy rows remain stored for taste repair, but are not background for hearing/retrieval. */
export function boundAtmospheres(people:Identity[],state:SocialWorld):DevelopmentAtmosphere[] {return ownedAtmospheres(state,socialContexts(people,state),people);}
export function tasteCircles(world:Pick<WorldSnapshot,'people'|'foundation'|'events'|'atmospheres'>):TasteCircle[] {
 const circles=socialContexts(world.people,world),moods=ownedAtmospheres(world,circles,world.people),byCircle=new Map<string,DevelopmentAtmosphere[]>();
 for(const mood of moods){const rows=byCircle.get(mood.circleRef!)??[];rows.push(mood);byCircle.set(mood.circleRef!,rows);}
 return circles.flatMap(circle=>{const rows=byCircle.get(circle.id)??[];if(circle.kind==='relation'&&!rows.length&&!circle.taste?.manualTitle&&!Array.isArray(circle.taste?.personIds))return [];
  const emotionValues=combineEmotions(rows.map(row=>readEmotion(row.emotion)?.values));
  // Each saved wind can contain a background paragraph followed by its own change.
  const descriptions=new Set(rows.flatMap(row=>row.description.split(/\r?\n[ \t]*\r?\n/u).map(part=>part.trim()).filter(Boolean)));
  const description=descriptions.size?[...descriptions].join('\n\n'):Array.isArray(circle.taste?.personIds)?'成员已调整，等待新的风向。':circle.description;
  return [{id:circle.id,title:rows[0]?.title??circleTitle(circle,world.people),description,personIds:circle.personIds,atmosphereIds:rows.map(row=>row.id),...(emotionValues?{emotionValues}:{}),...(rows.length===1&&rows[0].visual?{visual:rows[0].visual}:{})}];
 });
}
