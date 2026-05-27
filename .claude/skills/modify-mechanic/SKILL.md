---
name: modify-mechanic
description: 卡牌射击 web 项目里"修改 / 重写已有机制"的工作流。用于改一张已有卡的行为（不只是数值）、修 bug、扩展现有系统（发现队列、连击、回合制、燃烧、AOE、实体子弹等）。当用户说 "XX 行为是 bug"、"叫魂应该 ..."、"把 XX 改成 ..."、"现在 XX 不会触发 ..." 时使用此 skill。前置阅读：`card-shooter-overview` skill。
---

# 修改 / 重写机制 工作流

> **前置**：先读完 `card-shooter-overview` skill。

跟 `add-card` 的区别：`add-card` 是从 excel diff 出发新增一张卡；本 skill 是已有机制要改 / 修 bug / 加新行为。
许多任务两个都涉及（例如 v6 既新增 "战旗" 又把 "骷髅领主" 行为重写）。

---

## 1. 诊断流程：先把"问题在哪一层"问清楚

机制 bug 通常出在以下层之一，先定位再动手：

| 层 | 典型症状 | 代码区域 |
|---|---|---|
| 数据 def | desc 跟代码行为对不上 | `CARD_DATA[fid].tiers[tier]` |
| Hook 实现 | 子弹属性没改 / Effect 没注册 | `_xxxTier()` 内的 `effects: () => [...]` |
| 副作用 / 状态变更 | onUse / onDiscard / onReveal 没调用 | 看是否被 `discardRandomFromHand` / `destroyCard` 之类绕过 |
| 事件总线 | 监听了但没触发 / 监听器累积 | `Events.on / Events.emit / Events.off` |
| UI 渲染 | 数据对了但屏幕没显示 | `setupUI / cardEl / modalCardEl / setupLootPanel` |
| 回合 / 状态机 | 卡在某个 state 不进下一步 | `BattleManager.state / turn / endPlayerTurn` |
| 发现 / Discover | 多个发现没排队 / 没显示 | `triggerDiscover / _discoverPending / _discoverQueue` |
| 子弹追踪 / 重定向 | 子弹没去到该去的目标 | `Bullet.activate` 的 lock + `Bullet.update` tracking 段 |
| 子弹间吸收 / 接触 | "我的子弹应该被 X 吸收但没"  | `Bullet.update` 位置更新后的距离检测块 |

诊断步骤：
1. 让 preview 起来，浏览器开控制台
2. `window.__game` 拿到 World 实例
3. 手动复现：把相关卡塞 hand → 触发对应动作 → 观察 `_discoverPending` / `bullets` / `deck.hand` 等状态
4. 比对：用户说 "应该" 怎样、当前怎样、差在哪一层

例：**"叫魂同时弃置挖掘 + 定向勘探不会触发发现"**
- 排查发现 `_soulcallTier` 内调 `discardRandomFromHand(2)`
- 看 `CardDeck.discardRandomFromHand` 源码 → 它只把卡 push 到 discard，没调 `card.onDiscard?.()`
- 真正的 `onDiscard` 触发在 `doDiscard()` 函数里（玩家手动按弃左 / 弃右走的路径）
- → 根因：`discardRandomFromHand` 漏调 onDiscard hook → 修这个函数

---

## 2. 常见机制层的"如何改"

### 2.1 Hook 阶段（Phase.PreActive 等）

修改一张卡的 PreActive / Spawned / HitWall / HitEnemy / Destroyed / EntityTurn 行为：在 `_xxxTier()` 内编辑对应 `new Effect(Phase.X, priority, ctx => {...})`。

`priority` 数字越小越早执行。同一 Phase 多 hook 时用 priority 控顺序（默认 0；100 = 最后；-1 = 最先）。
`ctx` 字段：
- `bullet` 始终有
- `world` 在大多数 Phase 有（PreActive 也有）
- `enemy` 只在 HitEnemy
- `normal` 只在 HitWall

### 2.2 实体子弹（剑士 / 骷髅领主 / 战旗 等）

设计 pattern：
```js
effects: () => [
  // PreActive：写一次属性，包含 entityLayers
  new Effect(Phase.PreActive, 0, ctx => {
    if (ctx.bullet._isSkeleton) return;        // 防止召唤的骷髅继承自身光环
    ctx.bullet.entityLayers += 2;
  }),
  // Spawned：装饰 + 监听器
  new Effect(Phase.Spawned, 0, ctx => {
    if (ctx.bullet._isSkeleton) return;
    (ctx.bullet._entityDecos = ctx.bullet._entityDecos || []).push('skull');
    if (b._myHandler) return;
    b._myHandler = (s) => { /* ... */ };
    Events.on('summonDied', b._myHandler);
  }),
  // EntityTurn：每个敌方回合执行一次（自动 -1 层）
  new Effect(Phase.EntityTurn, 0, ctx => {
    if (ctx.bullet._isSkeleton) return;
    /* 攻击 / 召唤 / 治疗 / ... */
  }),
  // Destroyed：解绑监听器
  new Effect(Phase.Destroyed, 0, ctx => {
    if (ctx.bullet._isSkeleton) return;
    if (b._myHandler) {
      Events.off('summonDied', b._myHandler);
      b._myHandler = null;
    }
  }),
],
```

**关键守则**：召唤出来的 skeleton 不应继承本卡 self-aura（否则无限自我繁殖）→ 用 `if (ctx.bullet._isSkeleton) return` 早退所有 hook。

### 2.3 展露（onReveal / onConceal）

**展露 = 卡面 face-up 时持续生效**。最常见 pattern：onReveal 时注册 Events 监听器，onConceal 解绑：

```js
onReveal(card) {
  if (card._xxHandler) return;             // 防重入
  card._xxHandler = (arg) => {
    if (!card.faceUp) return;              // 双保险：face-down 时不应执行
    /* 你的逻辑 */
  };
  Events.on('eventName', card._xxHandler);
},
onConceal(card) {
  if (card._xxHandler) {
    Events.off('eventName', card._xxHandler);
    card._xxHandler = null;
  }
},
```

常监听的事件：`summonSpawned`、`summonDied`、`cardUsedSide`、`enemyDied`、`beforeShoot`、`deckChanged`。

### 2.4 弃置（onDiscard）

`onDiscard(card, world)` 在以下路径被调用：
- 玩家手动按"弃左 / 弃右"→ `doDiscard()` 调用
- 叫魂的随机弃 2 张 → `CardDeck.discardRandomFromHand(n)` 调用（v6 修复，原本漏调）
- 战术撤退的反面弃 → `CardDeck.discardRandomFaceDown(n)`（**目前不调 onDiscard**；如果新机制要走这条路，需要先补上）
- 掘墓发现的卡到回合结束 → `BattleManager.endPlayerTurn` 内的 auto-discard 循环

**如果新 / 改的机制需要"任何路径的弃置都触发副作用"，先确认这 4 条路径都覆盖到**。

### 2.5 发现 / Discover 队列

```js
triggerDiscover(world, {
  candidates,           // 最多 3 张 Card 实例
  sourceCard: card,     // 哪张卡触发的（UI 队列提示用）
  title: 'XX',          // 模态标题
  sub: '...',           // 副标题
  onPick: (chosen) => { /* 选中后的副作用 */ },
});
```

机制：
- 单个挂起 → 写 `world._discoverPending` + emit `discoverShow`
- 已挂起 → 进 `world._discoverQueue` + emit `discoverQueueChanged`
- 玩家点候选 → `resolveDiscover(world, idx)` → 调 onPick → 若 queue 非空自动 pop 下一个

UI 监听：`Events.on('discoverShow' | 'discoverHide' | 'discoverQueueChanged')` 在 `setupUI` 内（搜 `$discoverQueue`）。

改这块的常见任务：
- 在弹窗里加新视觉提示（候选卡的某种标记 / 计数器） → 改 `setupUI` 内 `Events.on('discoverShow', ...)` 回调
- 改候选池规则 → 改各 `_xxxTier()` 里 `triggerDiscover` 之前的 candidates 构造（如 `_rollRevealDiscoverCandidates`）

### 2.6 状态机 / 回合制

`BattleManager.state ∈ { Idle, PreBattle, Battle, PostBattle, Reward, Inventory }`
`BattleManager.turn ∈ { 'player', 'enemy' }`

切换走 `setState() / setTurn()`，会 emit `stateChanged / turnChanged` 事件。

要在回合切换处插逻辑：
- 玩家回合结束 → `endPlayerTurn()`（已有 auto-discard 循环、剩余法力转金、火焰结算、商店 / 进入敌方回合的统一入口）
- 敌方回合开始 → `_startEnemyPhase()`
- 实体子弹回合 → `_tickEntityBullets()`（触发所有 isEntity 的 Bullet 的 EntityTurn hook）

加新机制要触发"回合结束时"，最干净的入口是在 `endPlayerTurn()` 顶部加循环（参见现有的 auto-discard 循环）。

### 2.7 燃烧 / 冻结 / 持续状态

- `applyFire(enemy, layers)` 加燃烧；每回合结束在 `_tickFireDamage` 结算
- `applyFreeze(enemy, layers)` 加冻结；下回合敌人 skip 行动
- `detonateFire(world, source, mult)` 立即触发场上所有燃烧

新加状态：参考 `enemy.fire / enemy.freeze` 字段 + `_tickFireDamage / setupEnemyTurn` 内的扫描循环。

### 2.8 AOE 范围伤害

```js
applyAoe(world, source, {
  kind: 'circle' | 'cone',
  damage,                          // 推荐传 source.attack（让增伤 buff 乘算）
  mult: AOE_MULT.xxx,              // 半径倍率，或直接 radius
  halfAngle, dirAngle,             // cone 才需要
  target: 'enemies',
  color: '#xxx',
});
```

**伤害不要写死**，传 `ctx.bullet.attack` 让燃烧弹之类的"以子弹自身伤害为基数"的设计成立。

### 2.9 召唤 / 实体子弹生成

```js
spawnSkeleton(world, { x, y, entityLayers: 1, attackBonus: 0 });
spawnSwordSaint(world, { attack, awakened });
spawnUndeadDragon(world, { x, y });
```
返回 `Bullet` 实例（已自动加 EntityTurn dash + Destroyed → emit summonDied）。

**任何"会给骷髅 buff"的卡都不要靠 hook 继承传染** — 要么直接遍历 `world.bullets` 找 `_isSkeleton`，要么监听 `summonSpawned` 给未来召唤的骷髅打 buff。

#### ⚠ 召唤 vs 实体化 — 设计分类（必读，v8 踩过坑）

游戏里有两种"友方单位"，语义截然不同，**新加卡必须先想清楚走哪一支**：

| 类别 | 关键字 | 来源 | 是否继承本回合 hooks（主卡 / 侧卡 effects）|
|---|---|---|---|
| 召唤 | "召唤" / "summon" | 凭空生成单位（骷髅、剑圣、亡灵龙、护盾兵…）| **不继承** — 单位行为完全由 spawnXxx 自己定义 |
| 实体化子弹 | "实体化" / "Entity" | 子弹 entityLayers>0 → 撞墙 / lifetime 耗尽后停在原地变成单位 | **继承** — 单位 = 当时的那颗子弹，hooks 都在它身上 |

为什么这么设计：
- 实体化是"子弹的延续"：那颗子弹本来就有本回合 PreActive/Spawned hooks（注铅 +10 攻、爆骨花骷髅 buff 等），变成实体后这些 hook 仍属于它 → 自然继承
- 召唤是"凭空生成新单位"：不应该读"玩家这回合出过什么牌"。否则会有"用 X 卡时手牌随便有个召唤效果就被 X 加成"的失控感

实现守则：
1. 召唤路径里**绝对不要**调 `world._turnHookCards` 或 `tpl.copyHooksFrom`；spawnXxx 只用 `new Bullet({...})` + `addHook(自己的 EntityTurn / Destroyed)` + `activate(now)`（activate 仅应用 permUpgrades，符合"永久升级对全友方生效"语义）
2. 召唤的 dash / 攻击：用 `applyAoe(world, b, {damage: b.attack, ...})` 直接结算（不走 HitEnemy 钩子）；或用 `b.speed > 0 + isEntity=false` 走撞击流程，但要确认子弹模板里 hooks 为空（spawnSkeleton/spawnSwordSaint 都这么写）
3. 召唤如果发射子弹：`new Bullet(...)` 后**不要** copyHooksFrom 任何模板
4. 实体化子弹的 hook 入口：在 `_xxxTier()` 的 `effects: () => [...]` 里返回的 Effect 数组，发射时通过 `bulletTemplate.addHook(h)` 灌入

### 2.9.b 展露触发的"一次性自动结算"卡（如造访剑圣）

诉求："展露状态下，回合结束触发 1 次效果，然后弃置此牌"。坑点 + 解法：

```js
onReveal(card) {
  if (card._xxHandler) return;
  card._xxHandler = (t) => {
    if (!card.faceUp) return;
    if (t !== 'enemy') return;           // 玩家回合 → 敌方回合的瞬间
    if (card._xxTriggered) return;        // 防重入（同次 emit 不会重复，但 setTimeout 等异步可能）
    card._xxTriggered = true;
    // 执行核心效果（召唤 / buff / etc.）
    spawnXxx(world);
    // 弃置自己：手动从 hand 移除 + 推入 discard。**toDiscard 不会自动从 hand 移除**。
    const w = window.__game;
    const idx = w.deck.hand.indexOf(card);
    if (idx >= 0) {
      w.deck.hand.splice(idx, 1);
      card._lastAction = 'use';            // 控制离场动画（use / discard / buff）
      w.deck.toDiscard(card);              // 内部调 _setFace(false) → 触发 onConceal → 解绑 handler
    }
  };
  Events.on('turnChanged', card._xxHandler);
},
onConceal(card) {
  if (card._xxHandler) {
    Events.off('turnChanged', card._xxHandler);
    card._xxHandler = null;
  }
  // 重要：清掉 triggered 标记 → 下次重洗回手牌再展露允许再触发一次
  card._xxTriggered = false;
},
```

常见 bug：
- 漏弃置 → 每回合都触发（用户看到"召唤了一堆")
- 弃置只调 toDiscard 不从 hand splice → 卡在 hand + discard 都出现
- 漏 _xxTriggered 标记 → 弃置过程中 onConceal 异步触发，可能在同帧再触发一次
- onConceal 不清 _xxTriggered → 重洗回手牌后再展露不触发（永远卡住）

### 2.9.c "钻头"型穿透（穿过敌人时连续命中）

诉求："穿透时不断造成伤害 + 击退"，让子弹钻穿敌人时多次结算。

机制：每颗 Bullet 有 `pierceHitCooldown`（默认 0.5s）—— 同一颗 bullet × 同一只 enemy 在 0.5s 内只命中 1 次。把这个 CD 缩短即可。

```js
function _drillTier(pen, pierceCD, value) {
  return {
    cost: 3, value,
    effects: () => [
      new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.penetrate += pen; }),
      new Effect(Phase.Spawned, 0, ctx => {
        ctx.bullet.pierceHitCooldown = pierceCD;   // 0.05 = 20Hz 重命中
      }),
    ],
  };
}
```

CD 取值参考（实测在 250 px/s + r=16 小敌人上）：
- 0.10s → 一次穿过命中 2 次
- 0.05s → 命中 3 次（铜银档"基础"钻头）
- 0.025s → 命中 5 次（金钻档"快速"钻头）

每次命中消耗 1 penetrate（默认 `_defaultHitEnemy` 逻辑），所以钻头要把 `penetrate` 给够（铜 3 / 银 5 / 金 5 / 钻 8）。

参考 `_drillTier`。

### 2.10 子弹目标重定向（targeting override）

如果你的卡需要"让特定子弹优先 / 必定打某个目标"（如奥数巨人吸引奥弹），改 `Bullet.activate()` 和 `Bullet.update()` 两处：

```js
// activate() 末尾：lock 阶段最后做 override
if (this.isArcane && this.team !== 'enemy') {
  let bestG = null, bestGD = Infinity;
  for (const b of (w.bullets || [])) {
    if (!b.alive || !b._isArcaneGiant) continue;
    const d = Math.hypot(b.x - this.x, b.y - this.y);
    if (d < bestGD) { bestGD = d; bestG = b; }
  }
  if (bestG) this._lockTarget = bestG;
}

// update() tracking 段：每帧 override（不仅 lock 死时回落）
if (this.tracking) {
  let nearest = null;
  if (this.isArcane && this.team !== 'enemy') {
    // ...同上扫一遍 giants 选最近
  }
  if (!nearest) { /* 原 lockTarget / enemies 逻辑 */ }
  // ... 原 angle/speed 转向逻辑
}
```

参考实现：奥数巨人 (v7) — `_isArcaneGiant` 标记 + 上述两处 hook。

### 2.11 接触吸收 / 子弹间交互

子弹之间默认不互相检测。要让 A 子弹接触 B 时触发自定义行为（不走 HitEnemy）：在 `Bullet.update()` 的位置更新后加距离检测：

```js
this.x += Math.cos(this.angle) * this.speed * dt;
this.y += Math.sin(this.angle) * this.speed * dt;

if (this.isArcane && this.team !== 'enemy') {
  for (const b of (world.bullets || [])) {
    if (!b.alive || !b._isArcaneGiant) continue;
    const dx = b.x - this.x, dy = b.y - this.y;
    if (dx*dx + dy*dy <= (b.radius + this.radius) ** 2) {
      _absorbIntoArcaneGiant(b, this, world);
      this.alive = false;
      Events.emit('bulletDestroyed', this);
      return;
    }
  }
}
```

注意：这种"被吸收"路径**不应触发** HitEnemy / 穿透 / 燃烧。直接 `alive = false` + return 跳过后续 wall / 碰撞流程。

### 2.12 浮点阈值 + 边际递减触发

设计模式："每 N 个 X 给 1 个 Y，但下次需要 N×1.1 个"：

```js
const s = state._counters ||= { sum: 0, next: 10, gained: 0 };
s.sum += incoming;
while (s.sum >= s.next) {
  s.next *= 1.1;
  s.gained += 1;
}
```

- `next` 初始 10，每触发 ×1.1 → 10 / 11 / 12.1 / 13.31 / ...
- 用 `while` 不是 `if`：一次大输入可能触发多次（如一次进 50 → 触发 4 次）
- "判定时向下取整" 一般指 `next` 是浮点、sum 也是浮点直接比较；不需要额外取整步骤

参考：奥数巨人的 6 个并行计数器（count / atk / bound / pen / fire / freezePct）。

---

## 3. UI 改动

`setupUI(world)` 是大入口（行 ~8450）。下面几个常见 panel 的查找词：

| 改动 | 搜索词 |
|---|---|
| 手牌渲染 | `renderHand` / `cardEl` |
| 主卡渲染 | `mainCard / opts.main` |
| 发现弹窗 | `$discover` / `Events.on('discoverShow'` |
| 商店面板 | `setupLootPanel` |
| 背包面板 | `setupInventoryPanel` |
| HUD（HP / 法力 / 金币 / 连击 / 状态） | `$hp / $mana / $gold / $combo / $state` |
| 关键词 tooltip | `setupKeywordTooltips` |
| 永久升级 | 搜 `permUpgrades` |

添加新 UI 元素：先在 `index.html` 加 DOM 容器 → `style.css` 加样式 → `game.js` 在合适 setup 里查询 + 监听事件 + 渲染。

---

## 4. i18n

任何新加的 UI 字符串要双语，走 `I18N.zh / I18N.en` 字典（行 ~822），用 `t(key, vars)` 取值。
卡描述要双语 `desc: { zh, en }`。
KEYWORDS 字典里只有英文翻译跟中文一致才会触发加粗 / tooltip — 加新关键词时 zh/en 同步。

---

## 5. 验证 checklist

每次改完机制至少跑这些：

1. **preview_console_logs --level error** — 静默页面加载后无错
2. **手动复现一遍**：把相关卡塞 hand 触发原本会出错的流程，确认现在对了
3. **跨语言**：切到另一种语言（`localStorage.cs_lang = 'en' / 'zh'` + reload），确认 desc / 关键词 / UI 字符串都对
4. **不破坏老卡**：与改动机制相关的其它卡至少检查一张（如改了 `discardRandomFromHand` 后跑一遍 "battle 里随机弃 1 张普通卡"，确认没炸）
5. **回归发现队列**：改任何 onDiscard / Discover 相关的，跑一遍 v6 验证脚本（叫魂同时弃出挖掘+定向勘探，确认两次发现都出）

参考脚本（preview_eval）：
```js
(function() {
  const w = window.__game;
  const exc = window.__mkCard('excavate', 'silver');
  const dsv = window.__mkCard('directed_survey', 'bronze');
  w.deck.hand.length = 0;
  w.deck.hand.push(exc, dsv);
  w.deck._setFace(exc, true); w.deck._setFace(dsv, true);
  w._discoverPending = null; w._discoverQueue = null;
  w.deck.discardRandomFromHand(2);
  return {
    pending: w._discoverPending?.sourceCard?.familyName,
    queueLen: (w._discoverQueue || []).length,
  };
})()
// 应得 pending: '挖掘', queueLen: 1
```

---

## 6. 写代码风格

- 注释用中文，写**为什么** > 写**做了什么**
- 长函数前面留 3-5 行注释说明设计 / 边界 / 已知坑
- 命名跟现有风格：私有 helper 加 `_` 前缀（`_xxxTier / _renderDiscoverQueue`）；事件名 lowerCamelCase（`discoverShow / summonDied / deckChanged`）
- 不要无缘无故重命名既有 API / 删除注释 — 保留历史脉络方便后来人
- 改 5 行能解决就别重构 50 行

---

## 7. 典型任务范本

### A. 修 bug
1. 复现 → 找根因层（见第 1 节）→ 改最小补丁 → preview 跑回归
2. 写一个简短注释解释"原因 + 修复点"，方便下次别人改的时候不会重新踩

### B. 重写一张卡的行为（如 v6 骷髅领主）
1. 读原 `_xxxTier` 函数 → 列出"原有 4 个 hook"
2. 对照新效果文本 → 标"删 / 改 / 保留 / 新增"
3. 重写整个函数（不要打补丁式留死代码）
4. 注册表 `CARD_DATA.xxx.tiers` 的参数同步更新（v6 把 `_skeletonLordTier(spawnN, value, sepZh, sepEn)` 改成 `_skeletonLordTier(attacksPerTurn, value)`，调用点同步）
5. 验证

### C. 扩展现有系统（如发现队列加 UI 提示）
1. 找现有事件总线 / state 字段（如 `_discoverQueue`）
2. 加新事件 emit（`discoverQueueChanged`）让现有 trigger / resolve 时通知 UI
3. UI 层加监听 + 渲染
4. 改不影响老路径：现有不传新参数也能跑（`sourceCard` 是 optional）

---

## 8. 常见坑

1. **改了 hook 但忘了在 CARD_DATA 同步参数** → 函数签名变了，注册点报错或行为不正确
2. **onReveal 加监听但 onConceal 没解绑** → 翻面切换时事件累积
3. **召唤的 skeleton 继承本卡 aura** → 无限自我繁殖 → 用 `_isSkeleton` 早退
4. **直接遍历 `world.bullets` 改属性时漏检 `b.alive`** → 给死掉的 bullet 加 buff（其实没卵用，但 console 容易出怪日志）
5. **AOE 伤害写死数值** → 与"加倍伤害"buff 不能乘算，破坏设计
6. **改了 endPlayerTurn 流程但漏了 `if (world._discoverPending) return;`** → 玩家发现弹窗还开着就能结束回合 → 状态机错乱
