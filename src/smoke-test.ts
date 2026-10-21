import { ACHIEVEMENTS } from "./achievements.js";
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

expect(ACHIEVEMENTS.length===50,"achievement count should be 50");
expect(rewardUnlocks(2,[]).length===0,"no reward before 3 achievements");
expect(rewardUnlocks(50,[]).length===12,"all 12 reward milestones should unlock by 50 achievements");
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

console.log("Smoke tests passed.");
