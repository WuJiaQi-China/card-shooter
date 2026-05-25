# 卡牌射击 Web 复刻 · 50 张卡实现任务交接

> 复制全部内容到新对话即可开工。

---

## 一、情况概要

**项目**：HTML5 Canvas 卡牌射击 roguelike，Unity 原项目（`C:\项目\卡牌射击`）的纯 Web 复刻。

**项目根目录**：`C:\Users\31937\Desktop\卡牌射击-web`

**当前进度**：
- 框架、UI、回合制、Loot 升级、稀有度、关键词、商店等级系统全部就绪
- 4 张演示卡（增弹 / 鱼目混珠 / 墨镜 / 凝视）跑通 Hook 系统
- 50 张完整设计文档已写好（见 [CARDS.md](CARDS.md)，v3.3）
- **本任务：按 CARDS.md 实现剩余 46 张卡 + 配套核心机制**

---

## 二、文件结构

```
卡牌射击-web/
├── index.html        # 入口 + 所有 UI 容器
├── style.css         # 暗色主题、卡牌、Loot 面板、关键词 tooltip
├── game.js           # 全部游戏代码（~2000 行，单文件，按 region 分区）
├── CARDS.md          # 50 张卡设计文档（v3.3，连携 = buff stacks 重定义）
├── HANDOFF.md        # 本文件
├── README.md         # 简介
└── .claude/launch.json  # Claude Code 预览服务器配置
```

**预览方式**：双击 `index.html` 直接玩；或 `python -m http.server` 起服务后访问。

---

## 三、game.js 代码分区（按 region 注释）

```
0.  工具          // clamp/lerp/rand/Emitter/Events/角度/escapeHtml
    梯形几何      // trapBounds / trapNormals
    关键词        // KEYWORDS 字典 / renderDescWithKeywords / escapeHtml
1.  Hook/Effect   // Phase 枚举 / Effect 类
2.  Bullet        // 模板+克隆、梯形墙碰撞、Hook 触发链
3.  Enemy         // takeDamage / selfDestruct / 仅敌方回合移动
4.  PlayerCannon  // 旋转、HP、法力（不自动回）、动作冷却
5.  Card          // 基类 + 4 张演示卡 + ALL_CARD_CTORS + drawRandomCard
                  //（按 world.shopLevel 概率抽，非 player level）
6.  CardDeck/Combo // bag/hand/discard、resetForBattle、toDiscard 异步 reshuffle
7.  BattleManager // 状态机 + 回合制 + 升级触发 Loot
8.  World         // 容器：player/enemies/bullets/particles/summons(空)/deck/combo/battle
                  // + level/xp（玩家）+ shopLevel/candidatesCount/rerollsAvailable（商店）
8.1 Particle      // 通用粒子 + XpOrb + DamageNumber + FX 各类
9.  fireFromCards / fireOneWave  // 发射核心（注意：已删炮台位置特效 FX.muzzle/cardUse）
10. setupInput    // 鼠标 + 键盘 + 持续发射
11. setupUI/setupLootPanel/setupKeywordTooltips
12. Render / Main Loop
```

---

## 四、已实现的核心机制

| 机制 | 实现位置 | 说明 |
|---|---|---|
| **Hook 6 阶段** | Bullet.triggerHooks | PreActive / Spawned / HitWall / HitEnemy / Destroyed / PostActive |
| **回合制** | BattleManager.turn + endPlayerTurn | 玩家回合冻结敌人；敌方回合 0.5s 后切回，水晶满 |
| **梯形地图** | World.trap + trapBounds/trapNormals | 上宽 900 下宽 400，子弹按斜边反射 |
| **稀有度系统** | Card.rarity + RARITY_PROB + drawRandomCard | 自走棋式概率（按 **shopLevel** 1~8 倾斜） |
| **商店等级系统** | World.shopLevel + SHOP_THRESHOLDS + _shopLevelUp | 独立于 player level；阈值 [1,2,4,6,8,11,15] 表示每级**消耗**多少刷新次数升级 |
| **刷新次数 = 货币** | World.rerollsAvailable | 玩家升级 +1；可用于刷新（消耗 1）或商店升级（消耗对应阈值） |
| **候选数动态** | World.candidatesCount = min(8, 2 + shopLevel) | shopLevel ↑ 候选 ↑（封顶 8） |
| **玩家升级触发 Loot** | World._gainXp → battle.setState(Reward) | 不清场地（resumeAfterLoot=true 表示恢复战斗）+ rerollsAvailable++ |
| **Loot 面板** | setupLootPanel | 候选/背包均 130×170，刷新+商店升级双按钮在标题后，4 列 grid |
| **关键词系统** | KEYWORDS + renderDescWithKeywords + setupKeywordTooltips | 卡描述自动加粗 + hover tooltip；反面卡显示"反面卡牌"提示 |
| **稀有度颜色** | art 背景按 rarity（不按流派） | common 灰 / rare 蓝 / epic 紫 / legendary 橙 |
| **卡 UI** | cardEl/applyCardState/renderHand | 所有手牌单容器 absolute、emoji 卡面、card-total 外部独立元素 |
| **卡入场/离场动画** | .card-slot.entering / .leaving | 动画放在 **slot 而非 card**，避免 transform 覆盖 .card 的 rotateY（face-down 翻面） |
| **reshuffle 异步** | toDiscard 内 setTimeout(_reshuffleIfEmpty, 350) | 修复"最后一张卡瞬移到新位置"：让 leaving 动画完成后再洗回 |
| **粒子特效** | FX.hit/wall/explode/damage/xpBurst | 命中 / 撞墙 / 自爆 / 伤害数字 / 经验球 |

---

## 五、待实现的核心机制（按优先级）

### 5.1 奥术飞弹自动触发 ⭐ 必做
**触发条件**：奥术飞弹（衍生卡）一旦面朝上（faceUp），立即自动发射 1 颗追踪弹（默认 1 伤害），触发后销毁该卡。

**实现要点**：
- 新类 `Card_ArcaneMissile` 继承 Card：fxType='arcane', hasRevealFx=true, art={emoji:'✨'}, rarity:'common'
- 重写 `use()` 返回 false（不可手动用）
- 重写 `onReveal()` → setTimeout 100ms 后 `fireArcaneMissile(world, this, buffs)` + `world.deck.destroyCard(this)`
- 新函数 `fireArcaneMissile(world, card, buffs)`：从玩家位置朝最近敌人发射 Bullet（带追踪 / 应用 buffs.doubleDamage / buffs.explode 等 Hook）
- 新 CardDeck 方法：`destroyCard(card)` 从 hand/discard 移除，触发 deckChanged
- 新 CardDeck 方法：`shuffleIntoHand(card)` 随机插入 hand，自动触发 `_updateFaceUp` → 若落在边缘则立即 onReveal

### 5.2 奥弹 buff 系统
**模型**：BattleManager 维护本回合 buff 字典 `arcaneBuffs = {doubleDamage, explode, knockback, refundMana, ...}`。  
回合切换时清空。

**实现要点**：
- BattleManager 加 `arcaneBuffs = {}`，turnChange 时重置
- Card 加 `onUse(world, player)` 钩子（基类空实现）；fireFromCards 内每张卡 `c.onUse?.(world, player)`
- 「加倍奥弹」`onUse(world){ world.battle.arcaneBuffs.doubleDamage = true; }`
- 「爆炸奥弹」`onUse(world){ world.battle.arcaneBuffs.explode = true; }`  
  ⚠️ AOE 伤害用「子弹自身伤害」(`ctx.bullet.attack`)，不写死数值，让与「加倍奥弹」乘算
- 「充能奥弹」/「击退奥弹」类似

### 5.3 连携 stacks 系统（v3.3 重定义）⭐
**模型**：World 加 `comboStacks = 0`。任意发射动作时若 `comboStacks > 0`：
1. 自动 `--comboStacks`
2. 本次发射 = 同时使用 **左 + 右 + 主卡**（fireFromCards 用 `[left, right]` + main）
3. 法力 = 三张卡 cost 之和

**实现要点**：
- World 加 `comboStacks = 0`
- HUD 加连携 stacks 显示（图标 + 数字）
- **stacks > 0 时左右边缘卡下方的「总费用」蓝框加动态橙色光圈** — 仅此视觉提示告诉玩家是连携、总费 = 三卡相加。**不要做"法力不足红色禁用"**
- doFire 内：if `comboStacks > 0` 改走 doFireAll 等价逻辑（消耗 1 层 + 同时取左右主 + 法力按总和扣）
- 卡牌：「战吼」`onUse(world){ world.comboStacks += 1; }`、其他类推
- 「完美协调」需要特殊处理：被连携时检测此卡 cost=0（在 fireFromCards 累加 cost 时跳过该卡）
- 连携触发时绿色三合一特效（FX.comboShot 之类）

**CSS 示例**：
```css
.card-total.combo-active {
  animation: combo-glow 1.2s ease-in-out infinite;
}
@keyframes combo-glow {
  0%,100% { box-shadow: 0 0 0 2px #ffa64a, 0 0 8px rgba(255, 166, 74, 0.45); }
  50%     { box-shadow: 0 0 0 2px #ffd84a, 0 0 18px rgba(255, 166, 74, 0.9); }
}
```

### 5.4 弹射触发链增强
**模型**：HitWall Hook ctx 加 `world`，让 Hook 可以访问场景做爆炸 / 召唤 / 洗入。

**实现要点**：
- Bullet.triggerHooks(Phase.HitWall, { normal: n, world })  ← 已传 world
- 「弹射爆炸」HitWall Hook：在 bullet 位置 spawn 爆炸 AOE 范围 = `ctx.bullet.attack * 0.5`（**用子弹自身伤害**），遍历 enemies 范围内伤害
- 「弹射爆裂」类似 ×2
- 「弹射追踪」HitWall Hook 内给 bullet 加追踪 movement
- 「弹射召唤」概率 spawn 一个 Summon（需 5.5 完成）

### 5.5 召唤系统 ⭐⭐ 最大改动
**模型**：
- 新类 `Unit`（基类，含 HP/shield/team/takeDamage）
- 新类 `Summon extends Unit`（kind: turret/soldier/sniper/shielder/drone/arcaneTurret/bouncyTurret）
- World.summons[] 数组
- Summon.update(dt, world) 仅在 world.battle.turn === 'enemy' 时移动/发射
- 召唤物发射子弹照常加入 world.bullets（不受回合限制）
- Enemy.update 改为找最近 `[player, ...summons]` 中的活单位
- 接触自爆 target 改为命中的单位
- 每个敌方回合开始：`for (s of summons) s.hp--; remove if hp<=0`
- 限时召唤（如召唤增援）用 BattleManager.summonOverTurns[] 数组排队

**绘制**：
- Turret：固定圆形+炮管
- Soldier：人形 sprite（用 emoji 暂代如 🥷）
- Sniper：高瘦三角
- Shielder：粗矩形
- Drone：小三角（飞行）

### 5.6 弃牌差异化效果
**模型**：Card 加 `onDiscard(world, player)` 钩子（基类空）；doDiscard 内调用。

**实现要点**：
- 「双面间谍」`use(){...召唤2工兵...} / onDiscard(){...召唤1弓箭手...}`
- 「战术撤退」`onDiscard(){ 弃此牌+随机2张反面 → 召唤重型炮台 }` 需要 CardDeck 加 `discardRandomFaceDown(n)` 方法
- 「弃牌号令」`onDiscard(world){ world.comboStacks += 2; }`

---

## 六、关键 API 速查

### Card 基类
```js
class Card {
  constructor(def) {
    this.id = def.id;
    this.name = def.name;
    this.desc = def.desc;     // 关键词会被自动加粗（KEYWORDS 字典）
    this.cost = def.cost ?? 1;
    this.discardCost = def.discardCost ?? 0;
    this.rarity = def.rarity || 'common';   // common / rare / epic / legendary
    this.def = def;     // 含 fxType / art / hasRevealFx
    this.faceUp = false;
  }
  initializeEffects() { return []; }   // 返回 Effect[] 注册到子弹模板（PreActive 等）
  use(player, bulletTemplate) { ... }  // 默认: 扣费 + 装 Hook；可重写
  // 待加：onUse(world, player) / onDiscard(world, player) / onReveal() / onConceal()
}
```

### Effect / Hook
```js
new Effect(Phase.PreActive, 0, ctx => {
  ctx.bullet.bulletCount += 2;
})
// Phase: PreActive / Spawned / HitWall / HitEnemy / Destroyed / PostActive
// ctx 含：bullet, world（部分阶段）, enemy（HitEnemy）, normal（HitWall）, handled
```

### Events 系统
```js
Events.on('enemyDied', enemy => { ... })       // 玩家击杀（自爆不触发）
Events.on('deckChanged', () => { ... })        // 手牌/弃牌堆变化
Events.on('bagChanged', () => { ... })         // 背包数据变化
Events.on('stateChanged', s => { ... })        // 状态机变化
Events.on('turnChanged', t => { ... })         // 'player' / 'enemy'
Events.on('comboChanged', n => { ... })        // 连击数
Events.on('levelUp', n => { ... })             // 升级
Events.emit('xxxxx', ...)                       // 触发
```

### FX 粒子
```js
FX.hit(world, x, y)         // 黄色 ring + spark
FX.wall(world, x, y)        // 灰色小烟雾
FX.explode(world, x, y)     // 红色大爆炸 + 14 spark
FX.damage(world, x, y, n)   // 飘动伤害数字（n>0 才显示）
FX.xpBurst(world, x, y, 3)  // 经验球飞向经验条
// ⚠️ FX.cardUse / FX.cardUseGreen / FX.muzzle 已**不再使用**（用户要求移除炮台位置特效）
```

### CardDeck 已有 API
```js
deck.setBag(cards)              // 设置 8 张持有卡
deck.resetForBattle()           // 战斗开始：所有非主卡进 hand、主卡 onReveal
deck.clearBattleState()         // 战斗结束：清场 + 关展露
deck.swap(i, j)                 // 拖拽交换
deck.replaceAt(i, newCard)      // Loot 替换
deck.setAsMain(i)               // 右键设主卡
deck.takeSide('left'|'right')   // 取最左/右
deck.toDiscard(card)            // 卡入弃牌堆 + 边缘重算 + 空则**异步** reshuffle（350ms 后）
// 待加：deck.destroyCard(card) / deck.shuffleIntoHand(card) / deck.discardRandomFaceDown(n)
```

### World 商店等级 API
```js
world.shopLevel              // 1~8
world.candidatesCount        // = min(8, 2 + shopLevel)
world.rerollsAvailable       // 货币：可刷新 / 可升级商店
world.SHOP_THRESHOLDS        // [1, 2, 4, 6, 8, 11, 15]：每级消耗多少刷新次数
world._shopLevelUp()         // 玩家点商店升级按钮触发：扣货币 + shopLevel++ + candidatesCount++
drawRandomCard(world.shopLevel)  // 按商店等级抽卡（不是玩家等级）
```

---

## 七、添加新卡的标准流程

### 步骤 1：在 game.js 「5. Cards」区域加 class

模板（按 CARDS.md 中的卡设计填写）：

```js
class Card_增弹 extends Card {
  constructor() {
    super({
      id: 'addtwo',                              // 唯一短 ID
      name: '增弹',                              // CARDS.md 中的中文名
      desc: '使用：子弹数量 +2',                  // 描述（关键词会自动加粗）
      cost: 1,                                   // 法力费用
      fxType: 'bullet+',                         // 视觉类型（保留备用）
      rarity: 'common',                          // common/rare/epic/legendary
      art: { emoji: '💥' }                       // 卡面图 emoji（背景按 rarity，不再按流派）
    });
  }
  initializeEffects() {
    // 注册到 bullet 模板的 Hook
    return [
      new Effect(Phase.PreActive, 0, ctx => {
        ctx.bullet.bulletCount += 2;
      })
    ];
  }
  // 可选钩子：
  // onUse(world, player) { ... }     // 设置全局 buff（如奥弹 buff、连携 stacks）
  // onDiscard(world, player) { ... } // 弃置触发
  // onReveal() { ... }               // 卡面朝上时（边缘卡 / 主卡）
  // onConceal() { ... }              // 卡面朝下时
}
```

### 步骤 2：在 ALL_CARD_CTORS 数组添加

```js
const ALL_CARD_CTORS = [
  Card_增弹,
  Card_新卡,   // ← 加到这里
  ...
];
```

CARD_BY_RARITY 索引会**自动重建**（IIFE），新卡按 rarity 进对应池。

### 步骤 3：（可选）更新初始 bag

main() 内 `const cards = [...]` 决定初始 8 张。需要让玩家开局就能用某张卡 → 加到这里。

### 步骤 4：测试

**手动**：刷新页面 → 按 Enter 开战 → 用鼠标射击试效果。

**用 preview 工具自动验证**（如果在 Claude Code 环境）：
```js
// 取 world
const w = window.__game;

// 强制把新卡塞到手牌测试
w.deck.hand[0] = new Card_新卡();
w.deck._updateFaceUp();
// emit 在 IIFE 内不可直接调，改用 deck 内部方法触发
w.deck.toDiscard(w.deck.takeSide('left'));   // 走完整流程

// 触发发射看效果
document.getElementById('stage').dispatchEvent(
  new MouseEvent('mousedown', { button: 0, bubbles: true })
);

// 检查结果
console.log({
  bullets: w.bullets.length,
  particles: w.particles.length,
  mana: w.player.mana,
});
```

### 步骤 5：在 Loot 面板测试稀有度抽卡概率

```js
// 升商店等级看抽卡分布
const w = window.__game;
w.shopLevel = 5;   // 直接改商店等级
w.candidatesCount = Math.min(8, 2 + w.shopLevel);
const counts = { common:0, rare:0, epic:0, legendary:0 };
for (let i = 0; i < 100; i++) {
  // 触发 Loot 看候选稀有度
  w.battle.setState('Battle');
  w.battle.endBattle(true);
  for (const el of document.querySelectorAll('#loot-candidates .modal-card')) {
    const cls = [...el.classList].find(c => c.startsWith('rarity-'));
    if (cls) counts[cls.slice(7)]++;
  }
}
console.log(counts);
```

---

## 八、关键约束（写卡前必读）

### 命名 / 描述
- **卡名**用 CARDS.md 中的中文（如「奥术飞弹」「双面间谍」）
- **描述**用关键词时**精确匹配** KEYWORDS 字典中的词（`展露 / 连击 / 连携 / 洗入 / 弃置 / 奥术飞弹 / 奥弹 / 弹射 / 穿透 / 召唤 / 护盾 / 追踪 / 水晶 / 法力`）以触发自动加粗 + tooltip
- 「弹+2 穿+2」**不会**加粗，「弹射+2 穿透+2」会

### 稀有度分布目标（v3.3）
- ⬜ common: 22 / 🟦 rare: 16 / 🟪 epic: 8 / 🟧 legendary: 4
- 每流派至少 1 张 legendary

### 卡面 art 背景按稀有度（不按流派）
- 流派对玩家不可见（内部分类）
- art.school 字段已废弃，只用 rarity 控制 art 背景色

### Hook 无状态原则
- Hook 实例可被多颗克隆共享 → **per-bullet 状态写到 `Bullet` 字段**（如 bound/penetrate）
- 不要在 Hook 实例上存随时间变化的数据

### AOE 伤害设计原则
- 所有 AOE（爆炸奥弹 / 弹射爆炸 / 弹射爆裂等）伤害**以子弹自身伤害为基数**，不写死数值
- 让与「加倍奥弹」「奥光」等增伤 buff 产生乘算效果

### 奥弹机制约束
- 奥弹**没有"立刻发射"概念**，只能通过翻面触发
- 要实现"瞬时触发 N 颗奥弹" → 用「洗入 N 张 + 立刻翻面」组合（如 #04 奥弹之雨、#05 奥弹齐发）

### 连携关键词
- 连携 = 玩家身上的 buff stacks，可累积；触发时同时用左+右+主卡，费用 = 三张和
- 卡描述写「获得 N 层连携」「展露：每洗入 +1 层」「被连携使用时此卡消耗值视为 0」等
- **不要写"如果被连携才触发 XX 效果"** — 那是旧设计，已删

### 不要做的事
- 不要在 fireFromCards / fireOneWave 内 spawn 玩家位置的特效（用户明确移除过 FX.cardUseGreen / FX.cardUse / FX.muzzle）
- 不要写死 AOE 伤害值 → 用「子弹自身伤害 × N」让其与增伤卡乘算
- 不要把卡入场动画放在 .card 上（会覆盖 rotateY 翻面）→ 放在 .card-slot 上
- 不要在 toDiscard 内同步触发 reshuffle（已改为 350ms 异步，让 leaving 动画完成）

---

## 九、CARDS.md 中 50 张卡分布

| 流派 | # 范围 | 张数 |
|---|---|---|
| A 奥弹 🔮 | 01-16 | 16 |
| B 弹射 ⚪ | 17-28 | 12 |
| C 召唤 🛡️ | 29-42 | 14 |
| D 跨流派连携 🔗 | 43-50 | 8 |

**当前游戏只实现了 #01 凝视、#19 墨镜，以及非 CARDS.md 列表的「增弹 / 鱼目混珠」demo 卡。**

**建议实现顺序**（从最易到最难）：
1. 弹射纯数值（17 粘液球 / 18 跳跳球 / 20 超弹 / 22 折射）— Hook 模式与「增弹」一致
2. 奥弹基础（02 烟花 / 03 军备库 / 04 奥弹之雨 / 05 奥弹齐发）— 配套实现 5.1 奥弹自动触发系统
3. 奥弹 buff 链（06 加倍 / 07 爆炸 / 08 击退 / 09 充能 / 10 过载）— 配套 5.2 奥弹 buff 系统
4. 弹射触发（23 弹射爆炸 / 24 弹射爆裂 / 25 弹射追踪）— 配套 5.4
5. 连携 stacks（43 战吼 / 44 双吼 / 45 战意激昂）— 配套 5.3
6. 召唤基础（29 召唤炮台 / 30 召唤士兵 / 33 召唤护盾兵）— 配套 5.5 召唤系统
7. 召唤进阶 + 弃牌（38 军团统帅 / 41 双面间谍 / 42 战术撤退）— 配套 5.6
8. 高阶卡（13 奥能聚焦 / 14 奥术涌动 / 16 奥弹之书 / 32 召唤奥弹炮台 / 48 连携之书 / ...）

---

## 十、preview 服务器测试用法（Claude Code 环境）

```
.claude/launch.json 已配置 "web-clone" 服务器：python http.server 8765
```

启动后用 preview_eval 跑代码，preview_screenshot 截图。预览窗口可能 hidden 导致 rAF throttle（影响动画 / 计时器测试），关键测试用手动 update 调用：

```js
// 手动推进时间（绕过 rAF throttle）
for (let i = 0; i < 30; i++) w.battle.update(0.02);  // 600ms
```

---

## 十一、立即开工的第一个任务建议

实现 #17 粘液球（弹射+4），10 分钟搞定，验证流程通畅：

```js
class Card_粘液球 extends Card {
  constructor() {
    super({
      id: 'slime', name: '粘液球', desc: '弹射+4',
      cost: 1, rarity: 'common',
      fxType: 'bounce', art: { emoji: '🟢' },
    });
  }
  initializeEffects() {
    return [new Effect(Phase.PreActive, 0, ctx => {
      ctx.bullet.bound += 4;
    })];
  }
}
// 加到 ALL_CARD_CTORS
```

完成 → 升商店等级 → 在 Loot 面板能抽到 → 加入背包 → 战斗中用它射出弹 4 次的子弹。

---

**祝实现顺利！按 CARDS.md 写完 46 张后这游戏就完整了。**
