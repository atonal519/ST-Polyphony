<script setup lang="ts">
import {computed,nextTick,onBeforeUnmount,ref,shallowRef,watch} from 'vue';
import type {ControllerState,PublicMessageRepository} from '../application/contracts';
import type {DevelopmentView} from '../application/development';
import type {SmellGeneration} from '../application/smell-generation';
import {smellFolders,type PublicMessage,type PublicMessageRef} from '../domain/public-messages';
import ModuleHealth from './ModuleHealth.vue';
import SmellFolderHome from './SmellFolderHome.vue';
import SmellMediaCard from './SmellMediaCard.vue';

const props=withDefaults(defineProps<{state:ControllerState;development?:DevelopmentView;active:boolean;panel?:HTMLElement;reader?:Pick<PublicMessageRepository,'read'>;generation?:SmellGeneration;enabled?:boolean}>(),{enabled:true});
const emit=defineEmits<{open:[value:boolean]}>();
type Folder={medium:string;count:number;pages:PublicMessageRef[][];notice?:PublicMessageRef;recent:boolean;tone:string};
type FiledMessage={recordId:string;key:string;entry:PublicMessage};
const folderTones=new Map([['公告','notice'],['专题','feature'],['副刊','supplement']]);
const tone=(medium:string)=>folderTones.get(medium)??(/广播|电台|radio/iu.test(medium)?'radio':/传闻|rumou?r/iu.test(medium)?'rumor':'paper');
const pageSize=8;
const generationView=computed(()=>props.generation?.view.value);
const generationError=computed(()=>generationView.value?.error||(!generationView.value?.busy&&generationView.value?.directoryError)||'');
const scopeId=computed(()=>(props.generation?generationView.value?.scopeId:props.state.world.id)??null);
const viewedNotices=shallowRef(new Map<string,string>());
const noticeKey=(scope:string)=>'st-dollars:smell-viewed:'+scope;
watch(scopeId,scope=>{
  let stored:unknown;
  try{if(scope)stored=JSON.parse(window.localStorage?.getItem(noticeKey(scope))??'null');}catch{/* Storage may be unavailable in this browser. */}
  viewedNotices.value=new Map(Object.entries(stored&&typeof stored==='object'&&!Array.isArray(stored)?stored:{})
    .filter((entry):entry is [string,string]=>typeof entry[1]==='string'));
},{immediate:true});
function markViewed(scope:string,medium:string,recordId:string){
  if(viewedNotices.value.get(medium)===recordId)return;
  const next=new Map(viewedNotices.value).set(medium,recordId);
  viewedNotices.value=next;
  try{window.localStorage?.setItem(noticeKey(scope),JSON.stringify(Object.fromEntries(next)));}catch{/* Keep the receipt in this view. */}
}
const folderRefs=computed(()=>{
  const legacy=scopeId.value===props.state.world.id?props.state.world.publicMessageIndex??[]:[];
  return [...legacy,...(generationView.value?.refs??[])].reverse().sort((a,b)=>b.throughSeq-a.throughSeq||(b.publishedAt??0)-(a.publishedAt??0));
});
const readyLabel=computed(()=>folderRefs.value.length?'公开消息按载体归档。':'尚未生成公开消息。');
const folders=computed(()=>{
  const windowId=props.state.world.lastHearingWindow?.id;
  const prefix=windowId?`media-${windowId}-`:'';
  const throughSeq=props.state.processedThroughSeq;
  const refs=folderRefs.value;
  const grouped=new Map<string,Folder>(smellFolders.map(medium=>[medium,{medium,count:0,pages:[[]],recent:false,tone:tone(medium)}]));
  for(const item of refs){
    let folder=grouped.get(item.medium);
    if(!folder){folder={medium:item.medium,count:0,pages:[[]],recent:false,tone:tone(item.medium)};grouped.set(item.medium,folder);}
    const page=folder.pages.at(-1)!;
    if(page.reduce((count,ref)=>count+ref.count,0)+item.count>pageSize)folder.pages.push([item]);
    else page.push(item);
    folder.count+=item.count;
    const candidate=item.batchKey||(prefix
      ?item.recordId.startsWith(prefix)&&/^\d+$/u.test(item.recordId.slice(prefix.length))
      :item.throughSeq===throughSeq);
    if(candidate&&(!folder.notice||(item.publishedAt??0)>(folder.notice.publishedAt??0)))folder.notice=item;
  }
  for(const item of grouped.values())item.recent=!!item.notice&&viewedNotices.value.get(item.medium)!==item.notice.recordId;
  return [...grouped.values()];
});

const folder=shallowRef<Folder>(),readPages=shallowRef<FiledMessage[][]>([]),page=ref(0);
const entries=computed(()=>readPages.value.flat());
const phase=ref<'closed'|'opening'|'open'|'closing'>('closed'),loading=ref(false),readError=ref('');
const moving=computed(()=>phase.value==='opening'||phase.value==='closing');
const lip=ref<HTMLButtonElement>(),scroller=ref<HTMLElement>(),surface=ref<HTMLElement>(),body=ref<HTMLElement>();
const next=ref<HTMLButtonElement>(),retry=ref<HTMLButtonElement>();
const cache=new Map<string,PublicMessage[]>();
let origin:HTMLButtonElement|undefined,overview:HTMLElement|undefined,scrollTop=0;
let animation:Animation|undefined,life=0,request=0;

function reset(restore=false){
  life++;request++;
  animation?.cancel();animation=undefined;
  if(folder.value)emit('open',false);
  const tile=origin,scroll=overview,oldTop=scrollTop;
  folder.value=undefined;origin=undefined;overview=undefined;
  phase.value='closed';loading.value=false;readPages.value=[];readError.value='';
  if(restore)void nextTick(()=>{
    if(!props.active||folder.value)return;
    if(scroll)scroll.scrollTop=oldTop;
    tile?.focus({preventScroll:true});
  });
}
watch(scopeId,()=>{reset();cache.clear();});
watch(()=>props.active,active=>{if(!active)reset();});
onBeforeUnmount(()=>reset());

async function browse(index:number){
  const picked=folder.value,scope=scopeId.value,refs=picked?.pages[index];
  if(!refs||!scope||!props.reader)return;
  const ticket=++request;
  const current=()=>ticket===request&&props.active&&scope===scopeId.value;
  page.value=index;loading.value=true;readError.value='';
  if(!readPages.value.length&&scroller.value)scroller.value.scrollTop=0;
  const missing=refs.filter(ref=>!cache.has(ref.recordId));
  const received=new Map<string,PublicMessage[]>();
  try {
    const records=missing.length?await props.reader.read(scope,missing):[];
    if(!current())return;
    for(const record of records){
      const ref=missing.find(ref=>ref.recordId===record.recordId);
      if(!ref)continue;
      received.set(record.recordId,record.entries);
      if(record.entries.length===ref.count)cache.set(record.recordId,record.entries);
    }
  }catch{
    if(!current())return;
  }
  if(!current())return;
  const results=refs.flatMap(({recordId})=>(cache.get(recordId)??received.get(recordId)??[])
    .map((entry,index)=>({recordId,key:recordId+':'+index,entry})))
    .sort((a,b)=>b.entry.sourceSeq-a.entry.sourceSeq);
  const pages=readPages.value.slice();
  pages[index]=results;readPages.value=pages;
  if(picked.notice&&cache.has(picked.notice.recordId))markViewed(scope,picked.medium,picked.notice.recordId);
  if(results.length<refs.reduce((count,ref)=>count+ref.count,0))readError.value=results.length?'有些消息暂时无法读取。':'这批消息暂时无法读取。';
  while(cache.size>64)cache.delete(cache.keys().next().value!);
  loading.value=false;
}

async function travel(tile:HTMLButtonElement,expanding:boolean){
  const layer=surface.value,panel=props.panel;
  if(!layer?.animate||!panel||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
  const bounds=panel.getBoundingClientRect(),rect=tile.getBoundingClientRect();
  if(!bounds.width||!bounds.height||!rect.width||!rect.height)return;
  const atTile={transform:`translate(${rect.left-bounds.left}px,${rect.top-bounds.top}px) scale(${rect.width/bounds.width},${rect.height/bounds.height})`,opacity:.84};
  const full={transform:'none',opacity:1};
  const motion=layer.animate(expanding?[atTile,full]:[full,atTile],{
    duration:expanding?360:270,easing:expanding?'cubic-bezier(.16,1,.3,1)':'cubic-bezier(.4,0,.2,1)',fill:'both',
  });
  animation=motion;
  try{await motion.finished;}catch{/* Closing the panel cancels the animation. */}
  if(animation===motion){animation=undefined;motion.cancel();}
}
async function open(item:Folder,tile:HTMLButtonElement){
  if(!props.active||!props.panel||(!props.reader&&item.count>0)||phase.value!=='closed')return;
  origin=tile;
  overview=body.value?.closest<HTMLElement>('.bmx-shell-content')??undefined;
  scrollTop=overview?.scrollTop??0;
  const ticket=++life;
  folder.value=item;phase.value='opening';emit('open',true);
  void browse(0);
  await nextTick();
  if(life!==ticket||!origin)return;
  await travel(origin,true);
  if(life!==ticket)return;
  phase.value='open';
  await nextTick();
  if(life===ticket)lip.value?.focus({preventScroll:true});
}
function openMedium(medium:string,tile:HTMLButtonElement){
  const item=folders.value.find(folder=>folder.medium===medium);
  if(item)void open(item,tile);
}
async function close(){
  if(phase.value!=='open'&&phase.value!=='opening')return;
  request++;
  const ticket=++life;
  animation?.cancel();
  phase.value='closing';
  await nextTick();
  if(origin)await travel(origin,false);
  if(life===ticket)reset(true);
}
defineExpose({close});
function keydown(event:KeyboardEvent){
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();void close();return;}
  if(event.key!=='Tab')return;
  const targets=[lip.value,scroller.value,retry.value,next.value]
    .filter((target):target is HTMLElement=>Boolean(target)&&!(target as HTMLButtonElement).disabled);
  const boundary=event.shiftKey?targets[0]:targets.at(-1);
  if(event.target===boundary){
    event.preventDefault();
    (event.shiftKey?targets.at(-1):targets[0])?.focus({preventScroll:true});
  }
}
</script>

<template>
 <section ref="body" class="bmx-page bmx-smell-page" :class="{'has-folders':active}" role="tabpanel" aria-labelledby="bmx-tab-smell">
  <p v-if="generationView" class="bmx-page-health" :class="{healthy:!!scopeId&&!generationError&&!generationView.busy}" :role="generationError?'alert':'status'">{{ generationError || generationView.message || (scopeId ? readyLabel : '打开聊天后即可新增公开消息。') }}</p>
  <ModuleHealth v-else :state="state" :development="development" :ready-label="readyLabel"/>
  <SmellFolderHome :folders="folders" :active="active" :enabled="!!panel" :reading="folder?.medium" :scope-id="scopeId" @open="openMedium">
    <button v-if="generation" class="bmx-smell-generate" type="button" :disabled="!enabled||generationView?.busy" @click="generation.generate">
      <span aria-hidden="true">＋</span>{{ generationView?.busy?'新增中…':'新增消息' }}
    </button>
  </SmellFolderHome>
  <Teleport v-if="panel && folder" :to="panel">
   <section id="bmx-smell-folder-view" class="bmx-smell-folder-view" :data-moving="moving ? '' : undefined" role="dialog" aria-modal="true" aria-labelledby="bmx-smell-folder-name" @keydown="keydown">
    <button ref="lip" class="bmx-smell-lip" type="button" :aria-label="'合上'+folder.medium" @click="close">
     <strong id="bmx-smell-folder-name">{{ folder.medium }}</strong><small>{{ folder.count }} 条</small><i aria-hidden="true"></i>
    </button>
    <div ref="scroller" class="bmx-smell-sheets" tabindex="0" role="region" aria-label="公开消息" :aria-busy="loading">
     <SmellMediaCard v-for="message in entries" :key="message.key" :entry="message.entry" :medium="folder.medium" :record-id="message.recordId"/>
     <p v-if="!folder.count" class="bmx-empty-state">这个文件夹还没有消息。</p>
     <p v-if="loading" class="bmx-smell-read-state" role="status">正在读取消息…</p>
     <div v-if="readError" class="bmx-smell-read-state"><p role="status">{{ readError }}</p><button ref="retry" type="button" @click="browse(page)">重读这批</button></div>
     <button v-if="page+1<folder.pages.length" ref="next" class="bmx-smell-more" type="button" :disabled="loading" @click="browse(page+1)">继续读取</button>
    </div>
    <button type="button" class="bmx-smell-edge is-left" tabindex="-1" aria-label="从左侧合上" @click="close"></button>
    <button type="button" class="bmx-smell-edge is-right" tabindex="-1" aria-label="从右侧合上" @click="close"></button>
   </section>
   <div v-show="moving" ref="surface" class="bmx-smell-motion" aria-hidden="true"></div>
  </Teleport>
 </section>
</template>
