import { ACHIEVEMENTS } from "./achievements.js";
import { DressingEngine } from "./dressing-engine.js";
import { rewardUnlocks } from "./rewards.js";
import type { DressingState, DressingStore } from "./types.js";

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

expect(ACHIEVEMENTS.length===50,"achievement count should be 50");
expect(rewardUnlocks(2,[]).length===0,"no reward before 3 achievements");
expect(rewardUnlocks(50,[]).length===12,"all 12 reward milestones should unlock by 50 achievements");
await engine.execute({action:"open"});
await engine.execute({action:"select",category:"outfit",itemId:"outfit_hanjin"});
await engine.execute({action:"select",category:"outfit",itemId:"outfit_black_turtleneck"});
await engine.execute({action:"select",category:"bottom",itemId:"bottom_swim"});
await engine.execute({action:"select",category:"shoes",itemId:"shoes_red_heels"});
const firstMirror=await engine.execute({action:"mirror"});
expect(firstMirror.state.appearance.outfits.length===2,"multiple outfits must be allowed");
expect(firstMirror.state.appearance.bottoms.includes("bottom_swim"),"bottom should remain selected");
expect(firstMirror.state.appearance.shoes.includes("shoes_red_heels"),"shoe should remain selected");
expect(firstMirror.state.unlockedAchievements.includes("first_mirror"),"first mirror achievement should unlock");
expect(firstMirror.state.unlockedAchievements.includes("most_indecent_menswear"),"black turtleneck achievement should unlock");
expect(firstMirror.state.unlockedAchievements.includes("ancient_modern"),"ancient + modern should unlock");
expect(firstMirror.state.unlockedRewards.includes("reward_swim_goggles"),"3-achievement reward should unlock");

// Fixed-pair achievements tolerate extra unrelated items.
await engine.execute({action:"select",category:"outfit",itemId:"outfit_ritual_white_gold"});
const elf=await engine.execute({action:"select",category:"accessory",itemId:"acc_elven_circlet"});
expect(elf.state.unlockedAchievements.includes("middle_earth"),"Middle-earth core pair should unlock despite extra items");

// No slot conflict: multiple shoes and head/face accessories may coexist.
await engine.execute({action:"select",category:"shoes",itemId:"shoes_barefoot"});
await engine.execute({action:"select",category:"shoes",itemId:"shoes_oxford"});
await engine.execute({action:"select",category:"accessory",itemId:"acc_sunglasses"});
await engine.execute({action:"select",category:"accessory",itemId:"acc_gold_wire_glasses"});
const layered=await engine.execute({action:"status"});
expect(layered.state.appearance.shoes.length>=3,"multiple shoes should coexist");
expect(layered.state.appearance.accessories.includes("acc_sunglasses")&&layered.state.appearance.accessories.includes("acc_gold_wire_glasses"),"multiple face accessories should coexist");


// Removing the wrong single-select item must not reset the current selection.
await engine.execute({action:"select",category:"hair",itemId:"hair_wet"});
const wrongHairRemoval=await engine.execute({action:"remove",itemId:"hair_curls"});
expect(wrongHairRemoval.state.appearance.hair==="hair_wet","removing an unselected hairstyle must not reset current hair");
expect(wrongHairRemoval.text.includes("目前并不是当前梳发"),"wrong single-item removal should explain that the item is not active");

// Runtime callers may still pass a bad category even though the tool schema has an enum.
const badCatalog=await engine.execute({action:"catalog",category:"wardrobe" as any});
expect(badCatalog.text.includes("没有这个类别"),"invalid catalog category should return a clear error");

// Day records should roll cleanly.
day="2026-10-22";
const next=await engine.execute({action:"mirror"});
expect(next.state.currentDay?.date===day,"current day should roll forward");

console.log("Smoke tests passed.");
