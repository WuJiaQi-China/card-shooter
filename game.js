// ===================================================================
// 卡牌射击 · Web 复刻 (MVP)
// 原 Unity 项目: C:\项目\卡牌射击
// 复刻范围: Hook 6 阶段 / 4 张代表卡 / 左右两侧 + 主卡 + 连携 / 连击 / Dog 敌人
// ===================================================================

(() => {
'use strict';

// ─── 0. 工具 ────────────────────────────────────────────────────────
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));

function angleBetween(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }

// ─── 多语言（i18n）─────────────────────────────────────────────────
// 单一 LANG.current 控制全局语言；切换时 emit 'langChanged' → UI 重渲。
const LANG = { current: 'zh' };
try { LANG.current = localStorage.getItem('cs_lang') || 'zh'; } catch (e) {}
function setLang(code) {
  if (code !== 'zh' && code !== 'en') code = 'zh';
  if (LANG.current === code) return;
  LANG.current = code;
  try { localStorage.setItem('cs_lang', code); } catch (e) {}
  Events.emit('langChanged', code);
}

// UI / toast 字符串字典。{n} / {name} 等占位符用 t(key, vars) 替换。
const I18N = {
  zh: {
    page_title: '卡牌射击 · Web 复刻',
    rail_ops: '操作',
    rail_mouse: '瞄准', rail_left: '打左卡', rail_right: '打右卡',
    rail_wheel_up: '弃左', rail_wheel_down: '弃右',
    rail_space: '结束回合', rail_enter: '开战 / 重开',
    kbd_mouse: '鼠标', kbd_lmb: '左键', kbd_rmb: '右键',
    kbd_wheel_up: '滚轮↑', kbd_wheel_down: '滚轮↓',
    rail_tip_combo: '连携 stacks > 0 时，下次发射自动触发（左+右+主同发，费用三卡相加）',
    rail_tip_entity: '实体(N) 子弹：撞墙/穿透耗尽后会留在原地，每回合触发实体效果（如挥剑），承受 N 次敌人碰撞后销毁',
    rail_tip_enemy: '敌人右下角图标 + 数字 = N 回合后的下一动作',
    hud_turn: '回合', hud_state: '状态', hud_turn_num: '回合数',
    hud_auto_end: '法力不足时\n自动结束回合',
    hud_auto_end_no_enemy: '无敌人时\n自动结束回合\n(每点法力+1金币)',
    hud_gold: '金币',
    ms_hp: '血量', ms_armor: '护甲', ms_mana: '水晶', ms_chain: '连携', ms_combo: '连击',
    open_bag: '🎒 背包 ({n} 法力)',
    inv_title: '🎒 背包整理',
    inv_sub: '右键 = 设为主卡 · 拖拽 = 交换位置',
    inv_close: '关闭（重新洗牌）',
    loot_title: '升级！可选一张新卡加入背包',
    reroll: '刷新 (花 {cost} 金 · 💰{gold})',
    reroll_init: '刷新（× 0）',
    shop_level: '升级 Lv {cur}→{next}（花 {cost} 金）',
    shop_max: '商店 Lv 8 (MAX)',
    shop_btn_init: '商店 Lv 1 (0/1)',
    loot_hint_pick: '点击候选卡 → 再点背包槽完成替换（不选也可直接继续）',
    loot_hint_done: '已替换。可继续调整背包或点击继续游戏',
    loot_hint_selected: '已选「{name}」 → 点击下方任一卡完成替换（可再点候选改主意）',
    continue: '继续游戏',
    wave_preview: '下波预告',
    score_run: '本局：', score_best: '最高：', stat_kills: '击杀：', stat_level: '等级：', stat_shop: '商店：',
    wave_this: '本回合', wave_after: '{n} 回合后', wave_none: '—',
    turn_player: '玩家', turn_enemy: '敌方',
    state_Idle: 'Idle', state_PreBattle: 'PreBattle', state_Battle: 'Battle',
    state_PostBattle: 'PostBattle', state_Reward: 'Reward', state_Inventory: 'Inventory',
    facedown_title: '反面的卡牌',
    facedown_body: '移动到列表头 / 尾后会揭开。',
    next_action: '下一行动', cd_now: '立即', cd_after: '{n} 回合后',
    et_hp: 'HP', et_attack: '攻击', et_speed: '速度', et_xp: '经验奖励',
    et_decay: '回合衰减', et_behavior: '行为',
    et_intro: '📜 介绍', et_friendly: '（己方）',
    et_decay_none: '不衰减', et_decay_per: '-{n}/回合',
    et_fire_per: '每 {cd} 敌方回合射 ({atk} 伤)', et_melee: '近战',
    set_main_toast: '「{name}」成为主卡', is_main: '已是主卡',
    bag_need_mana: '需要 {n} 法力打开背包',
    enter_to_start: '按 Enter 开战', enter_to_restart: '阵亡。按 Enter 重开',
    enter_hint: '鼠标瞄准 · 左键/右键发射 · 滚轮弃牌 · Space 结束回合',
    no_mana: '法力不足', empty_hand: '手牌空', need_two: '需要左右两张牌',
    need_gold_extra: '需要 {n} 金币才能再选一张',
    main_replaced: '主卡已替换 ✨', replaced: '已替换',
    upgrade_toast: '升级! Lv {lv}（+5 金币 · 回合后进商店）',
    shop_upgrade_toast: '商店升级 → Lv {lv}（-{cost} 金币）',
    prob_label_cur: 'Lv {lv} 当前', prob_label_next: 'Lv {lv} 升级后',
    rarity_common: '普通', rarity_rare: '稀有', rarity_epic: '史诗', rarity_legendary: '传说',
    main_card_label: '主卡',
    lang_btn: 'EN',
  },
  en: {
    page_title: 'Card Shooter · Web Replica',
    rail_ops: 'Controls',
    rail_mouse: 'Aim', rail_left: 'Use Left', rail_right: 'Use Right',
    rail_wheel_up: 'Discard L', rail_wheel_down: 'Discard R',
    rail_space: 'End Turn', rail_enter: 'Start / Restart',
    kbd_mouse: 'Mouse', kbd_lmb: 'LMB', kbd_rmb: 'RMB',
    kbd_wheel_up: 'Wheel↑', kbd_wheel_down: 'Wheel↓',
    rail_tip_combo: 'When Chain stacks > 0, next shot fires Left + Right + Main together (costs add up).',
    rail_tip_entity: 'Entity(N) bullets stay in place after hitting a wall / piercing out, triggering their effect each turn. Destroyed after N enemy hits.',
    rail_tip_enemy: 'Bottom-right icon + number on enemies = action coming in N turns.',
    hud_turn: 'Turn', hud_state: 'State', hud_turn_num: 'Turn #',
    hud_auto_end: 'Auto end turn\nwhen low on mana',
    hud_auto_end_no_enemy: 'Auto end turn\nwhen no enemies\n(+1 gold per mana)',
    hud_gold: 'Gold',
    ms_hp: 'HP', ms_armor: 'Armor', ms_mana: 'Mana', ms_chain: 'Chain', ms_combo: 'Combo',
    open_bag: '🎒 Bag ({n} Mana)',
    inv_title: '🎒 Inventory',
    inv_sub: 'Right-click = set as Main · Drag = swap',
    inv_close: 'Close (Reshuffle)',
    loot_title: 'Level up! Pick a new card to add to your bag',
    reroll: 'Reroll ({cost} 💰 · 💰{gold})',
    reroll_init: 'Reroll (× 0)',
    shop_level: 'Upgrade Lv {cur}→{next} ({cost} 💰)',
    shop_max: 'Shop Lv 8 (MAX)',
    shop_btn_init: 'Shop Lv 1 (0/1)',
    loot_hint_pick: 'Click a candidate → then click a bag slot to replace (or just continue)',
    loot_hint_done: 'Replaced. Keep editing your bag or hit Continue.',
    loot_hint_selected: 'Selected "{name}" → click any bag slot to replace (click again to undo)',
    continue: 'Continue',
    wave_preview: 'Next Wave',
    score_run: 'Run:', score_best: 'Best:', stat_kills: 'Kills:', stat_level: 'Level:', stat_shop: 'Shop:',
    wave_this: 'this turn', wave_after: 'in {n} turn(s)', wave_none: '—',
    turn_player: 'Player', turn_enemy: 'Enemy',
    state_Idle: 'Idle', state_PreBattle: 'Ready', state_Battle: 'Battle',
    state_PostBattle: 'Defeat', state_Reward: 'Shop', state_Inventory: 'Inventory',
    facedown_title: 'Face-down Card',
    facedown_body: 'Will reveal when moved to either end of your hand.',
    next_action: 'Next Action', cd_now: 'now', cd_after: 'in {n} turn(s)',
    et_hp: 'HP', et_attack: 'ATK', et_speed: 'SPD', et_xp: 'XP Reward',
    et_decay: 'Decay', et_behavior: 'Behavior',
    et_intro: '📜 Profile', et_friendly: ' (Ally)',
    et_decay_none: 'none', et_decay_per: '-{n}/turn',
    et_fire_per: 'Fires every {cd} enemy turn(s) ({atk} dmg)', et_melee: 'Melee',
    set_main_toast: '"{name}" is now the main card', is_main: 'Already the main card',
    bag_need_mana: 'Need {n} mana to open the bag',
    enter_to_start: 'Press Enter to start', enter_to_restart: 'Defeated. Press Enter to restart',
    enter_hint: 'Mouse aim · LMB/RMB fire · Wheel discard · Space ends turn',
    no_mana: 'Not enough mana', empty_hand: 'Hand is empty', need_two: 'Need both left & right cards',
    need_gold_extra: 'Need {n} gold to pick another card',
    main_replaced: 'Main card replaced ✨', replaced: 'Replaced',
    upgrade_toast: 'Level Up! Lv {lv} (+5💰 · shop opens after turn)',
    shop_upgrade_toast: 'Shop upgraded → Lv {lv} (-{cost}💰)',
    prob_label_cur: 'Lv {lv} now', prob_label_next: 'Lv {lv} after upgrade',
    rarity_common: 'Common', rarity_rare: 'Rare', rarity_epic: 'Epic', rarity_legendary: 'Legendary',
    main_card_label: 'Main',
    lang_btn: '中文',
  },
};

function t(key, vars) {
  const dict = I18N[LANG.current] || I18N.zh;
  let s = dict[key] ?? I18N.zh[key] ?? key;
  if (vars) {
    for (const k of Object.keys(vars)) s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
  }
  return s;
}

// pickLang({zh, en}) → 返回当前语言的字符串；若传入是字符串则原样返回
function pickLang(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  return v[LANG.current] || v.zh || v.en || '';
}

// 应用所有带 data-i18n="key" 的元素：用 t(key) 填充 textContent。
// data-i18n-attr="placeholder|title|aria-label" 可作用于属性。
function applyI18nDom() {
  document.documentElement.lang = LANG.current === 'en' ? 'en' : 'zh-CN';
  const title = document.querySelector('title');
  if (title) title.textContent = t('page_title');
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const attr = el.getAttribute('data-i18n-attr');
    const val = t(key);
    if (attr) el.setAttribute(attr, val);
    else el.textContent = val;
  });
}

// ─── 关键词字典 ─────────────────────────────────────────────────────
// 用于：① 卡描述中加粗高亮；② 卡 hover 时显示解释 tooltip。
// 长词在前避免短词被先匹配（如「连携」在「连击」前）。
const KEYWORDS_DICT = {
  zh: [
    { word: '展露',  cls: 'reveal',  title: '展露',  desc: '卡面朝上时持续生效（边缘卡 / 主卡）。不消耗法力。' },
    { word: '连击',  cls: 'combo',   title: '连击',  desc: '连续在同一侧使用卡牌累计连击数。换侧 / 弃牌 / 战斗起止清零。' },
    { word: '连携',  cls: 'combo',   title: '连携',  desc: '按 F 同时使用左 + 右 + 主卡（三张卡的法力消耗叠加）。' },
    { word: '洗入',  cls: 'shuffle', title: '洗入',  desc: '向手牌的随机位置洗入一张卡牌（落在边缘则立即展露）。' },
    { word: '弃置',  cls: 'discard', title: '弃置',  desc: '把卡弃到弃牌堆触发效果。手牌空时弃牌堆全部洗回。' },
    { word: '实体化', cls: 'entity', title: '实体化', desc: '子弹拥有实体化层数。子弹本该销毁时（撞墙 / 穿透耗尽 / 寿命结束）转入实体态，停在原地。实体态下：与敌人碰撞 = 造成子弹伤害 + 击退 + 层数-1；敌方回合开始前 = 触发实体效果 + 层数-1。层数 0 → 销毁。子弹半径翻倍。' },
    { word: '弹射',  cls: 'bounce',  title: '弹射',  desc: '子弹撞墙时反弹（消耗 1 次弹射）。0 时撞墙销毁。「弹射时…」效果在弹射次数减少的瞬间触发。' },
    { word: '穿透',  cls: 'bounce',  title: '穿透',  desc: '命中敌人后继续飞（消耗 1 次穿透）。0 时命中销毁。「穿透时…」效果在穿透次数减少的瞬间触发。' },
    { word: '命中',  cls: 'other',   title: '命中',  desc: '子弹尝试对敌人造成伤害的时刻（被格挡 / 伤害为 0 也算）。直接碰撞和范围伤害都会触发命中效果。' },
    { word: '碰撞',  cls: 'other',   title: '碰撞',  desc: '子弹与敌人或墙壁发生接触的时刻，不论后续是否真造成伤害。' },
    { word: '护盾',  cls: 'summon',  title: '护盾',  desc: '吸收 1 次伤害（吸完后消失）。' },
    { word: '护甲',  cls: 'armor',   title: '护甲',  desc: '按数值抵挡伤害。玩家回合开始重置为 3。' },
    { word: '追踪',  cls: 'other',   title: '追踪',  desc: '子弹自动转向追踪最近的敌人。' },
    { word: '水晶',  cls: 'other',   title: '水晶',  desc: '即法力。回合制下每个玩家回合开始时回满，不自动回复。' },
    { word: '法力',  cls: 'other',   title: '法力',  desc: '使用 / 弃置卡牌的消耗资源。每个玩家回合开始回满。' },
    { word: '奥弹',  cls: 'arcane',  title: '奥弹',  desc: '追踪敌人的奥术飞弹。在手牌正面时立即自动触发，不消耗法力；可被「奥术强化」加成。' },
    { word: '火焰',  cls: 'fire',    title: '火焰',  desc: '可叠加层数的 debuff。敌方回合开始前每个有火焰的敌人受 (火焰层数) 伤害，然后层数 -1。' },
    { word: '引爆',  cls: 'fire',    title: '引爆',  desc: '立刻让所有有火焰的敌人受 (火焰层数 × N) 伤害并清空。' },
  ],
  en: [
    { word: 'Reveal',    cls: 'reveal',  title: 'Reveal',    desc: 'Active while face-up (edge cards / main card). Costs no mana.' },
    { word: 'Combo',     cls: 'combo',   title: 'Combo',     desc: 'Use cards on the same side in a row to build Combo. Switching side / discarding / battle start-end resets it.' },
    { word: 'Chain',     cls: 'combo',   title: 'Chain',     desc: 'Press F to fire Left + Right + Main together (mana costs of all three add up).' },
    { word: 'Shuffle in', cls: 'shuffle', title: 'Shuffle in', desc: 'Insert a card into your hand at a random position (reveals immediately if it lands at an edge).' },
    { word: 'Discard',   cls: 'discard', title: 'Discard',   desc: 'Send a card to the discard pile and trigger its discard effect. Discard pile reshuffles when hand is empty.' },
    { word: 'Entity',    cls: 'entity',  title: 'Entity',    desc: 'The bullet has Entity stacks. When it would be destroyed (hit a wall / out of pierce / lifetime ended) it stays in place instead. While in Entity state: enemy contact = deal bullet damage + knockback + stack-1; start of each enemy turn = trigger Entity effect + stack-1. At 0 → destroyed. Entity bullet radius is increased.' },
    { word: 'Bounce',    cls: 'bounce',  title: 'Bounce',    desc: 'Bullet bounces off walls (uses 1 Bounce). At 0, bullet is destroyed on wall hit. "On bounce…" effects trigger the moment the Bounce counter decreases.' },
    { word: 'Pierce',    cls: 'bounce',  title: 'Pierce',    desc: 'Bullet continues after hitting an enemy (uses 1 Pierce). At 0, bullet is destroyed on enemy hit. "On pierce…" effects trigger the moment the Pierce counter decreases.' },
    { word: 'On hit',    cls: 'other',   title: 'On hit',    desc: 'The moment a bullet attempts to damage an enemy (even if blocked or damage = 0). Both direct collisions and AOE hits fire on-hit effects.' },
    { word: 'On collision', cls: 'other', title: 'On collision', desc: 'The moment a bullet touches an enemy or wall, regardless of whether damage is actually dealt.' },
    { word: 'Shield',    cls: 'summon',  title: 'Shield',    desc: 'Absorbs 1 hit of damage, then disappears.' },
    { word: 'Armor',     cls: 'armor',   title: 'Armor',     desc: 'Absorbs damage by its value. Resets to 3 at the start of each player turn.' },
    { word: 'Track',     cls: 'other',   title: 'Track',     desc: 'Bullet auto-turns toward the nearest enemy.' },
    { word: 'Crystal',   cls: 'other',   title: 'Crystal',   desc: 'Same as mana. In turn-based mode it refills at the start of each player turn; it does not regen otherwise.' },
    { word: 'Mana',      cls: 'other',   title: 'Mana',      desc: 'Resource for using / discarding cards. Refills at the start of each player turn.' },
    { word: 'Arcane Missile', cls: 'arcane', title: 'Arcane Missile', desc: 'A tracking arcane projectile. Auto-triggers the moment it is face-up in hand at no mana cost. Boosted by Arcane Boost.' },
    { word: 'Fire',      cls: 'fire',    title: 'Fire',      desc: 'Stackable debuff. At the start of each enemy turn, each enemy with Fire takes (stack) damage and then loses 1 stack.' },
    { word: 'Detonate',  cls: 'fire',    title: 'Detonate',  desc: 'Immediately deal (stack × N) damage to all enemies with Fire and clear their stacks.' },
  ],
};

function currentKeywords() {
  return KEYWORDS_DICT[LANG.current] || KEYWORDS_DICT.zh;
}

// 把 desc 文本里的关键词包裹为 <span class="kw kw-X">...</span>，并返回出现过的关键词列表
function renderDescWithKeywords(desc) {
  let html = escapeHtml(desc);
  const seen = [];
  for (const kw of currentKeywords()) {
    // 英文需要词边界（避免 'Fire' 匹配 'Firebomb' 之类）；中文不需要
    const isEnWord = /^[A-Za-z]/.test(kw.word);
    const pattern = isEnWord
      ? new RegExp('\\b' + kw.word.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&') + '\\b', 'g')
      : new RegExp(kw.word, 'g');
    if (pattern.test(html)) {
      pattern.lastIndex = 0;
      html = html.replace(pattern, `<span class="kw kw-${kw.cls}">${kw.word}</span>`);
      seen.push(kw);
    }
  }
  return { html, seen };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

// 梯形地图：返回任意 y 处的左右 x 边界。
// 顶部 y=0 时 = (0, w)；底部 y=h 时 = (bottomLeft, bottomRight)。
function trapBounds(world, y) {
  const t = clamp(y / world.h, 0, 1);
  const leftX = world.trap.bottomLeft * t;
  const rightX = world.w - (world.w - world.trap.bottomRight) * t;
  return { leftX, rightX };
}

// 梯形左/右斜边的内法线（指向梯形内部），单位向量
function trapNormals(world) {
  const h = world.h;
  const bl = world.trap.bottomLeft;
  const dr = world.w - world.trap.bottomRight;
  const llen = Math.hypot(h, bl);
  const rlen = Math.hypot(h, dr);
  return {
    left:  { x:  h / llen, y: -bl / llen },
    right: { x: -h / rlen, y: -dr / rlen },
  };
}

class Emitter {
  constructor() { this.map = new Map(); }
  on(k, fn)  { (this.map.get(k) || this.map.set(k, []).get(k)).push(fn); }
  off(k, fn) { const a = this.map.get(k); if (!a) return; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }
  emit(k, ...args) { const a = this.map.get(k); if (a) for (const fn of [...a]) fn(...args); }
}
const Events = new Emitter();

// ─── 1. Hook / Effect 系统 ──────────────────────────────────────────
// 对应 Unity 端 Effect.cs。6 阶段，按 priority 升序执行，
// 任何 Hook 设 ctx.handled = true 拦截后续 + 默认行为。
const Phase = Object.freeze({
  PreActive:  'PreActive',   // 发射前一次（模板）
  Spawned:    'Spawned',     // 每颗克隆生成（per-clone 随机决策唯一时机）
  HitWall:    'HitWall',     // 撞墙（碰撞墙 / "弹射"触发 = bound-- 时点）
  HitEnemy:   'HitEnemy',    // 与敌人直接碰撞（"碰撞"触发；"穿透"触发 = penetrate-- 时点）
  // OnHit: 任何对敌人的"命中"尝试 — 直接子弹碰撞 + AOE 都会触发；
  // 不论 attack 是 0、敌方有护盾抵挡、或 HitEnemy 钩子 handled=true，都会触发。
  // 给"命中触发"类卡（如引燃）用。和 HitEnemy 严格区分：HitEnemy 改子弹状态（弹/穿、速度等），
  // OnHit 只对被命中的"那个敌人"做事，不修改子弹状态，避免 AOE 链式叠加 bug。
  OnHit:      'OnHit',
  Destroyed:  'Destroyed',   // 销毁
  PostActive: 'PostActive',  // 一波打完（模板）
  EntityTurn: 'EntityTurn',  // 实体化子弹：每个敌方回合开始前触发（也可空 → 仅承伤实体）
});

class Effect {
  constructor(phase, priority, fn) {
    this.phase = phase;
    this.priority = priority;
    this.fn = fn;
  }
  execute(ctx) { this.fn(ctx); }
}

// ─── 2. Bullet ──────────────────────────────────────────────────────
// 子弹有「模板」和「克隆」之分：模板带 Hook 列表，克隆浅拷贝同一批 Hook
// 所以 Hook 必须无状态（per-bullet 状态写在 Bullet 字段上）。
class Bullet {
  constructor(opts = {}) {
    this.x = opts.x ?? 0;
    this.y = opts.y ?? 0;
    this.angle = opts.angle ?? 0;
    this.speed = opts.speed ?? 420;
    this.lifetime = opts.lifetime ?? 2.4;
    this.bulletCount = opts.bulletCount ?? 1;
    this.waveCount = opts.waveCount ?? 1;
    this.attack = opts.attack ?? 1;
    this.bound = opts.bound ?? 0;
    this.penetrate = opts.penetrate ?? 0;
    this.radius = opts.radius ?? 5;

    this.hooks = [];
    this.alive = false;     // 是否激活（飞行中）
    this.born = 0;
    this.recentHits = new Map();   // enemyID -> last hit time
    this.hitCooldown = 0.1;
    // 拖尾历史：最多保留 6 个最近位置 → draw 时画淡化尾迹（juice）
    this.trail = [];

    // ─── 实体化（Entity）关键词 ─────────────────────────────────────
    // entityLayers > 0：子弹在"会被销毁"时不真销毁，而是停在原地进入实体状态。
    // 实体状态下：
    //   - 不移动、不撞墙、不消耗 lifetime
    //   - 与敌人碰撞 → 造成 attack 伤害 + 击退 + entityLayers-- + 触发 HitEnemy 钩子
    //   - 敌方回合开始前 → 触发 EntityTurn 钩子（实体效果） + entityLayers--
    //   - entityLayers ≤ 0 → 真销毁（触发 Destroyed 钩子）
    // 持有 entityLayers > 0 的子弹在发射时半径翻倍（固有 buff，已在 fireOneWave 中应用）
    this.entityLayers = opts.entityLayers ?? 0;
    this.entityLayersMax = this.entityLayers;
    this.isEntity = false;
  }

  addHook(h) { this.hooks.push(h); }
  copyHooksFrom(tpl) { this.hooks = [...tpl.hooks]; }
  clearHooks() { this.hooks.length = 0; }

  triggerHooks(phase, ctx = {}) {
    ctx.bullet = this;
    ctx.handled = ctx.handled ?? false;
    const list = this.hooks.filter(h => h.phase === phase).sort((a, b) => a.priority - b.priority);
    for (const h of list) {
      h.execute(ctx);
      if (ctx.handled) return true;
    }
    return false;
  }

  activate(now) { this.alive = true; this.born = now; }

  update(dt, now, world) {
    if (!this.alive) return;
    this._world = world;     // 给 Destroyed 钩子留下 world 引用
    // 风之眼：持续吸引附近敌人，任意阶段（含玩家回合 / 敌方回合 / 实体态）都生效。
    // 范围内距离越近吸引力越强（线性 falloff：边缘 0, 中心 maxPullSpeed）。
    if (this._eyeWind && this.team !== 'enemy') {
      const pullRadius = 220;
      const maxPullSpeed = 120;
      for (const e of world.enemies) {
        if (!e.alive) continue;
        const dx = this.x - e.x, dy = this.y - e.y;
        const d = Math.hypot(dx, dy);
        if (d < 6 || d > pullRadius) continue;
        const strength = maxPullSpeed * (1 - d / pullRadius);   // 0..max，越近越强
        e.x += (dx / d) * strength * dt;
        e.y += (dy / d) * strength * dt;
      }
    }
    // 实体化状态：玩家回合 → 静止；敌方回合 → 沿进入实体态时的速度/方向运动（撞墙反弹不扣 bound）
    if (this.isEntity) {
      this._updateEntity(dt, now, world);
      return;
    }
    // 追踪：平滑转向最近"对方阵营"（玩家弹追敌人；敌方弹追 ally）
    if (this.tracking) {
      let nearest = null, minD = Infinity;
      if (this.team === 'enemy') {
        const allies = [world.player, ...world.summons];
        for (const a of allies) {
          if (!a || (a.hp != null && a.hp <= 0)) continue;
          const d = Math.hypot(a.x - this.x, a.y - this.y);
          if (d < minD) { minD = d; nearest = a; }
        }
      } else {
        for (const e of world.enemies) {
          if (!e.alive) continue;
          const d = Math.hypot(e.x - this.x, e.y - this.y);
          if (d < minD) { minD = d; nearest = e; }
        }
      }
      if (nearest) {
        const dx = nearest.x - this.x;
        const dy = nearest.y - this.y;
        const d = Math.hypot(dx, dy);
        const targetA = Math.atan2(dy, dx);
        // 近距锁定：目标距离 < snap 半径时，强制对准目标方向（避免轨道环绕：
        // 原因 — 子弹的转向半径 = speed/turnRate，若大于目标到飞行路径的垂距，子弹永远绕不进来）
        const snapR = Math.max(36, this.radius * 4);
        if (d < snapR) {
          this.angle = targetA;
        } else {
          let diff = targetA - this.angle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          // 默认转向速率提高到 12 rad/s（原 6 太低，远距离也会绕圈）
          this.angle += diff * Math.min(1, dt * (this.trackRate || 12));
        }
      }
    }
    // 记录拖尾位置（每帧 push 一次，保留最近 6 个）
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 6) this.trail.shift();

    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y += Math.sin(this.angle) * this.speed * dt;

    if (now - this.born >= this.lifetime) { this.destroy(); return; }

    // 墙（梯形）—— 顶 / 底 / 两条斜边
    const tb = trapBounds(world, this.y);
    let n = null;
    if (this.y < 0) {
      n = { x: 0, y: 1 };
      this.y = 0.1;
    } else if (this.y > world.h) {
      n = { x: 0, y: -1 };
      this.y = world.h - 0.1;
    } else if (this.x < tb.leftX) {
      n = trapNormals(world).left;
      this.x = tb.leftX + 0.1;
    } else if (this.x > tb.rightX) {
      n = trapNormals(world).right;
      this.x = tb.rightX - 0.1;
    }
    if (n) {
      const handled = this.triggerHooks(Phase.HitWall, { normal: n, world });
      if (!handled) this._defaultHitWall(n, world);
    }

    // 命中目标：默认 player 子弹打 enemy；team='enemy' 子弹打 ally (player + summons + 玩家方实体子弹)
    if (this.team === 'enemy') {
      const allies = [world.player, ...world.summons.filter(s => s.alive)];
      // 玩家方实体子弹：本回合不会死的（layers>0）才作为合法目标
      for (const b of world.bullets) {
        if (b.isEntity && b.alive && b.team !== 'enemy' && b.entityLayers > 0) allies.push(b);
      }
      for (const a of allies) {
        if (!a || (a.hp != null && a.hp <= 0)) continue;
        const dx = a.x - this.x, dy = a.y - this.y;
        const aR = a.radius || 20;
        if (dx*dx + dy*dy > (aR + this.radius) ** 2) continue;
        a.takeDamage(this.attack);
        if (world) FX.hit(world, this.x, this.y);
        this.destroy();
        break;
      }
    } else {
      for (const e of world.enemies) {
        if (!e.alive) continue;
        if (e.spawnT > 0) continue;       // 出场 portal 期间不可命中
        const dx = e.x - this.x, dy = e.y - this.y;
        if (dx*dx + dy*dy > (e.radius + this.radius) ** 2) continue;
        const last = this.recentHits.get(e.id);
        if (last != null && now - last < this.hitCooldown) continue;
        this.recentHits.set(e.id, now);
        // 碰撞钩子：可改子弹状态，可 handled=true 拦截默认伤害
        const handled = this.triggerHooks(Phase.HitEnemy, { enemy: e, world });
        // 命中钩子：与 handled 无关、与是否拦截无关 — "尝试造成伤害"语义
        this.triggerHooks(Phase.OnHit, { enemy: e, world });
        if (!handled) this._defaultHitEnemy(e, world);
        if (!this.alive) break;
      }
    }
  }

  // 默认 HitEnemy：无条件造成伤害，再判 penetrate
  _defaultHitEnemy(enemy, world) {
    const dealt = enemy.takeDamage(this.attack);
    if (!dealt) return;
    // 击退：仅在本次命中后子弹会销毁时（不再穿透）触发。
    // 穿透中保留敌人位置 → 避免子弹前进时不断把敌人推到自己前面、产生连续多次命中。
    if (this.penetrate <= 0) {
      const baseForce = clamp(3 + this.attack * 1.0, 3, 16);
      const force = baseForce * (this.radius / 5);
      enemy.applyKnockback(this.x, this.y, force);
    }
    if (world) {
      FX.hit(world, this.x, this.y);
      FX.damage(world, enemy.x, enemy.y - enemy.radius, this.attack);
      // 屏幕震动：随伤害量轻微增强（封顶不夸张）
      FX.shake(world, clamp(1 + this.attack * 0.4, 1, 5), 0.12);
      // 重击 hit-stop：伤害 ≥5 时凝固一小段，凸显打击感
      if (this.attack >= 5) FX.hitStop(world, 0.045);
      if (this.attack >= 10) FX.hitStop(world, 0.08);
    }
    if (this.penetrate > 0) this.penetrate--;
    else this.destroy();
  }

  // 实体化每帧：
  //   - 进入实体态后完全静止（玩家回合 / 敌方回合都不动），不再撞墙、不再消耗 bound
  //   - 与敌人碰撞 → 触发 HitEnemy 钩子 + 造成伤害 + 击退 + 扣 1 层（不消耗 penetrate）
  //   - 每个敌方回合开始前由 BattleManager._tickEntityBullets 触发 EntityTurn 钩子（挥剑、射蝙蝠等）
  _updateEntity(dt, now, world) {
    if (world.battle.turn !== 'enemy') return;
    // 敌人碰撞：实体造成 attack 伤害 + 击退 + 扣 1 层（不消耗 penetrate）
    for (const e of world.enemies) {
      if (!e.alive) continue;
      const dx = e.x - this.x, dy = e.y - this.y;
      if (dx*dx + dy*dy > (e.radius + this.radius) ** 2) continue;
      const last = this.recentHits.get(e.id);
      if (last != null && now - last < this.hitCooldown) continue;
      this.recentHits.set(e.id, now);
      this.triggerHooks(Phase.HitEnemy, { enemy: e, world });
      this.triggerHooks(Phase.OnHit, { enemy: e, world });
      const dealt = e.takeDamage(this.attack);
      if (dealt && world) {
        const baseForce = clamp(3 + this.attack * 1.0, 3, 16);
        const force = baseForce * (this.radius / 5);
        e.applyKnockback(this.x, this.y, force);
        FX.hit(world, this.x, this.y);
        FX.damage(world, e.x, e.y - e.radius, this.attack);
        FX.shake(world, clamp(1 + this.attack * 0.4, 1, 5), 0.12);
      }
      this.entityLayers--;
      if (this.entityLayers <= 0) {
        this.triggerHooks(Phase.Destroyed, { world });
        this.alive = false;
        return;
      }
    }
  }

  // 敌方子弹命中实体时调用：每次命中扣 1 层（伤害数值不影响），归 0 → 真销毁
  takeDamage(amount) {
    if (!this.alive || !this.isEntity) return false;
    this.entityLayers--;
    if (this.entityLayers <= 0) {
      this.triggerHooks(Phase.Destroyed, { world: this._world });
      this.alive = false;
    }
    return true;
  }

  // 默认 HitWall：bound > 0 反弹，否则销毁。按 normal 向量正确反射，支持斜边
  _defaultHitWall(normal, world) {
    if (this.bound > 0) {
      this.bound--;
      const vx = Math.cos(this.angle), vy = Math.sin(this.angle);
      const dot = vx * normal.x + vy * normal.y;
      const rx = vx - 2 * dot * normal.x;
      const ry = vy - 2 * dot * normal.y;
      this.angle = Math.atan2(ry, rx);
      this.recentHits.clear();
      if (world) FX.wall(world, this.x, this.y);
    } else {
      if (world) FX.wall(world, this.x, this.y);
      this.destroy();
    }
  }

  destroy() {
    if (!this.alive) return;
    // 实体化拦截：若还有实体化层数且尚未进入实体态 → 转为实体（不真销毁、不触发 Destroyed）
    if (this.entityLayers > 0 && !this.isEntity) {
      this.isEntity = true;
      this.recentHits.clear();
      // 实体状态下不再有"待销毁的子弹"语义，清掉拖尾视觉
      this.trail.length = 0;
      Events.emit('bulletEntity', this);
      return;
    }
    this.triggerHooks(Phase.Destroyed, { world: this._world });
    this.alive = false;
  }

  draw(ctx) {
    if (!this.alive) return;
    // 敌方子弹：红色；蝙蝠子弹：紫黑；玩家弹：黄色；奥弹：紫色
    const color = this._batBullet ? '#5a1f7a'
                : this.team === 'enemy' ? '#ff5050'
                : this.isArcane ? '#c97aff'
                : '#ffd84a';
    // 拖尾：从最旧到次新，圆点逐渐变淡变小（juice）
    const n = this.trail.length;
    if (n > 1) {
      ctx.save();
      for (let i = 0; i < n - 1; i++) {
        const t = (i + 1) / n;            // 0..1
        const tp = this.trail[i];
        ctx.globalAlpha = t * 0.55;
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 6 * t;
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, this.radius * (0.4 + 0.5 * t), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();
    // 蝙蝠子弹：紫黑球 + 🦇 emoji 居中标识（无碰撞影响，纯视觉）
    if (this._batBullet) {
      ctx.shadowBlur = 0;
      // 内部更深紫黑核心，强化"暗影"感
      ctx.fillStyle = '#280838';
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 0.55, 0, Math.PI * 2);
      ctx.fill();
      // 🦇 emoji
      ctx.font = (this.radius * 1.5).toFixed(0) + 'px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🦇', 0, 0.5);
    }
    // 实体化状态：外圈描边 + 内部"图钉"十字暗示固定
    if (this.isEntity) {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#7eb1ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 3, 0, Math.PI * 2);
      ctx.stroke();
      // 脉动指示"等待回合"
      const tt = performance.now() / 1000;
      const pulse = 0.6 + Math.sin(tt * 4) * 0.4;
      ctx.globalAlpha = pulse * 0.5;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // 实体装饰（视觉，无碰撞）：每张实体卡都可以加一个，叠加显示
    if (this.entityLayersMax > 0 && this._entityDecos && this._entityDecos.length > 0) {
      _drawEntityDecos(ctx, this);
    }
    ctx.restore();
    // 实体化层数血条（与敌人 HP bar 同款）—— 仅在有层数时显示
    if (this.entityLayersMax > 0) {
      ctx.save();
      const bw = Math.max(20, this.radius * 2.5);
      const bh = 4;
      const bx = this.x - bw / 2;
      const by = this.y - this.radius - 10;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = this.isEntity ? '#5bd45b' : '#7eb1ff';
      const frac = Math.max(0, Math.min(1, this.entityLayers / this.entityLayersMax));
      ctx.fillRect(bx, by, bw * frac, bh);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, bw, bh);
      // 层数文字（小号字体）
      ctx.fillStyle = '#f1f4f8';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.entityLayers + ' / ' + this.entityLayersMax, this.x, by - 5);
      ctx.restore();
    }
  }
}

// 实体装饰渲染（视觉，无碰撞）：每张实体卡片往 bullet._entityDecos push 一种标识，
// 同种叠加 → 并排显示（2 剑士 = 两把剑、2 蝙蝠 = 上下两对翅膀），不同种叠加 → 一起显示
function _drawEntityDecos(ctx, bullet) {
  const t = performance.now() / 1000;
  const r = bullet.radius;
  // 按 kind 分组：同种装饰一起绘制，便于"两把剑"这种并排排列
  const grouped = {};
  for (const k of bullet._entityDecos) grouped[k] = (grouped[k] || 0) + 1;

  // 🗡 剑：球顶展开成扇形（1 把 = 居中，N 把 = 等角扇形排开）
  const swords = grouped.sword || 0;
  if (swords > 0) {
    const baseFont = Math.max(14, Math.min(24, r * 1.4));   // 字号也随球大小放大
    const dist = r + 6;
    const spread = swords > 1 ? Math.min(Math.PI * 0.6, 0.35 * swords) : 0;
    for (let i = 0; i < swords; i++) {
      const a = -Math.PI / 2 + (i - (swords - 1) / 2) * (spread / Math.max(1, swords - 1));
      const sway = Math.sin(t * 3 + i * 0.9) * 3;
      const px = Math.cos(a) * dist;
      const py = Math.sin(a) * dist + sway;
      ctx.save();
      ctx.font = baseFont + 'px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 4;
      ctx.fillText('🗡', px, py);
      ctx.restore();
    }
  }

  // 🪽 翅膀：左右一对；N 对 → 上下错开堆叠（错位 5px / 对）
  const wings = grouped.wings || 0;
  for (let i = 0; i < wings; i++) {
    const offsetY = (i - (wings - 1) / 2) * 5;
    const flap = (Math.sin(t * 9 + i * 0.6) + 1) * 0.5;
    const wingW = Math.max(12, r * 0.9), wingH = 10 + flap * 5;
    ctx.save();
    ctx.fillStyle = '#a86bd0';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1.2;
    // 左翅
    ctx.beginPath();
    ctx.moveTo(-r + 1, offsetY);
    ctx.lineTo(-r - wingW, -wingH + offsetY);
    ctx.lineTo(-r - 4, wingH * 0.4 + offsetY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // 右翅（镜像）
    ctx.beginPath();
    ctx.moveTo(r - 1, offsetY);
    ctx.lineTo(r + wingW, -wingH + offsetY);
    ctx.lineTo(r + 4, wingH * 0.4 + offsetY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

// ─── 3. Enemy + 20 种敌人类型 + Intent 系统 ──────────────────────────
// 杀戮尖塔式 intent：每个敌人有"下一回合行动"显示，右下角图标 + 倒计时数字
// 鼠标悬浮显示详情

const INTENT_ICON = {
  melee:       '🗡',  // 接触 / 近战
  ranged:      '🏹',  // 远程射击
  sniper:      '🎯',  // 高伤狙击
  rangedMulti: '🏹',  // 多发弹幕
  aoe:         '💢',  // AOE 攻击
  rush:        '👟',  // 冲刺
  summon:      '👥',  // 召唤
  buff:        '⬆',  // 增益友军
  buffall:     '📢',  // 全体增益
  heal:        '➕',  // 治疗
  selfbuff:    '⚔',  // 自我增益
  selfdest:    '💥',  // 倒计时自爆
  debuff:      '⬇',  // 削弱玩家
  shield:      '🛡',  // 自带护盾
};

// 20 种敌人类型注册表（移速整体 +30~50% 提升节奏）
// value = 波次系统的"价值费用"，用于背包问题填充，不显示给玩家
// icon = 预告 / HUD 显示的 emoji
const ENEMY_TYPES = {
  // —— 早期敌人（Tier 1）——
  goblin:    { name: '哥布林',   icon: '👹', maxHp: 8,  attack: 1, speed: 90, radius: 16, color: '#7a8a4a', shape: 'circle', xpReward: 2, value: 3,
               intents: [{ kind: 'melee', icon: '🗡', cooldown: 0, desc: '接触造成 1 伤害，自爆' }] },
  archer:    { name: '弓箭手',   icon: '🏹', maxHp: 3,  attack: 0, speed: 40, radius: 14, color: '#a08060', shape: 'triangle', xpReward: 3, value: 5,
               intents: [{ kind: 'ranged', icon: '🏹', cooldown: 2, value: 2, desc: '2 回合后射 1 颗弹（2 伤）' }] },
  flier:     { name: '飞行兵',   icon: '🦇', maxHp: 5,  attack: 1, speed: 130, radius: 12, color: '#4adcd0', shape: 'triangle', xpReward: 3, value: 4, flies: true,
               intents: [{ kind: 'melee', icon: '🗡', cooldown: 0, desc: '飞行接触 1 伤' }] },
  rusher:    { name: '突击兵',   icon: '💨', maxHp: 7,  attack: 2, speed: 180, radius: 13, color: '#ff5050', shape: 'circle', xpReward: 4, value: 5,
               intents: [{ kind: 'rush', icon: '👟', cooldown: 0, desc: '高速冲刺 2 伤撞击' }] },

  // —— 中期敌人（Tier 2）——
  sniper:    { name: '狙击手',   icon: '🎯', maxHp: 10, attack: 0, speed: 12, radius: 16, color: '#604070', shape: 'triangle', xpReward: 6, value: 7,
               intents: [{ kind: 'sniper', icon: '🎯', cooldown: 3, value: 5, desc: '3 回合后高伤射击（5 伤）' }] },
  bouncer:   { name: '弹射射手', icon: '⚪', maxHp: 9, attack: 0, speed: 45, radius: 15, color: '#80d0d0', shape: 'circle', xpReward: 5, value: 6,
               intents: [{ kind: 'ranged', icon: '🏹', cooldown: 2, value: 1, bound: 3, desc: '2 回合后射弹射弹（弹 3）' }] },
  tracker:   { name: '追踪兵',   icon: '🎯', maxHp: 9, attack: 0, speed: 45, radius: 15, color: '#80a0d0', shape: 'circle', xpReward: 5, value: 6,
               intents: [{ kind: 'ranged', icon: '🎯', cooldown: 2, value: 1, tracking: true, desc: '2 回合后射追踪弹' }] },
  healer:    { name: '治疗师',   icon: '💚', maxHp: 10, attack: 0, speed: 40, radius: 15, color: '#60c060', shape: 'circle', xpReward: 5, value: 6,
               intents: [{ kind: 'heal', icon: '➕', cooldown: 2, value: 3, desc: '2 回合后治疗最近敌人 +3 HP' }] },
  bomber:    { name: '自爆球',   icon: '💣', maxHp: 4, attack: 6, speed: 100, radius: 14, color: '#ffa040', shape: 'circle', xpReward: 4, value: 5,
               intents: [{ kind: 'selfdest', icon: '💥', cooldown: 3, desc: '3 回合后自爆 6 伤 AOE' }] },
  spammer:   { name: '弹幕兵',   icon: '🌌', maxHp: 9, attack: 0, speed: 45, radius: 15, color: '#8080c0', shape: 'circle', xpReward: 6, value: 7,
               intents: [{ kind: 'rangedMulti', icon: '🏹', cooldown: 3, value: 1, count: 3, desc: '3 回合后 3 颗扇形弹（1 伤×3）' }] },

  // —— 后期敌人（Tier 3）——
  summoner:  { name: '召唤师',   icon: '👻', maxHp: 12, attack: 0, speed: 0, radius: 18, color: '#702070', shape: 'rect', xpReward: 8, value: 9,
               intents: [{ kind: 'summon', icon: '👥', cooldown: 3, spawn: 'goblin', desc: '3 回合后召唤 1 哥布林' }] },
  buffer:    { name: '指挥官',   icon: '👑', maxHp: 11, attack: 1, speed: 45, radius: 16, color: '#c08000', shape: 'rect', xpReward: 7, value: 7,
               intents: [{ kind: 'buff', icon: '⬆', cooldown: 2, value: 1, desc: '2 回合后友军 +1 攻击' }] },
  tank:      { name: '重甲兵',   icon: '🛡', maxHp: 25, attack: 3, speed: 35, radius: 22, color: '#444444', shape: 'circle', xpReward: 9, value: 12,
               intents: [{ kind: 'melee', icon: '🗡', cooldown: 0, desc: '接触造成 3 伤' }] },
  mage:      { name: '法师',     icon: '🔮', maxHp: 8, attack: 0, speed: 28, radius: 15, color: '#a05ec0', shape: 'circle', xpReward: 7, value: 8,
               intents: [{ kind: 'aoe', icon: '💢', cooldown: 3, value: 3, desc: '3 回合后 AOE 法术 3 伤' }] },
  berserker: { name: '狂战士',   icon: '⚔', maxHp: 14, attack: 2, speed: 100, radius: 17, color: '#d04040', shape: 'circle', xpReward: 7, value: 9,
               intents: [
                 { kind: 'selfbuff', icon: '⚔', cooldown: 1, value: 1, desc: '1 回合后 +1 攻击（叠加）' },
                 { kind: 'melee', icon: '🗡', cooldown: 0, desc: '接触造成伤害' },
               ] },
  splitter:  { name: '分裂者',   icon: '✂', maxHp: 12, attack: 0, speed: 55, radius: 18, color: '#80c080', shape: 'circle', xpReward: 6, value: 6, onDeath: 'split',
               intents: [{ kind: 'melee', icon: '🗡', cooldown: 0, desc: '接触 / 死亡分裂 2 个小型' }] },

  // —— 精英 / 杂项 ——
  slug:      { name: '慢虫',     icon: '🐌', maxHp: 25, attack: 1, speed: 15, radius: 20, color: '#a08040', shape: 'rect', xpReward: 6, value: 8,
               intents: [{ kind: 'melee', icon: '🗡', cooldown: 0, desc: '缓慢推进接触' }] },
  shrieker:  { name: '尖叫者',   icon: '📢', maxHp: 7,  attack: 0, speed: 40, radius: 15, color: '#c0a040', shape: 'circle', xpReward: 5, value: 5,
               intents: [{ kind: 'buffall', icon: '📢', cooldown: 3, value: 3, desc: '3 回合后全敌人 +3 最大 HP' }] },
  slower:    { name: '时空法师', icon: '⏳', maxHp: 11, attack: 0, speed: 45, radius: 16, color: '#6080c0', shape: 'circle', xpReward: 6, value: 6,
               intents: [{ kind: 'debuff', icon: '⬇', cooldown: 2, desc: '2 回合后抽走玩家 1 法力' }] },
  boss:      { name: '深渊魔王', icon: '👺', maxHp: 55, attack: 4, speed: 35, radius: 28, color: '#400040', shape: 'circle', xpReward: 20, value: 25,
               intents: [
                 { kind: 'ranged', icon: '🏹', cooldown: 1, value: 3, desc: '1 回合后射 3 伤弹' },
                 { kind: 'summon', icon: '👥', cooldown: 2, spawn: 'goblin', desc: '2 回合后召唤哥布林' },
                 { kind: 'aoe', icon: '💢', cooldown: 2, value: 5, desc: '2 回合后 AOE 5 伤' },
               ] },
  // 奖励金球：场上无敌人时投放；不死、不能 kill、被击中爆金币（斐波那契递减）
  // 颜色从深黄起（tier 0），每掉一次金币往白偏移；tier ≥ 10 → 纯白
  reward:    { name: '金球', icon: '💰', maxHp: 999, attack: 0, speed: 0, radius: 36, color: '#c08000', shape: 'circle', xpReward: 0, value: 0, _isReward: true,
               intents: [{ kind: 'melee', icon: '💰', cooldown: 0, desc: '奖励目标。击中获得金币（每阶段伤害门槛 +斐波那契；颜色由深黄变白）' }] },
};

// 敌人 / 召唤物名称 + intent 描述的中英文翻译。intents_en 按 intent 顺序排列。
const ENEMY_TR = {
  goblin:    { name_en: 'Goblin',       intents_en: ['Contact for 1 dmg, self-destructs'] },
  archer:    { name_en: 'Archer',       intents_en: ['Fires 1 shot (2 dmg) in 2 turns'] },
  flier:     { name_en: 'Flier',        intents_en: ['Flying contact for 1 dmg'] },
  rusher:    { name_en: 'Rusher',       intents_en: ['Fast dash, 2 dmg on contact'] },
  sniper:    { name_en: 'Sniper',       intents_en: ['Heavy shot in 3 turns (5 dmg)'] },
  bouncer:   { name_en: 'Bouncer',      intents_en: ['Fires a bouncing shot in 2 turns (Bounce 3)'] },
  tracker:   { name_en: 'Tracker',      intents_en: ['Fires a tracking shot in 2 turns'] },
  healer:    { name_en: 'Healer',       intents_en: ['Heals nearest enemy +3 HP in 2 turns'] },
  bomber:    { name_en: 'Bomber',       intents_en: ['Self-destructs for 6 AOE in 3 turns'] },
  spammer:   { name_en: 'Spammer',      intents_en: ['Fires a 3-shot fan in 3 turns (1 dmg × 3)'] },
  summoner:  { name_en: 'Summoner',     intents_en: ['Summons 1 Goblin in 3 turns'] },
  buffer:    { name_en: 'Commander',    intents_en: ['Allies gain +1 ATK in 2 turns'] },
  tank:      { name_en: 'Heavy',        intents_en: ['Contact for 3 dmg'] },
  mage:      { name_en: 'Mage',         intents_en: ['AOE spell 3 dmg in 3 turns'] },
  berserker: { name_en: 'Berserker',    intents_en: ['Self +1 ATK (stacking) in 1 turn', 'Contact damage'] },
  splitter:  { name_en: 'Splitter',     intents_en: ['Contact / on death splits into 2 small'] },
  slug:      { name_en: 'Slug',         intents_en: ['Slow advance, contact damage'] },
  shrieker:  { name_en: 'Shrieker',     intents_en: ['All enemies +3 max HP in 3 turns'] },
  slower:    { name_en: 'Chronomancer', intents_en: ['Drain 1 player mana in 2 turns'] },
  boss:      { name_en: 'Abyss Lord',   intents_en: ['Fires a 3-dmg shot in 1 turn', 'Summons a Goblin in 2 turns', 'AOE 5 dmg in 2 turns'] },
  reward:    { name_en: 'Gold Orb',     intents_en: ['Reward target. Hit it for gold (per-stage damage threshold + Fibonacci; color brightens from dark gold to white).'] },
};

// 按 shopLevel 决定可 spawn 的敌人池
const SPAWN_POOL = {
  1: ['goblin', 'archer', 'flier'],
  2: ['goblin', 'archer', 'flier', 'rusher', 'bouncer'],
  3: ['archer', 'flier', 'rusher', 'sniper', 'bouncer', 'healer'],
  4: ['rusher', 'sniper', 'bouncer', 'tracker', 'healer', 'bomber', 'spammer', 'summoner'],
  5: ['sniper', 'tracker', 'healer', 'bomber', 'spammer', 'summoner', 'buffer', 'mage', 'shrieker'],
  6: ['spammer', 'summoner', 'buffer', 'mage', 'shrieker', 'berserker', 'splitter', 'slower'],
  7: ['summoner', 'buffer', 'tank', 'mage', 'berserker', 'splitter', 'slug', 'slower'],
  8: ['tank', 'berserker', 'splitter', 'slug', 'slower', 'boss'],
};

let _enemyId = 0;
class Enemy {
  constructor(x, y, typeKey = 'goblin', world = null) {
    this.id = ++_enemyId;
    this.x = x; this.y = y;
    this.typeKey = typeKey;
    const type = ENEMY_TYPES[typeKey] || ENEMY_TYPES.goblin;
    this.type = type;
    // HP 不随 player level 缩放：等级只影响波次价值（敌人数量）+ XP 阈值，不动敌人体魄
    this.maxHp = type.maxHp;
    this.hp = this.maxHp;
    this.attack = type.attack ?? 0;
    this.speed = type.speed ?? 30;       // 0 是合法值（金球不动），用 ?? 不用 ||
    this.radius = type.radius ?? 18;
    this.color = type.color || '#c44a4a';
    this.shape = type.shape || 'circle';
    this.flies = !!type.flies;
    this.xpReward = type.xpReward || 2;
    this.onDeath = type.onDeath || null;
    // Intent state
    this.intents = type.intents || [{ kind: 'melee', icon: '🗡', cooldown: 0, desc: '接触自爆' }];
    this.intentIdx = 0;
    this.intentCd = this.intents[0].cooldown;
    // 通用
    this.alive = true;
    this.knockback = { x: 0, y: 0, t: 0 };
    this.hitFlash = 0;
    // 受击挤压：被打时短暂放大 → 平滑回弹（juice：增强打击感）
    this.hitScale = 1;
    this.killedByPlayer = false;
    // 火焰流派 debuff：层数 — 敌方回合开始前结算 (damage = stacks, then stacks-1)
    this.fire = 0;
    // 奖励金球标记（不死、爆金币）
    this._isReward = !!type._isReward;
    // 出场 portal：0.3s 紫色螺旋开场期间不可命中 / 不动 / intent 不递减
    this.spawnT = 0.3;
  }

  takeDamage(amount) {
    if (!this.alive) return false;
    // 奖励金球：不掉血、不死；斐波那契递减金币（GoldOrb 飞向金币条）
    if (this._isReward) {
      this.hitFlash = 0.15;
      const w = window.__game;
      if (w) {
        // 斐波那契金币阈值：每累计 n 点伤害掉 1 金币；n = 5, 8, 13, 21, 34, 55, 89, ...
        // 维护一对 fib 状态（a = 当前阈值，b = 下一阈值）；越打越贵，硬币递减。
        if (this._goldFibA == null) {
          this._goldFibA = 5;
          this._goldFibB = 8;
          this._dmgSinceLastCoin = 0;
          this._goldTier = 0;     // 已经掉过几次金币（阶段计数）
        }
        this._totalDamageTaken = (this._totalDamageTaken || 0) + amount;
        this._dmgSinceLastCoin += amount;
        let coins = 0;
        while (this._dmgSinceLastCoin >= this._goldFibA) {
          this._dmgSinceLastCoin -= this._goldFibA;
          coins++;
          const next = this._goldFibA + this._goldFibB;
          this._goldFibA = this._goldFibB;
          this._goldFibB = next;
        }
        if (coins > 0) {
          this._goldTier += coins;
          // 颜色随阶段从深黄渐变到纯白：tier 0 = 深黄 (#c08000)，tier 10+ = 纯白
          // 用线性插值 mix = clamp(tier / 10, 0, 1)
          const mix = Math.min(1, this._goldTier / 10);
          const r = Math.round(192 + (255 - 192) * mix);
          const g = Math.round(128 + (255 - 128) * mix);
          const b = Math.round(0   + (255 - 0)   * mix);
          this.color = `rgb(${r}, ${g}, ${b})`;
        }
        // 每个币 = 1 金币（独立金球散落 → 飞向金币 HUD）
        for (let i = 0; i < coins; i++) {
          w.particles.push(new GoldOrb(w, this.x, this.y, 1));
        }
        // 命中震荡（橙色火星，无论是否掉金都给反馈）
        for (let i = 0; i < 4; i++) {
          const a = Math.PI * 2 * Math.random();
          const sp = 60 + Math.random() * 60;
          w.particles.push(new Particle({
            x: this.x, y: this.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30,
            life: 0.28, color: '#ffae00', size: 2.5,
          }));
        }
      }
      return true;     // damage 被吸收（不算 dealt）
    }
    const oldHp = this.hp;
    this.hp -= amount;
    this.hitFlash = 0.15;
    this.knockback.t = 0.1;
    // 挤压：被打时刻立即放大；伤害越高放大越大（≤0 也轻微弹一下，作为打击感反馈）
    const punch = 1 + clamp(0.08 + amount * 0.04, 0.05, 0.45);
    if (punch > this.hitScale) this.hitScale = punch;
    // 重击 chromatic aberration：单次伤害 ≥10 触发 canvas RGB 分离
    if (amount >= 10) {
      const w = window.__game;
      if (w) w.chromaT = Math.max(w.chromaT || 0, 0.18);
    }
    if (this.hp <= 0) {
      // 溢出杀：amount > 死前 HP × 2 → enemyDied 走"强化死亡"分支
      if (amount > oldHp * 2) this._overkill = true;
      // 死亡前立刻结算身上的火焰伤害（给玩家奖励：金币 + 火焰特效）
      if (this.fire > 0) {
        const w = window.__game;
        if (w) {
          const fireBonus = this.fire;
          w.gold += fireBonus;
          Events.emit('goldChanged', w.gold);
          FX.damage(w, this.x, this.y - this.radius - 4, fireBonus);
          // 火焰爆裂特效
          for (let i = 0; i < 6 + fireBonus; i++) {
            const a = Math.PI * 2 * Math.random();
            const sp = 80 + Math.random() * 120;
            w.particles.push(new Particle({
              x: this.x, y: this.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
              life: 0.5, color: '#ff7030', size: 3,
            }));
          }
          w.particles.push(new FireText(this.x, this.y - this.radius - 18, '🔥+' + fireBonus + '💰'));
        }
        this.fire = 0;
      }
      this.alive = false;
      this.killedByPlayer = true;
      Events.emit('enemyDied', this);
    }
    return true;
  }

  // 通用击退：source 到 self 方向，按 force 推动 + 短暂减速
  // 调用前已确认存活；力度由调用方按伤害换算（打击感：小但明显）
  applyKnockback(srcX, srcY, force) {
    if (!this.alive) return;
    let dx = this.x - srcX;
    let dy = this.y - srcY;
    let d = Math.hypot(dx, dy);
    // src 和 self 重叠时随机选个方向，避免 NaN
    if (d < 0.01) {
      const a = Math.random() * Math.PI * 2;
      dx = Math.cos(a); dy = Math.sin(a); d = 1;
    }
    const px = (dx / d) * force;
    const py = (dy / d) * force;
    // 立即位移（视觉冲击）+ 设减速窗口（移动 *0.2 持续 ~0.18s）
    this.x += px;
    this.y += py;
    this.knockback.t = Math.max(this.knockback.t, 0.18);
  }

  selfDestruct(target, world) {
    target.takeDamage(this.attack);
    this.alive = false;
    this.killedByPlayer = false;
    if (world) FX.explode(world, this.x, this.y);
  }

  // 敌方回合开始时调用：倒计时 - 1，到 0 触发意图，然后切换到下一个意图
  onTurnStart(world) {
    if (!this.alive) return;
    if (this.spawnT > 0) return;       // 出场期间不递减 intent
    const intent = this.intents[this.intentIdx];
    // melee/rush 类型：cooldown 0 表示一直生效（移动阶段触发），不需要倒计时
    if (intent.cooldown === 0) return;
    this.intentCd--;
    if (this.intentCd <= 0) {
      executeIntent(world, this, intent);
      // 切换到下一个意图（cycle）
      this.intentIdx = (this.intentIdx + 1) % this.intents.length;
      this.intentCd = this.intents[this.intentIdx].cooldown;
    }
  }

  update(dt, world) {
    if (!this.alive) return;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    // 受击挤压：弹簧式回弹（指数衰减回 1）
    if (Math.abs(this.hitScale - 1) > 0.001) {
      this.hitScale += (1 - this.hitScale) * Math.min(1, dt * 12);
    } else {
      this.hitScale = 1;
    }
    // 出场 portal：冻结所有移动 / intent / 碰撞，仅倒计 spawnT
    if (this.spawnT > 0) {
      this.spawnT = Math.max(0, this.spawnT - dt);
      return;
    }
    // 奖励金球：彻底不动（任何状态、任何阶段）
    if (this._isReward) return;
    // 玩家回合：怪物冻结
    if (world.battle.turn !== 'enemy') return;
    // 我方阶段（实体效果播放中）：怪物也冻结，等阶段 1 结束才能动
    if (world.battle._enemyPhasePending) return;

    const intent = this.intents[this.intentIdx];
    const isMelee = intent.kind === 'melee' || intent.kind === 'rush';

    // 移动：朝最近 ally 推进（除狙击塔等 speed=0 不动）
    if (this.speed > 0) {
      const target = nearestAlly(world, this);
      const dx = target.x - this.x, dy = target.y - this.y;
      const dist = Math.hypot(dx, dy);
      let mv = this.speed;
      if (this.knockback.t > 0) { mv *= 0.2; this.knockback.t -= dt; }
      let vx = 0, vy = 0;
      if (dist > 1) {
        vx = (dx / dist) * mv;
        vy = (dy / dist) * mv;
      }
      // 同类排斥
      for (const other of world.enemies) {
        if (other === this || !other.alive) continue;
        const odx = this.x - other.x, ody = this.y - other.y;
        const od = Math.hypot(odx, ody);
        const minD = this.radius + other.radius;
        if (od < minD && od > 0.01) {
          const push = (minD - od) / minD * mv * 0.8;
          vx += (odx / od) * push;
          vy += (ody / od) * push;
        }
      }
      this.x += vx * dt;
      this.y += vy * dt;
      // 梯形内活动
      const tb = trapBounds(world, this.y);
      if (this.x < tb.leftX + this.radius)  this.x = tb.leftX + this.radius;
      if (this.x > tb.rightX - this.radius) this.x = tb.rightX - this.radius;
      // melee 接触 → 自爆扣血（奖励金球不自爆）
      if (isMelee && dist < this.radius + target.radius && !this._isReward) {
        this.selfDestruct(target, world);
      }
    }
  }

  // 出场 portal：紫色螺旋 + 旋转锯齿环 + 中心逐渐浓的紫色光晕
  _drawSpawnPortal(ctx) {
    const t = 1 - (this.spawnT / 0.3);   // 0 → 1
    const tt = performance.now() / 1000;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.strokeStyle = '#c97aff';
    ctx.shadowColor = '#a86bd0';
    ctx.shadowBlur = 14;
    ctx.lineWidth = 2;
    // 3 个错相位的脉冲扩张环
    for (let i = 0; i < 3; i++) {
      const phase = (tt * 3 + i * 0.4) % 1;
      const r = this.radius * (0.3 + phase * 1.2);
      ctx.globalAlpha = (1 - phase) * 0.8;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    // 中心逐渐浓的紫色光晕，到 t=1 ≈ 敌人本体大小
    ctx.globalAlpha = t * 0.9;
    ctx.fillStyle = '#7a3aa0';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius * t, 0, Math.PI * 2);
    ctx.fill();
    // 旋转锯齿环（"传送门"质感）
    ctx.globalAlpha = 0.7;
    ctx.shadowBlur = 0;
    ctx.rotate(tt * 5);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r1 = this.radius * 0.7;
      const r2 = this.radius * 1.0;
      ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.lineTo(Math.cos(a + 0.2) * r2, Math.sin(a + 0.2) * r2);
    }
    ctx.stroke();
    ctx.restore();
  }

  // 死亡时的特殊效果（如分裂）
  onDie(world) {
    if (this.onDeath === 'split') {
      // 分裂 2 个小型哥布林
      for (let i = 0; i < 2; i++) {
        const e = new Enemy(this.x + rand(-20, 20), this.y + rand(-20, 20), 'goblin', world);
        e.maxHp = Math.max(1, Math.floor(this.maxHp * 0.4));
        e.hp = e.maxHp;
        world.enemies.push(e);
      }
    }
  }

  draw(ctx) {
    if (!this.alive) return;
    // 出场 portal：紫色螺旋（不画本体）—— spawnT 0.3 → 0 期间生效
    if (this.spawnT > 0) {
      this._drawSpawnPortal(ctx);
      return;
    }
    ctx.save();
    ctx.translate(this.x, this.y);
    // 受击挤压：竖压横扁（卡通"被打"感）；hitScale=1 时无变化
    if (this.hitScale !== 1) {
      const s = this.hitScale;
      // s>1 横向伸 + 竖向压（≈ 卡通 squash & stretch）
      const sx = 1 + (s - 1) * 0.6;
      const sy = 1 - (s - 1) * 0.6;
      ctx.scale(sx, sy);
    }
    // 火焰 debuff：橙色脉冲光环
    if (this.fire > 0) {
      const t = performance.now() / 1000;
      const pulse = 0.7 + Math.sin(t * 6) * 0.3;
      ctx.save();
      ctx.globalAlpha = 0.45 * pulse;
      ctx.fillStyle = '#ff7030';
      ctx.shadowColor = '#ffae00';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 4 + Math.sin(t * 8) * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    const flash = this.hitFlash > 0;
    const color = flash ? '#ffffff' : this.color;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    ctx.fillStyle = color;
    if (this.shape === 'triangle') {
      ctx.beginPath();
      ctx.moveTo(0, -this.radius);
      ctx.lineTo(-this.radius * 0.95, this.radius * 0.7);
      ctx.lineTo(this.radius * 0.95, this.radius * 0.7);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else if (this.shape === 'rect') {
      ctx.fillRect(-this.radius, -this.radius, this.radius * 2, this.radius * 2);
      ctx.strokeRect(-this.radius, -this.radius, this.radius * 2, this.radius * 2);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
    // 简易眼睛
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-this.radius * 0.32, -this.radius * 0.18, 2.5, 0, Math.PI * 2);
    ctx.arc(this.radius * 0.32, -this.radius * 0.18, 2.5, 0, Math.PI * 2);
    ctx.fill();
    // HP bar
    const bw = this.radius * 2;
    ctx.fillStyle = '#000a';
    ctx.fillRect(-bw / 2, -this.radius - 10, bw, 4);
    ctx.fillStyle = '#5bd45b';
    ctx.fillRect(-bw / 2, -this.radius - 10, bw * (this.hp / this.maxHp), 4);
    // Intent 角标（右下）
    this._drawIntentBadge(ctx);
    // 火焰层数显示（头顶）
    if (this.fire > 0) {
      ctx.fillStyle = '#ff7030';
      ctx.shadowColor = '#ffae00';
      ctx.shadowBlur = 6;
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🔥' + this.fire, 0, -this.radius - 22);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  _drawIntentBadge(ctx) {
    if (this.intents.length === 0) return;
    const intent = this.intents[this.intentIdx];
    // melee/rush 类型：cooldown 0 表示一直生效，只显示图标无倒计时数字
    const isInstant = intent.cooldown === 0;
    const cd = this.intentCd;
    // 角标在右下
    const bx = this.radius + 2;
    const by = this.radius + 2;
    ctx.save();
    ctx.translate(bx, by);
    // 圆形背景
    ctx.fillStyle = 'rgba(15, 18, 24, 0.92)';
    ctx.strokeStyle = '#ffa64a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // 图标 + 数字（左右排）
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (isInstant) {
      // 只显示图标
      ctx.fillStyle = '#fff';
      ctx.fillText(intent.icon || '?', 0, 1);
    } else {
      ctx.fillStyle = '#fff';
      ctx.fillText(intent.icon || '?', -4, 1);
      ctx.fillStyle = '#ffd84a';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(String(cd), 5, 1);
    }
    ctx.restore();
  }
}

// 缩略图渲染：与 Enemy.draw 形状/颜色一致，用于波次预告等 UI
function drawEnemyMini(ctx, def, cx, cy, radius) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = def.color;
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 2;
  if (def.shape === 'triangle') {
    ctx.beginPath();
    ctx.moveTo(0, -radius);
    ctx.lineTo(-radius * 0.95, radius * 0.7);
    ctx.lineTo(radius * 0.95, radius * 0.7);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  } else if (def.shape === 'rect') {
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
    ctx.strokeRect(-radius, -radius, radius * 2, radius * 2);
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  }
  // 简易眼睛
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(-radius * 0.32, -radius * 0.18, Math.max(1.6, radius * 0.12), 0, Math.PI * 2);
  ctx.arc(radius * 0.32, -radius * 0.18, Math.max(1.6, radius * 0.12), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// 执行敌人意图（敌方回合开始时倒计时归 0 触发）
function executeIntent(world, enemy, intent) {
  const k = intent.kind;
  if (k === 'ranged' || k === 'sniper') {
    spawnEnemyBullet(world, enemy, {
      attack: intent.value || 2,
      bound: intent.bound || 0,
      tracking: !!intent.tracking,
      speed: k === 'sniper' ? 520 : 360,
    });
  } else if (k === 'rangedMulti') {
    const n = intent.count || 3;
    const spread = Math.PI / 6;
    const target = nearestAlly(world, enemy);
    const baseA = angleBetween(enemy.x, enemy.y, target.x, target.y);
    for (let i = 0; i < n; i++) {
      const a = baseA + (i - (n - 1) / 2) * (spread / Math.max(1, n - 1));
      spawnEnemyBullet(world, enemy, {
        attack: intent.value || 1,
        bound: 0,
        angle: a,
        speed: 360,
      });
    }
  } else if (k === 'aoe') {
    // AOE 落在最近 ally 位置；范围 = 法师体积 × mult（mage 越大圈越大）
    const target = nearestAlly(world, enemy);
    if (!target) return;
    setTimeout(() => {
      applyAoe(world, enemy, {
        cx: target.x, cy: target.y,
        damage: intent.value || 3, mult: AOE_MULT.mageAoe,
        target: 'allies',
      });
    }, 200);
  } else if (k === 'summon') {
    // 召唤友军（敌方）— spawn 在敌人附近
    const e = new Enemy(enemy.x + rand(-30, 30), Math.max(40, enemy.y - 20), intent.spawn || 'goblin', world);
    world.enemies.push(e);
  } else if (k === 'heal') {
    // 治疗最近敌人
    let best = null, minD = Infinity;
    for (const o of world.enemies) {
      if (o === enemy || !o.alive) continue;
      const d = Math.hypot(o.x - enemy.x, o.y - enemy.y);
      if (d < minD) { minD = d; best = o; }
    }
    if (!best) best = enemy;   // 没别人就治自己
    best.hp = Math.min(best.maxHp, best.hp + (intent.value || 3));
    FX.hit(world, best.x, best.y);
  } else if (k === 'buff') {
    // 友军 +攻：范围 = buffer 体积 × mult（指挥官越大覆盖越广）
    const buffAmt = intent.value || 1;
    applyAoe(world, enemy, {
      damage: 0, mult: AOE_MULT.bufferAura,
      target: 'enemies', exclude: enemy, fx: false,
      onHit: (o) => {
        o.attack += buffAmt;
        // 绿色 "+N⚔" 飘字 + 小光晕环（让"敌人被加强"看得见）
        world.particles.push(new FloatingText(o.x, o.y - o.radius - 6, '+' + buffAmt + '⚔', {
          color: '#5bd45b', glow: '#9ae89a',
        }));
        world.particles.push(new Particle({
          x: o.x, y: o.y, life: 0.32, color: '#5bd45b', size: 14, type: 'ring',
        }));
      },
    });
  } else if (k === 'buffall') {
    // 全敌人 +HP
    for (const o of world.enemies) {
      if (!o.alive) continue;
      o.maxHp += (intent.value || 3);
      o.hp += (intent.value || 3);
    }
  } else if (k === 'selfbuff') {
    enemy.attack += (intent.value || 1);
  } else if (k === 'selfdest') {
    // 自爆：范围 = 敌人体积 × mult（bomber r14 ≈ 71；大体型敌人自爆自然更大）
    applyAoe(world, enemy, {
      damage: enemy.attack || 6, mult: AOE_MULT.selfDest,
      target: 'allies',
    });
    enemy.alive = false;
    enemy.killedByPlayer = false;
  } else if (k === 'debuff') {
    // 抽 1 法力
    world.player.mana = Math.max(0, world.player.mana - 1);
  }
}

// 敌人射出敌方子弹（targets ally team）
function spawnEnemyBullet(world, enemy, opts = {}) {
  const target = nearestAlly(world, enemy);
  const angle = opts.angle != null ? opts.angle : angleBetween(enemy.x, enemy.y, target.x, target.y);
  const bullet = new Bullet({
    x: enemy.x, y: enemy.y, angle,
    speed: opts.speed || 360, lifetime: 4,
    attack: opts.attack || 1, bound: opts.bound || 0, penetrate: 0,
    bulletCount: 1, waveCount: 1, radius: 5,
  });
  bullet.team = 'enemy';      // 关键：标记为敌方，子弹会命中 ally 而非 enemy
  bullet.tracking = !!opts.tracking;
  bullet.trackRate = 4;
  bullet.activate(performance.now() / 1000);
  world.bullets.push(bullet);
}

// ─── 4. PlayerCannon ────────────────────────────────────────────────
class PlayerCannon {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.radius = 24;
    this.angle = -Math.PI / 2;     // 朝上
    this.targetAngle = this.angle;
    this.maxHp = 20;
    this.hp = 20;
    this.maxMana = 12;
    this.mana = 12;
    this.shield = 0;               // 护盾：可吸收 N 次伤害（按"次数"算，不看伤害量）
    this.armor = 3;                // 护甲：按"数值"抵挡伤害，玩家回合开始重置为 armorPerTurn
    this.armorPerTurn = 3;
    // 回合制：水晶仅在每个玩家回合开始时回满，不自动回复
    this.fireInterval = 0.5;
    this.actionCdEnds = 0;         // 共享动作冷却结束时间戳
    this.hitFlash = 0;
    // 出膛反冲：notifyFired 时拉满 → update 里随 dt 衰减；draw 时把整个炮台沿瞄准反方向位移
    this.recoilT = 0;
    this.recoilDur = 0.08;
  }

  setTarget(mx, my) {
    this.targetAngle = angleBetween(this.x, this.y, mx, my);
  }

  takeDamage(amount) {
    if (this.hp <= 0) return;
    const w = window.__game;
    // 护甲优先吸收：按数值扣减；护甲值同步消耗
    let armorBlocked = 0;
    if (this.armor > 0 && amount > 0) {
      armorBlocked = Math.min(this.armor, amount);
      this.armor -= armorBlocked;
      amount -= armorBlocked;
      Events.emit('armorChanged', this.armor);
    }
    // 护盾：吸收"一次伤害"，仅在仍有未抵挡的伤害时触发；记录被护盾吃掉的数值
    let shieldBlocked = 0;
    if (amount > 0 && this.shield > 0) {
      this.shield = Math.max(0, this.shield - 1);
      shieldBlocked = amount;
      amount = 0;
    }
    const totalBlocked = armorBlocked + shieldBlocked;
    this.hitFlash = 0.2;
    if (amount > 0) {
      // 仍有未挡住的伤害 → HP 扣减，弹出红/橙数字（amount）
      this.hp -= amount;
      if (w) {
        FX.damage(w, this.x, this.y - this.radius - 8, amount, totalBlocked);
        FX.shake(w, clamp(3 + amount * 0.8, 3, 10), 0.2);
        // 受击 vignette：屏幕四边红色脉冲，与 shake 叠加出"撞了一下"的实感
        w.damageFlash = Math.max(w.damageFlash || 0, clamp(0.4 + amount * 0.06, 0.4, 0.85));
      }
      if (this.hp <= 0) { this.hp = 0; Events.emit('playerDied'); }
    } else if (totalBlocked > 0) {
      // 全部被格挡 → 弹出蓝色 "🛡 N"（避免与 0 伤害"哑弹"混淆）
      if (w) {
        FX.damage(w, this.x, this.y - this.radius - 8, 0, totalBlocked);
        FX.shake(w, clamp(2 + totalBlocked * 0.3, 2, 5), 0.15);
      }
    } else {
      // 极端情形：amount=0 且 totalBlocked=0（理论上不应到这里），保持原行为
      if (w) FX.damage(w, this.x, this.y - this.radius - 8, 0, 0);
    }
  }

  canAct(now) { return now >= this.actionCdEnds; }
  notifyAction(now) { this.actionCdEnds = now + this.fireInterval; }
  getActionCdRemaining(now) { return Math.max(0, this.actionCdEnds - now); }

  spend(mana) {
    if (this.mana < mana) return false;
    this.mana -= mana;
    // 法力消耗特效：蓝色粒子从玩家炸开 + 「-N」文字在 mana bar
    const w = window.__game;
    if (w && mana > 0) {
      for (let i = 0; i < 4 + mana; i++) {
        const a = Math.PI * 2 * Math.random();
        const sp = 50 + Math.random() * 90;
        w.particles.push(new Particle({
          x: this.x, y: this.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30,
          life: 0.35, color: '#4a82d4', size: 2.5,
        }));
      }
      // -N 弹出在法力条 fill 的末端（蓝条末端，按消耗后剩余 mana 比例计算）
      const $bar = document.getElementById('mana-bar');
      const $track = $bar?.parentElement;
      if ($track) {
        const tr = $track.getBoundingClientRect();
        const frac = Math.max(0, Math.min(1, this.mana / this.maxMana));
        const x = tr.left + tr.width * frac;
        const y = tr.top + tr.height / 2 - 2;
        spawnHtmlFlash(x, y, '-' + mana, '#7eb1ff');
      }
    }
    return true;
  }

  update(dt) {
    // 平滑旋转
    let diff = this.targetAngle - this.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.angle += diff * Math.min(1, dt * 12);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.recoilT = Math.max(0, this.recoilT - dt);
  }

  // 每次发射调用：拉满 recoilT + spawn 黄色 muzzle flash + 4 颗朝炮口方向的火星
  notifyFired(world) {
    this.recoilT = this.recoilDur;
    if (!world) return;
    const muzzleX = this.x + Math.cos(this.angle) * (this.radius + 12);
    const muzzleY = this.y + Math.sin(this.angle) * (this.radius + 12);
    // 主体黄色闪光
    world.particles.push(new Particle({
      x: muzzleX, y: muzzleY, life: 0.12,
      color: '#ffd84a', size: 16, type: 'flash',
    }));
    // 朝炮口方向喷 4 颗火星
    for (let i = 0; i < 4; i++) {
      const a = this.angle + (Math.random() - 0.5) * 0.55;
      const sp = 200 + Math.random() * 140;
      world.particles.push(new Particle({
        x: muzzleX, y: muzzleY,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.22, color: '#ffd84a', size: 2.4,
      }));
    }
  }

  draw(ctx) {
    ctx.save();
    // 反冲：整个炮台沿瞄准反方向偏移 3px，60ms 内回归（按线性衰减）
    const recoilK = this.recoilDur > 0 ? (this.recoilT / this.recoilDur) : 0;
    const recoilOff = recoilK * 3;
    ctx.translate(
      this.x - Math.cos(this.angle) * recoilOff,
      this.y - Math.sin(this.angle) * recoilOff,
    );
    // 底座
    ctx.fillStyle = this.hitFlash > 0 ? '#fff' : '#4a6fa5';
    ctx.strokeStyle = '#2a4a78';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // 炮管
    ctx.rotate(this.angle);
    ctx.fillStyle = '#7eb1ff';
    ctx.fillRect(0, -5, this.radius + 12, 10);
    ctx.restore();
    // 护盾环
    if (this.shield > 0) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.strokeStyle = '#7eb1ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

// ─── 4.1 召唤系统 (Unit / Summon) ────────────────────────────────────
// 召唤物：玩家方友军，敌方回合行动 / 发射。每个敌方回合开始 HP-1（防堆积）。
// 敌人 AI 寻找最近的 ally（player + summons）攻击。
let _unitId = 0;
class Unit {
  constructor(opts) {
    this.id = ++_unitId;
    this.x = opts.x ?? 0;
    this.y = opts.y ?? 0;
    this.radius = opts.radius ?? 14;
    this.maxHp = opts.maxHp ?? 5;
    this.hp = this.maxHp;
    this.shield = opts.shield ?? 0;
    this.team = opts.team ?? 'ally';
    this.alive = true;
    this.attack = opts.attack ?? 0;
    this.hitFlash = 0;
  }
  takeDamage(amount) {
    if (!this.alive) return false;
    const w = window.__game;
    if (this.shield > 0) {
      this.shield = Math.max(0, this.shield - 1);
      this.hitFlash = 0.15;
      return true;
    }
    this.hp -= amount;
    this.hitFlash = 0.15;
    if (w) FX.damage(w, this.x, this.y - this.radius - 5, amount);
    if (this.hp <= 0) {
      this.alive = false;
      Events.emit('summonDied', this);
    }
    return true;
  }
}

// 召唤物：按 kind 拥有不同行为（移动 / 远程发射 / 飞行）
class Summon extends Unit {
  constructor(opts) {
    super(opts);
    this.kind = opts.kind;
    this.name = opts.name || opts.kind;        // 显示用名称
    this.desc = opts.desc || '';
    this.canFire = opts.canFire !== false;
    this.cooldown = opts.cooldown ?? 1;       // N 个敌方回合发射 1 次
    this.cdCounter = 0;                        // 0 表示下个敌方回合可发
    this.bulletAttack = opts.bulletAttack ?? 1;
    this.bulletSpeed = opts.bulletSpeed ?? 380;
    this.bulletBound = opts.bulletBound ?? 0;
    this.isArcaneFire = !!opts.isArcaneFire;
    this.moves = !!opts.moves;
    this.flies = !!opts.flies;
    this.speed = opts.speed ?? 40;
    this.decayRate = opts.decayRate ?? 1;     // 每敌方回合衰减 HP
    this._meleeCd = 0;
  }

  update(dt, world) {
    if (!this.alive) return;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    if (world.battle.turn !== 'enemy') return;
    // 移动行为：士兵 / 护盾兵向最近敌人推进
    if (this.moves) {
      const target = nearestEnemy(world, this);
      if (target) {
        const dx = target.x - this.x, dy = target.y - this.y;
        const d = Math.hypot(dx, dy);
        if (d > this.radius + target.radius - 2) {
          this.x += (dx / d) * this.speed * dt;
          this.y += (dy / d) * this.speed * dt;
        } else {
          // 接触敌人 → 近战互殴（每秒 1 次）
          this._meleeCd -= dt;
          if (this._meleeCd <= 0) {
            target.takeDamage(this.attack);
            this.takeDamage(target.attack);
            this._meleeCd = 0.8;
          }
        }
      }
      // 梯形内活动
      const tb = trapBounds(world, this.y);
      if (this.x < tb.leftX + this.radius)  this.x = tb.leftX + this.radius;
      if (this.x > tb.rightX - this.radius) this.x = tb.rightX - this.radius;
      this.y = clamp(this.y, this.radius, world.h - this.radius);
    }
    // 飞行单位漂浮（无人机）
    if (this.flies) {
      this._t = (this._t || 0) + dt;
      this.x += Math.sin(this._t * 2) * 18 * dt;
      this.y += Math.cos(this._t * 1.5) * 12 * dt;
    }
  }

  fireOnce(world) {
    if (!this.canFire || !this.alive) return;
    const target = nearestEnemy(world, this);
    if (!target) return;
    if (this.isArcaneFire) {
      // 奥弹炮台：射追踪奥弹（应用本回合 arcaneBuffs）
      fireArcaneMissileFromUnit(world, this);
      return;
    }
    // 召唤物继承玩家流派 buff：与 fireFromCards 相同流程
    // 1) 用 summon 自身属性建模板（attack/speed/bound）
    // 2) 追加主卡 hooks（永久 buff，如凝视：每次发射 +1 子弹）
    // 3) emit beforeShoot 让其它展露卡也贡献 hook（如折射：弹射+1）
    // 4) PreActive 执行 → bulletCount/waveCount/penetrate/_fireOnHit 等都得到更新
    // 5) 按 bulletCount × waveCount 克隆
    const tpl = new Bullet({
      x: this.x, y: this.y,
      angle: angleBetween(this.x, this.y, target.x, target.y),
      speed: this.bulletSpeed, lifetime: 3.0,
      attack: this.bulletAttack, bound: this.bulletBound, penetrate: 0,
      bulletCount: 1, waveCount: 1, radius: 5,
    });
    tpl._fromAlly = true;
    // 火焰炮台特性
    if (this._fireBullet) {
      tpl._fireOnHit = this._fireBullet;
      tpl.addHook(_fireApplyHook);
    }
    // 继承玩家主卡 hooks
    const main = world.deck.mainCard;
    if (main) {
      for (const h of main.initializeEffects()) tpl.addHook(h);
    }
    // 让所有展露中的卡贡献 hook（凝视 / 折射 / 奥光 等）
    Events.emit('beforeShoot', tpl);
    // PreActive 一次（用 world 让共鸣弹之类读 combo）
    tpl.triggerHooks(Phase.PreActive, { world });
    // 按 waveCount 拆波
    const waves = Math.max(1, tpl.waveCount);
    for (let wi = 0; wi < waves; wi++) {
      setTimeout(() => _fireSummonWave(tpl, world), wi * 100);
    }
  }

  draw(ctx) {
    if (!this.alive) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    const flash = this.hitFlash > 0;
    const k = this.kind;
    // 不同造型
    if (k === 'turret' || k === 'arcaneTurret' || k === 'bouncyTurret' || k === 'heavyTurret') {
      // 圆形 + 炮管 (面向最近敌人)
      ctx.fillStyle = flash ? '#fff' : (k === 'arcaneTurret' ? '#9d6dff' : k === 'bouncyTurret' ? '#4ad4d4' : k === 'heavyTurret' ? '#a8a060' : '#6b8a4a');
      ctx.strokeStyle = '#2a3a1f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      // 炮管
      const w = window.__game;
      let a = -Math.PI / 2;
      if (w) {
        const t = nearestEnemy(w, this);
        if (t) a = angleBetween(this.x, this.y, t.x, t.y);
      }
      ctx.rotate(a);
      ctx.fillStyle = '#c0d8a0';
      ctx.fillRect(0, -3, this.radius + 8, 6);
    } else if (k === 'soldier' || k === 'worker') {
      // 矩形人形
      ctx.fillStyle = flash ? '#fff' : (k === 'worker' ? '#b8a060' : '#6b9ad4');
      ctx.strokeStyle = '#2a4a78';
      ctx.lineWidth = 2;
      ctx.fillRect(-this.radius / 2, -this.radius, this.radius, this.radius * 2);
      ctx.strokeRect(-this.radius / 2, -this.radius, this.radius, this.radius * 2);
      // 头
      ctx.beginPath();
      ctx.arc(0, -this.radius - 4, 5, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    } else if (k === 'shielder') {
      // 粗矩形
      ctx.fillStyle = flash ? '#fff' : '#a08060';
      ctx.strokeStyle = '#4a3a20';
      ctx.lineWidth = 2;
      ctx.fillRect(-this.radius, -this.radius, this.radius * 2, this.radius * 2);
      ctx.strokeRect(-this.radius, -this.radius, this.radius * 2, this.radius * 2);
    } else if (k === 'sniper') {
      // 高瘦三角
      ctx.fillStyle = flash ? '#fff' : '#7a4ac4';
      ctx.strokeStyle = '#3a2060';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -this.radius - 4);
      ctx.lineTo(-this.radius * 0.7, this.radius);
      ctx.lineTo(this.radius * 0.7, this.radius);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else if (k === 'drone' || k === 'archer') {
      // 小三角（飞行 / 弓箭手）
      ctx.fillStyle = flash ? '#fff' : (k === 'archer' ? '#90a060' : '#4ad4a0');
      ctx.strokeStyle = '#205050';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -this.radius);
      ctx.lineTo(-this.radius, this.radius);
      ctx.lineTo(this.radius, this.radius);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else {
      // 默认圆
      ctx.fillStyle = flash ? '#fff' : '#6b8a4a';
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    // 护盾
    if (this.shield > 0) {
      ctx.strokeStyle = '#7eb1ff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    // HP 条
    const bw = this.radius * 2;
    ctx.fillStyle = '#000a';
    ctx.fillRect(-bw / 2, -this.radius - 9, bw, 3);
    ctx.fillStyle = '#5bd45b';
    ctx.fillRect(-bw / 2, -this.radius - 9, bw * (this.hp / this.maxHp), 3);
    ctx.restore();
  }
}

// 找最近敌人 / 找最近 ally（包含 player + summons）
function nearestEnemy(world, from) {
  let best = null, minD = Infinity;
  for (const e of world.enemies) {
    if (!e.alive) continue;
    const d = Math.hypot(e.x - from.x, e.y - from.y);
    if (d < minD) { minD = d; best = e; }
  }
  return best;
}
function nearestAlly(world, from) {
  let best = world.player;
  let minD = Math.hypot(world.player.x - from.x, world.player.y - from.y);
  for (const s of world.summons || []) {
    if (!s.alive) continue;
    const d = Math.hypot(s.x - from.x, s.y - from.y);
    if (d < minD) { minD = d; best = s; }
  }
  // 实体化子弹（玩家子弹进入实体态）也是合法目标。本回合即将销毁（layers≤0 已死）的实体跳过，
  // 避免敌人把攻击浪费在马上要消失的实体上。
  for (const b of world.bullets || []) {
    if (!b.isEntity || !b.alive) continue;
    if (b.entityLayers <= 0) continue;
    if (b.team === 'enemy') continue;        // 仅玩家方实体可被敌人锁定
    const d = Math.hypot(b.x - from.x, b.y - from.y);
    if (d < minD) { minD = d; best = b; }
  }
  return best;
}

// 召唤物名称 / 描述的英文翻译
const SUMMON_TR = {
  turret:       { name_en: 'Turret',         desc_en: 'Stationary turret. Fires 1 shot each enemy turn.' },
  soldier:      { name_en: 'Soldier',        desc_en: 'Melee advance. Contact deals 2 dmg.' },
  sniper:       { name_en: 'Sniper Tower',   desc_en: 'High-damage sniper. Fires a 5-dmg shot every 2 enemy turns.' },
  shielder:     { name_en: 'Shielder',       desc_en: 'Tank. Slow advance + contact deals 2 dmg.' },
  drone:        { name_en: 'Drone',          desc_en: 'Flying unit. Fires 1 shot each enemy turn.' },
  arcaneTurret: { name_en: 'Arcane Turret',  desc_en: 'Arcane turret. Fires 1 tracking Arcane Missile each enemy turn.' },
  bouncyTurret: { name_en: 'Bouncy Turret',  desc_en: 'Turret. Bullets have Bounce +3 built-in.' },
  heavyTurret:  { name_en: 'Heavy Turret',   desc_en: 'Durable turret. Fires a 4-dmg shot each turn.' },
  worker:       { name_en: 'Worker',         desc_en: 'Fast melee. High move speed, 1 dmg on contact, never decays.' },
  archer:       { name_en: 'Archer',         desc_en: 'Ranged bowman. Fires a 2-dmg arrow each turn.' },
};

function enemyName(typeKey, fallback) {
  const tr = ENEMY_TR[typeKey];
  if (LANG.current === 'en' && tr && tr.name_en) return tr.name_en;
  return fallback;
}
function enemyIntentDesc(typeKey, intentIdx, fallback) {
  const tr = ENEMY_TR[typeKey];
  if (LANG.current === 'en' && tr && tr.intents_en && tr.intents_en[intentIdx]) {
    return tr.intents_en[intentIdx];
  }
  return fallback;
}
function summonNameOf(kind, fallback) {
  const tr = SUMMON_TR[kind];
  if (LANG.current === 'en' && tr && tr.name_en) return tr.name_en;
  return fallback;
}
function summonDescOf(kind, fallback) {
  const tr = SUMMON_TR[kind];
  if (LANG.current === 'en' && tr && tr.desc_en) return tr.desc_en;
  return fallback;
}

// 召唤工厂：每个 kind 一种 stats 配置
const SUMMON_DEFS = {
  turret:       { kind: 'turret',       name: '炮台',         maxHp: 3,  attack: 0, radius: 14, bulletAttack: 2, cooldown: 1, canFire: true, desc: '固定炮台。每敌方回合射 1 颗子弹' },
  soldier:      { kind: 'soldier',      name: '士兵',         maxHp: 5,  attack: 2, radius: 12, moves: true, speed: 60, canFire: false, desc: '近战推进。接触敌人造成 2 伤' },
  sniper:       { kind: 'sniper',       name: '狙击塔',       maxHp: 6,  attack: 0, radius: 14, bulletAttack: 5, bulletSpeed: 600, cooldown: 2, canFire: true, desc: '高伤狙击。每 2 敌方回合射 5 伤弹' },
  shielder:     { kind: 'shielder',     name: '护盾兵',       maxHp: 8,  attack: 2, radius: 16, moves: true, speed: 18, canFire: false, desc: '肉盾。缓慢推进 + 接触造成 2 伤' },
  drone:        { kind: 'drone',        name: '无人机',       maxHp: 3,  attack: 0, radius: 10, bulletAttack: 1, cooldown: 1, flies: true, canFire: true, desc: '飞行单位。每敌方回合射 1 颗子弹' },
  arcaneTurret: { kind: 'arcaneTurret', name: '奥弹炮台',     maxHp: 3,  attack: 0, radius: 14, bulletAttack: 2, cooldown: 1, canFire: true, isArcaneFire: true, desc: '奥弹炮台。每敌方回合射 1 颗追踪奥弹' },
  bouncyTurret: { kind: 'bouncyTurret', name: '弹射炮台',     maxHp: 3,  attack: 0, radius: 14, bulletAttack: 1, cooldown: 1, canFire: true, bulletBound: 3, desc: '炮台。子弹自带弹射 +3' },
  heavyTurret:  { kind: 'heavyTurret',  name: '重型炮台',     maxHp: 7,  attack: 0, radius: 18, bulletAttack: 4, cooldown: 1, canFire: true, bulletSpeed: 350, desc: '高耐久炮台。每回合射 4 伤弹' },
  worker:       { kind: 'worker',       name: '工兵',         maxHp: 3,  attack: 1, radius: 10, moves: true, speed: 95, canFire: false, decayRate: 0, desc: '快速近战。移速快、接触造成 1 伤、不衰减' },
  archer:       { kind: 'archer',       name: '弓箭手',       maxHp: 4,  attack: 0, radius: 12, bulletAttack: 2, cooldown: 1, canFire: true, bulletSpeed: 450, desc: '远程弓兵。每回合射 2 伤箭' },
};

function spawnSummon(world, kind, opts = {}) {
  const def = SUMMON_DEFS[kind];
  if (!def) return null;
  const sp = new Summon(def);
  // 军团统帅 buff：HP+100% 攻+2 + 不衰减
  if (world.battle.summonBuffActive) {
    sp.maxHp = sp.maxHp * 2;
    sp.hp = sp.maxHp;
    sp.bulletAttack = (sp.bulletAttack || 1) + 2;
    sp.attack = (sp.attack || 0) + 2;
    sp._noDecay = true;
  }
  // 默认 spawn 在炮台前 180° 弧（上半圆）的随机位置
  if (opts.x == null || opts.y == null) {
    const ang = rand(-Math.PI, 0);          // -π..0 = 上半圆（炮台前方 180°）
    const dist = 70 + rand(0, 50);
    sp.x = world.player.x + Math.cos(ang) * dist;
    sp.y = world.player.y + Math.sin(ang) * dist;
  } else {
    sp.x = opts.x; sp.y = opts.y;
  }
  // 梯形内
  const tb = trapBounds(world, sp.y);
  sp.x = clamp(sp.x, tb.leftX + sp.radius, tb.rightX - sp.radius);
  sp.y = clamp(sp.y, sp.radius, world.h - sp.radius);
  world.summons.push(sp);
  return sp;
}

// 召唤物的子弹波次发射（同款流程仿 fireOneWave，但 source = 召唤物，team = ally）
function _fireSummonWave(tpl, world) {
  const n = Math.max(1, tpl.bulletCount);
  const perBullet = Math.PI / 60;
  const maxSpread = Math.PI / 6;
  const spread = n > 1 ? Math.min(maxSpread, perBullet * (n - 1)) : 0;
  const startA = tpl.angle - spread / 2;
  const now = performance.now() / 1000;
  for (let i = 0; i < n; i++) {
    const clone = new Bullet({
      x: tpl.x, y: tpl.y,
      angle: n > 1 ? startA + (spread / (n - 1)) * i : tpl.angle,
      speed: tpl.speed, lifetime: tpl.lifetime,
      attack: tpl.attack, bound: tpl.bound, penetrate: tpl.penetrate,
      bulletCount: 1, waveCount: 1, radius: 5,
    });
    clone._fromAlly = true;
    clone._fireOnHit = tpl._fireOnHit;        // 继承火焰
    clone.copyHooksFrom(tpl);
    clone.triggerHooks(Phase.Spawned, { world });
    clone.activate(now);
    world.bullets.push(clone);
  }
  tpl.triggerHooks(Phase.PostActive, { world });
}

// 召唤物发射奥弹（应用本回合 arcaneBuffs，但 spawn 位置在召唤物）
function fireArcaneMissileFromUnit(world, unit) {
  const buffs = world.battle.arcaneBuffs || {};
  let attack = unit.bulletAttack || 1;
  if (buffs.doubleDamage) attack *= 2;
  const target = nearestEnemy(world, unit);
  if (!target) return;
  const bullet = new Bullet({
    x: unit.x, y: unit.y,
    angle: angleBetween(unit.x, unit.y, target.x, target.y),
    speed: 380, lifetime: 3.5, attack, bound: 0, penetrate: 0, radius: 6,
  });
  bullet.isArcane = true;
  bullet.tracking = true;
  bullet.trackRate = 5;
  bullet._fromAlly = true;
  if (buffs.explode) bullet.addHook(_arcaneExplodeHook);
  if (buffs.knockback) bullet.addHook(_arcaneKnockbackHook);
  if (buffs.refundMana) bullet.addHook(_arcaneRefundManaHook);
  bullet.activate(performance.now() / 1000);
  world.bullets.push(bullet);
}

// ─── 5. Cards ───────────────────────────────────────────────────────
// 卡牌中英文翻译表。每张卡按 id 索引，结构 { zh: { name, desc }, en: { name, desc } }。
// 当卡 def 提供 id 且此处有对应条目时，card.name / card.desc 走 i18n；否则用 def.name / def.desc 兜底。
const CARD_TR = {
  shades:        { zh: { name: '墨镜',     desc: '弹射+3，穿透+3。弹射和穿透次数可互相转化。' },
                   en: { name: 'Shades',     desc: 'Bounce+3, Pierce+3. Bounce and Pierce counts convert into each other.' } },
  gaze:          { zh: { name: '凝视',     desc: '数量+2。展露：数量+2。' },
                   en: { name: 'Gaze',       desc: 'Bullets+2. Reveal: Bullets+2.' } },
  streamlined:   { zh: { name: '流线型',   desc: '穿透+4，可追踪敌人。' },
                   en: { name: 'Streamlined', desc: 'Pierce+4. Bullets Track enemies.' } },
  redherring:    { zh: { name: '鱼目混珠', desc: '数量*4，但有50%概率伤害值变为0。' },
                   en: { name: 'Red Herring', desc: 'Bullets ×4, but each bullet has a 50% chance of dealing 0 damage.' } },
  vampbat:       { zh: { name: '吸血蝙蝠', desc: '实体化+2。每回合向最近的一名敌人发射攻击2次。击杀敌人后，为玩家恢复1血量。' },
                   en: { name: 'Vampire Bat', desc: 'Entity+2. Each turn, fires 2 tracking shots at the nearest enemy. On kill, heals the player for 1 HP.' } },
  doublecast:    { zh: { name: '双重施法', desc: '波次+1，伤害+1。' },
                   en: { name: 'Double Cast', desc: 'Wave+1, Damage+1.' } },
  snipe:         { zh: { name: '狙击',     desc: '伤害会随着经过距离增加而增加。' },
                   en: { name: 'Snipe',      desc: 'Damage scales up with distance traveled.' } },
  eyewind:       { zh: { name: '风之眼',   desc: '速度降低，持续时间增加，并持续吸引敌人。' },
                   en: { name: 'Eye of the Wind', desc: 'Slower bullet, longer lifetime, continuously pulls enemies in.' } },
  swordsman:     { zh: { name: '剑士',     desc: '伤害+1，实体化+2。每回合向最近的一名敌人挥剑，造成范围伤害。' },
                   en: { name: 'Swordsman',  desc: 'Damage+1, Entity+2. Each turn, slashes the nearest enemy for AOE damage.' } },
  firebomb:      { zh: { name: '燃烧弹',   desc: '摧毁时对范围内的敌人施加2层燃烧。' },
                   en: { name: 'Firebomb',   desc: 'On destruction, applies 2 Fire to enemies in range.' } },
  fuse:          { zh: { name: '引信',     desc: '实体化+2。每回合向周围敌人施加1层燃烧。' },
                   en: { name: 'Fuse',       desc: 'Entity+2. Each turn, applies 1 Fire to nearby enemies.' } },
  shockwave:     { zh: { name: '冲击波',   desc: '碰撞时造成范围伤害。' },
                   en: { name: 'Shockwave',  desc: 'On collision, deals AOE damage.' } },
  arcaneboost:   { zh: { name: '奥术强化', desc: '洗入1张奥弹。你手牌中的奥弹伤害+1。' },
                   en: { name: 'Arcane Boost', desc: 'Shuffle in 1 Arcane Missile. Arcane Missile cards in your hand gain +1 damage.' } },
  arcane_missile:{ zh: { name: '奥弹',     desc: '发射一枚追踪弹。正面时立即自动触发，不消耗法力值。' },
                   en: { name: 'Arcane Missile', desc: 'Fires a tracking projectile. When face-up, triggers automatically and costs no mana.' } },
  leaded:        { zh: { name: '注铅',     desc: '伤害+8，穿透-5，弹射-5。' },
                   en: { name: 'Lead Slug',  desc: 'Damage+8, Pierce-5, Bounce-5.' } },
  ignite:        { zh: { name: '引燃',     desc: '命中时施加2层燃烧。' },
                   en: { name: 'Ignite',     desc: 'On hit, apply 2 Fire.' } },
  roar:          { zh: { name: '怒吼',     desc: '获得1层连携。' },
                   en: { name: 'Roar',       desc: 'Gain 1 Chain stack.' } },
  photongun:     { zh: { name: '光子枪',   desc: '穿透+2，弹射+4。速度大幅提高。' },
                   en: { name: 'Photon Gun', desc: 'Pierce+2, Bounce+4. Greatly increased speed.' } },
  hotair:        { zh: { name: '热气球',   desc: '伤害+1，体积增大。' },
                   en: { name: 'Hot Air Balloon', desc: 'Damage+1, larger projectile.' } },
  wall:          { zh: { name: '城墙',     desc: '伤害-99。实体化+5。体积大幅增加。' },
                   en: { name: 'Bulwark',    desc: 'Damage-99. Entity+5. Greatly increased projectile size.' } },
  followup:      { zh: { name: '乘胜追击', desc: '伤害+1。如果所有正面牌的消耗值大于6，则获得2层连携。' },
                   en: { name: 'Follow-up',  desc: 'Damage+1. If the total cost of all face-up cards is greater than 6, gain 2 Chain stacks.' } },
  boulder:       { zh: { name: '滚石',     desc: '穿透+99，弹射-99。速度降低，体积大幅增加。' },
                   en: { name: 'Boulder',    desc: 'Pierce+99, Bounce-99. Slower, much larger.' } },
  railgun:       { zh: { name: '磁轨',     desc: '穿透+2。穿透敌人时，速度提高。' },
                   en: { name: 'Railgun',    desc: 'Pierce+2. Speeds up when piercing an enemy.' } },
  scatter:       { zh: { name: '散弹',     desc: '数量+2。伤害会随着经过距离增加而降低。' },
                   en: { name: 'Scatter',    desc: 'Bullets+2. Damage falls off with distance traveled.' } },
  arcane_firework:{ zh: { name: '奥术礼花', desc: '洗入2张奥弹。' },
                   en: { name: 'Arcane Firework', desc: 'Shuffle in 2 Arcane Missiles.' } },
  hotpotato:     { zh: { name: '烫土豆',   desc: '弹射+5。弹射时，为一个随机敌人施加2层燃烧。' },
                   en: { name: 'Hot Potato', desc: 'Bounce+5. On bounce, apply 2 Fire to a random enemy.' } },
  fuelcell:      { zh: { name: '燃料匣',   desc: '穿透+1，弹射+2。穿透燃烧敌人时穿透+1。' },
                   en: { name: 'Fuel Cell',  desc: 'Pierce+1, Bounce+2. When piercing a burning enemy, Pierce+1.' } },
  boost1:        { zh: { name: '强化',     desc: '伤害+1' },
                   en: { name: 'Boost',      desc: 'Damage+1' } },
};

class Card {
  constructor(def) {
    this.id = def.id;
    this._defName = def.name;
    this._defDesc = def.desc;
    this.cost = def.cost ?? 1;
    this.discardCost = def.discardCost ?? 1;   // 默认弃牌消耗 1 法力
    this.faceUp = false;
    this.rarity = def.rarity || 'common';   // common / rare / epic / legendary
    this.def = def;
  }

  // 当前语言下的卡名 / 描述（运行时从 CARD_TR 取，未注册的回落到 def 的 zh 字符串）
  get name() {
    const tr = CARD_TR[this.id];
    if (tr && tr[LANG.current]) return tr[LANG.current].name;
    return this._defName;
  }
  get desc() {
    const tr = CARD_TR[this.id];
    if (tr && tr[LANG.current]) return tr[LANG.current].desc;
    return this._defDesc;
  }

  // 卡牌注册自己的 Hook 到模板子弹（默认使用流程）
  initializeEffects() { return []; }

  // 返回 true 表示使用成功（消耗法力 / 从手牌 → 弃牌堆）
  use(player, bulletTemplate) {
    if (!player.spend(this.cost)) return false;
    for (const h of this.initializeEffects()) bulletTemplate.addHook(h);
    return true;
  }

  // 弃牌；返回 true 表示弃牌成功。默认消耗 1 法力（discardCost 可重写）
  discard(player) {
    const cost = this.discardCost ?? 1;
    if (cost > 0 && !player.spend(cost)) return false;
    return true;
  }

  // 展露 (Reveal): 卡面朝上的瞬间持续生效。注意：每次发射要重新挂 Hook
  onReveal() {}
  onConceal() {}

  // 使用时的额外副作用（设置全局 buff、洗入卡、召唤、连携 stacks 等）
  // fireFromCards 在 use() 成功后调用。world / player 可访问场景。
  onUse(world, player) {}

  // 弃置时触发（双面间谍 / 战术撤退 / 弃牌号令 等）
  // doDiscard 在 discard() 成功后调用。
  onDiscard(world, player) {}
}

// ─── 旧卡组已清空 —— 新卡设计阶段（仅保留下方示例 + 引擎工具函数） ────────

// 奥弹 buff 配套 Hook（共享）—— 旧召唤系奥弹炮台 fireArcaneMissileFromUnit 仍可用；
// 旧 Card_ArcaneMissile + fireArcaneMissile + _arcaneOverloadHook 已删除（无卡使用）。
const _arcaneExplodeHook = new Effect(Phase.HitEnemy, -1, ctx => {
  const b = ctx.bullet;
  if (b._explodedThisHit) return;
  b._explodedThisHit = true;
  applyAoe(ctx.world, b, { damage: b.attack, mult: AOE_MULT.arcaneExplode, exclude: ctx.enemy });
});
const _arcaneKnockbackHook = new Effect(Phase.HitEnemy, -1, ctx => {
  ctx.enemy.applyKnockback(ctx.bullet.x, ctx.bullet.y, 32);
  ctx.enemy.knockback.t = 0.3;
});
const _arcaneRefundManaHook = new Effect(Phase.HitEnemy, -1, ctx => {
  const e = ctx.enemy;
  const b = ctx.bullet;
  if (!e.alive) return;
  if (e.hp - b.attack > 0) return;
  const w = ctx.world || window.__game;
  if (!w) return;
  w.player.mana = Math.min(w.player.maxMana, w.player.mana + 1);
});

// ─── 通用 AOE（体积驱动）─────────────────────────────────────────────
// 所有 AOE 范围 = source.radius × AOE_VOL_RATIO × mult。
// 子弹/实体/敌人变大 → AOE 自动跟着变大；新卡只需选 mult、不写死像素半径。
// 命中规则：d > r + victim.radius 才算未中（"擦边算中"，与子弹-敌人碰撞一致）。
const AOE_VOL_RATIO = 6;
const AOE_MULT = {
  arcaneExplode: 2.0,   // 子弹 r5 → 60（与旧硬编码一致）；实体化层数↑ → 爆炸更大
  swordSlash:    1.4,   // 实体子弹 r10 → 84（旧 70 略放大）；多层实体 = 挥得更远
  mageAoe:       0.8,   // mage r15 → 72（≈旧 70）
  selfDest:      0.85,  // bomber r14 → 71（≈旧 70）；大体型敌人自爆按体积放大
  bufferAura:    1.7,   // buffer r16 → 163（≈旧 150）
  fireDetonate:  8.0,   // 子弹 r5 → 240；实体化/巨弹 → 趋近全图引爆
};

function aoeRadius(source, mult = 1) {
  return (source.radius || 5) * AOE_VOL_RATIO * mult;
}

// 统一 AOE 入口。所有"范围伤害/范围效果"都走这里 → 体积自动驱动半径。
// opts:
//   kind     'circle' (默认) | 'cone'
//   target   'enemies' (world.enemies) | 'allies' (player + summons)；默认 enemies
//   mult     乘进 aoeRadius；查 AOE_MULT 表
//   cx, cy   显式中心（默认 source.x/y）—— 用于"AOE 落在目标脚下"
//   damage   伤害值（0 = 纯效果，配 onHit 实现 buff / 引爆等）
//   exclude  单个对象排除（如已被单体命中的目标 / buffer 自己）
//   onHit    (victim, world) 命中回调（buff、引爆等走这里）
//   knockback false 关闭；默认 damage>0 时启用
//   fx       false 关闭默认视觉（爆炸环/扇形 + shake + hit-stop）
//   dirAngle, halfAngle  kind='cone' 必填
//   color    cone 模式 SlashArc 颜色
function applyAoe(world, source, opts = {}) {
  if (!world || !source) return 0;
  const cx = opts.cx ?? source.x;
  const cy = opts.cy ?? source.y;
  const r = aoeRadius(source, opts.mult);
  const isAllyTarget = opts.target === 'allies';
  const victims = isAllyTarget
    ? [world.player, ...world.summons.filter(s => s && s.alive)]
    : world.enemies.filter(e => e && e.alive);
  const damage = opts.damage ?? 0;
  // 命中钩子传播：AOE 视为 source.bullet 对每个敌方受害者的一次"命中"。
  // 让"命中触发"类钩子（引燃 _fireApplyHook 等）在 AOE 时也生效。仅当 source 是子弹（有 triggerHooks）且目标是敌人时触发。
  const propagateOnHit = !isAllyTarget && source && typeof source.triggerHooks === 'function';
  let hits = 0;
  for (const v of victims) {
    if (!v || v === opts.exclude) continue;
    if (v.hp != null && v.hp <= 0) continue;
    const dx = v.x - cx, dy = v.y - cy;
    const d = Math.hypot(dx, dy);
    // 擦边算中：受害者半径计入
    if (d > r + (v.radius || 0)) continue;
    if (opts.kind === 'cone') {
      let diff = Math.atan2(dy, dx) - opts.dirAngle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > opts.halfAngle) continue;
    }
    // OnHit 钩子先于伤害结算 — 即使 damage=0、即使敌人挡住，也都视作"命中"
    if (propagateOnHit) {
      source.triggerHooks(Phase.OnHit, { enemy: v, world });
    }
    if (damage > 0) {
      const dealt = v.takeDamage(damage);
      // 敌人 takeDamage 不自弹伤害数字 → 这里补；ally (player / summon) 内部已弹
      if (dealt && !isAllyTarget) FX.damage(world, v.x, v.y - v.radius, damage);
    }
    opts.onHit?.(v, world);
    if (opts.knockback !== false && damage > 0 && typeof v.applyKnockback === 'function') {
      const falloff = 1 - Math.min(1, d / r);
      const force = clamp(4 + damage * 0.6, 4, 22) * (0.4 + 0.6 * falloff);
      v.applyKnockback(cx, cy, force);
    }
    hits++;
  }
  if (opts.fx !== false) {
    if (opts.kind === 'cone') {
      world.particles.push(new SlashArc(cx, cy, opts.dirAngle, r, opts.halfAngle, opts.color || '#f1f4f8'));
    } else {
      FX.explode(world, cx, cy, r);
    }
    FX.shake(world, clamp(2 + damage * 0.4 + hits * 0.3, 2, 9), 0.18);
    if (hits > 0) FX.hitStop(world, hits >= 3 ? 0.07 : 0.05);
  }
  return hits;
}

// === 旧卡组（A 奥弹 / B 弹射 / C 召唤 / E 火焰 / D 跨流派 共 60+ 张）已清空 ===
// 保留：applyAoe（上方，AOE 统一入口）、火焰共用工具（applyFire / detonateFire / _fireApplyHook）。
// 实体化（entityLayers）配套见 Bullet + BattleManager._tickEntityBullets。

function applyFire(enemy, stacks) {
  if (!enemy || !enemy.alive) return;
  enemy.fire = (enemy.fire || 0) + stacks;
  // 命中即时反馈：橙色火星 + "+N 🔥" 数字
  const w = window.__game;
  if (w) {
    for (let i = 0; i < 4 + stacks; i++) {
      const a = Math.PI * 2 * Math.random();
      const sp = 60 + Math.random() * 80;
      w.particles.push(new Particle({
        x: enemy.x, y: enemy.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30,
        life: 0.4, color: '#ff7030', size: 3,
      }));
    }
    // 火焰文字漂浮（区别于普通伤害数字）
    w.particles.push(new FireText(enemy.x, enemy.y - enemy.radius - 5, '+' + stacks + '🔥'));
  }
}

// detonateFire：默认全图引爆所有着火敌人；传 source 则按 source 体积局部引爆。
//   detonateFire(world, multiplier)              — 全图（旧语义）
//   detonateFire(world, source, multiplier)      — 局部：范围 = source.radius × AOE_MULT.fireDetonate
function detonateFire(world, sourceOrMult, multiplier) {
  if (!world) return 0;
  // 兼容旧签名：detonateFire(world, mult)
  let source = null;
  let mult = 1;
  if (typeof sourceOrMult === 'number') {
    mult = sourceOrMult;
  } else if (sourceOrMult != null) {
    source = sourceOrMult;
    mult = multiplier ?? 1;
  }
  const detonateOne = (e) => {
    const stacks = e.fire || 0;
    if (stacks <= 0) return false;
    const dmg = stacks * mult;
    e.takeDamage(dmg);
    FX.damage(world, e.x, e.y - e.radius, dmg);
    FX.explode(world, e.x, e.y);
    e.fire = 0;
    return true;
  };
  if (!source) {
    // 全图
    let hits = 0;
    for (const e of world.enemies) {
      if (!e.alive) continue;
      if (detonateOne(e)) hits++;
    }
    return hits;
  }
  // 局部：圈选范围内的着火敌人，逐个引爆
  return applyAoe(world, source, {
    damage: 0, mult: AOE_MULT.fireDetonate, target: 'enemies',
    knockback: false, fx: false,
    onHit: detonateOne,
  });
}

// 通用 fire-on-hit hook：bullet._fireOnHit > 0 时命中敌人后 applyFire。
// 走 Phase.OnHit 而非 HitEnemy：直接子弹 + AOE 都会触发，且不影响子弹状态。
const _fireApplyHook = new Effect(Phase.OnHit, -1, ctx => {
  const n = ctx.bullet._fireOnHit;
  if (n > 0) applyFire(ctx.enemy, n);
});

// ─── 新卡组（按策划表）──────────────────────────────────────────────────

// 找最近敌人的小工具（多卡复用）
function _nearestEnemyTo(world, x, y) {
  let nearest = null, minD = Infinity;
  for (const e of world.enemies) {
    if (!e.alive) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < minD) { minD = d; nearest = e; }
  }
  return nearest;
}
// 实体挥剑/啃咬通用：触发 HitEnemy 钩子 + 造伤害 + 击退 + 视觉
function _entitySlash(world, bullet, target, color) {
  bullet.triggerHooks(Phase.HitEnemy, { enemy: target, world });
  const wasAlive = target.alive;
  const dealt = target.takeDamage(bullet.attack);
  let killed = false;
  if (wasAlive && !target.alive) killed = true;
  if (dealt && world) {
    const baseForce = clamp(3 + bullet.attack * 1.0, 3, 16);
    const force = baseForce * (bullet.radius / 5);
    target.applyKnockback(bullet.x, bullet.y, force);
    FX.damage(world, target.x, target.y - target.radius, bullet.attack);
    FX.shake(world, clamp(1 + bullet.attack * 0.4, 1, 5), 0.12);
  }
  // 一段火花连线
  const steps = 9;
  const dx = (target.x - bullet.x) / steps;
  const dy = (target.y - bullet.y) / steps;
  for (let i = 0; i < steps; i++) {
    world.particles.push(new Particle({
      x: bullet.x + dx * i, y: bullet.y + dy * i,
      vx: rand(-30, 30), vy: rand(-30, 30),
      life: 0.28, color: color || '#cfd6df', size: 3,
    }));
  }
  return killed;
}

// 凝视：展露光环（每次发射 +2 子弹）共享 hook
const _gazeRevealHook = new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.bulletCount += 2; });

class Card_墨镜 extends Card {
  constructor() {
    super({
      id: 'shades', name: '墨镜',
      desc: '弹射+3，穿透+3。共享弹射和穿透次数。',
      cost: 2, rarity: 'legendary', fxType: 'bounce',
      art: { emoji: '🕶' },
    });
  }
  initializeEffects() {
    return [
      new Effect(Phase.PreActive, 0, ctx => {
        ctx.bullet.bound += 3;
        ctx.bullet.penetrate += 3;
      }),
      // 共享：撞墙时若 bound 用尽但 penetrate 还有 → 借 1
      new Effect(Phase.HitWall, 0, ctx => {
        const b = ctx.bullet;
        if (b.bound <= 0 && b.penetrate > 0) { b.bound += 1; b.penetrate -= 1; }
      }),
      // 命中敌人时若 penetrate 用尽但 bound 还有 → 借 1
      new Effect(Phase.HitEnemy, 0, ctx => {
        const b = ctx.bullet;
        if (b.penetrate <= 0 && b.bound > 0) { b.penetrate += 1; b.bound -= 1; }
      }),
    ];
  }
}

class Card_凝视 extends Card {
  constructor() {
    super({
      id: 'gaze', name: '凝视',
      desc: '数量+2。展露：数量+2。',
      cost: 2, rarity: 'legendary', fxType: 'aura', hasRevealFx: true,
      art: { emoji: '👁' },
    });
    this._revealHandler = null;
  }
  initializeEffects() {
    return [new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.bulletCount += 2; })];
  }
  onReveal() {
    if (this._revealHandler) return;
    this._revealHandler = (tpl) => { tpl.addHook(_gazeRevealHook); };
    Events.on('beforeShoot', this._revealHandler);
  }
  onConceal() {
    if (!this._revealHandler) return;
    Events.off('beforeShoot', this._revealHandler);
    this._revealHandler = null;
  }
}

class Card_流线型 extends Card {
  constructor() {
    super({
      id: 'streamlined', name: '流线型',
      desc: '穿透+4，可追踪敌人。',
      cost: 2, rarity: 'epic', fxType: 'pierce',
      art: { emoji: '🌪' },
    });
  }
  initializeEffects() {
    return [new Effect(Phase.PreActive, 0, ctx => {
      ctx.bullet.penetrate += 4;
      ctx.bullet.tracking = true;
      // 显式不设 trackRate → 走 Bullet.update 默认（12 rad/s + 近距 snap）
    })];
  }
}

class Card_鱼目混珠 extends Card {
  constructor() {
    super({
      id: 'redherring', name: '鱼目混珠',
      desc: '数量*4，但有50%概率伤害值变为0。',
      cost: 2, rarity: 'epic', fxType: 'random',
      art: { emoji: '⚗' },
    });
  }
  initializeEffects() {
    return [
      // 高优先级 → 在加法 +N 数量类卡之后再乘 4
      new Effect(Phase.PreActive, 50, ctx => { ctx.bullet.bulletCount *= 4; }),
      // per-clone：50% 哑弹
      new Effect(Phase.Spawned, 0, ctx => {
        if (Math.random() < 0.5) ctx.bullet.attack = 0;
      }),
    ];
  }
}

class Card_吸血蝙蝠 extends Card {
  constructor() {
    super({
      id: 'vampbat', name: '吸血蝙蝠',
      desc: '实体化+2。每回合向最近的一名敌人发射攻击2次。击杀敌人后，为玩家恢复1血量。',
      cost: 3, rarity: 'epic', fxType: 'entity',
      art: { emoji: '🦇' },
    });
  }
  initializeEffects() {
    return [
      new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.entityLayers += 2; }),
      // 视觉标识：一对翅膀（实体化时显示）
      new Effect(Phase.Spawned, 0, ctx => {
        (ctx.bullet._entityDecos = ctx.bullet._entityDecos || []).push('wings');
      }),
      new Effect(Phase.EntityTurn, 0, ctx => {
        const b = ctx.bullet;
        const w = ctx.world;
        // 每回合射出 2 颗 蝙蝠子弹（紫黑色 + 🦇 标识），追踪、击杀回血
        for (let i = 0; i < 2; i++) {
          setTimeout(() => {
            if (!b.alive) return;
            const target = _nearestEnemyTo(w, b.x, b.y);
            if (!target) return;
            const bb = new Bullet({
              x: b.x, y: b.y,
              angle: angleBetween(b.x, b.y, target.x, target.y),
              speed: 360, lifetime: 2.2,
              attack: b.attack, bound: 0, penetrate: 0,
              bulletCount: 1, waveCount: 1, radius: 7,
            });
            bb._batBullet = true;
            bb._fromAlly = true;
            bb.tracking = true;
            // 走 Bullet.update 的默认追踪：12 rad/s + 近距 snap，不要再写死成 5
            // 命中钩子：如果本次将击杀 → 玩家回 1 血 + 红心粒子（命中前预判，所以在 HitEnemy -1 priority）
            bb.addHook(new Effect(Phase.HitEnemy, -1, ctx2 => {
              const e = ctx2.enemy;
              const src = ctx2.bullet;
              if (!e.alive) return;
              if (e.hp - src.attack > 0) return;
              w.player.hp = Math.min(w.player.maxHp, w.player.hp + 1);
              // 回血视觉
              for (let k = 0; k < 8; k++) {
                const a = Math.PI * 2 * (k / 8);
                w.particles.push(new Particle({
                  x: w.player.x + Math.cos(a) * 6, y: w.player.y + Math.sin(a) * 6,
                  vx: Math.cos(a) * 80, vy: Math.sin(a) * 80 - 30,
                  life: 0.5, color: '#ef7878', size: 3.5,
                }));
              }
            }));
            bb.activate(performance.now() / 1000);
            w.bullets.push(bb);
            // 出膛小烟雾（紫色）
            for (let k = 0; k < 4; k++) {
              const a = Math.PI * 2 * Math.random();
              w.particles.push(new Particle({
                x: b.x, y: b.y,
                vx: Math.cos(a) * 60, vy: Math.sin(a) * 60,
                life: 0.25, color: '#a06bd0', size: 2.5,
              }));
            }
          }, i * 120);
        }
      }),
    ];
  }
}

class Card_狙击 extends Card {
  constructor() {
    super({
      id: 'snipe', name: '狙击',
      desc: '伤害会随着经过距离增加而增加。',
      cost: 1, rarity: 'rare', fxType: 'pierce',
      art: { emoji: '🎯' },
    });
  }
  initializeEffects() {
    return [
      // per-clone 起点 + 基础伤害快照
      new Effect(Phase.Spawned, 0, ctx => {
        const b = ctx.bullet;
        b._snipeStartX = b.x;
        b._snipeStartY = b.y;
        b._snipeBaseAttack = b.attack;
      }),
      // 命中前根据距离重算 attack（优先级 -2，先于其它 HitEnemy 钩子）
      new Effect(Phase.HitEnemy, -2, ctx => {
        const b = ctx.bullet;
        if (b._snipeBaseAttack == null) return;
        const dx = b.x - b._snipeStartX;
        const dy = b.y - b._snipeStartY;
        const dist = Math.hypot(dx, dy);
        // 战场高度 ~ 560：每跨过一倍战场高度 +2 伤害（线性）
        const bonus = Math.floor((dist / 560) * 2);
        b.attack = b._snipeBaseAttack + bonus;
      }),
    ];
  }
}

class Card_风之眼 extends Card {
  constructor() {
    super({
      id: 'eyewind', name: '风之眼',
      desc: '速度变慢，持续时间增加，并持续吸引敌人。',
      cost: 1, rarity: 'rare', fxType: 'aura',
      art: { emoji: '🌬' },
    });
  }
  initializeEffects() {
    return [
      // 速度减半 + 持续时间翻倍（模板上写一次 → 所有 clone 继承 tpl.speed / tpl.lifetime）
      new Effect(Phase.PreActive, 0, ctx => {
        ctx.bullet.speed *= 0.5;
        ctx.bullet.lifetime *= 2;
      }),
      // 持续吸引敌人（任意阶段都生效，越近越强）
      new Effect(Phase.Spawned, 0, ctx => {
        ctx.bullet._eyeWind = true;
      }),
    ];
  }
}

class Card_剑士 extends Card {
  constructor() {
    super({
      id: 'swordsman', name: '剑士',
      desc: '伤害+1，实体化+2。每回合向最近的一名敌人挥剑，造成范围伤害。',
      cost: 3, rarity: 'rare', fxType: 'entity',
      art: { emoji: '🗡' },
    });
  }
  initializeEffects() {
    return [
      new Effect(Phase.PreActive, 0, ctx => {
        ctx.bullet.attack += 1;
        ctx.bullet.entityLayers += 2;
      }),
      // 视觉标识：每个克隆挂一个 🗡 装饰（实体化时显示）
      new Effect(Phase.Spawned, 0, ctx => {
        (ctx.bullet._entityDecos = ctx.bullet._entityDecos || []).push('sword');
      }),
      new Effect(Phase.EntityTurn, 0, ctx => {
        const b = ctx.bullet;
        const w = ctx.world;
        // 剑士近战：扇形范围由子弹体积驱动（实体化层数 → radius 翻倍 → 挥得更远）。
        // 没敌人 → 朝当前运动方向挥；最近敌人在范围外 → 挥空（视觉照常播）。
        const target = _nearestEnemyTo(w, b.x, b.y);
        const dirAngle = target
          ? Math.atan2(target.y - b.y, target.x - b.x)
          : (b.angle || 0);
        const halfAngle = Math.PI / 4;     // 半角 45° → 总扇形 90°
        const reach = aoeRadius(b, AOE_MULT.swordSlash);
        // 起手白光环（聚气）—— 半径跟随 reach 缩放
        w.particles.push(new Particle({
          x: b.x, y: b.y, life: 0.18, color: '#ffffff', size: reach * 0.32, type: 'ring',
        }));
        // 扇形 AOE：applyAoe 内部画 SlashArc + 自带 shake / hit-stop
        const hits = applyAoe(w, b, {
          kind: 'cone', damage: b.attack, mult: AOE_MULT.swordSlash,
          halfAngle, dirAngle, color: '#f1f4f8',
        });
        // 沿扇形边缘洒一圈细火花，强化"挥过"的范围感
        const sparks = 14;
        for (let i = 0; i <= sparks; i++) {
          const t = i / sparks;
          const a = dirAngle - halfAngle + halfAngle * 2 * t;
          const ex = b.x + Math.cos(a) * reach;
          const ey = b.y + Math.sin(a) * reach;
          const vx = Math.cos(a) * (60 + Math.random() * 80);
          const vy = Math.sin(a) * (60 + Math.random() * 80);
          w.particles.push(new Particle({
            x: ex, y: ey, vx, vy,
            life: 0.32 + Math.random() * 0.18,
            color: '#ffffff', size: 2.4,
          }));
        }
        // 剑士专属强化震屏（与 applyAoe 取 max）
        FX.shake(w, clamp(3 + b.attack * 0.4 + hits * 0.5, 3, 9), 0.18);
      }),
    ];
  }
}

class Card_注铅 extends Card {
  constructor() {
    super({
      id: 'leaded', name: '注铅',
      desc: '伤害+8，穿透-5，弹射-5。',
      cost: 3, rarity: 'common', fxType: 'bullet+',
      art: { emoji: '⚖' },
    });
  }
  initializeEffects() {
    // 高优先级（100）→ 在其它卡的 +bound / +penetrate 之后强制 -5（最低 0）
    return [
      new Effect(Phase.PreActive, 100, ctx => {
        ctx.bullet.attack += 8;
        ctx.bullet.bound = Math.max(0, ctx.bullet.bound - 5);
        ctx.bullet.penetrate = Math.max(0, ctx.bullet.penetrate - 5);
      }),
    ];
  }
}

// ─── 史诗 ──────────────────────────────────────────────────────────
class Card_双重施法 extends Card {
  constructor() {
    super({
      id: 'doublecast', name: '双重施法',
      desc: '波次+1，伤害+1。',
      cost: 2, rarity: 'epic', fxType: 'wave',
      art: { emoji: '✨' },
    });
  }
  initializeEffects() {
    return [new Effect(Phase.PreActive, 0, ctx => {
      ctx.bullet.waveCount += 1;
      ctx.bullet.attack += 1;
    })];
  }
}

// ─── 稀有 ──────────────────────────────────────────────────────────
class Card_燃烧弹 extends Card {
  constructor() {
    super({
      id: 'firebomb', name: '燃烧弹',
      desc: '摧毁时对范围内的敌人施加2层燃烧。',
      cost: 2, rarity: 'rare', fxType: 'fire',
      art: { emoji: '💣' },
    });
  }
  initializeEffects() {
    return [new Effect(Phase.Destroyed, 0, ctx => {
      const w = ctx.world || window.__game;
      if (!w) return;
      applyAoe(w, ctx.bullet, {
        damage: 0, mult: AOE_MULT.arcaneExplode, target: 'enemies',
        knockback: false,
        onHit: (e) => applyFire(e, 2),
      });
    })];
  }
}

class Card_引信 extends Card {
  constructor() {
    super({
      id: 'fuse', name: '引信',
      desc: '实体化+2。每回合向周围敌人施加1层燃烧。',
      cost: 3, rarity: 'rare', fxType: 'entity',
      art: { emoji: '🔥' },
    });
  }
  initializeEffects() {
    return [
      new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.entityLayers += 2; }),
      new Effect(Phase.Spawned, 0, ctx => {
        (ctx.bullet._entityDecos = ctx.bullet._entityDecos || []).push('wings');
      }),
      new Effect(Phase.EntityTurn, 0, ctx => {
        applyAoe(ctx.world, ctx.bullet, {
          damage: 0, mult: AOE_MULT.swordSlash, target: 'enemies',
          knockback: false, fx: false,
          onHit: (e) => applyFire(e, 1),
        });
        // 视觉：橙色环
        if (ctx.world) {
          ctx.world.particles.push(new Particle({
            x: ctx.bullet.x, y: ctx.bullet.y,
            life: 0.32, color: '#ff7030',
            size: aoeRadius(ctx.bullet, AOE_MULT.swordSlash) * 0.45, type: 'ring',
          }));
        }
      }),
    ];
  }
}

class Card_冲击波 extends Card {
  constructor() {
    super({
      id: 'shockwave', name: '冲击波',
      desc: '碰撞时造成范围伤害。',
      cost: 2, rarity: 'rare', fxType: 'aoe',
      art: { emoji: '💥' },
    });
  }
  initializeEffects() {
    return [
      new Effect(Phase.HitEnemy, 5, ctx => {
        applyAoe(ctx.world, ctx.bullet, {
          damage: ctx.bullet.attack, mult: AOE_MULT.arcaneExplode,
          target: 'enemies', exclude: ctx.enemy,
        });
      }),
      new Effect(Phase.HitWall, 5, ctx => {
        applyAoe(ctx.world, ctx.bullet, {
          damage: ctx.bullet.attack, mult: AOE_MULT.arcaneExplode,
          target: 'enemies',
        });
      }),
    ];
  }
}

class Card_奥术强化 extends Card {
  constructor() {
    super({
      id: 'arcaneboost', name: '奥术强化',
      desc: '洗入1张奥弹。你手牌中的奥弹伤害+1。',
      cost: 1, rarity: 'rare', fxType: 'arcane',
      art: { emoji: '✦' },
    });
  }
  // 无 bullet hook —— 走「buff」离场动画
  onUse(world) {
    // 当前手牌里的奥弹（含本次洗入前已有的）+1 攻击
    for (const c of world.deck.hand) {
      if (c.id === 'arcane_missile') c._arcBonus = (c._arcBonus || 0) + 1;
    }
    const newCard = new Card_奥弹();
    newCard._arcBonus = 1;   // 本次洗入的也带上 +1
    world.deck.shuffleIntoHand(newCard);
  }
}

// 衍生：奥弹（不在抽卡池）
class Card_奥弹 extends Card {
  constructor() {
    super({
      id: 'arcane_missile', name: '奥弹',
      desc: '发射一枚追踪弹。正面时立即自动触发，不消耗法力值。',
      cost: 0, discardCost: 0,    // 完全免费：使用 / 弃置都不扣法力
      rarity: 'epic', fxType: 'arcane',
      art: { emoji: '✷' },
    });
  }
  // 进入正面（边缘卡 / 主卡）→ 自动发射，自动销毁。不走 fireFromCards / 主卡 / 法力 / 连击。
  // 用 queueMicrotask 推迟一帧执行：避免在 _updateFaceUp 的 for 循环中修改 hand 数组。
  onReveal() {
    if (this._firing) return;
    this._firing = true;
    queueMicrotask(() => {
      const w = window.__game;
      if (!w || !w.deck.hand.includes(this) || !this.faceUp) {
        this._firing = false;
        return;
      }
      this._autoFire(w);
      this._lastAction = 'buff';   // 离场动画走"魔法效果"分支（紫色火花）
      w.deck.destroyCard(this);
    });
  }
  onConceal() {
    // 还没自动触发就被换走（如换主卡）→ 解除标记，让下次再次正面时仍能触发
    this._firing = false;
  }
  _autoFire(world) {
    const player = world.player;
    const target = nearestEnemy(world, player);
    const angle = target
      ? angleBetween(player.x, player.y, target.x, target.y)
      : (player.angle ?? -Math.PI / 2);
    const bullet = new Bullet({
      x: player.x, y: player.y,
      angle, speed: 380, lifetime: 3.5,
      attack: 1 + (this._arcBonus || 0),
      bound: 0, penetrate: 0, radius: 6,
    });
    bullet.isArcane = true;
    bullet.tracking = true;
    bullet.trackRate = 5;
    bullet.activate(performance.now() / 1000);
    world.bullets.push(bullet);
    // 紫色发射火花 + 炮台反冲
    if (player.notifyFired) player.notifyFired(world);
    for (let i = 0; i < 8; i++) {
      const a = Math.PI * 2 * Math.random();
      const sp = 50 + Math.random() * 80;
      world.particles.push(new Particle({
        x: player.x, y: player.y - 8,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30,
        life: 0.32, color: '#c97aff', size: 3,
      }));
    }
  }
}

// ─── 普通 ──────────────────────────────────────────────────────────
class Card_引燃 extends Card {
  constructor() {
    super({
      id: 'ignite', name: '引燃',
      desc: '命中时施加2层燃烧。',
      cost: 1, rarity: 'common', fxType: 'fire',
      art: { emoji: '🔥' },
    });
  }
  initializeEffects() {
    return [new Effect(Phase.PreActive, 0, ctx => {
      ctx.bullet._fireOnHit = (ctx.bullet._fireOnHit || 0) + 2;
      // _fireApplyHook 在所有阶段去重添加（同卡叠加靠 _fireOnHit 数值，hook 只挂一次）
      if (!ctx.bullet._fireHookAdded) {
        ctx.bullet.addHook(_fireApplyHook);
        ctx.bullet._fireHookAdded = true;
      }
    })];
  }
}

class Card_怒吼 extends Card {
  constructor() {
    super({
      id: 'roar', name: '怒吼',
      desc: '获得1层连携。',
      cost: 1, rarity: 'common', fxType: 'combo',
      art: { emoji: '📢' },
    });
  }
  onUse(world) { world.addComboStacks(1); }
}

class Card_光子枪 extends Card {
  constructor() {
    super({
      id: 'photongun', name: '光子枪',
      desc: '穿透+2，弹射+4。速度大幅提高。',
      cost: 2, rarity: 'common', fxType: 'pierce',
      art: { emoji: '🔫' },
    });
  }
  initializeEffects() {
    return [new Effect(Phase.PreActive, 0, ctx => {
      ctx.bullet.penetrate += 2;
      ctx.bullet.bound += 4;
      ctx.bullet.speed *= 1.6;
    })];
  }
}

class Card_热气球 extends Card {
  constructor() {
    super({
      id: 'hotair', name: '热气球',
      desc: '伤害+1，体积增大。',
      cost: 1, rarity: 'common', fxType: 'bullet+',
      art: { emoji: '🎈' },
    });
  }
  initializeEffects() {
    return [new Effect(Phase.PreActive, 0, ctx => {
      ctx.bullet.attack += 1;
      ctx.bullet.radius *= 1.6;
    })];
  }
}

class Card_城墙 extends Card {
  constructor() {
    super({
      id: 'wall', name: '城墙',
      desc: '伤害-99。实体化+5。体积大幅增加。',
      cost: 2, rarity: 'common', fxType: 'entity',
      art: { emoji: '🧱' },
    });
  }
  initializeEffects() {
    return [new Effect(Phase.PreActive, 100, ctx => {
      ctx.bullet.attack = Math.max(0, ctx.bullet.attack - 99);
      ctx.bullet.entityLayers += 5;
      ctx.bullet.radius *= 2;
      ctx.bullet.speed *= 0.5;
    })];
  }
}

class Card_乘胜追击 extends Card {
  constructor() {
    super({
      id: 'followup', name: '乘胜追击',
      desc: '伤害+1。如果所有正面牌的消耗值大于6，则获得2层连携。',
      cost: 1, rarity: 'common', fxType: 'combo',
      art: { emoji: '⚡' },
    });
  }
  initializeEffects() {
    return [new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.attack += 1; })];
  }
  onUse(world) {
    // 正面牌：主卡（始终正面）+ 当前手牌中所有 faceUp 的卡（边缘）。
    // 注意：本卡此时已被 takeSide 移出 hand，所以无需排除。
    const main = world.deck.mainCard;
    let total = main ? main.cost : 0;
    for (const c of world.deck.hand) {
      if (c.faceUp) total += c.cost;
    }
    if (total > 6) world.addComboStacks(2);
  }
}

class Card_滚石 extends Card {
  constructor() {
    super({
      id: 'boulder', name: '滚石',
      desc: '穿透+99，弹射-99。速度降低，体积大幅增加。',
      cost: 3, rarity: 'common', fxType: 'pierce',
      art: { emoji: '🪨' },
    });
  }
  initializeEffects() {
    return [new Effect(Phase.PreActive, 100, ctx => {
      ctx.bullet.penetrate += 99;
      ctx.bullet.bound = 0;
      ctx.bullet.speed *= 0.5;
      ctx.bullet.radius *= 2.5;
    })];
  }
}

class Card_磁轨 extends Card {
  constructor() {
    super({
      id: 'railgun', name: '磁轨',
      desc: '穿透+2。穿透敌人时，速度提高。',
      cost: 1, rarity: 'common', fxType: 'pierce',
      art: { emoji: '⚡' },
    });
  }
  initializeEffects() {
    return [
      new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.penetrate += 2; }),
      // 命中前 b.penetrate >= 1 表示本次会穿透 → 命中后会 penetrate--；这里先加速
      new Effect(Phase.HitEnemy, 5, ctx => {
        if (ctx.bullet.penetrate >= 1) ctx.bullet.speed *= 1.3;
      }),
    ];
  }
}

class Card_散弹 extends Card {
  constructor() {
    super({
      id: 'scatter', name: '散弹',
      desc: '数量+2。伤害会随着经过距离增加而降低。',
      cost: 1, rarity: 'common', fxType: 'bullet+',
      art: { emoji: '🌫' },
    });
  }
  initializeEffects() {
    return [
      new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.bulletCount += 2; }),
      new Effect(Phase.Spawned, 0, ctx => {
        const b = ctx.bullet;
        b._scatterStartX = b.x;
        b._scatterStartY = b.y;
        b._scatterBaseAttack = b.attack;
      }),
      new Effect(Phase.HitEnemy, -2, ctx => {
        const b = ctx.bullet;
        if (b._scatterBaseAttack == null) return;
        const dx = b.x - b._scatterStartX;
        const dy = b.y - b._scatterStartY;
        const dist = Math.hypot(dx, dy);
        // 跨越半个场地高度（280px），伤害 -1；最多减 2
        const drop = Math.min(2, Math.floor(dist / 280));
        b.attack = Math.max(0, b._scatterBaseAttack - drop);
      }),
    ];
  }
}

class Card_奥术礼花 extends Card {
  constructor() {
    super({
      id: 'arcane_firework', name: '奥术礼花',
      desc: '洗入2张奥弹。',
      cost: 1, rarity: 'common', fxType: 'arcane',
      art: { emoji: '🎆' },
    });
  }
  onUse(world) {
    for (let i = 0; i < 2; i++) world.deck.shuffleIntoHand(new Card_奥弹());
  }
}

class Card_烫土豆 extends Card {
  constructor() {
    super({
      id: 'hotpotato', name: '烫土豆',
      desc: '弹射+5。弹射时，为一个随机敌人施加2层燃烧。',
      cost: 2, rarity: 'common', fxType: 'fire',
      art: { emoji: '🥔' },
    });
  }
  initializeEffects() {
    return [
      new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.bound += 5; }),
      new Effect(Phase.HitWall, 5, ctx => {
        if (ctx.bullet.bound <= 0) return;   // 即将销毁的撞墙不算弹射
        const w = ctx.world || window.__game;
        if (!w) return;
        const alive = w.enemies.filter(e => e.alive);
        if (alive.length === 0) return;
        const e = alive[randInt(0, alive.length - 1)];
        applyFire(e, 2);
      }),
    ];
  }
}

class Card_燃料匣 extends Card {
  constructor() {
    super({
      id: 'fuelcell', name: '燃料匣',
      desc: '穿透+1，弹射+2。穿透燃烧敌人时穿透+1。',
      cost: 1, rarity: 'common', fxType: 'fire',
      art: { emoji: '⛽' },
    });
  }
  initializeEffects() {
    return [
      new Effect(Phase.PreActive, 0, ctx => {
        ctx.bullet.penetrate += 1;
        ctx.bullet.bound += 2;
      }),
      new Effect(Phase.HitEnemy, 5, ctx => {
        // 燃烧敌人 + 本次会穿透（penetrate >= 1 在 default 扣减前）→ penetrate +1
        if (ctx.enemy && (ctx.enemy.fire || 0) > 0 && ctx.bullet.penetrate >= 1) {
          ctx.bullet.penetrate += 1;
        }
      }),
    ];
  }
}

// 起手卡：1 费、伤害 +1。仅作为初始 bag 的填充卡，不进入 Loot 抽卡池（不加入 ALL_CARD_CTORS）。
class Card_强化 extends Card {
  constructor() {
    super({
      id: 'boost1', name: '强化',
      desc: '伤害+1',
      cost: 1, rarity: 'common', fxType: 'bullet+',
      art: { emoji: '➕' },
    });
  }
  initializeEffects() {
    return [new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.attack += 1; })];
  }
}

// 抽卡池（26 张）。不含：
//   - Card_强化（起手卡，不入池）
//   - Card_奥弹（衍生卡，由 奥术强化 / 奥术礼花 洗入）
//   - 策划表中标注「不启用」的：帽子戏法 / 节拍器 / 预知
//   - 流星雨（已下线）
const ALL_CARD_CTORS = [
  // 传说 (2)
  Card_墨镜, Card_凝视,
  // 史诗 (4)
  Card_流线型, Card_鱼目混珠, Card_吸血蝙蝠, Card_双重施法,
  // 稀有 (7)
  Card_狙击, Card_风之眼, Card_剑士, Card_燃烧弹, Card_引信, Card_冲击波, Card_奥术强化,
  // 普通 (13)
  Card_注铅, Card_引燃, Card_怒吼, Card_光子枪, Card_热气球, Card_城墙, Card_乘胜追击,
  Card_滚石, Card_磁轨, Card_散弹, Card_奥术礼花, Card_烫土豆, Card_燃料匣,
];

// ─── 抽卡 / 稀有度 ──────────────────────────────────────────────────
// 参考自走棋：等级越高越容易刷到高稀有度。普通:蓝:紫:橙 整体设计比例 7:4:2:1
// 概率表 sum = 1.0 / 行
// 每行 sum = 1.00。Lv 8（满级）目标：普通 40% / 稀有 30% / 史诗 20% / 传说 10%。
// 从 Lv 1（全普通）平滑过渡：Lv 2 引入稀有，Lv 3 引入史诗，Lv 4 引入传说。
const RARITY_PROB = {
  1: { common: 1.00, rare: 0.00, epic: 0.00, legendary: 0.00 },
  2: { common: 0.90, rare: 0.10, epic: 0.00, legendary: 0.00 },
  3: { common: 0.80, rare: 0.15, epic: 0.05, legendary: 0.00 },
  4: { common: 0.70, rare: 0.20, epic: 0.08, legendary: 0.02 },
  5: { common: 0.62, rare: 0.24, epic: 0.11, legendary: 0.03 },
  6: { common: 0.55, rare: 0.26, epic: 0.14, legendary: 0.05 },
  7: { common: 0.48, rare: 0.28, epic: 0.17, legendary: 0.07 },
  8: { common: 0.40, rare: 0.30, epic: 0.20, legendary: 0.10 },
};

// 卡牌稀有度索引（构造一次成本低）
const CARD_BY_RARITY = (() => {
  const map = { common: [], rare: [], epic: [], legendary: [] };
  for (const Ctor of ALL_CARD_CTORS) {
    const inst = new Ctor();
    if (map[inst.rarity]) map[inst.rarity].push(Ctor);
  }
  return map;
})();

function rollRarity(level) {
  const p = RARITY_PROB[Math.min(8, Math.max(1, level))];
  const r = Math.random();
  let acc = 0;
  for (const k of ['common', 'rare', 'epic', 'legendary']) {
    acc += p[k] || 0;
    if (r < acc) return k;
  }
  return 'common';
}

// 按等级抽 1 张卡：先 roll 稀有度，再从该稀有度池随机选；池空则降级到 common
function drawRandomCard(level) {
  let rarity = rollRarity(level);
  let pool = CARD_BY_RARITY[rarity];
  if (!pool || pool.length === 0) {
    rarity = 'common';
    pool = CARD_BY_RARITY.common.length > 0 ? CARD_BY_RARITY.common : ALL_CARD_CTORS;
  }
  const Ctor = pool[randInt(0, pool.length - 1)];
  return new Ctor();
}

// ─── 6. CardDeck / Combo ────────────────────────────────────────────
// bag 是「拥有的全部卡」的 ground truth（固定 10 张）。bag[0] 是主卡。
// hand / discard 只在战斗中存在；每次开战前 resetForBattle 从 bag 重洗。
// 这样 Inventory 编辑（拖拽 / 替换 / 设主卡）只动 bag 数组，逻辑清晰。
class CardDeck {
  constructor() {
    this.world = null;      // 反向引用，由 World 构造时注入；衍生卡 / 召唤需要
    this.bag = [];          // ground truth: 10 张
    this.hand = [];         // 战斗中：场上手牌（开战时 = 全部非主卡，用一张少一张）
    this.discard = [];      // 战斗中：弃牌堆（手牌空时全部洗回）
  }

  setBag(cards) {
    this.bag = cards;
    for (const c of this.bag) c.faceUp = false;
    // 主卡始终面朝上（含展露效果激活）
    if (this.bag[0]) this._setFace(this.bag[0], true);
    this.hand = [];
    this.discard = [];
    Events.emit('bagChanged');
    Events.emit('deckChanged');
  }

  // 战斗开始前 / 商店关闭后调用：把全部非主卡摆到手牌 + Fisher-Yates 随机打乱
  resetForBattle() {
    // 先关闭所有可能开着的展露（防止重复订阅 / 旧主卡的事件残留）
    for (const c of this.bag) {
      if (c.faceUp) { c.onConceal(); c.faceUp = false; }
    }
    this._setFace(this.bag[0], true);
    this.hand = this.bag.slice(1);
    // Fisher–Yates 洗牌
    for (let i = this.hand.length - 1; i > 0; i--) {
      const j = randInt(0, i);
      [this.hand[i], this.hand[j]] = [this.hand[j], this.hand[i]];
    }
    this.discard = [];
    this._updateFaceUp();
    Events.emit('deckChanged');
  }

  // 战斗结束 / Inventory 模式：清场（边缘卡解除事件订阅，主卡始终保持面朝上）
  clearBattleState() {
    for (let i = 0; i < this.bag.length; i++) {
      const c = this.bag[i];
      if (i === 0) continue;        // 主卡：不动（始终面朝上）
      if (c.faceUp) { c.onConceal(); c.faceUp = false; }
    }
    this.hand = [];
    this.discard = [];
    Events.emit('deckChanged');
  }

  // ===== Inventory 编辑 API =====
  swap(i, j) {
    if (i === j || i < 0 || j < 0 || i >= this.bag.length || j >= this.bag.length) return;
    [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
    // 主卡始终面朝上：交换涉及索引 0 时，旧主卡换到非 0 位置 → 面朝下；新主卡 → 面朝上
    if (i === 0 || j === 0) {
      const oldMainIdx = i === 0 ? j : i;
      const oldMain = this.bag[oldMainIdx];
      if (oldMain.faceUp) { oldMain.onConceal(); oldMain.faceUp = false; }
      this._setFace(this.bag[0], true);
    }
    Events.emit('bagChanged');
  }

  replaceAt(i, newCard) {
    if (i < 0 || i >= this.bag.length) return;
    const old = this.bag[i];
    if (old.faceUp) { old.onConceal(); old.faceUp = false; }
    this.bag[i] = newCard;
    newCard.faceUp = false;
    // 主卡槽位被替换 → 新主卡始终面朝上
    if (i === 0) this._setFace(newCard, true);
    Events.emit('bagChanged');
  }

  setAsMain(i) {
    if (i <= 0 || i >= this.bag.length) return;
    this.swap(0, i);
  }

  get mainCard() { return this.bag[0]; }

  // 手牌空 + 弃牌堆非空 → 全部洗回手牌（"打完一手才洗牌"）
  _reshuffleIfEmpty() {
    if (this.hand.length > 0 || this.discard.length === 0) return;
    this.hand = this.discard;
    this.discard = [];
    // Fisher–Yates
    for (let i = this.hand.length - 1; i > 0; i--) {
      const j = randInt(0, i);
      [this.hand[i], this.hand[j]] = [this.hand[j], this.hand[i]];
    }
    this._updateFaceUp();
  }

  // 边缘卡 (最左 / 最右) 展露
  _updateFaceUp() {
    for (let i = 0; i < this.hand.length; i++) {
      const isEdge = i === 0 || i === this.hand.length - 1;
      this._setFace(this.hand[i], isEdge);
    }
  }

  _setFace(card, faceUp) {
    if (card.faceUp === faceUp) return;
    card.faceUp = faceUp;
    if (faceUp) card.onReveal();
    else card.onConceal();
  }

  // 使用左侧 / 右侧；side: 'left' | 'right'。返回拿到的卡或 null
  takeSide(side) {
    if (this.hand.length === 0) return null;
    return side === 'left' ? this.hand.shift() : this.hand.pop();
  }

  toDiscard(card) {
    this._setFace(card, false);
    this.discard.push(card);
    this._updateFaceUp();        // 边缘卡可能变了，重算 face-up
    Events.emit('deckChanged');
    // 手牌打空了 → 延迟洗回，让被使用的卡的 leaving 动画完成，避免"瞬移到新位置"
    if (this.hand.length === 0 && this.discard.length > 0) {
      setTimeout(() => {
        this._reshuffleIfEmpty();
        Events.emit('deckChanged');
      }, 350);
    }
  }

  // 销毁卡牌：从 hand / discard 移除（衍生卡触发后销毁自身）
  destroyCard(card) {
    // 默认按 "buff" 离场（衍生卡如奥术飞弹自毁场景视觉等同于"魔法效果"）
    if (!card._lastAction) card._lastAction = 'buff';
    let removed = false;
    const i = this.hand.indexOf(card);
    if (i >= 0) { this.hand.splice(i, 1); removed = true; }
    const j = this.discard.indexOf(card);
    if (j >= 0) { this.discard.splice(j, 1); removed = true; }
    if (removed) {
      this._setFace(card, false);
      this._updateFaceUp();
      Events.emit('deckChanged');
      // 手牌空了（最后一张奥弹自毁等情况）→ 延迟洗回，与 toDiscard 同步：让 leaving 动画完成
      if (this.hand.length === 0 && this.discard.length > 0) {
        setTimeout(() => {
          this._reshuffleIfEmpty();
          Events.emit('deckChanged');
        }, 350);
      }
    }
  }

  // 洗入：随机插入手牌 + 重算边缘（落在边缘的卡会自动触发 onReveal）
  // 通常配合洗入号令 / 奥弹之书 等"洗入时触发"卡：emit shuffledIn 事件
  shuffleIntoHand(card) {
    const idx = randInt(0, this.hand.length);
    this.hand.splice(idx, 0, card);
    this._updateFaceUp();
    Events.emit('deckChanged');
    Events.emit('shuffledIn', card);     // 洗入号令 / 奥弹之书 监听此事件
  }

  // 弃置 n 张随机反面手牌（战术撤退用）。返回实际弃置的卡数组。
  discardRandomFaceDown(n) {
    const faceDown = this.hand.filter(c => !c.faceUp);
    const discarded = [];
    for (let i = 0; i < Math.min(n, faceDown.length); i++) {
      const idx = randInt(0, faceDown.length - i - 1);
      const card = faceDown.splice(idx, 1)[0];
      const hi = this.hand.indexOf(card);
      if (hi >= 0) this.hand.splice(hi, 1);
      this.discard.push(card);
      discarded.push(card);
    }
    this._updateFaceUp();
    Events.emit('deckChanged');
    return discarded;
  }
}

class ComboManager {
  constructor() {
    this.lastSide = null;
    this.combo = 0;
    this.lastBumpTime = -10;        // 上次变化时间（驱动 canvas overlay 缩放动画）
    this.unbreakableNext = false;   // 帽子戏法：下一个操作不会中断连击
  }
  onUse(side) {
    // 帽子戏法 buff：换侧也不重置，按"延续"处理
    if (this.unbreakableNext && this.lastSide !== null
        && this.lastSide !== 'any' && side !== 'any' && this.lastSide !== side) {
      this.unbreakableNext = false;
      this.combo++; this.lastSide = side;
    } else if (this.lastSide === null) {
      this.combo = 0; this.lastSide = side;
    } else if (this.lastSide === 'any' || side === 'any' || this.lastSide === side) {
      this.combo++; this.lastSide = side === 'any' ? 'any' : side;
    } else {
      this.combo = 0; this.lastSide = side;
    }
    this.lastBumpTime = performance.now() / 1000;
    Events.emit('comboChanged', this.combo);
  }
  reset() {
    // 帽子戏法：若 buff 待生效则吃掉本次 reset
    if (this.unbreakableNext) {
      this.unbreakableNext = false;
      return;
    }
    this.lastSide = null; this.combo = 0;
    Events.emit('comboChanged', this.combo);
  }
}

// ─── 7. BattleManager ───────────────────────────────────────────────
// 状态机扩展：胜利后走 Reward (3 选 1) → Inventory (背包编辑) → Idle
// 失败仍走 PostBattle → Idle
const State = Object.freeze({
  Idle: 'Idle',
  PreBattle: 'PreBattle',
  Battle: 'Battle',
  PostBattle: 'PostBattle',
  Reward: 'Reward',       // 胜利后 3 选 1 升级
  Inventory: 'Inventory', // 背包编辑（替换 / 拖拽 / 设主卡）
});

class BattleManager {
  constructor(world) {
    this.world = world;
    this.state = State.Idle;
    this.waveIndex = 0;
    this.waveTimer = 0;
    this.killCount = 0;
    this.targetKills = 5;
    // 回合制
    this.turn = 'player';            // 'player' | 'enemy'
    this.enemyTurnTimer = 0;
    this.enemyTurnDuration = 0.5;    // 怪物回合持续时间（玩家也可同步射击）
    this.autoEndOnZeroMana = false;  // 设置：水晶用尽自动结束回合
    this.autoEndOnNoEnemy = false;   // 设置：场上无敌人时自动结束回合，并把剩余法力转为金币（1:1）
    this.resumeAfterLoot = false;    // Loot 面板「继续」按钮：true=恢复战斗、false=开新战斗
    // 奥弹 buff：本回合所有奥弹叠加。turn 切换时清空
    this.arcaneBuffs = {};           // { doubleDamage, explode, knockback, refundMana, overload, echo }
    this.arcaneNextDouble = 0;       // 奥光：下 N 颗奥弹伤害 ×2
    this.summonBuffActive = false;   // 军团统帅：本回合召唤的单位 HP+100% 攻+2
    this.summonOverTurns = [];       // 持续召唤队列：[{ remaining: 3, kind: 'soldier' }]
    // 波次系统
    this.turnNumber = 0;             // 当前已过去的敌方回合数
    this.waveNumber = 0;             // 已生成的波次数（0 = 还没开始 / 第一波）
    this.turnsUntilWave = 0;         // 距下一波的回合数（0 = 本回合 spawn）
    this.nextWaveTypes = null;       // 下一波预览（数组 of typeKey），UI 显示
    this.rewardTurn = false;         // 当前是否奖励回合（特殊视觉 + 金球）
    this._rewardHits = 0;            // 奖励回合期间击中金球的累计次数
    this._enemyPhasePending = false; // 我方阶段进行中（敌人 update + 回合计时器都暂停）
    // 玩家击杀才计数；接触自爆不算
    Events.on('enemyDied', () => { this.killCount++; });
  }

  setState(s) {
    this.state = s;
    Events.emit('stateChanged', s);
  }

  setTurn(t) {
    if (this.turn === t) return;
    this.turn = t;
    // 回合切换：清空本回合奥弹 buff / 召唤 buff
    this.arcaneBuffs = {};
    this.arcaneNextDouble = 0;
    this.summonBuffActive = false;
    // 玩家回合开始：护甲重置为 armorPerTurn
    if (t === 'player') {
      const p = this.world.player;
      p.armor = p.armorPerTurn || 3;
      Events.emit('armorChanged', p.armor);
    }
    // 进入敌方回合：分两阶段串行执行（我方 → 敌方）
    //   阶段 1（我方）：实体效果（剑士挥剑、蝙蝠射子弹）+ 我方召唤队列 + 友军衰减 + 召唤物发射
    //                  实体效果用 setTimeout 摊到 0~810ms 播放，是唯一的异步部分
    //   阶段 2（敌方）：等阶段 1 跑完（场上有实体子弹时延后 850ms）→ 波次 spawn + 敌人 intent
    //                  阶段 1 进行中：_enemyPhasePending=true，敌人 update + 回合计时器都暂停
    // 火焰已移到 endPlayerTurn（玩家回合结束触发）
    if (t === 'enemy') {
      // 阶段 1：我方
      this._tickEntityBullets();
      this._tickSummonOverTurns();
      this._tickFriendlyDecay();
      this._tickSummonFire();
      // 阶段 2：敌方（场上有实体子弹 → 延后 850ms，让阶段 1 完整结算后再进入）
      const hasEntity = this.world.bullets.some(b => b.alive && b.isEntity);
      if (hasEntity) {
        this._enemyPhasePending = true;
        setTimeout(() => {
          this._enemyPhasePending = false;
          this._tickWaveSpawn();
          this._tickEnemyIntents();
        }, 850);
      } else {
        this._tickWaveSpawn();
        this._tickEnemyIntents();
      }
    }
    Events.emit('turnChanged', t);
  }

  // 火焰层数结算：每个有火焰的敌人受 stacks 伤害，然后 stacks-1（自然衰减）
  _tickFireDamage() {
    const w = this.world;
    for (const e of w.enemies) {
      if (!e.alive || (e.fire || 0) <= 0) continue;
      const dmg = e.fire;
      e.takeDamage(dmg);
      FX.damage(w, e.x, e.y - e.radius, dmg);
      // 火焰小特效（橙色火星）
      for (let i = 0; i < 5; i++) {
        const a = Math.PI * 2 * Math.random();
        const sp = 50 + Math.random() * 80;
        w.particles.push(new Particle({
          x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30,
          life: 0.32, color: '#ff7030', size: 3,
        }));
      }
      if (e.alive) e.fire = Math.max(0, e.fire - 1);
    }
  }

  // 敌人意图推进（cooldown - 1，到 0 触发并切换到下个 intent）
  _tickEnemyIntents() {
    const w = this.world;
    for (const e of w.enemies) {
      if (e.alive) e.onTurnStart(w);
    }
  }

  // 实体化子弹：每个敌方回合开始前依次触发 EntityTurn 钩子 + 层数 -1。层数 0 → 销毁。
  // 同一颗子弹叠加多个实体卡（如双剑士、剑士+蝙蝠）时，钩子按 0.75/N 秒间隔依次播放，
  // 让玩家能感知每次实体效果（挥剑 / 射蝙蝠子弹）是独立的两次判定，而不是糊在一帧里。
  _tickEntityBullets() {
    const w = this.world;
    for (const b of w.bullets) {
      if (!b.alive || !b.isEntity) continue;
      const entityHooks = b.hooks
        .filter(h => h.phase === Phase.EntityTurn)
        .sort((x, y) => x.priority - y.priority);
      const n = entityHooks.length;
      if (n === 0) {
        // 无 EntityTurn 钩子（纯坦克实体）→ 仅扣一层即可
        b.entityLayers--;
        if (b.entityLayers <= 0) {
          b.triggerHooks(Phase.Destroyed, { world: w });
          b.alive = false;
        }
        continue;
      }
      const staggerMs = (0.75 / n) * 1000;
      for (let i = 0; i < n; i++) {
        const hook = entityHooks[i];
        const ent = b;
        setTimeout(() => {
          if (!ent.alive) return;
          hook.execute({ bullet: ent, world: w, handled: false });
        }, i * staggerMs);
      }
      // 所有 EntityTurn 钩子播完之后再扣 1 层（整颗实体每回合仅扣 1，不论多少个挥剑钩子）
      const lastFireMs = (n - 1) * staggerMs;
      setTimeout(() => {
        if (!b.alive) return;
        b.entityLayers--;
        if (b.entityLayers <= 0) {
          b.triggerHooks(Phase.Destroyed, { world: w });
          b.alive = false;
        }
      }, lastFireMs + 60);
    }
  }

  // 持续召唤队列推进（如召唤增援：接下来 3 敌方回合每回合 +1 士兵）
  _tickSummonOverTurns() {
    const w = this.world;
    const remaining = [];
    for (const job of this.summonOverTurns) {
      job.remaining--;
      if (job.kind) spawnSummon(w, job.kind);
      if (job.remaining > 0) remaining.push(job);
    }
    this.summonOverTurns = remaining;
  }

  // 友方召唤物每个敌方回合开始 -decayRate HP（防堆积）。死亡的清出。
  // 军团统帅 buff (_noDecay) 跳过衰减；decayRate=0 (如工兵) 不衰减
  _tickFriendlyDecay() {
    const w = this.world;
    if (!w.summons) return;
    for (let i = w.summons.length - 1; i >= 0; i--) {
      const s = w.summons[i];
      if (s._noDecay) continue;
      const rate = s.decayRate ?? 1;
      if (rate <= 0) continue;
      s.hp -= rate;
      if (s.hp <= 0) { s.alive = false; }
    }
    w.summons = w.summons.filter(s => s.alive);
  }

  // 敌方回合开始：所有召唤物按 cooldown 决定发射
  _tickSummonFire() {
    const w = this.world;
    if (!w.summons) return;
    for (const s of w.summons) {
      if (!s.alive || !s.canFire) continue;
      s.cdCounter--;
      if (s.cdCounter <= 0) {
        s.cdCounter = s.cooldown;
        s.fireOnce(w);
      }
    }
  }

  startBattle() {
    // Battle / PreBattle / Reward / Inventory 中不响应（Inventory 由「继续」按钮专门处理）
    if (this.state === State.Battle || this.state === State.PreBattle
        || this.state === State.Reward || this.state === State.Inventory) return;
    // 上一局阵亡后重开：完整重置玩家进度（等级 / 卡组 / 金币 / 商店 / 计分等）
    if (this.state === State.PostBattle) {
      this.world.resetForNewGame();
    }
    this.world.player.hp = this.world.player.maxHp;
    this.world.player.mana = this.world.player.maxMana;
    this.world.player.shield = 0;
    this.world.player.armor = this.world.player.armorPerTurn || 3;
    Events.emit('armorChanged', this.world.player.armor);
    this.world.enemies.length = 0;
    this.world.bullets.length = 0;
    this.world.combo.reset();
    this.world.addComboStacks(-999);    // 重置 stacks
    this.world.summons = [];
    this.world.deck.resetForBattle();
    this.killCount = 0;
    this.waveIndex = 0;
    this.waveTimer = 0;
    this.resumeAfterLoot = false;
    // 波次系统重置
    this.turnNumber = 0;
    this.waveNumber = 0;
    this.turnsUntilWave = 0;        // 第 1 个敌方回合就 spawn 第 1 波
    this.rewardTurn = false;
    this._rewardHits = 0;
    this._planNextWave();
    this.setTurn('player');
    this.enemyTurnTimer = 0;
    this.setState(State.PreBattle);
    setTimeout(() => {
      this.setState(State.Battle);
      // 立即生成第 0 波（按 Enter 后即可见敌人，不必等首个敌方回合）
      this._spawnPlannedWave();
      this.waveNumber++;
      this.turnsUntilWave = this._waveInterval();
      this._planNextWave();
    }, 800);
  }

  endPlayerTurn() {
    if (this.state !== State.Battle || this.turn !== 'player') return;
    // 在 _afterPlayerTurnComplete 把法力回满到 10 之前，把剩余水晶累计到背包打开折扣里
    const leftover = Math.floor(this.world.player.mana || 0);
    if (leftover > 0) {
      this.world.inventoryDiscount = Math.min(10, (this.world.inventoryDiscount || 0) + leftover);
      Events.emit('inventoryDiscountChanged', this.world.inventoryDiscount);
    }
    // 流程：玩家回合结束 → 火焰结算 → 有商店则开店（暂停一切活动）→ 商店退出后才走我方 / 敌方阶段
    this._tickFireDamage();
    if (this.world.pendingShops > 0) {
      this.resumeAfterLoot = true;       // 商店关闭后由 continue 按钮 → _afterPlayerTurnComplete
      this.setState(State.Reward);
      return;
    }
    this._afterPlayerTurnComplete();
  }

  // 玩家回合"完整结束"之后的统一处理（不洗牌 — 手牌保留；只回满法力 + 进敌方回合）
  // 洗牌发生在商店关闭后（继续按钮内调 resetForBattle）
  _afterPlayerTurnComplete() {
    this.world.player.mana = this.world.player.maxMana;
    this.setTurn('enemy');
    this.enemyTurnTimer = this.enemyTurnDuration;
    // 重置沉淀状态：每次进入敌方回合都从"未沉淀"开始
    this._enemySettling = false;
    this._enemySettleTimer = 0;
  }

  // 商店关闭后调用：直接进入新的玩家回合（敌方回合已经在商店之前结算完了）
  _startNewPlayerTurn() {
    this.world.player.mana = this.world.player.maxMana;
    this.setTurn('player');     // 重置护甲等
    this.enemyTurnTimer = 0;
  }

  // 战斗只在阵亡时结束（没有"胜利"概念 - 关卡是无限的，只通过升级触发 Loot）
  endBattle() {
    this.world.enemies.length = 0;
    this.world.bullets.length = 0;
    this.world.summons.length = 0;
    this.summonOverTurns = [];
    this.world.deck.clearBattleState();
    this.setState(State.PostBattle);
    toast(t('enter_to_restart'), 2.5);
  }

  update(dt) {
    if (this.state !== State.Battle) return;

    // 怪物回合倒计时 → 行动结束后 0.75s 沉淀窗口（让挥剑、爆炸、AOE 等特效与扣血结算完成）
    // 阶段 1 (_enemyPhasePending) 进行中 → 不递减计时器，等我方实体效果跑完才正式开始敌方阶段
    if (this.turn === 'enemy' && !this._enemyPhasePending) {
      if (!this._enemySettling) {
        this.enemyTurnTimer -= dt;
        if (this.enemyTurnTimer <= 0) {
          this._enemySettling = true;
          this._enemySettleTimer = 0.75;
        }
      } else {
        this._enemySettleTimer -= dt;
        if (this._enemySettleTimer <= 0) {
          this._enemySettling = false;
          this._enemySettleTimer = 0;
          // 敌方结算完成 → 直接进入玩家回合（商店改到 endPlayerTurn 处理，敌方回合期间的击杀留到下个 endPlayerTurn）
          this.setTurn('player');
        }
      }
    }

    // 设置：场上无敌人时自动结束回合（金球 / 奖励目标不算敌人，不阻塞）
    // 触发时把剩余法力 1:1 转为金币（鼓励无敌人时直接跳过）
    if (this.autoEndOnNoEnemy && this.turn === 'player'
        && !this.world.enemies.some(e => e.alive && !e._isReward)) {
      if (this._fieldClearForAutoEnd()) {
        this._autoEndNoEnemySettleTime = (this._autoEndNoEnemySettleTime || 0) + dt;
        if (this._autoEndNoEnemySettleTime > 0.5) {
          this._autoEndNoEnemySettleTime = 0;
          const bonus = Math.floor(this.world.player.mana);
          if (bonus > 0) {
            this.world.gold += bonus;
            Events.emit('goldChanged', this.world.gold);
            toast(`+${bonus} 💰`, 0.8);
          }
          this.endPlayerTurn();
          return;
        }
      } else {
        this._autoEndNoEnemySettleTime = 0;
      }
    } else {
      this._autoEndNoEnemySettleTime = 0;
    }

    // 设置：法力无法使用任何卡牌时自动结束回合
    // —— 等场上所有子弹与待发的奥弹（衍生卡链）全部结算完后才真的切回合
    if (this.autoEndOnZeroMana && this.turn === 'player'
        && this.world.player.mana < this._minUsableCost()) {
      if (this._fieldClearForAutoEnd()) {
        // settle 窗口：覆盖奥弹链 setTimeout 之间的短暂空档（30/60/110ms）
        this._autoEndSettleTime = (this._autoEndSettleTime || 0) + dt;
        if (this._autoEndSettleTime > 0.25) {
          this._autoEndSettleTime = 0;
          this._autoEndWaitTime = 0;
          this.endPlayerTurn();
        }
      } else {
        this._autoEndSettleTime = 0;
        // 安全阀：最长等 1 秒。实体子弹常驻不消失（剑士/吸血蝙蝠），不应让 auto-end 等 10s 才走
        this._autoEndWaitTime = (this._autoEndWaitTime || 0) + dt;
        if (this._autoEndWaitTime > 1) {
          this._autoEndWaitTime = 0;
          this._autoEndSettleTime = 0;
          this.endPlayerTurn();
        }
      }
    } else {
      this._autoEndSettleTime = 0;
      this._autoEndWaitTime = 0;
    }

    // 战斗只在阵亡时结束；选卡机会只来自升级，不来自击杀目标
    if (this.world.player.hp <= 0) this.endBattle();
  }

  // 自动结束回合是否可以触发：场上无子弹（实体子弹也视为"还在结算"，按设计不让自动切回合）
  _fieldClearForAutoEnd() {
    if (this.world.bullets.length > 0) return false;
    return true;
  }

  // 波次系统：每 m 回合（按 shopLevel）spawn 一波；每波价值 n 递增
  // m: 商店等级 [1..8] → 间隔 [2,2,2,3,3,3,4,4]
  // n: 波次 w（从 0 起）→ value = floor(8 + 2.5w + 0.1w²)（曲线放缓 — 前期接近原表，第 10 波 ~ 42 = 原值的 62%）
  // - w=0: 8  w=1: 10  w=2: 13  w=3: 16  w=5: 22  w=10: 42  w=15: 67  w=20: 98
  _waveInterval() {
    const m = [2, 2, 2, 3, 3, 3, 4, 4];
    return m[Math.min(7, Math.max(0, this.world.shopLevel - 1))];
  }
  _waveValue(w) {
    return Math.floor(8 + 2.5 * w + 0.1 * w * w);
  }

  // 背包式随机填充：把 targetValue 分配给敌人种类（贪心 + 随机）
  _pickEnemiesForValue(targetValue, allowedTypes) {
    const result = [];
    let remaining = targetValue;
    let safety = 60;
    while (remaining > 0 && safety-- > 0) {
      // 过滤可装入的种类
      const candidates = allowedTypes.filter(k => {
        const def = ENEMY_TYPES[k];
        return def && def.value > 0 && def.value <= remaining;
      });
      if (candidates.length === 0) break;
      const t = candidates[Math.floor(Math.random() * candidates.length)];
      result.push(t);
      remaining -= ENEMY_TYPES[t].value;
    }
    return result;
  }

  // 决定下一波敌人种类（不立刻 spawn，仅预览）
  _planNextWave() {
    const v = this._waveValue(this.waveNumber);
    const pool = SPAWN_POOL[Math.min(8, this.world.shopLevel)] || SPAWN_POOL[1];
    this.nextWaveTypes = this._pickEnemiesForValue(v, pool);
    Events.emit('waveChanged');
  }

  // 敌方回合开始：根据 turnsUntilWave 决定 spawn 波 / 奖励回合 / 什么都不做
  _tickWaveSpawn() {
    const w = this.world;
    // 奖励回合期间：上一回合的金球自动消失（活 1 回合）— 不再结算火焰（用户要求删除）
    if (this.rewardTurn) {
      w.enemies.length = 0;
      this.rewardTurn = false;
      this._rewardHits = 0;
    }
    this.turnNumber++;
    this.turnsUntilWave--;
    if (this.turnsUntilWave <= 0) {
      // 到点 spawn 当前规划的下一波
      this._spawnPlannedWave();
      this.waveNumber++;
      this.turnsUntilWave = this._waveInterval();
      this._planNextWave();
    } else {
      // 没到 spawn 时间：若场上无敌人 → 奖励回合
      const alive = w.enemies.filter(e => e.alive).length;
      if (alive === 0) {
        this._spawnRewardTurn();
      }
    }
  }

  _spawnPlannedWave() {
    if (!this.nextWaveTypes || this.nextWaveTypes.length === 0) {
      this._planNextWave();
    }
    for (const t of this.nextWaveTypes) this._spawnEnemy(t);
    this.nextWaveTypes = null;
  }

  _spawnRewardTurn() {
    this.rewardTurn = true;
    this._rewardHits = 0;
    const w = this.world;
    // 3 个金球使用预设槽位（左/中/右）+ 小扰动；保证彼此间距 >= 160
    const slotsBase = [
      { x: w.w * 0.28, y: w.h * 0.35 },
      { x: w.w * 0.50, y: w.h * 0.55 },
      { x: w.w * 0.72, y: w.h * 0.35 },
    ];
    for (let i = 0; i < 3; i++) {
      const base = slotsBase[i];
      const e = new Enemy(base.x + rand(-20, 20), base.y + rand(-20, 20), 'reward', w);
      // 梯形内 clamp
      const tb = trapBounds(w, e.y);
      e.x = clamp(e.x, tb.leftX + e.radius + 8, tb.rightX - e.radius - 8);
      e.y = clamp(e.y, 60, w.h - 80);
      w.enemies.push(e);
    }
    toast(LANG.current === 'en' ? '★ Reward Turn ★ Shoot the Gold Orbs for gold' : '★ 奖励回合 ★ 击中金球获得金币', 1.5);
  }

  // 玩家本回合能执行的最小动作 cost = min(最左 cost, 最右 cost) + 主卡 cost。
  // 任何普通使用都同时消耗主卡 cost；弃牌不计在内（弃牌不是「使用」）。
  _minUsableCost() {
    const hand = this.world.deck.hand;
    if (hand.length === 0) {
      // 手牌空但弃牌堆还有卡 → 洗牌窗口期（toDiscard / destroyCard 内 350ms 延迟）。
      // 返回 0 让 autoEndOnZeroMana 不触发，等洗回手牌后再正常判断。
      if (this.world.deck.discard.length > 0) return 0;
      return Infinity;
    }
    const left = hand[0];
    const right = hand[hand.length - 1];
    const main = this.world.deck.mainCard;
    const mainCost = main ? main.cost : 0;
    return Math.min(left.cost, right.cost) + mainCost;
  }

  _spawnEnemy(typeKey) {
    // 仅从顶部 spawn（梯形上底 = 整个 canvas 宽）；若未指定 typeKey 则从池随机
    const W = this.world.w, m = 40;
    if (!typeKey) {
      const lv = clamp(this.world.shopLevel, 1, 8);
      const pool = SPAWN_POOL[lv] || SPAWN_POOL[1];
      typeKey = pool[randInt(0, pool.length - 1)];
    }
    const e = new Enemy(rand(m, W - m), m, typeKey, this.world);
    this.world.enemies.push(e);
  }
}

// ─── 8. World 编排 ──────────────────────────────────────────────────
class World {
  constructor() {
    this.w = 900; this.h = 560;
    this.player = new PlayerCannon(this.w / 2, this.h - 60);
    this.player.team = 'ally';
    this.enemies = [];
    this.bullets = [];
    this.particles = [];     // 特效粒子
    // 屏幕震动状态：intensity 在 0 衰减；render 时按时间噪声偏移
    this.shake = { intensity: 0, time: 0, duration: 0 };
    // Hit-stop：短暂"凝固一帧" → 通过 main loop 的 dt clamp 实现
    this.hitStop = 0;
    // 玩家受击 vignette：takeDamage 时拉高，main loop 衰减；render 末尾画红色径向遮罩
    this.damageFlash = 0;
    // 重击色散：单次伤害 ≥10 时拉高；main loop 衰减；通过 canvas CSS filter 做 RGB 分离
    this.chromaT = 0;
    // 背包打开费用减免：玩家回合结束时若有剩余水晶，按数值累计到此处（上限 10）。
    // 下次开背包时直接折算为减少的法力消耗，打开后归零。
    this.inventoryDiscount = 0;
    this.summons = [];       // 友方召唤物（士兵 / 炮台 / 护盾兵 / 狙击塔等）
    this.deck = new CardDeck();
    this.deck.world = this;          // 反向引用，衍生卡 / 召唤通过 deck 访问 world
    this.combo = new ComboManager();
    this.comboStacks = 0;            // 连携 stacks（v3.3 重定义）：>0 时自动消耗 1 层 + 左+右+主一起发
    this.battle = new BattleManager(this);
    // 玩家等级（升级触发 Loot 面板 + 给 1 次刷新）
    this.level = 1;
    this.xp = 0;
    this.xpMax = 6;  // 与 _gainXp 公式一致：Lv 1→2 需 6 XP
    // 商店等级（独立于玩家等级；通过消耗刷新次数升级；影响候选数 + 稀有度概率）
    this.shopLevel = 1;
    this.candidatesCount = 3;     // 跟 shopLevel 走：min(8, 2 + shopLevel)
    // 金币系统：杀敌 / 升级 / 胜利获得；用于商店刷新与升级
    // refreshCount 在每次 Loot 打开时重置，连续刷新成本 = 1 + refreshCount（缓慢增长）
    this.gold = 5;
    this.refreshCount = 0;
    // 计分系统：杀敌、升级、连击触发等都给分；本局结束保存最高分
    this.score = 0;
    let savedHigh = 0;
    try { savedHigh = parseInt(localStorage.getItem('cs_highScore') || '0', 10) || 0; } catch (e) {}
    this.highScore = savedHigh;
    // 升级延迟商店：升级后入队，回合结束后逐次开商店；可在同一商店买多张（递增金币）
    this.pendingShops = 0;
    // 商店升级消耗（Lv1→2 消耗 1，2→3 消耗 2，...，7→8 消耗 15）
    this.SHOP_THRESHOLDS = [1, 2, 4, 6, 8, 11, 15];
    // 经验条目标位置（canvas 坐标，xp 粒子飞向这里）
    // XP 条已移到 DOM（页面底部），粒子飞向 canvas 底部中央即可
    this.xpBarPos = { x: 450, y: 555 };
    // 梯形地图：以炮台为底，上宽下窄。下底 400px 居中，上底 = 整个画布宽
    const bottomWidth = 400;
    this.trap = {
      bottomLeft: (this.w - bottomWidth) / 2,        // 250
      bottomRight: (this.w + bottomWidth) / 2,       // 650
    };
  }

  // 改连携 stacks（n 为变化量，自动 emit 让 HUD 更新）
  addComboStacks(n) {
    this.comboStacks = Math.max(0, this.comboStacks + n);
    Events.emit('comboStacksChanged', this.comboStacks);
  }

  // 阵亡后重开：完全重置进度（等级 / 卡组 / 金币 / 商店 / 连击 / 计分）
  resetForNewGame() {
    this.level = 1;
    this.xp = 0;
    this.xpMax = 6;
    this.shopLevel = 1;
    this.candidatesCount = 3;
    this.gold = 5;
    this.refreshCount = 0;
    this.combo.reset();
    this.comboStacks = 0;
    Events.emit('comboStacksChanged', 0);
    // 计分
    if (this.score != null) {
      if (this.score > (this.highScore || 0)) this.highScore = this.score;
      try { localStorage.setItem('cs_highScore', String(this.highScore || 0)); } catch (e) {}
      this.score = 0;
      Events.emit('scoreChanged', 0);
    }
    // 重建初始牌库（与 main() 中相同 —— 9 张 1 费「强化」起手卡）
    const cards = [];
    for (let i = 0; i < 9; i++) cards.push(new Card_强化());
    this.deck.setBag(cards);
  }

  // 经验粒子到达经验条时调用
  // xpMax 曲线（参考通用 roguelike 设计：早期快升级解锁复杂度，后期平缓避免 grind）
  // 升级行为修改：入队 pendingShops，不立即开商店；玩家回合开始时弹出
  _gainXp(amount) {
    this.xp += amount;
    while (this.xp >= this.xpMax) {
      this.xp -= this.xpMax;
      this.level++;
      const lv = this.level;
      this.xpMax = Math.min(100, Math.floor(6 + (lv - 1) * 4 + (lv - 1) * (lv - 1) * 0.6));
      this.gold += 5;
      this.pendingShops += 1;
      Events.emit('levelUp', this.level);
      toast(t('upgrade_toast', { lv: this.level }), 1.4);
    }
  }

  // 玩家点商店「升级」按钮：消耗金币（按 SHOP_THRESHOLDS）
  _shopLevelUp() {
    if (this.shopLevel >= 8) return false;
    const cost = this.SHOP_THRESHOLDS[this.shopLevel - 1];
    if (this.gold < cost) return false;
    this.gold -= cost;
    this.shopLevel++;
    this.candidatesCount = Math.min(8, 2 + this.shopLevel);
    // 商店升级后重置刷新成本计数（视为新一轮）
    this.refreshCount = 0;
    toast(t('shop_upgrade_toast', { lv: this.shopLevel, cost: cost }), 1.4);
    return true;
  }

  // 当前刷新成本：1 + refreshCount（每次连续刷新 +1）
  get refreshCost() { return 1 + this.refreshCount; }
}

// ─── 8.1 特效粒子 ───────────────────────────────────────────────────
// 轻量粒子：3 种 type，单一 update + 渐隐 draw。专为视觉反馈，不参与游戏逻辑。
class Particle {
  constructor(opts) {
    this.x = opts.x; this.y = opts.y;
    this.vx = opts.vx ?? 0; this.vy = opts.vy ?? 0;
    this.maxLife = opts.life ?? 0.3;
    this.life = this.maxLife;
    this.color = opts.color ?? '#ffd84a';
    this.size = opts.size ?? 4;
    this.type = opts.type ?? 'spark';   // spark | ring | flash
  }
  get alive() { return this.life > 0; }
  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= 0.94;       // 阻尼
    this.vy *= 0.94;
    this.life -= dt;
  }
  draw(ctx) {
    const t = Math.max(0, this.life / this.maxLife);
    ctx.save();
    ctx.globalAlpha = t;
    if (this.type === 'ring') {
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * (1.8 - t), 0, Math.PI * 2);
      ctx.stroke();
    } else if (this.type === 'flash') {
      ctx.fillStyle = this.color;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * (0.6 + t * 0.7), 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// 伤害数字：从命中点向上飘动，渐隐消失。带描边便于深色背景上读数。
// 颜色随伤害量升级（白→黄→橙→红→深红），字号同步放大，给玩家"重击"反馈。
// 若伤害被完全格挡（amount=0 && blocked>0）→ 改显示蓝色 "🛡 N"，避免与"哑弹 0"混淆。
class DamageNumber {
  constructor(x, y, amount, blocked = 0) {
    this.x = x + rand(-6, 6);
    this.y = y - 10;
    this.amount = Math.round(amount);
    this.blocked = Math.round(blocked || 0);
    this.maxLife = 0.85;
    this.life = this.maxLife;
    this.alive = true;
    this.vy = -100;
    this.type = 'dmg';
    // 完全格挡：显示蓝色"🛡 N"，与真实伤害区分
    if (this.amount === 0 && this.blocked > 0) {
      this.text = '🛡 ' + this.blocked;
      this.color = '#7eb1ff';
      this.size = 16;
      this.isBlock = true;
    } else {
      this.text = String(this.amount);
      this.isBlock = false;
      // 颜色 + 字号按伤害分级
      const a = this.amount;
      if (a <= 0)       { this.color = '#cfd6df'; this.size = 14; }   // 哑弹 / 0 伤害且无格挡
      else if (a <= 2)  { this.color = '#ffd84a'; this.size = 16; }   // 黄
      else if (a <= 5)  { this.color = '#ffa84a'; this.size = 19; }   // 橙
      else if (a <= 9)  { this.color = '#ff7a3a'; this.size = 22; }   // 深橙
      else if (a <= 15) { this.color = '#ff5050'; this.size = 26; }   // 红
      else              { this.color = '#ef3030'; this.size = 30; }   // 深红 / 暴击感
    }
    // 开场"弹一下"：scale 0.6 → 1.15 → 1（前 0.18s 内回弹）
    this.spawnPunch = 0.18;
  }
  update(dt) {
    this.y += this.vy * dt;
    this.vy *= 0.9;
    this.life -= dt;
    this.spawnPunch = Math.max(0, this.spawnPunch - dt);
    if (this.life <= 0) this.alive = false;
  }
  draw(ctx) {
    const t = this.life / this.maxLife;
    // spawn punch：开场短暂超过 1.0 倍弹一下
    let scale = 1;
    if (this.spawnPunch > 0) {
      const p = 1 - this.spawnPunch / 0.18;  // 0→1
      scale = 0.6 + 0.55 * p + Math.sin(p * Math.PI) * 0.25;
    }
    ctx.save();
    ctx.globalAlpha = Math.min(1, t * 2);
    ctx.font = `bold ${Math.round(this.size * scale)}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = this.isBlock ? 6 : (this.amount >= 6 ? 8 : 0);
    ctx.strokeText(this.text, this.x, this.y);
    ctx.fillText(this.text, this.x, this.y);
    ctx.restore();
  }
}

// ── HTML fx-layer 工具：金币 / 经验球与 +N 弹出文字渲染在独立 DOM 层 ─────────
// 目的：让飞行特效与 +N 弹出能"飞越" HUD 元素（金币 badge / 经验条 / 法力条）的
// DOM 边界，不再被它们的边框/背景遮挡（canvas 只能渲染在自身矩形内部）。
function ensureFxLayer() {
  let layer = document.getElementById('fx-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'fx-layer';
    document.body.appendChild(layer);
  }
  return layer;
}
function createOrbEl(type, glyph) {
  const el = document.createElement('div');
  el.className = 'fx-orb ' + type;
  el.textContent = glyph;
  ensureFxLayer().appendChild(el);
  return el;
}
function updateOrbDom(el, canvas, canvasX, canvasY, spin) {
  if (!el || !canvas) return;
  const cr = canvas.getBoundingClientRect();
  const sx = (canvasX / canvas.width) * cr.width + cr.left;
  const sy = (canvasY / canvas.height) * cr.height + cr.top;
  el.style.transform = `translate(${sx - 7}px, ${sy - 7}px) rotate(${spin}rad)`;
}
function spawnHtmlFlash(screenX, screenY, text, color) {
  const el = document.createElement('div');
  el.className = 'fx-flash';
  el.textContent = text;
  el.style.color = color;
  el.style.left = screenX + 'px';
  el.style.top = screenY + 'px';
  ensureFxLayer().appendChild(el);
  setTimeout(() => el.remove(), 1100);
}

// 卡离场（use / discard / buff）粒子爆裂：在卡槽中心 spawn N 个 div，向四周飞散
const _CARD_LEAVE_PALETTE = {
  use:     ['#ffd84a', '#ffae40'],
  discard: ['#ef7878', '#a04040'],
  buff:    ['#c97aff', '#a05ec0'],
};
function spawnCardLeaveBurst(slot, action) {
  if (!slot) return;
  const r = slot.getBoundingClientRect();
  if (r.width === 0) return;     // slot 已脱离 DOM
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const palette = _CARD_LEAVE_PALETTE[action] || _CARD_LEAVE_PALETTE.use;
  const count = action === 'buff' ? 14 : (action === 'discard' ? 7 : 10);
  const layer = ensureFxLayer();
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'fx-card-particle';
    const c = palette[i % palette.length];
    el.style.background = c;
    el.style.boxShadow = `0 0 6px ${c}`;
    const a = Math.PI * 2 * (i / count) + Math.random() * 0.4;
    const dist = 36 + Math.random() * (action === 'buff' ? 38 : 26);
    el.style.left = cx + 'px';
    el.style.top = cy + 'px';
    el.style.setProperty('--tx', Math.cos(a) * dist + 'px');
    el.style.setProperty('--ty', Math.sin(a) * dist - 8 + 'px');
    layer.appendChild(el);
    setTimeout(() => el.remove(), 620);
  }
}

// 金币：3 阶段动画 — 爆开 → 短暂悬浮 → 飞向金币条；到达时累计 +N 文字
// 渲染：HTML <div> 在 fx-layer 中，按 canvas 坐标投影到屏幕位置（每帧）
class GoldOrb {
  constructor(world, x, y, value) {
    this.world = world;
    this.startX = x;
    this.startY = y;
    this.x = x;
    this.y = y;
    // 阶段 0：从中心爆开至随机散落点（敌人周围）；clamp 到 canvas 内部
    const a = Math.PI * 2 * Math.random();
    const r = 24 + Math.random() * 36;
    const W = world.w || 900, H = world.h || 560;
    this.scatterX = clamp(x + Math.cos(a) * r, 20, W - 20);
    this.scatterY = clamp(y + Math.sin(a) * r - rand(10, 30), 30, H - 30);
    this.value = value;
    this.phase = 0;          // 0=scatter, 1=pause, 2=fly
    this.phaseTime = 0;
    this.pauseDur = 0.18 + Math.random() * 0.18;
    this.scatterDur = 0.22 + Math.random() * 0.08;
    this.flySpeed = 80;
    this.life = 5;
    this.alive = true;
    this.spin = Math.random() * Math.PI * 2;  // 自旋
    this.spinSpeed = rand(4, 9);
    this.type = 'gold';
    this.el = createOrbEl('gold', '¥');
  }
  update(dt) {
    this.spin += this.spinSpeed * dt;
    this.life -= dt;
    if (this.life <= 0) { this._arrive(); return; }
    this.phaseTime += dt;
    if (this.phase === 0) {
      const t = Math.min(1, this.phaseTime / this.scatterDur);
      const ease = 1 - (1 - t) * (1 - t);
      this.x = this.startX + (this.scatterX - this.startX) * ease;
      this.y = this.startY + (this.scatterY - this.startY) * ease;
      if (t >= 1) { this.phase = 1; this.phaseTime = 0; }
    } else if (this.phase === 1) {
      // 短暂悬浮（玩家可看到散落）
      if (this.phaseTime >= this.pauseDur) { this.phase = 2; this.phaseTime = 0; }
    } else {
      const tgt = this.world.goldBarPos || { x: 100, y: 0 };
      const dx = tgt.x - this.x, dy = tgt.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d < 10) { this._arrive(); return; }
      this.flySpeed += dt * 600;
      this.x += (dx / d) * this.flySpeed * dt;
      this.y += (dy / d) * this.flySpeed * dt;
    }
  }
  _arrive() {
    if (this.alive === false) return;
    this.alive = false;
    if (this.el) { this.el.remove(); this.el = null; }
    this.world.gold += this.value;
    Events.emit('goldChanged', this.world.gold);
    // 累计金币 → 短暂延迟后在金币 HUD DOM 位置弹出 "+N 💰"
    flashOrbArrival(this.world, '+' + this.value + ' 💰', null, '#ffd84a', 'gold');
  }
  draw(ctx) {
    // canvas 不渲染；每帧把 DOM orb 投影到屏幕坐标
    updateOrbDom(this.el, ctx.canvas, this.x, this.y, this.spin);
  }
}

// 累积"飞抵条"文字（多个 orb 短时间内合并为单条 +N 显示）
// 目标位置取真实 HUD DOM 节点的屏幕矩形（不再用 canvas 投影点），让弹出文字
// 出现在金币 badge / 经验条上面，而不是 canvas 顶部内侧。
function flashOrbArrival(world, label, _legacyTargetPos, color, key) {
  world._orbFlashAccum = world._orbFlashAccum || {};
  world._orbFlashTimers = world._orbFlashTimers || {};
  const k = key || 'default';
  // 提取数字部分累加（label 类似 "+5 💰" → 5）
  const m = String(label).match(/([+-]?\d+)/);
  const n = m ? parseInt(m[1], 10) : 1;
  world._orbFlashAccum[k] = (world._orbFlashAccum[k] || 0) + n;
  if (world._orbFlashTimers[k]) clearTimeout(world._orbFlashTimers[k]);
  world._orbFlashTimers[k] = setTimeout(() => {
    const total = world._orbFlashAccum[k];
    world._orbFlashAccum[k] = 0;
    if (!total) return;
    const suffix = k === 'gold' ? ' 💰' : (k === 'xp' ? ' XP' : '');
    // 找到目标 HUD DOM 节点 → 在其屏幕位置上方弹出
    let $tgt = null;
    if (k === 'gold') $tgt = document.getElementById('gold');
    else if (k === 'xp') $tgt = document.getElementById('xp-bar-fill') || document.getElementById('xp-bar-row');
    if (!$tgt) return;
    const r = $tgt.getBoundingClientRect();
    let x, y;
    if (k === 'xp') {
      // 经验条：在 fill 末端（当前进度的右沿）弹出；fill 宽 0 时贴 track 左端 +8
      const track = $tgt.parentElement;
      const tr = track ? track.getBoundingClientRect() : r;
      x = Math.max(tr.left + 8, r.right);
      y = tr.top + tr.height / 2 - 2;
    } else {
      // 金币：badge 中心上方
      x = r.left + r.width / 2;
      y = r.top + r.height / 2 - 2;
    }
    spawnHtmlFlash(x, y, '+' + total + suffix, color);
  }, 140);
}

// 飘动文字（仿 DamageNumber 但带颜色 + 较慢上浮）
class FlashText {
  constructor(x, y, text, color) {
    this.x = x;
    this.y = y;
    this.text = text;
    this.color = color || '#ffd84a';
    this.maxLife = 1.0;
    this.life = this.maxLife;
    this.vy = -50;
    this.alive = true;
    this.type = 'flash';
  }
  update(dt) {
    this.y += this.vy * dt;
    this.vy *= 0.94;
    this.life -= dt;
    if (this.life <= 0) this.alive = false;
  }
  draw(ctx) {
    const t = this.life / this.maxLife;
    ctx.save();
    ctx.globalAlpha = Math.min(1, t * 2);
    ctx.font = 'bold 16px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 8;
    ctx.strokeText(this.text, this.x, this.y);
    ctx.fillText(this.text, this.x, this.y);
    ctx.restore();
  }
}

// 挥剑 / 切割视觉特效：一条快速淡出的发光线段（"刀光" 感），用于剑士的实体回合行动
class SlashFx {
  constructor(x1, y1, x2, y2, color, width) {
    this.x1 = x1; this.y1 = y1;
    this.x2 = x2; this.y2 = y2;
    this.color = color || '#f1f4f8';
    this.baseWidth = width || 10;
    this.maxLife = 0.28;
    this.life = this.maxLife;
    this.alive = true;
    this.type = 'slashfx';
  }
  update(dt) {
    this.life -= dt;
    if (this.life <= 0) this.alive = false;
  }
  draw(ctx) {
    const t = this.life / this.maxLife;
    // 头 0.25 阶段：粗 + 高亮；尾段缓慢淡出
    const w0 = this.baseWidth * (0.6 + 0.4 * t);
    ctx.save();
    ctx.globalAlpha = Math.min(1, t * 2);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // 外发光厚层
    ctx.strokeStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 18 * t;
    ctx.lineWidth = w0;
    ctx.beginPath();
    ctx.moveTo(this.x1, this.y1);
    ctx.lineTo(this.x2, this.y2);
    ctx.stroke();
    // 内部纯白高光（细）
    ctx.shadowBlur = 0;
    ctx.globalAlpha = Math.min(1, t * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1, w0 * 0.35);
    ctx.beginPath();
    ctx.moveTo(this.x1, this.y1);
    ctx.lineTo(this.x2, this.y2);
    ctx.stroke();
    ctx.restore();
  }
}

// 扇形刀光（剑士挥剑）：以 (cx,cy) 为圆心、朝 dirAngle ± halfAngle 张开 reach 半径的扇形覆盖区
// 视觉：径向渐变填充 + 弧外缘高亮线 + 两条侧线（"挥过"的边界），整体在 0.45s 内淡出
class SlashArc {
  constructor(cx, cy, dirAngle, reach, halfAngle, color) {
    this.cx = cx; this.cy = cy;
    this.dirAngle = dirAngle;
    this.reach = reach;
    this.halfAngle = halfAngle;
    this.color = color || '#f1f4f8';
    this.maxLife = 0.45;
    this.life = this.maxLife;
    this.alive = true;
    this.type = 'slasharc';
  }
  update(dt) {
    this.life -= dt;
    if (this.life <= 0) this.alive = false;
  }
  draw(ctx) {
    const t = this.life / this.maxLife;       // 1 → 0
    // 反向计算"进度":挥剑感 → 弧角度在淡出过程中略向另一边带一点扫动
    const sweep = (1 - t) * 0.15;
    const a1 = this.dirAngle - this.halfAngle + sweep;
    const a2 = this.dirAngle + this.halfAngle + sweep;
    const r = this.reach;
    ctx.save();
    ctx.globalAlpha = Math.min(1, t * 1.6);
    // 扇形填充：中心透明 → 边缘亮 → 外缘渐隐
    const grad = ctx.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, r);
    grad.addColorStop(0,    'rgba(255,255,255,0.0)');
    grad.addColorStop(0.55, this.color + '55');
    grad.addColorStop(0.85, this.color + 'aa');
    grad.addColorStop(1,    this.color + '00');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(this.cx, this.cy);
    ctx.arc(this.cx, this.cy, r, a1, a2);
    ctx.closePath();
    ctx.fill();
    // 外缘高亮弧
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 14 * t;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, r, a1, a2);
    ctx.stroke();
    // 两条侧线（顶点 → 弧两端）
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = this.color + 'cc';
    ctx.beginPath();
    ctx.moveTo(this.cx, this.cy);
    ctx.lineTo(this.cx + Math.cos(a1) * r, this.cy + Math.sin(a1) * r);
    ctx.moveTo(this.cx, this.cy);
    ctx.lineTo(this.cx + Math.cos(a2) * r, this.cy + Math.sin(a2) * r);
    ctx.stroke();
    ctx.restore();
  }
}

// 火焰文字：橙色 "+N 🔥" 飘动数字，应用 fire 时显示
class FireText {
  constructor(x, y, text) {
    this.x = x + rand(-6, 6);
    this.y = y;
    this.text = text;
    this.maxLife = 0.85;
    this.life = this.maxLife;
    this.alive = true;
    this.vy = -80;
    this.type = 'firetext';
  }
  update(dt) {
    this.y += this.vy * dt;
    this.vy *= 0.92;
    this.life -= dt;
    if (this.life <= 0) this.alive = false;
  }
  draw(ctx) {
    const t = this.life / this.maxLife;
    ctx.save();
    ctx.globalAlpha = Math.min(1, t * 2);
    ctx.font = 'bold 15px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.fillStyle = '#ff7030';
    ctx.shadowColor = '#ffae00';
    ctx.shadowBlur = 8;
    ctx.strokeText(this.text, this.x, this.y);
    ctx.fillText(this.text, this.x, this.y);
    ctx.restore();
  }
}

// 通用飘字（buff / debuff / 状态变化）—— FireText 的可配色版
class FloatingText {
  constructor(x, y, text, opts = {}) {
    this.x = x + rand(-6, 6);
    this.y = y;
    this.text = text;
    this.maxLife = opts.life ?? 0.85;
    this.life = this.maxLife;
    this.alive = true;
    this.vy = opts.vy ?? -80;
    this.color = opts.color ?? '#ffd84a';
    this.glow = opts.glow ?? '#ffae40';
    this.size = opts.size ?? 15;
    this.type = 'floattext';
  }
  update(dt) {
    this.y += this.vy * dt;
    this.vy *= 0.92;
    this.life -= dt;
    if (this.life <= 0) this.alive = false;
  }
  draw(ctx) {
    const t = this.life / this.maxLife;
    ctx.save();
    ctx.globalAlpha = Math.min(1, t * 2);
    ctx.font = `bold ${this.size}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.glow;
    ctx.shadowBlur = 8;
    ctx.strokeText(this.text, this.x, this.y);
    ctx.fillText(this.text, this.x, this.y);
    ctx.restore();
  }
}

// 经验球：3 阶段动画（爆开 → 悬浮 → 飞向条），到达累计 +N XP 文字
class XpOrb {
  constructor(world, x, y) {
    this.world = world;
    this.startX = x; this.startY = y;
    this.x = x; this.y = y;
    const a = Math.PI * 2 * Math.random();
    const r = 24 + Math.random() * 36;
    const W = world.w || 900, H = world.h || 560;
    this.scatterX = clamp(x + Math.cos(a) * r, 20, W - 20);
    this.scatterY = clamp(y + Math.sin(a) * r - rand(10, 30), 30, H - 30);
    this.phase = 0;
    this.phaseTime = 0;
    this.pauseDur = 0.18 + Math.random() * 0.18;
    this.scatterDur = 0.22 + Math.random() * 0.08;
    this.flySpeed = 80;
    this.life = 5;
    this.alive = true;
    this.type = 'xp';
    this.spin = Math.random() * Math.PI * 2;
    this.spinSpeed = rand(4, 9);
    this.el = createOrbEl('xp', 'X');
  }
  update(dt) {
    this.spin += this.spinSpeed * dt;
    this.life -= dt;
    if (this.life <= 0) { this._arrive(); return; }
    this.phaseTime += dt;
    if (this.phase === 0) {
      const t = Math.min(1, this.phaseTime / this.scatterDur);
      const ease = 1 - (1 - t) * (1 - t);
      this.x = this.startX + (this.scatterX - this.startX) * ease;
      this.y = this.startY + (this.scatterY - this.startY) * ease;
      if (t >= 1) { this.phase = 1; this.phaseTime = 0; }
    } else if (this.phase === 1) {
      if (this.phaseTime >= this.pauseDur) { this.phase = 2; this.phaseTime = 0; }
    } else {
      const tgt = this.world.xpBarPos;
      const dx = tgt.x - this.x, dy = tgt.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d < 10) { this._arrive(); return; }
      this.flySpeed += dt * 600;
      this.x += (dx / d) * this.flySpeed * dt;
      this.y += (dy / d) * this.flySpeed * dt;
    }
  }
  _arrive() {
    if (this.alive === false) return;
    this.alive = false;
    if (this.el) { this.el.remove(); this.el = null; }
    this.world._gainXp(1);
    flashOrbArrival(this.world, '+1 XP', null, '#7eb1ff', 'xp');
  }
  draw(ctx) {
    // canvas 不渲染；每帧把 DOM orb 投影到屏幕坐标
    updateOrbDom(this.el, ctx.canvas, this.x, this.y, this.spin);
  }
}

const FX = {
  hit(world, x, y) {
    world.particles.push(new Particle({ x, y, life: 0.32, color: '#ffd84a', size: 14, type: 'ring' }));
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * 2 * Math.random();
      const sp = 90 + Math.random() * 120;
      world.particles.push(new Particle({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.22 + Math.random() * 0.15, color: '#ff9c4a', size: 2.2,
      }));
    }
  },
  wall(world, x, y) {
    world.particles.push(new Particle({ x, y, life: 0.22, color: '#9aa6b4', size: 8, type: 'ring' }));
  },
  // r 可选：传入 AOE 半径 → 视觉环大小同步缩放（视觉=实际伤害圈，避免"看上去打到没掉血"）
  explode(world, x, y, r) {
    const ringSize = r != null ? r * 0.5 : 28;     // ring 用 size*(1.8-t) 动画 → 峰值 ≈ 0.9r
    world.particles.push(new Particle({ x, y, life: 0.45, color: '#ef7878', size: ringSize, type: 'ring' }));
    for (let i = 0; i < 14; i++) {
      const a = Math.PI * 2 * Math.random();
      const sp = 120 + Math.random() * 180;
      world.particles.push(new Particle({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.35 + Math.random() * 0.2, color: '#ff6b6b', size: 3,
      }));
    }
  },
  muzzle(world, x, y, angle) {
    const fx = x + Math.cos(angle) * 30;
    const fy = y + Math.sin(angle) * 30;
    world.particles.push(new Particle({ x: fx, y: fy, life: 0.14, color: '#7eb1ff', size: 14, type: 'flash' }));
  },
  xpBurst(world, x, y, count = 3) {
    for (let i = 0; i < count; i++) {
      world.particles.push(new XpOrb(world, x + rand(-10, 10), y + rand(-10, 10)));
    }
  },
  // 屏幕震动：取较大值（防覆盖小震），duration 也取更长那个
  shake(world, intensity, duration) {
    if (!world || !world.shake) return;
    if (intensity > world.shake.intensity) world.shake.intensity = intensity;
    if (duration > world.shake.duration) world.shake.duration = duration;
    world.shake.time = world.shake.duration;
  },
  // 命中冻结：把接下来 N 秒的 dt 强制为 0（敌人、子弹都暂停），凸显重击
  hitStop(world, seconds) {
    if (!world) return;
    if (seconds > (world.hitStop || 0)) world.hitStop = seconds;
  },
  damage(world, x, y, amount, blocked = 0) {
    // 即使 0 也显示（哑弹）。若被完全格挡（blocked>0 && amount=0）→ DamageNumber 自动显示 "🛡 N"。
    world.particles.push(new DamageNumber(x, y, amount, blocked));
  },
  // 卡牌使用统一绿色扩散：与"可用卡 = 绿色"语义呼应
  cardUseGreen(world) {
    const x = world.player.x;
    const y = world.player.y;
    world.particles.push(new Particle({ x, y, life: 0.55, color: '#5bd45b', size: 40, type: 'ring' }));
    world.particles.push(new Particle({ x, y, life: 0.7,  color: '#9ae89a', size: 60, type: 'ring' }));
    world.particles.push(new Particle({ x, y, life: 0.3,  color: '#5bd45b', size: 18, type: 'flash' }));
  },
  // 使用卡时在玩家位置 spawn 卡专属特效。按 card.def.fxType 派发。
  cardUse(world, card) {
    const x = world.player.x;
    const y = world.player.y - 6;
    const type = card.def?.fxType || 'spark';
    if (type === 'bullet+') {
      // 黄色花瓣朝炮口扇形喷射
      for (let i = 0; i < 8; i++) {
        const a = world.player.angle + (i - 3.5) * 0.18;
        const sp = 120 + Math.random() * 60;
        world.particles.push(new Particle({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: 0.35, color: '#ffd84a', size: 2.5,
        }));
      }
    } else if (type === 'bounce') {
      // 弹射/穿透：蓝色双环
      world.particles.push(new Particle({ x, y, life: 0.4, color: '#7eb1ff', size: 28, type: 'ring' }));
      world.particles.push(new Particle({ x, y, life: 0.5, color: '#9dc6ff', size: 18, type: 'ring' }));
    } else if (type === 'pierce') {
      // 穿透：橙色长环
      world.particles.push(new Particle({ x, y, life: 0.32, color: '#ff9c4a', size: 26, type: 'ring' }));
    } else if (type === 'aura') {
      // 光环/展露：紫色脉冲
      world.particles.push(new Particle({ x, y, life: 0.5, color: '#c97aff', size: 34, type: 'ring' }));
      world.particles.push(new Particle({ x, y, life: 0.25, color: '#c97aff', size: 22, type: 'flash' }));
    } else if (type === 'random') {
      // 随机/哑弹：紫红色乱码喷射
      for (let i = 0; i < 6; i++) {
        const a = Math.PI * 2 * Math.random();
        const sp = 80 + Math.random() * 100;
        world.particles.push(new Particle({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: 0.32, color: '#c97aff', size: 3,
        }));
      }
    } else {
      world.particles.push(new Particle({ x, y, life: 0.2, color: '#f1f4f8', size: 14, type: 'flash' }));
    }
  },
};

// ─── 9. 发射流程 ────────────────────────────────────────────────────
// 玩家使用一/多张牌，把 Hook 注册到模板子弹，再按 bulletCount × waveCount 克隆出克隆体。
// 触发顺序: PreActive(模板) → 每颗克隆 Spawned → activate → ...飞行碰撞... → 一波完毕 PostActive(模板)
function fireFromCards(world, cards, side, opts = {}) {
  const player = world.player;
  if (!player.canAct(performance.now() / 1000)) return false;
  const isCombo = !!opts.isCombo;

  // 主卡也跟着用（每次普通使用都额外消耗主卡 cost + 主卡 Hook 入模板）
  const main = world.deck.mainCard;
  const useList = [...cards, main];

  // 单卡有效消耗：基础 cost 扣掉 _costMod（cost 减免类卡填这个字段），但不低于 0
  const effectiveCost = (c) => Math.max(0, c.cost - (c._costMod || 0));
  // 计算总法力：连携时「完美协调」cost 视为 0（_comboCostFree 标记）
  const totalCost = useList.reduce((s, c) => {
    if (isCombo && c._comboCostFree) return s;
    return s + effectiveCost(c);
  }, 0);
  if (player.mana < totalCost) { toast(t('no_mana'), 0.7); return false; }

  // 模板子弹
  const tpl = new Bullet({
    x: player.x, y: player.y, angle: player.angle,
    speed: 480, lifetime: 2.0, bulletCount: 1, waveCount: 1, attack: 1, bound: 0, penetrate: 0,
  });

  // 让外部（如展露光环）有机会改模板
  Events.emit('beforeShoot', tpl);

  // 各卡 use: 扣费 + 把 Hook 装到模板（无炮台位置特效，使用反馈靠卡 leaving 动画）
  for (const c of useList) {
    const cost = (isCombo && c._comboCostFree) ? 0 : effectiveCost(c);
    if (c === main) {
      // 主卡走「附带触发」：不弹出，直接把 Hook 装到模板，主卡自身扣费
      if (!player.spend(cost)) { toast(t('no_mana'), 0.7); return false; }
      for (const h of main.initializeEffects()) tpl.addHook(h);
    } else {
      // 连携模式：跳过 c.use 的 spend（已统计好），手动装 hook
      if (isCombo) {
        if (!player.spend(cost)) { toast(t('no_mana'), 0.7); return false; }
        for (const h of c.initializeEffects()) tpl.addHook(h);
      } else {
        // 普通使用：手动扣 effectiveCost，跳过 c.use 内部的 c.cost 扣费
        if (!player.spend(cost)) { toast(t('no_mana'), 0.7); return false; }
        for (const h of c.initializeEffects()) tpl.addHook(h);
      }
    }
    // 消耗一次性 cost 减免
    c._costMod = 0;
  }
  // 通知"哪一侧使用了什么"——展露类侦听该事件以做"另一侧 / 同一侧"等触发
  Events.emit('cardUsedSide', { side, cards, main });

  // 副作用：onUse 设置全局 buff、洗入卡、召唤、连携 stacks 等
  for (const c of useList) c.onUse?.(world, player);

  // PreActive 一次（带 world，让连击 / 共鸣弹等可读 world.combo）
  tpl.triggerHooks(Phase.PreActive, { world });

  // 一波几颗、几波
  const waves = Math.max(1, tpl.waveCount);
  for (let w = 0; w < waves; w++) {
    setTimeout(() => fireOneWave(tpl, world), w * 120);
  }

  // 用过的卡入弃牌堆（主卡留在原位）
  // 标记 _lastAction → renderHand 用以播 use / buff 离场特效
  for (const c of cards) {
    const effects = c.initializeEffects?.() || [];
    // 无 bullet hook 的卡视为 "纯效果" / buff（加倍奥弹 / 召唤 / 战吼 / 洗入 等）
    c._lastAction = effects.length === 0 ? 'buff' : 'use';
    world.deck.toDiscard(c);
  }

  // 连击
  world.combo.onUse(side);

  // 共享冷却
  player.notifyAction(performance.now() / 1000);
  return true;
}

function fireOneWave(tpl, world) {
  const n = Math.max(1, tpl.bulletCount);
  // 子弹做小扇形：单颗 3°，最大总扇形 30°（避免子弹数多时太散）
  const perBullet = Math.PI / 60;
  const maxSpread = Math.PI / 6;
  const spread = n > 1 ? Math.min(maxSpread, perBullet * (n - 1)) : 0;
  const startA = tpl.angle - spread / 2;
  const now = performance.now() / 1000;
  // 实体化固有 buff：模板若 entityLayers>0 → 克隆半径翻倍
  // 实体子弹半径随初始层数线性放大：每层 +0.5 倍基础半径（2 层 = 2× = 与旧版默认一致；4 层 = 3×；6 层 = 4×）
  const cloneRadius = tpl.entityLayers > 0
    ? tpl.radius * (1 + 0.5 * tpl.entityLayers)
    : tpl.radius;
  for (let i = 0; i < n; i++) {
    const clone = new Bullet({
      x: tpl.x, y: tpl.y,
      angle: n > 1 ? startA + (spread / (n - 1)) * i : tpl.angle,
      speed: tpl.speed, lifetime: tpl.lifetime,
      attack: tpl.attack, bound: tpl.bound, penetrate: tpl.penetrate,
      bulletCount: 1, waveCount: 1,
      radius: cloneRadius,
      entityLayers: tpl.entityLayers,
    });
    clone.copyHooksFrom(tpl);
    // 把 tpl 上由 PreActive 钩子写入的状态字段同步到 clone（追踪 / 火焰 / 奥弹 buff 等）
    if (tpl.tracking) {
      clone.tracking = true;
      // 只在模板显式设置了 trackRate 时复制；否则交给 Bullet.update 用默认 (12 rad/s)
      if (tpl.trackRate != null) clone.trackRate = tpl.trackRate;
    }
    if (tpl.isArcane) clone.isArcane = true;
    if (tpl._fireOnHit) clone._fireOnHit = tpl._fireOnHit;
    clone.triggerHooks(Phase.Spawned, { world });
    clone.activate(now);
    world.bullets.push(clone);
  }
  // 出膛反馈：每波一次 muzzle flash + 炮台反冲（fireFromCards 会按 waveCount 多次调用 fireOneWave）
  if (world.player && world.player.notifyFired) world.player.notifyFired(world);
  tpl.triggerHooks(Phase.PostActive, { world });
}

// ─── 10. Input ──────────────────────────────────────────────────────
// Unity 原项目操作：鼠标左/右键发射、滚轮弃牌、空格连携。
// 回合制改动：空格改为「结束回合」（最常用动作），连携迁到 F 键。
// 鼠标按压持续发射：mousedown 标记 held，main loop 每帧调 doFire（doFire 内部 canAct 自然节流）。
const heldButtons = { left: false, right: false };

function setupInput(world, canvas) {
  const rect = () => canvas.getBoundingClientRect();
  function getMouse(e) {
    const r = rect();
    return {
      x: (e.clientX - r.left) * (canvas.width / r.width),
      y: (e.clientY - r.top) * (canvas.height / r.height),
    };
  }

  canvas.addEventListener('mousemove', e => {
    const m = getMouse(e);
    world.player.setTarget(m.x, m.y);
    world._mouseCanvasX = m.x;
    world._mouseCanvasY = m.y;
    world._mouseClientX = e.clientX;
    world._mouseClientY = e.clientY;
  });
  canvas.addEventListener('mouseleave', () => {
    world._mouseCanvasX = -9999;
    world._mouseCanvasY = -9999;
  });

  // 鼠标按下：立即发射 + 标记 held（main loop 内每帧检查持续发射）
  canvas.addEventListener('mousedown', e => {
    if (world.battle.state !== State.Battle) return;
    if (e.button === 0) { e.preventDefault(); heldButtons.left = true; doFire(world, 'left'); }
    else if (e.button === 2) { e.preventDefault(); heldButtons.right = true; doFire(world, 'right'); }
  });

  // 抬起 / 离开画布 → 停止持续发射
  function releaseAll() { heldButtons.left = false; heldButtons.right = false; }
  canvas.addEventListener('mouseup', e => {
    if (e.button === 0) heldButtons.left = false;
    else if (e.button === 2) heldButtons.right = false;
  });
  canvas.addEventListener('mouseleave', releaseAll);
  window.addEventListener('blur', releaseAll);

  // 阻止右键菜单（让右键能作为射击使用）
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // 滚轮上/下 → 弃左/右
  canvas.addEventListener('wheel', e => {
    if (world.battle.state !== State.Battle) return;
    e.preventDefault();
    if (e.deltaY < 0) doDiscard(world, 'left');
    else doDiscard(world, 'right');
  }, { passive: false });

  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    // Idle / PostBattle 任意键开始（不再限定 Enter）
    if (world.battle.state === State.Idle || world.battle.state === State.PostBattle) {
      world.battle.startBattle();
      return;
    }
    if (world.battle.state !== State.Battle) return;
    if (k === ' ') { e.preventDefault(); world.battle.endPlayerTurn(); }
    else if (k === 'f') doFireAll(world);
  });
}

// 预计算连携模式下的总法力消耗（左 + 右 + 主，含 _comboCostFree 例外）
function _comboTotalCost(world) {
  const hand = world.deck.hand;
  if (hand.length < 2) return Infinity;
  const main = world.deck.mainCard;
  const left = hand[0];
  const right = hand[hand.length - 1];
  const eff = (c) => Math.max(0, (c?.cost ?? 0) - (c?._costMod || 0));
  const lc = left?._comboCostFree ? 0 : eff(left);
  const rc = right?._comboCostFree ? 0 : eff(right);
  const mc = main?._comboCostFree ? 0 : eff(main);
  return lc + rc + mc;
}

// 连携是否会触发：有层数 + 左右都有牌 + 法力足够付三卡
function _comboWillFire(world) {
  return world.comboStacks > 0
      && world.deck.hand.length >= 2
      && world.player.mana >= _comboTotalCost(world);
}

function doFire(world, side) {
  // 连携优先 — 但只在"实际能付得起三卡"时才触发。
  // 法力不够时回落到单卡发射（不消耗 stack），避免有连携反而打不出卡的尴尬。
  if (_comboWillFire(world)) {
    const left = world.deck.takeSide('left');
    const right = world.deck.takeSide('right');
    const ok = fireFromCards(world, [left, right], 'any', { isCombo: true });
    if (ok) {
      world.addComboStacks(-1);
    } else {
      // 不该到这（已预检过法力）— 兜底回退
      world.deck.hand.unshift(left);
      world.deck.hand.push(right);
      world.deck._updateFaceUp();
      Events.emit('deckChanged');
    }
    return;
  }
  // 单卡发射（含主卡 cost）
  const c = world.deck.takeSide(side);
  if (!c) { toast(t('empty_hand'), 0.5); return; }
  const ok = fireFromCards(world, [c], side);
  if (!ok) {
    // 还回去
    if (side === 'left') world.deck.hand.unshift(c);
    else world.deck.hand.push(c);
    world.deck._updateFaceUp();
    Events.emit('deckChanged');
  }
}

function doFireAll(world) {
  if (world.deck.hand.length < 2) { toast(t('need_two'), 0.7); return; }
  const left = world.deck.takeSide('left');
  const right = world.deck.takeSide('right');
  const ok = fireFromCards(world, [left, right], 'any');
  if (!ok) {
    world.deck.hand.unshift(left);
    world.deck.hand.push(right);
    world.deck._updateFaceUp();
    Events.emit('deckChanged');
  }
}

function doDiscard(world, side) {
  const c = world.deck.takeSide(side);
  if (!c) return;
  if (!c.discard(world.player)) {
    if (side === 'left') world.deck.hand.unshift(c);
    else world.deck.hand.push(c);
    world.deck._updateFaceUp();
    Events.emit('deckChanged');
    toast(t('no_mana'), 0.7);
    return;
  }
  // 弃置时副作用：双面间谍 / 战术撤退 / 弃牌号令 等
  c.onDiscard?.(world, world.player);
  c._lastAction = 'discard';
  world.deck.toDiscard(c);
  world.combo.reset();
}

// ─── 11. UI ─────────────────────────────────────────────────────────
function setupUI(world) {
  const $hp = document.getElementById('hp');
  const $hpBar = document.getElementById('hp-bar');
  const $mana = document.getElementById('mana');
  const $manaBar = document.getElementById('mana-bar');
  const $armor = document.getElementById('armor');
  const $combo = document.getElementById('combo');
  const $comboStacks = document.getElementById('combo-stacks');
  const $gold = document.getElementById('gold');
  const $state = document.getElementById('state');
  const $handRow = document.getElementById('hand-row');
  const $main = document.getElementById('hand-main');
  const $turn = document.getElementById('turn');
  const $autoEnd = document.getElementById('auto-end-toggle');

  // 所有手牌统一在 $handRow 内 absolute 定位。
  // hand[0] = 左端、hand[last] = 右端，自动均匀分布（位置足时不重叠，位置不够才挤）。
  // 用过 / 弃过的卡播放 leaving 动画后才移除，给玩家"被使用"的视觉反馈。
  function renderHand() {
    const hand = world.deck.hand;
    const oldEls = new Map();
    for (const el of Array.from($handRow.children)) {
      if (el.__cardRef) oldEls.set(el.__cardRef, el);
    }
    // 离开手牌的卡：播离场动画后移除；按 _lastAction 加 leave-use / leave-discard / leave-buff
    for (const [card, el] of oldEls) {
      if (!hand.includes(card) && !el.classList.contains('leaving')) {
        const action = card._lastAction || 'use';
        el.classList.add('leaving', 'leave-' + action);
        spawnCardLeaveBurst(el, action);
        // 卡用 / 弃 / buff → 轻度屏幕震动（让动作有"反推"感）
        if (world.shake) {
          const amp = action === 'buff' ? 2.5 : action === 'discard' ? 1.4 : 1.8;
          if (amp > world.shake.intensity) world.shake.intensity = amp;
          if (0.1 > world.shake.duration) world.shake.duration = 0.1;
          world.shake.time = world.shake.duration;
        }
        // 清掉标记避免下次进手牌时残留
        card._lastAction = null;
        setTimeout(() => el.remove(), 320);
      }
    }
    // 计算位置
    const rowWidth = $handRow.offsetWidth || 800;
    const cardW = 84;
    const n = hand.length;
    const desiredStep = 92;
    const minStep = 22;
    let step = desiredStep;
    if (n > 1) {
      const availStep = (rowWidth - cardW) / (n - 1);
      step = Math.max(minStep, Math.min(desiredStep, availStep));
    }
    const totalSpan = (n > 0) ? (cardW + (n - 1) * step) : 0;
    const startX = Math.max(0, (rowWidth - totalSpan) / 2);

    for (let i = 0; i < n; i++) {
      const card = hand[i];
      const isEdge = (i === 0 || i === n - 1);
      let el = oldEls.get(card);
      if (!el || el.classList.contains('leaving')) {
        el = cardEl(card, { edge: isEdge });
        el.__cardRef = card;
        el.classList.add('entering');
        setTimeout(() => el.classList.remove('entering'), 350);
        // 入场起始位置 = 目标位置（避免从 0 滑过来）
        el.style.left = (startX + i * step) + 'px';
        $handRow.appendChild(el);
      } else {
        applyCardState(el, card, { edge: isEdge });
        el.style.left = (startX + i * step) + 'px';
      }
    }

    // 主卡
    const mainCard = world.deck.mainCard;
    const mainExisting = $main.firstChild;
    if (mainExisting && mainExisting.__cardRef === mainCard) {
      applyCardState(mainExisting, mainCard, { main: true });
    } else {
      $main.innerHTML = '';
      const el = cardEl(mainCard, { main: true });
      el.__cardRef = mainCard;
      $main.appendChild(el);
    }
  }

  // 返回一个 slot wrapper（卡牌 + 总消耗），__cardRef 挂在 slot 上用于 DOM 复用比对
  function cardEl(card, opts = {}) {
    const slot = document.createElement('div');
    slot.className = 'card-slot';
    // 默认 face-down：避免初始一帧正面闪现。applyCardState 内会按实际状态翻面（触发翻转动画）。
    slot.innerHTML = `
      <div class="card face-down">
        <div class="card-front">
          <div class="card-art"></div>
          <div class="card-cost"></div>
          <div class="card-name"></div>
          <div class="card-desc"></div>
        </div>
        <div class="card-back"></div>
      </div>
      <div class="card-total"></div>
    `;
    applyCardState(slot, card, opts);
    return slot;
  }

  function applyCardState(slot, card, opts = {}) {
    const cardEl = slot.querySelector('.card');
    cardEl.classList.toggle('face-down', !card.faceUp);
    cardEl.classList.toggle('main', !!opts.main);
    cardEl.classList.toggle('revealed', !!(card.faceUp && card.def?.hasRevealFx));
    // 稀有度
    cardEl.classList.remove('rarity-common', 'rarity-rare', 'rarity-epic', 'rarity-legendary');
    cardEl.classList.add('rarity-' + (card.rarity || 'common'));
    cardEl.querySelector('.card-cost').textContent = card.cost;
    cardEl.querySelector('.card-name').textContent = card.name;
    // desc 用关键词渲染（HTML），同时缓存关键词列表到 slot 上供 hover tooltip 使用
    const { html, seen } = renderDescWithKeywords(card.desc);
    cardEl.querySelector('.card-desc').innerHTML = html;
    slot.__keywords = seen;
    // 卡面图：emoji + 稀有度色（流派对玩家不可见，所以背景按稀有度区分）
    const art = card.def?.art || { emoji: '⚙' };
    const artEl = cardEl.querySelector('.card-art');
    artEl.className = 'card-art rarity-' + (card.rarity || 'common');
    artEl.textContent = art.emoji || '⚙';
    // 总消耗框：仅对边缘卡显示（show 类）。具体文字 / combo-active 状态由 updateUsableState 每帧根据当前法力刷新。
    const totalEl = slot.querySelector('.card-total');
    if (opts.edge && !opts.main) {
      totalEl.classList.add('show');
    } else {
      totalEl.classList.remove('show');
      totalEl.classList.remove('combo-active');
      totalEl.textContent = '';
    }
  }

  // XP DOM 元素引用（一次性查）
  const $xpLv = document.getElementById('xp-lv-num');
  const $xpCur = document.getElementById('xp-cur');
  const $xpMax = document.getElementById('xp-max');
  const $xpFill = document.getElementById('xp-bar-fill');

  const $canvas = document.getElementById('stage');
  function update() {
    const p = world.player;
    $hp.textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
    $hpBar.style.width = `${(p.hp / p.maxHp) * 100}%`;
    $mana.textContent = `${Math.floor(p.mana)} / ${p.maxMana}`;
    $manaBar.style.width = `${(p.mana / p.maxMana) * 100}%`;
    if ($armor) {
      $armor.textContent = '🛡 ' + p.armor;
      $armor.classList.toggle('zero', p.armor <= 0);
    }
    if ($gold) $gold.textContent = world.gold;
    // XP DOM 条
    if ($xpLv) {
      $xpLv.textContent = world.level;
      $xpCur.textContent = world.xp;
      $xpMax.textContent = world.xpMax;
      $xpFill.style.width = `${(world.xp / world.xpMax) * 100}%`;
    }
    // 计算 XP / 金币粒子目标：用 HUD DOM 节点的真实屏幕位置投影到 canvas 坐标系，
    // 允许 y 为负数（HUD 在 canvas 上方）—— HTML orb 渲染时按屏幕投影显示，可飞越 canvas 顶边
    if ($xpFill && $canvas) {
      const fr = $xpFill.getBoundingClientRect();
      const track = $xpFill.parentElement;
      const tkr = track ? track.getBoundingClientRect() : fr;
      const cr = $canvas.getBoundingClientRect();
      const scaleX = $canvas.width / cr.width;
      const scaleY = $canvas.height / cr.height;
      // fill 末端 = 当前进度的右沿；fill 宽 0 时贴 track 左 +8px
      const screenX = Math.max(tkr.left + 8, fr.right);
      world.xpBarPos.x = (screenX - cr.left) * scaleX;
      world.xpBarPos.y = (tkr.top + tkr.height / 2 - cr.top) * scaleY;
    }
    if ($gold && $canvas) {
      const gr = $gold.getBoundingClientRect();
      const cr = $canvas.getBoundingClientRect();
      const scaleX = $canvas.width / cr.width;
      const scaleY = $canvas.height / cr.height;
      world.goldBarPos = world.goldBarPos || { x: 0, y: 0 };
      world.goldBarPos.x = (gr.left + gr.width / 2 - cr.left) * scaleX;
      world.goldBarPos.y = (gr.top + gr.height / 2 - cr.top) * scaleY;
    }
    // 法力条位置（同 stats panel 内 #mana-bar）；用于法力消耗 FlashText 目标
    if ($manaBar && $canvas) {
      const mr = $manaBar.getBoundingClientRect();
      const cr = $canvas.getBoundingClientRect();
      const scaleX = $canvas.width / cr.width;
      world.manaBarPos = world.manaBarPos || { x: 0, y: 0 };
      world.manaBarPos.x = clamp((mr.left + mr.width / 2 - cr.left) * scaleX, 16, $canvas.width - 16);
      // 同样不超出 canvas，clamp 到底部内侧
      const my = (mr.top + mr.height / 2 - cr.top) * ($canvas.height / cr.height);
      world.manaBarPos.y = clamp(my, 30, $canvas.height - 20);
    }
    updateUsableState();
  }

  // 每帧根据当前法力刷新「可用/不可用」标记 + 边缘卡的总消耗文字 / 连携激活态。
  // - 普通使用：cost + 主卡 cost ≤ mana → 可用
  // - 连携自动触发：stacks>0 + 左右都有牌 + mana ≥ 左+右+主 → 边缘卡显示连携总价（紫色）；否则按单卡价显示
  function updateUsableState() {
    const mana = world.player.mana;
    const mainCard = world.deck.mainCard;
    const mainCost = mainCard ? mainCard.cost : 0;
    const hand = world.deck.hand;
    const left = hand[0];
    const right = hand[hand.length - 1];
    const comboCost = _comboTotalCost(world);
    const comboFires = _comboWillFire(world);
    for (const slot of $handRow.children) {
      if (!slot.__cardRef) continue;
      const card = slot.__cardRef;
      const cardE = slot.querySelector('.card');
      const totalEl = slot.querySelector('.card-total');
      if (!card.faceUp) {
        cardE.classList.remove('unusable');
        if (totalEl) { totalEl.textContent = ''; totalEl.classList.remove('combo-active'); }
        continue;
      }
      const isEdge = (card === left || card === right);
      // 单卡发射所需法力
      const singleCost = card.cost + mainCost;
      // 边缘卡：根据连携是否会触发，显示连携总价或单卡总价
      if (isEdge && totalEl) {
        if (comboFires) {
          totalEl.textContent = String(comboCost);
          totalEl.classList.add('combo-active');
        } else {
          totalEl.textContent = String(singleCost);
          totalEl.classList.remove('combo-active');
        }
      }
      // 可用性：边缘卡按"实际会发射的成本"判定（连携则按 comboCost，否则按 singleCost）
      const usabilityCost = (isEdge && comboFires) ? comboCost : singleCost;
      cardE.classList.toggle('unusable', mana < usabilityCost);
    }
    const mainSlot = $main.firstChild;
    if (mainSlot) mainSlot.querySelector('.card').classList.toggle('unusable', mana < mainCost);
  }

  Events.on('deckChanged', renderHand);
  Events.on('comboChanged', n => {
    $combo.textContent = n;
    // bump 动画：先移除 → reflow → 加回去；分档：5 黄(默认) / 10 橙 / 15 红
    $combo.classList.remove('bump', 'tier-mid', 'tier-hot');
    void $combo.offsetWidth;
    if (n > 0) {
      $combo.classList.add('bump');
      if (n >= 15) $combo.classList.add('tier-hot');
      else if (n >= 10) $combo.classList.add('tier-mid');
    }
  });
  // 波次预告（右侧 rail + 简单的回合数显示）
  const $waveTurnNum = document.getElementById('turn-num');
  const $waveCdNum = document.getElementById('wave-cd-num');
  const $waveEnemies = document.getElementById('wave-enemies');
  function renderWavePreview() {
    if ($waveTurnNum) $waveTurnNum.textContent = world.battle.turnNumber || 0;
    const types = world.battle.nextWaveTypes;
    const tu = world.battle.turnsUntilWave;
    if ($waveCdNum) {
      if (!types || types.length === 0) $waveCdNum.textContent = t('wave_none');
      else if (tu <= 0) $waveCdNum.textContent = t('wave_this');
      else $waveCdNum.textContent = t('wave_after', { n: tu });
    }
    if ($waveEnemies) {
      $waveEnemies.innerHTML = '';
      if (types && types.length > 0) {
        const counts = {};
        for (const t of types) counts[t] = (counts[t] || 0) + 1;
        for (const [k, c] of Object.entries(counts)) {
          const def = ENEMY_TYPES[k];
          if (!def) continue;
          const el = document.createElement('div');
          el.className = 'we-item';
          // 用 canvas 渲染敌人缩略图（与战斗中实际渲染完全一致）
          const cv = document.createElement('canvas');
          cv.width = 48; cv.height = 48;
          const cctx = cv.getContext('2d');
          drawEnemyMini(cctx, def, 24, 24, 18);
          el.appendChild(cv);
          const countEl = document.createElement('span');
          countEl.className = 'we-count';
          countEl.textContent = '×' + c;
          el.appendChild(countEl);
          // 鼠标悬浮：完全复用 renderEnemyTooltipHTML（与战斗中 hover 实际敌人时一致）
          // 设 data-source=wave 标记，让 setupEnemyTooltip 的每帧 tick 不要把它隐藏
          el.addEventListener('mouseenter', () => {
            const $tip = document.getElementById('enemy-tooltip');
            if (!$tip) return;
            $tip.dataset.source = 'wave';
            $tip.innerHTML = renderEnemyTooltipHTML(def);
            const r = el.getBoundingClientRect();
            const tipW = 220;
            $tip.style.left = Math.max(8, r.left - tipW - 8) + 'px';
            $tip.style.top = Math.max(8, Math.min(window.innerHeight - 200, r.top)) + 'px';
            $tip.classList.remove('hidden');
          });
          el.addEventListener('mouseleave', () => {
            const $tip = document.getElementById('enemy-tooltip');
            if (!$tip) return;
            if ($tip.dataset.source === 'wave') delete $tip.dataset.source;
            $tip.classList.add('hidden');
          });
          $waveEnemies.appendChild(el);
        }
      }
    }
  }
  Events.on('waveChanged', renderWavePreview);
  Events.on('turnChanged', renderWavePreview);
  Events.on('stateChanged', renderWavePreview);

  Events.on('comboStacksChanged', n => {
    $comboStacks.textContent = n;
    $comboStacks.classList.toggle('zero', n === 0);
    $comboStacks.classList.remove('bump');
    void $comboStacks.offsetWidth;
    if (n > 0) $comboStacks.classList.add('bump');
    renderHand();   // 边缘卡的总费用框需要切换 combo-active 样式
  });
  // 护甲：变化时 bump 动画反馈
  Events.on('armorChanged', n => {
    if (!$armor) return;
    $armor.textContent = '🛡 ' + n;
    $armor.classList.toggle('zero', n <= 0);
    $armor.classList.remove('bump');
    void $armor.offsetWidth;
    $armor.classList.add('bump');
  });
  // 右侧 score 面板
  const $score = document.getElementById('score-val');
  const $highScore = document.getElementById('score-high');
  const $statKills = document.getElementById('stat-kills');
  const $statLevel = document.getElementById('stat-level');
  const $statShop = document.getElementById('stat-shop');
  if ($highScore) $highScore.textContent = world.highScore || 0;
  Events.on('scoreChanged', n => {
    if ($score) $score.textContent = n;
    if (n > (world.highScore || 0)) {
      world.highScore = n;
      if ($highScore) $highScore.textContent = n;
    }
  });
  Events.on('enemyDied', () => {
    if ($statKills) $statKills.textContent = (parseInt($statKills.textContent, 10) || 0) + 1;
  });
  Events.on('levelUp', lv => {
    if ($statLevel) $statLevel.textContent = lv;
  });
  // 商店等级显示 + reset 时同步
  function updateStats() {
    if ($statShop) $statShop.textContent = 'Lv ' + world.shopLevel;  // 'Lv' 通用，不翻译
    if ($statLevel) $statLevel.textContent = world.level;
    if ($statKills) $statKills.textContent = world.battle.killCount || 0;
  }
  Events.on('stateChanged', updateStats);
  Events.on('bagChanged', updateStats);
  Events.on('stateChanged', s => { $state.textContent = t('state_' + s); });
  Events.on('turnChanged', turn => {
    $turn.textContent = turn === 'player' ? t('turn_player') : t('turn_enemy');
    $turn.classList.toggle('turn-player', turn === 'player');
    $turn.classList.toggle('turn-enemy', turn === 'enemy');
  });

  // 设置：水晶用尽自动结束回合
  $autoEnd.checked = world.battle.autoEndOnZeroMana;
  $autoEnd.addEventListener('change', () => {
    world.battle.autoEndOnZeroMana = $autoEnd.checked;
  });
  // 设置：场上无敌人时自动结束回合（每点法力 +1 金币）
  const $autoEndNoEnemy = document.getElementById('auto-end-no-enemy-toggle');
  if ($autoEndNoEnemy) {
    $autoEndNoEnemy.checked = world.battle.autoEndOnNoEnemy;
    $autoEndNoEnemy.addEventListener('change', () => {
      world.battle.autoEndOnNoEnemy = $autoEndNoEnemy.checked;
    });
  }

  // 语言切换按钮：切换 → 重渲所有可见 UI
  const $langBtn = document.getElementById('lang-btn');
  if ($langBtn) {
    const refreshLangBtn = () => { $langBtn.textContent = t('lang_btn'); };
    refreshLangBtn();
    $langBtn.addEventListener('click', () => {
      setLang(LANG.current === 'zh' ? 'en' : 'zh');
    });
    Events.on('langChanged', refreshLangBtn);
  }

  // 语言切换 → 重新填充静态 DOM 文案、再触发各模块自己的渲染。
  // 注意：不能复用 stateChanged 触发再渲染（会让 Loot 面板再 roll 一次候选卡）；直接更新 HUD 文字即可。
  Events.on('langChanged', () => {
    applyI18nDom();
    // HUD 中的动态字段：直接设值，不复用 'stateChanged' 事件
    $turn.textContent = world.battle.turn === 'player' ? t('turn_player') : t('turn_enemy');
    $state.textContent = t('state_' + world.battle.state);
    // 卡组重渲（hand + main）
    renderHand();
    // 重渲下波预告（重新画卡片名 / 倒计时文本）
    renderWavePreview();
  });
  // 初次加载：应用 i18n 静态文案
  applyI18nDom();

  setupLootPanel(world);
  setupInventoryPanel(world);
  setupKeywordTooltips();
  setupEnemyTooltip(world);

  // 初次手动触发一次 state / turn 渲染，让初始文案就是当前语言
  Events.emit('stateChanged', world.battle.state);
  Events.emit('turnChanged', world.battle.turn);

  return { update, renderHand };
}

// 卡牌背包整理面板：随时可打开（战斗中花 10 法力），关闭后重新洗牌
function setupInventoryPanel(world) {
  const $btn = document.getElementById('open-inventory-btn');
  const $modal = document.getElementById('modal-inventory');
  const $bag = document.getElementById('inventory-bag');
  const $close = document.getElementById('close-inventory-btn');
  if (!$btn || !$modal) return;
  let _prevState = null;

  // 折算后的法力消耗 = 10 - discount（最低 0）。该 discount 在 endPlayerTurn 时累计。
  function _effectiveOpenCost() {
    return Math.max(0, 10 - (world.inventoryDiscount || 0));
  }

  function _refreshButton() {
    const cost = _effectiveOpenCost();
    $btn.textContent = t('open_bag', { n: cost });
    $btn.classList.toggle('discounted', (world.inventoryDiscount || 0) > 0);
  }
  Events.on('langChanged', _refreshButton);

  // 折扣变化时：刷新按钮文字 + 闪一下动画（弹一下、蓝光、变蓝）
  Events.on('inventoryDiscountChanged', () => {
    _refreshButton();
    $btn.classList.remove('discount-flash');
    void $btn.offsetWidth;    // 强制 reflow → 动画可重复触发
    $btn.classList.add('discount-flash');
  });
  _refreshButton();

  function open() {
    const inBattle = world.battle.state === State.Battle;
    const cost = _effectiveOpenCost();
    if (inBattle) {
      if (world.player.mana < cost) { toast(t('bag_need_mana', { n: cost }), 0.8); return; }
      world.player.mana -= cost;
    }
    // 打开后折扣归零（不论是否在战斗中都重置，避免 Idle / PostBattle 期间累计的折扣残留）
    if ((world.inventoryDiscount || 0) > 0) {
      world.inventoryDiscount = 0;
      Events.emit('inventoryDiscountChanged', 0);
    }
    _prevState = world.battle.state;
    world.battle.setState(State.Inventory);
    renderBag();
    $modal.classList.remove('hidden');
  }

  function close() {
    $modal.classList.add('hidden');
    // 重新洗牌（基于当前 bag）
    if (_prevState === State.Battle || _prevState === State.Inventory) {
      world.deck.resetForBattle();
      world.battle.setState(State.Battle);
    } else {
      world.deck.resetForBattle();    // 即使 Idle 也重洗，确保视觉上看到调整后的手牌
      world.battle.setState(_prevState || State.Idle);
    }
    _prevState = null;
  }

  function renderBag() {
    $bag.innerHTML = '';
    for (let i = 0; i < world.deck.bag.length; i++) {
      $bag.appendChild(invSlotEl(world.deck.bag[i], i));
    }
  }

  function invSlotEl(card, index) {
    const el = document.createElement('div');
    el.className = 'bag-slot rarity-' + (card.rarity || 'common');
    if (index === 0) el.classList.add('main');
    el.draggable = true;
    el.dataset.index = index;
    const art = card.def?.art || { emoji: '⚙' };
    const { html, seen } = renderDescWithKeywords(card.desc);
    el.innerHTML = `
      <div class="card-cost">${card.cost}</div>
      <div class="card-art rarity-${card.rarity || 'common'}">${art.emoji || '⚙'}</div>
      <div class="card-name">${card.name}</div>
      <div class="card-desc">${html}</div>
    `;
    el.__keywords = seen;
    el.addEventListener('contextmenu', e => {
      e.preventDefault();
      if (index === 0) { toast(t('is_main'), 0.6); return; }
      // 飞行动画提示主卡上位
      el.classList.add('set-main-flash');
      setTimeout(() => {
        world.deck.setAsMain(index);
        toast(t('set_main_toast', { name: world.deck.bag[0].name }), 0.9);
        renderBag();
      }, 220);
    });
    el.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', String(index));
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      $bag.querySelectorAll('.drop-target').forEach(n => n.classList.remove('drop-target'));
    });
    el.addEventListener('dragover', e => {
      e.preventDefault();
      el.classList.add('drop-target');
    });
    el.addEventListener('dragleave', () => el.classList.remove('drop-target'));
    el.addEventListener('drop', e => {
      e.preventDefault();
      el.classList.remove('drop-target');
      const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
      if (!isNaN(from) && from !== index) {
        world.deck.swap(from, index);
        renderBag();
      }
    });
    return el;
  }

  $btn.addEventListener('click', open);
  $close.addEventListener('click', close);
}

// 敌人详情 tooltip HTML（共享：实际 hover + 下波预告 hover 都用这个）
function renderEnemyTooltipHTML(typeOrInst) {
  // 既支持 ENEMY_TYPES 字典项（预告），也支持运行时 Enemy 实例（场上）
  const isInstance = typeOrInst.intents && typeOrInst.intentIdx !== undefined;
  const def = isInstance ? typeOrInst.type : typeOrInst;
  const intentIdx = isInstance ? typeOrInst.intentIdx : 0;
  const intent = isInstance ? def.intents[intentIdx] : def.intents?.[0];
  const hp = isInstance ? Math.ceil(typeOrInst.hp) : def.maxHp;
  const maxHp = isInstance ? typeOrInst.maxHp : def.maxHp;
  const attack = isInstance ? typeOrInst.attack : (def.attack || 0);
  const speed = isInstance ? typeOrInst.speed : def.speed;
  const xp = isInstance ? (typeOrInst.xpReward || 0) : (def.xpReward || 0);
  const cd = isInstance ? typeOrInst.intentCd : (intent?.cooldown || 0);
  const cdText = intent && intent.cooldown === 0 ? t('cd_now') : t('cd_after', { n: cd });
  const typeKey = isInstance ? typeOrInst.typeKey : Object.keys(ENEMY_TYPES).find(k => ENEMY_TYPES[k] === def);
  const displayName = enemyName(typeKey, def.name);
  const displayIntentDesc = enemyIntentDesc(typeKey, intentIdx, intent?.desc || '');
  return `
    <div class="et-name">${displayName}</div>
    <div class="et-stat">${t('et_hp')}: <b>${hp} / ${maxHp}</b> · ${t('et_attack')}: <b>${attack}</b> · ${t('et_speed')}: <b>${speed}</b></div>
    <div class="et-stat">${t('et_xp')}: <b>${xp}</b></div>
    <div class="et-intent">
      <div class="et-intent-title">${intent?.icon || ''} ${t('next_action')} (${cdText})</div>
      <div class="et-intent-desc">${displayIntentDesc}</div>
    </div>
  `;
}

// 敌人 / 己方单位 hover tooltip：每帧检查 mouse 是否在某单位上
function setupEnemyTooltip(world) {
  const $tip = document.getElementById('enemy-tooltip');
  if (!$tip) return;
  function tick() {
    requestAnimationFrame(tick);
    // 下波预告 hover 拥有 tooltip 时（dataset.source === 'wave'）不要被每帧 tick 抢走
    if ($tip.dataset.source === 'wave') return;
    const mx = world._mouseCanvasX, my = world._mouseCanvasY;
    if (mx == null || mx < 0) { $tip.classList.add('hidden'); return; }
    let hovered = null;
    let hoveredType = null;  // 'enemy' | 'summon'
    for (const e of world.enemies) {
      if (!e.alive) continue;
      const dx = e.x - mx, dy = e.y - my;
      const r = e.radius + 4;
      if (dx*dx + dy*dy <= r*r) { hovered = e; hoveredType = 'enemy'; break; }
    }
    if (!hovered) {
      // 检查己方召唤物
      for (const s of world.summons) {
        if (!s.alive) continue;
        const dx = s.x - mx, dy = s.y - my;
        const r = s.radius + 4;
        if (dx*dx + dy*dy <= r*r) { hovered = s; hoveredType = 'summon'; break; }
      }
    }
    if (!hovered) { $tip.classList.add('hidden'); return; }
    if (hoveredType === 'enemy') {
      $tip.innerHTML = renderEnemyTooltipHTML(hovered);
    } else {
      // 召唤物详情
      const s = hovered;
      const fireText = s.canFire ? t('et_fire_per', { cd: s.cooldown, atk: s.bulletAttack }) : t('et_melee');
      const decayText = (s.decayRate ?? 1) === 0 ? t('et_decay_none') : t('et_decay_per', { n: s.decayRate });
      const displayName = summonNameOf(s.kind, s.name || s.kind);
      const displayDesc = summonDescOf(s.kind, s.desc || '');
      $tip.innerHTML = `
        <div class="et-name" style="color:#5bd45b">${displayName}${t('et_friendly')}</div>
        <div class="et-stat">${t('et_hp')}: <b>${Math.ceil(s.hp)} / ${s.maxHp}</b> · ${t('et_attack')}: <b>${s.attack}</b> · ${t('et_speed')}: <b>${s.speed}</b></div>
        <div class="et-stat">${t('et_decay')}: <b>${decayText}</b> · ${t('et_behavior')}: <b>${fireText}</b></div>
        <div class="et-intent">
          <div class="et-intent-title">${t('et_intro')}</div>
          <div class="et-intent-desc">${displayDesc}</div>
        </div>
      `;
    }
    $tip.style.left = (world._mouseClientX + 18) + 'px';
    $tip.style.top = (world._mouseClientY + 12) + 'px';
    $tip.classList.remove('hidden');
  }
  tick();
}

// 关键词 tooltip 系统：任何 .card-slot 或 .modal-card hover 时，
// 在卡旁边弹出多个解释框（每个关键词一个），离开后清除。
function setupKeywordTooltips() {
  const $container = document.getElementById('keyword-popovers');
  let activePops = [];

  function clear() {
    for (const el of activePops) el.remove();
    activePops = [];
  }

  function show(slot, keywords) {
    clear();
    const rect = slot.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const onRight = rect.left + rect.width / 2 < viewportW / 2;

    // 反面卡：显示统一提示而非关键词解释
    const cardE = slot.querySelector('.card');
    if (cardE && cardE.classList.contains('face-down')) {
      const el = document.createElement('div');
      el.className = 'kw-pop kw-other';
      el.innerHTML = `<div class="kw-title">${t('facedown_title')}</div><div class="kw-body">${t('facedown_body')}</div>`;
      el.style.top = rect.top + 'px';
      if (onRight) el.style.left = (rect.right + 14) + 'px';
      else el.style.left = (rect.left - 214) + 'px';
      $container.appendChild(el);
      activePops.push(el);
      return;
    }

    if (!keywords || keywords.length === 0) return;
    let y = rect.top;
    for (const kw of keywords) {
      const el = document.createElement('div');
      el.className = 'kw-pop kw-' + kw.cls;
      el.innerHTML = `<div class="kw-title">${kw.title}</div><div class="kw-body">${kw.desc}</div>`;
      el.style.top = y + 'px';
      if (onRight) el.style.left = (rect.right + 14) + 'px';
      else el.style.left = (rect.left - 214) + 'px';
      $container.appendChild(el);
      activePops.push(el);
      y += el.offsetHeight + 6;
    }
  }

  // 事件委托：监听 document mouseover。让 show 内部决定显示关键词解释 / 反面提示 / 不显示
  document.addEventListener('mouseover', e => {
    const slot = e.target.closest('.card-slot, .modal-card, .bag-slot');
    if (!slot) return;
    const kws = slot.__keywords || [];
    show(slot, kws);
  });
  document.addEventListener('mouseout', e => {
    const slot = e.target.closest('.card-slot, .modal-card, .bag-slot');
    if (slot) clear();
  });
}

// ---- 战利品面板（合并 = 3 张候选 + 背包编辑 + 继续按钮）----
// 流程：胜利 → 面板出现 → 玩家可选 1 张候选（选错可改）→ 点背包槽完成替换
//      候选选 / 不选都可点「继续游戏」直接开下一战
function setupLootPanel(world) {
  const $panel = document.getElementById('modal-loot');
  const $cands = document.getElementById('loot-candidates');
  const $hint = document.getElementById('loot-hint');
  const $bag = document.getElementById('loot-bag');
  const $continue = document.getElementById('continue-btn');
  const $reroll = document.getElementById('reroll-btn');
  const $shopLevelBtn = document.getElementById('shop-level-btn');
  const $probBar = document.getElementById('shop-prob-bar');

  // 面板状态
  let candidates = [];      // 当前 3 张候选
  let selected = null;      // 当前选中的候选卡

  let selectedCount = 0;    // 本次商店已经购买（含主免费）的张数；用于递增金币消费
  function extraCost(n) {
    // n = 已购买张数（第 1 张是 free）；后续每张 cost = 3 + 2 * (n - 1)
    if (n <= 0) return 0;
    return 3 + 2 * (n - 1);   // 3, 5, 7, 9...
  }
  function showLoot() {
    const n = world.candidatesCount;
    candidates = [];
    for (let i = 0; i < n; i++) candidates.push(drawRandomCard(world.shopLevel));
    selected = null;
    selectedCount = 0;
    world.refreshCount = 0;             // 新 Loot session：重置连续刷新成本
    // 消耗 1 个 pendingShops（这次商店服务了一次升级）
    if (world.pendingShops > 0) world.pendingShops--;
    renderCandidates();
    renderBag();
    updateHint();
    renderRerollBtn();
    renderShopLevelBtn();
    renderProbBar();
    $panel.classList.remove('hidden');
  }

  // 在 Loot 面板上显示当前商店等级的稀有度概率分布。两组（当前 + 下一级）并排横排
  function renderProbBar() {
    if (!$probBar) return;
    const lv = world.shopLevel;
    const cur = RARITY_PROB[lv];
    const next = lv < 8 ? RARITY_PROB[lv + 1] : null;
    const labels = { common: '⬜', rare: '🟦', epic: '🟪', legendary: '🟧' };
    const pct = (n) => Math.round(n * 100) + '%';
    function groupHTML(probs, label, dimAll) {
      let h = `<div class="prob-group"><span class="prob-label">${label}</span>`;
      for (const k of ['common','rare','epic','legendary']) {
        const p = probs[k] || 0;
        h += `<span class="pp pp-${k}${(p === 0 || dimAll) ? ' dim' : ''}">${labels[k]} ${pct(p)}</span>`;
      }
      h += `</div>`;
      return h;
    }
    let html = groupHTML(cur, t('prob_label_cur', { lv }), false);
    if (next) {
      html += `<span class="prob-arrow">→</span>`;
      html += groupHTML(next, t('prob_label_next', { lv: lv + 1 }), true);
    }
    $probBar.innerHTML = html;
  }

  function renderRerollBtn() {
    if (!$reroll) return;
    const cost = world.refreshCost;
    $reroll.textContent = t('reroll', { cost: cost, gold: world.gold });
    $reroll.disabled = world.gold < cost || !!selected || candidates.length === 0;
  }

  function renderShopLevelBtn() {
    if (!$shopLevelBtn) return;
    const lv = world.shopLevel;
    if (lv >= 8) {
      $shopLevelBtn.textContent = t('shop_max');
      $shopLevelBtn.disabled = true;
      return;
    }
    const cost = world.SHOP_THRESHOLDS[lv - 1];
    $shopLevelBtn.textContent = t('shop_level', { cur: lv, next: lv + 1, cost: cost });
    $shopLevelBtn.disabled = world.gold < cost || !!selected || candidates.length === 0;
  }

  function updateHint() {
    if (candidates.length === 0) {
      $hint.textContent = t('loot_hint_done');
    } else if (selected) {
      $hint.textContent = t('loot_hint_selected', { name: selected.name });
    } else {
      $hint.textContent = t('loot_hint_pick');
    }
  }

  function renderCandidates() {
    $cands.innerHTML = '';
    // 不再用 has-selection 让未选淡出（用户可以连续买，需可见）
    for (const c of candidates) {
      const el = modalCardEl(c);
      if (c === selected) el.classList.add('selected');
      // 第 1 张免费；2+ 显示金币消费
      if (selectedCount > 0) {
        const cost = extraCost(selectedCount);
        const tag = document.createElement('div');
        tag.className = 'extra-cost-tag';
        tag.textContent = `💰 ${cost}`;
        if (world.gold < cost) tag.classList.add('cant-afford');
        el.appendChild(tag);
      }
      el.addEventListener('click', () => {
        // 选额外卡要先确认能付得起；选中只是 mark，扣费在 bag 槽 click 时
        selected = (selected === c) ? null : c;
        renderCandidates();
        renderBag();
        renderRerollBtn();
        updateHint();
      });
      $cands.appendChild(el);
    }
  }

  // 主卡居左（金色隔断） / 其它 8 张在 #loot-bag 网格中
  const $bagMain = document.getElementById('loot-bag-main');
  if ($bagMain) {
    $bagMain.dataset.label = t('main_card_label');
    Events.on('langChanged', () => { $bagMain.dataset.label = t('main_card_label'); });
  }
  function renderBag() {
    if ($bagMain) {
      $bagMain.dataset.label = t('main_card_label');
      $bagMain.innerHTML = '';
      if (world.deck.bag[0]) $bagMain.appendChild(bagSlotEl(world.deck.bag[0], 0));
    }
    if ($bag) {
      $bag.innerHTML = '';
      for (let i = 1; i < world.deck.bag.length; i++) {
        $bag.appendChild(bagSlotEl(world.deck.bag[i], i));
      }
    }
  }

  function bagSlotEl(card, index) {
    const el = document.createElement('div');
    el.className = 'bag-slot rarity-' + (card.rarity || 'common');
    if (index === 0) el.classList.add('main');
    if (selected) el.classList.add('replace-target');
    el.draggable = true;
    el.dataset.index = index;
    const art = card.def?.art || { emoji: '⚙' };
    const { html, seen } = renderDescWithKeywords(card.desc);
    el.innerHTML = `
      <div class="card-cost">${card.cost}</div>
      <div class="card-art rarity-${card.rarity || 'common'}">${art.emoji || '⚙'}</div>
      <div class="card-name">${card.name}</div>
      <div class="card-desc">${html}</div>
    `;
    el.__keywords = seen;
    // 左键：若已选候选 → 替换该位置（保留剩余候选，多购需金币）
    el.addEventListener('click', e => {
      if (e.button !== 0) return;
      if (!selected) return;
      // 检查额外购买的金币消费（第 1 张免费，从 2 张起需付费）
      if (selectedCount > 0) {
        const cost = extraCost(selectedCount);
        if (world.gold < cost) {
          toast(t('need_gold_extra', { n: cost }), 1.0);
          return;
        }
        world.gold -= cost;
        Events.emit('goldChanged', world.gold);
      }
      const cls = (index === 0) ? 'main-replace-flash' : 'set-main-flash';
      el.classList.add(cls);
      const candEl = $cands.querySelector('.modal-card.selected');
      if (candEl) candEl.classList.add('cand-consume-flash');
      // 从候选数组移除已购卡（不能反复购同一张）
      const cardBought = selected;
      const idx = candidates.indexOf(cardBought);
      if (idx >= 0) candidates.splice(idx, 1);
      setTimeout(() => {
        world.deck.replaceAt(index, cardBought);
        selected = null;
        selectedCount++;
        toast(index === 0 ? t('main_replaced') : t('replaced'), 0.6);
        renderCandidates();
        renderBag();
        renderRerollBtn();
        updateHint();
      }, 320);
    });
    // 右键：设为主卡（含飞行动画）
    el.addEventListener('contextmenu', e => {
      e.preventDefault();
      if (index === 0) { toast(t('is_main'), 0.6); return; }
      // 动画：先 flash 当前 slot 提示「即将上位主卡」
      el.classList.add('set-main-flash');
      setTimeout(() => {
        world.deck.setAsMain(index);
        toast(t('set_main_toast', { name: world.deck.bag[0].name }), 0.9);
        renderBag();        // 重渲让主卡跳到左侧位
      }, 220);
    });
    // 拖拽换位
    el.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', String(index));
      e.dataTransfer.effectAllowed = 'move';
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      $bag.querySelectorAll('.drop-target').forEach(n => n.classList.remove('drop-target'));
    });
    el.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      el.classList.add('drop-target');
    });
    el.addEventListener('dragleave', () => el.classList.remove('drop-target'));
    el.addEventListener('drop', e => {
      e.preventDefault();
      el.classList.remove('drop-target');
      const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
      if (!isNaN(from) && from !== index) world.deck.swap(from, index);
    });
    return el;
  }

  $continue.addEventListener('click', () => {
    candidates = [];
    selected = null;
    world.refreshCount = 0;             // 退出 Loot：重置刷新成本
    // 还有待处理商店（多次升级） → 立刻再开一次（新候选）
    if (world.battle.resumeAfterLoot && world.pendingShops > 0) {
      showLoot();
      return;
    }
    if (world.battle.resumeAfterLoot) {
      // 商店在玩家回合刚结束时开 → 关闭后走我方阶段 → 敌方阶段
      world.battle.resumeAfterLoot = false;
      world.deck.resetForBattle();
      world.battle.setState(State.Battle);
      world.battle._afterPlayerTurnComplete();   // 触发 setTurn('enemy') → 阶段 1 / 阶段 2
    } else {
      world.battle.setState(State.Idle);
      world.battle.startBattle();
    }
  });

  if ($reroll) {
    $reroll.addEventListener('click', () => {
      const cost = world.refreshCost;
      if (world.gold < cost) return;
      world.gold -= cost;
      world.refreshCount++;             // 下次刷新更贵
      const n = world.candidatesCount;
      candidates = [];
      for (let i = 0; i < n; i++) candidates.push(drawRandomCard(world.shopLevel));
      selected = null;
      renderCandidates();
      renderBag();
      updateHint();
      renderRerollBtn();
      renderShopLevelBtn();
    });
  }

  if ($shopLevelBtn) {
    $shopLevelBtn.addEventListener('click', () => {
      if (!world._shopLevelUp()) return;
      // 升级后用新概率重抽候选 + 候选数变多
      const n = world.candidatesCount;
      candidates = [];
      for (let i = 0; i < n; i++) candidates.push(drawRandomCard(world.shopLevel));
      selected = null;
      renderCandidates();
      renderBag();
      updateHint();
      renderRerollBtn();
      renderShopLevelBtn();
      renderProbBar();
    });
  }

  Events.on('bagChanged', () => {
    if (world.battle.state === State.Reward) renderBag();
  });
  Events.on('stateChanged', s => {
    if (s === State.Reward) showLoot();
    else $panel.classList.add('hidden');
  });
  // 语言切换：如果面板正打开，重渲所有可见内容（候选卡、背包、提示），但不重新 roll
  Events.on('langChanged', () => {
    if (world.battle.state !== State.Reward) return;
    renderCandidates();
    renderBag();
    updateHint();
    renderRerollBtn();
    renderShopLevelBtn();
    renderProbBar();
  });
}

function modalCardEl(card) {
  const el = document.createElement('div');
  el.className = 'modal-card rarity-' + (card.rarity || 'common');
  const art = card.def?.art || { emoji: '⚙' };
  const { html, seen } = renderDescWithKeywords(card.desc);
  el.innerHTML = `
    <div class="card-cost">${card.cost}</div>
    <div class="card-art rarity-${card.rarity || 'common'}">${art.emoji || '⚙'}</div>
    <div class="card-name">${card.name}</div>
    <div class="card-desc">${html}</div>
  `;
  el.__keywords = seen;
  return el;
}

const $toast = document.getElementById('toast');
let _toastTimer = 0;
function toast(text, sec = 1.2) {
  $toast.textContent = text;
  $toast.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => $toast.classList.remove('show'), sec * 1000);
}

// ─── 12. Render & Main Loop ────────────────────────────────────────
// 连击 canvas overlay：位置 = 梯形底部右侧的空白区域（梯形外右下角）
// 每次 combo 变化短暂缩放弹出
function renderComboOverlay(ctx, world) {
  const n = world.combo.combo;
  if (n <= 0) return;
  // 分档：5 黄 / 10 橙 / 15 红；高 combo 弹得更猛、glow 更亮
  let color = '#ffd84a', glow = '#ff9c4a', bumpScale = 0.7, extraGlow = 0;
  if (n >= 15)      { color = '#ff5050'; glow = '#ff2020'; bumpScale = 1.05; extraGlow = 14; }
  else if (n >= 10) { color = '#ff9c4a'; glow = '#ff5020'; bumpScale = 0.88; extraGlow = 6; }
  // 5..9 沿用默认黄
  const t = performance.now() / 1000 - world.combo.lastBumpTime;
  const bumpDur = 0.35;
  const bumpT = Math.max(0, 1 - t / bumpDur);   // 1 → 0
  const scale = 1 + bumpT * bumpScale;
  ctx.save();
  // 梯形 bottomRight = 650, world.w = 900 → 空白区中心 ~(775, h-60)
  ctx.translate(world.w - 65, world.h - 55);
  ctx.scale(scale, scale);
  ctx.fillStyle = color;
  ctx.shadowColor = glow;
  ctx.shadowBlur = 18 + extraGlow;
  ctx.font = 'bold 40px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(`× ${n}`, 0, 0);
  ctx.font = 'bold 11px "Microsoft YaHei", sans-serif';
  ctx.fillStyle = '#b0b8c2';
  ctx.shadowBlur = 0;
  ctx.fillText('COMBO', 0, -26);
  ctx.restore();
}

// 经验条：canvas 顶部细横条；xp 粒子飞向左端
function renderXpBar(ctx, world) {
  const x = 20, y = 16, w = world.w - 130, h = 8;
  // 底
  ctx.save();
  ctx.fillStyle = 'rgba(10, 13, 17, 0.85)';
  ctx.fillRect(x, y, w, h);
  // 填充
  const fillW = w * (world.xp / world.xpMax);
  const grad = ctx.createLinearGradient(x, 0, x + w, 0);
  grad.addColorStop(0, '#4a82d4');
  grad.addColorStop(1, '#7eb1ff');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, fillW, h);
  // 边框
  ctx.strokeStyle = '#3a4452';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  // Lv 数字
  ctx.fillStyle = '#f1f4f8';
  ctx.font = 'bold 14px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`Lv ${world.level}`, x + w + 10, y + h / 2);
  ctx.font = '11px "Microsoft YaHei", sans-serif';
  ctx.fillStyle = '#7eb1ff';
  ctx.fillText(`${world.xp}/${world.xpMax}`, x + w + 50, y + h / 2);
  ctx.restore();
  // 更新经验条左端的目标坐标（粒子飞这里）
  world.xpBarPos.x = x + 4;
  world.xpBarPos.y = y + h / 2;
}

function render(ctx, world) {
  // 屏幕震动：把整张画的内容沿随机方向偏移（仅当前帧）
  let shakeX = 0, shakeY = 0;
  if (world.shake && world.shake.time > 0 && world.shake.intensity > 0) {
    const k = Math.max(0, world.shake.time / Math.max(0.001, world.shake.duration));
    const amp = world.shake.intensity * k;
    shakeX = (Math.random() - 0.5) * 2 * amp;
    shakeY = (Math.random() - 0.5) * 2 * amp;
  }
  ctx.save();
  if (shakeX || shakeY) ctx.translate(shakeX, shakeY);
  // 梯形外区域：暗色（标识禁区）
  ctx.fillStyle = '#0a0d11';
  ctx.fillRect(0, 0, world.w, world.h);
  // 梯形内区域：稍亮的战场
  const tr = world.trap;
  ctx.fillStyle = '#1a2028';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(world.w, 0);
  ctx.lineTo(tr.bottomRight, world.h);
  ctx.lineTo(tr.bottomLeft, world.h);
  ctx.closePath();
  ctx.fill();
  // 网格（只画在梯形内）
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = '#222a34';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= world.w; x += 60) { ctx.moveTo(x, 0); ctx.lineTo(x, world.h); }
  for (let y = 0; y <= world.h; y += 60) { ctx.moveTo(0, y); ctx.lineTo(world.w, y); }
  ctx.stroke();
  ctx.restore();
  // 梯形边框（奖励回合 → 金色脉冲渐变）
  const isReward = world.battle.rewardTurn;
  if (isReward) {
    const t = performance.now() / 1000;
    const pulse = 0.7 + Math.sin(t * 4) * 0.3;
    const grad = ctx.createLinearGradient(0, 0, 0, world.h);
    grad.addColorStop(0, '#ffd84a');
    grad.addColorStop(0.5, '#ff9c4a');
    grad.addColorStop(1, '#ffd84a');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 4;
    ctx.shadowColor = '#ffae00';
    ctx.shadowBlur = 18 * pulse;
  } else {
    ctx.strokeStyle = '#4a5868';
    ctx.lineWidth = 2;
  }
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(world.w, 0);
  ctx.lineTo(tr.bottomRight, world.h);
  ctx.lineTo(tr.bottomLeft, world.h);
  ctx.closePath();
  ctx.stroke();
  ctx.shadowBlur = 0;

  for (const e of world.enemies) e.draw(ctx);
  for (const b of world.bullets) b.draw(ctx);
  for (const s of world.summons) s.draw(ctx);
  world.player.draw(ctx);
  for (const p of world.particles) p.draw(ctx);

  // XP 条已挪到 DOM，canvas 不再绘制
  renderComboOverlay(ctx, world);

  if (world.battle.state === State.Idle) {
    ctx.fillStyle = '#d6dbe2';
    ctx.font = '20px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(t('enter_to_start'), world.w / 2, world.h / 2 - 10);
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#6f7986';
    ctx.fillText(t('enter_hint'), world.w / 2, world.h / 2 + 16);
  }
  ctx.restore();
  // 受击 vignette：屏幕四边红色径向遮罩（不被 shake 偏移，保证"画面外缘"始终对齐窗口边缘）
  if (world.damageFlash > 0) {
    const k = Math.min(1, world.damageFlash);
    const grad = ctx.createRadialGradient(
      world.w / 2, world.h / 2, Math.min(world.w, world.h) * 0.25,
      world.w / 2, world.h / 2, Math.max(world.w, world.h) * 0.65,
    );
    grad.addColorStop(0, 'rgba(220, 40, 40, 0)');
    grad.addColorStop(1, `rgba(220, 40, 40, ${(0.55 * k).toFixed(3)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, world.w, world.h);
  }
}

function main() {
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');
  const world = new World();
  const ui = setupUI(world);
  setupInput(world, canvas);

  // 初始背包：9 张 1 费"强化"（伤害 +1）—— 干净的起手卡，玩家通过商店逐步替换为策划表卡。
  // bag[0] 是主卡 → 主卡也是 强化，每次发射主卡 hook 也算一次伤害 +1（即每次基础攻击 = 1 + 1 + 1 = 3，
  // 还会再叠上其他 side card 的 buff）。
  const cards = [];
  for (let i = 0; i < 9; i++) cards.push(new Card_强化());
  world.deck.setBag(cards);
  world.deck.resetForBattle();    // 初始洗牌让 UI 有手牌显示（Idle 状态下也能看见）
  ui.renderHand();

  // 敌人被玩家击杀 → 爆出经验球 + 金币球（都先散落周围再飞向条） + 计分
  Events.on('enemyDied', enemy => {
    const xp = enemy.xpReward || 2;
    FX.xpBurst(world, enemy.x, enemy.y, xp);
    // 金币：经验奖励的一半（向上取整），至少 1，拆分成多个 orb
    const goldAmount = Math.max(1, Math.ceil((enemy.xpReward || 2) / 2));
    const orbCount = Math.min(5, Math.max(1, goldAmount));
    const perOrb = Math.ceil(goldAmount / orbCount);
    for (let i = 0; i < orbCount; i++) {
      world.particles.push(new GoldOrb(world, enemy.x, enemy.y, perOrb));
    }
    // —— 死亡 juice：白色闪光环 + 碎片爆裂 + 中量震动 + 极短 hit-stop ——
    world.particles.push(new Particle({
      x: enemy.x, y: enemy.y, life: 0.32, color: '#ffffff',
      size: enemy.radius * 1.6, type: 'ring',
    }));
    const shardCount = 8 + Math.floor((enemy.radius || 14) * 0.5);
    for (let i = 0; i < shardCount; i++) {
      const a = Math.PI * 2 * Math.random();
      const sp = 140 + Math.random() * 160;
      world.particles.push(new Particle({
        x: enemy.x, y: enemy.y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.38 + Math.random() * 0.25,
        color: enemy.color || '#ffd84a', size: 3,
      }));
    }
    FX.shake(world, clamp(3 + xp * 0.4, 3, 8), 0.18);
    FX.hitStop(world, 0.05);
    // —— 强化死亡：溢出杀（amount > HP×2）或 boss 死 → 双层爆炸环 + 更长 hit-stop + 更猛震屏 ——
    const isBoss = enemy.typeKey === 'boss';
    if (enemy._overkill || isBoss) {
      world.particles.push(new Particle({
        x: enemy.x, y: enemy.y, life: 0.55,
        color: '#ffd84a', size: enemy.radius * 2.4, type: 'ring',
      }));
      world.particles.push(new Particle({
        x: enemy.x, y: enemy.y, life: 0.7,
        color: '#ff5050', size: enemy.radius * 3.2, type: 'ring',
      }));
      FX.shake(world, isBoss ? 13 : 9, 0.32);
      FX.hitStop(world, isBoss ? 0.18 : 0.13);
      // boss 死特别加色散，标识"决定性时刻"
      if (isBoss) world.chromaT = Math.max(world.chromaT || 0, 0.4);
    }
    // 计分：杀敌 = xp × 10（普通怪 20 分、boss 200 分）
    world.score += xp * 10;
    Events.emit('scoreChanged', world.score);
    // 触发死亡特殊效果（如分裂）
    enemy.onDie?.(world);
  });
  Events.on('levelUp', lv => {
    world.score += 50;
    Events.emit('scoreChanged', world.score);
  });

  let last = performance.now() / 1000;
  function loop() {
    const now = performance.now() / 1000;
    const realDt = Math.min(0.05, now - last);
    last = now;

    // Hit-stop：暂停游戏物理一小段（玩家、敌人、子弹的世界 dt = 0），但 UI / 粒子继续
    let dt = realDt;
    if (world.hitStop > 0) {
      world.hitStop = Math.max(0, world.hitStop - realDt);
      dt = 0;
    }
    // Shake 衰减（不被 hitStop 阻挡，UI 反馈始终持续）
    if (world.shake && world.shake.time > 0) {
      world.shake.time -= realDt;
      if (world.shake.time <= 0) {
        world.shake.time = 0;
        world.shake.intensity = 0;
        world.shake.duration = 0;
      }
    }
    // 玩家受击 vignette 衰减
    if (world.damageFlash > 0) world.damageFlash = Math.max(0, world.damageFlash - realDt * 1.6);
    // 重击 chromatic aberration 衰减 + canvas CSS filter 应用（仅在状态切换时改 DOM）
    if (world.chromaT > 0) world.chromaT = Math.max(0, world.chromaT - realDt);
    const chromaOn = world.chromaT > 0;
    if (chromaOn) {
      const k = world.chromaT / 0.18;
      const off = (k * 3).toFixed(2);
      canvas.style.filter = `drop-shadow(${off}px 0 0 rgba(255,40,40,0.75)) drop-shadow(-${off}px 0 0 rgba(0,210,255,0.75))`;
      canvas._chromaOn = true;
    } else if (canvas._chromaOn) {
      canvas.style.filter = '';
      canvas._chromaOn = false;
    }

    world.player.update(dt);
    // 鼠标按压持续发射（doFire 内部按 fireInterval 0.5s 节流，连按多帧无副作用）
    if (world.battle.state === State.Battle) {
      if (heldButtons.left)  doFire(world, 'left');
      if (heldButtons.right) doFire(world, 'right');
      for (const e of world.enemies) e.update(dt, world);
      for (const s of world.summons) s.update(dt, world);
      for (const b of world.bullets) b.update(dt, now, world);
    }
    // 粒子始终更新（用真实 dt，让伤害数字 / 击中粒子继续动）
    for (const p of world.particles) p.update(realDt);
    for (let i = world.particles.length - 1; i >= 0; i--) {
      if (!world.particles[i].alive) world.particles.splice(i, 1);
    }
    // 清理死敌人（killCount 由 enemyDied 事件加，自爆不计入）
    for (let i = world.enemies.length - 1; i >= 0; i--) {
      if (!world.enemies[i].alive) world.enemies.splice(i, 1);
    }
    // 清理死召唤物
    for (let i = world.summons.length - 1; i >= 0; i--) {
      if (!world.summons[i].alive) world.summons.splice(i, 1);
    }
    // 清理死子弹
    for (let i = world.bullets.length - 1; i >= 0; i--) {
      if (!world.bullets[i].alive) world.bullets.splice(i, 1);
    }
    world.battle.update(dt);

    ui.update();
    render(ctx, world);
    requestAnimationFrame(loop);
  }
  loop();

  // 调试 hook
  window.__game = world;
  // 把所有卡牌类暴露到 window，方便 preview 测试。生产无害。
  window.__cards = {};
  for (const Ctor of ALL_CARD_CTORS) window.__cards[Ctor.name] = Ctor;
}

main();

})();
