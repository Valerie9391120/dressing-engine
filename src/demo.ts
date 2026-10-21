import { DressingEngine } from "./dressing-engine.js";
import { createDressingTool } from "./dressing-tool.js";
import { JsonFileDressingStore } from "./stores/json-file-store.js";

const store=new JsonFileDressingStore("./dressing-state.json");
const clock={today:()=>new Date().toISOString().slice(0,10)};
const engine=new DressingEngine(store,clock);
const play=createDressingTool(engine);

console.log(await play({action:"open"}));
console.log("\n---\n"+await play({action:"select",category:"outfit",itemId:"outfit_black_turtleneck"}));
console.log("\n---\n"+await play({action:"select",category:"bottom",itemId:"bottom_swim"}));
console.log("\n---\n"+await play({action:"select",category:"shoes",itemId:"shoes_red_heels"}));
console.log("\n---\n"+await play({action:"mirror"}));
