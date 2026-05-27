---
name: balance-values
description: 卡牌射击 web 项目里"纯数值平衡调整"的工作流。专门处理只动数字不动逻辑的任务：cost（费用）、value（价值）、攻击 / 弹射 / 穿透加成系数、燃烧次数、AOE 半径、敌人 HP、商店概率等。当用户说 "XX 卡的伤害太高 / 太低"、"XX 费用从 1 调到 2"、"把所有银级 value 提一档"、"重复次数 4 改成 5" 等纯数值调整时使用此 skill。若涉及逻辑重写则改用 `modify-mechanic`；若是从 excel 同步新版则改用 `add-card`。前置阅读：`card-shooter-overview` skill。
---

# 纯数值平衡调整 工作流

> **前置**：先读 `card-shooter-overview`。

跟 `add-card` / `modify-mechanic` 的区别：这个 skill 只动数字，不动行为逻辑。任务边界小、风险低，但**容易破坏稀有度梯度 / 阶梯感**，要按下面的规范走。

---

## 1. 标准数值梯度（必须遵守）

项目内的稀有度数值阶梯（从 CARD_DATA 中归纳，**新数值应贴合这个梯度**）：

| tier | cost 范围 | value 阶梯（常见） |
|---|---|---|
| 铜 bronze | 1-2 | 6 / 8 / 10 / 13 |
| 银 silver | 1-3 | 18 / 23 / 30 |
| 金 gold   | 1-3 | 23 / 30 / 39 |
| 钻 diamond| 1-3 | 30 / 39 / 50 |

特殊 value 段：
- 6 / 8 / 10 / 13 — 铜级低费小 buff
- 13 / 18 / 23 — 早中期主力
- 30 / 39 / 50 — 中后期 / 主卡级强度

阶梯递增（铜→钻）大致 1.5-1.6 倍：
- 6 → 13 (×2.17)
- 8 → 18 (×2.25)
- 10 → 23 (×2.3)
- 13 → 30 (×2.31)

新数值最好落到这些"标准档位"上，不要随便给 17 / 22 / 27 之类非标值。

---

## 2. 平衡判断（什么时候要调）

先问自己：
- 用户主观感受 vs 实战数据 — 用户说"太强"可能是体验问题，不一定数值问题
- 是单卡过强 / 过弱，还是整条 build 不均衡
- 是早期 / 中期 / 后期某段失衡，还是全程

调单卡：直接改它的参数。
调一条 build（如所有骷髅卡都太强）：检查 build 内每张的数值，可能要联合 enemy HP 一起调。
调阶段难度：可能根因在 enemy / 商店曲线，不在卡数值（跳 `enemy-system` / `shop-system`）。

---

## 3. cost 调整规则

| 现 cost | 调到 | 数值后果 |
|---|---|---|
| 1 → 2 | 等于把卡变贵一倍 | value 也要相应提一档（铜 6→13、银 8→18）|
| 2 → 1 | 等于把卡变便宜一半 | value 相应降一档 |
| 2 → 3 | 重大涨费 | 通常只对中后期 / 主卡向卡做 |

参考 v6 的 "引燃 / 骷髅号角" 调整：
- cost 1 → 2，value 同步从 6/8/10/13 提到 13/18/23/30
- 这种"调费 + 调价值"的组合是常态，不要只动一个

---

## 4. value 调整规则

value 是"卡牌价值"评分（用于排序 / 合成 / 战利品判断"哪张更值"），**不直接影响游戏战斗强度**。

但 value 应反映实际强度：如果你把一张卡变更强（如重复次数 4→5），相应 value 应提一档；变弱则降。

公式直觉：每加 1 个有效属性单位（+1 攻 / +1 弹 / +1 燃烧次数）大致对应 value +5。

---

## 5. 数值字段速查

每张卡的核心数值参数都在 `_xxxTier()` 函数签名里。常见模式：

```js
_igniteTier(bound, fire, value, pen = 0)
// bound: 弹射数 / fire: 命中燃烧层 / value: 价值 / pen: 穿透

_lighterTier(reps, chain, value)
// reps: 摧毁时燃烧重复次数 / chain: 钻级 chain 模式 / value

_skeletonHornTier(skN, atkBoost, value)
// skN: 召唤骷髅数 / atkBoost: 给场上骷髅 +N 攻 / value

_skeletonLordTier(attacksPerTurn, value)
// attacksPerTurn: 每回合攻击次数 / value

_warBannerTier(auraDmg, spawnDmg, value)
// auraDmg: 使用时给场上实体 +N 攻 / spawnDmg: 展露给新召唤实体 +N 攻 / value
```

调整流程：找到家族 `_xxxTier` 函数 → 看签名 → 改 CARD_DATA 里的调用参数（不要改函数内部硬编码逻辑）。

---

## 6. 描述（desc）必须跟数值同步

数值改了，desc 里的数字也要跟着改！这是最常见的低级错：

```js
// ❌ 改了参数但 desc 没改
_lighterTier(4, false, 8): desc: '重复 3 次'  // 错位

// ✅ 数值跟 desc 同步
_lighterTier(4, false, 8): desc: `重复 ${reps} 次`  // 用模板字面量动态生成
```

大多数 `_xxxTier()` 已经用模板字面量动态生成 desc（如 `_lighterTier / _skeletonHornTier / _warBannerTier`）。改参数自动同步。
**没用模板字面量的家族要先重构** — 不然两边对不上。

---

## 7. 数值调整 checklist

每次改数值跑这套验证：

1. **preview_eval 字段值**：
   ```js
   ({
     bronze: window.__cards.ignite.tiers.bronze,
     silver: window.__cards.ignite.tiers.silver,
     gold:   window.__cards.ignite.tiers.gold,
     diamond: window.__cards.ignite.tiers.diamond,
   })
   ```
   对照新策划表逐字段确认（cost / value / desc.zh / desc.en）。

2. **desc 反映新数值**：上一节强调过，重点检查。

3. **跨稀有度阶梯**：新数值跟 §1 梯度对齐了吗？没对齐有充分理由吗？

4. **战斗实测**：进战斗用一下这张卡，感觉强度合理（不能秒杀 / 不能完全无效）。

5. **i18n**：zh / en 描述都对，关键词加粗触发正常。

---

## 8. 同步策划表

数值改完后，如果用户希望策划表跟代码同步：
- 跑 `python build_xlsx.py` 导出 game_data.xlsx 快照
- **不要**直接覆盖用户从 Downloads 发来的 (N).xlsx 版本（那是用户在维护的，版本号他控）
- 把改动作为 chat 输出告诉用户，让他自己同步到下一版 (N+1).xlsx 里

---

## 9. 多个数值同时调（批量改）

任务："把所有铜级 value 提 20%"：
- 不要手动一个个改 — 容易遗漏
- 写脚本扫 CARD_DATA：
  ```python
  # 不在 IIFE 内运行，用 preview_eval 间接
  preview_eval：
  Object.entries(window.__cards).flatMap(([fid, fam]) =>
    Object.entries(fam.tiers)
      .filter(([t]) => t === 'bronze')
      .map(([t, def]) => [fid, def.value, Math.round(def.value * 1.2)])
  )
  ```
- 把结果拿到代码里逐个 Edit（每个家族找对应 `_xxxTier()` 调用，改 value 参数）
- 一次性改完所有家族后再 verify

---

## 10. 常见任务范本

### A. "引燃太弱，伤害提一档"
- 看 `_igniteTier(bound, fire, value, pen)` 签名 — fire 是燃烧层数
- 把每个 tier 的 fire +1：`_igniteTier(0, 3, 13)` 等
- value 同步 +5 一档：6→13→18→23 等
- desc 自动跟（已用模板字面量）

### B. "钻级骷髅号角 4 召唤太离谱"
- `_skeletonHornTier(4, 1, 30)` → 改成 `_skeletonHornTier(3, 1, 30)`
- value 保持（钻级合理 value 是 30）
- desc 自动跟

### C. "所有 cost 2 的银级卡 cost 提到 3"
- 扫所有 `_xxxTier()` 在 silver 注册时 cost — 但 cost 都是写在 _xxxTier 函数内部硬编码的
- 要么改函数内 `cost: 2` → `cost: 3`（影响所有该 family 的 tier）
- 要么改函数签名让 cost 参数化（重构成本，但更灵活）
- 这种"全局批量改"建议先跟用户对齐范围（避免误伤）

### D. "敌人 HP 都减半"
- 跳 `enemy-system` skill（数值在 ENEMY_TYPES 里）

---

## 11. 常见坑

1. **改数值忘改 desc** — 用户看见的描述对不上实际强度
2. **打破稀有度梯度**（如银卡数值比金卡还高） — 商店购买 / 合成体验混乱
3. **cost 改了但 value 没改** — 卡的"性价比"评分错位
4. **批量改时漏掉一两个家族** — 用脚本生成清单，再人工 Edit
5. **改了 RARITY_PROB 概率** — 那不是数值调整，是商店调整，跳 `shop-system`
6. **只调了金 / 钻没调铜 / 银** — 同一家族 4 tier 应保持递增关系
7. **调了卡但实战变化不明显** — 可能你调的是 value（仅排序用），实际属性参数没动
