# Dressing Engine

一个纯文字梳妆 / 换装引擎。它是 **headless** 的，不碰 DOM、不依赖页面，手机 PWA 和笔记本自动唤醒都可以调用同一套规则，只要两端使用同一份持久化状态。

## 核心原则

- 梳发、妆面、熏香是单选，随时可换。
- 衣柜、下装、鞋履、配饰全部是自由多选。
- **没有槽位冲突，也没有穿搭合法性检查。**
- 可以同时穿多套衣服、多条下装、多双鞋、多个同位置配饰。
- 古今混搭、公服配泳裤、black tie 配跣足，全部允许。
- `mirror` 负责记录一次完整照镜，并触发需要照镜才能判定的隐藏成就。
- 50 个隐藏成就。查询成就时只返回已经点亮的内容。
- 累计成就达到 3 / 5 / 8 / 12 / 16 / 20 / 24 / 28 / 32 / 36 / 40 / 50 时，会自动解锁隐藏衣饰奖励。
- 奖励物品未解锁前不会出现在 `catalog`。
- “全部基础鞋履 / 下装 / 配饰”等成就只统计 v1 基础物品，后续奖励不会把条件越撑越大。

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
console.log(await play({ action: "mirror" }));
```

## Tool actions

| action | 用途 |
|---|---|
| `open` | 首次打开 / 再次进入 |
| `status` | 查看当前造型，不计照镜 |
| `catalog` | 查看已开放单品，可指定 category |
| `select` | 选择单品。单选类别会替换，多选类别会追加 |
| `remove` | 取下指定单品 |
| `clear` | 清空一个类别，或 `category="all"` 全部重置 |
| `mirror` | 正式照镜，记录次数、当日造型和相关连续判定 |
| `achievements` | 只显示已解锁成就 |
| `rewards` | 只显示已经拿到的累计奖励，以及下一档所需成就数 |

类别：

```text
hair / makeup / scent / outfit / bottom / shoes / accessory
```

`catalog` 会显示可用 item id。奖励物品只有在真正解锁后才会出现。

## 关于自由叠穿

引擎故意不做任何冲突判断。例如这些都合法：

```text
汉晋款峨冠博带 + 高领黑毛衣 + 泳裤 + 红底高跟鞋
black tie + 不穿下装 + 牛津鞋
神父装 + 水手服 + 蕾丝吊带 + 三双鞋
```

同一类别也可以多选。系统只记录，不管教。

## 隐藏成就

共有 50 个。成就判定包括：

- 发型、妆面、香气与单品探索
- 同日照镜、连续日期造型
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
