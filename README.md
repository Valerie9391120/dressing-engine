# Dressing Engine

一个纯文字梳妆 / 换装引擎。它是 **headless** 的，不碰 DOM、不依赖页面，手机 PWA 和笔记本自动唤醒都可以调用同一套规则，只要两端使用同一份持久化状态。

首次 `open` 会显示一段简短开场说明；之后再次 `open` 只返回当前造型，不会重复播放开场。

## 核心原则

- 梳发、妆面、熏香是单选，随时可换。
- 衣柜、下装、鞋履、配饰全部是自由多选。
- **没有槽位冲突，也没有穿搭合法性检查。**
- 可以同时穿多套衣服、多条下装、多双鞋、多个同位置配饰。
- 古今混搭、公服配泳裤、black tie 配跣足，全部允许。
- 换装（`select` / `remove` / `clear`）不限次数，随便玩；换的时候不判任何成就。
- `complete` 完成今天的搭配：**每天只能一次**。成就只在这一刻判定，按完成的那一身算；“尝试过几种”的统计也只算完成过的搭配。今天完成过以后照样可以换着玩，只是不再算数（见下面“每天一次完成搭配”）。
- `mirror` 照镜子不限次数，**只照得出今天完成的那一套**；今天还没完成搭配，镜子里是一只裸狐。照镜子只判《照花前后镜》（同一天照 3 次，照到裸狐也算）。
- 50 个隐藏成就。查询成就时只返回已经点亮的内容。
- 累计成就达到 3 / 5 / 8 / 12 / 16 / 20 / 24 / 28 / 32 / 36 / 40 / 50 时，会自动解锁隐藏衣饰奖励。
- 奖励物品未解锁前不会出现在 `catalog`。
- “全部基础鞋履 / 下装 / 配饰”等成就只统计 v1 基础物品，后续奖励不会把条件越撑越大。
- `remove` 对梳发 / 妆面 / 熏香只会在目标正好是当前选项时重置；取错不会把当前状态打回默认。
- `catalog` 收到不存在的类别时会明确返回“没有这个类别”，不会静默给空结果。
- “不穿”仍然遵循自由叠穿原则：即使和其他衣着并存，也会计入相关隐藏成就。

## 文件

```text
src/
├── achievements.ts       # 50 个隐藏成就
├── clock.ts              # 统一手机 / 笔记本日期
├── demo.ts               # 最小调用示例
├── dressing-data.ts      # 全部基础单品 + 隐藏奖励单品
├── dressing-engine.ts    # 核心状态机
├── dressing-tool.ts      # Claude tool schema + 文本包装
├── index.ts              # 对外 exports
├── rewards.ts            # 累计成就奖励里程碑
├── smoke-test.ts         # 核心规则回归测试
├── types.ts
└── stores/
    └── json-file-store.ts
```

## 安装与检查

```bash
npm install
npm run typecheck
npm test
```

## 最小接法

```ts
import {
  DressingEngine,
  JsonFileDressingStore,
  createDressingTool,
  createTimeZoneClock
} from "./src/index.js";

const store = new JsonFileDressingStore("./dressing-state.json");
const engine = new DressingEngine(
  store,
  createTimeZoneClock("Europe/Dublin")
);
const play = createDressingTool(engine);

console.log(await play({ action: "open" }));
console.log(await play({ action: "catalog", category: "outfit" }));
console.log(await play({
  action: "select",
  category: "outfit",
  itemId: "outfit_hanjin"
}));
console.log(await play({
  action: "select",
  category: "bottom",
  itemId: "bottom_swim"
}));
console.log(await play({
  action: "select",
  category: "shoes",
  itemId: "shoes_red_heels"
}));
console.log(await play({ action: "complete" })); // 今天的搭配，成就在这时判
console.log(await play({ action: "mirror" }));   // 照出来的是刚完成的那一套
```

## Tool actions

| action | 用途 |
|---|---|
| `open` | 首次打开 / 再次进入 |
| `status` | 查看妆台前眼下的搭配，以及今天完成过搭配没有；不计照镜 |
| `catalog` | 查看已开放单品，可指定 category |
| `select` | 选择单品。单选类别会替换，多选类别会追加 |
| `remove` | 取下指定单品 |
| `clear` | 清空一个类别，或 `category="all"` 全部重置 |
| `complete` | 完成今天的搭配，每天一次；判定成就、记入“尝试过”和连续判定 |
| `mirror` | 照镜子，不限次数；只照得出今天完成的那一套，没完成是裸狐 |
| `achievements` | 只显示已解锁成就 |
| `rewards` | 只显示已经拿到的累计奖励，以及下一档所需成就数 |

类别：

```text
hair / makeup / scent / outfit / bottom / shoes / accessory
```

`catalog` 会显示可用 item id。奖励物品只有在真正解锁后才会出现。

## 每天一次完成搭配

- 哪一天由 `DressingClock.today()` 说了算（`YYYY-MM-DD`）。
- 今天已经完成过：再 `complete` 会被婉拒（“今天已经完成过一次搭配了，明天再来”），状态不变。
- 调用方最好干脆不给这个选项：`dressingToolSchema(false)` 给出的工具里没有 `complete`。用 `completedToday(state, today)` 判断今天完成过没有。

```ts
import { completedToday, dressingToolSchema } from "./src/index.js";

const state = await store.load();
const tool = dressingToolSchema(!completedToday(state, clock.today()));
```

- `DRESSING_TOOL_SCHEMA` 还在，等于 `dressingToolSchema(true)`。
- 镜子里照出来的是 `state.completedLook`（日期是今天才算数），不是妆台前眼下的搭配：完成以后再换着玩，镜子里不会变。

## 关于自由叠穿

引擎故意不做任何冲突判断。例如这些都合法：

```text
汉晋款峨冠博带 + 高领黑毛衣 + 泳裤 + 红底高跟鞋
black tie + 不穿下装 + 牛津鞋
神父装 + 水手服 + 蕾丝吊带 + 三双鞋
```

同一类别也可以多选。系统只记录，不管教。

## 隐藏成就

共有 50 个。除了《照花前后镜》在照镜子的时候判，其余都只在完成搭配的时候判，按完成的那一身算。成就判定包括：

- 发型、妆面、香气与单品探索（只算完成过的搭配里出现过的）
- 同日照镜、连续几天完成的造型各不相同、连续几次完成搭配
- 多件叠穿、多配饰、古今混搭
- 特定核心单品搭配彩蛋
- 跣足、不穿、特殊大胆衣着
- 鞋履与下装收集

固定搭配类采用“**核心单品命中**”逻辑。只要要求的单品同时存在就会触发，额外穿戴不会使条件失效。

例如《中土的呼唤》只需要：

```text
中土精灵额冠 + 白纱金线祭祀长袍
```

哪怕同时再穿泳裤、机车夹克、红底高跟鞋，依旧会解锁。

## 累计成就奖励

奖励内容在解锁前不通过 tool 剧透。当前里程碑：

```text
3 / 5 / 8 / 12 / 16 / 20 / 24 / 28 / 32 / 36 / 40 / 50
```

全部奖励都是普通可穿戴 item，解锁后加入对应分类，可以继续参与自由搭配与普通搭配成就。

## 手机 + 笔记本共享存档

`JsonFileDressingStore` 只适合单机测试。如果手机 PWA 和笔记本闹钟都要玩同一套衣柜，**不要各自存一份本地 JSON**。

让两端调用同一个后端 / 数据库，并实现：

```ts
interface DressingStore {
  load(): Promise<DressingState | null>;
  update<T>(fn: (state: DressingState | null) => ...): Promise<T>;
}
```

其中 `update()` 需要具备原子性，避免手机和笔记本同时写入时互相覆盖。

两端也应使用同一个时区。仓库附带：

```ts
createTimeZoneClock("Europe/Dublin")
```

## 存档文件

本地测试产生的 `dressing-state.json` 已加入 `.gitignore`，不要提交到 GitHub。
