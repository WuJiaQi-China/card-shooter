---
name: art-and-fx
description: 卡牌射击 web 项目里"美术 / 视觉 / 特效"相关的工作流。包括：卡面 emoji、卡牌稀有度颜色、子弹粒子效果、实体装饰（剑、骷髅、翅膀等漂浮 emoji）、命中 / AOE / 死亡视觉、CSS 动画、HUD 颜色调整。当用户说 "把 XX 卡的 emoji 换成 ..."、"加更明显的命中特效"、"实体子弹漂浮 emoji"、"颜色不对"、"动画不流畅" 等场景时使用此 skill。前置阅读：`card-shooter-overview` skill。
---

# 美术 / 视觉 / 特效 工作流

> **前置**：先读 `card-shooter-overview`。

这个项目美术全部用 emoji + canvas 粒子 + CSS。没有图片资源。视觉调整集中在三个地方：

```
1. 卡牌外观  →  CARD_DATA.xxx.emoji + style.css 的 .rarity-* / .card-front
2. 战斗特效  →  game.js Particle 类 + FX 字典
3. 实体装饰  →  game.js _drawEntityDecos + Bullet 的 _entityDecos 数组
```

---

## 1. 卡牌外观

### 1.1 卡面 emoji

每个家族在 `CARD_DATA[fid].emoji`：
```js
war_banner: { emoji: '🚩', name: {...}, tiers: {...} },
```

换 emoji 时：
- 单字符（含组合 emoji 如 🧙‍♀️）
- 与家族主题一致；尽量不与已有家族重复（搜 `emoji: '` 看清单）
- 默认背景圆按 rarity 上色，不要靠 emoji 自带颜色辨识

### 1.2 稀有度颜色（铜 / 银 / 金 / 钻）

style.css 里搜 `.rarity-`：
```css
.rarity-bronze  → 棕色边框 + 背景
.rarity-silver  → 银白
.rarity-gold    → 金黄
.rarity-diamond → 浅蓝紫 + 光晕动画
```

调颜色：找 `--rarity-bronze: #xxx` 这类 CSS 变量改值（更改影响全局所有铜级卡）。
单卡颜色特殊化：在 `cardEl()` 渲染时加 class 名（如 `temporary` 蓝色边框已用于 `_destroyAfterUse` 临时卡）。

### 1.3 卡牌动画（入场 / 离场 / 翻面）

- 入场：`.card-slot.entering` 的 CSS keyframe（淡入 + 平移）
- 离场：`.card.leaving / .leave-use / .leave-discard / .leave-buff` — 不同动作不同动画
- 翻面：`.card.face-down` + `rotateY` 3D 翻转（**.card 元素本身不要叠 transform，会破坏 rotateY**；入场 / 离场放在 `.card-slot`）
- 关键约束（HANDOFF.md 提过）：**入场 / 离场动画在 `.card-slot` 上，不要放在 `.card` 上**

---

## 2. 战斗粒子特效（Particle / FX）

### 2.1 Particle 类

`class Particle` 在 game.js 行 ~7618：
```js
new Particle({
  x, y, vx, vy,                  // 位置 + 速度
  life: 0.4,                     // 生命周期（秒）
  color: '#ffd84a',
  size: 3,
  type: 'ring' | undefined,      // ring 画环；不传 = 实心圆
})
```
push 进 `world.particles` 后由 main loop 自动 update + draw + 衰减消失。

### 2.2 FX 字典（行 ~8203）

`FX` 是一组打包好的"一次性效果"，传 `(world, x, y, ...)`：
```js
FX.hit(world, x, y)            // 命中：黄环 + 7 个橙色 spark
FX.wall(world, x, y)           // 撞墙：灰色小烟雾
FX.explode(world, x, y, r?)    // 大爆炸：红环 + 14 spark；r 传 AOE 半径让 ring 同步缩放
FX.damage(world, x, y, n)      // 飘动伤害数字
FX.xpBurst(world, x, y, n)     // 经验球飞向经验条
```

加新 FX 类型：在 `FX` 字典里新增 method，参考已有的 spread / sp / life / color 套路。

### 2.4 光束 / 激光（沿线粒子 + 高速短寿命子弹）

奥数巨人激光的实现 pattern：
- **逻辑层**：fire 一颗 `speed: 1600 / lifetime: 0.6 / radius: 7` 的 Bullet，带高 `penetrate` 让它沿途打穿多个敌人
- **视觉层**：沿目标方向 push 12 颗 ring 粒子（从近到远，size 7→4 渐细），加 18 颗起点 spark + `FX.shake(world, 4, 0.18)` 屏幕震
- **关键**：把"远端粒子 life 短 + 近端粒子 life 长"做反向（让玩家先看到起点炸开、再看到远端，形成"扫射"感）

参考 `_fireArcaneGiantLaser`。

### 2.5 屏幕震动 FX.shake

```js
FX.shake(world, intensity, duration)
// intensity：1=轻微 / 3=中等 / 5=猛烈 / >5 慎用
// duration：秒
```
用于：boss 出场、巨型 AOE、激光发射、暴击。**不要**每发普通子弹都震 — 会让玩家头晕。

### 2.3 设计原则（HANDOFF.md 强调过）

1. **AOE 半径 = 实际伤害圈半径** — 玩家看到的 ring 必须跟伤害判定一致。`FX.explode` 已支持传入 r，自定义 AOE 时务必把视觉 ring 跟 `applyAoe` 的 radius 对齐。
2. **不在炮台位置 spawn 特效** — 旧设计有 `FX.muzzle / FX.cardUse / FX.cardUseGreen` 已经被用户明确移除，**不要再加回来**。要表达"卡用了"用其它视觉（卡的离场动画 `.leave-use` 等）。
3. **粒子数量节制** — 每次效果 5~20 个粒子是合理上限。超过会卡顿。

---

## 3. 实体装饰（_entityDecos）

实体子弹（剑士 / 骷髅领主 / 蝙蝠 / 引信 / 城墙 / 战旗）头顶漂浮的 emoji 装饰，用 `bullet._entityDecos` 数组实现：

```js
// 在 Spawned hook 中 push 装饰类型
new Effect(Phase.Spawned, 0, ctx => {
  (ctx.bullet._entityDecos = ctx.bullet._entityDecos || []).push('skull');
}),
```

支持的 kind（在 `_drawEntityDecos` 行 ~1736 中分支）：
- `'sword'` → 🗡 扇形展开（多把 = 多角度）
- `'skull'` → 💀 顶部漂浮
- `'wings'` → 🪽 左右成对（多对上下错开）
- `'fuse'` → 🔥 倒计时
- `'arcane'` → ✨ 顶部漂浮 + 紫色光晕 shadowBlur（奥数巨人专用）
- 其它新增 → 自己在 `_drawEntityDecos` 加新分支

设计约定：
- **同种装饰多个会并排** — 例如两把剑会扇开 60°，3 把扇形 90°
- **不同种叠加** — 一起显示，互不干扰
- 装饰尺寸随 bullet.radius 自适应：`Math.max(14, Math.min(24, r * 1.4))`

新增装饰类型：
1. 选 emoji，在 `_drawEntityDecos` 里 `const xxxN = grouped.xxx || 0;` 取数
2. 仿造现有 sword / skull 的 for 循环写位置 + sway 动画
3. 在卡的 Spawned hook 里 push 类型字符串

---

## 4. canvas 绘制（Bullet / Enemy / 炮台）

- Bullet.draw 行 ~1700：球体 + 实体装饰 + 燃烧 / 冻结视觉
- Enemy.draw 行 ~2200+：按 `shape: 'circle' | 'triangle' | 'rect'` 分支 + intent 图标
- PlayerCannon.draw：炮台基座 + 旋转炮管

加新视觉元素（如新的状态光环）：在对应 draw 方法里加，注意：
- 用 `ctx.save() / ctx.restore()` 包住所有 transform / shadowBlur 改动
- 透明度用 `ctx.globalAlpha`
- 命中闪烁等"短时视觉"优先用 Particle 实现，不要在 Bullet.draw 里加 state

---

## 5. HUD / 模态弹窗 样式

style.css 大区段：
- `.modal-discover / .discover-cards / .discover-queue` — 发现弹窗
- `.modal-loot / .loot-candidates / .loot-controls` — 战利品 / 商店面板
- `.modal-inventory / .bag-grid` — 背包面板
- HUD 顶栏 / 侧栏 — 搜 `#hp / #mana / #gold / #combo / #state`
- 关键词 tooltip — 搜 `.kw-tip`

颜色统一规范（暗色主题）：
- 背景灰 `#0f1318` 系
- 主色（神秘 / 重要）紫 `#c97aff / #b06bd0`
- 主色（实体 / 友方）蓝 `#5eb2ff / #aef0fb`
- 高亮黄 `#ffd84a / #ffa64a`
- 危险红 `#ef7878 / #ff6b6b`
- 治疗 / 增益绿 `#5bd45b / #60c060`

---

## 6. 加新动画的标准方式

CSS keyframe：
```css
@keyframes my-animation {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
.my-element {
  animation: my-animation 0.3s ease-out;
}
```

在 game.js 里触发（强制 reflow 让动画可重复）：
```js
el.classList.remove('my-flash');
void el.offsetWidth;        // ← 强制 reflow
el.classList.add('my-flash');
```

参考：永久升级按钮的折扣闪烁（搜 `discount-flash`）。

---

## 7. 颜色 / 亮度调整的常见任务

| 任务 | 改哪 |
|---|---|
| 整体亮度提高 | style.css 顶部 `body` background |
| 某稀有度颜色 | style.css `.rarity-xxx` |
| 燃烧粒子颜色 | `applyFire` / 子弹绘制里搜 `#ff6b6b` 这类红色字面量 |
| 实体子弹光晕颜色 | Bullet.draw 内 `ctx.fillStyle` 行 |
| 命中数字大小 / 颜色 | `DamageNumber` 类构造 + draw |
| 卡牌字体大小 | style.css `.card-name / .card-desc` |

---

## 8. 验证 art 改动

1. 浏览器肉眼看（preview_screenshot 给个截图）
2. **不同稀有度都看一遍** — 颜色规则常常忘改某一级
3. **不同语言看一遍** — 中文 / 英文长度不同，字号自适应有时不到位（搜 `scheduleFitCardDescs`）
4. **战斗中视觉** — 静态 modal 对了不代表战斗里也对；启动一场战斗看子弹 / 实体 / 死亡视觉

---

## 9. 常见坑

1. **CSS 改了但浏览器没刷** — preview server 是静态文件 + 浏览器 cache；改 CSS 后强刷（Ctrl+F5）或在 eval 里 `window.location.reload()`
2. **粒子数量爆炸** — 单次效果 >50 粒子会卡顿；多用 ring + 少量 spark 组合
3. **AOE ring 跟实际伤害圈不匹配** — 永远以 `applyAoe` 的 radius 为准画 ring，别拍脑袋写半径
4. **实体装饰加了但没显示** — 检查 `Bullet.draw` 里有没有调 `_drawEntityDecos(ctx, this)`（行 ~1704，条件是 `entityLayersMax > 0`）
5. **emoji 渲染因字体差异变形** — canvas 用 `serif` 字体的 emoji 较稳定（已是默认）；不要换花式字体
6. **改 CSS 改了 `.card` 本身的 transform** — 会破坏翻面 3D 动画；改 `.card-slot` 或 `.card-front / .card-back` 子元素
