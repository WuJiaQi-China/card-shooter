---
name: add-card
description: 卡牌射击 web 项目里"新增卡牌 + 同步策划表"的工作流。用户通常会直接发最新版策划表 excel（如 `策划表_数据表_表格 (6).xlsx`），让你跟旧版对比、把新增 / 变更的卡落进 game.js 的 CARD_DATA。当用户消息里出现 "新增卡牌"、"加新卡"、"对比 X 和 Y"、两个策划表 xlsx 文件路径、或新卡名（如 "战旗 / 掘墓 / 引燃 / 骷髅号角"）等场景时，主动使用此 skill。前置阅读：`card-shooter-overview` skill。
---

# 新增卡牌 / 同步策划表 工作流

> **前置**：先读完 `card-shooter-overview` skill，了解 game.js 分区、CARD_DATA 结构、双语 desc / 关键词约定。

用户最常见的请求格式：
> "@xlsx_v6 @xlsx_v5  对比 6 和 5 更新了哪些东西，然后进行修改"

---

## 1. 总览：5 步工作流

```
Step 1: 读两版 excel → 算出 diff（新增 / 修改 / 删除）
Step 2: 把 diff 转成"任务清单"给用户确认（可选；diff 明确时跳过）
Step 3: 按 family 在 game.js 里加 / 改 _xxxTier 助手函数
Step 4: 在 CARD_DATA 注册表里挂上 tier
Step 5: preview_eval 验证字段 + 在浏览器里端到端测一遍
```

---

## 2. Step 1: 读 excel + 算 diff

策划表 excel 一般是单 sheet，列名固定：
```
卡牌名称 | 效果 | 费用 | 价值 | 稀有度 | 所属Build | 卡牌描述 | 关键词 | 计算 | 不启用 | 父记录
```

- **卡牌名称** 只在每个家族的第 1 行有值；后续 tier 行靠 ffill 继承
- **稀有度** = `铜 / 银 / 金 / 钻`
- **父记录** 是衍生 tier 的家族头记录名（铜 tier 通常无父记录）
- **不启用** 列有值代表该卡禁用，跳过

### 标准 diff 脚本

用 pandas，注意编码 + ffill 名字：

```python
import pandas as pd
import sys
sys.stdout.reconfigure(encoding='utf-8')

file_old = r'C:\Users\31937\Downloads\策划表_数据表_表格 (5).xlsx'
file_new = r'C:\Users\31937\Downloads\策划表_数据表_表格 (6).xlsx'

df_old = pd.read_excel(file_old, sheet_name=0)
df_new = pd.read_excel(file_new, sheet_name=0)
df_old['name'] = df_old['卡牌名称'].ffill()
df_new['name'] = df_new['卡牌名称'].ffill()

key = lambda r: f"{r['name']}|{r['稀有度']}|{r['父记录']}"
df_old['key'] = df_old.apply(key, axis=1)
df_new['key'] = df_new.apply(key, axis=1)

# 新增 / 删除
print('=== 新增 ===')
for k in sorted(set(df_new['key']) - set(df_old['key'])): print(' +', k)
print('=== 删除 ===')
for k in sorted(set(df_old['key']) - set(df_new['key'])): print(' -', k)

# 修改
m_old, m_new = df_old.set_index('key'), df_new.set_index('key')
cols = ['效果','费用','价值','所属Build','卡牌描述','关键词','计算']
for k in sorted(set(m_old.index) & set(m_new.index)):
    diffs = {}
    for c in cols:
        v_o = '' if pd.isna(m_old.loc[k, c]) else str(m_old.loc[k, c]).strip()
        v_n = '' if pd.isna(m_new.loc[k, c]) else str(m_new.loc[k, c]).strip()
        if v_o != v_n: diffs[c] = (v_o, v_n)
    if diffs:
        print(f'\n[{k}]')
        for c, (o, n) in diffs.items(): print(f'  {c}: {o!r} -> {n!r}')
```

把输出贴回 chat 让用户看清，再开始改代码。

---

## 3. Step 2: 把 diff 翻译成代码改动

每种 diff 类型 → 改的位置不同：

| Diff 类型 | 怎么改 |
|---|---|
| 仅 `费用 / 价值` 变 | 改 `_xxxTier()` 的 `cost`/`value` 参数 → 跳到 `balance-values` skill |
| 仅 `效果`描述变（数字微调） | 改 `_xxxTier()` 内的常量；如果 family 函数本身写死了 cost / desc，直接替换 |
| `效果`大改（行为重写） | 重写 `_xxxTier()` 内的 `effects/onUse/onDiscard/onReveal` → 跳到 `modify-mechanic` skill |
| 整张新卡 | 新写 `_xxxTier()` + 在 CARD_DATA 注册（本 skill 主线，下面详细讲）|
| 整张卡删除 | 从 CARD_DATA 移除条目 + 若属 SKELETON_FAMILY_IDS / 类似集合也要清掉；商店里玩家已购买的存档无法回收，**先跟用户确认** |

不确定是 v5 → v6 单纯数值变还是行为重写时，**优先按 excel 的"效果"字段为准**，逐字落进 desc.zh。

---

## 4. Step 3: 加 `_xxxTier()` 助手函数

每个家族在 game.js 5. region 都有一个工厂函数（命名约定 `_<familyId>Tier`），接收"差异化参数"，返回 def 对象。

### 标准模板

```js
// XX：一行设计说明（行为概述 + 哪些参数随 tier 变）
function _xxxTier(/* tier 差异参数 */ paramA, paramB, value) {
  return {
    cost: 2, value,
    hasRevealFx: true,        // 仅当有 onReveal 才加；否则省
    desc: {
      zh: `中文描述。展露：xxx。`,
      en: `English desc. Reveal: xxx.`,
    },
    effects: () => [
      new Effect(Phase.PreActive, 0, ctx => {
        // 改子弹模板属性（攻击 / 弹射 / 穿透 / entityLayers / _fireOnHit 等）
      }),
      // ...更多 Phase 的 Hook
    ],
    onUse(card, world) { /* 玩家使用时副作用 */ },
    onDiscard(card, world) { /* 弃置时副作用 */ },
    onReveal(card) {
      if (card._myHandler) return;
      card._myHandler = (s) => { /* 监听 summonSpawned / cardUsedSide / enemyDied 等 */ };
      Events.on('summonSpawned', card._myHandler);
    },
    onConceal(card) {
      if (card._myHandler) {
        Events.off('summonSpawned', card._myHandler);
        card._myHandler = null;
      }
    },
  };
}
```

### 经典模式速查

| 需求 | 怎么写 | 参考 |
|---|---|---|
| 简单数值 buff（伤 / 穿 / 弹） | `new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.attack += N; })` | `_leadedTier` `_streamlined` |
| 命中时施加状态 | `new Effect(Phase.HitEnemy, 0, ctx => { applyFire(ctx.enemy, N); })` | `_igniteTier` |
| 摧毁时 AOE / 范围伤害 | `new Effect(Phase.Destroyed, 0, ctx => { applyAoe(ctx.world, ctx.bullet, {...}); })` | `_firebombTier` |
| 召唤骷髅 | `onUse(_, world) { for (let i=0;i<n;i++) spawnSkeleton(world); }` | `_skeletonHornTier` |
| 召唤实体子弹（剑士 / 领主） | PreActive 设 `entityLayers`，Spawned 加 `_entityDecos`，EntityTurn 实现回合行为 | `_swordsmanTier` `_skeletonLordTier` |
| 展露光环（face-up 时持续生效）| `onReveal` 注册 Events 监听器，`onConceal` 解绑 | `_boneBlossomTier` `_warBannerTier` |
| 弃置 = 使用 | `onUse` 与 `onDiscard` 走同一 `apply()` 函数 | `_skeletonHornTier` |
| 触发发现 / Discover | `triggerDiscover(world, { candidates, sourceCard: card, title, sub, onPick })` | `_excavateTier` `_directedSurveyTier` `_excavateTombTier` |
| 临时洗入手牌（用完就破碎） | onPick 内：`chosen._destroyAfterUse=true; world.deck.shuffleIntoHand(chosen)` | `_excavateTier` |
| 回合结束自动弃置 | `chosen._autoDiscardAtTurnEnd = true`；逻辑在 `BattleManager.endPlayerTurn` 已统一 | `_excavateTombTier` |
| 友方子弹被实体吸收 / 强化场上单位 | 在 Bullet.update 加 `if (this.isArcane && other._isXxx) → 吸收`；giant 维护 `_xxxStats` 计数器 | `_arcaneGiantTier` `_absorbIntoArcaneGiant` |
| 浮点阈值 + 边际递减触发（每 10 个 → +1 加成，下次需要 11 个） | `while (sum >= nextThr) { nextThr *= 1.1; bonus += 1; }` | `_absorbIntoArcaneGiant` |
| 巨型激光（一次性穿透光束） | 构造高速（speed 1600）短寿命（lifetime 0.6）大穿透 Bullet + 沿线 12 颗 ring 粒子 | `_fireArcaneGiantLaser` |
| 让 X 类子弹改 target / 重定向 | 在 `Bullet.activate()` 锁定后 override + `Bullet.update()` tracking 段每帧覆盖 nearest | 见 `card-shooter-overview` §3.8 |
| desc 随状态变化（如弃置剩余次数）| `desc: (card) => ({zh: \`...${state}...\`, en: ...})` —— 函数式 desc，每次渲染 re-eval | `_braveDragonLairTier` |
| 弃置 N 次触发召唤（本关 family 共享计数）| `world._discardCounters[familyId]++`；达 threshold → 召唤 + 归零；threshold-1 时把 `_discardCounterReady` 打到 hand/discard/bag 内所有同 family 卡 | `_braveDragonLairTier` |
| 跨卡 / 跨回合共享的本关状态 | `world._discardCounters` 之类挂在 world 上，`_startNextStage` + `resetForNewGame` 内清零 | `_braveDragonLairTier` |
| 卡始终为正面（不受边缘 / 中间限制）| def 加 `alwaysFaceUp: true` —— Card constructor 读 def，`_updateFaceUp()` 自动 honor | `_swordSaintVisitTier` 钻 |
| 钻头型穿透（穿透时连续命中同一敌人）| `new Effect(Phase.Spawned, 0, ctx => { ctx.bullet.pierceHitCooldown = 0.05; })` —— 缩短"穿过敌人时的同敌重命中 CD" | `_drillTier` |

### 关键 helper 函数（写新卡常用）

```
spawnSkeleton(world, opts)             → 召唤友方骷髅实体子弹
applyAoe(world, source, opts)          → 圆 / 锥形 AOE，伤害以 source.attack 为基数
applyFire(enemy, layers)               → 加燃烧层数
_nearestEnemyTo(world, x, y)           → 找最近敌人
mkCard(familyId, tier)                 → 构造一张卡（发现候选用）
triggerDiscover(world, opts)           → 弹发现窗口
randInt(a, b) / rand(a, b)             → 随机
angleBetween(x1,y1,x2,y2)              → 方向角
```

---

## 5. Step 4: 在 CARD_DATA 注册表挂 tier

在 `CARD_DATA = { ... }` 内（按相近家族就近插入）：

```js
new_family_id: {
  emoji: '🚩',                         // 卡面 emoji（背景色由 rarity 决定）
  name: { zh: '战旗', en: 'War Banner' },
  excludedFromShop: false,              // 默认 false 可省略；衍生卡 / 起手卡设 true
  tiers: {
    bronze:  _warBannerTier(1, 1, 23),  // 按 excel 的（参数，value）逐个填
    silver:  _warBannerTier(1, 2, 30),
    gold:    _warBannerTier(2, 2, 39),
    diamond: _warBannerTier(2, 3, 50),
  },
},
```

### 命名规范

| 项 | 规则 | 示例 |
|---|---|---|
| `familyId` | 全小写 snake_case，英文意译 | `war_banner` / `excavate_tomb` |
| `name.zh` | 跟 excel "卡牌名称" 列一字不差 | `战旗` |
| `name.en` | 简洁英译，避免与已有家族重名 | `War Banner` |
| `emoji` | 单字符 emoji，与家族主题一致；尽量不与已有家族重复 | 🚩 / ⚱ |

### 衍生 / 起手卡

- `excludedFromShop: true` 防止商店把它当普通候选 roll 出来（如 `boost1 / arcane_missile / arcane_firework / foresight`）
- 主流程通过 `mkCard()` 或洗入手牌的方式给玩家

### 骷髅家族

如果新卡的关键词包含 "骷髅" 或行为与骷髅集成（被叫魂识别 / 被掘墓发现池包含），加进：

```js
const SKELETON_FAMILY_IDS = new Set([
  'crypt', 'skeleton_horn', 'bone_blossom', 'skeleton_lord',
  'necromancer', 'soulcall', 'reincarnation', 'excavate_tomb',
  '新增的骷髅家族',
]);
```

---

## 6. Step 5: 验证

启 preview 服务器（参见 overview skill 第 5 节），跑下面三件事：

### 6.1 字段校验

```js
preview_eval：
({
  has: !!window.__cards.war_banner,
  tiers: Object.fromEntries(
    Object.entries(window.__cards.war_banner.tiers)
      .map(([k,v]) => [k, { cost: v.cost, value: v.value, desc: v.desc.zh }])
  ),
})
```

把输出贴回 chat 跟 excel 对照。

### 6.2 控制台无错

```
preview_console_logs --level error
```

刷新一次页面、构造一张新卡再看：
```js
window.__mkCard('war_banner', 'gold').desc
```

### 6.3 端到端机制测试

至少把新卡塞进 hand 触发一次它的核心行为，例：

```js
const w = window.__game;
const c = window.__mkCard('excavate_tomb', 'diamond');
w.deck.hand.push(c); w.deck._setFace(c, true);
c.onUse(c, w);           // 触发 onUse
// 检查 _discoverPending 候选 / queue 长度 / 弹窗 DOM
```

---

## 7. 双语 desc 规范（极易出错）

每张卡的 desc 必须 `{zh, en}`，且**关键词需要精确匹配** KEYWORDS 字典里的中英文，否则 tooltip / 加粗失效。

| 中文 | 英文（KEYWORDS 字典里的写法）|
|---|---|
| 展露 | Reveal |
| 弃置 | discarded / discard |
| 燃烧 | Burn |
| 实体化 | Entity |
| 召唤 | Summon |
| 弹射 | Bounce |
| 穿透 | Pierce |
| 骷髅 | Skeleton |
| 发现 | Discover |

写英文 desc 时**首字母大写**（句首与关键词），与已有卡风格一致。

---

## 8. 同步策划表 excel（可选）

项目里 `build_xlsx.py` 可以从 CARD_DATA 反向导出 game_data.xlsx 一份快照。改完代码后跑：
```
python "C:\Users\31937\Desktop\卡牌射击-web\build_xlsx.py"
```
让 game_data.xlsx 保持同步。**不要**直接覆盖用户从 Downloads 发来的 (N).xlsx（那是用户在维护的策划表，版本号他控制）。

---

## 9. 常见踩坑

1. **忘记在 CARD_DATA 注册** → 函数写完没人调用，验证时 `__cards.xxx` 是 undefined
2. **`excludedFromShop` 漏写** → 衍生卡跑去商店候选池
3. **desc 只写 zh 没写 en** → 英文 UI 显示 undefined
4. **关键词写错字** → "燃烧" 写成 "燃烧效果" → tooltip 不触发
5. **新骷髅卡没进 SKELETON_FAMILY_IDS** → 叫魂的"骷髅关键词额外召唤"识别不到
6. **改完没 preview_eval** → 字段错位 / undefined 抛出在战斗中才暴露
7. **`onReveal` 注册了监听器，`onConceal` 忘了解绑** → 翻面切换时事件累积，造成"buff 越叠越多"的 bug
8. **手写浮字 FX 调 `_emitEntityBuffFX`** → 已废弃。游戏有自动 buff-diff 侦测器，写卡时只改 `b.attack += N` / `b.entityLayers += N`，浮字自动出。详见 `card-shooter-overview` §3.9
9. **动态 desc 改完没 emit deckChanged** → desc 文本变了但 UI 不刷新，玩家看到旧数字（`_braveDragonLairTier.onDiscard` 末尾必须 emit）

---

## 10. 完整范例

### 10.1 v5 → v6 加 "战旗" 家族（简单展露 + 监听 summonSpawned）

参考已落库的 `_warBannerTier` + `CARD_DATA.war_banner`：
- 助手函数在 game.js 第 ~4485 行（v7 后偏移）
- 行为：onUse 立即给场上友方实体 +N 攻；onReveal 监听 summonSpawned 给未来友方实体 +X 攻 +1 实体化；onConceal 解绑
- 4 tier 通过 `(auraDmg, spawnDmg, value)` 参数化

### 10.2 v6 → v7 加 "奥数巨人" 家族（吸收 / 累计强化 / 激光 — 复杂范例）

参考 `_arcaneGiantTier` + `_absorbIntoArcaneGiant` + `_fireArcaneGiantLaser` + `CARD_DATA.arcane_giant`。

涉及的新模式：
1. **实体子弹做"目标吸引器"** — `_isArcaneGiant` 标记 + 在 `Bullet.activate()` / `Bullet.update()` tracking 段加 override，让友方奥弹优先追巨人
2. **接触吸收（不是命中）** — 在 `Bullet.update()` 加距离检测：奥弹碰到巨人 → 调 `_absorbIntoArcaneGiant`、`alive = false`、emit `bulletDestroyed`。不触发 HitEnemy / 穿透 / 燃烧。
3. **多维累计计数器** — 巨人挂 `_giantStats` 字典，6 个独立维度（count/atk/bound/pen/fire/freezePct）
4. **浮点阈值 + 1.1x 递增** — 每次触发后 `nextThr *= 1.1`，"前 10 个加 1，下一个 11，再下个 12.1..."。判定用 `while (sum >= nextThr)` 处理一次吸收触发多次的情况
5. **大型激光** — `_fireArcaneGiantLaser` 在 EntityTurn 触发：高速短寿命 Bullet（speed 1600 / lifetime 0.6）带高 penetrate，加 12 颗沿线 ring 粒子 + 屏幕震动
6. **测试入口暴露** — 在 game.js 末尾 `window.__absorbIntoArcaneGiant = ...; window.__fireArcaneGiantLaser = ...; window.__Bullet = Bullet;` 让 preview_eval 能直接构造 Bullet + 验证机制（不污染玩家路径，纯测试辅助）

读这两段（战旗 + 奥数巨人）就覆盖了从"中等复杂度"到"高复杂度"两个档位的写卡范本。
