---
name: shop-system
description: 卡牌射击 web 项目里"商店 / 战利品 / 升级 / 永久升级"相关的工作流。包括：商店候选 roll（家族黑名单 / tier 加权 / 已拥有去重）、商店等级 / 候选数 / 刷新费用 / 升级阈值、永久升级（满级商店后的 4 项 buff）、玩家剔除 family。当用户说 "金 / 钻概率太低"、"商店等级升级太贵"、"刷新次数不够"、"永久升级再加一项"、"让某卡不出现在商店"、"商店候选数" 等场景时使用此 skill。前置阅读：`card-shooter-overview` skill。
---

# 商店 / 战利品 / 升级 工作流

> **前置**：先读 `card-shooter-overview`。

商店系统由 3 个数据结构 + 2 个函数撑起：

```
RARITY_PROB        →  16 个商店等级 × 4 个 tier 的概率表
_rollTier(shopLv)  →  按概率抽 tier
_rollShopCard(world, alreadyKeys, ..., forceTier?)  →  实际抽出一张 Card
world.SHOP_THRESHOLDS  →  商店从 Lv1 升 Lv16 每级消耗的金币
world.permUpgrades  →  满级后的 4 项永久升级（damage / pierce / bound / speed）
```

---

## 1. RARITY_PROB 概率表

game.js 行 ~6282：
```js
const RARITY_PROB = {
  1:  { bronze: 1.00, silver: 0.00, gold: 0.00, diamond: 0.00 },
  2:  { bronze: 0.95, silver: 0.05, gold: 0.00, diamond: 0.00 },
  ...
  16: { bronze: 0.30, silver: 0.45, gold: 0.20, diamond: 0.05 },
};
```

每级 4 个数加和必须 = 1.00。**改概率时校验加和**，否则 `_rollTier` 会有概率走 fallback 返回 bronze。

设计意图：
- Lv1 全铜（新手期）
- Lv8 进入 silver 主导
- Lv11+ 开始出 gold
- Lv16 满级也只有 5% 钻（极稀有）

如果用户说 "钻级太难刷" → 改 Lv11-16 的 diamond 比例（不要超 10%，钻应保持稀有 + 高价值）。

---

## 2. _rollShopCard 规则

行 ~6336。核心规则：

```
1. 按 RARITY_PROB[shopLv] 抽一个 tier
2. 候选池 = 所有非 excludedFromShop 的家族
3. 过滤：
   - 家族在 world.removedFamilyIds（玩家剔除）→ 黑名单
   - 该 family 钻级已拥有 → 整个 family 黑名单（无更高 tier 可升）
   - 该 family 已拥有任何 tier 但不是当前抽到的 tier → 跳过
     （升级路径：买重复同级 + 合并；商店不直接给比手上高的等级）
   - 同一次刷新内已出现 → 跳过
4. 随机选一个；超时 (40 次尝试) 返回 null
```

forceTier 参数用于"新手开局 picks"（强制铜 / 银），见 `_startNextStartupItem`。

修改抽卡规则时常见任务：
- "已拥有不再出现" → 在过滤里加 `if (owned.size > 0) return false`（不仅仅当前 tier）
- "保底每次必有一张银 / 金" → 在 rollShopCandidates 里加一个 forceTier 槽
- "新机制：每 N 次刷新必出钻" → world 上加计数 + _rollShopCard 加分支

---

## 3. excludedFromShop

家族级别的开关。设为 true → 不出现在商店候选池：
```js
boost1:        { excludedFromShop: true, ... }   // 起手卡
arcane_missile: { excludedFromShop: true, ... }  // 衍生：通过奥术进化洗入
foresight:     { excludedFromShop: true, ... }   // 衍生
arcane_firework: { excludedFromShop: true, ... } // 衍生（持续施法替换品）
```

什么时候用：
- 衍生卡（通过其它卡的 onUse 洗入手牌，玩家不该直接买）
- 起手卡（开局送，商店不需要再出）
- 测试卡（debug 用，发布前应删）

---

## 4. world.removedFamilyIds（玩家剔除）

`world.removedFamilyIds: Set<string>` — 玩家在战利品面板点"剔除"按钮 → 整个 family 加入本局黑名单（阵亡重开 `resetForNewGame` 清空）。

剔除功能 UI：搜 `setupLootPanel` 里的 "removed" / "剔除" 字符串。

加新的剔除入口（如永久剔除 cross-run）：
- 持久化 → localStorage
- World 上加 `permanentRemovedFamilyIds`
- `_rollShopCard` 过滤里同时检查两个集合

---

## 5. 商店等级 + 升级

```js
world.shopLevel ∈ [1, 16]
world.candidatesCount = min(8, 2 + shopLevel)   // 候选数动态
world.SHOP_THRESHOLDS = [10, 12, 15, ..., 161]  // 每级升下一级花多少金币
world.gold                                       // 玩家金币
```

`SHOP_THRESHOLDS[i]` = Lv(i+1) 升到 Lv(i+2) 的金币费用。Lv1→2 = 10 金，Lv15→16 = 161 金。累计 ~800 金。

调整升级曲线：
- 早期太贵 → 降前几个值
- 满级太快 → 抬后几个值（指数化）
- 想要 Lv16 之后还有内容 → 看 "永久升级" 段

---

## 6. 刷新次数 / 刷新费

`world.refreshCount` — 本场已刷新次数。
刷新费 = `_refreshCost(refreshCount)`（搜函数），通常是某种递增公式（如 `1 + floor(count/3)`）。

调整：直接改公式，或加 "前 N 次免费" 之类的规则。

---

## 7. 永久升级（满级商店后的 4 项 buff）

`world.permUpgrades = { damage: 0, pierce: 0, bound: 0, speed: 0 }` — 每项可无限叠加。
价格 = `base * e^(已买次数 / 5)`，每次涨 ~22%。

应用：在 Bullet 模板初始化时（`PreActive` 之前）由 PlayerCannon 给所有友方子弹加上这些 buff（搜 `world.permUpgrades` 或 `applyPermBuffs`）。

加新永久升级项：
1. `permUpgrades` 字典加新 key
2. UI 永久升级面板加新按钮（搜 `setupLootPanel` 里的永久升级渲染）
3. 在 buff 应用点（Bullet 初始化）加新效果实现
4. i18n 加双语 label

---

## 8. 商店候选数（candidatesCount）

`world.candidatesCount = min(8, 2 + shopLevel)`：
- Lv1 → 3 候选
- Lv6 → 8 候选（封顶）
- Lv6+ 候选数不再增加（商店等级继续升只改 RARITY_PROB）

要解锁更大候选数：改 `min(8, ...)` 上限。
要做"候选数 = 升级单独花钱"：拆掉公式，给 candidatesCount 加独立升级入口。

---

## 9. UI 入口

`setupLootPanel(world)` — 战利品 + 商店 + 升级的统一面板（行 ~9700）。
关键 DOM：
- `#loot-candidates` — 候选卡区
- `#reroll-btn` — 刷新按钮
- `#shop-level-btn` — 商店升级按钮
- `#shop-prob-bar` — 概率分布条
- 永久升级按钮区

修改面板：
- 加按钮 → index.html 加 DOM + style.css 样式 + setupLootPanel 内绑事件
- 加新统计 → 在 `world` 上加字段 + 渲染 + 持久化

---

## 10. 商店 reroll / startup picks

`rollShopCandidates(world, count)` 一次 roll N 张候选。
新手开局：`_startNextStartupItem` 队列里强制 picks（3 张铜 → 1 张银 → 背包整理 → 开战）。

要改开局 picks：改 `_makeStartupQueue()`（行 ~6107）：
```js
function _makeStartupQueue() {
  return [
    { kind: 'pick', tier: 'bronze' },
    { kind: 'pick', tier: 'bronze' },
    { kind: 'pick', tier: 'bronze' },
    { kind: 'pick', tier: 'silver' },
    { kind: 'inv' },
  ];
}
```

加新 kind 类型：在 `_startNextStartupItem` 处理；可能要拓展 BattleManager 的 state 来支持新流程。

---

## 11. 验证 checklist

1. **概率加和 = 1.00**：preview_eval 跑 Object.values(RARITY_PROB).map(p => sum(values))，全部 1.00
2. **抽多次看分布合理**：
   ```js
   const counts = { bronze:0, silver:0, gold:0, diamond:0 };
   const w = window.__game;
   w.shopLevel = 10;
   for (let i = 0; i < 500; i++) {
     const c = window.__rollShopCard(w, new Set());
     if (c) counts[c.tier]++;
   }
   counts;
   // 比对预期 RARITY_PROB[10]
   ```
3. **excludedFromShop 真的被排除**：上面循环跑 1000 次确认衍生卡不出现
4. **已拥有 family 不重复出更高 tier**：手动给 bag 加一张银级 → 再 roll 看不会出该 family 的金 / 钻
5. **剔除生效**：调 `w.removedFamilyIds.add('xxx')` → roll 不再出现
6. **i18n 不破**：切换语言看商店面板按钮文字

---

## 12. 常见任务范本

### A. "钻级太罕见，提一点"
```js
// 改 RARITY_PROB[11..16] 的 diamond
// 比如 Lv16 从 0.05 提到 0.10（gold 同时降到 0.15）
```
注意每级加和保持 1.00。

### B. "商店升级太便宜"
```js
// 改 SHOP_THRESHOLDS 后段：让 Lv10→11 之后陡升
world.SHOP_THRESHOLDS = [10, 12, 15, 18, 22, 27, 33, 40, 50, 65, 85, 110, 140, 180, 230];
```

### C. "想加一个永久升级项：每回合 +1 法力"
1. `permUpgrades` 加 `mana: 0`
2. UI 加按钮 + label "每回合 +1 法力（已购 N 次）"
3. 价格公式跟其它项一致
4. 在 `_startNewPlayerTurn` / `_afterPlayerTurnComplete` 给 `player.mana += permUpgrades.mana`
5. i18n 加双语

### D. "让某张卡不出现在商店"
- 在 CARD_DATA.xxx 加 `excludedFromShop: true`
- 或动态：在游戏某处把 `world.removedFamilyIds.add('xxx')`

---

## 13. 常见坑

1. **改 RARITY_PROB 没保证加和 = 1** → fallback 走 bronze，破坏概率
2. **加新衍生卡忘了 excludedFromShop** → 跑去商店候选池
3. **candidatesCount 改超过 UI 容器宽度** → 卡牌挤出去 / 重叠
4. **SHOP_THRESHOLDS 长度不对** → Lv16 升级按钮显示异常（数组下标越界）
5. **永久升级买完没刷新 UI** → emit `inventoryDiscountChanged` 之类事件让按钮 disabled 状态更新
6. **测试时直接改 `w.shopLevel`** → candidatesCount 没跟着改；手动 `w.candidatesCount = min(8, 2 + w.shopLevel)`
7. **removedFamilyIds 跨战斗保留** → 改成 `resetForNewGame` 时清空（已实现，但加新机制要同步）
