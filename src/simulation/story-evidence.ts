export const narrativeEvidence = (body:string) => body.replace(/<!--[\s\S]*?-->|\[DRAFT\][\s\S]*?\[\/DRAFT\]/gi,'');
export const normalizedMention = (value: string) => value.normalize('NFKC').toLowerCase().trim();
export function mentionsName(body: string, name: string) {
  if (!body.includes(name)) return false;
  if (!/^[\p{Script=Latin}\d _.'-]+$/u.test(name)) return true;
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'u').test(body);
}

export function uniqueStoryNames(people:Iterable<{id:string;names:string[]}>) {
  const possibleNames = new Map<string, string | null>();
  for (const person of people) for (const name of person.names.map(normalizedMention)) {
    if ([...name].length < 2) continue;
    const other = possibleNames.get(name);
    possibleNames.set(name, other === undefined || other === person.id ? person.id : null);
  }
  return possibleNames;
}

// Explicit secrecy in the cited sentence makes it unsuitable for shared context.
export const privateProse = /私下|私密|私语|窃窃私语|悄悄话|背着[众人大家他她旁人]|避开[众人大家旁人耳目]|趁[^。！？!?\n]{0,20}(?:没人|没被人|谁都没|无人)[^。！？!?\n]{0,16}(?:看见|看到|听见|注意)|(?:在)?(?:心里|心中|内心|暗自|暗暗|默默)[^。！？!?\n]{0,12}(?:想|嫌|骂|猜|叹|盘算|觉得|希望|担心|琢磨|不满|埋怨|记恨|下定决心)|未(?:曾)?说出口|没(?:有)?说出口|(?:无人|没人|只有[^。！？!?\n]{1,10}自己)(?:知道|听见)|\b(?:in private|privately|to (?:him|her|them)self|unspoken|secretly)\b/iu;
/** A cue is opt-in per event. Old private summaries are never used as a fallback. */
export function readPublicCue(row:{publicCue?:unknown;description?:unknown;visibility?:unknown;usesKnowledge?:unknown}) {
  const cue=typeof row.publicCue==='string'?row.publicCue.trim():'';
  if(!cue || cue.length>80 || /[{}<>\r\n]/u.test(cue) || typeof row.description!=='string' ||
    (row.visibility!==undefined && row.visibility!=='public') || privateProse.test(row.description) ||
    (Array.isArray(row.usesKnowledge)&&row.usesKnowledge.length) || !row.description.includes(cue)) return '';
  return cue;
}

export function hasPublicQuote(body:string,quote:string):boolean {
  for(let at=body.indexOf(quote);at>=0;at=body.indexOf(quote,at+quote.length)){
    const before=body.slice(0,at).match(/[^。！？!?\n]*$/u)?.[0]??'';
    const endsSentence=/[。！？!?][”’"」』）】]*$/u.test(quote);
    const after=endsSentence?'':body.slice(at+quote.length).match(/^[^。！？!?\n]*/u)?.[0]??'';
    if(!privateProse.test(before+quote+after))return true;
  }
  return false;
}
