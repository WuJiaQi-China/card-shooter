---
name: hand-system
description: 卡牌射击 web 项目里"手牌 / 卡组 / 弃牌 / 洗入"相关的工作流。包括：CardDeck 的 hand/bag/discard 三态、face-up / face-down 翻面、最左 / 最右 / 洗入位置、临时卡 (_destroyAfterUse) / 自动弃置 (_autoDiscardAtTurnEnd)、主卡（bag[0]）特殊规则。当用户说 "让 XX 洗入最左侧"、"卡为什么是反面"、"主卡机制"、"自动弃置"、"临时卡视觉"、"奥弹洗入数量" 等场景时使用此 skill。前置阅读：`card-shooter-overview` skill。
---

# 手牌 / 卡组 / 弃牌 工作流

> **前置**：先读 `card-shooter-overview`。

核心类：`CardDeck`（game.js 行 ~6300+）。三个数组 + 一组方法管完整生命周期。

```
bag          长度固定 9（主卡 + 8）— 玩家永久持有
hand         战斗中的"手牌"，从 bag 洗出
discard      已用 / 已弃 → 满后洗回 hand
```

---

## 1. 关键数据结构

```js
class CardDeck {
  bag: Card[9]          // [0] 主卡（特殊 — 常驻正面 + 双扣费）
  hand: Card[]          // 战斗中手牌
  discard: Card[]       // 弃牌堆
}
```

**Card 实例上的"瞬时标志"**（写在 Card 上的状态字段）：
- `card.faceUp` — 当前是否正面（边缘卡 / 主卡 / 被 _foresightFaceUp 强翻）
- `card._destroyAfterUse` — 临时卡：用过 / 弃置后**破碎**不入弃牌堆（蓝色边框视觉）
- `card._autoDiscardAtTurnEnd` — 回合结束自动弃置（掘墓发现的骷髅）
- `card._battleCostOverride` — 本场战斗 cost 覆盖（钻级终结技、挖掘洗入后的 0 费）
- `card._costMod` — 临时 cost 修改（持久跨回合）
- `card._foresightFaceUp` — 强制保持正面，即使不在边缘
- `card._lastAction` — 离开手牌时的动作（'use' / 'discard' / 'shatter' / 'buff'），驱动离场动画
- `card._becomeArcaneFirework / _becomeCrypt` — 替换标记（持续施法 / 转生用）

---

## 2. 主要 API

### 2.1 入手 / 出手

```js
deck.takeSide('left' | 'right')      // 取最左 / 最右（玩家点弹键调用）
deck.toDiscard(card)                 // 入弃牌堆 + 边缘重算 + 空 hand 异步 reshuffle (350ms)
deck.destroyCard(card)               // 临时卡：永久移除，不进弃牌堆
deck.shuffleIntoHand(card)           // 随机插入 hand（同时 emit shuffledIn）
deck.hand.unshift(card)              // 直接放到最左（定向勘探用）
```

`toDiscard` 的 350ms 异步 reshuffle 是为了让 leaving 动画走完 — **不要改成同步**，会出"最后一张卡瞬移"bug（HANDOFF.md 提过）。

### 2.2 弃置随机卡（叫魂 / 战术撤退）

```js
deck.discardRandomFromHand(n)        // 任意面随机弃 n 张
                                     // v6 起：会调用每张被弃卡的 onDiscard（叫魂联动挖掘 / 定向勘探）
deck.discardRandomFaceDown(n)        // 只弃反面（战术撤退用）
                                     // 当前不调 onDiscard，需要扩展时记得补
```

### 2.3 翻面 / face-up 管理

```js
deck._setFace(card, true | false)    // 改 faceUp 字段 + 触发 onReveal / onConceal
deck._updateFaceUp()                 // 重新计算"哪些是边缘卡 → 应该 face-up"
```

face-up 规则：
- bag[0]（主卡）始终 face-up
- hand 中的最左 + 最右是边缘卡，自动 face-up
- 中间的卡 face-down
- 有 `_foresightFaceUp` 标记的强制 face-up（即使不在边缘）
- 翻面会触发 `onReveal / onConceal` 钩子（hands-off — 玩家不主动操作）

### 2.4 战斗周期

```js
deck.resetForBattle()                // 战斗开始：bag → hand（主卡保留在 bag[0]），洗牌
deck.clearBattleState()              // 战斗结束：清场，所有 face-down，清掉 _battleCostOverride 等临时字段
```

`resetForBattle` 重置：
- 所有非主卡进 hand
- shuffle hand
- 边缘卡翻面 → 触发 onReveal
- 主卡 onReveal

### 2.5 背包编辑

```js
deck.swap(i, j)                      // 拖拽交换 bag 内两张卡
deck.replaceAt(i, newCard)           // Loot 替换某槽位
deck.setAsMain(i)                    // 右键设为主卡（与 bag[0] 互换）
```

---

## 3. 主卡（bag[0]）特殊规则

主卡每次普通使用：
- **同时**触发主卡 + 玩家选的 left/right 卡
- **双扣费**：mana = main.cost + side.cost
- **双 Hook**：主卡的 effects 也注册到子弹模板（fireFromCards 内）
- **不消耗主卡**：用完后主卡留在 bag[0]，不进弃牌堆

设计意图：主卡 = 玩家"装备"，每次射击都附加属性。

主卡可以是任何卡，但实战常用低费高 utility 的（强化 / 注铅 / 引燃 等）。

---

## 4. 临时卡机制（_destroyAfterUse）

挖掘 / 定向勘探发现的卡 → 蓝色边框 + 75% 不透明度 + 用 / 弃后永久销毁。

实现：
```js
chosen._destroyAfterUse = true;
chosen._battleCostOverride = 0;       // 或 minus1 等
world.deck.shuffleIntoHand(chosen);
chosen._foresightFaceUp = true;        // 强制正面
world.deck._setFace(chosen, true);
Events.emit('deckChanged');
```

之后的逻辑（已在 `doDiscard` / `fireFromCards` / `endPlayerTurn` 里）自动处理：
- 用 → 看 `_destroyAfterUse` → 调 `destroyCard` 而不是 `toDiscard`
- 弃 → 同上
- 回合结束 auto-discard 也走 destroyCard 路径

CSS 视觉：`.card.temporary / .modal-card.temporary`（style.css 行 ~2023）。

---

## 5. 自动弃置（_autoDiscardAtTurnEnd）

掘墓（钻）的设计：发现一张骷髅牌洗入手牌 → 玩家回合结束自动弃置（触发 onDiscard）。

实现入口在 `BattleManager.endPlayerTurn`（行 ~6855 起的循环）：
```js
const autoDiscards = this.world.deck.hand.filter(c => c._autoDiscardAtTurnEnd);
for (const c of autoDiscards) {
  // 从手牌取出 → 调 onDiscard → 走 destroyCard / toDiscard
}
```

加新的"回合结束自动 X"机制 → 仿造这个循环加新分支，或重用 `_autoDiscardAtTurnEnd` 标记。

---

## 6. 洗入位置控制

3 种洗入方式，按场景选：

| 场景 | API | 落点 |
|---|---|---|
| 普通洗入（奥弹之雨 / 挖掘发现） | `deck.shuffleIntoHand(card)` | 随机位置 |
| 强制洗入最左（定向勘探银 / 金 / 钻） | `deck.hand.unshift(card)` | 最左缘（自动 face-up）|
| 洗入手牌**末端**（罕见） | `deck.hand.push(card)` | 最右缘 |

注意 shuffleIntoHand 之后要 emit `deckChanged` + `shuffledIn`（后者用于奥弹之书 / 洗入号令）。直接操作 hand 数组也要手动 emit。

---

## 7. 边缘卡 + 翻面交互

`_updateFaceUp()` 在每次 hand 变化后调用，规则：
- hand[0] 翻正面（最左边缘）
- hand[hand.length-1] 翻正面（最右边缘）
- 中间翻反面，但**保留 `_foresightFaceUp` 强翻**
- 翻面切换触发 `onReveal / onConceal`

`onReveal` 注册的事件监听器 → `onConceal` 必须解绑，否则手牌洗动时会累积监听器，造成 buff 无限叠加 bug。**这是写新展露卡最容易踩的坑**。

---

## 8. 反 cost 系统

`effectiveCardCost(card, world, isMain)` 是显示用的"有效消耗"：
```
base = card._battleCostOverride ?? card.cost
final = max(0, base - (card._costMod || 0) + (isMain ? world.cannon.mainCostMod : 0))
```

- `_battleCostOverride` 一场战斗内强制覆盖（挖掘 0 费 / 钻级终结技下次免费）
- `_costMod` 临时折扣（持久跨回合）
- `world.cannon.mainCostMod` 主卡专属折扣（永久升级 / 商店事件可改）

UI 渲染都走 `effectiveCardCost`，所以这里的所有 mod 都自动正确显示。

---

## 9. 事件总线

CardDeck 相关 Events：
- `deckChanged` — bag / hand / discard 任一变化（UI 渲染要 listen）
- `shuffledIn` — 卡被洗入手牌（奥弹之书等触发器用）
- `cardUsedSide` — 一次普通使用完成（side='left'/'right'/'main'/'any'）

加新 deck 操作时，确保 emit 这些事件，UI 才能跟得上。

---

## 10. 加新手牌行为的标准流程

例："让 XX 卡使用时给手牌中所有银级卡 -1 费"

```js
onUse(card, world) {
  for (const c of world.deck.hand) {
    if (c.tier === 'silver') c._costMod = (c._costMod || 0) + 1;
  }
  Events.emit('deckChanged');     // 触发 UI 重新渲染显示新 cost
}
```

例："让 XX 卡弃置时洗入一张奥弹（face-up）"

```js
onDiscard(_, world) {
  const m = window.__mkCard('arcane_missile', 'silver');
  m._foresightFaceUp = true;
  world.deck.shuffleIntoHand(m);
  world.deck._setFace(m, true);
  Events.emit('deckChanged');
}
```

例："让 XX 卡使用时下一回合开始洗入 2 张奥弹"（持续施法的模式）
- 设 `world._contCastActive = true; world._contCastRolls = N;`
- 战斗 main loop 在 `_startNewPlayerTurn` 检查这些 flag 调 `_continuousCastShuffleIn(world)`

---

## 11. 验证 checklist

1. **手牌数量正确**：不该出现 hand 长度爆炸或归零的 bug
2. **face-up 状态正确**：边缘 + 主卡 + _foresightFaceUp 才是正面，其余反面
3. **onReveal / onConceal 配对**：翻面来回切看 console 有没有泄漏 / 重复
4. **临时卡用完真销毁**：检查 `world.deck.bag / hand / discard` 都不含它
5. **auto-discard 在回合结束触发**：endPlayerTurn 后 hand 不应剩 `_autoDiscardAtTurnEnd` 标记
6. **跨战斗清状态**：endBattle 后 `_battleCostOverride / _costMod` 应被清掉

---

## 12. 常见坑

1. **直接 push hand 没 emit deckChanged** → UI 不刷新
2. **shuffleIntoHand 后没 `_setFace` + 没强 face-up** → 临时卡可能是反面，玩家看不见
3. **onReveal 监听器没在 onConceal 解绑** → buff 累积
4. **同步 toDiscard 后立刻 reshuffle** → 破坏离场动画（要走 350ms 异步路径）
5. **改 effectiveCardCost 公式没同步 fireFromCards 的扣费逻辑** → UI 显示和实际扣费不一致
6. **主卡不该进 discard** — 主卡使用后留在 bag[0]；如果你的新机制错误把它移走会破坏游戏
7. **加新 deck API 没 expose 到 CardDeck class** → 卡的 onUse 调不到
