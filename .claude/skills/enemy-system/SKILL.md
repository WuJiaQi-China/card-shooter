---
name: enemy-system
description: 卡牌射击 web 项目里"敌人 / 怪物 / 波次 / Boss"相关的工作流。包括：新增敌人类型、调敌人 HP / 攻击 / 速度 / 行为 / intent、加新 AI 行为模式、改波次构成 / 难度曲线、boss 多 intent 设计。当用户说 "加一个 boss"、"狙击手太强"、"加一个会召唤骷髅的敌人"、"波次太密 / 太松"、"敌人种类不够" 等场景时使用此 skill。前置阅读：`card-shooter-overview` skill。
---

# 敌人 / 波次 工作流

> **前置**：先读 `card-shooter-overview`。

敌人系统由三块组成：

```
1. ENEMY_TYPES 字典   →  game.js 行 ~1901，每个敌人的全部静态数据
2. Enemy 类 + AI     →  game.js 行 ~2020，update / draw / takeDamage / behavior 分支
3. 波次系统          →  BattleManager 内 stageNumber / waveInStage / _pickEnemiesForValue / nextWaveTypes
```

---

## 1. ENEMY_TYPES 字典结构

每个敌人的全部数据塞在一个字面量里：

```js
goblin: {
  name: '哥布林', icon: '👹',
  maxHp: 4, attack: 1, speed: 90, radius: 16,
  color: '#7a8a4a', shape: 'circle',          // 视觉
  xpReward: 2, value: 3,                       // 经验 + 波次预算 cost
  minWave: 1,                                  // 第几波解锁
  behavior: 'melee',                           // AI 模式
  intents: [
    { kind: 'melee', icon: '🗡', cooldown: 0,
      desc: '接触造成 1 伤害，自爆' }
  ],
},
```

| 字段 | 含义 |
|---|---|
| `name / icon` | UI 显示（icon 是头顶大 emoji，draw 用） |
| `maxHp` | HP 上限；战斗中 hp 单独存 |
| `attack` | 接触伤害（远程类设 0 用 intent.value 替代） |
| `speed` | 移动速度 px/s |
| `radius` | 碰撞半径 + 渲染半径 |
| `color / shape` | `circle / triangle / rect` + 颜色 |
| `xpReward` | 击杀获得经验 |
| `value` | 波次预算：`_pickEnemiesForValue(总预算)` 凑齐这一波 |
| `minWave` | 第几波解锁（`_availableEnemies(waveNumber)` 过滤） |
| `flies` | true 飞行单位（无视梯形地形 / 不被某些子弹阻挡） |
| `behavior` | `melee / kiter / rusher / edge_kiter / support` |
| `preferredRange` | kiter / support 的偏好距离 |
| `accuracyJitter` | 弹道角度抖动 |
| `intents` | 行为序列，每回合按顺序触发 |
| `onDeath` | 特殊死亡逻辑（如 `'split'` → 分裂为 2 个小型）|
| `_isReward` | 特殊：奖励金球（不可击杀，被打掉金币）|

### Intent 字段

intent 是"每回合敌人做什么"的声明：

```js
{ kind: 'ranged',     // melee / ranged / rangedMulti / sniper / rush / heal / summon / buff / buffall / debuff / aoe / selfdest / selfbuff
  icon: '🏹',         // UI 显示在敌人右下角
  cooldown: 2,        // 几回合后触发
  value: 2,           // 主要数值（伤害 / 治疗 / buff 值，按 kind 解读）
  desc: '2 回合后射 1 颗弹（2 伤）',
  // 可选：
  count: 3,           // rangedMulti 弹数
  bound: 3,           // ranged 时给弹的弹射数
  tracking: true,     // ranged 时弹追踪
  spawn: 'goblin',    // summon 时召唤的 enemy key
}
```

intent 行为实现在 `Enemy.update / _executeIntent` 之类的内部方法里，搜对应 kind 字符串能定位到处理逻辑。

---

## 2. i18n（ENEMY_TR 字典）

行 ~1983：
```js
goblin: { name_en: 'Goblin', intents_en: ['Contact for 1 dmg, self-destructs'] },
```
- `name_en` 英文敌人名
- `intents_en` 数组按 `intents` 顺序一一对应英文描述

**加新敌人必须同步加 ENEMY_TR 条目**，否则英文 UI 显示 undefined。

---

## 3. 新增敌人（标准流程）

### Step 1: 在 ENEMY_TYPES 加条目

参考相近敌人 copy 一份改：
```js
my_enemy: {
  name: '新敌人', icon: '🦂', maxHp: 6, attack: 2, speed: 70, radius: 15,
  color: '#a06080', shape: 'circle',
  xpReward: 5, value: 6, minWave: 8,
  behavior: 'kiter', preferredRange: 280,
  intents: [
    { kind: 'ranged', icon: '🏹', cooldown: 2, value: 2,
      desc: '2 回合后射 2 伤弹' },
  ],
},
```

### Step 2: 在 ENEMY_TR 加翻译
```js
my_enemy: { name_en: 'My Enemy', intents_en: ['Fires a 2-dmg shot in 2 turns'] },
```

### Step 3: 选 behavior

如果现有 `melee / kiter / rusher / edge_kiter / support` 都不合适：
- 找 Enemy.update 里 `switch(this.def.behavior)` 分支位置（搜 `behavior === 'kiter'`）
- 加新 case + 实现移动逻辑（用 `_nearestTarget` / `angleBetween` / `this.x / this.y` 算速度向量）

### Step 4: 选 intent kind

如果现有 kind 都不合适：
- 找 `_executeIntent` 或在 `Enemy.update` 里搜 `intent.kind ===`
- 加新 case 实现行为（射弹 / 召唤 / 治疗 / buff / debuff / AOE）
- 远程射弹用 `spawnEnemyBullet(world, this, opts)`（行 ~2693）

### Step 5: 调 value（波次预算）

`value` 决定这只敌人在波次里"占多少预算"。新敌人 `value` 大概等于 `maxHp + 攻击影响系数`。
对比相近 minWave 同等强度的敌人，调到合理数值。预算总额由 `_targetWaveValue(waveNumber)` 算（搜函数定义）。

### Step 6: 验证

```js
preview_eval：
({
  has: !!ENEMY_TYPES?.my_enemy,
  // ENEMY_TYPES 是 IIFE 内的 const，可能 window 不可见 — 用 window.__game 间接探
  spawn: (() => {
    const w = window.__game;
    if (!w.battle._spawnEnemy) return 'helper not exposed';
    return w.battle._spawnEnemy('my_enemy');
  })(),
})
```

在浏览器里手动开战 → 推进到 minWave 那波 → 看新敌人是否出现 + 行为是否符合预期。

---

## 4. 改已有敌人的数值

最简单的任务（数值平衡），直接改 ENEMY_TYPES 里的字段：
- HP 太低 / 太高 → `maxHp`
- 移动太快 / 太慢 → `speed`
- 攻击太狠 → `attack` 或 `intents[i].value`
- 太早 / 太晚出现 → `minWave`
- 经验给得不合理 → `xpReward`
- 在波次里出现频率过高 / 过低 → `value`

改完跑战斗实测，注意：
- 修改 minWave 不影响存档进度（玩家可能正处于过波次中）
- 修改 xpReward 不会回溯已击杀（不重要，但用户问起来要说清）

---

## 5. 波次系统

`BattleManager` 行 ~6551 起：
- `stageNumber`：当前第几关（玩家可见）
- `waveInStage`：本关内第几波（0..7）
- `stageTurn`：本关玩家回合数
- `waveNumber`：跨关累积波次（用于 minWave 解锁）
- `nextWaveTypes`：下一波预览数组，UI 显示

核心函数：
- `_targetWaveValue(waveNumber)` → 这一波的总预算
- `_availableEnemies(waveNumber)` → 当前可 spawn 的敌人池（按 minWave 过滤）
- `_pickEnemiesForValue(targetValue, pool)` → 用现有 enemy 凑齐预算
- `_spawnEnemy(typeKey)` → 实际 spawn 一个敌人（按 spawnT 延迟入场）

改波次曲线：调 `_targetWaveValue` 的计算公式（线性 / 指数 / 关卡进度乘数）。
改单波种类多样性：调 `_pickEnemiesForValue` 的选择策略（贪心 / 加权随机 / 强制混种）。

---

## 6. Boss 设计

Boss 用 ENEMY_TYPES 里的特殊条目（参考 `boss:` 行 ~1969）：
- `maxHp` 显著高（25+）
- 多个 intents（每回合按某种顺序触发；当前实现是按 array 顺序循环）
- 大 radius / 特殊颜色 / 大 emoji
- 通常 minWave 很高（25+），由 `_targetWaveValue` 在那个关卡产生一只独立 boss 波次

新 boss：
- 选 3-5 个有特色的 intent（混合射击 / 召唤 / AOE / debuff）
- HP 设计：玩家此时大约能打 25-40 dmg/回合，HP 给 80-120 让 boss 战持续 3-5 回合
- 视觉：用大 radius（28+）+ 醒目 emoji + 自定义 color

---

## 7. 敌人 AI 行为速查

| behavior | 含义 | 用法 |
|---|---|---|
| `melee` | 直冲玩家 / 召唤物 | 哥布林、突击兵、自爆球 |
| `kiter` | 维持 preferredRange，远了走近、近了后退 | 弓箭手、狙击手、追踪兵 |
| `rusher` | 高速冲刺型 melee | 突击兵（speed 180+） |
| `edge_kiter` | 边缘 kiter（贴墙保持距离） | 弹射射手 |
| `support` | 治疗 / buff 队友，避开玩家 | 治疗师、指挥官、尖叫者、时空法师 |

加新 behavior：在 Enemy.update 内 switch 分支加 case + 实现移动逻辑。

---

## 8. 常见任务范本

### A. "加一个会冻结玩家法力的敌人"
1. 在 ENEMY_TYPES 加条目，设 behavior=`support` + preferredRange ~300
2. 新 intent `{kind: 'debuff', icon: '❄', cooldown: 2, desc: '冻结 2 法力'}`
3. 在 intent 实现处加 `kind === 'debuff'` 分支调 `world.player.mana -= 2`（或新建一个 freeze mana 状态）
4. ENEMY_TR 补英文
5. 验证：到 minWave 那波看新敌人出现 + 行为生效

### B. "boss 战太快结束"
- 提高 `boss.maxHp`（25 → 80）
- 加几个新 intent 增加战斗节奏（如循环 ranged → summon → aoe）
- 或拆 boss 战为多波（_targetWaveValue 在 minWave=25 特殊处理）

### C. "前期太轻松"
- 提高 minWave 1-3 波的 `_targetWaveValue`
- 或调 `goblin / archer` 等早期敌人的数值
- 或减少给玩家的起手装备（CARD_DATA.boost1 等）

---

## 9. 验证 checklist

1. **静态字段对**：preview_eval 检 ENEMY_TYPES.xxx 字段（或开战实际 spawn 看）
2. **i18n 双语**：切 zh/en 看敌人名 + intent desc
3. **波次构成**：到 minWave 那波，连开几次战斗看新敌人出现频率
4. **AI 行为合理**：玩 1-2 回合观察移动 / 攻击 / 状态变更
5. **无 console error**：preview_console_logs --level error
6. **对存档兼容**：旧存档（localStorage 里的 highScore 等）应不受影响

---

## 10. 常见坑

1. **加新 enemy 后 minWave 没设** → 默认从 wave 1 就出现，可能太早
2. **intent kind 是新字符串但没在 `_executeIntent` 加分支** → 静默不触发
3. **远程敌人 attack 设 >0** → 接触 + 远程双重伤害；远程用 attack=0 + intent.value
4. **summoner spawn 的敌人 minWave 高于当前波** → 召唤失败 / 行为异常
5. **新敌人 value 失衡** → 一只占满整波预算 → 单只 boss 体验；调小让一波多只
6. **shape 写错** → draw 用 fallback 默认；视觉看着不对
7. **ENEMY_TR 漏写** → 英文 UI 看到 undefined
