import {extractJson} from './json';

const tables=['people','groups','relations','context'];
const wrappers=['result','data','output','worldConstruction','baseline'];
const object=(value:unknown):Record<string,any>|undefined=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:undefined;
const unreadable=()=>new Error('世界基础结果的正式归属或完整记录无法确认，尚未保存，可重新世界构建。');
const unreadableSmell=()=>new Error('模型已返回，但嗅没能读取这批稿件的格式。');
const unreadableFlow=()=>new Error('模型返回内容无法解析为JSON。');
interface Node {value:unknown;complete:boolean;fields?:Map<string,Node>;items?:Node[]}

/** Keep the original structural path. Only closed array records survive an unfinished outer answer. */
function readTree(source:string,invalid:()=>Error,repairField?:'body'|'description') {
 let cursor=0;
 const space=()=>{while(cursor<source.length&&/\s/.test(source[cursor]))cursor++;};
 const proseEnd=/\s*(?:\}|,\s*(?:\}|"(?:[^"\\]|\\.)+"\s*:))/y;
 const nextField=/\s*"(?:[^"\\]|\\.)+"\s*:/y;
 const quoted=(repairQuotes=false):string|undefined=>{
  let start=cursor++,escaped=false,repaired='';
  while(cursor<source.length){
   const char=source[cursor++];
   if(escaped){escaped=false;continue;}
   if(char==='\\'){escaped=true;continue;}
   if(char!=='"')continue;
   // An inner dialogue mark does not end a prose field.
   proseEnd.lastIndex=cursor;
   if(repairQuotes&&!proseEnd.test(source)){
    nextField.lastIndex=cursor;
    if(repairField==='description'&&nextField.test(source))throw invalid();
    repaired+=source.slice(start,cursor-1)+'\\"';start=cursor;continue;
   }
   try{return JSON.parse(repaired+source.slice(start,cursor));}catch{throw invalid();}
  }
  return undefined;
 };
 const read=(repairQuotes=false):Node=>{
  space();const char=source[cursor];
  if(char==='{'||char==='['){
   cursor++;const fields=char==='{'?new Map<string,Node>():undefined,items=char==='['?[] as Node[]:undefined;
   const close=char==='{'?'}':']',node:Node={value:fields?{}:[],complete:false,...(fields?{fields}:{items})};
   space();if(source[cursor]===close){cursor++;node.complete=true;return node;}
   while(cursor<source.length){
    let key:string|undefined;
    if(fields){if(source[cursor]!=='"')return node;key=quoted();if(key===undefined)return node;if(fields.has(key))throw invalid();space();if(source[cursor++]!==':')return node;}
    const child=read(repairField!==undefined&&key===repairField);if(fields){fields.set(key!,child);if(child.complete)Object.defineProperty(node.value,key!,{value:child.value,enumerable:true,configurable:true,writable:true});}else{items!.push(child);if(child.complete)(node.value as unknown[]).push(child.value);}
    if(!child.complete)return node;
    space();if(source[cursor]===close){cursor++;node.complete=true;return node;}
    if(source[cursor++]!==',')return node;
    space();if(source[cursor]===close){cursor++;node.complete=true;return node;}
   }
   return node;
  }
  if(char==='"'){const value=quoted(repairQuotes);return{value,complete:value!==undefined};}
  const start=cursor;while(cursor<source.length&&!/[\s,}\]]/.test(source[cursor]))cursor++;
  try{return{value:JSON.parse(source.slice(start,cursor)),complete:true};}catch{return{value:undefined,complete:false};}
 };
 const root=read();return{root,end:cursor};
}

function incompleteValue(node:Node):unknown {
 if(node.complete)return node.value;
 if(node.items)return node.items.filter(item=>item.complete).map(item=>item.value);
 if(node.fields)return Object.fromEntries([...node.fields].filter(([,child])=>child.complete||child.fields||child.items).map(([key,child])=>[key,incompleteValue(child)]));
 return undefined;
}

function select(value:unknown):Record<string,any> {
 const candidates:Record<string,any>[]=[];
 const visit=(value:unknown)=>{
  const data=object(value);if(!data)return;
  if(object(data.foundation))candidates.push(data);
  else if(tables.some(key=>Array.isArray(data[key])))candidates.push({foundation:Object.fromEntries(tables.filter(key=>Array.isArray(data[key])).map(key=>[key,data[key]])),...(typeof data.quietReason==='string'?{quietReason:data.quietReason}:{})});
  for(const key of wrappers)if(Object.hasOwn(data,key))visit(data[key]);
 };
 visit(value);if(candidates.length!==1)throw unreadable();return candidates[0];
}

/** Read complete rows within one explicitly rooted response, including its final unfinished table. */
export function readStructuredPrefix(value:string,kind:'construction'|'smell'|'flow'='construction'):{data:unknown;complete:boolean} {
 const invalid=kind==='flow'?unreadableFlow:kind==='smell'?unreadableSmell:unreadable;
 const repairField=kind==='flow'?'description':kind==='smell'?'body':undefined;
 let source=value.trim();
 const fenceStart=source.indexOf('```'),fenced=fenceStart>=0;
 if(fenced){
  const introduction=source.slice(0,fenceStart).trim();
  // An independent JSON fence identifies the result through ordinary introductions, not example labels.
  if(/[{\[]/.test(introduction)||/(?:例如|示例|例子|\bexample\b|\bsample\b)/iu.test(introduction))throw invalid();
  source=source.slice(fenceStart).replace(/^```(?:json)?\s*/i,'');
 }
 if(!source.startsWith('{')&&!(kind==='smell'&&source.startsWith('[')))throw invalid();
 const {root,end}=readTree(source,invalid,repairField);
 if(kind==='flow'&&!root.complete)throw invalid();
 let tail=source.slice(end).trim();
 if(fenced&&tail.startsWith('```'))tail=tail.slice(3).trim();
 // Never choose the first of several answers, or scan a nested example after a damaged root.
 if(tail&&/[{\[]|```/.test(tail))throw invalid();
 return {data:root.complete?extractJson(root.value):incompleteValue(root),complete:root.complete};
}

export function constructionResponse(value:unknown):Record<string,any> {
 if(typeof value!=='string')return select(value);
 const decoded=readStructuredPrefix(value);
 const data=select(decoded.data);
 const foundation=object(data.foundation)!;
 if(!tables.some(key=>Array.isArray(foundation[key])))throw unreadable();
 if(!decoded.complete&&!tables.some(key=>Array.isArray(foundation[key])&&foundation[key].length))throw unreadable();
 return data;
}

export function publicMessageOutput(value:unknown):{publicMessages:unknown[]} {
  let decoded=value;
  if(typeof value==='string'){
    try{decoded=extractJson(value);}
    catch{decoded=readStructuredPrefix(value,'smell').data;}
  }
  if(Array.isArray(decoded))return{publicMessages:decoded};
  let data=object(decoded);
  for(let depth=0;data&&depth<4;depth++){
    if(Array.isArray(data.publicMessages))return{publicMessages:data.publicMessages};
    if(object(data.publicMessages))return{publicMessages:[data.publicMessages]};
    if(Object.hasOwn(data,'body')&&Object.hasOwn(data,'source'))return{publicMessages:[data]};
    data=object(data.result??data.data??data.output);
  }
  return{publicMessages:[]};
}
