import {smellFolders} from '../domain/public-messages';
import {seededRandom} from '../vendor/gouhua-vectors/draw';
type SmellFolder=typeof smellFolders[number];

const pool:Record<SmellFolder,{angle:readonly string[];topic:readonly string[];form:readonly string[]}>={
  传闻:{angle:['街坊旁听','行当传话','路人猜测','熟客转述','老搭档打趣','旁桌接话'],topic:['古迹与旧地的异闻','行规与买卖风声','奇物的来历与下落','地方人物轶闻','冤家忽然同桌','常客替谁留座','旧搭档又走得近','两家是否要搭伙','一件礼物几经转手','谁在暗中学谁的手艺','熟人牵线闹了误会'],form:['留有一处疑问','带出不同说法','只写听来的片段','给一条可核对的线索','越传越走样','有人当场拆台']},
  纸媒:{angle:['地方观察','人物侧写','公共事务','行业小记'],topic:['节令与习俗','手艺与物资','邻里协作','街区与公共空间'],form:['以细节开篇','交代来龙去脉','并置两种视角','追踪后续影响']},
  广播:{angle:['地方口播','节令节目','声音走访','听众来信'],topic:['天气与物候','营生与手艺','寻物与互助','街谈与文艺'],form:['听得懂的一段短讲','一问一答','说一段从现场听来的声音','两则简讯串场']},
  公告:{angle:['公共柜台','集会与场地','互助与招募','公共设施'],topic:['物资发放与交换','道路通行与公共交通','防汛防火与卫生','节庆集市与公开活动'],form:['墙上便签','条目式告示','当日启事','附条件的公示']},
  专题:{angle:['地方纪事','公共观察','行当访谈','生活专题'],topic:['行业分工与生计','居住迁徙与聚落变迁','公共工程与共同生活','物产与饮食传统'],form:['顺着一件事展开','跟随一件物品的去向','比较不同人的做法','从现在回望过去']},
  副刊:{angle:['地方传说','怪谈文学','市井短篇','小报连载'],topic:['乡野神怪与民间禁忌','市井人情与小人物生计','行旅归乡与异地生活','师徒与手艺传承'],form:['从一桩误认写起','写成独立的一回','围绕反复出现的细节','收在余韵里']},
};

function roll(values:readonly string[],random:()=>number){
  const faces=[...values];
  return Array.from({length:3},()=>faces.splice(Math.floor(random()*faces.length),1)[0]!);
}

/** Each folder rolls three axes without repeating a face within the batch. */
export function drawSmellDice(seed:string):Record<SmellFolder,string[]> {
  return Object.fromEntries(smellFolders.map(folder=>{
    const {angle,topic,form}=pool[folder],random=seededRandom(`${seed}|${folder}`);
    const angles=roll(angle,random),topics=roll(topic,random),forms=roll(form,random);
    return [folder,angles.map((face,i)=>[face,topics[i],forms[i]].join('｜'))];
  })) as Record<SmellFolder,string[]>;
}
