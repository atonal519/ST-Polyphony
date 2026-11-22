import type {ModelRequester,QuestionMaterialReader,SourcePerson,StoryInput} from '../application/contracts';
import type {WorldEvent} from '../domain/world';
import type {DiagnosticTrace} from '../diagnostics/development';
import {smellFolders,smellPublicationFolder,publicMessagesPerWindow,readPublicMessage,type PublicMessageDraft} from '../domain/public-messages';
import {readStoryClock} from '../host/story-clock';
import {hasPublicQuote,mentionsName,narrativeEvidence,normalizedMention,privateProse,uniqueStoryNames,readPublicCue} from './story-evidence';
import {publicMessageOutput} from './construction-response';
import {list} from './trajectory';
import {seededRandom} from '../vendor/gouhua-vectors/draw';
import {drawSmellDice} from './smell';

const instructions=`你为这个故事的「嗅」生成一批公众能读到或听到的世界刊载物。这次至少给一份，通常写 2–4 份。根据时代和本回合素材挑有意思的题材，选合适的几类即可，通常至少一篇有完整内容的报道、专题或副刊。平静日子也可写公开生活或副刊，别用一串相似的短通知填数。每条都有具体内容和自己的出处。
creativeOptions是各载体本轮抽出的「角度｜题材｜写法」。先按题材找这篇要写的具体对象，从故事里的地点、营生、器物、风俗或公共生活选一个切口，再用对应的角度和写法来呈现。可调整或跳过不合时宜的选项。同批两篇若用同一载体，请选不同题材。同一地点、时段、事件不要换个标题再写一遍。骰面是创作线索，不能当作既成事实或直接拿来当标题。
最终只输出 {"publicMessages":[{"medium":"公告","type":"便签","source":"公开出处","title":"简短标题","body":"可刊载的正文","sourceSeq":1,"mode":"created","visibility":"public","assertedPersonIds":[],"assertsUser":false}]}。正文的对话和引语用中文引号「」或“”，分段写成 \\n，不在 JSON 字符串中直接插入英文双引号。用真实提供的 sourceSeq。medium 主要用 ${smellFolders.join('、')}，实录和公开频道也可以按实际媒介使用。type 和 source 保留具体名称。
公告收便签（20字以内）、告示、启事、通行或活动变动。纸媒写报纸、小报报道、公开书信等，有合适选题时写足约200–450字。广播约100字、口播能直接念。实录可保留公开问答。传闻可以围绕两个本地 NPC。优先从 rumorCandidates 选在此情境能碰上的熟面孔，若有 publicClues，可从那里的一点街面见闻说开去。说话人可以是茶摊边、门房里、同行间的第三人。抓住人人看得见的小细节，让旁人猜两人是不是要搭伙、闹别扭或有点交情；可以误会、夸张、有人接话唱反调。把看见的和猜的写清，别替当事人坐实恋情、翻脸或动机，也别把私下实际发生的事换成“听说”泄露。题材合适时也可传物件或地方异闻。
专题写 500–1000 字（以 650–850 为宜）的公开长稿，如地方纪事、行当观察、公共事务专题或已公开的访谈，按段写出可感的细节、背景和后续，避开个人隐私。副刊也可写 500–1000 字，如怪谈文学、地方传说的文学版、市井短篇、小报连载的一回。副刊在 type 明标文学或连载，人物和怪事可以有趣古怪，明确是世界内公开刊出的虚构作品，不能偷渡成真实内幕、主剧情新事实或具体角色的私人经历。连载的一回可以独立读，不编造已经刊出的前回。长稿通常一批一篇，正文以换行分段。
已经公开发布的消息用 reported，给 quote 字段，逐字引用给定正文中含出处的公开原句，并摘录其中的内容为 body。
created 根据当地共有的场景和生活背景写小事。记忆只供作者理解场景，不能直接作为公众已知事实。people 中 protected:true 的人物本轮须避开：不给他们写新采访、新引语或其他言行。传闻可提到 rumorCandidates 里的场外 NPC，用他们的 P 代号填 assertedPersonIds。其他新稿用无名公众或另起名的虚构人物，assertedPersonIds 给 []。各类新稿都避开 protected:true 的人名、别名。引用已在正文公开的原话走 reported。不要公开私密谈话、未说出口的念头，也不要改变主线或制造严重冲突。`;

function shortStory(story:StoryInput):StoryInput {
  let budget=6800;
  const turns=[];
  for(const turn of story.turns.slice(-9).reverse()){
    if(budget<150)break;
    const text=turn.text.slice(0,Math.min(budget,1800));
    turns.unshift({...turn,text});
    budget-=text.length;
  }
  return {...story,turns};
}

export async function generatePublicMessages(input:{
  story:StoryInput;people:SourcePerson[];protectedIds:readonly string[];channels:string[];creativeSeed:string;
  recentEvents?:readonly WorldEvent[];materials:QuestionMaterialReader;model:ModelRequester;diagnostic?:DiagnosticTrace;signal?:AbortSignal;
}):Promise<PublicMessageDraft[]> {
  const story=shortStory(input.story);
  const protectedPeople=new Set(input.protectedIds);
  const scene=normalizedMention(story.turns.map(turn=>narrativeEvidence(turn.text)).join('\n'));
  const names=uniqueStoryNames(input.people.map(person=>({id:person.id,names:[person.displayName,...person.aliases]})));
  const mentioned=new Set<string>();
  for(const [name,id] of names){if(id&&mentionsName(scene,name))mentioned.add(id);}
  const people=input.people.filter(person=>mentioned.has(person.id)||protectedPeople.has(person.id)||person.specialRole==='user')
    .sort((a,b)=>Number(b.specialRole==='user')-Number(a.specialRole==='user')).slice(0,14);
  const candidates=input.people.filter(person=>person.specialRole!=='user'&&!protectedPeople.has(person.id)&&!mentioned.has(person.id));
  const random=seededRandom(input.creativeSeed+'|rumor-people');
  const rumorCandidates:SourcePerson[]=[];
  while(candidates.length&&rumorCandidates.length<6) {
    rumorCandidates.push(candidates.splice(Math.floor(random()*candidates.length),1)[0]!);
  }
  const focus=people.filter(person=>mentioned.has(person.id)).slice(0,3);
  let background='';
  if(focus.length)try{
    const memory=await input.materials.readForQuestion({personIds:focus.map(person=>person.qqjPersonId??person.id),maxCharacters:1400,
      question:'本段地点、街面日常、公开机构和可以对外报道的安排。'+scene.slice(-200)});
    background=[memory.routerText,...memory.materials.flatMap(item=>item.memoryText.split('\n').filter(line=>/公开|公示|公告|刊登|启事|公报|广播|告示|布告/u.test(line)))].flatMap(text=>text.split('\n'))
      .filter(text=>!privateProse.test(text)).join('\n').slice(0,1400);
  }catch{/* Use the story when a background source is unavailable. */}
  input.signal?.throwIfAborted();
  const limitedPeople=[...people,...rumorCandidates].map(person=>({id:person.id,name:person.displayName,
    protected:person.specialRole==='user'||mentioned.has(person.id)||protectedPeople.has(person.id)}));
  const rumorIds=new Set(rumorCandidates.map(person=>person.id));
  const publicClues:string[]=[];
  const recent=input.recentEvents??[];
  for(let i=recent.length-1;i>=0&&publicClues.length<3;i--){
    const event=recent[i];
    if(event.correction||!event.participantIds.length||!event.participantIds.every(id=>rumorIds.has(id)))continue;
    const cue=readPublicCue(event);
    if(cue&&!publicClues.includes(cue))publicClues.push(cue);
  }
  const answer=await input.model.request({task:'smell',instructions,input:{story:story.turns.map(turn=>({...turn,text:narrativeEvidence(turn.text).split(/\n+/u)
    .filter(paragraph=>!privateProse.test(paragraph)).join('\n')})),people:limitedPeople,
    ...(background?{authorBackground:background}:{}),...(publicClues.length?{publicClues}:{}),rumorCandidates:rumorCandidates.map(person=>({personId:person.id})),existingChannels:input.channels.slice(0,10),
    creativeOptions:drawSmellDice(input.creativeSeed)},signal:input.signal,diagnostic:input.diagnostic});
  const floors=new Map(story.turns.filter(turn=>!turn.isUser&&turn.calibrationEligible!==false&&turn.seq<=(story.throughSeq??0)).map(turn=>[turn.seq,turn]));
  const actorNames=(cast:SourcePerson[])=>[...new Set(cast.flatMap(person=>[person.displayName,...person.aliases])
    .map(normalizedMention).filter(name=>name.length>=2))];
  const reservedNames=actorNames(input.people.filter(person=>!rumorIds.has(person.id)));
  const candidateNames=actorNames(rumorCandidates);
  const drafts=list(publicMessageOutput(answer).publicMessages);
  const messages:PublicMessageDraft[]=[],seen=new Set<string>();
  let actorRejections=0;
  for(const row of drafts){
    if(messages.length===publicMessagesPerWindow)break;
    const mode=row.mode??(row.quote?'reported':'created');
    const quote=typeof row.quote==='string'?row.quote.trim():'';
    const rawSeq=typeof row.sourceSeq==='string'&&/^\d+$/u.test(row.sourceSeq.trim())?Number(row.sourceSeq):row.sourceSeq;
    const message=readPublicMessage({...row,sourceSeq:rawSeq??(mode==='created'?story.throughSeq:undefined),storyTime:undefined});
    if(!message||row.visibility!==undefined&&row.visibility!=='public'||row.assertsUser===true)continue;
    const medium=smellPublicationFolder(row.medium,message.type);
    if(!medium)continue;
    const floor=floors.get(message.sourceSeq);
    const text=[message.title,message.body,message.source].join('\n');
    if(!floor||privateProse.test(text))continue;
    if(mode==='reported'){
      if(!quote||quote.length>1600||!quote.includes(message.source)||!quote.includes(message.body)||!hasPublicQuote(narrativeEvidence(floor.text),quote))continue;
    }else if(mode==='created'){
      if(row.assertedPersonIds!==undefined&&!Array.isArray(row.assertedPersonIds))continue;
      const normalized=normalizedMention(text);
      if(row.assertedPersonIds?.some((id:string)=>medium!=='传闻'||!rumorIds.has(id))||
         reservedNames.some(name=>mentionsName(normalized,name))||
         medium!=='传闻'&&candidateNames.some(name=>mentionsName(normalized,name))){
        actorRejections++;
        continue;
      }
    }else continue;
    const key=JSON.stringify([message.source,message.body]);
    if(seen.has(key))continue;
    seen.add(key);
    const storyTime=readStoryClock([floor]);
    messages.push({...message,medium,...(storyTime?{storyTime}:{})});
  }
  if(drafts.length&&actorRejections===drafts.length)
    throw Error(`模型返回了 ${drafts.length} 篇稿件，均涉及受保护人物或无法确认的人物，未归档。`);
  return messages;
}
