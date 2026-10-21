import { ACHIEVEMENTS } from "./achievements.js";
import { BASE_IDS, CATEGORY_LABELS, DEFAULT_APPEARANCE, ITEMS, itemAvailable, itemName } from "./dressing-data.js";
import { rewardUnlocks } from "./rewards.js";
import type { AchievementUnlock, Appearance, Category, DressingClock, DressingCommand, DressingResult, DressingState, DressingStore, MultiCategory, SingleCategory } from "./types.js";

const DEFAULT_STATE:DressingState={
  version:1,
  initialized:false,
  appearance:{...DEFAULT_APPEARANCE,outfits:[],bottoms:[],shoes:[],accessories:[]},
  touched:{hair:false,makeup:false,scent:false,outfit:false,bottom:false,shoes:false,accessory:false},
  unlockedAchievements:[],
  unlockedRewards:[],
  stats:{
    mirrorCount:0,
    usedHair:[DEFAULT_APPEARANCE.hair],
    usedMakeup:[DEFAULT_APPEARANCE.makeup],
    usedScent:[DEFAULT_APPEARANCE.scent],
    usedOutfits:[],usedBottoms:[],usedShoes:[],usedAccessories:[],
    nakedMirrorStreak:0,noBarefootMirrorStreak:0
  },
  dailyFinalLooks:[]
};

function cloneDefault():DressingState { return structuredClone(DEFAULT_STATE); }
function pushUnique(arr:string[],id:string){ if(!arr.includes(id)) arr.push(id); }
function arrFor(a:Appearance,c:MultiCategory):string[] {
  if(c==="outfit") return a.outfits;
  if(c==="bottom") return a.bottoms;
  if(c==="shoes") return a.shoes;
  return a.accessories;
}
function singleDefault(c:SingleCategory):string {
  return c==="hair"?DEFAULT_APPEARANCE.hair:c==="makeup"?DEFAULT_APPEARANCE.makeup:DEFAULT_APPEARANCE.scent;
}
function signature(a:Appearance):string {
  return JSON.stringify({
    hair:a.hair,makeup:a.makeup,scent:a.scent,
    outfits:[...a.outfits].sort(),bottoms:[...a.bottoms].sort(),shoes:[...a.shoes].sort(),accessories:[...a.accessories].sort()
  });
}

export class DressingEngine {
  constructor(private store:DressingStore,private clock:DressingClock){}

  async execute(cmd:DressingCommand):Promise<DressingResult>{
    return this.store.update(async loaded=>{
      const state=loaded?structuredClone(loaded):cloneDefault();
      const today=this.clock.today();
      let text="";
      const ctx:{justMirrored?:boolean;selectedItemId?:string;selectedCategory?:string;today:string}={today};

      if(!state.initialized){
        state.initialized=true;
        state.firstOpenedDate=today;
      }
      this.ensureCurrentDay(state,today);

      switch(cmd.action){
        case "open":
          text=loaded?this.statusText(state):this.introText();
          break;
        case "status":
          text=this.statusText(state);
          break;
        case "catalog":
          text=this.catalogText(state,cmd.category&&cmd.category!=="all"?cmd.category:undefined);
          break;
        case "select":
          text=this.selectItem(state,cmd.category,cmd.itemId,ctx);
          break;
        case "remove":
          text=this.removeItem(state,cmd.itemId);
          break;
        case "clear":
          text=this.clearCategory(state,cmd.category??"all");
          break;
        case "mirror":
          this.recordMirror(state,today);
          ctx.justMirrored=true;
          text=this.mirrorText(state);
          break;
        case "achievements":
          text=this.achievementText(state);
          break;
        case "rewards":
          text=this.rewardText(state);
          break;
        default:
          text="未识别的梳妆指令。";
      }

      const newAchievements=this.achievementSweep(state,ctx);
      const newRewards=rewardUnlocks(state.unlockedAchievements.length,state.unlockedRewards);
      for(const r of newRewards) state.unlockedRewards.push(r.id);

      return [state,{ok:true,text,newAchievements,newRewards,state}];
    });
  }

  private ensureCurrentDay(state:DressingState,today:string){
    if(!state.currentDay||state.currentDay.date!==today) state.currentDay={date:today,mirrorCount:0,lookSignatures:[]};
  }

  private selectItem(state:DressingState,category:Category|"all"|undefined,itemId:string|undefined,ctx:{selectedItemId?:string;selectedCategory?:string}):string{
    if(!category||category==="all"||!itemId) return "请选择要调整的类别与单品。";
    const item=ITEMS[itemId];
    if(!item||item.category!==category) return "没有找到这个单品，或它不属于所选类别。";
    if(!itemAvailable(itemId,state.unlockedRewards)) return "这件东西还没有解锁。";
    ctx.selectedItemId=itemId;ctx.selectedCategory=category;
    state.touched[category]=true;

    if(category==="hair"||category==="makeup"||category==="scent"){
      state.appearance[category]=itemId;
      const used=category==="hair"?state.stats.usedHair:category==="makeup"?state.stats.usedMakeup:state.stats.usedScent;
      pushUnique(used,itemId);
      return `${CATEGORY_LABELS[category]}已改为：${item.name}。`;
    }

    const arr=arrFor(state.appearance,category);
    if(arr.includes(itemId)) return `${item.name}已经在当前搭配里。`;
    arr.push(itemId);
    const used=category==="outfit"?state.stats.usedOutfits:category==="bottom"?state.stats.usedBottoms:category==="shoes"?state.stats.usedShoes:state.stats.usedAccessories;
    pushUnique(used,itemId);
    return `已加入当前${CATEGORY_LABELS[category]}：${item.name}。`;
  }

  private removeItem(state:DressingState,itemId:string|undefined):string{
    if(!itemId||!ITEMS[itemId]) return "请选择要取下的单品。";
    const item=ITEMS[itemId];
    const c=item.category;
    if(c==="hair"||c==="makeup"||c==="scent"){
      const def=singleDefault(c);
      state.appearance[c]=def;
      state.touched[c]=false;
      return `${CATEGORY_LABELS[c]}已恢复为：${itemName(def)}。`;
    }
    const arr=arrFor(state.appearance,c);
    const i=arr.indexOf(itemId);
    if(i<0) return `${item.name}目前并不在身上。`;
    arr.splice(i,1);
    return `已取下：${item.name}。`;
  }

  private clearCategory(state:DressingState,category:Category|"all"):string{
    const resetSingle=(c:SingleCategory)=>{state.appearance[c]=singleDefault(c);state.touched[c]=false;};
    const resetMulti=(c:MultiCategory)=>{arrFor(state.appearance,c).splice(0);state.touched[c]=false;};
    if(category==="all"){
      resetSingle("hair");resetSingle("makeup");resetSingle("scent");
      resetMulti("outfit");resetMulti("bottom");resetMulti("shoes");resetMulti("accessory");
      return "已经把当前造型重新收拾干净。";
    }
    if(category==="hair"||category==="makeup"||category==="scent") resetSingle(category); else resetMulti(category);
    return `已清空当前${CATEGORY_LABELS[category]}选择。`;
  }

  private recordMirror(state:DressingState,today:string){
    this.ensureCurrentDay(state,today);
    const sig=signature(state.appearance);
    state.stats.mirrorCount+=1;
    state.currentDay!.mirrorCount+=1;
    pushUnique(state.currentDay!.lookSignatures,sig);

    if(state.appearance.outfits.includes("outfit_none")) state.stats.nakedMirrorStreak+=1;
    else state.stats.nakedMirrorStreak=0;

    if(state.appearance.shoes.includes("shoes_barefoot")) state.stats.noBarefootMirrorStreak=0;
    else state.stats.noBarefootMirrorStreak+=1;

    const existing=state.dailyFinalLooks.find(x=>x.date===today);
    if(existing) existing.signature=sig;
    else state.dailyFinalLooks.push({date:today,signature:sig});
    state.dailyFinalLooks.sort((a,b)=>a.date.localeCompare(b.date));
    if(state.dailyFinalLooks.length>14) state.dailyFinalLooks=state.dailyFinalLooks.slice(-14);
  }

  private achievementSweep(state:DressingState,ctx:{justMirrored?:boolean;selectedItemId?:string;selectedCategory?:string;today:string}):AchievementUnlock[]{
    const out:AchievementUnlock[]=[];
    for(const a of ACHIEVEMENTS){
      if(state.unlockedAchievements.includes(a.id)) continue;
      if(a.check(state,ctx)){
        state.unlockedAchievements.push(a.id);
        out.push({id:a.id,name:a.name,description:a.description});
      }
    }
    return out;
  }

  private introText():string{
    return `妆奁已经打开。\n\n这里没有穿搭规则。发式、妆面与香气可以随时更换；衣柜、下装、鞋履与配饰则想叠多少都可以。古今混穿也好，公服配泳裤也好，系统不会阻止你。\n\n换好以后，可以照镜看看。未解锁的成就与累计奖励不会提前剧透。`;
  }

  private statusText(state:DressingState):string{
    return this.mirrorText(state,false);
  }

  private mirrorText(state:DressingState,withHeading=true):string{
    const a=state.appearance;
    const fmt=(ids:string[])=>ids.length?ids.map(itemName).join("、"):"无";
    const lines=[
      withHeading?"镜中今日":"当前造型",
      `梳发：${itemName(a.hair)}`,
      `妆面：${itemName(a.makeup)}`,
      `熏香：${itemName(a.scent)}`,
      `衣柜：${fmt(a.outfits)}`,
      `下装：${fmt(a.bottoms)}`,
      `鞋履：${fmt(a.shoes)}`,
      `配饰：${fmt(a.accessories)}`
    ];
    return lines.join("\n");
  }

  private catalogText(state:DressingState,category?:Category):string{
    const categories:Category[]=category?[category]:["hair","makeup","scent","outfit","bottom","shoes","accessory"];
    const out:string[]=[];
    for(const c of categories){
      out.push(CATEGORY_LABELS[c]);
      for(const item of Object.values(ITEMS).filter(x=>x.category===c&&(x.base||state.unlockedRewards.includes(x.id)))){
        const selected=c==="hair"||c==="makeup"||c==="scent"
          ? state.appearance[c]===item.id
          : arrFor(state.appearance,c).includes(item.id);
        out.push(`${selected?"✓":"·"} ${item.name} [${item.id}]`);
      }
      out.push("");
    }
    return out.join("\n").trim();
  }

  private achievementText(state:DressingState):string{
    const unlocked=ACHIEVEMENTS.filter(a=>state.unlockedAchievements.includes(a.id));
    const lines=[`已解锁成就 ${unlocked.length} / ${ACHIEVEMENTS.length}`];
    if(!unlocked.length) lines.push("尚未解锁任何成就。");
    else for(const a of unlocked) lines.push(`· ${a.name}——${a.description}`);
    lines.push(`其余 ${ACHIEVEMENTS.length-unlocked.length} 个成就尚未点亮。`);
    return lines.join("\n");
  }

  private rewardText(state:DressingState):string{
    const count=state.unlockedAchievements.length;
    const lines=[`累计成就：${count} / ${ACHIEVEMENTS.length}`];
    if(!state.unlockedRewards.length) lines.push("尚未获得累计成就奖励。");
    else {
      lines.push("已获得奖励：");
      for(const id of state.unlockedRewards){ const x=ITEMS[id]; lines.push(`· ${x.name}——${x.description??""}`); }
    }
    const milestones=[3,5,8,12,16,20,24,28,32,36,40,50];
    const next=milestones.find(x=>x>count);
    if(next) lines.push(`下一份累计奖励：解锁 ${next} 个成就后获得（内容保密）。`);
    else lines.push("累计成就奖励已全部获得。 ");
    return lines.join("\n");
  }
}
