import { ACHIEVEMENTS } from "./achievements.js";
import { BASE_IDS, ITEMS, V1_BASE_IDS } from "./dressing-data.js";
import { DressingEngine, completedToday } from "./dressing-engine.js";
import { dressingToolSchema } from "./dressing-tool.js";
import { rewardUnlocks } from "./rewards.js";
import type { Category, DressingState, DressingStore } from "./types.js";

function expect(ok:boolean,msg:string){if(!ok) throw new Error(`TEST FAILED: ${msg}`);}
class MemoryStore implements DressingStore {
  state:DressingState|null=null;
  async load(){return this.state?structuredClone(this.state):null;}
  async update<T>(fn:(state:DressingState|null)=>Promise<[DressingState,T]>|[DressingState,T]):Promise<T>{
    const [next,value]=await fn(this.state?structuredClone(this.state):null);this.state=structuredClone(next);return value;
  }
}

const store=new MemoryStore();
let day="2026-10-21";
const engine=new DressingEngine(store,{today:()=>day});
const has=(id:string)=>store.state!.unlockedAchievements.includes(id);

expect(ACHIEVEMENTS.length===60,"achievement count should be 60");
expect(new Set(ACHIEVEMENTS.map(a=>a.id)).size===ACHIEVEMENTS.length,"achievement ids are unique");
expect(rewardUnlocks(2,[]).length===0,"no reward before 3 achievements");
expect(rewardUnlocks(50,[]).length===12,"all 12 reward milestones should unlock by 50 achievements");
expect(ITEMS.reward_supreme_gold_crocs!.description!.startsWith("满 50 成就纪念品"),"the last reward is the 50-achievement keepsake");

// 0.3.0: the new batch is in, the v1 batch is unchanged, “不穿” stays last.
expect(BASE_IDS.hair.length===12&&BASE_IDS.outfit.length===39&&BASE_IDS.bottom.length===16&&BASE_IDS.accessory.length===50,"0.3.0 adds 2 hairstyles, 12 outfits, 5 bottoms and 16 accessories");
expect(V1_BASE_IDS.hair.length===10&&V1_BASE_IDS.outfit.length===27&&V1_BASE_IDS.bottom.length===11&&V1_BASE_IDS.shoes.length===13&&V1_BASE_IDS.accessory.length===34,"the v1 batch is still the original items");
expect(BASE_IDS.outfit.at(-1)==="outfit_none"&&BASE_IDS.bottom.at(-1)==="bottom_none","“不穿” stays last in its column");
expect(ITEMS.acc_gold_dragon_spine_chain!.name==="黄金龙脊骨背链","龙脊骨, not 龙脊谷");
await engine.execute({action:"open"});

// Before today's completion the mirror only shows a naked fox; changing clothes alone never unlocks anything.
const fox=await engine.execute({action:"mirror"});
expect(fox.text.includes("裸狐"),"mirror before completing shows the naked fox");
await engine.execute({action:"select",category:"outfit",itemId:"outfit_hanjin"});
await engine.execute({action:"select",category:"outfit",itemId:"outfit_black_turtleneck"});
await engine.execute({action:"select",category:"bottom",itemId:"bottom_swim"});
const picked=await engine.execute({action:"select",category:"shoes",itemId:"shoes_red_heels"});
expect(picked.state.unlockedAchievements.length===0,"selecting alone must not unlock achievements");
expect(picked.state.stats.usedOutfits.length===0,"items only count as tried once the look is completed");

// Completing the look: achievements are judged on this outfit.
const done=await engine.execute({action:"complete"});
expect(done.state.appearance.outfits.length===2,"multiple outfits must be allowed");
expect(done.state.appearance.bottoms.includes("bottom_swim"),"bottom should remain selected");
expect(done.state.appearance.shoes.includes("shoes_red_heels"),"shoe should remain selected");
expect(has("first_mirror"),"first completion should unlock 初整衣冠");
expect(has("most_indecent_menswear"),"black turtleneck achievement should unlock");
expect(has("ancient_modern"),"ancient + modern should unlock");
expect(done.state.unlockedRewards.includes("reward_swim_goggles"),"3-achievement reward should unlock");
expect(completedToday(done.state,day),"today's completion is recorded");
expect(!(dressingToolSchema(false).parameters.properties.action.enum as readonly string[]).includes("complete"),"no complete option once today's completion is used");

// Only one completion a day: dressing up afterwards is still allowed but does not count today.
await engine.execute({action:"select",category:"outfit",itemId:"outfit_ritual_white_gold"});
await engine.execute({action:"select",category:"accessory",itemId:"acc_elven_circlet"});
const again=await engine.execute({action:"complete"});
expect(again.text.includes("今天已经完成过"),"a second completion on the same day is refused");
expect(!has("middle_earth"),"changes after today's completion do not count today");

// The mirror shows the completed look, not the draft; three mirrors a day (naked fox included) unlock 照花前后镜.
const seen=await engine.execute({action:"mirror"});
expect(seen.text.includes("汉晋款峨冠博带")&&!seen.text.includes("白纱金线祭祀长袍"),"mirror shows today's completed look, not the draft");
expect(!has("mirror_10_day"),"two mirrors are not enough");
await engine.execute({action:"mirror"});
expect(has("mirror_10_day"),"three mirrors in one day (naked fox counts) unlock 照花前后镜");

// Next day: the draft is still on; the naked fox is back until today's completion.
day="2026-10-22";
const fox2=await engine.execute({action:"mirror"});
expect(fox2.text.includes("裸狐"),"a new day starts with the naked fox in the mirror");
await engine.execute({action:"complete"});
expect(has("middle_earth"),"Middle-earth core pair should unlock despite extra items");

// No slot conflict: multiple shoes and head/face accessories may coexist.
await engine.execute({action:"select",category:"shoes",itemId:"shoes_barefoot"});
await engine.execute({action:"select",category:"shoes",itemId:"shoes_oxford"});
await engine.execute({action:"select",category:"accessory",itemId:"acc_sunglasses"});
await engine.execute({action:"select",category:"accessory",itemId:"acc_gold_wire_glasses"});
const layered=await engine.execute({action:"status"});
expect(layered.state.appearance.shoes.length>=3,"multiple shoes should coexist");
expect(layered.state.appearance.accessories.includes("acc_sunglasses")&&layered.state.appearance.accessories.includes("acc_gold_wire_glasses"),"multiple face accessories should coexist");
expect(layered.text.includes("今天已经完成过搭配了"),"status says whether today's look is done");

// Removing the wrong single-select item must not reset the current selection.
await engine.execute({action:"select",category:"hair",itemId:"hair_wet"});
const wrongHairRemoval=await engine.execute({action:"remove",itemId:"hair_curls"});
expect(wrongHairRemoval.state.appearance.hair==="hair_wet","removing an unselected hairstyle must not reset current hair");
expect(wrongHairRemoval.text.includes("目前并不是当前梳发"),"wrong single-item removal should explain that the item is not active");

// Runtime callers may still pass a bad category even though the tool schema has an enum.
const badCatalog=await engine.execute({action:"catalog",category:"wardrobe" as any});
expect(badCatalog.text.includes("没有这个类别"),"invalid catalog category should return a clear error");

// 时尚先锋: three consecutive days whose completed looks all differ.
// 袒裼裸裎: three completions in a row wearing “不穿” (a day off doesn't break it; a completion without it does).
const store2=new MemoryStore();
let day2="2026-11-01";
const engine2=new DressingEngine(store2,{today:()=>day2});
const has2=(id:string)=>store2.state!.unlockedAchievements.includes(id);
const pick=(category:Category,itemId:string)=>engine2.execute({action:"select",category,itemId});
const finish=()=>engine2.execute({action:"complete"});

day2="2026-11-01"; await pick("outfit","outfit_none"); await finish();          // look A, 不穿 ×1
day2="2026-11-02"; await finish();                                              // look A again, 不穿 ×2
expect(!has2("five_looks_day"),"two days are not enough for 时尚先锋");
day2="2026-11-03"; await engine2.execute({action:"remove",itemId:"outfit_none"}); await pick("outfit","outfit_hanjin"); await finish(); // look B, dressed
expect(!has2("naked_3"),"a completion without 不穿 breaks the streak");
expect(!has2("five_looks_day"),"the same look twice within three days does not count");
day2="2026-11-05"; await engine2.execute({action:"remove",itemId:"outfit_hanjin"}); await pick("outfit","outfit_none"); await finish(); // look A, 不穿 ×1 (11-04 skipped)
day2="2026-11-06"; await pick("hair","hair_short"); await finish();             // look C, 不穿 ×2
expect(!has2("five_looks_day"),"a skipped day breaks 时尚先锋");
day2="2026-11-07"; await pick("hair","hair_braided"); await finish();           // look D, 不穿 ×3
expect(has2("naked_3"),"three completions in a row with 不穿 unlock 袒裼裸裎");
expect(has2("five_looks_day"),"three consecutive days with different completed looks unlock 时尚先锋");

// “尝试过几种”只算完成过的搭配：一开始的披发不先算一种。
{
  const store3=new MemoryStore();
  let day3="2026-12-01";
  const engine3=new DressingEngine(store3,{today:()=>day3});
  for (const [d,hair] of [["2026-12-01","hair_wet"],["2026-12-02","hair_short"]] as const) {
    day3=d;
    await engine3.execute({action:"select",category:"hair",itemId:hair});
    await engine3.execute({action:"complete"});
  }
  expect(!store3.state!.unlockedAchievements.includes("hair_3"),"two completed hairstyles are not three (the starting 披发 only counts once worn to a completion)");
  day3="2026-12-03";
  await engine3.execute({action:"select",category:"hair",itemId:"hair_braided"});
  await engine3.execute({action:"complete"});
  expect(store3.state!.unlockedAchievements.includes("hair_3"),"three completed hairstyles unlock 千丝万缕");
}

// A 0.1.x save (no completion counters yet) keeps working.
{
  const store4=new MemoryStore();
  const old=structuredClone(store.state!) as any;
  delete old.stats.completeCount;delete old.stats.nakedCompleteStreak;delete old.stats.noBarefootCompleteStreak;delete old.completedLook;
  store4.state=old;
  await new DressingEngine(store4,{today:()=>"2026-12-10"}).execute({action:"complete"});
  const st=store4.state!.stats;
  expect(st.completeCount===1&&Number.isFinite(st.nakedCompleteStreak)&&Number.isFinite(st.noBarefootCompleteStreak),"an old save gets its new counters filled in");
}

// 0.3.0: a fresh save per check; each look is put on from scratch and completed on its own day.
const fresh=()=>{
  const st=new MemoryStore();
  let n=0;
  const eng=new DressingEngine(st,{today:()=>new Date(Date.UTC(2027,0,1+n)).toISOString().slice(0,10)});
  const look=async(items:[Category,string][])=>{
    n+=1;
    await eng.execute({action:"clear",category:"all"});
    for (const [category,itemId] of items) {
      const r=await eng.execute({action:"select",category,itemId});
      expect(!r.text.includes("没有找到")&&!r.text.includes("还没有解锁"),`${itemId} can be put on`);
    }
    return eng.execute({action:"complete"});
  };
  return {look,has:(id:string)=>st.state!.unlockedAchievements.includes(id)};
};

// The ten new achievements.
{
  const {look,has}=fresh();
  await look([["hair","hair_loose_low_bun"]]);
  expect(has("gentle_husband"),"松散低盘发 unlocks 温柔人夫");
  await look([["outfit","outfit_wizard_robe"],["accessory","acc_broom"]]);
  expect(!has("magic_fox_letter"),"robe and broom without the hat are not enough");
  await look([["outfit","outfit_wizard_robe"],["accessory","acc_broom"],["accessory","acc_wizard_hat"],["bottom","bottom_swim"]]);
  expect(has("magic_fox_letter"),"robe, broom and hat unlock 魔法狐狐的入学通知书 despite extra items");
  await look([["outfit","outfit_piggy"]]);
  expect(has("starch_sausage_calling"),"小猪套装 unlocks 淀粉肠的呼唤");
  await look([["outfit","outfit_feitian_dance"]]);
  expect(has("mural_millennium"),"飞天伎乐舞服 unlocks 画壁千年");
  await look([["accessory","acc_ivory_hu"]]);
  expect(has("court_brawl"),"牙笏 unlocks 已经装备武器，准备朝堂互殴");
  await look([["outfit","outfit_gothic_wedding"]]);
  expect(!has("black_elegy"),"the gothic wedding dress alone is not enough");
  await look([["outfit","outfit_gothic_wedding"],["accessory","acc_black_lace_veil"]]);
  expect(has("black_elegy"),"gothic wedding dress and black lace veil unlock 黑色挽歌");
  await look([["accessory","acc_fox_ears"]]);
  expect(has("give_it_back"),"妙脆角狐狐耳朵 unlocks 还给你了");
  await look([["shoes","shoes_xiegong_clogs"]]);
  expect(has("cloud_ladder"),"谢公屐 unlocks 青云梯");
  await look([["bottom","bottom_black_stockings"],["bottom","bottom_white_garter_stockings"],["bottom","bottom_purple_lace_briefs"],["bottom","bottom_piggy_dot_briefs"]]);
  expect(has("bottom_stack_2")&&!has("budget_airline"),"four bottoms: 层层叠叠 yes, 廉航经济舱 not yet");
  await look([["bottom","bottom_black_stockings"],["bottom","bottom_white_garter_stockings"],["bottom","bottom_purple_lace_briefs"],["bottom","bottom_piggy_dot_briefs"],["bottom","bottom_wave_mermaid_skirt"]]);
  expect(has("budget_airline"),"five bottoms unlock 廉航经济舱");
  await look([["outfit","outfit_tropical_grass_skirt"]]);
  expect(has("sun_sand_waves_cactus"),"热带草裙套装 unlocks 阳光、沙滩、海浪、仙人掌");
}
{
  const {look,has}=fresh();
  await look([["bottom","bottom_swim"],["bottom","bottom_dark_jeans"]]);
  expect(has("bottom_stack_2"),"two bottoms at once already count for 层层叠叠");
}

// The new items join the old hidden achievements through their tags.
{
  const {look,has}=fresh();
  await look([["outfit","outfit_gold_bead_lingerie"]]);
  expect(has("bold_first"),"黄金珠链内衣 counts as bold (狐狐的诱惑)");
  await look([["outfit","outfit_baroque_corset"],["bottom","bottom_none"]]);
  expect(has("bold_bottom_mix"),"巴洛克胸衣 + 不穿下装 unlocks 创新驱动发展");
  await look([["outfit","outfit_beige_suit"],["shoes","shoes_barefoot"]]);
  expect(has("formal_barefoot"),"米色西装套装 counts as formal (跣足而游)");
  await look([["outfit","outfit_gothic_wedding"],["makeup","makeup_full"],["scent","scent_agarwood"]]);
  expect(has("full_firepower"),"哥特黑婚纱 counts as formal (火力全开)");
  await look([["accessory","acc_fox_ears"],["accessory","acc_wizard_hat"],["accessory","acc_plain_hair_ribbon"]]);
  expect(has("head_construction"),"three new head/face accessories unlock 头顶违章建筑");
  await look([["outfit","outfit_purple_official"],["bottom","bottom_black_stockings"]]);
  expect(has("mix_genius"),"an ancient formal outfit with the new modern stockings unlocks 混搭天才");
}

// Changed: 理发店VIP is any 10 hairstyles; 行走的杂货铺 / 裤子也是衣服 / 履迹纷纷 only count the v1 batch.
{
  const {look,has}=fresh();
  const hairs=["hair_side_loose","hair_loose_low_bun","hair_crowned","hair_twintails","hair_side_ponytail","hair_curls","hair_short","hair_low_ponytail","hair_high_ponytail","hair_braided"];
  for (const h of hairs.slice(0,9)) await look([["hair",h]]);
  expect(!has("hair_all"),"nine hairstyles are not ten");
  await look([["hair",hairs[9]!]]);
  expect(has("hair_all"),"any ten hairstyles (new ones included) unlock 理发店VIP");
}
{
  const {look,has}=fresh();
  await look(V1_BASE_IDS.accessory.slice(1).map(id=>["accessory",id] as [Category,string]));
  expect(!has("all_base_accessories"),"one v1 accessory short is not enough");
  await look(V1_BASE_IDS.accessory.map(id=>["accessory",id] as [Category,string]));
  expect(has("all_base_accessories"),"all 34 v1 accessories unlock 行走的杂货铺 without the new ones");
  await look(V1_BASE_IDS.bottom.map(id=>["bottom",id] as [Category,string]));
  expect(has("bottom_all"),"the 11 v1 bottoms unlock 裤子也是衣服 without the new ones");
  await look(V1_BASE_IDS.shoes.map(id=>["shoes",id] as [Category,string]));
  expect(has("shoes_all"),"the 13 v1 shoes unlock 履迹纷纷");
}

console.log("Smoke tests passed.");
