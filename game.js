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
    hud_turn: '回合', hud_state: '状态', hud_turn_num: '本关回合',
    stage_label: '第', stage_unit: '关', stage_cleared: '★ 第 {n} 关通过 ★',
    hud_auto_end: '法力不足时自动结束回合',
    hud_auto_end_no_enemy: '无敌人时自动结束回合 (每点法力+1金币)',
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
    shop_max: '商店 Lv 16 (MAX)',
    shop_btn_init: '商店 Lv 1 (0/1)',
    loot_hint_pick: '点击候选卡 → 再点背包槽完成替换（不选也可直接继续）',
    loot_hint_done: '已替换。可继续调整背包或点击继续游戏',
    loot_hint_selected: '已选「{name}」 → 点击下方任一卡完成替换（可再点候选改主意）',
    continue: '继续游戏',
    wave_preview: '下波预告',
    score_run: '本局：', score_best: '最高：', stat_kills: '击杀：', stat_level: '等级：', stat_shop: '商店：',
    wave_this: '本回合', wave_after: '{n} 回合后', wave_none: '—',
    wave_last_this: '★ 最后一波 · 本回合',
    wave_last_after: '★ 最后一波 · {n} 回合后',
    orb_appear_in: '💰 金球：{n} 回合内清空',
    orb_appear_this: '💰 金球：本回合清空',
    orb_expire_after: '💰 金球：{n} 回合后消失',
    orb_expire_this: '💰 金球：本回合消失',
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
    rarity_bronze: '铜', rarity_silver: '银', rarity_gold: '金', rarity_diamond: '钻',
    upgrade_preview: '→ {tier}', merge_toast: '✨ 合成 → {name}「{tier}」',
    main_card_label: '主卡',
    cannon_select_title: '选择起始炮台',
    cannon_select_sub: '选择后无法更改（本局有效）',
    cannon_hud_label: '炮台',
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
    hud_turn: 'Turn', hud_state: 'State', hud_turn_num: 'Stage Turn',
    stage_label: 'Stage', stage_unit: '', stage_cleared: '★ Stage {n} Cleared ★',
    hud_auto_end: 'Auto-end turn when low on mana',
    hud_auto_end_no_enemy: 'Auto-end turn when no enemies (+1 gold per mana)',
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
    shop_max: 'Shop Lv 16 (MAX)',
    shop_btn_init: 'Shop Lv 1 (0/1)',
    loot_hint_pick: 'Click a candidate → then click a bag slot to replace (or just continue)',
    loot_hint_done: 'Replaced. Keep editing your bag or hit Continue.',
    loot_hint_selected: 'Selected "{name}" → click any bag slot to replace (click again to undo)',
    continue: 'Continue',
    wave_preview: 'Next Wave',
    score_run: 'Run:', score_best: 'Best:', stat_kills: 'Kills:', stat_level: 'Level:', stat_shop: 'Shop:',
    wave_this: 'this turn', wave_after: 'in {n} turn(s)', wave_none: '—',
    wave_last_this: '★ Final Wave · this turn',
    wave_last_after: '★ Final Wave · in {n} turn(s)',
    orb_appear_in: '💰 Orb: clear in {n} turn(s)',
    orb_appear_this: '💰 Orb: clear this turn',
    orb_expire_after: '💰 Orb expires in {n} turn(s)',
    orb_expire_this: '💰 Orb expires this turn',
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
    rarity_bronze: 'Bronze', rarity_silver: 'Silver', rarity_gold: 'Gold', rarity_diamond: 'Diamond',
    upgrade_preview: '→ {tier}', merge_toast: '✨ Merged → {name} ({tier})',
    main_card_label: 'Main',
    cannon_select_title: 'Choose Your Starting Cannon',
    cannon_select_sub: 'Locked in for this run',
    cannon_hud_label: 'Cannon',
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
    { word: '展露',  cls: 'reveal',  title: '展露',  desc: '当卡牌为正面时（边缘卡 / 主卡），发射子弹会触发展露效果。卡牌自身被使用时也会触发。' },
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
    { word: '燃烧',  cls: 'fire',    title: '燃烧',  desc: '可叠加层数的 debuff。敌方回合开始前每个燃烧敌人受 (燃烧层数) 伤害，然后层数 -1。' },
    { word: '冻结',  cls: 'freeze',  title: '冻结',  desc: '可叠加层数的 debuff。被冻结的敌人变蓝、跳过当前敌方回合的行动，并受到双倍伤害；实体化子弹命中冻结敌人不扣实体化层数。每个敌方回合结束时层数 -1（结算顺序：先燃烧再冻结）。' },
    { word: '引爆',  cls: 'fire',    title: '引爆',  desc: '立刻让所有有燃烧的敌人受 (燃烧层数 × N) 伤害并清空。' },
    { word: '数量',  cls: 'bullet',  title: '数量',  desc: '一波内发射的子弹数量。数量+N = 每波多打 N 颗。多颗子弹自动均匀扇形展开。' },
    { word: '波次',  cls: 'bullet',  title: '波次',  desc: '单次发射会出几波。波次+N = 同方向多打 N 波，每波间隔 0.12s。' },
    { word: '骷髅',  cls: 'summon',  title: '骷髅',  desc: '召唤一个矮小的近战骷髅小兵（1 攻）。每个敌方回合冲向一名随机敌人撞击一次。撞击免疫反击伤害，撞击后消耗 1 层实体化；归 0 时被摧毁。' },
    { word: '弃牌',  cls: 'discard', title: '弃牌',  desc: '把卡弃到弃牌堆触发效果（与「弃置」同义）。手牌空时弃牌堆全部洗回。' },
  ],
  en: [
    { word: 'Reveal',    cls: 'reveal',  title: 'Reveal',    desc: 'While a card is face-up (edge card / main), firing any bullet triggers its Reveal effect. Using the card itself also triggers its Reveal effect.' },
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
    { word: 'Burn',      cls: 'fire',    title: 'Burn',      desc: 'Stackable debuff. At the start of each enemy turn, each burning enemy takes (stack) damage and then loses 1 stack.' },
    { word: 'Freeze',    cls: 'freeze',  title: 'Freeze',    desc: 'Stackable debuff. Frozen enemies turn blue, skip their actions for the enemy turn, and take double damage. Entity bullets don’t lose layers when hitting frozen enemies. Freeze stack -1 at end of each enemy turn (burn resolves first, then freeze).' },
    { word: 'Detonate',  cls: 'fire',    title: 'Detonate',  desc: 'Immediately deal (stack × N) damage to all enemies with Burn and clear their stacks.' },
    { word: 'Bullets',   cls: 'bullet',  title: 'Bullets',   desc: 'Number of projectiles fired per wave. Bullets+N = N extra projectiles per wave, fanned automatically.' },
    { word: 'Wave',      cls: 'bullet',  title: 'Wave',      desc: 'How many waves a single shot fires. Wave+N = N extra waves in the same direction, 0.12s apart.' },
    { word: 'Skeleton',  cls: 'summon',  title: 'Skeleton',  desc: 'Summons a tiny melee skeleton (1 ATK). Each enemy turn it charges a random enemy once, immune to retaliation; loses 1 entity layer per charge; destroyed at 0.' },
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
    this.lifetime = opts.lifetime ?? 3.2;
    this.bulletCount = opts.bulletCount ?? 1;
    this.waveCount = opts.waveCount ?? 1;
    this.attack = opts.attack ?? 1;
    this.bound = opts.bound ?? 0;
    this.penetrate = opts.penetrate ?? 0;
    this.radius = opts.radius ?? 5;

    this.hooks = [];
    this.alive = false;     // 是否激活（飞行中）
    this.born = 0;
    this.recentHits = new Map();   // enemyID -> last hit time（仅实体子弹用）
    this.hitCooldown = 0.1;        // 同上
    // 当前接触中的敌人 ID 集合 → 飞行子弹专用：穿过一颗敌人时只在"进入接触"瞬间触发 1 次命中
    // 离开后再次进入才会再次触发；避免子弹在敌人体积内每帧反复命中
    this._contactSet = new Set();
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

  activate(now) {
    this.alive = true;
    this.born = now;
    // 应用玩家永久升级（仅作用于友方子弹；通过 team !== 'enemy' 判定）
    const w = window.__game;
    if (w && w.permUpgrades && this.team !== 'enemy') {
      const pu = w.permUpgrades;
      if (pu.damage) this.attack += pu.damage;
      if (pu.pierce) this.penetrate += pu.pierce;
      if (pu.bound)  this.bound    += pu.bound;
      if (pu.speed)  this.speed    += 50 * pu.speed;
    }
    // 记录初速度作为追踪导弹的速度上限参考（maxSpeed = initial × 1.5）
    this._initialSpeed = this.speed;
    // 追踪导弹：发射时锁定"瞄准延长线附近"的敌人。
    // 算法：取与发射角度的 |Δθ| ≤ 60° 的所有候选，选 |Δθ| 最小者锁定。
    // 这样玩家瞄哪打哪 — 即使旁边有更近的怪，也优先打自己瞄准的那只。
    // 锁定目标死亡后才回落到 nearest（在 update() 中处理）。
    if (this.tracking && w) {
      const candidates = this.team === 'enemy'
        ? [w.player, ...(w.summons || [])]
        : (w.enemies || []);
      let best = null, bestAbs = Math.PI / 3;   // ±60° cone
      for (const e of candidates) {
        if (!e) continue;
        if (e.alive === false) continue;
        if (e.hp != null && e.hp <= 0) continue;
        if (e.spawnT && e.spawnT > 0) continue;     // 出场无敌期间不锁定
        const ang = Math.atan2(e.y - this.y, e.x - this.x);
        let d = ang - this.angle;
        while (d >  Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        if (Math.abs(d) < bestAbs) { bestAbs = Math.abs(d); best = e; }
      }
      this._lockTarget = best;
    }
  }

  update(dt, now, world) {
    if (!this.alive) return;
    this._world = world;     // 给 Destroyed 钩子留下 world 引用
    // 风之眼：持续吸引附近敌人，任意阶段（含玩家回合 / 敌方回合 / 实体态）都生效。
    // 范围内距离越近吸引力越强（线性 falloff：边缘 0, 中心 maxPullSpeed）。
    if (this._eyeWind && this.team !== 'enemy') {
      const pullMult = this._eyeWindMult || 1;
      const pullRadius = 220 * pullMult;
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
    // 追踪 = "导弹型"：用角速度模型转向（与子弹速度脱耦），同时保留"加速冲刺"手感。
    // 旧版基于线性加速度的方式（newV = v + accel·ux·dt）问题：转向速率 = accel / |v|，
    // 子弹一旦获得 buff 提速，转弯能力反而变差 → 哪怕瞄准也会被甩飞打圈错过。
    // 新模型：每帧把朝向直接朝目标转 ≤ trackTurnRate × dt 弧度；速度模长另由 trackAccel 控制。
    if (this.tracking) {
      // 优先用 activate() 时锁定的目标（"瞄准谁追谁"）；死亡 / 离场后回落到 nearest。
      let nearest = null;
      const lk = this._lockTarget;
      const lkAlive = lk && lk.alive !== false && !(lk.hp != null && lk.hp <= 0);
      if (lkAlive) {
        nearest = lk;
      } else {
        let minD = Infinity;
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
      }
      if (nearest) {
        const dx = nearest.x - this.x, dy = nearest.y - this.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.5) {
          // 角速度转向：默认 7 rad/s ≈ 401°/s（半圈 ~0.45s）。卡牌可通过 trackTurnRate 覆盖。
          const targetAngle = Math.atan2(dy, dx);
          let diff = targetAngle - this.angle;
          while (diff > Math.PI)  diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          const maxTurn = (this.trackTurnRate || 7) * dt;
          this.angle += clamp(diff, -maxTurn, maxTurn);
          // 速度模长：朝 initialSpeed × 1.5 逐渐加速；trackAccel 控制速率（默认 600 px/s²）。
          const initSpeed = this._initialSpeed || this.speed;
          const maxSpeed = initSpeed * 1.5;
          const accel = this.trackAccel || 600;
          this.speed = Math.min(maxSpeed, this.speed + accel * dt);
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
      // 接触状态化命中：本帧实际重叠的敌人集合记为 newContacts。
      // 只有"上一帧不在接触、本帧首次接触"的敌人才会触发命中（OnHit + HitEnemy + 默认伤害）。
      // 穿过敌人时，子弹在敌人体积内的多帧不会重复命中；只有完全离开后再次进入才会重触发。
      const newContacts = new Set();
      for (const e of world.enemies) {
        if (!e.alive) continue;
        if (e.spawnT > 0) continue;       // 出场 portal 期间不可命中
        const dx = e.x - this.x, dy = e.y - this.y;
        if (dx*dx + dy*dy > (e.radius + this.radius) ** 2) continue;
        newContacts.add(e.id);
        if (this._contactSet.has(e.id)) continue;     // 仍在接触中 → 不重复触发
        // OnHit 先 → HitEnemy 后（让 debuff 类钩子先生效，让 fuelcell 读取最新 fire）
        this.triggerHooks(Phase.OnHit, { enemy: e, world });
        const handled = this.triggerHooks(Phase.HitEnemy, { enemy: e, world });
        if (!handled) this._defaultHitEnemy(e, world);
        if (!this.alive) break;
      }
      this._contactSet = newContacts;
    }
  }

  // 默认 HitEnemy：造成伤害 + 视觉 + 击退；不论 dealt 都消耗 1 次 penetrate
  // （子弹刚刚还在 AOE 阶段把目标打死，到这里 dealt=false 也要扣 penetrate / 销毁子弹）
  _defaultHitEnemy(enemy, world) {
    const dealt = enemy.takeDamage(this.attack);
    if (dealt) {
      // 击退：仅在本次命中后子弹会销毁时（不再穿透）触发。
      if (this.penetrate <= 0) {
        const baseForce = clamp(3 + this.attack * 1.0, 3, 16);
        const force = baseForce * (this.radius / 5);
        enemy.applyKnockback(this.x, this.y, force);
      }
      if (world) {
        FX.hit(world, this.x, this.y);
        FX.damage(world, enemy.x, enemy.y - enemy.radius, this.attack);
        FX.shake(world, clamp(1 + this.attack * 0.4, 1, 5), 0.12);
        if (this.attack >= 5) FX.hitStop(world, 0.045);
        if (this.attack >= 10) FX.hitStop(world, 0.08);
      }
    }
    // 关键：penetrate 是"碰撞次数计数"，不论本次是否实际造成伤害都要消耗
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
      // 与飞行子弹一致：OnHit 先 → HitEnemy 后（让 debuff 类钩子先生效）
      this.triggerHooks(Phase.OnHit, { enemy: e, world });
      this.triggerHooks(Phase.HitEnemy, { enemy: e, world });
      const dealt = e.takeDamage(this.attack);
      if (dealt && world) {
        const baseForce = clamp(3 + this.attack * 1.0, 3, 16);
        const force = baseForce * (this.radius / 5);
        e.applyKnockback(this.x, this.y, force);
        FX.hit(world, this.x, this.y);
        FX.damage(world, e.x, e.y - e.radius, this.attack);
        FX.shake(world, clamp(1 + this.attack * 0.4, 1, 5), 0.12);
      }
      // 冻结的敌人：实体化子弹与之碰撞不扣层数（无视消耗）
      if (!(e.freeze > 0)) {
        this.entityLayers--;
        if (this.entityLayers <= 0) {
          this.triggerHooks(Phase.Destroyed, { world });
          this.alive = false;
          return;
        }
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

    // 火焰子弹（_fireOnHit > 0 或 _burnAura 标记）：在基础子弹之下铺一层闪烁火焰光环
    // 用 globalCompositeOperation='lighter' 做加法叠色 + 多频正弦抖动模拟火舌跳动
    if (!this._batBullet && (this._fireOnHit > 0 || this._burnAura)) {
      const tt = performance.now() / 1000;
      // 用 born 做相位偏移，让多颗子弹的火焰错开闪烁
      const flicker = 0.65 + Math.sin(tt * 14 + this.born * 7) * 0.3 + Math.sin(tt * 31) * 0.08;
      const auraR = this.radius * 2.8;
      const grad = ctx.createRadialGradient(0, 0, this.radius * 0.4, 0, 0, auraR);
      grad.addColorStop(0,    `rgba(255, 240, 180, ${0.55 * flicker})`);
      grad.addColorStop(0.32, `rgba(255, 140, 40, ${0.45 * flicker})`);
      grad.addColorStop(0.7,  `rgba(220, 50, 20, ${0.22 * flicker})`);
      grad.addColorStop(1,    'rgba(80, 0, 0, 0)');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, auraR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // 每帧概率喷一颗向上的小火星（模拟火舌上升），不污染粒子池
      if (this._world && Math.random() < 0.22) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
        const sp = 30 + Math.random() * 50;
        this._world.particles.push(new Particle({
          x: this.x + (Math.random() - 0.5) * this.radius * 0.8,
          y: this.y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20,
          life: 0.28 + Math.random() * 0.18,
          color: Math.random() < 0.55 ? '#ffd84a' : (Math.random() < 0.6 ? '#ff7030' : '#c93020'),
          size: 1.6 + Math.random() * 0.8,
        }));
      }
    }

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

  // 💀 骷髅头（亡灵法师）：球体顶部漂浮，轻微上下浮动
  const skulls = grouped.skull || 0;
  if (skulls > 0) {
    const baseFont = Math.max(14, Math.min(24, r * 1.4));
    const dist = r + 6;
    for (let i = 0; i < skulls; i++) {
      const a = -Math.PI / 2 + (i - (skulls - 1) / 2) * 0.55;
      const sway = Math.sin(t * 2.2 + i) * 3;
      const px = Math.cos(a) * dist;
      const py = Math.sin(a) * dist + sway;
      ctx.save();
      ctx.font = baseFont + 'px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 4;
      ctx.fillText('💀', px, py);
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

  // 🧨 引信：球顶向上的导火索 + 闪烁火花。
  // 导火索 = 浅褐色细线（略微抖动），顶端火花 = 飘动的小亮点。
  // N 层引信 = 多根并排（轻微扇形展开），强化"多重引信"感。
  const fuses = grouped.fuse || 0;
  if (fuses > 0) {
    const fuseLen = Math.max(10, r * 0.95);
    const spread = fuses > 1 ? Math.min(Math.PI * 0.45, 0.32 * fuses) : 0;
    for (let i = 0; i < fuses; i++) {
      const baseAng = -Math.PI / 2 + (i - (fuses - 1) / 2) * (spread / Math.max(1, fuses - 1));
      const wobble = Math.sin(t * 10 + i * 1.7) * 1.4;       // 细绳抖动
      const tipFlicker = 0.7 + Math.sin(t * 18 + i * 2.3) * 0.3;
      const tipDx = Math.cos(baseAng) * fuseLen + wobble * 0.4;
      const tipDy = Math.sin(baseAng) * fuseLen + wobble * 0.2;
      ctx.save();
      // 浅棕导火索（细线，球面 → 火花尖端）
      ctx.strokeStyle = '#8a5b2e';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(Math.cos(baseAng) * (r - 2), Math.sin(baseAng) * (r - 2));
      // 中点带轻微抖动，呈"S 形" 火索
      const midX = (Math.cos(baseAng) * (r + fuseLen * 0.5)) + wobble;
      const midY = (Math.sin(baseAng) * (r + fuseLen * 0.5));
      ctx.quadraticCurveTo(midX, midY, tipDx, tipDy);
      ctx.stroke();
      // 火花头：亮黄 + 周围橙红辉光
      ctx.shadowColor = '#ffae00';
      ctx.shadowBlur = 10 + tipFlicker * 6;
      ctx.fillStyle = '#fff2a0';
      ctx.beginPath();
      ctx.arc(tipDx, tipDy, 2.6 + tipFlicker * 1.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = `rgba(255,120,40,${0.6 * tipFlicker})`;
      ctx.beginPath();
      ctx.arc(tipDx, tipDy, 4.5 + tipFlicker * 1.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // 偶尔从火花头喷一颗向上小火星（不进粒子池太多，每帧 ~20% 概率）
      if (bullet._world && Math.random() < 0.25) {
        const sa = baseAng + (Math.random() - 0.5) * 1.0;
        const sp = 40 + Math.random() * 50;
        bullet._world.particles.push(new Particle({
          x: bullet.x + tipDx,
          y: bullet.y + tipDy,
          vx: Math.cos(sa) * sp,
          vy: Math.sin(sa) * sp - 20,
          life: 0.32 + Math.random() * 0.2,
          color: Math.random() < 0.5 ? '#ffd84a' : (Math.random() < 0.6 ? '#ff7030' : '#c93020'),
          size: 1.4 + Math.random() * 0.7,
        }));
      }
    }
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
// behavior:
//   'melee' (默认)  - 追击最近 ally / 接触自爆。原有逻辑。
//   'rusher'        - 始终冲向主炮台（无视实体 / 召唤物的位置诱导），路径上撞到谁就炸谁。
//   'kiter'         - 远程：向主炮台靠近至 preferredRange 后停住；过近时后撤。射击仍打最近 ally。
//   'edge_kiter'    - 弹射射手：kiter 基础上有侧向 drift 偏向地图边缘 + accuracyJitter 准头差。
//   'support'       - 治疗 / 增益类：跟在前排队友身后，远离炮台保持安全距离。
const ENEMY_TYPES = {
  // —— 早期敌人（Tier 1）——
  goblin:    { name: '哥布林',   icon: '👹', maxHp: 4,  attack: 1, speed: 90, radius: 16, color: '#7a8a4a', shape: 'circle', xpReward: 2, value: 3, minWave: 1,
               behavior: 'melee',
               intents: [{ kind: 'melee', icon: '🗡', cooldown: 0, desc: '接触造成 1 伤害，自爆' }] },
  archer:    { name: '弓箭手',   icon: '🏹', maxHp: 3,  attack: 0, speed: 40, radius: 14, color: '#a08060', shape: 'triangle', xpReward: 3, value: 7, minWave: 1,
               behavior: 'kiter', preferredRange: 260,
               intents: [{ kind: 'ranged', icon: '🏹', cooldown: 2, value: 2, desc: '2 回合后射 1 颗弹（2 伤）' }] },
  flier:     { name: '飞行兵',   icon: '🦇', maxHp: 5,  attack: 1, speed: 130, radius: 12, color: '#4adcd0', shape: 'triangle', xpReward: 3, value: 4, flies: true, minWave: 1,
               behavior: 'melee',
               intents: [{ kind: 'melee', icon: '🗡', cooldown: 0, desc: '飞行接触 1 伤' }] },
  rusher:    { name: '突击兵',   icon: '💨', maxHp: 5,  attack: 2, speed: 180, radius: 13, color: '#ff5050', shape: 'circle', xpReward: 4, value: 5, minWave: 3,
               behavior: 'rusher',
               intents: [{ kind: 'rush', icon: '👟', cooldown: 0, desc: '高速冲刺 2 伤撞击' }] },

  // —— 中期敌人（Tier 2）——
  sniper:    { name: '狙击手',   icon: '🎯', maxHp: 6,  attack: 0, speed: 12, radius: 16, color: '#604070', shape: 'triangle', xpReward: 6, value: 7, minWave: 8,
               behavior: 'kiter', preferredRange: 360,
               intents: [{ kind: 'sniper', icon: '🎯', cooldown: 3, value: 5, desc: '3 回合后高伤射击（5 伤）' }] },
  bouncer:   { name: '弹射射手', icon: '⚪', maxHp: 5, attack: 0, speed: 45, radius: 15, color: '#80d0d0', shape: 'circle', xpReward: 5, value: 6, minWave: 5,
               behavior: 'edge_kiter', preferredRange: 220, accuracyJitter: 0.22,
               intents: [{ kind: 'ranged', icon: '🏹', cooldown: 2, value: 1, bound: 3, desc: '2 回合后射弹射弹（弹 3）' }] },
  tracker:   { name: '追踪兵',   icon: '🎯', maxHp: 6, attack: 0, speed: 45, radius: 15, color: '#80a0d0', shape: 'circle', xpReward: 5, value: 6, minWave: 7,
               behavior: 'kiter', preferredRange: 260,
               intents: [{ kind: 'ranged', icon: '🎯', cooldown: 2, value: 1, tracking: true, desc: '2 回合后射追踪弹' }] },
  healer:    { name: '治疗师',   icon: '💚', maxHp: 7, attack: 0, speed: 40, radius: 15, color: '#60c060', shape: 'circle', xpReward: 5, value: 6, minWave: 6,
               behavior: 'support', preferredRange: 340,
               intents: [{ kind: 'heal', icon: '➕', cooldown: 2, value: 3, desc: '2 回合后治疗最近敌人 +3 HP' }] },
  bomber:    { name: '自爆球',   icon: '💣', maxHp: 4, attack: 6, speed: 100, radius: 14, color: '#ffa040', shape: 'circle', xpReward: 4, value: 5, minWave: 5,
               behavior: 'melee',
               intents: [{ kind: 'selfdest', icon: '💥', cooldown: 3, desc: '3 回合后自爆 6 伤 AOE' }] },
  spammer:   { name: '弹幕兵',   icon: '🌌', maxHp: 6, attack: 0, speed: 45, radius: 15, color: '#8080c0', shape: 'circle', xpReward: 6, value: 7, minWave: 9,
               behavior: 'kiter', preferredRange: 210,
               intents: [{ kind: 'rangedMulti', icon: '🏹', cooldown: 3, value: 1, count: 3, desc: '3 回合后 3 颗扇形弹（1 伤×3）' }] },

  // —— 后期敌人（Tier 3）——
  summoner:  { name: '召唤师',   icon: '👻', maxHp: 8,  attack: 0, speed: 0, radius: 18, color: '#702070', shape: 'rect', xpReward: 8, value: 12, minWave: 12,
               behavior: 'kiter',
               intents: [{ kind: 'summon', icon: '👥', cooldown: 3, spawn: 'goblin', desc: '3 回合后召唤 1 哥布林' }] },
  buffer:    { name: '指挥官',   icon: '👑', maxHp: 10, attack: 1, speed: 45, radius: 16, color: '#c08000', shape: 'rect', xpReward: 7, value: 7, minWave: 11,
               behavior: 'support', preferredRange: 300,
               intents: [{ kind: 'buff', icon: '⬆', cooldown: 2, value: 1, desc: '2 回合后友军 +1 攻击' }] },
  tank:      { name: '重甲兵',   icon: '🛡', maxHp: 15, attack: 3, speed: 35, radius: 22, color: '#444444', shape: 'circle', xpReward: 9, value: 12, minWave: 20,
               behavior: 'melee',
               intents: [{ kind: 'melee', icon: '🗡', cooldown: 0, desc: '接触造成 3 伤' }] },
  mage:      { name: '法师',     icon: '🔮', maxHp: 6, attack: 0, speed: 28, radius: 15, color: '#a05ec0', shape: 'circle', xpReward: 7, value: 8, minWave: 13,
               behavior: 'kiter', preferredRange: 220,
               intents: [{ kind: 'aoe', icon: '💢', cooldown: 3, value: 3, desc: '3 回合后 AOE 法术 3 伤' }] },
  berserker: { name: '狂战士',   icon: '⚔', maxHp: 9,  attack: 2, speed: 100, radius: 17, color: '#d04040', shape: 'circle', xpReward: 7, value: 9, minWave: 15,
               behavior: 'melee',
               intents: [
                 { kind: 'selfbuff', icon: '⚔', cooldown: 1, value: 1, desc: '1 回合后 +1 攻击（叠加）' },
                 { kind: 'melee', icon: '🗡', cooldown: 0, desc: '接触造成伤害' },
               ] },
  splitter:  { name: '分裂者',   icon: '✂', maxHp: 8,  attack: 0, speed: 55, radius: 18, color: '#80c080', shape: 'circle', xpReward: 6, value: 8, onDeath: 'split', minWave: 16,
               behavior: 'melee',
               intents: [{ kind: 'melee', icon: '🗡', cooldown: 0, desc: '接触 / 死亡分裂 2 个小型' }] },

  // —— 精英 / 杂项 ——
  slug:      { name: '慢虫',     icon: '🐌', maxHp: 7,  attack: 1, speed: 15, radius: 20, color: '#a08040', shape: 'rect', xpReward: 6, value: 8, minWave: 18,
               behavior: 'melee',
               intents: [{ kind: 'melee', icon: '🗡', cooldown: 0, desc: '缓慢推进接触' }] },
  shrieker:  { name: '尖叫者',   icon: '📢', maxHp: 7,  attack: 0, speed: 40, radius: 15, color: '#c0a040', shape: 'circle', xpReward: 5, value: 5, minWave: 13,
               behavior: 'support', preferredRange: 320,
               intents: [{ kind: 'buffall', icon: '📢', cooldown: 3, value: 3, desc: '3 回合后全敌人 +3 最大 HP' }] },
  slower:    { name: '时空法师', icon: '⏳', maxHp: 9, attack: 0, speed: 45, radius: 16, color: '#6080c0', shape: 'circle', xpReward: 6, value: 6, minWave: 14,
               behavior: 'support', preferredRange: 300,
               intents: [{ kind: 'debuff', icon: '⬇', cooldown: 2, desc: '2 回合后抽走玩家 1 法力' }] },
  boss:      { name: '深渊魔王', icon: '👺', maxHp: 25, attack: 4, speed: 35, radius: 28, color: '#400040', shape: 'circle', xpReward: 20, value: 25, minWave: 25,
               behavior: 'kiter', preferredRange: 200,
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

// 敌人按 minWave 解锁（每个 ENEMY_TYPES 上有 minWave 字段）：随累计波次提升，可 spawn 种类只增不减。
// 由 _availableEnemies(waveNumber) 动态计算，不再用静态 SPAWN_POOL 查表。
function _availableEnemies(waveNumber) {
  const out = [];
  for (const k in ENEMY_TYPES) {
    const def = ENEMY_TYPES[k];
    if (def._isReward) continue;                        // 金球不入波次池
    if ((def.minWave || 1) <= waveNumber) out.push(k);
  }
  return out;
}

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
    // AI: 行为模式（见 ENEMY_TYPES 头部注释）+ 远程类的偏好攻击距离 / 准头偏差
    this.behavior = type.behavior || 'melee';
    this.preferredRange = type.preferredRange || 0;
    this.accuracyJitter = type.accuracyJitter || 0;
    // edge_kiter 的边方向选择：spawn 时按当前 x 偏向更近的一侧（-1 = 左, 1 = 右），整局保持
    this._edgeSide = 0;
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
    // 冻结流派 debuff：层数 — 每层 = 跳过下个敌方回合 1 次。敌方回合结算后 -1。
    // 冻结的敌人受到双倍伤害；实体化子弹与冻结敌人碰撞不扣实体化层数。
    this.freeze = 0;
    // 奖励金球标记（不死、爆金币）
    this._isReward = !!type._isReward;
    // 出场 portal：0.3s 紫色螺旋开场期间不可命中 / 不动 / intent 不递减
    this.spawnT = 0.3;
  }

  takeDamage(amount) {
    if (!this.alive) return false;
    // 冻结的敌人受到双倍伤害
    if (this.freeze > 0 && amount > 0) amount = amount * 2;
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
    // 冻结：跳过本回合的 intent 推进 / 行动
    if (this.freeze > 0) return;
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
    // 被冻结：跳过本敌方回合的移动 / 接触
    if (this.freeze > 0) return;

    const intent = this.intents[this.intentIdx];
    const isMelee = intent.kind === 'melee' || intent.kind === 'rush';

    // 移动：按 behavior 派发（除 speed=0 等不动）
    if (this.speed > 0) {
      let mv = this.speed;
      if (this.knockback.t > 0) { mv *= 0.2; this.knockback.t -= dt; }
      const player = world.player;
      let vx = 0, vy = 0;

      if (this.behavior === 'rusher') {
        // 突击兵：始终冲向主炮台。无视场上实体 / 召唤物的位置诱导。
        const dx = player.x - this.x, dy = player.y - this.y;
        const d = Math.hypot(dx, dy);
        if (d > 1) { vx = (dx / d) * mv; vy = (dy / d) * mv; }
      } else if (this.behavior === 'kiter') {
        // 远程：向主炮台靠近至 preferredRange，过近则后撤；±deadband 内停住避免抖动。
        const dx = player.x - this.x, dy = player.y - this.y;
        const d = Math.hypot(dx, dy);
        const range = this.preferredRange || 280;
        const deadband = 30;
        if (d > range + deadband) {
          vx = (dx / d) * mv;
          vy = (dy / d) * mv;
        } else if (d < range - deadband && d > 1) {
          // 后撤稍慢（70% 速度），免得贴脸时还往后疯狂跳
          vx = -(dx / d) * mv * 0.7;
          vy = -(dy / d) * mv * 0.7;
        }
      } else if (this.behavior === 'edge_kiter') {
        // 弹射射手：kiter + 朝最近的左/右斜边漂移。spawn 时锁定一侧，整局不切换。
        const dx = player.x - this.x, dy = player.y - this.y;
        const d = Math.hypot(dx, dy);
        const range = this.preferredRange || 220;
        const deadband = 30;
        let fx = 0, fy = 0;
        if (d > range + deadband) {
          fx = dx / d; fy = dy / d;
        } else if (d < range - deadband && d > 1) {
          fx = -(dx / d) * 0.7; fy = -(dy / d) * 0.7;
        }
        // 边方向锁定：第一次更新时按当前位置选近的一侧
        if (this._edgeSide === 0) {
          const tb0 = trapBounds(world, this.y);
          this._edgeSide = (this.x - tb0.leftX) < (tb0.rightX - this.x) ? -1 : 1;
        }
        // 离边越远 drift 越强；快贴边时减弱（避免撞墙抖动）
        const tb = trapBounds(world, this.y);
        const edgeDist = this._edgeSide < 0 ? (this.x - tb.leftX) : (tb.rightX - this.x);
        const edgeWeight = clamp(1 - edgeDist / 180, 0, 1);
        fx += this._edgeSide * (0.35 + 0.55 * (1 - edgeWeight));
        const fLen = Math.hypot(fx, fy);
        if (fLen > 0.01) {
          vx = (fx / fLen) * mv;
          vy = (fy / fLen) * mv;
        }
      } else if (this.behavior === 'support') {
        // 治疗 / 增益类：跟在前排队友身后（远离炮台一侧），保持安全距离。
        // 找一个非 support 的活敌人作为依托；找不到才自己单走。
        let anchor = null, anchorD = Infinity;
        for (const o of world.enemies) {
          if (o === this || !o.alive || o.spawnT > 0) continue;
          if (o.behavior === 'support') continue;
          const od = Math.hypot(o.x - this.x, o.y - this.y);
          if (od < anchorD) { anchorD = od; anchor = o; }
        }
        if (anchor) {
          // 目标点 = anchor 身后（远离 player 方向）40px
          const adx = anchor.x - player.x, ady = anchor.y - player.y;
          const ad = Math.hypot(adx, ady) || 1;
          const tx = anchor.x + (adx / ad) * 40;
          const ty = anchor.y + (ady / ad) * 40;
          const ddx = tx - this.x, ddy = ty - this.y;
          const dd = Math.hypot(ddx, ddy);
          if (dd > 10) {
            vx = (ddx / dd) * mv * 0.85;
            vy = (ddy / dd) * mv * 0.85;
          }
        } else {
          // 无前排可依托 → 像 kiter 一样自保
          const dx = player.x - this.x, dy = player.y - this.y;
          const d = Math.hypot(dx, dy);
          const range = this.preferredRange || 320;
          const deadband = 30;
          if (d > range + deadband) {
            vx = (dx / d) * mv * 0.8;
            vy = (dy / d) * mv * 0.8;
          } else if (d < range - deadband && d > 1) {
            vx = -(dx / d) * mv * 0.7;
            vy = -(dy / d) * mv * 0.7;
          }
        }
      } else {
        // 'melee' (默认)：原有逻辑 — 朝最近 ally 推进
        const target = nearestAlly(world, this);
        const dx = target.x - this.x, dy = target.y - this.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 1) {
          vx = (dx / dist) * mv;
          vy = (dy / dist) * mv;
        }
      }

      // 同类排斥（所有 behavior 共用）
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
      // 接触判定仍按"路径上撞到的任何 ally"，所以 rusher 路上的实体 / 召唤物也能挡。
      if (isMelee && !this._isReward) {
        const touchTarget = nearestAlly(world, this);
        const td = Math.hypot(touchTarget.x - this.x, touchTarget.y - this.y);
        if (td < this.radius + (touchTarget.radius || 24)) {
          this.selfDestruct(touchTarget, world);
        }
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
    // 冻结：整体染蓝（覆盖原色，保留 hitFlash 的高亮）
    const frozen = this.freeze > 0;
    const color = flash ? '#ffffff' : (frozen ? '#5fb4ff' : this.color);
    ctx.strokeStyle = frozen ? '#1f5fa8' : 'rgba(0,0,0,0.5)';
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
    // 冻结层数显示（头顶；与火焰错开位置）
    if (this.freeze > 0) {
      ctx.fillStyle = '#7eb1ff';
      ctx.shadowColor = '#aedcff';
      ctx.shadowBlur = 6;
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const yOff = this.fire > 0 ? -this.radius - 36 : -this.radius - 22;
      ctx.fillText('❄' + this.freeze, 0, yOff);
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
    // 圆形背景；冻结时整体变蓝
    const frozenBadge = this.freeze > 0;
    ctx.fillStyle = frozenBadge ? 'rgba(20, 40, 80, 0.92)' : 'rgba(15, 18, 24, 0.92)';
    ctx.strokeStyle = frozenBadge ? '#7eb1ff' : '#ffa64a';
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
  let angle = opts.angle != null ? opts.angle : angleBetween(enemy.x, enemy.y, target.x, target.y);
  // 准头偏差（accuracyJitter）：仅作用于自动瞄准的弹（opts.angle 未指定时），
  // ±jitter 弧度随机扰动。弹射射手用这个体现"准头不太好"。
  if (opts.angle == null && enemy.accuracyJitter > 0) {
    angle += (Math.random() * 2 - 1) * enemy.accuracyJitter;
  }
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

  // 每次发射调用：拉满 recoilT + spawn 炮台专属 muzzle flash + 火星
  // 按 world.cannon.id 分派 (chain / fire / power) → 不同颜色 + 风格化粒子
  notifyFired(world) {
    this.recoilT = this.recoilDur;
    if (!world) return;
    const mx = this.x + Math.cos(this.angle) * (this.radius + 12);
    const my = this.y + Math.sin(this.angle) * (this.radius + 12);
    const cid = world.cannon?.id;
    if (cid === 'fire')       this._muzzleFire(world, mx, my);
    else if (cid === 'chain') this._muzzleChain(world, mx, my);
    else if (cid === 'power') this._muzzlePower(world, mx, my);
    else                      this._muzzleDefault(world, mx, my);
  }

  // 默认（无炮台）：黄色闪光 + 4 颗火星
  _muzzleDefault(world, mx, my) {
    world.particles.push(new Particle({ x: mx, y: my, life: 0.12, color: '#ffd84a', size: 16, type: 'flash' }));
    for (let i = 0; i < 4; i++) {
      const a = this.angle + (Math.random() - 0.5) * 0.55;
      const sp = 200 + Math.random() * 140;
      world.particles.push(new Particle({
        x: mx, y: my, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.22, color: '#ffd84a', size: 2.4,
      }));
    }
  }

  // 锁链炮台：深棕色双环（"链节"） + 短粒子串向后回旋
  _muzzleChain(world, mx, my) {
    world.particles.push(new Particle({ x: mx, y: my, life: 0.18, color: '#d8a878', size: 14, type: 'flash' }));
    // 双环模拟链节
    world.particles.push(new Particle({ x: mx, y: my, life: 0.28, color: '#a07a4a', size: 18, type: 'ring' }));
    world.particles.push(new Particle({
      x: mx + Math.cos(this.angle) * 8, y: my + Math.sin(this.angle) * 8,
      life: 0.28, color: '#7a5a30', size: 14, type: 'ring',
    }));
    // 棕色火星，朝炮口方向 + 一些环绕散布
    for (let i = 0; i < 6; i++) {
      const a = this.angle + (Math.random() - 0.5) * 0.9;
      const sp = 140 + Math.random() * 80;
      world.particles.push(new Particle({
        x: mx, y: my, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.36, color: i % 2 === 0 ? '#d8a878' : '#a07a4a', size: 2.6,
      }));
    }
  }

  // 火焰炮台：橙红 fire blast + 上升黑烟 + 大幅闪光
  _muzzleFire(world, mx, my) {
    // 主闪光：黄白核 + 橙外层
    world.particles.push(new Particle({ x: mx, y: my, life: 0.14, color: '#ffe8a8', size: 22, type: 'flash' }));
    world.particles.push(new Particle({ x: mx, y: my, life: 0.22, color: '#ff7030', size: 16, type: 'flash' }));
    // 朝炮口的火舌（多颗），颜色从中心→外：白黄→橙→红
    for (let i = 0; i < 9; i++) {
      const a = this.angle + (Math.random() - 0.5) * 0.7;
      const sp = 180 + Math.random() * 200;
      const colors = ['#fff4c2', '#ffd84a', '#ff9030', '#ff5028', '#c93020'];
      const ci = Math.floor(Math.random() * colors.length);
      world.particles.push(new Particle({
        x: mx, y: my, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.28 + Math.random() * 0.2, color: colors[ci], size: 3.6 - ci * 0.4,
      }));
    }
    // 上升黑烟（向上飘）
    for (let i = 0; i < 4; i++) {
      world.particles.push(new Particle({
        x: mx + (Math.random() - 0.5) * 8, y: my,
        vx: (Math.random() - 0.5) * 30, vy: -40 - Math.random() * 40,
        life: 0.55, color: '#2a2018', size: 4 + Math.random() * 2,
      }));
    }
  }

  // 强能炮台：青蓝电弧 + 锐利锋刺 + 闪电星芒
  _muzzlePower(world, mx, my) {
    world.particles.push(new Particle({ x: mx, y: my, life: 0.12, color: '#e0f0ff', size: 18, type: 'flash' }));
    world.particles.push(new Particle({ x: mx, y: my, life: 0.22, color: '#7eb1ff', size: 14, type: 'ring' }));
    // 朝炮口方向的快速电弧粒子（高速、短寿命，颜色偏白蓝）
    for (let i = 0; i < 8; i++) {
      const a = this.angle + (Math.random() - 0.5) * 0.45;
      const sp = 280 + Math.random() * 180;
      world.particles.push(new Particle({
        x: mx, y: my, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.14 + Math.random() * 0.1, color: i % 2 === 0 ? '#ffffff' : '#7eb1ff', size: 2.0,
      }));
    }
    // 6 道径向电弧（短线段感）
    for (let i = 0; i < 6; i++) {
      const a = Math.PI * 2 * (i / 6) + Math.random() * 0.3;
      const sp = 200 + Math.random() * 60;
      world.particles.push(new Particle({
        x: mx, y: my, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.2, color: '#aed0ff', size: 2.4,
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
    // 底座 + 炮管：颜色按当前炮台变化（chain=棕 / fire=红 / power=蓝）
    const cannon = (window.__game && window.__game.cannon) || null;
    const baseC = cannon ? cannon.baseColor : '#4a6fa5';
    const strokeC = cannon ? cannon.strokeColor : '#2a4a78';
    const barrelC = cannon ? cannon.barrelColor : '#7eb1ff';
    ctx.fillStyle = this.hitFlash > 0 ? '#fff' : baseC;
    ctx.strokeStyle = strokeC;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // 炮台核心：emoji + 暗色内圆（按炮台风格点缀）
    if (cannon) {
      ctx.fillStyle = strokeC;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // 炮管
    ctx.rotate(this.angle);
    ctx.fillStyle = barrelC;
    ctx.fillRect(0, -5, this.radius + 12, 10);
    // 炮管描边强化
    ctx.strokeStyle = strokeC;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(0, -5, this.radius + 12, 10);
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
    // 骷髅 dash 期间免疫敌人接触伤害（实体化层数只由 dash 完成时主动消耗 1 层）
    if (this.kind === 'skeleton' && this._dashImmune) return false;
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
    // 跨回合 dash 状态拖尾仍然要画 → trail 在任意 turn 都衰减
    if (this._dashTrail) {
      for (const p of this._dashTrail) p.life -= dt;
      this._dashTrail = this._dashTrail.filter(p => p.life > 0);
    }
    if (world.battle.turn !== 'enemy') return;
    // === 骷髅：速度 0 的实体化"子弹" ===
    // 每个敌方回合 dash 随机敌人 → 撞击造成伤害（dash 全程免疫，敌人反击不扣层数）
    // → 撞击后实体化层数 -1（hp -= 1）；hp = 0 时销毁
    // _tickFriendlyDecay 跳过它（decayRate=0），唯一的衰减来源就是"撞击=消耗 1 层"
    if (this.kind === 'skeleton') {
      this._dashTrail = this._dashTrail || [];
      // 本回合已经 dash 过：等 BattleManager._tickSkeletonNewTurn 清零标志
      if (this._dashedThisTurn) return;
      if (!this._dashInit) {
        const alive = world.enemies.filter(e =>
          e.alive && (e.spawnT == null || e.spawnT <= 0));
        if (alive.length === 0) return;     // 无敌人 → 等下回合（不消耗实体化，不算 dash）
        const t = alive[Math.floor(Math.random() * alive.length)];
        this._dashInit = true;
        this._dashImmune = true;            // dash 期间免疫敌人接触伤害
        this._dashStartT = performance.now() / 1000;
        this._dashStartX = this.x;
        this._dashStartY = this.y;
        this._dashTarget = t;
        this._dashResolved = false;
      }
      const dashDur = 0.5;
      const elapsed = performance.now() / 1000 - this._dashStartT;
      const target = this._dashTarget;
      const resolve = (didHit) => {
        if (this._dashResolved) return;
        this._dashResolved = true;
        // 碎骨 / 紫色光环视觉
        for (let i = 0; i < 14; i++) {
          const a = Math.PI * 2 * Math.random();
          const sp = 80 + Math.random() * 140;
          world.particles.push(new Particle({
            x: this.x, y: this.y,
            vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30,
            life: 0.45 + Math.random() * 0.2,
            color: i % 3 === 0 ? '#dde3ec' : (i % 3 === 1 ? '#8a6bc0' : '#c97aff'),
            size: 2.4,
          }));
        }
        world.particles.push(new Particle({
          x: this.x, y: this.y, life: 0.32, color: '#c97aff',
          size: didHit ? 18 : 12, type: 'ring',
        }));
        // 撞击后扣 1 层（无论撞中没撞中，每回合 dash 就消耗 1 层）
        this.hp -= 1;
        if (this.hp <= 0) {
          this.alive = false;
          Events.emit('summonDied', this);
        } else {
          // 还活着 → 标记本回合已 dash，下个敌方回合开始时由
          // BattleManager._tickSkeletonNewTurn 清零 _dashedThisTurn 才能再 dash
          this._dashedThisTurn = true;
          this._dashInit = false;
          this._dashImmune = false;
          this._dashTarget = null;
        }
      };
      if (target && target.alive) {
        const k = Math.min(1, elapsed / dashDur);
        this.x = lerp(this._dashStartX, target.x, k);
        this.y = lerp(this._dashStartY, target.y, k);
        this._dashTrail.push({ x: this.x, y: this.y, life: 0.25, max: 0.25 });
        if (k >= 1) {
          const dealt = target.takeDamage(this.attack);
          if (dealt && world) FX.damage(world, target.x, target.y - target.radius, this.attack);
          resolve(true);
        }
      } else if (elapsed >= dashDur) {
        // 目标提前死亡 + 时间到 → 不造成伤害，但仍消耗 1 层
        resolve(false);
      }
      return;
    }
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
    // === 骷髅 dash 拖尾（在主体之前先画，保证主体盖在 trail 上方）===
    if (this.kind === 'skeleton' && this._dashTrail && this._dashTrail.length > 0) {
      ctx.save();
      for (const p of this._dashTrail) {
        const k = p.life / p.max;
        ctx.globalAlpha = k * 0.6;
        ctx.fillStyle = '#dde3ec';
        ctx.shadowColor = '#c97aff';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, this.radius * (0.6 + 0.4 * k), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.save();
    ctx.translate(this.x, this.y);
    const flash = this.hitFlash > 0;
    const k = this.kind;
    // 骷髅造型：白头骨 emoji + 紫色亡灵气浪
    if (k === 'skeleton') {
      // 紫色光环
      ctx.fillStyle = 'rgba(201, 122, 255, 0.25)';
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 2, 0, Math.PI * 2);
      ctx.fill();
      // 主体白骨色圆
      ctx.fillStyle = flash ? '#ffffff' : '#e8ecf3';
      ctx.strokeStyle = '#3a2a4a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      // 💀 emoji 居中
      ctx.font = (this.radius * 1.8).toFixed(0) + 'px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('💀', 0, 1);
    } else if (k === 'turret' || k === 'arcaneTurret' || k === 'bouncyTurret' || k === 'heavyTurret') {
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
  Events.emit('summonSpawned', sp);
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

// ─── 5. Cards (数据驱动) ────────────────────────────────────────────
// 策划表（铜 / 银 / 金 / 钻 4 等级）→ 内部 key: bronze / silver / gold / diamond。
// 每个 family（如 snipe）下，每个 tier 是一份独立 def（cost / value / desc / 效果）。
// CARD_DATA 在下方 ApplyAoe / applyFire 之后定义（因为 def 引用了这些 helper）。

// ─── 炮台（开局选一）────────────────────────────────────────────────
// 炮台是贯穿一局的被动 modifier；每次 fireFromCards 触发 onFire 一次。
// onFire(self, world, tpl, opts) 在 PreActive 钩子之前调用 → 调整 tpl 基础属性 / 累计状态。
// mainCostMod：主卡牌额外消耗，被 fireFromCards + _comboTotalCost + updateUsableState 读取。
const CANNON_DEFS = {
  chain: {
    id: 'chain', name: '锁链炮台', desc: '每发射3次，获得1层连携。',
    icon: '⛓', color: '#a08060',
    // 炮台模型配色：底座 / 描边 / 炮管
    baseColor: '#8a5a2c', strokeColor: '#3a200a', barrelColor: '#d8a878',
    onFire(self, world, tpl) {
      self._shotCount = ((self._shotCount || 0) + 1) % 3;
      if (self._shotCount === 0) world.addComboStacks(1);
    },
  },
  fire: {
    id: 'fire', name: '火焰炮台', desc: '每发射2次，命中施加1层燃烧。',
    icon: '🔥', color: '#ff7030',
    baseColor: '#a02818', strokeColor: '#3a0a00', barrelColor: '#ff9040',
    onFire(self, world, tpl) {
      self._shotCount = ((self._shotCount || 0) + 1) % 2;
      if (self._shotCount === 0) {
        tpl._fireOnHit = (tpl._fireOnHit || 0) + 1;
        if (!tpl._fireHookAdded) {
          tpl.addHook(_fireApplyHook);
          tpl._fireHookAdded = true;
        }
      }
    },
  },
  power: {
    id: 'power', name: '强能炮台', desc: '伤害+1，数量+1。主卡牌消耗+1。',
    icon: '⚡', color: '#7eb1ff',
    baseColor: '#4a6fa5', strokeColor: '#1a2840', barrelColor: '#aed0ff',
    mainCostMod: 1,
    onFire(self, world, tpl) {
      tpl.attack += 1;
      tpl.bulletCount += 1;
    },
  },
};

const CANNON_TR = {
  chain: { zh: { name: '锁链炮台', desc: '每发射3次，获得1层连携。（连携发射也算）' },
           en: { name: 'Chain Cannon', desc: 'Every 3 shots, gain 1 Chain stack. (Chain-fires count.)' } },
  fire:  { zh: { name: '火焰炮台', desc: '每发射2次，命中施加1层燃烧。（施加燃烧的发射也算）' },
           en: { name: 'Fire Cannon', desc: 'Every 2 shots, the bullet applies 1 Fire on hit. (Fire-applying shots count.)' } },
  power: { zh: { name: '强能炮台', desc: '伤害+1，数量+1。主卡牌消耗+1。' },
           en: { name: 'Power Cannon', desc: 'Damage +1, Bullets +1. Main card cost +1.' } },
};

class Cannon {
  constructor(id) {
    const def = CANNON_DEFS[id];
    if (!def) throw new Error('unknown cannon: ' + id);
    this.id = id;
    this.def = def;
    this._shotCount = 0;
  }
  get name() {
    const tr = CANNON_TR[this.id];
    if (tr && tr[LANG.current]) return tr[LANG.current].name;
    return this.def.name;
  }
  get desc() {
    const tr = CANNON_TR[this.id];
    if (tr && tr[LANG.current]) return tr[LANG.current].desc;
    return this.def.desc;
  }
  get icon() { return this.def.icon; }
  get color() { return this.def.color; }
  // 模型配色（PlayerCannon.draw 用）：未定义则用默认蓝色
  get baseColor() { return this.def.baseColor || '#4a6fa5'; }
  get strokeColor() { return this.def.strokeColor || '#2a4a78'; }
  get barrelColor() { return this.def.barrelColor || '#7eb1ff'; }
  get mainCostMod() { return this.def.mainCostMod || 0; }
  onFire(world, tpl, opts) { this.def.onFire?.(this, world, tpl, opts); }
}

// 4 等级（铜 → 银 → 金 → 钻）。内部 key 用 English 便于 CSS / JS；UI 显示走 i18n。
const TIER_KEYS = ['bronze', 'silver', 'gold', 'diamond'];
const TIER_INDEX = { bronze: 0, silver: 1, gold: 2, diamond: 3 };
function tierLabel(tier) {
  const key = 'rarity_' + tier;
  return t(key);
}
function nextTier(tier) {
  const i = TIER_INDEX[tier];
  return (i >= 0 && i < 3) ? TIER_KEYS[i + 1] : null;
}

// 数据驱动 Card：构造时按 (familyId, tier) 从 CARD_DATA 取一份 def，
// 字段（cost / desc / effects / onUse 等）一律走 def，方便升级即"换一份 def"。
class Card {
  constructor(familyId, tier) {
    const family = CARD_DATA[familyId];
    if (!family) throw new Error('Unknown card family: ' + familyId);
    let tierKey = tier;
    if (!family.tiers[tierKey]) {
      // 容错：找该家族最低存在 tier
      tierKey = TIER_KEYS.find(k => family.tiers[k]);
      if (!tierKey) throw new Error('Family has no tiers: ' + familyId);
    }
    const def = family.tiers[tierKey];
    this.familyId = familyId;
    this.tier = tierKey;
    this.id = familyId + ':' + tierKey;   // 唯一 id（同 family 不同 tier 视为不同 id）
    this.rarity = tierKey;                  // 兼容 .rarity-<tier> CSS
    this.cost = def.cost ?? 1;
    this.discardCost = def.discardCost ?? 1;
    this.value = def.value ?? 1;            // 仅用于排序 / 信息展示
    this.faceUp = false;
    this._family = family;
    this._def = def;
    this.def = { art: { emoji: family.emoji || '⚙' }, hasRevealFx: !!def.hasRevealFx };
  }

  get familyName() {
    const n = this._family.name;
    if (!n) return this.familyId;
    return typeof n === 'string' ? n : (n[LANG.current] || n.zh || n.en || this.familyId);
  }
  get name() {
    // 名字不带 tier 后缀（tier 通过边框颜色区分）
    return this.familyName;
  }
  get desc() {
    const d = this._def.desc;
    if (!d) return '';
    return typeof d === 'string' ? d : (d[LANG.current] || d.zh || d.en || '');
  }

  initializeEffects() {
    return this._def.effects ? this._def.effects(this) : [];
  }

  use(player, bulletTemplate) {
    if (!player.spend(this.cost)) return false;
    for (const h of this.initializeEffects()) bulletTemplate.addHook(h);
    return true;
  }
  discard(player) {
    const cost = this.discardCost ?? 1;
    if (cost > 0 && !player.spend(cost)) return false;
    return true;
  }
  onReveal() { this._def.onReveal?.(this); }
  onConceal() { this._def.onConceal?.(this); }
  onUse(world, player) { this._def.onUse?.(this, world, player); }
  onDiscard(world, player) { this._def.onDiscard?.(this, world, player); }
}

// 便捷构造器
function mkCard(familyId, tier) { return new Card(familyId, tier); }

// 计算卡牌"显示用"有效消耗：base - _costMod + (isMain ? cannon.mainCostMod : 0)，clamp 0+
// 用于所有 UI 渲染（手牌 / 背包 / 商店）保证显示和实际扣费一致
function effectiveCardCost(card, world, isMain) {
  if (!card) return 0;
  // _battleCostOverride: 本场战斗内强制覆盖费用（如钻级终结技）。resetForBattle 清空。
  const base = (card._battleCostOverride != null) ? card._battleCostOverride : (card.cost || 0);
  let c = base - (card._costMod || 0);
  if (isMain) c += world?.cannon?.mainCostMod || 0;
  return Math.max(0, c);
}
// 给 cost DOM 元素加 cost-up（涨, 红）/ cost-down（降, 绿）class
function applyCostColor(el, baseCost, effective) {
  if (!el) return;
  el.classList.remove('cost-up', 'cost-down');
  if (effective > baseCost) el.classList.add('cost-up');
  else if (effective < baseCost) el.classList.add('cost-down');
}

// ─── 旧卡组已清空 —— 新卡设计阶段（仅保留下方示例 + 引擎工具函数） ────────

// 奥弹 buff 配套 Hook（共享）—— 旧召唤系奥弹炮台 fireArcaneMissileFromUnit 仍可用；
// 旧 Card_ArcaneMissile + fireArcaneMissile + _arcaneOverloadHook 已删除（无卡使用）。
const _arcaneExplodeHook = new Effect(Phase.HitEnemy, -1, ctx => {
  const b = ctx.bullet;
  if (b._explodedThisHit) return;
  b._explodedThisHit = true;
  // 不排除直接命中目标：AOE 是独立伤害事件，直接命中也会吃到 AOE 伤害
  applyAoe(ctx.world, b, { damage: b.attack, mult: AOE_MULT.arcaneExplode });
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
  // 命中钩子传播：AOE 视为 source.bullet 对每个范围内敌方受害者的一次"命中"。
  // 让"命中触发"类钩子（引燃 _fireApplyHook 等）在 AOE 时也生效。
  // 仅当 source 是子弹（有 triggerHooks）+ 目标是敌人 + isHit (默认 true) 时触发。
  // 纯 debuff 类 AOE（引信扩散燃烧、燃烧弹爆炸燃烧）传 isHit:false → 不算"命中"，不触发 OnHit。
  // "命中 = 伤害行为"（即便伤害值为 0 也算）；"施加 debuff" 不算伤害行为。
  const isHit = opts.isHit !== false;
  const propagateOnHit = isHit && !isAllyTarget && source && typeof source.triggerHooks === 'function';
  let hits = 0;
  for (const v of victims) {
    if (!v) continue;
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
    // OnHit 钩子先于伤害结算 — 即使 damage=0、即使敌人挡住，都视作"命中"。
    // 含被 exclude 的敌人：AOE 是对每个范围内目标的一次独立"命中"事件，
    // exclude 仅免该敌人的 AOE 伤害 / onHit 回调 / 击退（避免直接命中目标双倍伤害）。
    if (propagateOnHit) {
      source.triggerHooks(Phase.OnHit, { enemy: v, world });
    }
    if (v === opts.exclude) continue;
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

function applyFreeze(enemy, stacks) {
  if (!enemy || !enemy.alive) return;
  if (stacks <= 0) return;
  enemy.freeze = (enemy.freeze || 0) + stacks;
  // 命中即时反馈：蓝色冰晶 + "+N ❄" 文字（区别于燃烧的橙色火星）
  const w = window.__game;
  if (w) {
    for (let i = 0; i < 4 + stacks; i++) {
      const a = Math.PI * 2 * Math.random();
      const sp = 60 + Math.random() * 80;
      w.particles.push(new Particle({
        x: enemy.x, y: enemy.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30,
        life: 0.4, color: '#7eb1ff', size: 3,
      }));
    }
    w.particles.push(new FireText(enemy.x, enemy.y - enemy.radius - 5, '+' + stacks + '❄'));
  }
}

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
// 数据驱动：每个 family 在 CARD_DATA 中声明 tiers[bronze/silver/gold/diamond]，
// 每个 tier 自带 cost / value / desc / effects(card) / onUse / onDiscard / onReveal / onConceal。

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

// ─── 骷髅小兵召唤定义（墓穴 / 亡灵法师）──────────────────────────────
// 行为：敌方回合开始 → 0.5s 内 dash 到最近敌人（无视距离）→ 撞击造成伤害 → 自毁
// 无自然衰减（decayRate=0）+ 无标准近战（moves=false，自带 dash 逻辑）
// 场上无敌人时不消失，等到有敌人才 dash
SUMMON_DEFS.skeleton = {
  kind: 'skeleton', name: '骷髅', desc: '每个敌方回合冲撞一名随机敌人，造成 1 伤害。',
  maxHp: 2, attack: 1, radius: 8, moves: false, speed: 0,
  canFire: false, decayRate: 0,
};
SUMMON_TR.skeleton = { name_en: 'Skeleton', desc_en: 'Each enemy turn, charges a random enemy and deals 1 damage.' };

// ─── 全局"下 N 次射击 +M 攻"队列（缓释胶囊用）─────────────────────────
// fireFromCards 在 onUse 之前调用：应用全部存量 buff + decrement
function applyAndTickShotBuffs(world, tpl) {
  if (!world._shotBuffs || world._shotBuffs.length === 0) return;
  let totalAtk = 0;
  for (const b of world._shotBuffs) totalAtk += b.atk;
  if (totalAtk > 0) tpl.attack += totalAtk;
  world._shotBuffs = world._shotBuffs
    .map(b => ({ atk: b.atk, shots: b.shots - 1 }))
    .filter(b => b.shots > 0);
}

// ─── 亡灵法师：弃牌触发召唤骷髅 ──────────────────────────────────────
// 在 doDiscard 中调用：若场上有任何 _isNecromancer 实体子弹存活 → 召唤骷髅
function handleDiscardForNecromancer(world) {
  if (!world || !world.bullets) return;
  for (const b of world.bullets) {
    if (b.alive && b._isNecromancer) {
      const sk = spawnSummon(world, 'skeleton');
      if (sk) { sk.x = b.x + rand(-20, 20); sk.y = b.y + rand(-20, 20); }
    }
  }
}

// ─── 奥弹自动发射（旧 Card_奥弹 等价实现）──────────────────────────
function _autoFireArcaneMissile(world, card) {
  const player = world.player;
  const evo = world._arcaneEvo || {};
  const fireOnce = () => {
    // 从炮台周围环形偏移随机点 spawn（半径 24~38px）
    // 初速方向：朝最近敌人 + 随机抖动（±35°）→ 命中可靠，但群发时有自然扩散感
    // 然后由 tracking 走新版 homing-missile steering force 持续修正
    const offA = Math.random() * Math.PI * 2;
    const offR = 24 + Math.random() * 14;
    const sx = player.x + Math.cos(offA) * offR;
    const sy = player.y + Math.sin(offA) * offR;
    const target = nearestEnemy(world, { x: sx, y: sy });
    const baseAngle = target
      ? angleBetween(sx, sy, target.x, target.y)
      : (player.angle ?? -Math.PI / 2);
    const initAngle = baseAngle + (Math.random() - 0.5) * (Math.PI / 2.6);  // ±35°
    const bullet = new Bullet({
      x: sx, y: sy,
      angle: initAngle,
      speed: 360, lifetime: 3.5,
      attack: 1 + (card._arcBonus || 0) + (evo.dmg || 0),
      bound: 0, penetrate: 0 + (evo.pen || 0), radius: 6,
    });
    bullet.isArcane = true;
    bullet.tracking = true;             // 走新版 homing-missile steering（trackAccel 默认 900）
    // 奥术进化-火：命中施加 N 层燃烧
    if (evo.fire > 0) {
      bullet._fireOnHit = (bullet._fireOnHit || 0) + evo.fire;
      bullet.addHook(_fireApplyHook);
    }
    // 奥术进化-冰：命中按概率施加 1 层冻结
    if (evo.freezeChance > 0) {
      const chance = evo.freezeChance;
      bullet.addHook(new Effect(Phase.OnHit, -1, ctx => {
        if (Math.random() < chance) applyFreeze(ctx.enemy, 1);
      }));
    }
    bullet.activate(performance.now() / 1000);
    world.bullets.push(bullet);
    if (player.notifyFired) player.notifyFired(world);
    // 紫色发射小烟：从 spawn 点向外撒一圈
    for (let i = 0; i < 8; i++) {
      const a = Math.PI * 2 * Math.random();
      const sp = 50 + Math.random() * 80;
      world.particles.push(new Particle({
        x: sx, y: sy,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20,
        life: 0.32, color: '#c97aff', size: 3,
      }));
    }
  };
  fireOnce();
  if (card._arcDoubleFire) setTimeout(fireOnce, 100);
}

// ─── 卡 def 构造辅助 (按 family 群组 / 提取重复模式) ────────────────

function _vampbatTier(extraAtk, value) {
  const descZh = extraAtk > 0
    ? `伤害+${extraAtk}，实体化+2。每回合向最近的一名敌人发射攻击2次。击杀敌人后，为玩家恢复1血量。`
    : `实体化+2。每回合向最近的一名敌人发射攻击2次。击杀敌人后，为玩家恢复1血量。`;
  const descEn = extraAtk > 0
    ? `Damage+${extraAtk}, Entity+2. Each turn fires 2 tracking shots at the nearest enemy. On kill, heal player 1 HP.`
    : `Entity+2. Each turn fires 2 tracking shots at the nearest enemy. On kill, heal player 1 HP.`;
  return {
    cost: 3, value,
    desc: { zh: descZh, en: descEn },
    effects: () => [
      new Effect(Phase.PreActive, 0, ctx => { if (extraAtk > 0) ctx.bullet.attack += extraAtk; ctx.bullet.entityLayers += 2; }),
      new Effect(Phase.Spawned, 0, ctx => { (ctx.bullet._entityDecos = ctx.bullet._entityDecos || []).push('wings'); }),
      new Effect(Phase.EntityTurn, 0, ctx => {
        const b = ctx.bullet, w = ctx.world;
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
            bb.addHook(new Effect(Phase.HitEnemy, -1, ctx2 => {
              const e = ctx2.enemy, src = ctx2.bullet;
              if (!e.alive) return;
              if (e.hp - src.attack > 0) return;
              w.player.hp = Math.min(w.player.maxHp, w.player.hp + 1);
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
    ],
  };
}

function _necromancerTier(ent, value) {
  return {
    cost: 3, value,
    desc: {
      zh: `实体化+${ent}，速度大幅降低。每回合攻击最近的敌人。当你弃牌时，召唤1个骷髅。`,
      en: `Entity+${ent}, greatly reduced speed. Each turn attacks the nearest enemy. When you discard, summon 1 Skeleton.`,
    },
    effects: () => [
      new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.entityLayers += ent; ctx.bullet.speed *= 0.4; }),
      new Effect(Phase.Spawned, 0, ctx => {
        (ctx.bullet._entityDecos = ctx.bullet._entityDecos || []).push('skull');
        ctx.bullet._isNecromancer = true;
      }),
      new Effect(Phase.EntityTurn, 0, ctx => {
        const b = ctx.bullet, w = ctx.world;
        const target = _nearestEnemyTo(w, b.x, b.y);
        if (!target) return;
        const bb = new Bullet({
          x: b.x, y: b.y,
          angle: angleBetween(b.x, b.y, target.x, target.y),
          speed: 340, lifetime: 2.4,
          attack: b.attack, bound: 0, penetrate: 0,
          bulletCount: 1, waveCount: 1, radius: 6,
        });
        bb._fromAlly = true;
        bb.tracking = true;
        bb.activate(performance.now() / 1000);
        w.bullets.push(bb);
        for (let k = 0; k < 6; k++) {
          const a = Math.PI * 2 * Math.random();
          w.particles.push(new Particle({
            x: b.x, y: b.y,
            vx: Math.cos(a) * 70, vy: Math.sin(a) * 70,
            life: 0.3, color: '#8a4ac0', size: 3,
          }));
        }
      }),
    ],
  };
}

// 骷髅领主：实体子弹，每回合召唤 N 个骷髅 + 友军骷髅死亡时获得 +1 实体化层数
function _skeletonLordTier(spawnN, value) {
  return {
    cost: 3, value,
    desc: {
      zh: `实体化+2。在场时，每个死亡的骷髅会为此单位提供1层实体化。每回合召唤${spawnN}个骷髅。`,
      en: `Entity+2. While alive, each dead skeleton grants +1 Entity layer. Each turn, summons ${spawnN} skeleton(s).`,
    },
    effects: () => [
      new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.entityLayers += 2; }),
      new Effect(Phase.Spawned, 0, ctx => {
        const b = ctx.bullet;
        (b._entityDecos = b._entityDecos || []).push('skull');
        if (b._skLordHandler) return;
        b._skLordHandler = (s) => {
          if (!b.alive) return;
          if (!s || s.kind !== 'skeleton') return;
          b.entityLayers += 1;
        };
        Events.on('summonDied', b._skLordHandler);
      }),
      new Effect(Phase.EntityTurn, 0, ctx => {
        const b = ctx.bullet, w = ctx.world;
        for (let i = 0; i < spawnN; i++) {
          const sk = spawnSummon(w, 'skeleton');
          if (sk) { sk.x = b.x + rand(-22, 22); sk.y = b.y + rand(-22, 22); }
        }
        for (let k = 0; k < 8; k++) {
          const a = Math.PI * 2 * Math.random();
          w.particles.push(new Particle({
            x: b.x, y: b.y,
            vx: Math.cos(a) * 70, vy: Math.sin(a) * 70,
            life: 0.32, color: '#c97aff', size: 3,
          }));
        }
      }),
      new Effect(Phase.Destroyed, 0, ctx => {
        const b = ctx.bullet;
        if (b._skLordHandler) {
          Events.off('summonDied', b._skLordHandler);
          b._skLordHandler = null;
        }
      }),
    ],
  };
}

// 爆骨花：召唤 N 个骷髅；展露状态下，骷髅死亡时造成 AOE 伤害（+可选骷髅攻击+1）
function _boneBlossomTier(skN, atkBoost, value, desc) {
  return {
    cost: 2, value, hasRevealFx: true, desc,
    effects: () => [],
    onUse(card, world) { for (let i = 0; i < skN; i++) spawnSummon(world, 'skeleton'); },
    onReveal(card) {
      if (card._bbHandler) return;
      card._bbHandler = (s) => {
        if (!card.faceUp) return;
        if (!s || s.kind !== 'skeleton') return;
        const w = window.__game;
        if (!w) return;
        // 标准范围伤害：半径 = 骷髅半径 × 3（AOE_VOL_RATIO=6, 所以 mult=0.5 即 ×3）。
        // 伤害 = 骷髅当前攻击（继承骷髅号角 / 爆骨花钻级等 buff）。
        const skR = s.radius || 8;
        const dmg = s.attack || 1;
        applyAoe(w, { x: s.x, y: s.y, radius: skR }, {
          damage: dmg, mult: 0.5, target: 'enemies',
        });
        for (let k = 0; k < 10; k++) {
          const a = Math.PI * 2 * Math.random();
          const sp = 90 + Math.random() * 80;
          w.particles.push(new Particle({
            x: s.x, y: s.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20,
            life: 0.4, color: k % 2 ? '#c97aff' : '#dde3ec', size: 2.6,
          }));
        }
      };
      Events.on('summonDied', card._bbHandler);
      if (atkBoost > 0) {
        if (card._bbBuffHandler) return;
        // diamond: 展露时骷髅伤害 +1。给所有未来召唤的骷髅打 buff
        card._bbBuffHandler = (s) => {
          if (!card.faceUp) return;
          if (!s || s.kind !== 'skeleton') return;
          s.attack = (s.attack || 0) + atkBoost;
        };
        Events.on('summonSpawned', card._bbBuffHandler);
      }
    },
    onConceal(card) {
      if (card._bbHandler) { Events.off('summonDied', card._bbHandler); card._bbHandler = null; }
      if (card._bbBuffHandler) { Events.off('summonSpawned', card._bbBuffHandler); card._bbBuffHandler = null; }
    },
  };
}

// 骷髅号角：召唤 N 骷髅，并给"场上当前所有骷髅"（含此次召唤）+D 伤害。弃置 = 使用。
// 注意：buff 只作用一次性、对当前场上骷髅；不影响未来召唤的骷髅。
function _skeletonHornTier(skN, atkBoost, value) {
  const apply = (world) => {
    for (let i = 0; i < skN; i++) spawnSummon(world, 'skeleton');
    for (const s of world.summons) {
      if (s.alive && s.kind === 'skeleton') s.attack = (s.attack || 0) + atkBoost;
    }
  };
  return {
    cost: 2, value,
    desc: {
      zh: `召唤${skN}个骷髅，使你场上的骷髅获得+${atkBoost}伤害。弃置此牌等同于使用。`,
      en: `Summon ${skN} skeleton(s). Skeletons on the field gain +${atkBoost} damage. Discard = use.`,
    },
    effects: () => [],
    onUse(_, world) { apply(world); },
    onDiscard(_, world) { apply(world); },
  };
}

// 打火机：摧毁时对随机敌人施加 1 燃烧，重复 N 次。钻：每为无燃烧敌人加燃烧时 reps+1。
function _lighterTier(reps, chain, value) {
  const descZh = chain
    ? `摧毁时对随机敌人施加1燃烧，重复${reps}次。每当为没有燃烧的敌人施加燃烧，重复次数+1。`
    : `摧毁时对随机敌人施加1燃烧，重复${reps}次。`;
  const descEn = chain
    ? `On destruction, applies 1 Burn to a random enemy ${reps} times. Each Burn on a non-burning enemy adds +1 rep.`
    : `On destruction, applies 1 Burn to a random enemy ${reps} times.`;
  return {
    cost: 1, value,
    desc: { zh: descZh, en: descEn },
    effects: () => [
      new Effect(Phase.Spawned, 0, ctx => { ctx.bullet._burnAura = true; }),
      new Effect(Phase.Destroyed, 0, ctx => {
        const w = ctx.world || window.__game;
        if (!w) return;
        let remaining = reps;
        let safety = 30;
        while (remaining > 0 && safety-- > 0) {
          const alive = w.enemies.filter(e => e.alive);
          if (alive.length === 0) break;
          const target = alive[randInt(0, alive.length - 1)];
          const wasBurning = (target.fire || 0) > 0;
          applyFire(target, 1);
          remaining--;
          if (chain && !wasBurning) remaining++;
        }
      }),
    ],
  };
}

function _eyewindTier(pullMult, lifeMult, value) {
  const descZh = lifeMult > 1
    ? `速度降低，持续时间大量增加，并在更大范围持续吸引敌人。`
    : (pullMult > 1
      ? `速度降低，持续时间增加，并在更大范围持续吸引敌人。`
      : `速度降低，持续时间增加，并持续吸引敌人。`);
  const descEn = `Slower bullet, ${lifeMult > 1 ? 'much ' : ''}longer lifetime, continuously pulls enemies in${pullMult > 1 ? ' over a larger area' : ''}.`;
  return {
    cost: 1, value,
    desc: { zh: descZh, en: descEn },
    effects: () => [
      new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.speed *= 0.5; ctx.bullet.lifetime *= 2 * lifeMult; }),
      new Effect(Phase.Spawned, 0, ctx => { ctx.bullet._eyeWind = true; ctx.bullet._eyeWindMult = pullMult; }),
    ],
  };
}

function _swordsmanTier({ atk, ent, half, reachMult = 1, value, desc }) {
  return {
    cost: 3, value, desc,
    effects: () => [
      new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.attack += atk; ctx.bullet.entityLayers += ent; }),
      new Effect(Phase.Spawned, 0, ctx => { (ctx.bullet._entityDecos = ctx.bullet._entityDecos || []).push('sword'); }),
      new Effect(Phase.EntityTurn, 0, ctx => {
        const b = ctx.bullet, w = ctx.world;
        const target = _nearestEnemyTo(w, b.x, b.y);
        const dirAngle = target ? Math.atan2(target.y - b.y, target.x - b.x) : (b.angle || 0);
        const reach = aoeRadius(b, AOE_MULT.swordSlash) * reachMult;
        w.particles.push(new Particle({ x: b.x, y: b.y, life: 0.18, color: '#ffffff', size: reach * 0.32, type: 'ring' }));
        const hits = applyAoe(w, b, {
          kind: 'cone', damage: b.attack, mult: AOE_MULT.swordSlash * reachMult,
          halfAngle: half, dirAngle, color: '#f1f4f8',
        });
        const sparks = 14;
        for (let i = 0; i <= sparks; i++) {
          const t = i / sparks;
          const a = dirAngle - half + half * 2 * t;
          const ex = b.x + Math.cos(a) * reach;
          const ey = b.y + Math.sin(a) * reach;
          w.particles.push(new Particle({
            x: ex, y: ey,
            vx: Math.cos(a) * (60 + Math.random() * 80), vy: Math.sin(a) * (60 + Math.random() * 80),
            life: 0.32 + Math.random() * 0.18, color: '#ffffff', size: 2.4,
          }));
        }
        FX.shake(w, clamp(3 + b.attack * 0.4 + hits * 0.5, 3, 9), 0.18);
      }),
    ],
  };
}

function _firebombTier(fire, radiusMult, value, desc) {
  return {
    cost: 2, value, desc,
    effects: () => [
      new Effect(Phase.Spawned, 0, ctx => { ctx.bullet._burnAura = true; }),
      new Effect(Phase.Destroyed, 0, ctx => {
        const w = ctx.world || window.__game;
        if (!w) return;
        applyAoe(w, ctx.bullet, {
          damage: 0, mult: AOE_MULT.arcaneExplode * radiusMult, target: 'enemies',
          knockback: false, isHit: false, onHit: (e) => applyFire(e, fire),
        });
      }),
    ],
  };
}

function _fuseTier(ent, fire, value, variant /* 'silver' | 'gold' | 'diamond' */) {
  return {
    cost: 3, value,
    desc: { zh: `实体化+${ent}。每回合向周围敌人施加${fire}层燃烧。`, en: `Entity+${ent}. Each turn applies ${fire} Burn to nearby enemies.` },
    effects: () => [
      new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.entityLayers += ent; }),
      new Effect(Phase.Spawned, 0, ctx => {
        (ctx.bullet._entityDecos = ctx.bullet._entityDecos || []).push('fuse');
        ctx.bullet._burnAura = true;
      }),
      new Effect(Phase.EntityTurn, 0, ctx => {
        const w = ctx.world;
        const b = ctx.bullet;
        const reach = aoeRadius(b, AOE_MULT.swordSlash);
        applyAoe(w, b, {
          damage: 0, mult: AOE_MULT.swordSlash, target: 'enemies',
          knockback: false, fx: false, isHit: false, onHit: (e) => applyFire(e, fire),
        });
        if (!w) return;
        if (variant === 'gold') {
          // 金：双层冲击环（内 + 外）+ 8 朵橙红喷射（向外辐射火舌）
          w.particles.push(new Particle({
            x: b.x, y: b.y, life: 0.32, color: '#ffd84a',
            size: reach * 0.55, type: 'ring',
          }));
          w.particles.push(new Particle({
            x: b.x, y: b.y, life: 0.45, color: '#ff5028',
            size: reach * 0.95, type: 'ring',
          }));
          const arms = 8;
          for (let i = 0; i < arms; i++) {
            const a = (i / arms) * Math.PI * 2;
            for (let k = 0; k < 5; k++) {
              const sp = 90 + k * 35;
              const lifeK = 0.35 + Math.random() * 0.25;
              w.particles.push(new Particle({
                x: b.x + Math.cos(a) * (reach * 0.25),
                y: b.y + Math.sin(a) * (reach * 0.25),
                vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 18,
                life: lifeK,
                color: k < 2 ? '#ffd84a' : (k < 4 ? '#ff7030' : '#c93020'),
                size: 3.2 - k * 0.35,
              }));
            }
          }
        } else if (variant === 'diamond') {
          // 钻：三层冲击环 + 中心爆发 + 12 朵彩色火舌
          for (let r = 0; r < 3; r++) {
            w.particles.push(new Particle({
              x: b.x, y: b.y, life: 0.32 + r * 0.1,
              color: r === 0 ? '#aef0fb' : (r === 1 ? '#ffd84a' : '#ff5028'),
              size: reach * (0.5 + r * 0.25), type: 'ring',
            }));
          }
          const arms = 12;
          for (let i = 0; i < arms; i++) {
            const a = (i / arms) * Math.PI * 2;
            const sp = 110 + Math.random() * 60;
            w.particles.push(new Particle({
              x: b.x, y: b.y,
              vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 0.5 + Math.random() * 0.2,
              color: i % 3 === 0 ? '#aef0fb' : (i % 3 === 1 ? '#ffd84a' : '#ff5028'),
              size: 3.6,
            }));
          }
        } else {
          // 银：单层橙环（原版）
          w.particles.push(new Particle({
            x: b.x, y: b.y, life: 0.32, color: '#ff7030',
            size: reach * 0.45, type: 'ring',
          }));
        }
      }),
    ],
  };
}

function _shockwaveTier(extraBound, radiusMult, halfAngle, value, desc) {
  // 范围伤害 = 随机角度扇形：每次触发都现 roll 一次方向。
  // 银：halfAngle = π/3 (120° total)；金/钻：halfAngle = π/2 (180° total)
  const _shockwaveCone = (ctx) => {
    applyAoe(ctx.world, ctx.bullet, {
      kind: 'cone',
      damage: ctx.bullet.attack,
      mult: AOE_MULT.arcaneExplode * radiusMult,
      target: 'enemies',
      dirAngle: Math.random() * Math.PI * 2,
      halfAngle,
      color: '#ffd84a',
    });
  };
  return {
    cost: 3, value, desc,
    effects: () => {
      const list = [];
      if (extraBound > 0) list.push(new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.bound += extraBound; }));
      list.push(new Effect(Phase.HitEnemy, 5, _shockwaveCone));
      list.push(new Effect(Phase.HitWall, 5, _shockwaveCone));
      return list;
    },
  };
}

function _arcaneboostTier(boost, doubleTrigger, value) {
  const descZh = doubleTrigger
    ? `洗入1张奥弹。你手牌中的奥弹伤害+${boost}，且额外触发一次。`
    : `洗入1张奥弹。你手牌中的奥弹伤害+${boost}。`;
  const descEn = doubleTrigger
    ? `Shuffle in 1 Arcane Missile. Arcane Missiles in hand gain +${boost} damage and trigger an extra time.`
    : `Shuffle in 1 Arcane Missile. Arcane Missiles in hand gain +${boost} damage.`;
  return {
    cost: 1, value,
    desc: { zh: descZh, en: descEn },
    effects: () => [],
    onUse(_, world) {
      for (const c of world.deck.hand) {
        if (c.familyId === 'arcane_missile') {
          c._arcBonus = (c._arcBonus || 0) + boost;
          if (doubleTrigger) c._arcDoubleFire = true;
        }
      }
      const newCard = mkCard('arcane_missile', 'silver');
      newCard._arcBonus = boost;
      if (doubleTrigger) newCard._arcDoubleFire = true;
      world.deck.shuffleIntoHand(newCard);
    },
  };
}

function _snipeTier(perPx, value, desc) {
  return {
    cost: 1, value, desc,
    effects: () => [
      new Effect(Phase.Spawned, 0, ctx => {
        const b = ctx.bullet;
        b._snipeStartX = b.x;
        b._snipeStartY = b.y;
        b._snipeBaseAttack = b.attack;
        b._snipePerPx = perPx;
      }),
      new Effect(Phase.HitEnemy, -2, ctx => {
        const b = ctx.bullet;
        if (b._snipeBaseAttack == null) return;
        const dist = Math.hypot(b.x - b._snipeStartX, b.y - b._snipeStartY);
        const bonus = Math.floor(dist / b._snipePerPx);
        b.attack = b._snipeBaseAttack + bonus;
      }),
    ],
  };
}

function _leadedTier(atk, value) {
  return {
    cost: 3, value,
    desc: { zh: `伤害+${atk}，穿透-5，弹射-5。`, en: `Damage+${atk}, Pierce-5, Bounce-5.` },
    effects: () => [new Effect(Phase.PreActive, 100, ctx => {
      ctx.bullet.attack += atk;
      ctx.bullet.bound = Math.max(0, ctx.bullet.bound - 5);
      ctx.bullet.penetrate = Math.max(0, ctx.bullet.penetrate - 5);
    })],
  };
}

function _igniteTier(bound, fire, value, pen = 0) {
  const parts = [];
  const partsEn = [];
  if (bound > 0) { parts.push(`弹射+${bound}`); partsEn.push(`Bounce+${bound}`); }
  if (pen > 0) { parts.push(`穿透+${pen}`); partsEn.push(`Pierce+${pen}`); }
  parts.push(`命中时施加${fire}层燃烧`);
  partsEn.push(`On hit, apply ${fire} Burn`);
  const desc = { zh: parts.join('，') + '。', en: partsEn.join('. ') + '.' };
  return {
    cost: 1, value, desc,
    effects: () => [new Effect(Phase.PreActive, 0, ctx => {
      if (bound > 0) ctx.bullet.bound += bound;
      if (pen > 0) ctx.bullet.penetrate += pen;
      ctx.bullet._fireOnHit = (ctx.bullet._fireOnHit || 0) + fire;
      if (!ctx.bullet._fireHookAdded) {
        ctx.bullet.addHook(_fireApplyHook);
        ctx.bullet._fireHookAdded = true;
      }
    })],
  };
}

function _photonGunTier(pen, bound, value) {
  return {
    cost: 2, value,
    desc: { zh: `穿透+${pen}，弹射+${bound}。速度提高。`, en: `Pierce+${pen}, Bounce+${bound}. Increased speed.` },
    effects: () => [new Effect(Phase.PreActive, 0, ctx => {
      ctx.bullet.penetrate += pen;
      ctx.bullet.bound += bound;
      ctx.bullet.speed *= 1.5;
    })],
  };
}

function _hotairTier(atk, radiusMult, value) {
  const sizeWord = radiusMult >= 1.5 ? '体积大幅增加' : '体积增大';
  const sizeWordEn = radiusMult >= 1.5 ? 'greatly increased size' : 'larger size';
  return {
    cost: 1, value,
    desc: { zh: `伤害+${atk}，${sizeWord}。`, en: `Damage+${atk}, ${sizeWordEn}.` },
    effects: () => [new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.attack += atk; ctx.bullet.radius *= radiusMult; })],
  };
}

function _wallTier(ent, value) {
  return {
    cost: 2, value,
    desc: { zh: `伤害-99。实体化+${ent}。体积大幅增加。`, en: `Damage-99. Entity+${ent}. Greatly increased size.` },
    effects: () => [new Effect(Phase.PreActive, 100, ctx => {
      ctx.bullet.attack = Math.max(0, ctx.bullet.attack - 99);
      ctx.bullet.entityLayers += ent;
      ctx.bullet.radius *= 2;
      ctx.bullet.speed *= 0.5;
    })],
  };
}

function _railgunTier(pen, bound, gainPct, alsoBound, value) {
  const desc = (() => {
    if (alsoBound) return { zh: `穿透+${pen}，弹射+${bound}。穿透和弹射时，速度提高。`, en: `Pierce+${pen}, Bounce+${bound}. Speeds up on pierce or bounce.` };
    if (bound > 0) return { zh: `穿透+${pen}，弹射+${bound}。穿透时，速度提高。`, en: `Pierce+${pen}, Bounce+${bound}. Speeds up on pierce.` };
    return { zh: `穿透+${pen}。穿透时，速度${gainPct >= 0.5 ? '提高' : '小幅提高'}。`, en: `Pierce+${pen}. Speeds up on pierce.` };
  })();
  return {
    cost: 1, value, desc,
    effects: () => {
      const list = [
        new Effect(Phase.PreActive, 0, ctx => {
          ctx.bullet.penetrate += pen;
          if (bound > 0) ctx.bullet.bound += bound;
          ctx.bullet._railgunBase = ctx.bullet.speed;
        }),
        new Effect(Phase.HitEnemy, 5, ctx => {
          if (ctx.bullet.penetrate >= 1) ctx.bullet.speed += (ctx.bullet._railgunBase || ctx.bullet.speed) * gainPct;
        }),
      ];
      if (alsoBound) list.push(new Effect(Phase.HitWall, 5, ctx => {
        if (ctx.bullet.bound >= 1) ctx.bullet.speed += (ctx.bullet._railgunBase || ctx.bullet.speed) * gainPct;
      }));
      return list;
    },
  };
}

function _scatterTier(count, value) {
  return {
    cost: 1, value,
    desc: { zh: `数量+${count}。伤害会随着经过距离增加而降低。`, en: `Bullets+${count}. Damage falls off with distance.` },
    effects: () => [
      new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.bulletCount += count; }),
      new Effect(Phase.Spawned, 0, ctx => {
        const b = ctx.bullet;
        b._scatterStartX = b.x; b._scatterStartY = b.y; b._scatterBaseAttack = b.attack;
      }),
      new Effect(Phase.HitEnemy, -2, ctx => {
        const b = ctx.bullet;
        if (b._scatterBaseAttack == null) return;
        const dist = Math.hypot(b.x - b._scatterStartX, b.y - b._scatterStartY);
        const drop = Math.min(2, Math.floor(dist / 280));
        b.attack = Math.max(0, b._scatterBaseAttack - drop);
      }),
    ],
  };
}

function _arcaneFireworkTier(extraRolls, value) {
  const descZh = extraRolls === 0
    ? '洗入2张奥弹。'
    : (extraRolls === 1
      ? '洗入2张奥弹。有50%概率额外洗入1张。'
      : `洗入2张奥弹。有50%概率额外洗入一张，判定${extraRolls}次。`);
  const descEn = extraRolls === 0
    ? 'Shuffle in 2 Arcane Missiles.'
    : `Shuffle in 2 Arcane Missiles. ${extraRolls === 1 ? '50% chance to add 1 more.' : `50% chance per roll to add 1 more (${extraRolls} rolls).`}`;
  return {
    cost: 1, value,
    desc: { zh: descZh, en: descEn },
    effects: () => [],
    onUse(_, world) {
      for (let i = 0; i < 2; i++) world.deck.shuffleIntoHand(mkCard('arcane_missile', 'silver'));
      for (let i = 0; i < extraRolls; i++) {
        if (Math.random() < 0.5) world.deck.shuffleIntoHand(mkCard('arcane_missile', 'silver'));
      }
    },
  };
}

function _hotpotatoTier(bound, fire, value) {
  return {
    cost: 2, value,
    desc: { zh: `弹射+${bound}。弹射时，为1个随机敌人施加${fire}层燃烧。`, en: `Bounce+${bound}. On bounce, apply ${fire} Burn to a random enemy.` },
    effects: () => [
      new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.bound += bound; }),
      new Effect(Phase.Spawned, 0, ctx => { ctx.bullet._burnAura = true; }),
      new Effect(Phase.HitWall, 5, ctx => {
        if (ctx.bullet.bound <= 0) return;
        const w = ctx.world || window.__game;
        if (!w) return;
        const alive = w.enemies.filter(e => e.alive);
        if (alive.length === 0) return;
        applyFire(alive[randInt(0, alive.length - 1)], fire);
      }),
    ],
  };
}

function _fuelcellTier(pen, bound, gain, igniteOnPen, value) {
  const descZh = igniteOnPen
    ? `穿透+${pen}，弹射+${bound}。穿透燃烧敌人时穿透+${gain}。如果穿透时敌人没有燃烧，添加1层燃烧。`
    : `穿透+${pen}，弹射+${bound}。穿透燃烧敌人时穿透+${gain}。`;
  const descEn = igniteOnPen
    ? `Pierce+${pen}, Bounce+${bound}. Piercing a burning enemy grants Pierce+${gain}. If not burning, apply 1 Burn.`
    : `Pierce+${pen}, Bounce+${bound}. Piercing a burning enemy grants Pierce+${gain}.`;
  return {
    cost: 1, value,
    desc: { zh: descZh, en: descEn },
    effects: () => {
      const list = [
        new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.penetrate += pen; ctx.bullet.bound += bound; }),
      ];
      if (igniteOnPen) {
        // 钻级燃料匣会主动施加燃烧 → 也披上火焰光环
        list.push(new Effect(Phase.Spawned, 0, ctx => { ctx.bullet._burnAura = true; }));
      }
      list.push(new Effect(Phase.HitEnemy, 5, ctx => {
        if (!ctx.enemy || ctx.bullet.penetrate < 1) return;
        if ((ctx.enemy.fire || 0) > 0) {
          ctx.bullet.penetrate += gain;
        } else if (igniteOnPen) {
          applyFire(ctx.enemy, 1);
        }
      }));
      return list;
    },
  };
}

function _slowCapsuleTier(atk, shots, boost, value) {
  return {
    cost: 2, value,
    desc: { zh: `伤害+${atk}。你的后${shots}次射击获得伤害+${boost}。`, en: `Damage+${atk}. Your next ${shots} shots gain Damage+${boost}.` },
    effects: () => [new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.attack += atk; })],
    onUse(_, world) {
      world._shotBuffs = world._shotBuffs || [];
      world._shotBuffs.push({ atk: boost, shots });
    },
  };
}

function _cryptTier(n, value) {
  return {
    cost: 1, value,
    desc: { zh: `召唤${n}个骷髅。弃置此牌：召唤${n}个骷髅。`, en: `Summon ${n} Skeletons. Discard: summon ${n} Skeletons.` },
    effects: () => [],
    onUse(_, world) { for (let i = 0; i < n; i++) spawnSummon(world, 'skeleton'); },
    onDiscard(_, world) { for (let i = 0; i < n; i++) spawnSummon(world, 'skeleton'); },
  };
}

// 终结技：基础 +atk；若本次射击正好用光法力 → 弹射+bound、穿透+pen。
// 钻级 (diamondRefund=true)：否则本场战斗中此卡 cost = 1（_battleCostOverride，resetForBattle 清空）。
function _finisherTier(atk, bound, pen, diamondRefund, value) {
  const tail = diamondRefund
    ? '否则，本场战斗中此卡牌费用为1点。'
    : '';
  const tailEn = diamondRefund
    ? ' Otherwise, this card costs 1 for the rest of this battle.'
    : '';
  return {
    cost: 2, value,
    desc: {
      zh: `伤害+${atk}。如果本次射击正好用光你的法力值，弹射+${bound}，穿透+${pen}。${tail}`,
      en: `Damage+${atk}. If this shot ends your mana at exactly 0, Bounce+${bound}, Pierce+${pen}.${tailEn}`,
    },
    effects: () => [
      new Effect(Phase.PreActive, 0, ctx => {
        ctx.bullet.attack += atk;
        const p = ctx.world?.player;
        // 本次射击的所有 spend() 已在 PreActive 之前完成，所以 player.mana 反映"用完后"的值
        if (p && p.mana === 0) {
          ctx.bullet.bound += bound;
          ctx.bullet.penetrate += pen;
        }
      }),
    ],
    onUse(card, world) {
      if (!diamondRefund) return;
      // 钻级 only: 如果未用光法力，给此卡设置本场战斗 cost=1（_battleCostOverride）
      const p = world?.player;
      if (p && p.mana > 0 && (card._battleCostOverride == null || card._battleCostOverride > 1)) {
        card._battleCostOverride = 1;
      }
    },
  };
}

// ─── CARD_DATA：29 个 family × tier (按策划表 xlsx) ────────────────
const CARD_DATA = {

  // ─── 钻 only ───
  gaze: {
    emoji: '👁',
    name: { zh: '凝视', en: 'Gaze' },
    tiers: {
      diamond: {
        cost: 2, value: 30, hasRevealFx: true,
        desc: { zh: '数量+3。展露：数量+2。', en: 'Bullets+3. Reveal: Bullets+2.' },
        effects: () => [new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.bulletCount += 3; })],
        onReveal(card) {
          if (card._revealHandler) return;
          card._revealHandler = (tpl) => { tpl.addHook(new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.bulletCount += 2; })); };
          Events.on('beforeShoot', card._revealHandler);
        },
        onConceal(card) {
          if (!card._revealHandler) return;
          Events.off('beforeShoot', card._revealHandler);
          card._revealHandler = null;
        },
      },
    },
  },

  bomb_timer: {
    emoji: '⏰',
    name: { zh: '定时炸弹', en: 'Time Bomb' },
    tiers: {
      diamond: {
        cost: 3, value: 50, hasRevealFx: true,
        desc: {
          zh: '触发所有燃烧效果。展露：如果所有敌人都处于燃烧状态，立刻免费使用。',
          en: 'Detonate all Burn. Reveal: if every enemy is burning, immediately use for free.',
        },
        effects: () => [],
        onUse(_, world) { detonateFire(world, _, 2); },
        onReveal(card) {
          if (card._revealHandler) return;
          const check = () => {
            const w = window.__game;
            if (!w) return;
            if (!card.faceUp) return;
            const enemies = w.enemies.filter(e => e.alive);
            if (enemies.length === 0) return;
            if (!enemies.every(e => (e.fire || 0) > 0)) return;
            queueMicrotask(() => {
              if (!card._revealHandler) return;
              if (!w.deck.hand.includes(card) || !card.faceUp) return;
              detonateFire(w, card, 2);
              card._lastAction = 'buff';
              w.deck.destroyCard(card);
            });
          };
          card._revealHandler = check;
          Events.on('cardUsedSide', check);
          Events.on('enemyDied', check);
          check();
        },
        onConceal(card) {
          if (!card._revealHandler) return;
          Events.off('cardUsedSide', card._revealHandler);
          Events.off('enemyDied', card._revealHandler);
          card._revealHandler = null;
        },
      },
    },
  },

  foresight: {
    emoji: '🔮',
    name: { zh: '预知', en: 'Foresight' },
    tiers: {
      diamond: {
        cost: 0, value: 4,
        desc: {
          zh: '将1张手牌翻为正面。如果它的消耗值为1，重复此行动。',
          en: 'Flip 1 face-down hand card up. If its cost is 1, repeat.',
        },
        effects: () => [],
        onUse(_, world) {
          let safety = 20;
          while (safety-- > 0) {
            const candidates = world.deck.hand.filter(c => !c.faceUp);
            if (candidates.length === 0) break;
            const pick = candidates[randInt(0, candidates.length - 1)];
            pick._foresightFaceUp = true;
            world.deck._setFace(pick, true);
            if (pick.cost !== 1) break;
          }
          Events.emit('deckChanged');
        },
      },
    },
  },

  // ─── 金 / 钻 ───
  shades: {
    emoji: '🕶',
    name: { zh: '墨镜', en: 'Shades' },
    tiers: {
      gold: {
        cost: 2, value: 23,
        desc: { zh: '弹射+3，穿透+3。弹射和穿透次数可互相转化。', en: 'Bounce+3, Pierce+3. Counts convert into each other.' },
        effects: () => [
          new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.bound += 3; ctx.bullet.penetrate += 3; }),
          new Effect(Phase.HitWall, 0, ctx => {
            const b = ctx.bullet;
            if (b.bound <= 0 && b.penetrate > 0) { b.bound += 1; b.penetrate -= 1; }
          }),
          new Effect(Phase.HitEnemy, 0, ctx => {
            const b = ctx.bullet;
            if (b.penetrate <= 0 && b.bound > 0) { b.penetrate += 1; b.bound -= 1; }
          }),
        ],
      },
      diamond: {
        cost: 2, value: 30,
        desc: { zh: '弹射+4，穿透+4。弹射和穿透次数可互相转化。', en: 'Bounce+4, Pierce+4. Counts convert into each other.' },
        effects: () => [
          new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.bound += 4; ctx.bullet.penetrate += 4; }),
          new Effect(Phase.HitWall, 0, ctx => {
            const b = ctx.bullet;
            if (b.bound <= 0 && b.penetrate > 0) { b.bound += 1; b.penetrate -= 1; }
          }),
          new Effect(Phase.HitEnemy, 0, ctx => {
            const b = ctx.bullet;
            if (b.penetrate <= 0 && b.bound > 0) { b.penetrate += 1; b.bound -= 1; }
          }),
        ],
      },
    },
  },

  red_herring: {
    emoji: '⚗',
    name: { zh: '鱼目混珠', en: 'Red Herring' },
    tiers: {
      gold: {
        cost: 2, value: 23,
        desc: { zh: '数量*4，但有50%概率伤害值变为0。', en: 'Bullets ×4, but each bullet has 50% chance to deal 0 damage.' },
        effects: () => [
          new Effect(Phase.PreActive, 50, ctx => { ctx.bullet.bulletCount *= 4; }),
          new Effect(Phase.Spawned, 0, ctx => { if (Math.random() < 0.5) ctx.bullet.attack = 0; }),
        ],
      },
      diamond: {
        cost: 2, value: 30,
        desc: { zh: '数量*4，但有30%概率伤害值变为0。', en: 'Bullets ×4, but each bullet has 30% chance to deal 0 damage.' },
        effects: () => [
          new Effect(Phase.PreActive, 50, ctx => { ctx.bullet.bulletCount *= 4; }),
          new Effect(Phase.Spawned, 0, ctx => { if (Math.random() < 0.3) ctx.bullet.attack = 0; }),
        ],
      },
    },
  },

  vampbat: {
    emoji: '🦇',
    name: { zh: '吸血蝙蝠', en: 'Vampire Bat' },
    tiers: {
      gold: _vampbatTier(0, 39),
      diamond: _vampbatTier(2, 50),
    },
  },

  doublecast: {
    emoji: '✨',
    name: { zh: '双重施法', en: 'Double Cast' },
    tiers: {
      gold: {
        cost: 2, value: 23,
        desc: { zh: '伤害+1，波次+1。', en: 'Damage+1, Wave+1.' },
        effects: () => [new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.attack += 1; ctx.bullet.waveCount += 1; })],
      },
      diamond: {
        cost: 2, value: 30, hasRevealFx: true,
        desc: { zh: '伤害+1。展露：波次+1。', en: 'Damage+1. Reveal: Wave+1.' },
        effects: () => [new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.attack += 1; })],
        onReveal(card) {
          if (card._revealHandler) return;
          card._revealHandler = (tpl) => { tpl.waveCount += 1; };
          Events.on('beforeShoot', card._revealHandler);
        },
        onConceal(card) {
          if (!card._revealHandler) return;
          Events.off('beforeShoot', card._revealHandler);
          card._revealHandler = null;
        },
      },
    },
  },

  necromancer: {
    emoji: '💀',
    name: { zh: '亡灵法师', en: 'Necromancer' },
    tiers: {
      gold: _necromancerTier(3, 39),
      diamond: _necromancerTier(5, 50),
    },
  },

  skeleton_lord: {
    emoji: '👑',
    name: { zh: '骷髅领主', en: 'Skeleton Lord' },
    tiers: {
      gold: _skeletonLordTier(1, 39),
      diamond: _skeletonLordTier(2, 50),
    },
  },

  // ─── 银 / 金 / 钻 ───
  streamlined: {
    emoji: '🌪',
    name: { zh: '流线型', en: 'Streamlined' },
    tiers: {
      silver: {
        cost: 2, value: 18,
        desc: { zh: '穿透+1，可追踪敌人。', en: 'Pierce+1. Bullets track enemies.' },
        effects: () => [new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.penetrate += 1; ctx.bullet.tracking = true; })],
      },
      gold: {
        cost: 2, value: 23,
        desc: { zh: '穿透+2，可追踪敌人。', en: 'Pierce+2. Bullets track enemies.' },
        effects: () => [new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.penetrate += 2; ctx.bullet.tracking = true; })],
      },
      diamond: {
        cost: 2, value: 30,
        desc: { zh: '穿透+4，可追踪敌人。', en: 'Pierce+4. Bullets track enemies.' },
        effects: () => [new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.penetrate += 4; ctx.bullet.tracking = true; })],
      },
    },
  },

  eyewind: {
    emoji: '🌬',
    name: { zh: '风之眼', en: 'Eye of the Wind' },
    tiers: {
      silver: _eyewindTier(1, 1, 8),
      gold: _eyewindTier(1.5, 1, 10),
      diamond: _eyewindTier(1.5, 1.5, 13),
    },
  },

  swordsman: {
    emoji: '🗡',
    name: { zh: '剑士', en: 'Swordsman' },
    tiers: {
      silver: _swordsmanTier({ atk: 1, ent: 2, half: Math.PI / 4, value: 30, desc: { zh: '伤害+1，实体化+2。每回合向最近的一名敌人挥剑，造成范围伤害。', en: 'Damage+1, Entity+2. Each turn slashes the nearest enemy for AOE damage.' } }),
      gold: _swordsmanTier({ atk: 1, ent: 2, half: Math.PI, value: 39, desc: { zh: '伤害+1，实体化+2。每回合向周围挥剑，造成无死角的范围伤害。', en: 'Damage+1, Entity+2. Each turn slashes 360° for AOE damage.' } }),
      diamond: _swordsmanTier({ atk: 2, ent: 2, half: Math.PI, reachMult: 1.5, value: 50, desc: { zh: '伤害+2，实体化+2。每回合向周围挥剑，造成无死角的大范围伤害。', en: 'Damage+2, Entity+2. 360° slash with +50% reach.' } }),
    },
  },

  firebomb: {
    emoji: '💣',
    name: { zh: '燃烧弹', en: 'Firebomb' },
    tiers: {
      silver: _firebombTier(1, 1, 18, { zh: '摧毁时对范围内的敌人施加1层燃烧。', en: 'On destruction, applies 1 Burn to enemies in range.' }),
      gold: _firebombTier(1, 1.2, 23, { zh: '摧毁时对更大范围内的敌人施加1层燃烧。', en: 'On destruction, applies 1 Burn to enemies in a larger area.' }),
      diamond: _firebombTier(1, 1.5, 30, { zh: '摧毁时对巨大范围内的敌人施加1层燃烧。', en: 'On destruction, applies 1 Burn to enemies in a huge area.' }),
    },
  },

  fuse: {
    emoji: '🔥',
    name: { zh: '引信', en: 'Fuse' },
    tiers: {
      silver: _fuseTier(2, 1, 30, 'silver'),
      gold: _fuseTier(3, 1, 39, 'gold'),
      diamond: _fuseTier(3, 2, 50, 'diamond'),
    },
  },

  shockwave: {
    emoji: '💥',
    name: { zh: '冲击波', en: 'Shockwave' },
    tiers: {
      silver: _shockwaveTier(0, 1.0, Math.PI / 3, 30, { zh: '碰撞时向随机方向造成120°的范围伤害。', en: 'On collision, deals a 120° AOE blast in a random direction.' }),
      gold: _shockwaveTier(0, 1.5, Math.PI / 2, 39, { zh: '碰撞时向随机方向造成180°的范围伤害。', en: 'On collision, deals a 180° AOE blast in a random direction.' }),
      diamond: _shockwaveTier(1, 1.5, Math.PI / 2, 50, { zh: '弹射+1。弹射和碰撞时向随机方向造成180°的范围伤害。', en: 'Bounce+1. On bounce or collision, deals a 180° AOE blast in a random direction.' }),
    },
  },

  arcaneboost: {
    emoji: '✦',
    name: { zh: '奥术强化', en: 'Arcane Boost' },
    tiers: {
      silver: _arcaneboostTier(1, false, 8),
      gold: _arcaneboostTier(2, false, 10),
      diamond: _arcaneboostTier(2, true, 13),
    },
  },

  bone_blossom: {
    emoji: '🌸',
    name: { zh: '爆骨花', en: 'Bone Blossom' },
    tiers: {
      silver: _boneBlossomTier(2, 0, 18, { zh: '召唤2个骷髅。展露：骷髅死亡时，造成范围伤害。', en: 'Summon 2 Skeletons. Reveal: skeleton deaths deal area damage.' }),
      gold: _boneBlossomTier(4, 0, 23, { zh: '召唤4个骷髅。展露：骷髅死亡时，造成范围伤害。', en: 'Summon 4 Skeletons. Reveal: skeleton deaths deal area damage.' }),
      diamond: _boneBlossomTier(4, 1, 30, { zh: '召唤4个骷髅。展露：骷髅伤害+1；骷髅死亡时，造成范围伤害。', en: 'Summon 4 Skeletons. Reveal: skeletons +1 damage; skeleton deaths deal area damage.' }),
    },
  },

  // ─── 铜 / 银 / 金 / 钻 ───
  snipe: {
    emoji: '🎯',
    name: { zh: '狙击', en: 'Snipe' },
    tiers: {
      bronze: _snipeTier(560, 6, { zh: '伤害会随着经过距离增加而略微增加。', en: 'Damage scales slightly with distance.' }),
      silver: _snipeTier(467, 8, { zh: '伤害会随着经过距离增加而轻度增加。', en: 'Damage scales lightly with distance.' }),
      gold: _snipeTier(373, 10, { zh: '伤害会随着经过距离增加而增加。', en: 'Damage scales with distance.' }),
      diamond: _snipeTier(280, 13, { zh: '伤害会随着经过距离增加而快速增加。', en: 'Damage scales rapidly with distance.' }),
    },
  },

  leaded: {
    emoji: '⚖',
    name: { zh: '注铅', en: 'Lead Slug' },
    tiers: {
      bronze: _leadedTier(8, 23),
      silver: _leadedTier(9, 30),
      gold: _leadedTier(11, 39),
      diamond: _leadedTier(13, 50),
    },
  },

  ignite: {
    emoji: '🔥',
    name: { zh: '引燃', en: 'Ignite' },
    tiers: {
      bronze: _igniteTier(0, 2, 6),
      silver: _igniteTier(1, 2, 8),
      gold: _igniteTier(2, 2, 10),
      diamond: _igniteTier(2, 3, 13, 1),
    },
  },

  roar: {
    emoji: '📢',
    name: { zh: '怒吼', en: 'Roar' },
    tiers: {
      bronze: { cost: 2, value: 13,
        desc: { zh: '伤害+1，获得1层连携。', en: 'Damage+1. Gain 1 Chain stack.' },
        effects: () => [new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.attack += 1; })],
        onUse(_, world) { world.addComboStacks(1); } },
      silver: { cost: 2, value: 18,
        desc: { zh: '伤害+2，获得1层连携。', en: 'Damage+2. Gain 1 Chain stack.' },
        effects: () => [new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.attack += 2; })],
        onUse(_, world) { world.addComboStacks(1); } },
      gold: { cost: 2, value: 23,
        desc: { zh: '伤害+2，获得1层连携，50%的概率额外获得1层。', en: 'Damage+2. Gain 1 Chain stack, plus 50% chance to gain 1 more.' },
        effects: () => [new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.attack += 2; })],
        onUse(_, world) { world.addComboStacks(Math.random() < 0.5 ? 2 : 1); } },
      diamond: { cost: 2, value: 30,
        desc: { zh: '伤害+2，获得2层连携。', en: 'Damage+2. Gain 2 Chain stacks.' },
        effects: () => [new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.attack += 2; })],
        onUse(_, world) { world.addComboStacks(2); } },
    },
  },

  photongun: {
    emoji: '🔫',
    name: { zh: '光子枪', en: 'Photon Gun' },
    tiers: {
      bronze: _photonGunTier(2, 2, 13),
      silver: _photonGunTier(2, 4, 18),
      gold: _photonGunTier(3, 5, 23),
      diamond: _photonGunTier(5, 5, 30),
    },
  },

  hotair: {
    emoji: '🎈',
    name: { zh: '热气球', en: 'Hot Air Balloon' },
    tiers: {
      bronze: _hotairTier(1, 1.2, 6),
      silver: _hotairTier(2, 1.2, 8),
      gold: _hotairTier(3, 1.2, 10),
      diamond: _hotairTier(2, 1.5, 13),
    },
  },

  wall: {
    emoji: '🧱',
    name: { zh: '城墙', en: 'Bulwark' },
    tiers: {
      bronze: _wallTier(5, 13),
      silver: _wallTier(7, 18),
      gold: _wallTier(10, 23),
      diamond: _wallTier(15, 30),
    },
  },

  boulder: {
    emoji: '🪨',
    name: { zh: '滚石', en: 'Boulder' },
    tiers: {
      bronze: { cost: 3, value: 23,
        desc: { zh: '穿透+99，弹射-99。速度降低，体积大幅增加。', en: 'Pierce+99, Bounce-99. Slower, much larger.' },
        effects: () => [new Effect(Phase.PreActive, 100, ctx => {
          ctx.bullet.penetrate += 99; ctx.bullet.bound = 0;
          ctx.bullet.speed *= 0.5; ctx.bullet.radius *= 2.5;
        })] },
      silver: { cost: 3, value: 30,
        desc: { zh: '穿透+99，弹射-99。体积大幅增加。', en: 'Pierce+99, Bounce-99. Much larger.' },
        effects: () => [new Effect(Phase.PreActive, 100, ctx => {
          ctx.bullet.penetrate += 99; ctx.bullet.bound = 0; ctx.bullet.radius *= 2.5;
        })] },
      gold: { cost: 3, value: 39,
        desc: { zh: '穿透+99，弹射减半（向上取整）。体积大幅增加。', en: 'Pierce+99, Bounce halved (round up). Much larger.' },
        effects: () => [new Effect(Phase.PreActive, 100, ctx => {
          ctx.bullet.penetrate += 99;
          ctx.bullet.bound = Math.ceil(ctx.bullet.bound / 2);
          ctx.bullet.radius *= 2.5;
        })] },
      diamond: { cost: 3, value: 50,
        desc: { zh: '穿透+99。体积大幅增加。', en: 'Pierce+99. Much larger.' },
        effects: () => [new Effect(Phase.PreActive, 100, ctx => {
          ctx.bullet.penetrate += 99; ctx.bullet.radius *= 2.5;
        })] },
    },
  },

  railgun: {
    emoji: '⚡',
    name: { zh: '磁轨', en: 'Railgun' },
    tiers: {
      bronze: _railgunTier(2, 0, 0.2, false, 6),
      silver: _railgunTier(2, 0, 0.5, false, 8),
      gold: _railgunTier(2, 1, 0.5, false, 10),
      diamond: _railgunTier(2, 1, 0.5, true, 13),
    },
  },

  scatter: {
    emoji: '🌫',
    name: { zh: '散弹', en: 'Scatter' },
    tiers: {
      bronze: _scatterTier(2, 6),
      silver: _scatterTier(3, 8),
      gold: _scatterTier(4, 10),
      diamond: _scatterTier(5, 13),
    },
  },

  arcane_firework: {
    emoji: '🎆',
    name: { zh: '奥术礼花', en: 'Arcane Firework' },
    tiers: {
      bronze: _arcaneFireworkTier(0, 6),
      silver: _arcaneFireworkTier(1, 8),
      gold: _arcaneFireworkTier(2, 10),
      diamond: _arcaneFireworkTier(4, 13),
    },
  },

  hotpotato: {
    emoji: '🥔',
    name: { zh: '烫土豆', en: 'Hot Potato' },
    tiers: {
      bronze: _hotpotatoTier(5, 2, 13),
      silver: _hotpotatoTier(5, 3, 18),
      gold: _hotpotatoTier(5, 4, 23),
      diamond: _hotpotatoTier(6, 5, 30),
    },
  },

  fuelcell: {
    emoji: '⛽',
    name: { zh: '燃料匣', en: 'Fuel Cell' },
    tiers: {
      bronze: _fuelcellTier(1, 2, 1, false, 6),
      silver: _fuelcellTier(1, 3, 2, false, 8),
      gold: _fuelcellTier(2, 3, 2, false, 10),
      diamond: _fuelcellTier(2, 3, 2, true, 13),
    },
  },

  slowcapsule: {
    emoji: '💊',
    name: { zh: '缓释胶囊', en: 'Slow-Release Capsule' },
    tiers: {
      bronze: _slowCapsuleTier(2, 1, 1, 13),
      silver: _slowCapsuleTier(3, 2, 1, 18),
      gold: _slowCapsuleTier(3, 3, 1, 23),
      diamond: _slowCapsuleTier(3, 5, 1, 30),
    },
  },

  crypt: {
    emoji: '⚰',
    name: { zh: '墓穴', en: 'Crypt' },
    tiers: {
      bronze: _cryptTier(2, 6),
      silver: _cryptTier(3, 8),
      gold: _cryptTier(4, 10),
      diamond: _cryptTier(5, 13),
    },
  },

  skeleton_horn: {
    emoji: '📯',
    name: { zh: '骷髅号角', en: 'Skeleton Horn' },
    tiers: {
      bronze: _skeletonHornTier(1, 1, 13),
      silver: _skeletonHornTier(1, 1, 18),
      gold: _skeletonHornTier(1, 2, 23),
      diamond: _skeletonHornTier(2, 3, 30),
    },
  },

  lighter: {
    emoji: '🔥',
    name: { zh: '打火机', en: 'Lighter' },
    tiers: {
      bronze: _lighterTier(2, false, 6),
      silver: _lighterTier(3, false, 8),
      gold: _lighterTier(4, false, 10),
      diamond: _lighterTier(5, true, 13),
    },
  },

  finisher: {
    emoji: '⚔',
    name: { zh: '终结技', en: 'Finisher' },
    tiers: {
      bronze:  _finisherTier(2, 2, 1, false, 13),
      silver:  _finisherTier(3, 3, 2, false, 18),
      gold:    _finisherTier(4, 4, 3, false, 23),
      diamond: _finisherTier(5, 4, 3, true,  30),
    },
  },

  // ─── 衍生 / 起手卡（不入商店池）───
  boost1: {
    emoji: '➕',
    name: { zh: '强化', en: 'Boost' },
    excludedFromShop: true,
    tiers: {
      bronze: {
        cost: 1, value: 6,
        desc: { zh: '伤害+1。', en: 'Damage+1.' },
        effects: () => [new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.attack += 1; })],
      },
    },
  },

  arcane_missile: {
    emoji: '✷',
    name: { zh: '奥弹', en: 'Arcane Missile' },
    excludedFromShop: true,
    tiers: {
      silver: {
        cost: 0, discardCost: 0, value: 1,
        desc: { zh: '发射一枚追踪弹。正面时立即自动触发，不消耗法力值。', en: 'Fires a tracking projectile. Auto-fires when face-up at no mana cost.' },
        effects: () => [],
        onReveal(card) {
          if (card._firing) return;
          card._firing = true;
          queueMicrotask(() => {
            const w = window.__game;
            if (!w || !w.deck.hand.includes(card) || !card.faceUp) {
              card._firing = false;
              return;
            }
            _autoFireArcaneMissile(w, card);
            card._lastAction = 'buff';
            w.deck.destroyCard(card);
          });
        },
        onConceal(card) { card._firing = false; },
      },
    },
  },

  // ─── 奥术进化主卡：开局时移除自身，洗入 5 张衍生「奥术进化-力/穿/火/弹/冰」───
  // 银：5 张全反面；金：随机 2 张正面；钻：5 张全正面。
  // 主卡保留在 bag，下一关重新触发；本关使用过的衍生卡不保留到下一关。
  arcane_evolution: {
    emoji: '🌌',
    name: { zh: '奥术进化', en: 'Arcane Evolution' },
    tiers: {
      silver: {
        cost: 1, value: 8, _arcEvoFaceUp: 0,
        desc: {
          zh: '在对战开始时，从你的卡组中移除此牌，然后将5种奥术强化洗入你的手牌。',
          en: 'At battle start, remove this card from your deck and shuffle 5 Arcane Boosts into your hand.',
        },
        effects: () => [],
      },
      gold: {
        cost: 1, value: 10, _arcEvoFaceUp: 2,
        desc: {
          zh: '在对战开始时，从你的卡组中移除此牌，然后将5种奥术强化洗入你的手牌。将2张奥术强化翻为正面。',
          en: 'At battle start, remove this card from your deck and shuffle 5 Arcane Boosts into your hand. Reveal 2 of them.',
        },
        effects: () => [],
      },
      diamond: {
        cost: 1, value: 13, _arcEvoFaceUp: 5,
        desc: {
          zh: '在对战开始时，从你的卡组中移除此牌，然后将5种奥术强化洗入你的手牌。将它们翻为正面。',
          en: 'At battle start, remove this card from your deck and shuffle 5 Arcane Boosts into your hand. Reveal all of them.',
        },
        effects: () => [],
      },
    },
  },

  // ─── 5 张奥术进化衍生卡（不入商店池 / 不在 bag）。使用后破碎 + 永久移除；弃置入弃牌堆。
  arc_evo_power: {
    emoji: '⚡',
    name: { zh: '奥术进化-力', en: 'Arc.Evo · Power' },
    excludedFromShop: true,
    tiers: {
      bronze: {
        cost: 1, value: 1, destroyOnUse: true, arcEvoDerived: true,
        desc: { zh: '本局对战中，你的奥弹伤害+1。移除此牌。', en: 'For this battle, your Arcane Missiles gain Damage +1. Remove this card.' },
        effects: () => [],
        onUse(_, world) { world._arcaneEvo = world._arcaneEvo || {}; world._arcaneEvo.dmg = (world._arcaneEvo.dmg || 0) + 1; },
      },
    },
  },
  arc_evo_pierce: {
    emoji: '🎯',
    name: { zh: '奥术进化-穿', en: 'Arc.Evo · Pierce' },
    excludedFromShop: true,
    tiers: {
      bronze: {
        cost: 1, value: 1, destroyOnUse: true, arcEvoDerived: true,
        desc: { zh: '本局对战中，你的奥弹穿透+1。移除此牌。', en: 'For this battle, your Arcane Missiles gain Pierce +1. Remove this card.' },
        effects: () => [],
        onUse(_, world) { world._arcaneEvo = world._arcaneEvo || {}; world._arcaneEvo.pen = (world._arcaneEvo.pen || 0) + 1; },
      },
    },
  },
  arc_evo_fire: {
    emoji: '🔥',
    name: { zh: '奥术进化-火', en: 'Arc.Evo · Fire' },
    excludedFromShop: true,
    tiers: {
      bronze: {
        cost: 1, value: 1, destroyOnUse: true, arcEvoDerived: true,
        desc: { zh: '本局对战中，你的奥弹施加1层燃烧。移除此牌。', en: 'For this battle, your Arcane Missiles apply 1 Burn on hit. Remove this card.' },
        effects: () => [],
        onUse(_, world) { world._arcaneEvo = world._arcaneEvo || {}; world._arcaneEvo.fire = (world._arcaneEvo.fire || 0) + 1; },
      },
    },
  },
  arc_evo_missile: {
    emoji: '✷',
    name: { zh: '奥术进化-弹', en: 'Arc.Evo · Missile' },
    excludedFromShop: true,
    tiers: {
      bronze: {
        cost: 1, value: 1, destroyOnUse: true, arcEvoDerived: true,
        desc: { zh: '本局对战中，每回合开始将2枚奥弹翻为正面。移除此牌。', en: 'For this battle, reveal 2 Arcane Missiles at the start of each turn. Remove this card.' },
        effects: () => [],
        onUse(_, world) { world._arcaneEvo = world._arcaneEvo || {}; world._arcaneEvo.missileFlip = (world._arcaneEvo.missileFlip || 0) + 2; },
      },
    },
  },
  arc_evo_ice: {
    emoji: '❄',
    name: { zh: '奥术进化-冰', en: 'Arc.Evo · Ice' },
    excludedFromShop: true,
    tiers: {
      bronze: {
        cost: 1, value: 1, destroyOnUse: true, arcEvoDerived: true,
        desc: { zh: '本局对战中，你的奥弹有25%概率施加冻结。移除此牌。', en: 'For this battle, your Arcane Missiles have 25% chance to apply Freeze. Remove this card.' },
        effects: () => [],
        onUse(_, world) { world._arcaneEvo = world._arcaneEvo || {}; world._arcaneEvo.freezeChance = (world._arcaneEvo.freezeChance || 0) + 0.25; },
      },
    },
  },
};

// 5 张奥术进化衍生卡的 family id 列表（用于扫描清理 / 批量 spawn）
const ARC_EVO_DERIVED_FAMILIES = ['arc_evo_power', 'arc_evo_pierce', 'arc_evo_fire', 'arc_evo_missile', 'arc_evo_ice'];

// 战斗开始时调用：扫描手牌中所有奥术进化主卡 → 移除自身 + 推入 5 张衍生（按 tier 决定多少张正面）
// "直接看到手牌更新，无插入动画"：批量修改 hand 数组 → 一次性 emit deckChanged
function _processArcaneEvolution(world) {
  const deck = world.deck;
  if (!deck || !deck.hand) return;
  let changed = false;
  // 先收集所有奥术进化卡（避免遍历时修改数组）
  const evoCards = deck.hand.filter(c => c.familyId === 'arcane_evolution');
  for (const evo of evoCards) {
    const idx = deck.hand.indexOf(evo);
    if (idx < 0) continue;
    deck.hand.splice(idx, 1);
    // 视觉：在炮台位置撒一下紫色粒子表示 "进化触发"
    const w = world; const p = w.player;
    if (p) {
      for (let i = 0; i < 24; i++) {
        const a = Math.PI * 2 * Math.random();
        const sp = 80 + Math.random() * 120;
        w.particles.push(new Particle({
          x: p.x, y: p.y - 30, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
          life: 0.55 + Math.random() * 0.2, color: i % 2 ? '#c97aff' : '#aef0fb', size: 3,
        }));
      }
    }
    // 生成 5 张衍生（按固定顺序：力 / 穿 / 火 / 弹 / 冰）
    const derived = ARC_EVO_DERIVED_FAMILIES.map(f => mkCard(f, 'bronze'));
    const faceUpN = evo._def?._arcEvoFaceUp ?? 0;
    if (faceUpN > 0) {
      // 随机挑 N 张标记 _foresightFaceUp（复用强制正面机制；_updateFaceUp 会保持它们正面）
      const idxs = derived.map((_, i) => i);
      for (let i = idxs.length - 1; i > 0; i--) {
        const j = randInt(0, i);
        [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
      }
      for (let i = 0; i < Math.min(faceUpN, derived.length); i++) {
        derived[idxs[i]]._foresightFaceUp = true;
      }
    }
    // 全部 push 到 hand（不带插入动画 — 直接修改数组）
    for (const d of derived) deck.hand.push(d);
    evo._foresightFaceUp = false;
    changed = true;
  }
  if (changed) {
    deck._updateFaceUp();
    Events.emit('deckChanged');
  }
}

// 玩家回合开始时调用：奥术进化-弹 buff 生效 → 把 2 张反面奥弹翻为正面（自动触发发射）
function _tickArcaneEvoMissileFlip(world) {
  const n = world?._arcaneEvo?.missileFlip || 0;
  if (n <= 0) return;
  const deck = world.deck;
  if (!deck || !deck.hand) return;
  const candidates = deck.hand.filter(c => c.familyId === 'arcane_missile' && !c.faceUp);
  // Fisher-Yates 取前 n 张
  const idxs = candidates.map((_, i) => i);
  for (let i = idxs.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
  }
  const take = Math.min(n, candidates.length);
  for (let i = 0; i < take; i++) {
    const c = candidates[idxs[i]];
    deck._setFace(c, true);
  }
}

// ─── 新手开局 picks 队列 ────────────────────────────────────────────
// 顺序：3 张铜卡 3 选 1 → 1 张银卡 3 选 1 → 背包整理（可调主卡） → 开战
function _makeStartupQueue() {
  return [
    { kind: 'pick', tier: 'bronze' },
    { kind: 'pick', tier: 'bronze' },
    { kind: 'pick', tier: 'bronze' },
    { kind: 'pick', tier: 'silver' },
    { kind: 'inv' },
  ];
}
// 推进到下一个 startup item；返回 true = 已开始处理新 item，false = 队列空
function _startNextStartupItem(world) {
  if (!world._startupQueue || world._startupQueue.length === 0) {
    world._startupCurrent = null;
    return false;
  }
  const item = world._startupQueue.shift();
  world._startupCurrent = item;
  if (item.kind === 'pick') {
    world.pendingShops = 1;
    world.battle.setState(State.Reward);
  } else if (item.kind === 'inv') {
    world.battle.setState(State.Inventory);
  }
  return true;
}

// ─── 商店刷新算法 ──────────────────────────────────────────────────────
// 4 等级（铜/银/金/钻）× 商店等级 [1..16]（从原来的 8 级扩展，节奏更慢）
// Lv1 全铜，Lv16 满级：30/45/20/5（银仍是主力，钻极稀有）
const RARITY_PROB = {
  1:  { bronze: 1.00, silver: 0.00, gold: 0.00, diamond: 0.00 },
  2:  { bronze: 0.95, silver: 0.05, gold: 0.00, diamond: 0.00 },
  3:  { bronze: 0.90, silver: 0.10, gold: 0.00, diamond: 0.00 },
  4:  { bronze: 0.85, silver: 0.15, gold: 0.00, diamond: 0.00 },
  5:  { bronze: 0.80, silver: 0.20, gold: 0.00, diamond: 0.00 },
  6:  { bronze: 0.75, silver: 0.23, gold: 0.02, diamond: 0.00 },
  7:  { bronze: 0.70, silver: 0.27, gold: 0.03, diamond: 0.00 },
  8:  { bronze: 0.65, silver: 0.30, gold: 0.05, diamond: 0.00 },
  9:  { bronze: 0.60, silver: 0.33, gold: 0.07, diamond: 0.00 },
  10: { bronze: 0.55, silver: 0.36, gold: 0.09, diamond: 0.00 },
  11: { bronze: 0.50, silver: 0.38, gold: 0.11, diamond: 0.01 },
  12: { bronze: 0.45, silver: 0.40, gold: 0.13, diamond: 0.02 },
  13: { bronze: 0.40, silver: 0.42, gold: 0.15, diamond: 0.03 },
  14: { bronze: 0.37, silver: 0.43, gold: 0.17, diamond: 0.03 },
  15: { bronze: 0.33, silver: 0.44, gold: 0.19, diamond: 0.04 },
  16: { bronze: 0.30, silver: 0.45, gold: 0.20, diamond: 0.05 },
};

function _shopFamilies() {
  return Object.entries(CARD_DATA)
    .filter(([_, fam]) => !fam.excludedFromShop)
    .map(([id]) => id);
}

// 按 RARITY_PROB[shopLv] 加权随机选一个 tier
function _rollTier(shopLv) {
  const p = RARITY_PROB[clamp(shopLv, 1, 16)];
  const r = Math.random();
  let acc = 0;
  for (const k of TIER_KEYS) {
    acc += p[k] || 0;
    if (r < acc) return k;
  }
  return TIER_KEYS[0];
}

// 玩家拥有 family 的所有 tier
function _ownedTiersOf(world, familyId) {
  const set = new Set();
  for (const c of world.deck.bag) {
    if (c && c.familyId === familyId) set.add(c.tier);
  }
  return set;
}

// 商店单槽 roll：返回 Card；超时则返回 null
// 规则：
//   - 严格按 RARITY_PROB 抽 tier
//   - 已拥有 family（包内任何 tier）→ 只允许 roll 已拥有的同级 tier，不出更高/更低
//     （升级路径：买重复同级 + 合并；商店不直接给比手上更高的等级）
//   - 已拥有钻级 → 整个 family 黑名单（无更高 tier 可升）
//   - 同一次刷新中不重复（dedup by familyId）
//   - tier 可强制传入（startup picks 用：forceTier='bronze' / 'silver'）
function _rollShopCard(world, alreadyKeys, maxAttempts = 40, forceTier = null) {
  const allFamilies = _shopFamilies();
  // 每个 family 已拥有的全部 tier 集合（空 Set = 未拥有）
  const ownedTiers = {};
  for (const f of allFamilies) ownedTiers[f] = _ownedTiersOf(world, f);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const tier = forceTier || _rollTier(world.shopLevel);
    const pool = allFamilies.filter(f => {
      if (!CARD_DATA[f].tiers[tier]) return false;
      const owned = ownedTiers[f];
      // 钻级已拥有 → 整个 family 黑名单
      if (owned.has('diamond')) return false;
      // 已拥有此 family：只允许已拥有的 tier（同级合成，不直接给高级）
      if (owned.size > 0 && !owned.has(tier)) return false;
      return true;
    });
    if (pool.length === 0) continue;
    const famId = pool[Math.floor(Math.random() * pool.length)];
    // dedup by family only：同一次刷新中绝不出现两张同 family 的卡（无论 tier）
    if (alreadyKeys.has(famId)) continue;
    alreadyKeys.add(famId);
    return mkCard(famId, tier);
  }
  return null;
}

// 一次完整刷新 count 张 → 返回 (Card | null)[]
function rollShopCandidates(world, count) {
  const out = [];
  const keys = new Set();
  for (let i = 0; i < count; i++) {
    out.push(_rollShopCard(world, keys));
  }
  return out;
}

// 兼容旧接口（极少数地方仍用）
function drawRandomCard(level) {
  const fake = { shopLevel: level, deck: { bag: [] } };
  return _rollShopCard(fake, new Set()) || mkCard('boost1', 'bronze');
}

// ─── 合成检查（购买时调用）─────────────────────────────────────────
// 检查 bag 中是否存在与 newCard 同 family 同 tier 的卡 → 返回 index，否则 -1
function findMergeTarget(bag, newCard) {
  for (let i = 0; i < bag.length; i++) {
    const c = bag[i];
    if (c && c !== newCard && c.familyId === newCard.familyId && c.tier === newCard.tier) {
      return i;
    }
  }
  return -1;
}

// 将 newCard 与 bag 中的同名同等级合并 → 升级一档；级联合并直到无可合
// 每次合成消耗"两张卡"产出"一张"：matchIdx 槽位变为 upgraded；上一次的 curSlot（若有）填回 1 张强化作为占位
// 返回 { finalCard, mergedAt: [...indices replaced], path: [tier1, tier2, ...] }
function performMerge(world, newCard, _slotIndex) {
  let cur = newCard;
  let curSlot = -1;          // -1 = cur 是商店卡（未进 bag）
  const path = [cur.tier];
  const replacedSlots = [];
  while (true) {
    const up = nextTier(cur.tier);
    if (!up || !CARD_DATA[cur.familyId].tiers[up]) break;
    const matchIdx = findMergeTarget(world.deck.bag, cur);
    if (matchIdx < 0 || matchIdx === curSlot) break;
    const upgraded = mkCard(cur.familyId, up);
    // 把"被消耗"的上一档卡所在槽位填回 1 张 强化（保持 bag 固定 9 张）
    if (curSlot >= 0 && curSlot !== matchIdx) {
      world.deck.replaceAt(curSlot, mkCard('boost1', 'bronze'));
    }
    // 把 matchIdx 槽位升级为 upgraded
    world.deck.replaceAt(matchIdx, upgraded);
    replacedSlots.push(matchIdx);
    cur = upgraded;
    curSlot = matchIdx;
    path.push(cur.tier);
  }
  return { finalCard: cur, mergedAt: replacedSlots, path };
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
      c._foresightFaceUp = false;
      c._battleCostOverride = null;     // 钻级终结技等"本场战斗 cost 覆盖"清空
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

  // 边缘卡 (最左 / 最右) 展露；_foresightFaceUp 标记的卡也保持正面
  _updateFaceUp() {
    for (let i = 0; i < this.hand.length; i++) {
      const isEdge = i === 0 || i === this.hand.length - 1;
      const targetFace = isEdge || !!this.hand[i]._foresightFaceUp;
      this._setFace(this.hand[i], targetFace);
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
    card._foresightFaceUp = false;
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
    card._foresightFaceUp = false;
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
    this.autoEndOnZeroMana = true;   // 默认开启：水晶用尽自动结束回合
    this.autoEndOnNoEnemy = true;    // 默认开启：场上无敌人时自动结束回合，剩余法力 1:1 转金币
    this.resumeAfterLoot = false;    // Loot 面板「继续」按钮：true=恢复战斗、false=开新战斗
    // 奥弹 buff：本回合所有奥弹叠加。turn 切换时清空
    this.arcaneBuffs = {};           // { doubleDamage, explode, knockback, refundMana, overload, echo }
    this.arcaneNextDouble = 0;       // 奥光：下 N 颗奥弹伤害 ×2
    this.summonBuffActive = false;   // 军团统帅：本回合召唤的单位 HP+100% 攻+2
    this.summonOverTurns = [];       // 持续召唤队列：[{ remaining: 3, kind: 'soldier' }]
    // 关卡 / 波次系统（土豆兄弟式）
    this.stageNumber = 1;            // 当前第几关（玩家可见，1 起）
    this.waveInStage = 0;            // 当前关已 spawn 的波次（0..7）
    this.stageTurn = 0;              // 当前关进度（玩家回合号 1..20+）
    this.waveNumber = 0;             // 跨关累积波次（决定难度曲线 + minWave 解锁）
    this.nextWaveTypes = null;       // 下一波预览（数组 of typeKey），UI 显示
    this.rewardTurn = false;         // 当前是否奖励回合（特殊视觉 + 金球）
    this._rewardHits = 0;            // 奖励回合期间击中金球的累计次数
    this._rewardTurnsRemaining = 0;  // 金球剩余存在回合数（每个敌方回合 -1）
    this._stageEndPending = false;   // 标记关卡结束 → pendingShops 已 +1，待商店打开
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
    // 进入敌方回合：三阶段串行（射击残余 → 我方 → 敌方）
    //   阶段 0（射击残余）：等场上所有非实体的我方子弹打完（撞墙 / 命中 / 寿命 / 变实体）。
    //                  期间 _entityPhasePending + _enemyPhasePending 都 true → 敌人不动，计时器不走。
    //   阶段 1（我方/实体回合）：实体效果（剑士挥剑、蝙蝠射子弹、引信燃烧）+ 我方召唤队列 + 友军衰减 + 召唤物发射
    //                  实体效果用 setTimeout 摊到 0~810ms 播放。
    //   阶段 2（敌方）：场上有实体子弹时延后 850ms → 波次 spawn + 敌人 intent → _enemyPhasePending=false 解锁敌人移动
    // 火焰已移到 endPlayerTurn（玩家回合结束触发）
    if (t === 'enemy') {
      this._entityPhasePending = true;
      this._enemyPhasePending = true;
    }
    Events.emit('turnChanged', t);
  }

  // 阶段 1：实体回合（剑士挥剑 / 蝙蝠射 / 引信燃烧 / 友军衰减 / 召唤物发射）
  _startEntityPhase() {
    this._entityPhasePending = false;
    this._tickEntityBullets();
    this._tickSummonOverTurns();
    this._tickFriendlyDecay();
    this._tickSummonFire();
    // 实体效果异步播放（setTimeout，最长 ~810ms）→ 给 850ms 缓冲让所有效果完整结算再进敌人回合
    const hasEntity = this.world.bullets.some(b => b.alive && b.isEntity);
    if (hasEntity) {
      setTimeout(() => this._startEnemyPhase(), 850);
    } else {
      this._startEnemyPhase();
    }
  }

  // 阶段 2：敌方回合（波次 spawn + intent 推进）；解锁敌人移动 + 启动回合计时
  _startEnemyPhase() {
    this._enemyPhasePending = false;
    this._tickWaveSpawn();
    this._tickEnemyIntents();
    this._tickSkeletonNewTurn();
  }

  // 每个敌方回合开始：清零所有骷髅的 _dashedThisTurn 标志，让它们能开始新一轮 dash
  _tickSkeletonNewTurn() {
    const w = this.world;
    if (!w.summons) return;
    for (const s of w.summons) {
      if (s.alive && s.kind === 'skeleton') s._dashedThisTurn = false;
    }
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
      if (s.hp <= 0) { s.alive = false; Events.emit('summonDied', s); }
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
    // 上一局阵亡后重开：完整重置玩家进度（等级 / 卡组 / 金币 / 商店 / 计分 + cannon 清空）
    if (this.state === State.PostBattle) {
      this.world.resetForNewGame();
    }
    // 还没选炮台：弹出选择面板，选完后再重新调 startBattle
    if (!this.world.cannon) {
      Events.emit('requestCannonSelect', () => this.startBattle());
      return;
    }
    // 新手开局 picks 未走完 → 先抽卡 + 进背包，全部结束后再 startBattle
    if (this.world._startupQueue && this.world._startupQueue.length > 0) {
      _startNextStartupItem(this.world);
      return;
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
    this.world._shotBuffs = [];         // 缓释胶囊 buff 清空
    this.world._arcaneEvo = {};         // 奥术进化本局 buff 清空
    this.world.summons = [];
    this.world.inventoryDiscount = 0;   // 背包减费跨关不继承
    Events.emit('inventoryDiscountChanged', 0);
    this.world.deck.resetForBattle();
    // 奥术进化：扫描手牌触发主卡 → 移除自身 + 洗入 5 张衍生
    _processArcaneEvolution(this.world);
    this.killCount = 0;
    this.waveIndex = 0;
    this.waveTimer = 0;
    this.resumeAfterLoot = false;
    // 关卡系统（土豆兄弟式）：每关 20 回合，固定波次时间表 [1,4,7,10,13,16,19]。
    // stageNumber 玩家可见；waveInStage 当前关已进的波次 1..7；stageTurn 当前关进度 1..20+。
    // waveNumber 是跨关累积，决定难度曲线 — 永远只增不减。
    this.stageNumber = 1;
    this.waveInStage = 0;
    this.stageTurn = 0;
    this.waveNumber = 0;
    this.rewardTurn = false;
    this._rewardHits = 0;
    this._rewardTurnsRemaining = 0;
    this._stageEndPending = false;
    this._planNextWave();
    this.setTurn('player');
    this.enemyTurnTimer = 0;
    this.setState(State.PreBattle);
    setTimeout(() => {
      this.setState(State.Battle);
      // 第 1 回合开始 = 立即生成第 1 波（stageTurn=1, waveInStage=1）
      this._spawnPlannedWave();
      this.waveNumber++;
      this.waveInStage = 1;
      this.stageTurn = 1;
      Events.emit('stageChanged');
      this._planNextWave();
    }, 800);
  }

  // 当前关卡内"何时刷波"的硬编码时间表（玩家可见的回合号 1..13）
  // 5 波 / 13 回合；最后一波在 turn 13。清空宽限 2 回合（即 turn 14, 15 内清空也有金球）。
  _stageWaveTurns()    { return [1, 4, 7, 10, 13]; }
  _stageMaxTurns()     { return 13; }
  _stageWaveCount()    { return 5; }
  // 末波清空后还可获得金球的额外回合数（grace turns）。0 表示仅最后一波回合本身清空有奖励。
  _stageGraceTurns()   { return 2; }
  // 金球可被击中的回合数（金球出现后再存在 N 个玩家回合）
  _stageRewardTurns()  { return 2; }

  endPlayerTurn() {
    if (this.state !== State.Battle || this.turn !== 'player') return;
    // 剩余法力 → 金币：累积制，每 10 法力换 1 金币 orb（余数跨关保留，玩家不可见）。
    // orb 从法力条 fill 末端 spawn → 飞向金币条。
    const leftover = Math.floor(this.world.player.mana || 0);
    if (leftover > 0) {
      const w = this.world;
      w._manaConversionProgress = (w._manaConversionProgress || 0) + leftover;
      const coins = Math.floor(w._manaConversionProgress / 10);
      w._manaConversionProgress -= coins * 10;
      if (coins > 0) {
        // 取法力条 fill 当前末端的屏幕坐标 → 转 canvas 坐标
        const pos = _manaBarEndCanvasPos(w);
        const orbCount = Math.min(30, coins);
        const perOrb = Math.max(1, Math.ceil(coins / orbCount));
        for (let i = 0; i < orbCount; i++) {
          w.particles.push(new GoldOrb(
            w, pos.x + rand(-6, 6), pos.y + rand(-4, 4), perOrb,
            { noScatter: true }
          ));
        }
      }
      // 法力立刻清零（视觉与逻辑同步）；orb 飞到 HUD 时再加金币
      w.player.mana = 0;
      Events.emit('manaChanged', 0);
    }
    // 流程：玩家回合结束 → 火焰结算 → 有商店则开店（暂停一切活动）→ 商店退出后才走我方 / 敌方阶段
    this._tickFireDamage();
    if (this.world.pendingShops > 0) {
      this.resumeAfterLoot = true;
      // 0.5s 缓冲：子弹消失后 → 视觉延迟开商店，避免突兀的弹面板
      // 期间把法力清零 → 玩家这段时间无法发射卡牌
      this.world.player.mana = 0;
      Events.emit('manaChanged', 0);
      setTimeout(() => {
        if (this.state === State.Battle) this.setState(State.Reward);
      }, 500);
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
    // 奥术进化-弹 buff：每个玩家回合开始翻 N 张奥弹（触发自动发射）
    _tickArcaneEvoMissileFlip(this.world);
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

    // 阶段 0：进入敌方回合后，等场上所有非实体的我方子弹清空（撞墙 / 命中 / 寿命 / 变实体）
    //         → 启动实体回合（剑士挥剑等）→ 启动敌方回合（敌人移动 + intent）
    if (this._entityPhasePending && this.turn === 'enemy') {
      const hasFlying = this.world.bullets.some(b => b.alive && !b.isEntity && b.team !== 'enemy');
      if (!hasFlying) this._startEntityPhase();
    }

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
          // 沉淀期满 → 再额外等待我方"非实体"子弹清空（蝙蝠 / 亡灵法师 在 EntityTurn 中
          // 异步 spawn 的追踪弹可能还在飞）；安全阀 2s 上限避免卡死。
          const hasFriendlyFlying = this.world.bullets.some(b =>
            b.alive && !b.isEntity && b.team !== 'enemy');
          this._enemySettleExtra = this._enemySettleExtra || 0;
          if (hasFriendlyFlying && this._enemySettleExtra < 2.0) {
            this._enemySettleExtra += dt;
            return;
          }
          this._enemySettling = false;
          this._enemySettleTimer = 0;
          this._enemySettleExtra = 0;
          // 敌方回合结束：先结算燃烧（在 endPlayerTurn 已结算），再结算冻结层数 -1
          for (const e of this.world.enemies) {
            if (e.alive && e.freeze > 0) e.freeze = Math.max(0, e.freeze - 1);
          }
          // 敌方结算完成 → 直接进入玩家回合
          this.setTurn('player');
          // 奥术进化-弹 buff：每个玩家回合开始翻 N 张奥弹（触发自动发射）
          _tickArcaneEvoMissileFlip(this.world);
        }
      }
    }

    // 设置：场上无敌人时自动结束回合（金球也算敌人 → 在场时阻塞，让玩家可以慢慢打掉换金币）
    // mana → gold 由 endPlayerTurn 统一处理（任何方式结束回合都生效）
    if (this.autoEndOnNoEnemy && this.turn === 'player'
        && !this.world.enemies.some(e => e.alive)) {
      if (this._fieldClearForAutoEnd()) {
        this._autoEndNoEnemySettleTime = (this._autoEndNoEnemySettleTime || 0) + dt;
        if (this._autoEndNoEnemySettleTime > 0.5) {
          this._autoEndNoEnemySettleTime = 0;
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

  // 自动结束回合是否可以触发：只要场上没有"飞行中的非实体子弹"即可。
  // 实体子弹（剑士、引信等）常驻在场上，但已经定型不再飞行 — 不阻塞自动结束。
  _fieldClearForAutoEnd() {
    for (const b of this.world.bullets) {
      if (b.alive && !b.isEntity) return false;
    }
    return true;
  }

  // 难度曲线：线性 30 + 2.2×(w-1)（在前版 15+1.1n 上 ×2，前版偏简单）。
  // w=1 → 30、w=10 → 49、w=20 → 71、w=30 → 93、w=50 → 137、w=100 → 247。
  // 二次项删掉避免后期爆炸，玩家每回合最多 4 发的输出节奏匹配。
  _waveValue(w) {
    const n = Math.max(1, w);
    return Math.floor(30 + 2.2 * (n - 1));
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
  // 预览的是"即将到来的那一波" — 累计 waveNumber 已经表示已 spawn 的波数，所以下一波 = waveNumber+1。
  _planNextWave() {
    const upcomingWave = this.waveNumber + 1;
    const v = this._waveValue(upcomingWave);
    const pool = _availableEnemies(upcomingWave);
    this.nextWaveTypes = this._pickEnemiesForValue(v, pool);
    Events.emit('waveChanged');
  }

  // 敌方回合开始：按关卡时间表决定 spawn 波 / 奖励回合 / 关卡结束
  _tickWaveSpawn() {
    const w = this.world;
    // 奖励回合期：金球已 spawn，倒计时存在 _stageRewardTurns 个玩家回合
    // 每个敌方回合 tick 一次，归零时结束关卡（清掉残留金球，进入商店）
    if (this.rewardTurn) {
      this._rewardTurnsRemaining = (this._rewardTurnsRemaining ?? 1) - 1;
      Events.emit('stageChanged');
      if (this._rewardTurnsRemaining <= 0) {
        w.enemies.length = 0;
        this.rewardTurn = false;
        this._rewardHits = 0;
        this._rewardTurnsRemaining = 0;
        this._endStage();
      }
      return;
    }
    // 关卡已结束等待商店：什么也不做（防止重复 endStage / 越界推进 stageTurn）
    if (this._stageEndPending) return;

    // 推进到"下一个玩家回合号"（_tickWaveSpawn 在敌方回合开始处调用 = 玩家上回合刚结束）
    this.stageTurn++;
    const waveTurns = this._stageWaveTurns();
    const inSchedule = waveTurns.indexOf(this.stageTurn) >= 0;
    const maxTurns = this._stageMaxTurns();
    const grace = this._stageGraceTurns();
    if (this.stageTurn <= maxTurns && inSchedule && this.waveInStage < this._stageWaveCount()) {
      // 时间表上的固定波次：spawn
      this._spawnPlannedWave();
      this.waveNumber++;
      this.waveInStage++;
      Events.emit('stageChanged');
      this._planNextWave();
    } else if (this.stageTurn > maxTurns) {
      // 最后一波之后：不刷新波次，不计入难度。
      // 金球奖励有 grace 回合宽限期 — stageTurn ∈ (maxTurns, maxTurns + grace + 1] 清空就奖励
      // （即玩家在第 maxTurns..maxTurns+grace 回合清完最后一波）。
      // 超过宽限 → 跳过金球，直接 endStage 进商店。
      const alive = w.enemies.filter(e => e.alive).length;
      if (alive === 0) {
        if (this.stageTurn <= maxTurns + grace + 1) {
          this._spawnRewardTurn();
        } else {
          this._endStage();
        }
      }
    }
    // 中间空场（非 stage 末尾、非时间表）：什么也不做。等下一个时间表点刷新。
  }

  // 关卡结束：触发商店（pendingShops++ + resumeAfterLoot），下一个玩家回合 end 时开店。
  // 商店关闭后由「继续游戏」按钮检测 _stageEndPending → 调 _startNextStage 重置状态并开始下一关。
  _endStage() {
    this.world.pendingShops = (this.world.pendingShops || 0) + 1;
    this.resumeAfterLoot = true;
    this._stageEndPending = true;
    toast(LANG.current === 'en'
      ? `★ Stage ${this.stageNumber} cleared! ★`
      : `★ 第 ${this.stageNumber} 关通过 ★`, 1.8);
  }

  // 商店关闭后的下一关启动：恢复 HP/法力/护甲；洗牌；清空临时 buff；推进 stageNumber。
  // 跨关保留：卡牌本身、金币、shopLevel、permUpgrades、击杀/分数 等。
  _startNextStage() {
    const w = this.world;
    this.stageNumber++;
    this.waveInStage = 0;
    this.stageTurn = 0;
    this._stageEndPending = false;
    // 玩家状态重置
    w.player.hp = w.player.maxHp;
    w.player.mana = w.player.maxMana;
    w.player.shield = 0;
    w.player.armor = w.player.armorPerTurn || 3;
    Events.emit('armorChanged', w.player.armor);
    Events.emit('manaChanged', w.player.mana);
    Events.emit('hpChanged', w.player.hp);
    // 战场重置
    w.enemies.length = 0;
    w.bullets.length = 0;
    w.summons = [];
    this.summonOverTurns = [];
    // 临时 buff 全部清空
    w._shotBuffs = [];
    w._arcaneEvo = {};           // 奥术进化本局 buff 清空
    w.inventoryDiscount = 0;
    Events.emit('inventoryDiscountChanged', 0);
    w.combo.reset();
    w.addComboStacks(-999);
    // 关卡内"洗入手牌"等临时卡也清空（这些 hook 在 deck 上由未来的卡牌系统处理 —
    // 当前 resetForBattle 已经把 hand/discard 重洗、临时卡若标记 _stageScoped 也丢弃）
    w.deck.resetForBattle();
    // 奥术进化：扫描手牌触发主卡 → 移除自身 + 洗入 5 张衍生
    _processArcaneEvolution(w);
    // 立即 spawn 新关第 1 波（与 startBattle 行为一致）
    this._spawnPlannedWave();
    this.waveNumber++;
    this.waveInStage = 1;
    this.stageTurn = 1;
    Events.emit('stageChanged');
    this._planNextWave();
  }

  _spawnPlannedWave() {
    if (!this.nextWaveTypes || this.nextWaveTypes.length === 0) {
      this._planNextWave();
    }
    // 每波固定金币 / XP 总预算（与具体敌人种类解耦）
    // 公式见 _waveRewardBudget()；按敌人数均分到每只敌人身上，死亡时掉落自己那份。
    let types = this.nextWaveTypes.slice();
    // 最后一波：数量 *1.5（这只影响这一波的实际 spawn，不参与下一波难度计算）
    // 用 Math.round 处理非整数：5*1.5=7.5→8，4*1.5=6
    const isLastWave = this.waveInStage === this._stageWaveCount() - 1;
    if (isLastWave) {
      const base = types.length;
      const extra = Math.max(1, Math.round(base * 0.5));
      for (let i = 0; i < extra; i++) types.push(this.nextWaveTypes[i % base]);
      toast(LANG.current === 'en'
        ? `★ Final Wave! Enemies +50% ★`
        : `★ 最后一波！敌人数量 +50% ★`, 2.0);
    }
    const budget = this._waveRewardBudget(this.waveNumber);
    const count = Math.max(1, types.length);
    const perGold = Math.max(1, Math.round(budget.gold / count));
    const perXp = Math.max(1, Math.round(budget.xp / count));
    for (const t of types) {
      const e = this._spawnEnemy(t);
      if (e) {
        e.waveGoldDrop = perGold;
        e.waveXpDrop = perXp;
      }
    }
    this.nextWaveTypes = null;
  }

  // 单波奖励预算：300 回合 → max shop (849) + 15 钻卡 (600) + 长期升级 (~5000)
  //   gold(w) = 3 + 0.04w + 0.0005w²    // 累积 ~7000+ 金币
  //   xp(w)   = 10 + 0.16w              // 累积 ~10000 XP，到 wave 250 单波 = 50 XP（恰好 2 波 1 级）
  _waveRewardBudget(w) {
    return {
      gold: Math.max(2, Math.floor(3 + 0.04 * w + 0.0005 * w * w)),
      xp:   Math.max(5, Math.floor(10 + 0.16 * w)),
    };
  }

  _spawnRewardTurn() {
    this.rewardTurn = true;
    this._rewardHits = 0;
    this._rewardTurnsRemaining = this._stageRewardTurns();
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

  // 玩家本回合能执行的最小动作 cost = min(最左 cost, 最右 cost) + 主卡有效 cost。
  // 主卡 cost 必须加上 cannon.mainCostMod（强能炮台 +1）→ 与 fireFromCards 实际扣费保持一致
  // 弃牌不计在内（弃牌不是「使用」）。
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
    const mainCostMod = this.world.cannon?.mainCostMod || 0;
    const eff = (c) => Math.max(0, (c?.cost ?? 0) - (c?._costMod || 0));
    const mainCost = main ? Math.max(0, eff(main) + mainCostMod) : 0;
    return Math.min(eff(left), eff(right)) + mainCost;
  }

  _spawnEnemy(typeKey) {
    // 仅从顶部 spawn（梯形上底 = 整个 canvas 宽）；若未指定 typeKey 则按当前累计波次池随机
    const W = this.world.w, m = 40;
    if (!typeKey) {
      const pool = _availableEnemies(Math.max(1, this.waveNumber));
      typeKey = pool[randInt(0, pool.length - 1)] || 'goblin';
    }
    const e = new Enemy(rand(m, W - m), m, typeKey, this.world);
    // 按当前累计波次（不是 turn）缩放敌人统计 — 关卡间难度连续递增
    //   shifted = max(0, waveNumber - 50)
    //   HP   × e^(shifted / 150)        无上限（每 150 波 ×e；wave 200 → ×2.72，wave 350 → ×7.4）
    //   攻击 ×(1 + shifted / 300), cap 3  3 倍上限（wave 650 满）
    //   速度 ×(1 + shifted / 600), cap 2  2 倍上限（wave 650 满）
    const turn = this.waveNumber || 0;
    const shifted = Math.max(0, turn - 50);
    const hpMult = Math.exp(shifted / 150);
    const atkMult = Math.min(3, 1 + shifted / 300);
    const spdMult = Math.min(2, 1 + shifted / 600);
    e.maxHp = Math.ceil(e.maxHp * hpMult);
    e.hp = e.maxHp;
    e.attack = Math.ceil(e.attack * atkMult);
    e.speed = e.speed * spdMult;
    this.world.enemies.push(e);
    return e;
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
    // 法力 → 金币累计器：每 10 法力换 1 金币，余数跨关保留（不显示给玩家）。
    this._manaConversionProgress = 0;
    this.summons = [];       // 友方召唤物（士兵 / 炮台 / 护盾兵 / 狙击塔等）
    this.cannon = null;      // 起始炮台（开局选一）；为 null 时进 Idle 会弹选择面板
    this.deck = new CardDeck();
    this.deck.world = this;          // 反向引用，衍生卡 / 召唤通过 deck 访问 world
    this.combo = new ComboManager();
    this.comboStacks = 0;            // 连携 stacks（v3.3 重定义）：>0 时自动消耗 1 层 + 左+右+主一起发
    this.battle = new BattleManager(this);
    // 商店等级（通过消耗刷新次数升级；影响候选数 + 稀有度概率）
    this.shopLevel = 1;
    // 每 3 级 +1 槽位；min(8, 3 + floor((lv-1)/3))。Lv 1-3=3 / Lv 4-6=4 / ... / Lv 16=8
    this.candidatesCount = 3;
    // 金币系统：杀敌 / 升级 / 胜利获得；用于商店刷新与升级
    // refreshCount 在每次 Loot 打开时重置，连续刷新成本 = 1 + refreshCount（缓慢增长）
    this.gold = 10;
    this.refreshCount = 0;
    // 开局新手 picks 队列：3 张铜卡 3 选 1 + 1 张银卡 3 选 1 + 背包整理
    this._startupQueue = _makeStartupQueue();
    this._startupCurrent = null;
    // 计分系统：杀敌、升级、连击触发等都给分；本局结束保存最高分
    this.score = 0;
    let savedHigh = 0;
    try { savedHigh = parseInt(localStorage.getItem('cs_highScore') || '0', 10) || 0; } catch (e) {}
    this.highScore = savedHigh;
    // 升级延迟商店：升级后入队，回合结束后逐次开商店；可在同一商店买多张
    this.pendingShops = 0;
    // 商店候选槽：(Card | null)[]，每个 pendingShop 进入面板时重 roll 满。
    // 购买把对应槽置 null（不挤压数组，槽位空缺保留到刷新/关闭）。
    // 刷新仅重 roll 当前 null 之外的"剩余"槽位（按需求 #3：不补齐为 8 张）。
    this.shopSlots = null;
    // 缓释胶囊：下 N 次射击的伤害 buff 队列 [{ atk, shots }]
    this._shotBuffs = [];
    // 满级商店后无限购买的 4 项永久升级（应用到每颗友方子弹）
    //   damage: +1 攻击 / pierce: +1 穿透 / bound: +1 弹射 / speed: +50 px/s
    // 价格 = base * e^(已买次数 / 5)，每次买涨 ~22%
    this.permUpgrades = { damage: 0, pierce: 0, bound: 0, speed: 0 };
    // 商店升级花费（Lv1→2 .. Lv15→16）：每级递增 ~20-25%（更平缓的指数曲线）
    // 累积 ~800 金；最贵一级 161 金（≈ 8 个一波击杀奖励）
    this.SHOP_THRESHOLDS = [10, 12, 15, 18, 22, 27, 33, 40, 49, 60, 73, 89, 108, 132, 161];
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

  // 阵亡后重开：完全重置进度（卡组 / 金币 / 商店 / 连击 / 计分；关卡由 startBattle 重置回 1）
  resetForNewGame() {
    this.shopLevel = 1;
    this.candidatesCount = 3;
    this.gold = 10;
    this.refreshCount = 0;
    this.shopSlots = null;
    this._startupQueue = _makeStartupQueue();
    this._startupCurrent = null;
    this.permUpgrades = { damage: 0, pierce: 0, bound: 0, speed: 0 };
    this._shotBuffs = [];
    // 法力换金币进度：阵亡重开才清；关卡间保留余数
    this._manaConversionProgress = 0;
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
    for (let i = 0; i < 9; i++) cards.push(mkCard('boost1', 'bronze'));
    this.deck.setBag(cards);
    // 炮台清空 → 下次进 Idle 会再次弹出选择面板
    this.cannon = null;
    Events.emit('cannonChanged', null);
  }

  // 玩家点商店「升级」按钮：消耗金币（按 SHOP_THRESHOLDS）
  _shopLevelUp() {
    if (this.shopLevel >= 16) return false;
    const cost = this.SHOP_THRESHOLDS[this.shopLevel - 1];
    if (this.gold < cost) return false;
    this.gold -= cost;
    this.shopLevel++;
    // 每 3 级 +1 候选槽：Lv 1-3=3 / 4-6=4 / 7-9=5 / 10-12=6 / 13-15=7 / 16=8
    this.candidatesCount = Math.min(8, 3 + Math.floor((this.shopLevel - 1) / 3));
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
// 法力条 fill 末端的"canvas 坐标"。GoldOrb 用 canvas 坐标系，DOM 元素的屏幕位置
// 需要反投影回 canvas 坐标系，updateOrbDom 再正向投影到屏幕。
// fallback：拿不到 DOM 时退回到玩家位置。
function _manaBarEndCanvasPos(world) {
  const canvas = document.getElementById('stage');
  const $fill = document.getElementById('mana-bar');
  if (!canvas || !$fill) return { x: world.player.x, y: world.player.y - 6 };
  const cr = canvas.getBoundingClientRect();
  const fr = $fill.getBoundingClientRect();
  const track = $fill.parentElement;
  const tr = track ? track.getBoundingClientRect() : fr;
  // fill 当前 width 表示剩余法力比例；取 fill 右沿（即 mana 末端）— fill 可能 width=0（mana=0），
  // 此时退回到 track 左端 + 一点偏移，避免落到屏幕外。
  const fillEndScreenX = fr.width > 0 ? fr.right : (tr.left + 6);
  const screenY = fr.top + fr.height / 2;
  const canvasX = ((fillEndScreenX - cr.left) / cr.width) * canvas.width;
  const canvasY = ((screenY - cr.top) / cr.height) * canvas.height;
  return { x: canvasX, y: canvasY };
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
// opts.noScatter: 跳过 phase 0/1（散落 + 悬浮），直接进 fly。法力 → 金币用。
class GoldOrb {
  constructor(world, x, y, value, opts = {}) {
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
    this.phase = opts.noScatter ? 2 : 0;          // 0=scatter, 1=pause, 2=fly
    this.phaseTime = 0;
    this.pauseDur = 0.18 + Math.random() * 0.18;
    this.scatterDur = 0.22 + Math.random() * 0.08;
    this.flySpeed = opts.noScatter ? 200 : 80;     // 跳过散落时直接较快起飞
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
    // XP 系统已删除 — orb 直接消失，不再加经验、不再 flash。
    // 留下类与生成路径以便后续在敌死亡时复用为别的奖励视觉（金币粒子已另有处理）。
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
  // 主卡额外加上 cannon.mainCostMod（强能炮台 +1）
  const mainCostMod = world.cannon?.mainCostMod || 0;
  const effectiveCost = (c) => {
    let cost = c.cost - (c._costMod || 0);
    if (c === main) cost += mainCostMod;
    return Math.max(0, cost);
  };
  // 计算总法力：连携时「完美协调」cost 视为 0（_comboCostFree 标记）
  const totalCost = useList.reduce((s, c) => {
    if (isCombo && c._comboCostFree) return s;
    return s + effectiveCost(c);
  }, 0);
  if (player.mana < totalCost) { toast(t('no_mana'), 0.7); return false; }

  // 模板子弹（基础攻击 = 2，所有 PreActive 加成在此基础上累计）
  const tpl = new Bullet({
    x: player.x, y: player.y, angle: player.angle,
    speed: 480, lifetime: 3.0, bulletCount: 1, waveCount: 1, attack: 2, bound: 0, penetrate: 0,
  });

  // 炮台被动：在 PreActive 之前修改 tpl 基础属性 / 累计 cannon 状态（连击 stack / 燃烧计数等）
  if (world.cannon) world.cannon.onFire(world, tpl, opts);

  // 让外部（如展露光环）有机会改模板
  Events.emit('beforeShoot', tpl);

  // 缓释胶囊：apply 上次留下的"未结算 +atk" buff（在 onUse 之前 → 新加的 buff 不影响这次）
  applyAndTickShotBuffs(world, tpl);

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
  // _def.destroyOnUse 的卡（奥术进化衍生）使用后破碎 + 永久移除，不入弃牌堆
  for (const c of cards) {
    const effects = c.initializeEffects?.() || [];
    if (c._def?.destroyOnUse) {
      c._lastAction = 'shatter';
      world.deck.destroyCard(c);
    } else {
      // 无 bullet hook 的卡视为 "纯效果" / buff（加倍奥弹 / 召唤 / 战吼 / 洗入 等）
      c._lastAction = effects.length === 0 ? 'buff' : 'use';
      world.deck.toDiscard(c);
    }
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
      // 复制 trackAccel（导弹型加速度）和遗留的 trackRate（如有）
      if (tpl.trackAccel != null) clone.trackAccel = tpl.trackAccel;
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
// 主卡额外加上 cannon.mainCostMod（如强能炮台 +1）
function _comboTotalCost(world) {
  const hand = world.deck.hand;
  if (hand.length < 2) return Infinity;
  const main = world.deck.mainCard;
  const left = hand[0];
  const right = hand[hand.length - 1];
  const mainCostMod = world.cannon?.mainCostMod || 0;
  const eff = (c) => Math.max(0, (c?.cost ?? 0) - (c?._costMod || 0));
  const lc = left?._comboCostFree ? 0 : eff(left);
  const rc = right?._comboCostFree ? 0 : eff(right);
  const mc = main?._comboCostFree ? 0 : Math.max(0, eff(main) + mainCostMod);
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
  // 亡灵法师：场上有活的 _isNecromancer 实体子弹 → 每次弃牌召唤 1 骷髅
  handleDiscardForNecromancer(world);
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
    cardEl.classList.remove('rarity-bronze', 'rarity-silver', 'rarity-gold', 'rarity-diamond');
    cardEl.classList.add('rarity-' + (card.rarity || 'bronze'));
    // 主卡显示包含 cannon.mainCostMod；任何 cost ≠ base 都着色（红涨 / 绿降）
    const eff = effectiveCardCost(card, world, !!opts.main);
    const costEl = cardEl.querySelector('.card-cost');
    costEl.textContent = eff;
    applyCostColor(costEl, card.cost, eff);
    cardEl.querySelector('.card-name').textContent = card.name;
    // desc 用关键词渲染（HTML），同时缓存关键词列表到 slot 上供 hover tooltip 使用
    const { html, seen } = renderDescWithKeywords(card.desc);
    cardEl.querySelector('.card-desc').innerHTML = html;
    slot.__keywords = seen;
    // 卡面图：emoji + 稀有度色（流派对玩家不可见，所以背景按稀有度区分）
    const art = card.def?.art || { emoji: '⚙' };
    const artEl = cardEl.querySelector('.card-art');
    artEl.className = 'card-art rarity-' + (card.rarity || "bronze");
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
    // 关卡 / 波次进度（XP 条已删 — 这里展示 Stage X · Wave Y/N）
    if ($xpLv) {
      const b = world.battle;
      const waveMax = b._stageWaveCount ? b._stageWaveCount() : 5;
      $xpLv.textContent = b.stageNumber || 1;
      if ($xpCur) $xpCur.textContent = b.waveInStage || 0;
      if ($xpMax) $xpMax.textContent = waveMax;
      // 关卡内波次的填充比例 = waveInStage / waveMax
      if ($xpFill) $xpFill.style.width = `${((b.waveInStage || 0) / waveMax) * 100}%`;
    }
    // 计算金币粒子目标：用 HUD DOM 节点的真实屏幕位置投影到 canvas 坐标系
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
    const mainCostMod = world.cannon?.mainCostMod || 0;
    const mainCost = mainCard ? Math.max(0, mainCard.cost + mainCostMod) : 0;
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
  // 换炮台 → 主卡显示费用变化（强能炮台 +1）需要重渲
  Events.on('cannonChanged', renderHand);
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
  // 波次预告（右侧 rail）— 不再单独显示当前回合数（已删 turn-num HUD）
  const $waveCdNum = document.getElementById('wave-cd-num');
  const $waveEnemies = document.getElementById('wave-enemies');
  const $rightRail = document.getElementById('right-rail');
  function renderWavePreview() {
    const b = world.battle;
    const types = b.nextWaveTypes;
    // 倒计时：从 stageTurn 算下次刷波到几号；只考虑本关剩余波次。
    const waveTurns = b._stageWaveTurns ? b._stageWaveTurns() : [1,4,7,10,13];
    const waveCount = b._stageWaveCount ? b._stageWaveCount() : 5;
    const maxTurns = b._stageMaxTurns ? b._stageMaxTurns() : 13;
    const grace = b._stageGraceTurns ? b._stageGraceTurns() : 2;
    const cur = b.stageTurn || 0;
    const nextScheduled = waveTurns.find(n => n > cur);
    const stageHasMoreWaves = (b.waveInStage || 0) < waveCount && nextScheduled != null;
    const tu = stageHasMoreWaves ? (nextScheduled - cur) : -1;
    // 标记：下一波是不是最后一波（用于高亮）
    const nextIsLastWave = stageHasMoreWaves && (b.waveInStage || 0) === waveCount - 1;
    // 标记：金球预告 / 金球消失预告状态
    const inReward = !!b.rewardTurn;
    const orbsLeft = inReward ? (b._rewardTurnsRemaining || 0) : 0;
    // 末波之后、未进 reward：玩家有 grace 回合内清空的窗口
    // turnsUntilCutoff = maxTurns + grace - stageTurn → 还能清几回合
    const inGrace = !inReward && !stageHasMoreWaves && cur >= maxTurns;
    const turnsToClear = inGrace ? (maxTurns + grace - cur) : -999;
    // 重置高亮 class
    if ($rightRail) {
      $rightRail.classList.toggle('next-last-wave', nextIsLastWave);
      $rightRail.classList.toggle('orb-grace', inGrace && turnsToClear >= 0);
      $rightRail.classList.toggle('orb-active', inReward);
    }
    if ($waveCdNum) {
      if (inReward) {
        // 金球消失倒计时
        $waveCdNum.textContent = orbsLeft > 1
          ? t('orb_expire_after', { n: orbsLeft })
          : t('orb_expire_this');
      } else if (inGrace && turnsToClear >= 0) {
        // 金球出现倒计时（清空才生效）
        $waveCdNum.textContent = turnsToClear > 0
          ? t('orb_appear_in', { n: turnsToClear })
          : t('orb_appear_this');
      } else if (!stageHasMoreWaves || !types || types.length === 0) {
        $waveCdNum.textContent = t('wave_none');
      } else if (tu === 0) {
        $waveCdNum.textContent = nextIsLastWave ? t('wave_last_this') : t('wave_this');
      } else {
        $waveCdNum.textContent = nextIsLastWave
          ? t('wave_last_after', { n: tu })
          : t('wave_after', { n: tu });
      }
    }
    if ($waveEnemies) {
      $waveEnemies.innerHTML = '';
      // reward / grace 状态展示金球图标，不展示敌人列表
      if (inReward || (inGrace && turnsToClear >= 0)) {
        const el = document.createElement('div');
        el.className = 'we-item we-orb';
        el.textContent = '💰';
        $waveEnemies.appendChild(el);
        return;
      }
      if (stageHasMoreWaves && types && types.length > 0) {
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
  Events.on('stageChanged', renderWavePreview);

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
  // 关卡推进时同步统计区的"关卡数"显示
  Events.on('stageChanged', () => {
    if ($statLevel) $statLevel.textContent = world.battle.stageNumber || 1;
  });
  // 商店等级显示 + reset 时同步
  function updateStats() {
    if ($statShop) $statShop.textContent = 'Lv ' + world.shopLevel;  // 'Lv' 通用，不翻译
    if ($statLevel) $statLevel.textContent = world.battle.stageNumber || 1;
    if ($statKills) $statKills.textContent = world.battle.killCount || 0;
  }
  Events.on('stateChanged', updateStats);
  Events.on('bagChanged', updateStats);
  Events.on('stageChanged', updateStats);
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
  setupCannonSelect(world);
  setupKeywordTooltips();
  setupEnemyTooltip(world);

  // HUD 上的炮台显示（在切换语言 / cannon 变更时刷新）
  const $cannonHud = document.getElementById('cannon-hud');
  const $cannonName = document.getElementById('cannon-name');
  const $cannonIcon = document.getElementById('cannon-icon');
  function refreshCannonHud() {
    if (!$cannonHud) return;
    if (world.cannon) {
      $cannonHud.classList.remove('hidden');
      $cannonName.textContent = world.cannon.name;
      $cannonIcon.textContent = world.cannon.icon;
      $cannonIcon.style.color = world.cannon.color;
    } else {
      $cannonHud.classList.add('hidden');
    }
  }
  Events.on('cannonChanged', refreshCannonHud);
  Events.on('langChanged', refreshCannonHud);
  refreshCannonHud();

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
    world.deck.resetForBattle();
    // 新手开局背包整理结束 → 启动正式战斗
    if (world._startupCurrent && world._startupCurrent.kind === 'inv') {
      world._startupCurrent = null;
      _prevState = null;
      world.battle.setState(State.Idle);
      world.battle.startBattle();
      return;
    }
    if (_prevState === State.Battle || _prevState === State.Inventory) {
      world.battle.setState(State.Battle);
    } else {
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
    el.className = 'bag-slot rarity-' + (card.rarity || "bronze");
    if (index === 0) el.classList.add('main');
    el.draggable = true;
    el.dataset.index = index;
    const art = card.def?.art || { emoji: '⚙' };
    const { html, seen } = renderDescWithKeywords(card.desc);
    const isMain = (index === 0);
    const eff = effectiveCardCost(card, world, isMain);
    el.innerHTML = `
      <div class="card-cost">${eff}</div>
      <div class="card-art rarity-${card.rarity || "bronze"}">${art.emoji || '⚙'}</div>
      <div class="card-name">${card.name}</div>
      <div class="card-desc">${html}</div>
    `;
    applyCostColor(el.querySelector('.card-cost'), card.cost, eff);
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

  // 新手开局：state 切到 Inventory + _startupCurrent 是 'inv' → 自动打开（无需扣法力）
  Events.on('stateChanged', s => {
    if (s === State.Inventory
        && world._startupCurrent && world._startupCurrent.kind === 'inv'
        && $modal.classList.contains('hidden')) {
      _prevState = null;
      renderBag();
      $modal.classList.remove('hidden');
    }
  });
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
    <div class="et-stat">${t('et_hp')}: <b>${hp} / ${maxHp}</b> · ${t('et_attack')}: <b>${attack}</b> · ${t('et_speed')}: <b>${Math.round(speed)}</b></div>
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
        <div class="et-stat">${t('et_hp')}: <b>${Math.ceil(s.hp)} / ${s.maxHp}</b> · ${t('et_attack')}: <b>${s.attack}</b> · ${t('et_speed')}: <b>${Math.round(s.speed)}</b></div>
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

// ---- 起始炮台选择面板（首次进入 / 阵亡后重开）----
function setupCannonSelect(world) {
  const $modal = document.getElementById('modal-cannon');
  const $opts = document.getElementById('cannon-options');
  const $title = document.getElementById('cannon-select-title');
  const $sub = document.getElementById('cannon-select-sub');
  if (!$modal || !$opts) return;
  let pendingCallback = null;

  function refreshLabels() {
    if ($title) $title.textContent = t('cannon_select_title');
    if ($sub) $sub.textContent = t('cannon_select_sub');
  }
  Events.on('langChanged', () => {
    refreshLabels();
    if (!$modal.classList.contains('hidden')) render();
  });

  function render() {
    $opts.innerHTML = '';
    for (const id of Object.keys(CANNON_DEFS)) {
      const c = new Cannon(id);
      const el = document.createElement('div');
      el.className = 'modal-card cannon-card';
      el.style.borderColor = c.color;
      el.innerHTML = `
        <div class="card-art" style="color:${c.color}">${c.icon}</div>
        <div class="card-name">${c.name}</div>
        <div class="card-desc">${c.desc}</div>
      `;
      el.addEventListener('click', () => {
        world.cannon = c;
        Events.emit('cannonChanged', c);
        $modal.classList.add('hidden');
        const cb = pendingCallback;
        pendingCallback = null;
        if (cb) cb();
      });
      $opts.appendChild(el);
    }
  }

  function open(cb) {
    pendingCallback = cb || null;
    refreshLabels();
    render();
    $modal.classList.remove('hidden');
  }

  Events.on('requestCannonSelect', open);

  // 首次加载时若无 cannon → 立即弹出；选完直接 startBattle（无需玩家再按 Enter）
  // startBattle 内部会检测 _startupQueue 非空 → 进入 3 铜 + 1 银 + 背包整理 startup 流程
  if (!world.cannon) open(() => world.battle.startBattle());
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

  // 面板状态：候选 = world.shopSlots，selected 记录 INDEX 到 shopSlots
  let selectedIdx = -1;

  // 卡牌商店售价：按 tier 一档一价（与 value 解耦）。铜 5 / 银 10 / 金 20 / 钻 40。
  // 开局新手 pick（_startupCurrent.kind === 'pick'）→ 全部免费
  const TIER_PRICE = { bronze: 5, silver: 10, gold: 20, diamond: 40 };
  function isStartupPick() {
    return world._startupCurrent && world._startupCurrent.kind === 'pick';
  }
  function cardPrice(card) {
    if (!card) return 0;
    if (isStartupPick()) return 0;
    return TIER_PRICE[card.tier] || 5;
  }
  // 候选数（非空槽数）— 显示在 UI / 决定 reroll 按钮启用
  function candidatesLeft() {
    if (!world.shopSlots) return 0;
    return world.shopSlots.filter(c => c != null).length;
  }
  function selectedCard() {
    return (selectedIdx >= 0 && world.shopSlots) ? world.shopSlots[selectedIdx] : null;
  }
  function showLoot() {
    let n = world.candidatesCount;
    // 新手 pick 阶段：固定 3 张候选 + 强制 tier
    if (isStartupPick()) {
      n = 3;
      const tier = world._startupCurrent.tier;
      const keys = new Set();
      const slots = [];
      for (let i = 0; i < n; i++) slots.push(_rollShopCard(world, keys, 40, tier));
      world.shopSlots = slots;
    } else {
      world.shopSlots = rollShopCandidates(world, n);
    }
    selectedIdx = -1;
    world.refreshCount = 0;
    if (world.pendingShops > 0) world.pendingShops--;
    renderCandidates();
    renderBag();
    updateHint();
    renderRerollBtn();
    renderShopLevelBtn();
    renderProbBar();
    renderPermUpgrades();
    $panel.classList.remove('hidden');
  }

  // 永久升级（满级商店后无限购买）
  // 价格 = base * e^(已购买次数 / 5)；每次买涨 ~22%
  const PERM_BASES = { damage: 300, pierce: 200, bound: 100, speed: 50 };
  const PERM_LABELS = { damage: '伤害 +1', pierce: '穿透 +1', bound: '弹射 +1', speed: '速度 +50' };
  const PERM_ICONS  = { damage: '⚔', pierce: '🎯', bound: '💫', speed: '⚡' };
  function permUpgradePrice(kind) {
    const owned = world.permUpgrades?.[kind] || 0;
    return Math.ceil(PERM_BASES[kind] * Math.exp(owned / 5));
  }
  function renderPermUpgrades() {
    const $pu = document.getElementById('perm-upgrades');
    if (!$pu) return;
    if (world.shopLevel < 16 || isStartupPick()) { $pu.classList.add('hidden'); return; }
    $pu.classList.remove('hidden');
    $pu.innerHTML = '';
    for (const kind of ['damage', 'pierce', 'bound', 'speed']) {
      const price = permUpgradePrice(kind);
      const owned = world.permUpgrades[kind] || 0;
      const btn = document.createElement('button');
      btn.className = 'perm-upgrade-btn';
      btn.innerHTML = `
        <div class="pu-name">${PERM_ICONS[kind]} ${PERM_LABELS[kind]}</div>
        <div class="pu-meta">💰 ${price}</div>
        ${owned > 0 ? `<div class="pu-count">×${owned}</div>` : ''}
      `;
      btn.disabled = world.gold < price;
      btn.addEventListener('click', () => {
        const p = permUpgradePrice(kind);
        if (world.gold < p) return;
        world.gold -= p;
        world.permUpgrades[kind] = (world.permUpgrades[kind] || 0) + 1;
        Events.emit('goldChanged', world.gold);
        toast(`✨ ${PERM_LABELS[kind]} → 已买 ×${world.permUpgrades[kind]}`, 1.0);
        renderPermUpgrades();
        renderRerollBtn();
        renderShopLevelBtn();
      });
      $pu.appendChild(btn);
    }
  }

  // 在 Loot 面板上显示当前商店等级的稀有度概率分布。两组（当前 + 下一级）并排横排
  function renderProbBar() {
    if (!$probBar) return;
    const lv = world.shopLevel;
    const cur = RARITY_PROB[lv];
    const next = lv < 16 ? RARITY_PROB[lv + 1] : null;
    const labels = { bronze: '🟩', silver: '⬜', gold: '🟨', diamond: '🔷' };
    const pct = (n) => Math.round(n * 100) + '%';
    function groupHTML(probs, label, dimAll) {
      let h = `<div class="prob-group"><span class="prob-label">${label}</span>`;
      for (const k of TIER_KEYS) {
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
    // 新手 pick：隐藏刷新按钮
    if (isStartupPick()) { $reroll.style.display = 'none'; return; }
    $reroll.style.display = '';
    const cost = world.refreshCost;
    $reroll.textContent = t('reroll', { cost: cost, gold: world.gold });
    $reroll.disabled = world.gold < cost || selectedIdx >= 0 || candidatesLeft() === 0;
  }

  function renderShopLevelBtn() {
    if (!$shopLevelBtn) return;
    // 新手 pick：隐藏商店升级按钮
    if (isStartupPick()) { $shopLevelBtn.style.display = 'none'; return; }
    $shopLevelBtn.style.display = '';
    const lv = world.shopLevel;
    if (lv >= 16) {
      $shopLevelBtn.textContent = t('shop_max');
      $shopLevelBtn.disabled = true;
      return;
    }
    const cost = world.SHOP_THRESHOLDS[lv - 1];
    $shopLevelBtn.textContent = t('shop_level', { cur: lv, next: lv + 1, cost: cost });
    $shopLevelBtn.disabled = world.gold < cost || selectedIdx >= 0;
  }

  function updateHint() {
    if (isStartupPick()) {
      const tierName = tierLabel(world._startupCurrent.tier);
      $hint.textContent = `新手开局 · 选 1 张「${tierName}」卡（免费）`;
      return;
    }
    if (candidatesLeft() === 0) {
      $hint.textContent = t('loot_hint_done');
    } else if (selectedIdx >= 0) {
      const c = selectedCard();
      const merges = c && findMergeTarget(world.deck.bag, c) >= 0 && nextTier(c.tier);
      if (merges) {
        $hint.textContent = `「${c.name}」→ 点击购买即合成为「${c.familyName} · ${tierLabel(nextTier(c.tier))}」`;
      } else {
        $hint.textContent = t('loot_hint_selected', { name: c?.name || '' });
      }
    } else {
      $hint.textContent = t('loot_hint_pick');
    }
  }

  function renderCandidates() {
    $cands.innerHTML = '';
    if (!world.shopSlots) return;
    for (let i = 0; i < world.shopSlots.length; i++) {
      const c = world.shopSlots[i];
      if (c == null) {
        // 空槽（已购买）：渲染一个占位空盒，保持网格对齐
        const ph = document.createElement('div');
        ph.className = 'modal-card empty-slot';
        ph.innerHTML = `<div class="card-name" style="opacity:0.4">—</div>`;
        $cands.appendChild(ph);
        continue;
      }
      const el = modalCardEl(c);
      if (i === selectedIdx) el.classList.add('selected');

      // 升级预览：购买可合成时，显示"→ 升级 tier"+ 可合成特效（脉冲边框 + 向上箭头）
      const mergeIdx = findMergeTarget(world.deck.bag, c);
      const upTier = nextTier(c.tier);
      const canMergeThis = mergeIdx >= 0 && upTier && CARD_DATA[c.familyId].tiers[upTier];
      if (canMergeThis) {
        el.classList.add('mergeable');
        const tag = document.createElement('div');
        tag.className = 'upgrade-preview';
        tag.textContent = t('upgrade_preview', { tier: tierLabel(upTier) });
        el.appendChild(tag);
        // 渐变上升箭头（CSS 动画驱动 → 不需要每帧 spawn）
        const arrow = document.createElement('div');
        arrow.className = 'merge-arrow';
        arrow.textContent = '▲';
        el.appendChild(arrow);
        // 4 颗循环粒子从卡底向上飘（CSS keyframes 控制）
        for (let k = 0; k < 4; k++) {
          const p = document.createElement('div');
          p.className = 'merge-spark';
          p.style.left = (15 + k * 25) + '%';
          p.style.animationDelay = (k * 0.3) + 's';
          el.appendChild(p);
        }
      }

      // 价格标签（每张卡都有，按 tier 5/10/20/40）；新手 pick 显示"免费"
      const price = cardPrice(c);
      const tag = document.createElement('div');
      tag.className = 'extra-cost-tag';
      if (isStartupPick()) {
        tag.textContent = '免费';
        tag.classList.add('free-tag');
      } else {
        tag.textContent = `💰 ${price}`;
        if (world.gold < price) tag.classList.add('cant-afford');
      }
      el.appendChild(tag);

      const idx = i;       // 闭包捕获
      el.addEventListener('click', () => {
        // 可合成 → 点击直接触发购买 + 自动合成（不需要再点 bag 槽）
        if (canMergeThis) {
          performPurchase(idx, -1);
          return;
        }
        // 否则：选中候选，等玩家点 bag 槽替换
        selectedIdx = (selectedIdx === idx) ? -1 : idx;
        renderCandidates();
        renderBag();
        renderRerollBtn();
        renderShopLevelBtn();
        updateHint();
      });
      $cands.appendChild(el);
    }
  }

  // 实际购买 — 触发合成或落地到指定槽位（fallback 路径）
  // bagSlotIndex < 0 表示自动合成（不需要指定槽位）
  function performPurchase(candIdx, bagSlotIndex) {
    const card = world.shopSlots[candIdx];
    if (!card) return false;
    // 每张卡都按 cardPrice 扣金币（无第 1 张免费）
    const price = cardPrice(card);
    if (world.gold < price) {
      toast(t('need_gold_extra', { n: price }), 1.0);
      return false;
    }
    world.gold -= price;
    Events.emit('goldChanged', world.gold);
    const candEl = $cands.querySelectorAll('.modal-card')[candIdx];
    if (candEl) candEl.classList.add('cand-consume-flash');

    if (bagSlotIndex < 0) {
      // 自动合成路径：先把卡 push 进 bag 的一个 "虚拟" 位置 — 用合并目标的位置升级
      // performMerge 会把目标 slot 替换为升级版本；新卡本身就不进 bag（被合并消费）
      const targetIdx = findMergeTarget(world.deck.bag, card);
      if (targetIdx >= 0) {
        // 把 target slot 升级，然后看是否还能继续级联
        const { finalCard, path } = performMerge(world, card, targetIdx);
        toast(t('merge_toast', { name: finalCard.familyName, tier: tierLabel(finalCard.tier) }), 1.2);
      }
    } else {
      // 普通替换：把指定槽位替换为新卡
      const cls = (bagSlotIndex === 0) ? 'main-replace-flash' : 'set-main-flash';
      const bagEls = $bag.querySelectorAll('.bag-slot');
      const targetEl = (bagSlotIndex === 0)
        ? document.querySelector('#loot-bag-main .bag-slot')
        : bagEls[bagSlotIndex - 1];     // bag-grid 渲染 index 1..N
      if (targetEl) targetEl.classList.add(cls);
      world.deck.replaceAt(bagSlotIndex, card);
      // 替换后若新卡所处槽位也有同 tier → 级联合并（罕见但可能）
      const sameTier = findMergeTarget(world.deck.bag, card);
      if (sameTier >= 0 && sameTier !== bagSlotIndex && nextTier(card.tier)) {
        const { finalCard } = performMerge(world, card, sameTier);
        toast(t('merge_toast', { name: finalCard.familyName, tier: tierLabel(finalCard.tier) }), 1.2);
      } else {
        toast(bagSlotIndex === 0 ? t('main_replaced') : t('replaced'), 0.6);
      }
    }
    // 候选槽位置 null（不再可选）
    world.shopSlots[candIdx] = null;
    selectedIdx = -1;
    setTimeout(() => {
      // 新手 pick 完成 → 直接触发"继续"按钮逻辑进下一阶段
      if (isStartupPick()) {
        $continue.click();
        return;
      }
      renderCandidates();
      renderBag();
      renderRerollBtn();
      renderShopLevelBtn();
      updateHint();
    }, 320);
    return true;
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
    el.className = 'bag-slot rarity-' + (card.rarity || "bronze");
    if (index === 0) el.classList.add('main');
    const sel = selectedCard();
    if (sel) el.classList.add('replace-target');
    el.draggable = true;
    el.dataset.index = index;
    const art = card.def?.art || { emoji: '⚙' };
    const { html, seen } = renderDescWithKeywords(card.desc);
    const isMain = (index === 0);
    const eff = effectiveCardCost(card, world, isMain);
    el.innerHTML = `
      <div class="card-cost">${eff}</div>
      <div class="card-art rarity-${card.rarity || "bronze"}">${art.emoji || '⚙'}</div>
      <div class="card-name">${card.name}</div>
      <div class="card-desc">${html}</div>
    `;
    applyCostColor(el.querySelector('.card-cost'), card.cost, eff);
    el.__keywords = seen;
    // 左键：若已选候选 → 触发购买（如果可合成则自动；否则替换该槽位）
    el.addEventListener('click', e => {
      if (e.button !== 0) return;
      if (selectedIdx < 0) return;
      const cand = selectedCard();
      if (!cand) return;
      // 候选卡有同 family + 同 tier 的合成目标 → 自动合成（不消耗这个被点击的槽位）
      const mergeIdx = findMergeTarget(world.deck.bag, cand);
      const canMerge = mergeIdx >= 0 && nextTier(cand.tier) && CARD_DATA[cand.familyId].tiers[nextTier(cand.tier)];
      if (canMerge) {
        performPurchase(selectedIdx, -1);
      } else {
        performPurchase(selectedIdx, index);
      }
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
    world.shopSlots = null;
    selectedIdx = -1;
    world.refreshCount = 0;
    // 新手 pick 阶段：进下一个 startup item
    if (isStartupPick()) {
      world._startupCurrent = null;
      if (world._startupQueue.length > 0) {
        _startNextStartupItem(world);
        return;
      }
      // 队列空了 → 启动正式战斗
      world.battle.setState(State.Idle);
      world.battle.startBattle();
      return;
    }
    if (world.battle.resumeAfterLoot && world.pendingShops > 0) {
      showLoot();
      return;
    }
    if (world.battle.resumeAfterLoot) {
      world.battle.resumeAfterLoot = false;
      // 关卡结束流程：商店关闭 → 启动下一关（重置 HP / 法力 / 牌组 / 临时 buff，spawn 第 1 波）
      if (world.battle._stageEndPending) {
        world.battle.setState(State.Battle);
        world.battle._startNextStage();
        // 直接进玩家回合，让玩家看到新关第 1 波
        world.battle.setTurn('player');
        world.battle.enemyTurnTimer = 0;
        return;
      }
      // 关卡途中（玩家因 levelUp 历史遗留逻辑或其他原因）：原行为 — 继续战斗
      world.deck.resetForBattle();
      world.battle.setState(State.Battle);
      world.battle._afterPlayerTurnComplete();
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
      world.refreshCount++;
      // 刷新：只 re-roll "非空" 槽位（已购的保持空缺，要求 #3）
      const keys = new Set();
      for (let i = 0; i < world.shopSlots.length; i++) {
        if (world.shopSlots[i] != null) {
          world.shopSlots[i] = _rollShopCard(world, keys);
        }
      }
      selectedIdx = -1;
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
      // 商店升级：不重新 roll 候选（要求 #3），仅按新 candidatesCount 扩容 / 收缩
      const n = world.candidatesCount;
      if (world.shopSlots) {
        while (world.shopSlots.length < n) {
          const keys = new Set(world.shopSlots.filter(Boolean).map(c => c.familyId + ':' + c.tier));
          world.shopSlots.push(_rollShopCard(world, keys));
        }
        // 不收缩（即使 n 更小也保留多余槽位 —— 实际 n 只会变大）
      }
      selectedIdx = -1;
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
  // 金币变化 → 刷新永久升级按钮的可点状态
  Events.on('goldChanged', () => {
    if (world.battle.state === State.Reward) renderPermUpgrades();
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
  el.className = 'modal-card rarity-' + (card.rarity || "bronze");
  const art = card.def?.art || { emoji: '⚙' };
  const { html, seen } = renderDescWithKeywords(card.desc);
  // 商店候选卡显示 base cost（候选不会是主卡，无 mainCostMod）；若 card._costMod 已设也着色
  const eff = effectiveCardCost(card, window.__game, false);
  el.innerHTML = `
    <div class="card-cost">${eff}</div>
    <div class="card-art rarity-${card.rarity || "bronze"}">${art.emoji || '⚙'}</div>
    <div class="card-name">${card.name}</div>
    <div class="card-desc">${html}</div>
  `;
  applyCostColor(el.querySelector('.card-cost'), card.cost, eff);
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

// canvas 顶部条：替换为关卡 / 波次进度条（不再有 XP）
// 填充 = 当前关已 spawn 的波数 / 7；右侧显示 "Stage X · Wave Y/7"
function renderXpBar(ctx, world) {
  const x = 20, y = 16, w = world.w - 130, h = 8;
  const b = world.battle;
  const stage = b.stageNumber || 1;
  const waveCur = b.waveInStage || 0;
  const waveMax = b._stageWaveCount ? b._stageWaveCount() : 5;
  ctx.save();
  // 底
  ctx.fillStyle = 'rgba(10, 13, 17, 0.85)';
  ctx.fillRect(x, y, w, h);
  // 填充（紫色 = 关卡进度，区分于 XP 蓝）
  const fillW = w * (waveCur / waveMax);
  const grad = ctx.createLinearGradient(x, 0, x + w, 0);
  grad.addColorStop(0, '#6b3aff');
  grad.addColorStop(1, '#c97aff');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, fillW, h);
  // 边框
  ctx.strokeStyle = '#3a4452';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  // 文字：Stage X 在条右侧；Wave Y/7 紧跟其后
  ctx.fillStyle = '#f1f4f8';
  ctx.font = 'bold 14px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const label = LANG.current === 'en' ? `Stage ${stage}` : `第 ${stage} 关`;
  ctx.fillText(label, x + w + 10, y + h / 2);
  ctx.font = '11px "Microsoft YaHei", sans-serif';
  ctx.fillStyle = '#c97aff';
  ctx.fillText(`${waveCur}/${waveMax}`, x + w + 70, y + h / 2);
  ctx.restore();
  // 兼容旧字段：金币粒子继续飞向条的左端
  if (world.xpBarPos) { world.xpBarPos.x = x + 4; world.xpBarPos.y = y + h / 2; }
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
  for (let i = 0; i < 9; i++) cards.push(mkCard('boost1', 'bronze'));
  world.deck.setBag(cards);
  world.deck.resetForBattle();    // 初始洗牌让 UI 有手牌显示（Idle 状态下也能看见）
  ui.renderHand();

  // 敌人被玩家击杀 → 爆出金币球（先散落周围再飞向条） + 计分
  // 使用 _spawnPlannedWave 时分配给敌人的 waveGoldDrop；fallback 用 xpReward 兜底（旧字段沿用）
  Events.on('enemyDied', enemy => {
    // 旧 xp 字段已删除，但 enemy.xpReward 仍作为"击杀分量"评估指标用于：震屏强度 + 计分。
    const killValue = enemy.xpReward || 2;
    const goldAmount = enemy.waveGoldDrop ?? Math.max(1, Math.ceil(killValue / 5));
    const orbCount = Math.min(5, Math.max(1, goldAmount));
    const perOrb = Math.max(1, Math.ceil(goldAmount / orbCount));
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
    FX.shake(world, clamp(3 + killValue * 0.4, 3, 8), 0.18);
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
    // 计分：杀敌 = xpReward × 10（普通怪 20 分、boss 200 分）
    world.score += killValue * 10;
    Events.emit('scoreChanged', world.score);
    // 触发死亡特殊效果（如分裂）
    enemy.onDie?.(world);
  });
  // 关卡完成奖励分数
  Events.on('stageChanged', () => {
    // 仅在 stage 实际推进时加分 — stageChanged 也会在每波 spawn 后 emit，所以校验下：
    // 只有 waveInStage 重新归位到 1（= 新关刚开始）时才认为是 stage 完成事件。
    if (world.battle.waveInStage === 1 && world.battle.stageNumber > 1) {
      world.score += 50;
      Events.emit('scoreChanged', world.score);
    }
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
  // 把所有 CARD_DATA 暴露到 window，方便 preview 测试。生产无害。
  window.__cards = CARD_DATA;
  window.__mkCard = mkCard;
  window.__events = Events;
  window.__rollShop = rollShopCandidates;
  window.__rollShopCard = _rollShopCard;
}

main();

})();
