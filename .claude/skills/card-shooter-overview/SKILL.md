---
name: card-shooter-overview
description: 卡牌射击 web 项目（C:\Users\31937\Desktop\卡牌射击-web）的总览 skill。任何涉及此项目的工作（修改卡牌、机制、敌人、商店、UI、美术、数值平衡，或对比策划表 excel）都必须先读这个 skill 来了解架构、文件布局与子 skill 索引，然后再跳到具体的子 skill。当用户提到 "卡牌射击"、"game.js"、"策划表"、"挖掘 / 叫魂 / 骷髅" 等卡名、或在该项目根目录下发起任务时，主动使用此 skill。
---

# 卡牌射击 web 项目总览

这是一个 HTML5 Canvas 卡牌 roguelike，原型来自 Unity 项目，纯 web 单文件实现。
**项目根**：`C:\Users\31937\Desktop\卡牌射击-web`

所有改动的入口都在这里。先读完这一份，再按"任务类型 → 子 skill"跳转。

---

## 1. 文件布局

```
卡牌射击-web/
├── index.html        # 所有 UI 容器 + i18n data 属性
├── style.css         # 暗色主题 / 卡牌 / 模态弹窗 / 关键词 tooltip / 永久升级面板
├── game.js           # 全部游戏逻辑（~10500 行单文件，按 region 分块）
├── README.md         # 玩家向使用说明
├── HANDOFF.md        # 历史交接文档（设计意图、约束、命名规范，必读）
├── CARDS.md          # 早期 50 卡设计稿（v3.3，部分已变更）
├── build_xlsx.py     # 从 game.js CARD_DATA 反向导出策划表 excel
├── game_data.xlsx    # 项目内当前数据快照
├── audio/            # shot.mp3 / arcane.mp3
└── .claude/
    ├── launch.json   # preview 服务器配置（python http.server 8766）
    └── skills/       # 本套 skill
```

策划表 excel 一般由用户从外部发来（`C:\Users\31937\Downloads\策划表_数据表_表格 (N).xlsx`），逐版迭代。当前已落库版本：v6。

---

## 2. game.js 代码分区

按行注释里的 region 划分。修改时优先按区域定位，不要从头扫到尾。

| 区域 | 行号区间 | 主要内容 |
|---|---|---|
| 0. 工具 / i18n | 1 - 1100 | `clamp/rand/lerp/Events/I18N/t()`、梯形几何、KEYWORDS |
| 1. Hook / Effect / Phase | 1100 - 1200 | `Phase` 枚举、`Effect` 类、命中钩子约定 |
| 2. Bullet | 1200 - 1900 | 子弹生命周期、`_isSkeleton/isEntity/entityLayers`、`_entityDecos` 绘制 |
| 3. Enemy + ENEMY_TYPES | 1900 - 3250 | `ENEMY_TYPES` 字典、`ENEMY_TR`（i18n）、敌人 AI / intent / 弹幕 |
| 4. PlayerCannon | 3250 - 3500 | 玩家炮台、`spawnSkeleton`（友方实体子弹） |
| 5. CARD_DATA tier 工厂 | 3500 - 5700 | `_xxxTier` 助手函数（每个家族一个）→ 返回 `{cost, value, desc, effects, onUse, onDiscard, onReveal, onConceal}` |
| 6. CARD_DATA 注册表 | 5700 - 6200 | `CARD_DATA = { familyId: { emoji, name, tiers: { bronze, silver, gold, diamond } } }` |
| 7. 发现 / Discover | 6230 - 6300 | `triggerDiscover / resolveDiscover / _discoverPending / _discoverQueue` |
| 8. CardDeck 类 | 6300 - 6700 | `bag/hand/discard`、`discardRandomFromHand`、`shuffleIntoHand`、`toDiscard`、`destroyCard` |
| 9. ComboManager | 6700 - 6750 | 连击同侧累加 / 换侧重置 |
| 10. BattleManager | 6750 - 7500 | 状态机 `Idle/PreBattle/Battle/PostBattle/Reward/Inventory` + 回合制 + `endPlayerTurn / _autoDiscardAtTurnEnd` |
| 11. World | 7500 - 7700 | 容器：player/enemies/bullets/particles/summons/deck/combo/battle，永久升级、商店 SHOP_THRESHOLDS |
| 12. Particle / FX | 7600 - 8400 | `Particle / DamageNumber / GoldOrb / FX.hit/wall/explode/damage/xpBurst` |
| 13. fire 流程 | 8100 - 8400 | `fireFromCards / fireOneWave / doFire / doDiscard` |
| 14. UI 渲染 | 8400 - 10500 | `setupUI / setupInventoryPanel / setupLootPanel / cardEl / modalCardEl / 发现弹窗 / 永久升级 UI` |
| 15. main + window 导出 | 10500+ | `main()`、`window.__game / __cards / __mkCard / __triggerDiscover` 等调试入口 |

---

## 3. 关键架构概念

### 3.1 卡牌数据模型
每张卡是 `Card` 实例（`familyId + tier`）。所有"卡内容"由 `CARD_DATA[familyId].tiers[tier]` 的 def 对象描述：
```
{
  cost, value, hasRevealFx?, desc: { zh, en },
  effects: (card) => Effect[],  // 注册到子弹模板（PreActive / Spawned / HitEnemy / HitWall / Destroyed / EntityTurn）
  onUse?(card, world),           // 使用时触发
  onDiscard?(card, world),       // 弃置时触发
  onReveal?(card),               // 卡面翻正（边缘 / 主卡 / shuffleIntoHand 后落在边缘）
  onConceal?(card),              // 卡面翻反
}
```

### 3.2 子弹 Hook 六阶段
`Phase` 枚举：`PreActive / Spawned / HitWall / HitEnemy / Destroyed / EntityTurn`。
- 一张卡可注册多个 Effect 到不同阶段（见 `_swordsmanTier` / `_skeletonLordTier` 范例）
- **Hook 实例可被多颗克隆共享 → 必须无状态**，per-bullet 状态写到 `Bullet` 字段
- 实体子弹（`isEntity=true / entityLayers>0`）每个敌方回合开始触发 `EntityTurn`，扣 1 层，归零销毁

### 3.3 友方实体 / 骷髅
`spawnSkeleton(world, opts)` → 创建 `_isSkeleton=true / kind='skeleton'` 的 `Bullet` 实例，挂 `EntityTurn` dash hook。
所有"会 buff 骷髅"的卡（骷髅号角 / 爆骨花展露 / 叫魂钻 / 战旗 / 墓穴）必须**显式**遍历 `world.bullets` 或监听 `summonSpawned` 事件 — 不要靠 Hook 继承（已废弃模型）。

### 3.4 发现 / Discover 框架
`triggerDiscover(world, { candidates, sourceCard, title, sub, onPick })`：
- 单个挂起 → 写 `world._discoverPending` + emit `discoverShow`
- 已挂起 → 进 `world._discoverQueue`，前一个 resolve 后自动 pop
- UI 模块通过 `Events.on('discoverShow' | 'discoverQueueChanged' | 'discoverHide')` 渲染

### 3.5 i18n
`LANG.current ∈ {'zh','en'}`，`localStorage.cs_lang` 持久化。所有用户可见文本走 `desc: {zh, en}` 字典或 `t(key, vars)` 模板（见 I18N region）。**写新卡的 desc 必须同时给 zh 与 en**。

### 3.6 关键词系统
卡描述里出现 KEYWORDS 字典里的词（`展露 / 弃置 / 燃烧 / 实体化 / 召唤 / 弹射 / 穿透 / 骷髅 / 连携 / ...`）会被自动加粗 + hover tooltip。用关键词时**精确匹配**字典文字，否则不会触发样式。

### 3.7 i18n + 关键词同步坑
英文 desc 里的关键词要跟 KEYWORDS 字典里的英文翻译一致才能加粗（如 "Reveal" / "Burn" / "Skeleton" / "Bounce"）。改 KEYWORDS 时两边都要同步。

### 3.8 子弹目标重定向 / 子弹间交互（v7 起）
"奥数巨人" 引入了"友方子弹被另一友方实体吸引并吸收"的 pattern。改 `Bullet.activate()` 和 `Bullet.update()` 两处：
- activate 末尾对 isArcane 子弹 override `_lockTarget` 到最近的 `_isArcaneGiant`
- update tracking 段每帧覆盖 nearest（不仅 lock 死时回落）
- update 位置更新后做距离检测，碰到 giant → 调 `_absorbIntoArcaneGiant` + `alive = false`（跳过 HitEnemy / 穿透 / 燃烧）

要做同类机制（"我的子弹必定打 X 单位" / "X 单位会吸 / 吃我的子弹") → 仿造这两处 patch + 写一个 `_xxxStats` 累计计数器。详见 `modify-mechanic` skill §2.10-2.12。

---

## 4. 全局调试入口（window.__）

`game.js` 末尾导出几个调试 handle，在 preview 控制台直接可用：
```
window.__game           // World 实例（含 deck/player/battle/enemies/bullets）
window.__cards          // CARD_DATA 字典
window.__mkCard(fid, tier)  // 构造 Card
window.__triggerDiscover(world, opts)
window.__resolveDiscover(world, idx)
window.__rollShop / __rollShopCard
window.__events         // Events 总线
window.__Bullet         // Bullet 构造器（v7 起；用于 preview 直接构造测试用 bullet）
window.__absorbIntoArcaneGiant(giant, missile, world)  // 测试奥数巨人吸收
window.__fireArcaneGiantLaser(world, giant, baseHits)  // 测试激光
```
这些是写代码 + verify 时最常用的入口。任何时候需要"绕过 UI 操作测试一个机制"都从这里开始。

**绕过 UI 测试机制的常用技巧**：
- `window.__game.battle.update(dt)` 只推进状态机，不 tick 子弹
- **bullet.update 由主 render loop 驱动**，preview 里 hidden 时可能 throttle → 测试时手动 `for (const b of w.bullets) b.update(0.05, performance.now()/1000, w)` 跑一段
- 直接 `new window.__Bullet({...})` 构造测试 bullet（无 hooks，要测某卡的 hook 需要手动 `bullet.addHook(...card.initializeEffects()[i])`）

---

## 5. 浏览器预览（必备）

`.claude/launch.json` 已配 `static` 服务器 → 用 `preview_start` 起，端口 8766。
任何改动后**必须用 preview_eval 跑断言验证** — 这个项目改动经常牵动多处（hook、UI、i18n、CSS），眼看代码改对了不代表运行对。验证最小集：
- `window.__cards.<familyId>.tiers.<tier>` 字段是否对得上策划表
- 在浏览器里手动触发那条机制（如 `world.deck.discardRandomFromHand(2)`）并检查 `world._discoverPending / world._discoverQueue` 状态
- `preview_console_logs --level error` 看有没有抛错

---

## 6. 任务类型 → 子 skill 索引

按任务类型跳转到对应子 skill（都在 `.claude/skills/`）。读这一节是为了**少读不相关的代码**。

| 任务 | 子 skill | 典型触发 |
|---|---|---|
| 用户发新版策划表 excel，让你对比旧版并加新卡 / 改数值 | `add-card` | "对比 X 和 Y 更新了哪些东西" / "新增卡牌" |
| 改一张已有卡的效果（不仅数值），如重写 onDiscard / 加新机制 / 子弹间交互 | `modify-mechanic` | "XX 卡应该改成..." / "现在 XX 行为是 bug" / "子弹应该被 X 吸收" |
| 改卡面 emoji / 颜色 / 加新粒子特效 / 实体装饰（剑、骷髅、翅膀、奥术） / 激光 | `art-and-fx` | "战旗的 emoji 换成..." / "加更明显的命中特效" / "激光视觉" |
| 新增敌人 / 改 ENEMY_TYPES 数值 / 加新 intent | `enemy-system` | "加一个 boss" / "弓箭手伤害太高" |
| 改手牌行为（最左 / 最右、face-up、洗入位置、临时卡） | `hand-system` | "让 XX 卡洗入最左侧" / "auto-discard 机制" |
| 改商店概率 / 升级费用 / 永久升级 / 移除候选规则 | `shop-system` | "商店出 X 概率太低" / "永久升级再加一项" |
| **纯**改数值（cost / value / 攻击 / 燃烧次数等），不动逻辑 | `balance-values` | "把 XX 卡的伤害从 3 调到 5" |

**一个任务可能跨多个 skill**：例如新增 "战旗" → `add-card`（数据），但 emoji 选择属于 `art-and-fx`，aura 行为属于 `modify-mechanic`。先用 `add-card` 流程为主线，遇到边角问题再 cross-ref 别的 skill。

---

## 7. 通用作业守则（写在前面，避免反复踩坑）

1. **改完必跑 preview 验证**：见第 5 节。眼看不算数。
2. **desc 必须 zh+en 双语**：单语会出 UI bug。
3. **关键词精确匹配**：见 3.6。
4. **改 CARD_DATA 后同步 build_xlsx.py 输出**：如用户希望维护策划表，跑一下 `python build_xlsx.py` 把 game_data.xlsx 刷新；用户外发的版本号由用户自己控制。
5. **Hook 无状态**：3.2 已说，per-bullet 字段写到 Bullet 上。
6. **新卡是 skeleton 家族 → 加进 `SKELETON_FAMILY_IDS`**：否则叫魂 / 掘墓 等机制识别不到。
7. **新卡有 `excludedFromShop: true` 标志**：用于衍生卡 / 起手卡（如奥弹 / 强化）不应出现在商店候选池。商店相关 skill 详细讲。
8. **task tracking**：复杂任务用 TaskCreate/TaskUpdate 跟踪，避免漏步。

---

## 8. 历史背景

- `HANDOFF.md` 是早期 4 卡 → 50 卡的实现交接文档，仍是设计意图与坑点的最佳速查。改任何老机制前先在 HANDOFF.md 搜对应词。
- `CARDS.md` 是更早的 50 卡设计稿（v3.3）。当前 CARD_DATA 已经偏离这份；只在追溯设计意图时参考。
- 当前数据权威来源 = `CARD_DATA`（代码里）+ 用户最新发的 excel。两者矛盾时以**最新 excel 为准**，照着改代码。
