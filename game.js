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

// 颜色 helper：在 hex (#rgb / #rrggbb / rgb()) 与白 / 黑之间线性混合。
// t ∈ [0, 1]，t=0 = 原色，t=1 = 纯白 / 纯黑。
// 用于 Enemy.draw 的径向渐变（中心 lighten，边缘 darken）。
function _parseHexColor(c) {
  if (!c) return [128, 128, 128];
  if (c[0] === '#') {
    if (c.length === 4) return [parseInt(c[1]+c[1],16), parseInt(c[2]+c[2],16), parseInt(c[3]+c[3],16)];
    if (c.length === 7) return [parseInt(c.slice(1,3),16), parseInt(c.slice(3,5),16), parseInt(c.slice(5,7),16)];
  }
  // rgb(r, g, b)
  const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(c);
  if (m) return [+m[1], +m[2], +m[3]];
  return [128, 128, 128];
}
function _lightenColor(c, t) {
  const [r, g, b] = _parseHexColor(c);
  const lr = Math.round(r + (255 - r) * t);
  const lg = Math.round(g + (255 - g) * t);
  const lb = Math.round(b + (255 - b) * t);
  return `rgb(${lr}, ${lg}, ${lb})`;
}
function _darkenColor(c, t) {
  const [r, g, b] = _parseHexColor(c);
  const lr = Math.round(r * (1 - t));
  const lg = Math.round(g * (1 - t));
  const lb = Math.round(b * (1 - t));
  return `rgb(${lr}, ${lg}, ${lb})`;
}

// ─── 多语言（i18n）─────────────────────────────────────────────────
// 单一 LANG.current 控制全局语言；切换时 emit 'langChanged' → UI 重渲。
const LANG = { current: 'zh' };
try {
  const _saved = localStorage.getItem('cs_lang');
  if (_saved === 'zh' || _saved === 'en') {
    LANG.current = _saved;
  } else {
    // 首次访问：读浏览器默认语言决定中 / 英
    const _nav = (navigator.language || 'zh').toLowerCase();
    LANG.current = _nav.startsWith('zh') ? 'zh' : 'en';
  }
} catch (e) {}
function setLang(code) {
  if (code !== 'zh' && code !== 'en') code = 'zh';
  if (LANG.current === code) return;
  LANG.current = code;
  try { localStorage.setItem('cs_lang', code); } catch (e) {}
  Events.emit('langChanged', code);
}

// ─── 音效（WebAudio 程序化合成）─────────────────────────────────────
// 无音频资源 → 用 OscillatorNode 程序化合成。每个事件一个 voice 函数。
// SFX.master = 主音量 (0..1)，SFX.muted = 是否静音；持久化在 localStorage。
// 由于浏览器策略，AudioContext 必须在用户首次交互后才能 resume。
const SFX = {
  ctx: null,
  master: 0.6,
  muted: false,
  _readied: false,
  _lastTimes: new Map(), // 节流：相同 key 在 minGapMs 内只触发一次
};
try {
  const m = localStorage.getItem('cs_sfx_master');
  if (m != null) SFX.master = clamp(parseFloat(m) || 0.6, 0, 1);
  SFX.muted = localStorage.getItem('cs_sfx_muted') === '1';
} catch (e) {}

function _ensureSfx() {
  if (SFX.ctx) {
    if (SFX.ctx.state === 'suspended') SFX.ctx.resume().catch(() => {});
    return SFX.ctx;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    SFX.ctx = new AC();
    // 浏览器手势策略：首次播放前必须 resume
    if (SFX.ctx.state === 'suspended') SFX.ctx.resume().catch(() => {});
  } catch (e) { return null; }
  return SFX.ctx;
}

// 一次用户手势后 unlock：把 SFX.ctx resume 起来 + 加载 MP3 采样 + 启动 BGM（如果开启）
function _unlockSfxOnGesture() {
  if (SFX._readied) return;
  SFX._readied = true;
  const ctx = _ensureSfx();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  _preloadSfxSamples();
  if (BGM.enabled) startBgm();
}
// 把所有可能的"用户手势"事件都用上：mousedown / touchstart / click 一旦发生立即 unlock
['pointerdown', 'mousedown', 'touchstart', 'click', 'keydown', 'wheel'].forEach(ev => {
  window.addEventListener(ev, _unlockSfxOnGesture, { once: true, capture: true });
});

// ─── MP3 采样加载 + 自动去除首尾静音 ─────────────────────────────────
// 内存里保存 AudioBuffer，事件触发时 spawn BufferSourceNode 播放（可同时叠放 / 不抢占）
const SFX_SAMPLES = {};   // name → AudioBuffer (已裁剪静音)

// 在 AudioBuffer 中找"有效音频"区间 —— 自动跳过前后静音段
// 较紧的阈值 + 极小的 head buffer，让响应延迟最低
function _trimSilence(buffer, thresh = 0.04) {
  const sr = buffer.sampleRate;
  const ch0 = buffer.getChannelData(0);
  const total = ch0.length;
  let start = 0;
  while (start < total && Math.abs(ch0[start]) < thresh) start++;
  let end = total - 1;
  while (end > start && Math.abs(ch0[end]) < thresh) end--;
  // 极小 head buffer（1ms），避免砍掉 attack；tail 保留 20ms 自然衰减
  start = Math.max(0, start - Math.floor(sr * 0.001));
  end   = Math.min(total - 1, end + Math.floor(sr * 0.020));
  const newLen = Math.max(1, end - start + 1);
  if (newLen >= total - sr * 0.001) return buffer;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const tmp = new Ctx();
  const out = tmp.createBuffer(buffer.numberOfChannels, newLen, sr);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = out.getChannelData(c);
    for (let i = 0; i < newLen; i++) dst[i] = src[start + i];
  }
  tmp.close && tmp.close();
  return out;
}

async function _loadSample(name, url) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return;
    const arr = await resp.arrayBuffer();
    const ctx = _ensureSfx();
    if (!ctx) return;
    const decoded = await new Promise((res, rej) => {
      // Safari 旧版要回调形式
      const p = ctx.decodeAudioData(arr, res, rej);
      if (p && p.then) p.then(res, rej);
    });
    SFX_SAMPLES[name] = _trimSilence(decoded);
  } catch (e) { /* 加载失败 → 回落到程序化合成 */ }
}

// 播放采样（带主音量 + 可选 gain 倍数 + 可选最大时长截断）。
// maxDur：限制播放时长，多次发射时避免长尾互相 smear；并在结尾加 5ms 短淡出避免咔哒
function playSample(name, gainMul = 1, maxDur = null) {
  if (SFX.muted) return false;
  const buf = SFX_SAMPLES[name];
  if (!buf) return false;
  const ctx = _ensureSfx();
  if (!ctx) return false;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  const peak = SFX.master * gainMul;
  const now = ctx.currentTime;
  g.gain.setValueAtTime(peak, now);
  src.connect(g);
  g.connect(ctx.destination);
  src.start(now);
  if (maxDur != null && maxDur > 0 && maxDur < buf.duration) {
    // 在 maxDur 末尾做 5ms 线性淡出，防止突然截断的 click
    const fadeStart = now + Math.max(0, maxDur - 0.005);
    g.gain.setValueAtTime(peak, fadeStart);
    g.gain.linearRampToValueAtTime(0.0001, now + maxDur);
    src.stop(now + maxDur + 0.005);
  }
  return true;
}

// 启动时（手势 unlock 后）异步加载所有采样
function _preloadSfxSamples() {
  _loadSample('shot', 'audio/shot.mp3');
  _loadSample('arcane', 'audio/arcane.mp3');
}

// ─── 音频生命周期管理 ───────────────────────────────────────────────
// 解决两个问题：
//   1) 页面卸载 / 标签关闭后，AudioContext 与已排程音符可能继续在浏览器后台播放
//   2) 切到后台标签时，BGM 调度器仍在跑（浪费 CPU + 用户听不到也不想要）
function _teardownAudio() {
  // 立即停止 BGM 调度（防止再排程未来音符）
  try { stopBgm(); } catch (e) {}
  // 关闭 AudioContext —— close() 会立即取消所有 scheduled buffer 并释放资源
  if (BGM.ctx && BGM.ctx.state !== 'closed') {
    try { BGM.ctx.close().catch(() => {}); } catch (e) {}
    BGM.ctx = null;
  }
  if (SFX.ctx && SFX.ctx.state !== 'closed') {
    try { SFX.ctx.close().catch(() => {}); } catch (e) {}
    SFX.ctx = null;
  }
  SFX._readied = false;
}
// pagehide 比 beforeunload 在移动端 / iOS Safari 上更可靠；同时挂两个保险
window.addEventListener('pagehide', _teardownAudio);
window.addEventListener('beforeunload', _teardownAudio);

// 页面隐藏（切标签 / 最小化）→ 暂停 BGM；回来再启动 —— 节流 + 静默
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    try { stopBgm(); } catch (e) {}
  } else {
    if (BGM.enabled && SFX._readied) {
      try { startBgm(); } catch (e) {}
    }
  }
});

function setSfxMaster(v) {
  SFX.master = clamp(v, 0, 1);
  try { localStorage.setItem('cs_sfx_master', String(SFX.master)); } catch (e) {}
  Events.emit('sfxChanged');
}
function setSfxMuted(b) {
  SFX.muted = !!b;
  try { localStorage.setItem('cs_sfx_muted', SFX.muted ? '1' : '0'); } catch (e) {}
  Events.emit('sfxChanged');
}

// 单音：osc + gain envelope。type/freq/dur/peak/sweep 控制音色。
function _tone(o) {
  if (SFX.muted) return;
  const ctx = _ensureSfx();
  if (!ctx) return;
  const t0 = ctx.currentTime + (o.delay || 0);
  const g = ctx.createGain();
  const peak = (o.peak ?? 0.25) * SFX.master;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + (o.attack ?? 0.005));
  const dur = o.dur ?? 0.15;
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  const osc = ctx.createOscillator();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(o.freq, t0);
  if (o.sweepTo != null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.sweepTo), t0 + dur);
  }
  // 可选低通滤波（让噪音更柔和）
  let last = osc;
  if (o.lpf) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(o.lpf, t0);
    last.connect(f);
    last = f;
  }
  last.connect(g);
  g.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// 噪音爆破（爆炸 / 击中等）
function _noise(o) {
  if (SFX.muted) return;
  const ctx = _ensureSfx();
  if (!ctx) return;
  const dur = o.dur ?? 0.12;
  const t0 = ctx.currentTime + (o.delay || 0);
  const sr = ctx.sampleRate;
  const buf = ctx.createBuffer(1, Math.max(1, Math.floor(sr * dur)), sr);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = o.bp ? 'bandpass' : 'lowpass';
  f.frequency.setValueAtTime(o.lpf ?? 1200, t0);
  if (o.lpfTo != null) f.frequency.exponentialRampToValueAtTime(Math.max(60, o.lpfTo), t0 + dur);
  const g = ctx.createGain();
  const peak = (o.peak ?? 0.2) * SFX.master;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + (o.attack ?? 0.004));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f); f.connect(g); g.connect(ctx.destination);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

// 节流：同 key 在 ms 内最多触发一次（避免 AOE / 多颗子弹时音轨爆掉）
function _throttle(key, ms) {
  const now = performance.now();
  const last = SFX._lastTimes.get(key) || 0;
  if (now - last < ms) return false;
  SFX._lastTimes.set(key, now);
  return true;
}

// 各事件的音色定义（每个名字是一段合成音）
// 整体方向：偏 triangle / sine 主导 → 更清脆透亮；少用 sawtooth / square 的粗砺感
const SfxFx = {
  // 开炮：经典程序化大炮 = 极短点火 crack + 亚低频 kick + 滤波噪音尾（仿 Worms / Tanks 类）
  // 参考：真实火炮 SFX 由 50-100 Hz 基频 + 短瞬态 + 0.3-0.5s 噪音衰减组成；
  //       重点在 noise 而不是 osc 音色 —— 锯齿太"电子"，纯噪音 + 滤波最有"轰"感
  fire()        {
    // 1) 点火 crack：极短宽带噪音（高低通，<25ms）—— 给前沿"砰"的清脆开端
    _noise({ dur: 0.025, peak: 0.45, lpf: 6000, lpfTo: 2500, attack: 0.0003 });
    // 2) 亚低频 kick：sine 100→25 Hz，0.35s 衰减 —— 主体"轰"
    _tone({ type: 'sine', freq: 100, sweepTo: 25, dur: 0.35, peak: 0.40, attack: 0.001 });
    // 3) 中频噪音轰鸣：低通从 2000 Hz 扫到 60 Hz，给"烟雾扩散"的体感
    _noise({ dur: 0.45, peak: 0.30, lpf: 2000, lpfTo: 60, attack: 0.002, delay: 0.005 });
    // 4) 中-低 sawtooth 加点"金属管腔"颗粒（短，不抢主体）
    _tone({ type: 'sawtooth', freq: 220, sweepTo: 50, dur: 0.16, peak: 0.26, attack: 0.001, delay: 0.005 });
  },
  // 连携开炮：双倍质量 —— 更深 + 更长尾 + 第二层 sub-bass 余震
  fireCombo()   {
    _noise({ dur: 0.030, peak: 0.50, lpf: 6500, lpfTo: 2200, attack: 0.0003 });
    _tone({ type: 'sine', freq: 90, sweepTo: 22, dur: 0.50, peak: 0.44, attack: 0.001 });
    _noise({ dur: 0.65, peak: 0.34, lpf: 2200, lpfTo: 50, attack: 0.002, delay: 0.005 });
    _tone({ type: 'sawtooth', freq: 200, sweepTo: 42, dur: 0.22, peak: 0.30, attack: 0.001, delay: 0.005 });
    // 余震：更深的二段 sub-bass
    _tone({ type: 'sine', freq: 70, sweepTo: 18, dur: 0.40, peak: 0.28, attack: 0.001, delay: 0.08 });
  },
  // 弹射（撞墙反弹）：清脆的"丁"金属弹球响 —— 再次加大音量 ~1.5× + 中低频体感层
  bounce()      {
    _noise({ dur: 0.020, peak: 0.60, lpf: 5500, attack: 0.0003 });
    _tone({ type: 'triangle', freq: 1980, sweepTo: 1320, dur: 0.14, peak: 0.54, attack: 0.0006 });
    _tone({ type: 'sine',     freq: 3960, dur: 0.10, peak: 0.30, attack: 0.0008 });
    // 加一层中低频 "thunk" 体感（660→330 Hz），让"丁"有"重量"
    _tone({ type: 'triangle', freq: 660,  sweepTo: 330, dur: 0.08, peak: 0.28, attack: 0.0008 });
  },
  // 射击：优先用 AK47 采样（截断到 180ms 避免连发 smear）；未加载时回退到程序化合成
  shotFire()    {
    if (playSample('shot', 1.0, 0.18)) return;
    // —— 回退：写实枪械开火 ——
    _noise({ dur: 0.012, peak: 0.70, lpf: 8000, attack: 0.0001 });
    _noise({ dur: 0.10,  peak: 0.55, lpf: 3500, lpfTo: 200, attack: 0.0003 });
    _tone({ type: 'sine', freq: 80, sweepTo: 30, dur: 0.12, peak: 0.40, attack: 0.0008 });
    _noise({ dur: 0.06,  peak: 0.30, lpf: 800, lpfTo: 150, attack: 0.0005, delay: 0.003 });
  },
  // 连携：同一份枪声采样、略微更响（1.18×）+ 同样截断。
  // 不再内部双击 —— 多波次时每波各自播放一次，听感才能与"波数"对应
  shotCombo()   {
    if (playSample('shot', 1.18, 0.18)) return;
    _noise({ dur: 0.015, peak: 0.80, lpf: 8000, attack: 0.0001 });
    _noise({ dur: 0.14,  peak: 0.60, lpf: 3500, lpfTo: 150, attack: 0.0003 });
    _tone({ type: 'sine', freq: 70, sweepTo: 25, dur: 0.16, peak: 0.45, attack: 0.0008 });
    _noise({ dur: 0.08,  peak: 0.32, lpf: 700, lpfTo: 120, attack: 0.0005, delay: 0.003 });
  },
  // 金球被击中：高频闪亮的硬币 chime（多层 sine + 短噪音 click）
  coinHit()     {
    _noise({ dur: 0.012, peak: 0.20, lpf: 6000, attack: 0.0003 });
    _tone({ type: 'sine', freq: 2640, dur: 0.18, peak: 0.26, attack: 0.001 });
    _tone({ type: 'sine', freq: 3520, dur: 0.20, peak: 0.20, attack: 0.001, delay: 0.005 });
    _tone({ type: 'sine', freq: 5280, dur: 0.10, peak: 0.10, attack: 0.001, delay: 0.012 });
  },
  // 商店选卡：莎啦啦的硬币串铃（多枚硬币散落 / 碰撞 —— 6 个错峰高频 ting）
  coinCascade() {
    const freqs = [2200, 2960, 3520, 2640, 4180, 3140];
    const peaks = [0.22, 0.20, 0.18, 0.16, 0.14, 0.12];
    const delays = [0, 0.04, 0.08, 0.12, 0.17, 0.22];
    for (let i = 0; i < freqs.length; i++) {
      _tone({ type: 'sine', freq: freqs[i], dur: 0.08, peak: peaks[i], attack: 0.0008, delay: delays[i] });
    }
    // 整体顶上的金属"洒落"噪音
    _noise({ dur: 0.25, peak: 0.12, lpf: 7000, lpfTo: 2000, attack: 0.0005 });
  },
  // 购买确认：饱满的"ka-ching" —— 厚实低频 + 明亮 bell
  purchase()    {
    // Bell 头部
    _noise({ dur: 0.012, peak: 0.22, lpf: 5500, attack: 0.0003 });
    _tone({ type: 'sine', freq: 1320, dur: 0.22, peak: 0.28, attack: 0.001 });
    _tone({ type: 'sine', freq: 1980, dur: 0.20, peak: 0.22, attack: 0.001, delay: 0.005 });
    // 加厚低频"重量感"
    _tone({ type: 'triangle', freq: 220, sweepTo: 110, dur: 0.20, peak: 0.30, attack: 0.001 });
    // 尾音 chime（"ching"）
    _tone({ type: 'sine', freq: 2640, dur: 0.30, peak: 0.20, attack: 0.001, delay: 0.06 });
    _tone({ type: 'sine', freq: 3520, dur: 0.25, peak: 0.14, attack: 0.001, delay: 0.10 });
  },
  // 奥术飞弹发射：优先用"魔法粒子咻一声"采样；未加载时回退到程序化合成
  arcaneSwoosh() {
    if (playSample('arcane', 0.9)) return;
    _tone({ type: 'sine', freq: 3520, sweepTo: 1100, dur: 0.18, peak: 0.20, attack: 0.001 });
    _tone({ type: 'triangle', freq: 1760, sweepTo: 660, dur: 0.16, peak: 0.14, attack: 0.001, delay: 0.005 });
    _noise({ dur: 0.16, peak: 0.10, bp: true, lpf: 3500, attack: 0.001 });
  },
  // 子弹摧毁（撞墙耗尽 / 寿命到期等）：再次大幅加大音量（~2.5×）+ 加宽频谱让"噗"穿透感更强
  bulletDestroy() {
    // 主体噪音：更高 peak + 略长，覆盖更宽频段
    _noise({ dur: 0.10, peak: 0.65, lpf: 2200, lpfTo: 200, attack: 0.0003 });
    // 中频 thump 主体（480→120 Hz）—— 给"撞击"实感
    _tone({ type: 'sine', freq: 480, sweepTo: 120, dur: 0.10, peak: 0.55, attack: 0.0008 });
    // 低频 body —— 增强"重量"
    _tone({ type: 'triangle', freq: 220, sweepTo: 70, dur: 0.12, peak: 0.42, attack: 0.0008, delay: 0.003 });
    // 第二层高频 click（更明显的 attack）
    _noise({ dur: 0.020, peak: 0.40, lpf: 4500, attack: 0.0001 });
  },
  // 回合结束 = 栓动步枪上膛 "喀-拉" ——"喀"(拉栓) + 滑轨 scrape + "拉"(推弹 lock-in) + 金属余震
  gunCock()     {
    // "喀" —— 拉栓：高频金属脆响 + 短噪音
    _noise({ dur: 0.022, peak: 0.42, bp: true, lpf: 4500, attack: 0.0002 });
    _tone({ type: 'triangle', freq: 2640, sweepTo: 1760, dur: 0.022, peak: 0.26, attack: 0.0005 });
    _tone({ type: 'square',   freq: 3300, dur: 0.014, peak: 0.14, attack: 0.0005 });
    // 滑轨 scrape：弹簧 / 弹壳被推动的中频噪音（在两声 click 之间）
    _noise({ dur: 0.08, peak: 0.14, bp: true, lpf: 2200, lpfTo: 1200, attack: 0.004, delay: 0.04 });
    // "拉" —— 推弹入膛：厚实 lock-in 声（更低 + 更长 + sawtooth 给金属顿挫）
    _noise({ dur: 0.030, peak: 0.46, bp: true, lpf: 3000, attack: 0.0002, delay: 0.16 });
    _tone({ type: 'triangle', freq: 1980, sweepTo: 1100, dur: 0.030, peak: 0.30, attack: 0.0005, delay: 0.16 });
    _tone({ type: 'sawtooth', freq: 900, sweepTo: 440, dur: 0.022, peak: 0.20, attack: 0.0005, delay: 0.16 });
    // 金属余震
    _tone({ type: 'sine', freq: 1400, dur: 0.10, peak: 0.10, delay: 0.18 });
    _tone({ type: 'sine', freq: 2640, dur: 0.06, peak: 0.06, delay: 0.18 });
  },
  // 召唤召唤物：闪亮上升 sine 扫频 + 高频 shimmer
  summonSpawn() {
    _tone({ type: 'sine', freq: 440, sweepTo: 1760, dur: 0.20, peak: 0.24, attack: 0.005 });
    _tone({ type: 'triangle', freq: 880, sweepTo: 2640, dur: 0.18, peak: 0.16, attack: 0.005, delay: 0.04 });
    _tone({ type: 'sine', freq: 3520, dur: 0.10, peak: 0.10, attack: 0.001, delay: 0.10 });
  },
  // 召唤物攻击：轻快"嗖"
  summonAttack() {
    _tone({ type: 'triangle', freq: 1320, sweepTo: 660, dur: 0.06, peak: 0.16, attack: 0.001 });
    _tone({ type: 'sine',     freq: 2640, sweepTo: 880, dur: 0.04, peak: 0.10, attack: 0.001, delay: 0.01 });
    _noise({ dur: 0.04, peak: 0.08, bp: true, lpf: 2200, attack: 0.001 });
  },
  // 召唤物死亡：法力碎裂 —— 高频 swept down + 噪音衰减
  summonDie()   {
    _tone({ type: 'triangle', freq: 1760, sweepTo: 220, dur: 0.22, peak: 0.22, attack: 0.001 });
    _noise({ dur: 0.18, peak: 0.18, lpf: 2400, lpfTo: 300, attack: 0.001 });
    _tone({ type: 'sine',     freq: 3520, dur: 0.06, peak: 0.10, delay: 0.01 });
  },
  // 命中：随伤害值变化。整体频率上移 —— 主体在中-高频，给"清脆透亮"的击中感
  //   amount=1 → 高频"叮"（1320→700 Hz）   amount~5 → 中-高频脆响   amount≥10 → 加一层 sub-bass 给"重感"
  hit(amount = 2) {
    const a = Math.max(1, amount | 0);
    const k = Math.min(1, Math.max(0, (a - 1) / 9));
    // 主体音：整体上移一个八度 ——
    const fStart = lerp(1320, 700, k);
    const fEnd   = lerp(620,  320, k);
    const dur    = lerp(0.07, 0.15, k);
    const peakA  = lerp(0.30, 0.42, k);
    _tone({ type: 'triangle', freq: fStart, sweepTo: fEnd, dur, peak: peakA, attack: 0.0006 });
    // 高频 click 噪音：保持高 lpf 给"脆"感
    _noise({
      dur:  lerp(0.022, 0.08, k),
      peak: lerp(0.20, 0.28, k),
      lpf:  lerp(4500, 2800, k),
      lpfTo: lerp(1500, 700, k),
      attack: 0.0003,
    });
    // 高伤额外加一层 sub-bass thump（≥6 伤明显，给"重击"的力道）
    if (k >= 0.5) {
      _tone({ type: 'sine', freq: 110, sweepTo: 45, dur: lerp(0.10, 0.25, k), peak: lerp(0.16, 0.30, k), attack: 0.001, delay: 0.003 });
    }
    // 极重击（≥10 伤）：低频长尾
    if (k >= 0.95) {
      _noise({ dur: 0.22, peak: 0.16, lpf: 500, lpfTo: 80, attack: 0.001, delay: 0.02 });
    }
  },
  // 怪物死亡："啵"—— 气泡爆破（低→高短促 sine sweep + 中频噪音 pop）
  enemyDie()    {
    _tone({ type: 'sine', freq: 80, sweepTo: 720, dur: 0.08, peak: 0.32, attack: 0.0008 });
    _noise({ dur: 0.05, peak: 0.18, bp: true, lpf: 1500, attack: 0.0005 });
    _tone({ type: 'sine', freq: 1100, dur: 0.05, peak: 0.12, delay: 0.05 });
  },
  bossDie()     {
    _noise({ dur: 0.55, peak: 0.36, lpf: 1800, lpfTo: 80 });
    _tone({ type: 'sawtooth', freq: 220, sweepTo: 55, dur: 0.55, peak: 0.22 });
    _tone({ type: 'triangle', freq: 110, sweepTo: 40, dur: 0.6, peak: 0.18, delay: 0.05 });
    _tone({ type: 'sine',     freq: 1320, sweepTo: 220, dur: 0.18, peak: 0.16, delay: 0.04 });
  },
  damage()      {
    _tone({ type: 'sawtooth', freq: 220, sweepTo: 80, dur: 0.16, peak: 0.28 });
    _noise({ dur: 0.10, peak: 0.18, lpf: 1200, lpfTo: 200 });
  },
  armorBlock()  {
    _tone({ type: 'triangle', freq: 1320, sweepTo: 990, dur: 0.08, peak: 0.18 });
    _tone({ type: 'sine',     freq: 2640, dur: 0.05, peak: 0.10 });
  },
  discard()     {
    _tone({ type: 'triangle', freq: 660, sweepTo: 990, dur: 0.08, peak: 0.16 });
    _tone({ type: 'sine',     freq: 1320, dur: 0.05, peak: 0.10, delay: 0.02 });
  },
  shuffleIn()   {
    _tone({ type: 'triangle', freq: 660,  dur: 0.05, peak: 0.14 });
    _tone({ type: 'triangle', freq: 990,  dur: 0.05, peak: 0.14, delay: 0.04 });
    _tone({ type: 'sine',     freq: 1760, dur: 0.05, peak: 0.10, delay: 0.06 });
  },
  gold()        {
    _tone({ type: 'sine', freq: 1320, dur: 0.06, peak: 0.18 });
    _tone({ type: 'sine', freq: 1980, dur: 0.10, peak: 0.18, delay: 0.04 });
    _tone({ type: 'sine', freq: 2640, dur: 0.06, peak: 0.10, delay: 0.06 });
  },
  levelUp()     {
    _tone({ type: 'triangle', freq: 523,  dur: 0.10, peak: 0.22 });
    _tone({ type: 'triangle', freq: 659,  dur: 0.10, peak: 0.22, delay: 0.09 });
    _tone({ type: 'triangle', freq: 784,  dur: 0.10, peak: 0.22, delay: 0.18 });
    _tone({ type: 'sine',     freq: 1568, dur: 0.18, peak: 0.18, delay: 0.20 });
  },
  // 关卡通关：更长 / 更明显的胜利号角（音阶上升 + 尾音长 + 双音叠加）
  stageClear()  {
    // 上升音阶 C-E-G-C (523-659-784-1047)
    _tone({ type: 'triangle', freq: 523,  dur: 0.12, peak: 0.30 });
    _tone({ type: 'sine',     freq: 1047, dur: 0.10, peak: 0.18 });
    _tone({ type: 'triangle', freq: 659,  dur: 0.12, peak: 0.30, delay: 0.10 });
    _tone({ type: 'sine',     freq: 1318, dur: 0.10, peak: 0.18, delay: 0.10 });
    _tone({ type: 'triangle', freq: 784,  dur: 0.12, peak: 0.30, delay: 0.20 });
    _tone({ type: 'sine',     freq: 1568, dur: 0.10, peak: 0.18, delay: 0.20 });
    // 最后一拍：长 chord（高 C + 高八度），最厚最响
    _tone({ type: 'triangle', freq: 1047, dur: 0.55, peak: 0.34, delay: 0.30 });
    _tone({ type: 'triangle', freq: 1568, dur: 0.55, peak: 0.26, delay: 0.30 });
    _tone({ type: 'sine',     freq: 2093, dur: 0.55, peak: 0.20, delay: 0.30 });
    // 闪耀 shimmer
    _tone({ type: 'sine', freq: 3136, dur: 0.30, peak: 0.10, delay: 0.34 });
    _tone({ type: 'sine', freq: 4186, dur: 0.20, peak: 0.08, delay: 0.40 });
  },
  // 进入商店：温暖的店铃 chime（中高频 sine 三连音 + bell shimmer）
  shopEnter()   {
    _tone({ type: 'sine', freq: 1318, dur: 0.10, peak: 0.30, attack: 0.001 });
    _tone({ type: 'sine', freq: 1976, dur: 0.18, peak: 0.26, attack: 0.001, delay: 0.06 });
    _tone({ type: 'sine', freq: 2637, dur: 0.12, peak: 0.18, attack: 0.001, delay: 0.13 });
    _tone({ type: 'sine', freq: 3951, dur: 0.18, peak: 0.10, attack: 0.001, delay: 0.18 });
  },
  // 进入奖励关卡：明亮上升 arpeggio "★" —— C 大调三和弦 + 八度尾音 + shimmer 闪耀
  rewardEnter() {
    _tone({ type: 'triangle', freq: 523,  dur: 0.10, peak: 0.30 });
    _tone({ type: 'triangle', freq: 659,  dur: 0.10, peak: 0.30, delay: 0.08 });
    _tone({ type: 'triangle', freq: 784,  dur: 0.10, peak: 0.30, delay: 0.16 });
    _tone({ type: 'triangle', freq: 1047, dur: 0.20, peak: 0.34, delay: 0.24 });
    _tone({ type: 'sine',     freq: 2093, dur: 0.16, peak: 0.18, delay: 0.26 });
    _noise({ dur: 0.10, peak: 0.10, bp: true, lpf: 5000, attack: 0.002, delay: 0.28 });
  },
  // 关卡开始：开场战号 —— 战鼓 + 进军号 "ta-ta-TAAA"（G–C–G 升音）
  stageStart()  {
    // 战鼓: 亚低频砸击 + 噪音
    _tone({ type: 'sine', freq: 70, sweepTo: 28, dur: 0.45, peak: 0.36, attack: 0.001 });
    _noise({ dur: 0.12, peak: 0.18, lpf: 600, lpfTo: 120, attack: 0.002 });
    // 战号 "ta": 短 G 音
    _tone({ type: 'sawtooth', freq: 392, dur: 0.13, peak: 0.24, attack: 0.005, delay: 0.22 });
    _tone({ type: 'triangle', freq: 392, dur: 0.13, peak: 0.20, attack: 0.005, delay: 0.22 });
    // 战号 "ta": 短 C 音
    _tone({ type: 'sawtooth', freq: 523, dur: 0.13, peak: 0.26, attack: 0.005, delay: 0.36 });
    _tone({ type: 'triangle', freq: 523, dur: 0.13, peak: 0.22, attack: 0.005, delay: 0.36 });
    // 战号 "TAAA": 长 G 高音（铜管厚实感）
    _tone({ type: 'sawtooth', freq: 784, dur: 0.45, peak: 0.32, attack: 0.005, delay: 0.50 });
    _tone({ type: 'triangle', freq: 784, dur: 0.45, peak: 0.24, attack: 0.005, delay: 0.50 });
    _tone({ type: 'sine',     freq: 1568, dur: 0.35, peak: 0.16, delay: 0.52 });
  },
  death()       {
    _tone({ type: 'sawtooth', freq: 220, sweepTo: 55, dur: 0.50, peak: 0.30 });
    _tone({ type: 'sawtooth', freq: 165, sweepTo: 40, dur: 0.65, peak: 0.24, delay: 0.10 });
    _noise({ dur: 0.6, peak: 0.18, lpf: 600, lpfTo: 80 });
  },
  turnPlayer()  {
    _tone({ type: 'sine',     freq: 880,  dur: 0.06, peak: 0.14 });
    _tone({ type: 'triangle', freq: 1320, dur: 0.06, peak: 0.10, delay: 0.04 });
  },
  turnEnemy()   {
    _tone({ type: 'sine',     freq: 440, dur: 0.08, peak: 0.14 });
    _tone({ type: 'triangle', freq: 330, dur: 0.08, peak: 0.10, delay: 0.04 });
  },
  comboStack()  {
    _tone({ type: 'triangle', freq: 1320, dur: 0.04, peak: 0.16 });
    _tone({ type: 'sine',     freq: 1980, dur: 0.05, peak: 0.16, delay: 0.03 });
    _tone({ type: 'sine',     freq: 2640, dur: 0.04, peak: 0.12, delay: 0.06 });
  },
  cannonPick()  {
    _tone({ type: 'triangle', freq: 660, sweepTo: 990, dur: 0.10, peak: 0.20 });
    _tone({ type: 'sine',     freq: 1320, sweepTo: 1760, dur: 0.14, peak: 0.16, delay: 0.06 });
  },
  noMana()      {
    _tone({ type: 'triangle', freq: 260, sweepTo: 180, dur: 0.10, peak: 0.18 });
    _tone({ type: 'sine',     freq: 520, sweepTo: 360, dur: 0.10, peak: 0.10, delay: 0.02 });
  },
  uiClick()     {
    _tone({ type: 'triangle', freq: 1320, sweepTo: 1760, dur: 0.04, peak: 0.14 });
    _tone({ type: 'sine',     freq: 2640, dur: 0.03, peak: 0.08 });
  },
  uiOpen()      {
    _tone({ type: 'triangle', freq: 660,  dur: 0.06, peak: 0.16 });
    _tone({ type: 'triangle', freq: 990,  dur: 0.06, peak: 0.16, delay: 0.05 });
    _tone({ type: 'sine',     freq: 1760, dur: 0.05, peak: 0.10, delay: 0.06 });
  },
  uiClose()     {
    _tone({ type: 'triangle', freq: 990,  dur: 0.06, peak: 0.16 });
    _tone({ type: 'triangle', freq: 660,  dur: 0.06, peak: 0.16, delay: 0.05 });
    _tone({ type: 'sine',     freq: 1320, dur: 0.05, peak: 0.08, delay: 0.04 });
  },
  // 卡牌悬浮：非常轻的 tick，避免持续滑过卡时刺耳
  cardHover()   {
    _tone({ type: 'sine', freq: 1760, dur: 0.03, peak: 0.08, attack: 0.001 });
  },
  // 卡牌选择 / 点击：双音脆响
  cardSelect()  {
    _tone({ type: 'triangle', freq: 880,  dur: 0.05, peak: 0.16 });
    _tone({ type: 'sine',     freq: 1760, dur: 0.06, peak: 0.14, delay: 0.03 });
    _tone({ type: 'sine',     freq: 2640, dur: 0.04, peak: 0.10, delay: 0.05 });
  },
};

// 玩家可触发的播放入口（带节流）。第三参 arg 透传给 voice 函数（如 hit 按伤害值变化）
function playSfx(name, throttleMs, arg) {
  const fn = SfxFx[name];
  if (!fn) return;
  if (throttleMs && !_throttle(name, throttleMs)) return;
  try { fn(arg); } catch (e) {}
}

// ─── BGM（程序化生成的背景音乐）────────────────────────────────────
// 100 BPM 的 4 小节循环：A 小调 → A 小调 → F → G 进行，含 bass + lead + kick + hi-hat
// 用 WebAudio API（OscillatorNode / BufferSource / BiquadFilter / GainNode）程序生成
const BGM = {
  ctx: null,
  master: 0.35,
  muted: false,
  enabled: true,            // 默认开（玩家可在设置中关）
  track: 'combat',          // 当前曲目：combat / shop / reward
  _gainNode: null,
  _started: false,
  _scheduledUntil: 0,
  _loopTimer: null,
};
function setBgmTrack(name) {
  if (!BGM_TRACKS[name] || BGM.track === name) return;
  BGM.track = name;
  // 下一次 loop 调度时会自动取新 track 的 pattern（无需重启）
}
try {
  const m = localStorage.getItem('cs_bgm_master');
  if (m != null) BGM.master = clamp(parseFloat(m) || 0.35, 0, 1);
  const e = localStorage.getItem('cs_bgm_enabled');
  if (e != null) BGM.enabled = e === '1';
} catch (e) {}

function _bgmTone(when, freq, dur, type, peakGain, lpf) {
  const ctx = BGM.ctx;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(peakGain, when + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, when);
  let last = osc;
  if (lpf) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(lpf, when);
    last.connect(f); last = f;
  }
  last.connect(g);
  g.connect(BGM._gainNode);
  osc.start(when);
  osc.stop(when + dur + 0.02);
}
function _bgmKick(when) {
  const ctx = BGM.ctx;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(0.50, when + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, when);
  osc.frequency.exponentialRampToValueAtTime(40, when + 0.18);
  osc.connect(g); g.connect(BGM._gainNode);
  osc.start(when);
  osc.stop(when + 0.20);
}
function _bgmHat(when, peakGain) {
  const ctx = BGM.ctx;
  const sr = ctx.sampleRate;
  const buf = ctx.createBuffer(1, Math.max(1, Math.floor(sr * 0.05)), sr);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.setValueAtTime(7000, when);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(peakGain, when + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.045);
  src.connect(f); f.connect(g); g.connect(BGM._gainNode);
  src.start(when);
  src.stop(when + 0.06);
}

// BGM 曲目库：combat（战斗）/ shop（商店）/ reward（奖励关卡）
//   每首曲目 = { bpm, bassFreqs[4 bars], bassType, bassLpf, lead[4 bars × 16 notes], drums(bool), pad(bool) }
const BGM_TRACKS = {
  combat: {
    bpm: 100,
    bassFreqs: [110, 110, 87.31, 98],    // Am Am F G (小调暗潮)
    bassType: 'sawtooth', bassLpf: 700,
    drums: true,        // 鼓点（受 intensity 调控）
    pad: false,
    lead: [
      [440, 0, 523, 0, 440, 0, 392, 440, 523, 0, 659, 523, 440, 0, 392, 523],
      [440, 0, 523, 0, 440, 0, 392, 440, 659, 0, 523, 440, 392, 0, 440, 523],
      [349, 0, 440, 0, 349, 0, 523, 440, 698, 0, 523, 440, 349, 0, 392, 440],
      [392, 0, 523, 0, 392, 0, 440, 523, 659, 0, 523, 440, 392, 0, 440, 523],
    ],
  },
  shop: {
    bpm: 72,
    bassFreqs: [130.81, 196, 174.61, 196],   // C3 G3 F3 G3 (C 大调舒缓 + 长尾)
    bassType: 'sine', bassLpf: 500,
    drums: false,
    pad: true,          // 持续 pad 给"商店"的氛围
    // 长 quarter / half 音符旋律 (大调，悠扬)
    lead: [
      [523, 0, 0, 0, 659, 0, 0, 0, 783, 0, 0, 0, 659, 0, 0, 0],
      [659, 0, 0, 0, 587, 0, 0, 0, 523, 0, 0, 0, 392, 0, 0, 0],
      [698, 0, 0, 0, 587, 0, 0, 0, 523, 0, 0, 0, 392, 0, 0, 0],
      [392, 0, 523, 0, 587, 0, 659, 0, 783, 0, 659, 0, 523, 0, 0, 0],
    ],
  },
  reward: {
    bpm: 124,
    bassFreqs: [261.63, 196, 261.63, 196],   // C3 G2 (跳跃感)
    bassType: 'square', bassLpf: 1100,
    drums: true,        // 节奏感强
    pad: false,
    // C 大调五声音阶上下，跳跃 / 庆祝感
    lead: [
      [523, 659, 783, 1047, 783, 659, 523, 659, 523, 659, 783, 1047, 783, 659, 523, 0],
      [392, 523, 659, 783, 659, 523, 392, 523, 392, 523, 659, 783, 659, 523, 392, 0],
      [523, 659, 783, 1047, 1318, 1047, 783, 659, 523, 659, 783, 1047, 1318, 1047, 783, 659],
      [392, 523, 659, 523, 392, 523, 659, 783, 1047, 783, 659, 523, 659, 783, 659, 523],
    ],
  },
};

// 战斗 intensity：根据场上活敌人数 → 0..1（决定鼓点 / hat / lead 密度）
function _bgmCombatIntensity() {
  const g = window.__game;
  if (!g || !g.enemies) return 0.3;
  const live = g.enemies.filter(e => e && e.alive && !e._isReward).length;
  return clamp(live / 6, 0, 1);     // 6+ 敌人 = 满强度
}

// 调度一次 4 小节循环（用 BGM.track 当前指定的曲目）
function _bgmScheduleLoop(t0) {
  const track = BGM_TRACKS[BGM.track] || BGM_TRACKS.combat;
  const beat = 60 / track.bpm;
  const bar = beat * 4;
  const isCombat = BGM.track === 'combat';
  // 战斗强度（0..1）只在战斗曲生效；其它曲目固定
  const intensity = isCombat ? _bgmCombatIntensity() : 1.0;
  for (let b = 0; b < 4; b++) {
    const bs = t0 + b * bar;
    // bass：beat 1 + beat 3
    _bgmTone(bs + 0 * beat, track.bassFreqs[b], beat * 0.5, track.bassType, 0.28, track.bassLpf);
    _bgmTone(bs + 2 * beat, track.bassFreqs[b], beat * 0.5, track.bassType, 0.28, track.bassLpf);
    // Pad（仅商店曲）：每小节 1 个长低 triangle，给"漂浮"感
    if (track.pad) {
      _bgmTone(bs, track.bassFreqs[b] * 2, bar * 0.95, 'triangle', 0.10, 600);
    }
    // 鼓点：战斗按 intensity 调控；reward 固定满拍
    if (track.drums) {
      if (isCombat) {
        // intensity > 0.3 → beat 1 kick；> 0.6 → 1 + 3；> 0.85 → 加入 backbeat 2 + 4
        if (intensity > 0.3) _bgmKick(bs + 0 * beat);
        if (intensity > 0.6) _bgmKick(bs + 2 * beat);
        if (intensity > 0.85) {
          _bgmKick(bs + 1 * beat);
          _bgmKick(bs + 3 * beat);
        }
        // hat 密度：低强度 0/拍，高强度 2/拍（8 分）
        const hatPerBeat = intensity < 0.2 ? 0 : (intensity < 0.6 ? 1 : 2);
        if (hatPerBeat > 0) {
          for (let i = 0; i < 4 * hatPerBeat; i++) {
            _bgmHat(bs + i * beat / hatPerBeat, i % 2 === 0 ? 0.04 : 0.06);
          }
        }
      } else {
        // reward：固定鼓点 1+3 + 满拍 hat
        _bgmKick(bs + 0 * beat);
        _bgmKick(bs + 2 * beat);
        for (let i = 0; i < 8; i++) {
          _bgmHat(bs + i * beat / 2, i % 2 === 0 ? 0.05 : 0.08);
        }
      }
    }
    // lead 16 分音符
    for (let i = 0; i < 16; i++) {
      const f = track.lead[b][i];
      if (f > 0) {
        // 战斗高强度时 lead peak 略高（更急促）；低强度时压低音量
        const leadPeak = isCombat ? lerp(0.10, 0.18, intensity) : 0.16;
        const leadDur = isCombat ? lerp(beat * 0.45, beat * 0.30, intensity) : beat * 0.40;
        _bgmTone(bs + i * beat / 4, f, leadDur, 'triangle', leadPeak, 0);
      }
    }
  }
  return t0 + 4 * bar;
}
function _bgmScheduler() {
  if (!BGM._started) return;
  const ctx = BGM.ctx;
  // 提前 1.5s 排程 → 减少 timer 抖动
  while (BGM._scheduledUntil < ctx.currentTime + 1.5) {
    BGM._scheduledUntil = _bgmScheduleLoop(Math.max(BGM._scheduledUntil, ctx.currentTime + 0.05));
  }
  BGM._loopTimer = setTimeout(_bgmScheduler, 400);
}
function startBgm() {
  if (BGM._started) return;
  const ctx = _ensureSfx();
  if (!ctx) return;
  BGM.ctx = ctx;
  BGM._gainNode = ctx.createGain();
  BGM._gainNode.gain.setValueAtTime(BGM.muted ? 0 : BGM.master, ctx.currentTime);
  BGM._gainNode.connect(ctx.destination);
  BGM._started = true;
  BGM._scheduledUntil = ctx.currentTime + 0.1;
  _bgmScheduler();
}
function stopBgm() {
  if (!BGM._started) return;
  BGM._started = false;
  if (BGM._loopTimer) { clearTimeout(BGM._loopTimer); BGM._loopTimer = null; }
  if (BGM._gainNode) {
    try { BGM._gainNode.gain.cancelScheduledValues(BGM.ctx.currentTime); } catch (e) {}
    try {
      BGM._gainNode.gain.setTargetAtTime(0, BGM.ctx.currentTime, 0.05);
    } catch (e) {}
    const node = BGM._gainNode;
    setTimeout(() => { try { node.disconnect(); } catch (e) {} }, 300);
    BGM._gainNode = null;
  }
}
function setBgmEnabled(b) {
  BGM.enabled = !!b;
  try { localStorage.setItem('cs_bgm_enabled', BGM.enabled ? '1' : '0'); } catch (e) {}
  if (BGM.enabled) startBgm();
  else stopBgm();
  Events.emit('bgmChanged');
}
function setBgmMaster(v) {
  BGM.master = clamp(v, 0, 1);
  try { localStorage.setItem('cs_bgm_master', String(BGM.master)); } catch (e) {}
  if (BGM._gainNode && !BGM.muted) {
    BGM._gainNode.gain.setTargetAtTime(BGM.master, BGM.ctx.currentTime, 0.03);
  }
  Events.emit('bgmChanged');
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
    ms_hp: '血量', ms_armor: '护甲', ms_mana: '法力', ms_chain: '连携', ms_combo: '连击',
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
    loot_hint_pick: '选择 1 张商店卡牌',
    loot_hint_done: '已替换。可继续调整背包或点击继续游戏',
    loot_hint_selected: '选择 1 张背包卡以替换',
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
    slot_locked_replace: '该槽位已锁定，先解锁再替换',
    slot_main_no_remove: '主卡不可剔除',
    slot_min_keep: '至少保留 1 张非主卡',
    slot_locked_remove: '该卡已锁定，先解锁再剔除',
    slot_remove_confirm: '再点 ✕ 确认剔除',
    slot_remove_confirm_cost: '再点 ✕ 确认剔除（消耗 💰{n}）',
    slot_remove_need_gold: '剔除需要 💰{n}',
    slot_removed_toast: '已剔除「{name}」（本局不再出现）',
    slot_removed_toast_paid: '已剔除「{name}」(消耗 💰{n}，本局不再出现)',
    slot_lock_tip: '点击锁定（防被替换 / 剔除）',
    slot_unlock_tip: '已锁定，点击解锁',
    slot_remove_tip: '剔除该卡（本局不再出现 · 收费递增）',
    shop_lock_tip: '锁定此候选（刷新时保留）',
    shop_unlock_tip: '已锁定，点击解锁',
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
    settings_title: '设置',
    settings_lang: '语言',
    settings_volume: '音量',
    settings_mute: '静音',
    settings_bgm: '背景音乐',
    settings_bgm_on: '启用背景音乐',
    settings_btn_tip: '设置',
    free_label: '免费',
    perm_damage: '伤害 +1',
    perm_pierce: '穿透 +1',
    perm_bound: '弹射 +1',
    perm_speed: '速度 +50',
    perm_bought_toast: '✨ {label} → 已买 ×{n}',
    settings_close_aria: '关闭',
    startup_pick_hint: '新手开局 · 选 1 张「{tier}」卡（免费）',
    // 开始界面
    start_title: '卡牌射击',
    start_sub: 'Card Shooter · Web Replica',
    start_play: '▶ 开始游戏',
    start_tutorial: '🎓 新手教程',
    start_settings: '⚙ 设置',
    // 教程
    tutorial_skip: '跳过教程',
    tutorial_next: '下一步 →',
    tutorial_ack: '知道了',
    tutorial_await: '⏳ 完成操作以继续',
    tutorial_progress: '{cur}/{max}',
    tutorial_end_title: '教程完成！',
    tutorial_end_sub: '你已掌握基础玩法 · 祝你好运！',
    tutorial_end_start: '▶ 开始游戏',
    tutorial_end_replay: '🔁 重放教程',
    tut_s1_title: '欢迎来到卡牌射击',
    tut_s1_text: '这是一款卡牌 + 弹幕 + 回合制 roguelike。<br>本教程将用几分钟教会你核心玩法。<br>点击 <b>下一步</b> 开始。',
    tut_s2_title: '① 发射左卡',
    tut_s2_text: '鼠标瞄准敌人，按 <kbd>鼠标左键</kbd> 发射手牌中<b>最左侧</b>的卡。<br>每张卡都消耗法力（右下角）。',
    tut_s3_title: '② 发射右卡',
    tut_s3_text: '按 <kbd>鼠标右键</kbd> 发射手牌中<b>最右侧</b>的卡。<br>继续打击敌人。',
    tut_s4_title: '③ 击杀敌人',
    tut_s4_text: '继续发射直到把这个哥布林打死。<br>子弹打到敌人会扣 HP，杀死会掉金币。',
    tut_s5_title: '④ 主卡',
    tut_s5_text: '中间这张是 <b>主卡</b>。<br>每次发射时，主卡也会同时出 — 等于 "左+主" 或 "右+主" 一起发射。<br>主卡的攻击与效果会与侧卡叠加，<b>费用相加</b>。',
    tut_s9_title: '⑤ 回合机制',
    tut_s9_text: '当你想结束本回合时，按 <kbd>空格</kbd>。<br>敌人开始行动，下回合开始法力 <b>回满</b>，护甲也会重置。<br>提前结束时，<b>剩余法力会储存起来</b>，累计 <b>每 10 点 → 1 金币</b>。<br>试试按一下空格。',
    tut_s6_title: '⑥ 打开背包',
    tut_s6_text: '战斗中点 <kbd>🎒 背包</kbd> 按钮，可以打开背包整理面板。<br>消耗 10 法力。<br>试试现在打开背包。',
    tut_s6b_title: '⑦ 设置主卡',
    tut_s6b_text: '在背包里 <b>右键</b> 任意非主卡，可以把它设为主卡（主卡每次发射都会触发）。<br>同名同稀有度卡放入背包会 <b>自动合成升星</b>（铜→银→金→钻）。<br>试试右键任意一张卡。',
    tut_s6c_title: '⑧ 关闭背包',
    tut_s6c_text: '点击下方 <kbd>关闭</kbd> 按钮关闭背包（关闭时自动重新洗牌）。<br>整理完成后试试关闭背包。',
    tut_s7_title: '⑨ 弃牌',
    tut_s7_text: '不想要某张牌时，可以 <kbd>滚轮↑</kbd> 弃左 / <kbd>滚轮↓</kbd> 弃右。<br>每次弃牌 <b>消耗 1 点法力</b>，且部分卡有"弃置"效果（弃置时触发）。<br>试试用滚轮弃一张牌。',
    tut_s8_title: '⑩ 连击',
    tut_s8_text: '连续从同一侧发射，会累计 <b>连击</b> 数（右下角显示）。<br>部分卡的效果会随连击数增强。<br>换侧或弃牌会重置连击。',
    // 上一操作卡堆
    action_modal_title: '上一操作 · 触发的卡牌',
    action_modal_close: '关闭',
    action_modal_empty: '尚无操作',
    action_kind_use: '使用',
    action_kind_discard: '弃置',
    action_kind_discover: '发现',
    action_kind_shuffle: '洗入',
    tut_s10_title: '⑪ 商店与合成',
    tut_s10_text: '击败一波怪后会进入 <b>商店</b>：<br>· 用金币购买新卡或刷新候选<br>· 升级商店可提高高稀有度卡的概率<br>· 同名同稀有度卡放入背包会 <b>自动合成升星</b><br>慢慢打造属于你的卡组吧！',
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
    loot_hint_pick: 'Pick 1 shop card',
    loot_hint_done: 'Replaced. Keep editing your bag or hit Continue.',
    loot_hint_selected: 'Pick 1 bag card to swap',
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
    slot_locked_replace: 'Slot is locked — unlock before replacing',
    slot_main_no_remove: "Main card can't be removed",
    slot_min_keep: 'Keep at least 1 non-main card',
    slot_locked_remove: 'Card is locked — unlock before removing',
    slot_remove_confirm: 'Click ✕ again to confirm',
    slot_remove_confirm_cost: 'Click ✕ again to confirm (costs 💰{n})',
    slot_remove_need_gold: 'Removal needs 💰{n}',
    slot_removed_toast: 'Removed "{name}" (gone for this run)',
    slot_removed_toast_paid: 'Removed "{name}" (spent 💰{n}, gone for this run)',
    slot_lock_tip: 'Click to lock (prevents replace / remove)',
    slot_unlock_tip: 'Locked — click to unlock',
    slot_remove_tip: 'Remove this card (gone for this run · cost doubles each use)',
    shop_lock_tip: 'Lock this candidate (kept on refresh)',
    shop_unlock_tip: 'Locked — click to unlock',
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
    settings_title: 'Settings',
    settings_lang: 'Language',
    settings_volume: 'Volume',
    settings_mute: 'Mute',
    settings_bgm: 'Music',
    settings_bgm_on: 'Enable Music',
    settings_btn_tip: 'Settings',
    free_label: 'FREE',
    perm_damage: 'Damage +1',
    perm_pierce: 'Pierce +1',
    perm_bound: 'Bounce +1',
    perm_speed: 'Speed +50',
    perm_bought_toast: '✨ {label} → bought ×{n}',
    settings_close_aria: 'Close',
    startup_pick_hint: 'Starter pick · Choose 1 "{tier}" card (free)',
    // Start screen
    start_title: 'Card Shooter',
    start_sub: 'Card Shooter · Web Replica',
    start_play: '▶ Start Game',
    start_tutorial: '🎓 Tutorial',
    start_settings: '⚙ Settings',
    // Tutorial
    tutorial_skip: 'Skip Tutorial',
    tutorial_next: 'Next →',
    tutorial_ack: 'Got it',
    tutorial_await: '⏳ Complete the action to continue',
    tutorial_progress: '{cur}/{max}',
    tutorial_end_title: 'Tutorial Complete!',
    tutorial_end_sub: 'You\'ve learned the basics. Good luck!',
    tutorial_end_start: '▶ Start Game',
    tutorial_end_replay: '🔁 Replay Tutorial',
    tut_s1_title: 'Welcome to Card Shooter',
    tut_s1_text: 'A card + bullet-hell + turn-based roguelike.<br>This tutorial will teach you the core mechanics in a few minutes.<br>Click <b>Next</b> to begin.',
    tut_s2_title: '① Fire Left Card',
    tut_s2_text: 'Aim with the mouse and press <kbd>Left Mouse</kbd> to fire the <b>leftmost</b> card in your hand.<br>Each card costs mana (bottom-right).',
    tut_s3_title: '② Fire Right Card',
    tut_s3_text: 'Press <kbd>Right Mouse</kbd> to fire the <b>rightmost</b> card.<br>Keep firing at the enemy.',
    tut_s4_title: '③ Kill the Enemy',
    tut_s4_text: 'Keep firing until you kill this Goblin.<br>Bullets reduce its HP. Kills drop gold.',
    tut_s5_title: '④ Main Card',
    tut_s5_text: 'The card in the middle is your <b>Main Card</b>.<br>Every shot fires the Main Card alongside the side card — i.e. "Left+Main" or "Right+Main" together.<br>Their attack and effects stack, and <b>costs add up</b>.',
    tut_s9_title: '⑤ Turn System',
    tut_s9_text: 'When you\'re done with your turn, press <kbd>Space</kbd>.<br>Enemies act, then your next turn starts with <b>full mana</b> and armor restored.<br>Ending early <b>banks leftover mana</b>: every <b>10 mana → 1 gold</b>.<br>Try pressing Space.',
    tut_s6_title: '⑥ Open Inventory',
    tut_s6_text: 'During battle, click the <kbd>🎒 Bag</kbd> button to open the Inventory panel (costs 10 mana).<br>Try opening it now.',
    tut_s6b_title: '⑦ Set Main Card',
    tut_s6b_text: 'In the inventory, <b>right-click</b> any non-main card to set it as Main (Main Card fires on every shot).<br>Duplicate cards (same name + rarity) <b>auto-merge & upgrade</b> (Bronze→Silver→Gold→Diamond).<br>Try right-clicking any card.',
    tut_s6c_title: '⑧ Close Inventory',
    tut_s6c_text: 'Click the <kbd>Close</kbd> button below to close the inventory (reshuffles automatically).<br>When done organizing, close the bag.',
    tut_s7_title: '⑨ Discard',
    tut_s7_text: 'If you want to skip a card, use <kbd>Wheel↑</kbd> to discard left / <kbd>Wheel↓</kbd> to discard right.<br>Each discard <b>costs 1 mana</b>, and some cards have "On Discard" effects (triggered when discarded).<br>Try discarding a card with the wheel.',
    tut_s8_title: '⑩ Combo',
    tut_s8_text: 'Firing the same side multiple times in a row builds <b>Combo</b> (bottom-right counter).<br>Some cards scale with combo count.<br>Switching sides or discarding resets the combo.',
    // Last-action pile
    action_modal_title: 'Last Action · Cards Triggered',
    action_modal_close: 'Close',
    action_modal_empty: 'No action yet',
    action_kind_use: 'Used',
    action_kind_discard: 'Discarded',
    action_kind_discover: 'Discovered',
    action_kind_shuffle: 'Shuffled in',
    tut_s10_title: '⑪ Shop & Merging',
    tut_s10_text: 'After clearing a wave, you enter the <b>Shop</b>:<br>· Spend gold to buy new cards or reroll.<br>· Upgrade the shop level to raise rare-card odds.<br>· Putting duplicate cards (same name + rarity) into your bag <b>auto-merges and upgrades</b> them.<br>Build your deck and have fun!',
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
    { word: '展露',  cls: 'reveal',  title: '展露',  desc: '当卡牌为正面时，持续触发的光环效果。' },
    { word: '发现',  cls: 'discover', title: '发现',  desc: '从 3 张候选中选 1 张。' },
    { word: '临时',  cls: 'temporary', title: '临时', desc: '在使用或者弃置后移除。' },
    { word: '连击',  cls: 'combo',   title: '连击',  desc: '连续使用同侧卡牌累计连击数。' },
    { word: '连携',  cls: 'combo',   title: '连携',  desc: '同时使用两侧卡牌。' },
    { word: '洗入',  cls: 'shuffle', title: '洗入',  desc: '将卡牌插入手牌的随机位置。' },
    { word: '弃置',  cls: 'discard', title: '弃置',  desc: '把卡牌移入弃牌堆。' },
    { word: '实体化', cls: 'entity', title: '实体化', desc: '子弹结束时转化为实体。受伤或者结束回合会减少实体化层数。' },
    { word: '弹射',  cls: 'bounce',  title: '弹射',  desc: '可以从墙壁上反弹。' },
    { word: '穿透',  cls: 'bounce',  title: '穿透',  desc: '可以穿透敌人。' },
    { word: '命中',  cls: 'other',   title: '命中',  desc: '使用碰撞或者攻击尝试伤害敌人时触发。' },
    { word: '碰撞',  cls: 'other',   title: '碰撞',  desc: '接触敌人或者墙壁时触发。' },
    { word: '护盾',  cls: 'summon',  title: '护盾',  desc: '吸收 1 次伤害。' },
    { word: '护甲',  cls: 'armor',   title: '护甲',  desc: '按数值抵挡伤害。玩家回合开始时重置。' },
    { word: '追踪',  cls: 'other',   title: '追踪',  desc: '子弹自动转向追踪最近的敌人。' },
    { word: '法力',  cls: 'other',   title: '法力',  desc: '每回合自动回复。' },
    { word: '奥弹',  cls: 'arcane',  title: '奥弹',  desc: '奥弹牌会在展露时自动触发，发射 1 枚奥弹。' },
    { word: '燃烧',  cls: 'fire',    title: '燃烧',  desc: '回合开始前受 (燃烧层数) 伤害，然后层数 -1。' },
    { word: '冻结',  cls: 'freeze',  title: '冻结',  desc: '跳过下个回合。' },
    { word: '数量',  cls: 'bullet',  title: '数量',  desc: '影响主炮发射子弹的数量。' },
    { word: '波次',  cls: 'bullet',  title: '波次',  desc: '影响主炮发射子弹的波次。' },
    { word: '骷髅',  cls: 'summon',  title: '骷髅',  desc: '特殊召唤物，回合结束时冲撞最近的敌人。' },
    { word: '替换',  cls: 'shuffle', title: '替换',  desc: '在对战中使用另一张卡牌代替它，对战后换回。' },
  ],
  en: [
    { word: 'Reveal',    cls: 'reveal',  title: 'Reveal',    desc: 'An aura effect that continuously triggers while the card is face-up.' },
    { word: 'Discover',  cls: 'discover', title: 'Discover',  desc: 'Pick 1 of 3 candidates.' },
    { word: 'Temporary', cls: 'temporary', title: 'Temporary', desc: 'Removed from the deck after use or discard.' },
    { word: 'Combo',     cls: 'combo',   title: 'Combo',     desc: 'Use cards on the same side in a row to build Combo.' },
    { word: 'Chain',     cls: 'combo',   title: 'Chain',     desc: 'Fire both side cards together.' },
    { word: 'Shuffle in', cls: 'shuffle', title: 'Shuffle in', desc: 'Insert a card into your hand at a random position.' },
    { word: 'Discard',   cls: 'discard', title: 'Discard',   desc: 'Send a card to the discard pile.' },
    { word: 'Entity',    cls: 'entity',  title: 'Entity',    desc: 'When a bullet expires, it transforms into an Entity. Taking damage or ending a turn reduces Entity stacks.' },
    { word: 'Bounce',    cls: 'bounce',  title: 'Bounce',    desc: 'Can bounce off walls.' },
    { word: 'Pierce',    cls: 'bounce',  title: 'Pierce',    desc: 'Can pass through enemies.' },
    { word: 'On hit',    cls: 'other',   title: 'On hit',    desc: 'Triggers when a bullet attempts to damage an enemy via collision or attack.' },
    { word: 'On collision', cls: 'other', title: 'On collision', desc: 'Triggers when a bullet touches an enemy or wall.' },
    { word: 'Shield',    cls: 'summon',  title: 'Shield',    desc: 'Absorbs 1 hit of damage.' },
    { word: 'Armor',     cls: 'armor',   title: 'Armor',     desc: 'Absorbs damage by its value. Resets at the start of each player turn.' },
    { word: 'Track',     cls: 'other',   title: 'Track',     desc: 'Bullet auto-turns toward the nearest enemy.' },
    { word: 'Mana',      cls: 'other',   title: 'Mana',      desc: 'Refills at the start of each turn.' },
    { word: 'Arcane Missile', cls: 'arcane', title: 'Arcane Missile', desc: 'Arcane Missile cards auto-fire 1 Arcane Missile when revealed.' },
    { word: 'Burn',      cls: 'fire',    title: 'Burn',      desc: 'At the start of each turn, takes (Burn stacks) damage, then loses 1 stack.' },
    { word: 'Freeze',    cls: 'freeze',  title: 'Freeze',    desc: 'Skips its next turn.' },
    { word: 'Bullets',   cls: 'bullet',  title: 'Bullets',   desc: 'Affects the number of bullets fired by the main cannon.' },
    { word: 'Wave',      cls: 'bullet',  title: 'Wave',      desc: 'Affects the number of waves fired by the main cannon.' },
    { word: 'Skeleton',  cls: 'summon',  title: 'Skeleton',  desc: 'A special summon that charges the nearest enemy at end of turn.' },
    { word: 'Replace',   cls: 'shuffle', title: 'Replace',   desc: 'Within a battle, substitutes this card with another; restored after the battle.' },
  ],
};

function currentKeywords() {
  return KEYWORDS_DICT[LANG.current] || KEYWORDS_DICT.zh;
}

// 把 desc 文本里的关键词包裹为 <span class="kw kw-X">...</span>，并返回出现过的关键词列表
// 自适应卡牌字体：当 .card-desc / .card-name 文字溢出可视区域时，逐步缩小字号直至适配（或触底）。
// 在元素上读取 CSS 默认字号作为上限，最小 minSize。
function _fitTextEl(el, minSize) {
  if (!el) return;
  // 清掉上一次的 inline font-size，重新从 CSS 默认开始
  el.style.fontSize = '';
  const cs = window.getComputedStyle(el);
  const defaultPx = parseFloat(cs.fontSize) || 12;
  let size = defaultPx;
  // 每步 -0.5px，直到没有溢出或触底
  let guard = 30;
  while (guard-- > 0 && size > minSize
      && (el.scrollHeight > el.clientHeight + 0.5 || el.scrollWidth > el.clientWidth + 0.5)) {
    size -= 0.5;
    el.style.fontSize = size.toFixed(1) + 'px';
  }
}
function _fitCardDesc(el) { _fitTextEl(el, 7); }
function _fitCardName(el) { _fitTextEl(el, 8); }
function _fitAllCardDescs(container) {
  if (!container) return;
  container.querySelectorAll('.card-desc').forEach(_fitCardDesc);
  container.querySelectorAll('.card-name').forEach(_fitCardName);
}
// 单帧防抖：多次连续调用合并成一次扫描。用 setTimeout 而非 RAF —— tab hidden 时 RAF 暂停。
let _fitScheduled = false;
function scheduleFitCardDescs() {
  if (_fitScheduled) return;
  _fitScheduled = true;
  setTimeout(() => {
    _fitScheduled = false;
    _fitAllCardDescs(document);
  }, 16);
}

function renderDescWithKeywords(desc) {
  let html = escapeHtml(desc);
  const seen = [];
  for (const kw of currentKeywords()) {
    // 英文：大小写不敏感 + 单词关键词允许常见屈折后缀（-s/-es/-ed/-ing/-er/-d）
    //   "When discarded" / "discover 1 ..." / "temporary card" 等都能命中
    // 中文：直接子串匹配
    const isEnWord = /^[A-Za-z]/.test(kw.word);
    const escaped = kw.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let pattern;
    if (isEnWord) {
      const isSingleWord = /^[A-Za-z]+$/.test(kw.word);
      pattern = isSingleWord
        ? new RegExp('\\b' + escaped + '(?:es|ed|ing|er|s|d)?\\b', 'gi')
        : new RegExp('\\b' + escaped + '\\b', 'gi');
    } else {
      pattern = new RegExp(escaped, 'g');
    }
    if (pattern.test(html)) {
      pattern.lastIndex = 0;
      // 用回调保留实际匹配文本（如 "discarded" 而非 "Discard"），但 class 仍按规范的 kw.cls
      html = html.replace(pattern, m => `<span class="kw kw-${kw.cls}">${m}</span>`);
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
    this.recentHits = new Map();   // enemyID -> last hit time（实体 + 飞行子弹共用）
    this.hitCooldown = 0.1;        // 实体子弹的 (bullet, enemy) 重命中冷却
    // 飞行子弹的 (bullet, enemy) 重命中冷却：穿过敌人时若仍在体积内，每过这么久再触发 1 次命中
    // （旧版用 _contactSet 完全屏蔽"在体积内"的重复命中，慢速 / 追踪弹卡在敌人体积里就完全无伤害）
    this.pierceHitCooldown = 0.5;
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
      // 奥术巨人优先：友方奥弹存在巨人时 override lock → 锁一个**随机**巨人（非最近）
      // 锁定后整段飞行只追这个 → 视觉上像"主动飞向巨人"，不是被动靠最近匹配
      if (this.isArcane && this.team !== 'enemy') {
        const giants = (w.bullets || []).filter(b => b.alive && b._isArcaneGiant);
        if (giants.length > 0) {
          this._lockTarget = giants[randInt(0, giants.length - 1)];
          this._seekingGiant = true;   // 标记此奥弹专注追巨人 → 跳过沿途敌人碰撞
        }
      }
    }
  }

  update(dt, now, world) {
    if (!this.alive) return;
    this._world = world;     // 给 Destroyed 钩子留下 world 引用
    // 奥术巨人吸收瞬闪计时器（被奥弹接触时设到 0.22，draw 时 > 0 → body 加亮）
    if (this._absorbFlashT > 0) this._absorbFlashT = Math.max(0, this._absorbFlashT - dt);
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
      let nearest = null;
      // 奥术巨人优先：保留 activate 时锁定的 random 巨人；只有那只死了才重选一只
      if (this.isArcane && this.team !== 'enemy') {
        const lk = this._lockTarget;
        if (lk && lk.alive && lk._isArcaneGiant) {
          nearest = lk;
        } else {
          const giants = (world.bullets || []).filter(b => b.alive && b._isArcaneGiant);
          if (giants.length > 0) {
            nearest = giants[randInt(0, giants.length - 1)];
            this._lockTarget = nearest;
            this._seekingGiant = true;
          } else {
            // 巨人全死了 → 解锁，回落到原始 enemy lock 逻辑
            this._seekingGiant = false;
          }
        }
      }
      if (!nearest) {
        // 原逻辑：优先用 activate() 时锁定的目标；死亡 / 离场后回落到 nearest。
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
      } else if (this.isArcane && this.team !== 'enemy') {
        // 奥弹无敌人时：绕着场地中点转圈（而不是直接飞墙撞死）
        // 算法：朝当前半径的切线方向飞 + 径向修正（远了往里偏、近了往外偏），形成稳定圆轨。
        const cx = (world.w || 900) / 2;
        const cy = (world.h || 560) / 2;
        const dx = this.x - cx, dy = this.y - cy;
        const r = Math.hypot(dx, dy);
        if (r > 1) {
          if (this._orbitDir == null) {
            // 首次进入轨道：按当前飞行方向相对中点的旋向，选最自然的转向（顺/逆时针）
            const cross = Math.cos(this.angle) * dy - Math.sin(this.angle) * dx;
            this._orbitDir = cross >= 0 ? 1 : -1;
          }
          const rotDir = this._orbitDir;
          // 单位切线方向（rotDir = +1 逆时针 / -1 顺时针）
          const tx = -dy / r * rotDir;
          const ty =  dx / r * rotDir;
          // 期望半径 = 场地短边 30%；偏离时朝中心 / 朝外做线性修正
          const desiredR = Math.min(world.w || 900, world.h || 560) * 0.30;
          const radialErr = clamp((r - desiredR) / desiredR, -1, 1);
          const correct = radialErr * 0.5;     // 0.5 = 切线 / 径向权重
          const aimX = tx - (dx / r) * correct;
          const aimY = ty - (dy / r) * correct;
          const targetAngle = Math.atan2(aimY, aimX);
          let diff = targetAngle - this.angle;
          while (diff > Math.PI)  diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          const maxTurn = (this.trackTurnRate || 7) * dt;
          this.angle += clamp(diff, -maxTurn, maxTurn);
          // 速度保持现状，仅轻微加速（避免越绕越快）
          const initSpeed = this._initialSpeed || this.speed;
          const targetSpeed = initSpeed;
          const accel = (this.trackAccel || 600) * 0.4;
          if (this.speed < targetSpeed) this.speed = Math.min(targetSpeed, this.speed + accel * dt);
          else if (this.speed > targetSpeed) this.speed = Math.max(targetSpeed, this.speed - accel * dt);
        }
      } else {
        // 非奥弹追踪弹（如蝙蝠弹）无目标：保留原行为（直飞）
        // 同时清空奥弹轨道方向标记，下次有敌人时不残留状态
        this._orbitDir = null;
      }
    }
    // 记录拖尾位置（每帧 push 一次，保留最近 6 个）
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 6) this.trail.shift();

    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y += Math.sin(this.angle) * this.speed * dt;

    // 奥术巨人吸收：友方奥弹接触巨人 = 被吸收强化巨人（不触发命中 / 穿透 / 燃烧）
    if (this.isArcane && this.team !== 'enemy') {
      for (const b of (world.bullets || [])) {
        if (!b.alive || !b._isArcaneGiant) continue;
        const dx = b.x - this.x, dy = b.y - this.y;
        const rr = (b.radius + this.radius);
        if (dx*dx + dy*dy <= rr * rr) {
          _absorbIntoArcaneGiant(b, this, world);
          this.alive = false;
          Events.emit('bulletDestroyed', this);
          return;
        }
      }
    }

    if (now - this.born >= this.lifetime) { Events.emit('bulletDestroyed', this); this.destroy(); return; }

    // 墙（梯形）—— 顶 / 底 / 两条斜边
    // 命中判定：以子弹"边"碰到墙为准（圆心距墙的有符号距离 < radius），不是球心碰墙。
    //   - 顶 / 底：center.y < radius / > h - radius
    //   - 左 / 右斜边：center 到墙线的有符号距离 < radius；钳位时沿 inward normal 推回 radius。
    const r = this.radius;
    const h = world.h, bl = world.trap.bottomLeft, dr = world.w - world.trap.bottomRight;
    const llen = Math.hypot(h, bl);
    const rlen = Math.hypot(h, dr);
    // 内法线（指向梯形内部）+ 沿其方向的有符号距离（>0 = 内部）
    const distLeft  = (this.x * h - this.y * bl) / llen;
    const distRight = ((world.w - this.x) * h - this.y * dr) / rlen;
    let n = null;
    if (this.y < r) {
      n = { x: 0, y: 1 };
      this.y = r;
    } else if (this.y > h - r) {
      n = { x: 0, y: -1 };
      this.y = h - r;
    } else if (distLeft < r) {
      n = trapNormals(world).left;
      // 沿内法线推回到边-tangent 位置
      const push = r - distLeft;
      this.x += n.x * push;
      this.y += n.y * push;
    } else if (distRight < r) {
      n = trapNormals(world).right;
      const push = r - distRight;
      this.x += n.x * push;
      this.y += n.y * push;
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
      // 接触命中：(bullet, enemy) pair 0.5s 内置冷却 → 同一敌人停留在体积内每过 0.5s 再次触发命中。
      // 子弹在敌人体积内时不会每帧反复命中（共享 recentHits 计时），但也不会被"未离开"完全屏蔽，
      // 慢速 / 追踪弹卡在敌人身上仍能持续造成伤害。
      // 奥弹追巨人模式（_seekingGiant）：尽可能绕过敌人 → 跳过所有敌方碰撞
      // 直到接触巨人被吸收（或巨人全死后回落到普通追踪 → 标志会被清掉）
      if (!this._seekingGiant) {
        for (const e of world.enemies) {
          if (!e.alive) continue;
          if (e.spawnT > 0) continue;       // 出场 portal 期间不可命中
          const dx = e.x - this.x, dy = e.y - this.y;
          if (dx*dx + dy*dy > (e.radius + this.radius) ** 2) continue;
          const last = this.recentHits.get(e.id);
          if (last != null && now - last < this.pierceHitCooldown) continue;
          this.recentHits.set(e.id, now);
          // OnHit 先 → HitEnemy 后（让 debuff 类钩子先生效，让 fuelcell 读取最新 fire）
          this.triggerHooks(Phase.OnHit, { enemy: e, world });
          const handled = this.triggerHooks(Phase.HitEnemy, { enemy: e, world });
          if (!handled) this._defaultHitEnemy(e, world);
          if (!this.alive) break;
        }
      }
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
        // 浮字 FX 由通用 buff-diff 侦测器统一负责
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
    // 浮字 FX 由通用 buff-diff 侦测器统一负责
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
      Events.emit('bulletBounce', this);
      const vx = Math.cos(this.angle), vy = Math.sin(this.angle);
      const dot = vx * normal.x + vy * normal.y;
      const rx = vx - 2 * dot * normal.x;
      const ry = vy - 2 * dot * normal.y;
      this.angle = Math.atan2(ry, rx);
      this.recentHits.clear();
      if (world) FX.wall(world, this.x, this.y);
    } else {
      if (world) FX.wall(world, this.x, this.y);
      Events.emit('bulletDestroyed', this);
      this.destroy();
    }
  }

  destroy() {
    if (!this.alive) return;
    // 骷髅 / 亡灵龙特殊：一次冲撞结束（弹射+穿透耗尽 + 撞墙 / lifetime）= 消耗 1 层实体化
    //   层数 >0 → 回到待机态（isEntity=true / speed=0），等下个敌方回合再冲
    //   层数 =0 → 真销毁（走下方 Destroyed 钩子）
    if ((this._isSkeleton || this._isUndeadDragon) && !this.isEntity) {
      this.entityLayers--;
      // 浮字 FX 由通用 buff-diff 侦测器统一负责
      if (this.entityLayers > 0) {
        this.isEntity = true;
        this.speed = 0;
        this.penetrate = 0;
        this.bound = 0;
        this.recentHits.clear();
        this.trail.length = 0;
        Events.emit('bulletEntity', this);
        return;
      }
      // 层数=0 → fall through 走 Destroyed 钩子
    }
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
    // 敌方子弹：红色；蝙蝠子弹：紫黑；玩家弹：黄色；奥弹：紫色；骷髅：紫白
    // 召唤型友方实体（与一般弹/骷髅区分）：
    //   亡灵龙 → 暗紫（搭配下方绿色辉光内核）
    //   觉醒剑圣 → 金色 / 普通剑圣 → 银白
    //   奥术巨人 → 深紫（draw 里有专门的 radial gradient + 闪光 overlay 覆盖）
    const color = this._batBullet ? '#5a1f7a'
                : this.team === 'enemy' ? '#ff5050'
                : this.isArcane ? '#c97aff'
                : this._isUndeadDragon ? '#5a2a8c'
                : this._isArcaneGiant ? '#9c4bd0'
                : this._isSwordSaint ? (this._awakened ? '#ffd84a' : '#dde3ec')
                : this._isSkeleton ? '#aebfd8'
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
    // 奥术巨人：紫色 radial gradient + 闪光呼吸光环 + 随机紫白火星
    if (this._isArcaneGiant) {
      const tt = performance.now() / 1000;
      ctx.shadowBlur = 0;
      // 吸收瞬闪：被奥弹接触时 _absorbFlashT > 0，叠加白色高亮覆盖
      const absorbFlash = (this._absorbFlashT || 0) / 0.22;   // 1 → 0 衰减
      // 紫色径向渐变（内白外深紫）覆盖原球
      const flashPulse = 0.65 + Math.sin(tt * 6) * 0.35 + absorbFlash * 0.4;
      const grad = ctx.createRadialGradient(0, 0, this.radius * 0.05, 0, 0, this.radius);
      grad.addColorStop(0,    `rgba(255, 245, 255, ${0.95 * flashPulse})`);
      grad.addColorStop(0.25, `rgba(230, 170, 255, ${0.9 * flashPulse})`);
      grad.addColorStop(0.55, `rgba(170, 90, 220, 0.92)`);
      grad.addColorStop(0.85, `rgba(110, 50, 170, 0.9)`);
      grad.addColorStop(1,    `rgba(70, 20, 120, 0.85)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      ctx.fill();
      // 外圈快速闪烁光环（"充能感"）
      const flicker = 0.5 + Math.sin(tt * 14) * 0.45;
      ctx.strokeStyle = `rgba(255, 220, 255, ${flicker})`;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * (1.08 + Math.sin(tt * 9) * 0.05), 0, Math.PI * 2);
      ctx.stroke();
      // 吸收瞬闪：白色 overlay halo（短暂）
      if (absorbFlash > 0) {
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 22 * absorbFlash;
        ctx.fillStyle = `rgba(255, 255, 255, ${0.55 * absorbFlash})`;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * (1 + absorbFlash * 0.15), 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      // 二层外光晕（更大更淡，紫色辉光）
      ctx.shadowColor = '#c97aff';
      ctx.shadowBlur = 18;
      ctx.strokeStyle = `rgba(201, 122, 255, ${0.35 + flicker * 0.3})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 1.25, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      // 偶发紫白火星从球面飞出
      if (this._world && Math.random() < 0.32) {
        const a = Math.PI * 2 * Math.random();
        const sp = 60 + Math.random() * 100;
        this._world.particles.push(new Particle({
          x: this.x + Math.cos(a) * this.radius,
          y: this.y + Math.sin(a) * this.radius,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: 0.45, color: Math.random() < 0.5 ? '#dd99ff' : '#ffffff',
          size: 2 + Math.random() * 1.5,
        }));
      }
    }
    // 亡灵龙：紫色外壳 + 绿色不死辉光内核（搭配独特配色让玩家秒辨认）
    if (this._isUndeadDragon) {
      const tt = performance.now() / 1000;
      ctx.shadowBlur = 0;
      // 绿色内核（脉动）
      const corePulse = 0.7 + Math.sin(tt * 3) * 0.3;
      ctx.fillStyle = '#3aff8c';
      ctx.globalAlpha = 0.65 * corePulse;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      // 紫色描边
      ctx.strokeStyle = '#c97aff';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 0.9, 0, Math.PI * 2);
      ctx.stroke();
      // 偶发绿色烟雾粒子（不死气息）
      if (this._world && Math.random() < 0.18) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
        const sp = 20 + Math.random() * 40;
        this._world.particles.push(new Particle({
          x: this.x + (Math.random() - 0.5) * this.radius,
          y: this.y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30,
          life: 0.5 + Math.random() * 0.3,
          color: Math.random() < 0.6 ? '#3aff8c' : '#c97aff',
          size: 1.8 + Math.random() * 1.0,
        }));
      }
    }
    // 剑圣 / 觉醒剑圣：内层亮核 + 旋转描边光环
    if (this._isSwordSaint) {
      const tt = performance.now() / 1000;
      ctx.shadowBlur = 0;
      // 亮内核（觉醒为金白，普通为冷银）
      const innerColor = this._awakened ? '#fff4c0' : '#ffffff';
      const corePulse = 0.85 + Math.sin(tt * 4) * 0.15;
      ctx.globalAlpha = 0.7 * corePulse;
      ctx.fillStyle = innerColor;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      // 旋转剑气环：旋转的虚线弧，暗示"瞬移备战"
      const ringR = this.radius + 3;
      const rotA = (tt * 1.8) % (Math.PI * 2);
      ctx.strokeStyle = this._awakened ? '#ffd84a' : '#aed0ff';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([6, 4]);
      ctx.lineDashOffset = -rotA * 8;
      ctx.beginPath();
      ctx.arc(0, 0, ringR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
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
    // 位置：球心偏下 40% radius（叠在身体下半），与敌人 HP bar 一致；顶在战场边缘也始终可见
    if (this.entityLayersMax > 0) {
      ctx.save();
      const bw = Math.max(20, this.radius * 2.5);
      const bh = 4;
      const bx = this.x - bw / 2;
      const by = this.y + this.radius * 0.4;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = this.isEntity ? '#5bd45b' : '#7eb1ff';
      const frac = Math.max(0, Math.min(1, this.entityLayers / this.entityLayersMax));
      ctx.fillRect(bx, by, bw * frac, bh);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, bw, bh);
      // 层数文字（小号字体）紧挨血条下方
      ctx.fillStyle = '#f1f4f8';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.entityLayers + ' / ' + this.entityLayersMax, this.x, by + bh + 5);
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

  // ✨ 奥术巨人：球体顶部漂浮（单个 — 巨人就 1 张）
  const arcane = grouped.arcane || 0;
  if (arcane > 0) {
    const baseFont = Math.max(16, Math.min(28, r * 1.1));
    const dist = r + 8;
    const sway = Math.sin(t * 1.5) * 4;
    ctx.save();
    ctx.font = baseFont + 'px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#c97aff';
    ctx.shadowBlur = 10;
    ctx.fillText('✨', 0, -dist + sway);
    ctx.restore();
  }

  // 🐉 亡灵龙：球体顶部漂浮，紫/绿双色阴影交替（不死辉光）
  const dragons = grouped.dragon || 0;
  if (dragons > 0) {
    const baseFont = Math.max(22, Math.min(36, r * 1.7));
    const dist = r + 12;
    const sway = Math.sin(t * 1.8) * 5;
    const colorMix = 0.5 + Math.sin(t * 1.3) * 0.5;   // 0..1 在紫绿间渐变
    const glowColor = colorMix > 0.5 ? '#3aff8c' : '#c97aff';
    ctx.save();
    ctx.font = baseFont + 'px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 16;
    ctx.fillText('🐉', 0, -dist + sway);
    // 二次叠绘提升光晕饱和度（不同色 → 紫绿双色拖影）
    ctx.shadowColor = colorMix > 0.5 ? '#c97aff' : '#3aff8c';
    ctx.shadowBlur = 10;
    ctx.fillText('🐉', 0, -dist + sway);
    ctx.restore();
  }

  // 🏹 弓箭手：球体顶部漂浮，蓝色专注光晕；轻轻摆动表示"瞄准"姿态
  const archers = grouped.archer || 0;
  if (archers > 0) {
    const baseFont = Math.max(18, Math.min(28, r * 1.5));
    const dist = r + 9;
    const sway = Math.sin(t * 2.2) * 3;
    ctx.save();
    ctx.font = baseFont + 'px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#7eb1ff';
    ctx.shadowBlur = 12;
    ctx.fillText('🏹', 0, -dist + sway);
    ctx.restore();
  }

  // 🦸 勇者：球体顶部漂浮，红色英雄光晕；动感稍快（"行动姿态"）
  const heroes = grouped.hero || 0;
  if (heroes > 0) {
    const baseFont = Math.max(18, Math.min(28, r * 1.5));
    const dist = r + 9;
    const sway = Math.sin(t * 2.8) * 4;
    ctx.save();
    ctx.font = baseFont + 'px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#ef5050';
    ctx.shadowBlur = 12;
    ctx.fillText('🦸', 0, -dist + sway);
    ctx.restore();
  }

  // 🤺 剑圣：球体顶部漂浮（觉醒金 / 普通银白），快速摆动暗示战斗姿态
  // 注意：剑圣的"觉醒"标记从 bullet._awakened 读，而非靠装饰 type 区分。
  //   渲染靠 bullet.color cascade（球体本身金/银已经区分了），这里再加同色光晕统一气质
  const saints = grouped.saint || 0;
  if (saints > 0) {
    const baseFont = Math.max(18, Math.min(28, r * 1.5));
    const dist = r + 9;
    const sway = Math.sin(t * 3.2) * 4;       // 比骷髅更快的"剑舞"摆动
    const isAwakened = bullet._awakened;
    const glow = isAwakened ? '#ffd84a' : '#aed0ff';
    ctx.save();
    ctx.font = baseFont + 'px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = glow;
    ctx.shadowBlur = isAwakened ? 14 : 10;
    ctx.fillText('🤺', 0, -dist + sway);
    if (isAwakened) {
      // 觉醒态：额外白色高光叠加 → 神圣感
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 8;
      ctx.fillText('🤺', 0, -dist + sway);
    }
    ctx.restore();
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
//
// v8.1 平衡：所有 maxHp / value / xpReward 整体 ×1.5（向上取整），让单波敌人更少 + 更耐打 + 单杀奖励更高
// v8.3 平衡：敌方回合压缩到 0.5s（旧 1.25s）→ 所有 speed × 2.5（向上取整）保持单回合移动距离不变
//             同时 shrieker buffall 的 +15 速度 buff 也 × 2.5 → +38（相对加成保持原比例）
const ENEMY_TYPES = {
  // —— 早期敌人（Tier 1）——
  goblin:    { name: '哥布林',   icon: '👹', maxHp: 6,  attack: 1, speed: 225, radius: 16, color: '#7a8a4a', shape: 'circle', xpReward: 3, value: 5, minWave: 1,
               behavior: 'melee',
               intents: [{ kind: 'melee', icon: '🗡', cooldown: 0, desc: '接触造成 1 伤害，自爆' }] },
  archer:    { name: '弓箭手',   icon: '🏹', maxHp: 5,  attack: 0, speed: 100, radius: 14, color: '#a08060', shape: 'triangle', xpReward: 5, value: 11, minWave: 1,
               behavior: 'kiter', preferredRange: 260,
               intents: [{ kind: 'ranged', icon: '🏹', cooldown: 2, value: 2, desc: '2 回合后射 1 颗弹（2 伤）' }] },
  flier:     { name: '飞行兵',   icon: '🦇', maxHp: 8,  attack: 1, speed: 325, radius: 12, color: '#4adcd0', shape: 'triangle', xpReward: 5, value: 6, flies: true, minWave: 1,
               behavior: 'melee',
               intents: [{ kind: 'melee', icon: '🗡', cooldown: 0, desc: '飞行接触 1 伤' }] },
  rusher:    { name: '突击兵',   icon: '💨', maxHp: 8,  attack: 2, speed: 450, radius: 13, color: '#ff5050', shape: 'circle', xpReward: 6, value: 8, minWave: 3,
               behavior: 'rusher',
               intents: [{ kind: 'rush', icon: '👟', cooldown: 0, desc: '高速冲刺 2 伤撞击' }] },

  // —— 中期敌人（Tier 2）——
  sniper:    { name: '狙击手',   icon: '🎯', maxHp: 9,  attack: 0, speed: 30, radius: 16, color: '#604070', shape: 'triangle', xpReward: 9, value: 11, minWave: 8,
               behavior: 'kiter', preferredRange: 360,
               intents: [{ kind: 'sniper', icon: '🎯', cooldown: 3, value: 5, desc: '3 回合后高伤射击（5 伤）' }] },
  bouncer:   { name: '弹射射手', icon: '⚪', maxHp: 8, attack: 0, speed: 113, radius: 15, color: '#80d0d0', shape: 'circle', xpReward: 8, value: 9, minWave: 5,
               behavior: 'edge_kiter', preferredRange: 220, accuracyJitter: 0.22,
               intents: [{ kind: 'ranged', icon: '🏹', cooldown: 2, value: 1, bound: 3, desc: '2 回合后射弹射弹（弹 3）' }] },
  tracker:   { name: '追踪兵',   icon: '🎯', maxHp: 9, attack: 0, speed: 113, radius: 15, color: '#80a0d0', shape: 'circle', xpReward: 8, value: 9, minWave: 7,
               behavior: 'kiter', preferredRange: 260,
               intents: [{ kind: 'ranged', icon: '🎯', cooldown: 2, value: 1, tracking: true, desc: '2 回合后射追踪弹' }] },
  healer:    { name: '治疗师',   icon: '💚', maxHp: 11, attack: 0, speed: 100, radius: 15, color: '#60c060', shape: 'circle', xpReward: 8, value: 9, minWave: 6,
               behavior: 'support', preferredRange: 340,
               intents: [{ kind: 'heal', icon: '➕', cooldown: 2, value: 3, desc: '2 回合后治疗最近敌人 +3 HP' }] },
  bomber:    { name: '自爆球',   icon: '💣', maxHp: 6, attack: 6, speed: 250, radius: 14, color: '#ffa040', shape: 'circle', xpReward: 6, value: 8, minWave: 5,
               behavior: 'melee',
               intents: [{ kind: 'selfdest', icon: '💥', cooldown: 3, desc: '3 回合后自爆 6 伤 AOE' }] },
  spammer:   { name: '弹幕兵',   icon: '🌌', maxHp: 9, attack: 0, speed: 113, radius: 15, color: '#8080c0', shape: 'circle', xpReward: 9, value: 11, minWave: 9,
               behavior: 'kiter', preferredRange: 210,
               intents: [{ kind: 'rangedMulti', icon: '🏹', cooldown: 3, value: 1, count: 3, desc: '3 回合后 3 颗扇形弹（1 伤×3）' }] },

  // —— 后期敌人（Tier 3）——
  summoner:  { name: '召唤师',   icon: '👻', maxHp: 12,  attack: 0, speed: 0, radius: 18, color: '#702070', shape: 'rect', xpReward: 12, value: 18, minWave: 12,
               behavior: 'kiter',
               intents: [{ kind: 'summon', icon: '👥', cooldown: 3, spawn: 'goblin', desc: '3 回合后召唤 1 哥布林' }] },
  buffer:    { name: '指挥官',   icon: '👑', maxHp: 15, attack: 1, speed: 113, radius: 16, color: '#c08000', shape: 'rect', xpReward: 11, value: 11, minWave: 11,
               behavior: 'support', preferredRange: 300,
               intents: [{ kind: 'buff', icon: '⬆', cooldown: 2, value: 1, desc: '2 回合后友军 +1 攻击' }] },
  tank:      { name: '重甲兵',   icon: '🛡', maxHp: 23, attack: 3, speed: 88, radius: 22, color: '#444444', shape: 'circle', xpReward: 14, value: 18, minWave: 20,
               behavior: 'melee',
               intents: [{ kind: 'melee', icon: '🗡', cooldown: 0, desc: '接触造成 3 伤' }] },
  mage:      { name: '法师',     icon: '🔮', maxHp: 9, attack: 0, speed: 70, radius: 15, color: '#a05ec0', shape: 'circle', xpReward: 11, value: 12, minWave: 13,
               behavior: 'kiter', preferredRange: 220,
               intents: [{ kind: 'aoe', icon: '💢', cooldown: 3, value: 3, desc: '3 回合后 AOE 法术 3 伤' }] },
  berserker: { name: '狂战士',   icon: '⚔', maxHp: 14,  attack: 2, speed: 250, radius: 17, color: '#d04040', shape: 'circle', xpReward: 11, value: 14, minWave: 15,
               behavior: 'melee',
               intents: [
                 { kind: 'selfbuff', icon: '⚔', cooldown: 1, value: 1, desc: '1 回合后 +1 攻击（叠加）' },
                 { kind: 'melee', icon: '🗡', cooldown: 0, desc: '接触造成伤害' },
               ] },
  splitter:  { name: '分裂者',   icon: '✂', maxHp: 12,  attack: 0, speed: 138, radius: 18, color: '#80c080', shape: 'circle', xpReward: 9, value: 12, onDeath: 'split', minWave: 16,
               behavior: 'melee',
               intents: [{ kind: 'melee', icon: '🗡', cooldown: 0, desc: '接触 / 死亡分裂 2 个小型' }] },

  // —— 精英 / 杂项 ——
  slug:      { name: '慢虫',     icon: '🐌', maxHp: 11,  attack: 1, speed: 38, radius: 20, color: '#a08040', shape: 'rect', xpReward: 9, value: 12, minWave: 18,
               behavior: 'melee',
               intents: [{ kind: 'melee', icon: '🗡', cooldown: 0, desc: '缓慢推进接触' }] },
  shrieker:  { name: '尖叫者',   icon: '📢', maxHp: 11,  attack: 0, speed: 100, radius: 15, color: '#c0a040', shape: 'circle', xpReward: 8, value: 8, minWave: 13,
               behavior: 'support', preferredRange: 320,
               intents: [{ kind: 'buffall', icon: '📢', cooldown: 3, value: 38, desc: '3 回合后全敌人 +38 速度' }] },
  slower:    { name: '时空法师', icon: '⏳', maxHp: 14, attack: 0, speed: 113, radius: 16, color: '#6080c0', shape: 'circle', xpReward: 9, value: 9, minWave: 14,
               behavior: 'support', preferredRange: 300,
               intents: [{ kind: 'debuff', icon: '⬇', cooldown: 2, desc: '2 回合后抽走玩家 1 法力' }] },
  boss:      { name: '深渊魔王', icon: '👺', maxHp: 38, attack: 4, speed: 88, radius: 28, color: '#400040', shape: 'circle', xpReward: 30, value: 38, minWave: 25,
               behavior: 'kiter', preferredRange: 200,
               intents: [
                 { kind: 'ranged', icon: '🏹', cooldown: 1, value: 3, desc: '1 回合后射 3 伤弹' },
                 { kind: 'summon', icon: '👥', cooldown: 2, spawn: 'goblin', desc: '2 回合后召唤哥布林' },
                 { kind: 'aoe', icon: '💢', cooldown: 2, value: 5, desc: '2 回合后 AOE 5 伤' },
               ] },
  // —— 强力精英（v8 新增）—— 攻击间隔 ≥ 2，但单次效果厉害 ——
  // 守卫：melee，每回合开始重置免疫充能 1（吸收一次伤害后失效，下回合再恢复）
  guardian:  { name: '守卫',     icon: '🛡', maxHp: 12,  attack: 2, speed: 138, radius: 18, color: '#7a8fa8', shape: 'rect', xpReward: 12, value: 15, minWave: 10,
               behavior: 'melee', _maxImmuneCharges: 1,
               intents: [{ kind: 'melee', icon: '🗡', cooldown: 0, desc: '接触 2 伤。每回合开始免疫 1 次伤害' }] },
  // 火炮法师：朝玩家方向投影矩形 AOE（长 280 / 宽 70）。2 回合间隔，单次大伤害
  cannoneer: { name: '火炮法师',  icon: '🧙', maxHp: 9,  attack: 0, speed: 75, radius: 16, color: '#a04060', shape: 'triangle', xpReward: 12, value: 17, minWave: 12,
               behavior: 'kiter', preferredRange: 220,
               intents: [{ kind: 'rectAoe', icon: '💢', cooldown: 2, value: 5, length: 180, halfWidth: 35, desc: '2 回合后向前方矩形范围（长 180 / 宽 70）造成 5 伤' }] },
  // 穿透弩手：射出大型穿透弹（pen 4），打穿玩家与召唤物。2 回合间隔
  piercer:   { name: '穿透弩手',  icon: '🏹', maxHp: 9,  attack: 0, speed: 88, radius: 15, color: '#c08840', shape: 'triangle', xpReward: 12, value: 17, minWave: 11,
               behavior: 'kiter', preferredRange: 320,
               intents: [{ kind: 'pierce', icon: '⟶', cooldown: 2, value: 3, penetrate: 4, desc: '2 回合后射出穿透弹（3 伤，可穿 4 个目标）' }] },

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
  shrieker:  { name_en: 'Shrieker',     intents_en: ['All enemies +15 speed in 3 turns'] },
  slower:    { name_en: 'Chronomancer', intents_en: ['Drain 1 player mana in 2 turns'] },
  boss:      { name_en: 'Abyss Lord',   intents_en: ['Fires a 3-dmg shot in 1 turn', 'Summons a Goblin in 2 turns', 'AOE 5 dmg in 2 turns'] },
  guardian:  { name_en: 'Guardian',     intents_en: ['Contact 2 dmg. Immune to 1 hit per turn.'] },
  cannoneer: { name_en: 'Cannon Mage',  intents_en: ['Rectangular AOE in 2 turns (length 280 × width 70, 5 dmg)'] },
  piercer:   { name_en: 'Crossbower',   intents_en: ['Piercing bolt in 2 turns (3 dmg, pierces 4 targets)'] },
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
    this.world = world;             // 反向引用，applyKnockback 等需要 trapBounds 钳位
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
    // 每回合免伤次数（守卫）：spawn 时初始化为 max；每回合开始重置
    if (type._maxImmuneCharges) {
      this._maxImmuneCharges = type._maxImmuneCharges;
      this._immuneCharges = type._maxImmuneCharges;
    }
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
    // 调试无敌：HP 不掉，仅闪伤害数字与红光（dummy 模式用）
    if (this._invincible) {
      this.hitFlash = 0.15;
      const w = window.__game;
      if (w && amount > 0) FX.damage(w, this.x, this.y - this.radius, amount);
      return true;
    }
    // 守卫类：每回合开始重置 _immuneCharges。还有 charges → 完全吸收本次伤害
    if ((this._immuneCharges || 0) > 0 && amount > 0) {
      this._immuneCharges -= 1;
      this.hitFlash = 0.1;
      const w = window.__game;
      if (w) {
        // 视觉：青色盾环 + "✦" 飘字
        w.particles.push(new Particle({
          x: this.x, y: this.y, life: 0.32, color: '#aef0fb', size: this.radius + 8, type: 'ring',
        }));
        w.particles.push(new FloatingText(this.x, this.y - this.radius - 6, '✦', {
          color: '#aef0fb', glow: '#5eb2ff',
        }));
      }
      return false;   // 不算 dealt（与护盾 / 装甲零吸收同语义）
    }
    // 奖励金球：不掉血、不死；斐波那契递减金币（GoldOrb 飞向金币条）
    if (this._isReward) {
      this.hitFlash = 0.15;
      // 金币 chime：清脆的硬币 ting（每次被击中都响，与是否掉金无关）
      playSfx('coinHit', 40);
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
    // 命中音：节流（多颗子弹同帧打到同一只怪只响一次）
    // 与开火音对调 —— 命中改用 fire（大炮 boom），高伤改用 fireCombo（更重）
    if (amount > 0) playSfx(amount >= 5 ? 'fireCombo' : 'fire', 40);
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
    // 钳位回梯形内：避免被击退到墙外。Y 先 clamp（梯形宽度依赖 y），再按当前 y 钳 X。
    const w = this.world;
    if (w) {
      this.y = clamp(this.y, this.radius, w.h - this.radius);
      const tb = trapBounds(w, this.y);
      this.x = clamp(this.x, tb.leftX + this.radius, tb.rightX - this.radius);
    }
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
    // 调试傀儡：不动、不打人、不递减 intent（仅供玩家在屏幕中央打着玩）
    if (this._isDebugDummy) return;
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
      // 梯形内活动：先钳 Y，再按当前 y 钳 X（梯形宽度随 y 变化）
      if (this.y < this.radius)             this.y = this.radius;
      if (this.y > world.h - this.radius)   this.y = world.h - this.radius;
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
    const baseColor = flash ? '#ffffff' : (frozen ? '#5fb4ff' : this.color);
    ctx.strokeStyle = frozen ? '#1f5fa8' : 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    // v8.5：所有敌人 body 改用径向渐变（左上亮 → 右下暗），增加立体感 + 不同敌人差异
    // flash / frozen 状态保留纯色（高亮 / 冻结视觉优先）
    if (flash || frozen) {
      ctx.fillStyle = baseColor;
    } else {
      const grad = ctx.createRadialGradient(
        -this.radius * 0.35, -this.radius * 0.35, this.radius * 0.1,
        0, 0, this.radius
      );
      grad.addColorStop(0,    _lightenColor(baseColor, 0.55));
      grad.addColorStop(0.55, baseColor);
      grad.addColorStop(1,    _darkenColor(baseColor, 0.35));
      ctx.fillStyle = grad;
    }
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
    // v8.5：身体中央叠 type.icon emoji 作为差异化标识（每种敌人 icon 各异 → 视觉秒辨认）
    // 取代旧的"简易白点眼睛"。flash / frozen 状态也显示，但稍微变淡
    if (this.type.icon) {
      ctx.save();
      ctx.font = `${this.radius * 1.5}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = 4;
      ctx.globalAlpha = (flash || frozen) ? 0.55 : 1;
      ctx.fillText(this.type.icon, 0, 0);
      ctx.restore();
    } else {
      // fallback 旧风格白点眼睛（type 没有 icon 的兜底）
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(-this.radius * 0.32, -this.radius * 0.18, 2.5, 0, Math.PI * 2);
      ctx.arc(this.radius * 0.32, -this.radius * 0.18, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Intent 角标（右下）— 先画，让下方 HP bar 覆盖在它上面
    this._drawIntentBadge(ctx);
    // HP bar（中心偏下，叠在身体下半 → 顶在战场边缘也始终可见 + 遮挡 intent 角标）
    const bw = this.radius * 2;
    const hpBarY = this.radius * 0.4;
    ctx.fillStyle = '#000a';
    ctx.fillRect(-bw / 2, hpBarY, bw, 4);
    ctx.fillStyle = '#5bd45b';
    ctx.fillRect(-bw / 2, hpBarY, bw * (this.hp / this.maxHp), 4);
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
      penetrate: intent.penetrate || 0,
      tracking: !!intent.tracking,
      speed: k === 'sniper' ? 520 : 360,
    });
  } else if (k === 'pierce') {
    // 穿透弹：高穿透 + 大体积，沿直线打穿玩家所在方向（兼容 spawnEnemyBullet）
    spawnEnemyBullet(world, enemy, {
      attack: intent.value || 2,
      penetrate: intent.penetrate || 3,
      speed: 420, radius: 8, lifetime: 5,
    });
  } else if (k === 'rectAoe') {
    // 矩形 AOE：法师塔等用 — 朝玩家方向投影一条长方形轨道（length × halfWidth*2）
    const target = nearestAlly(world, enemy);
    if (!target) return;
    const dirAngle = angleBetween(enemy.x, enemy.y, target.x, target.y);
    const length = intent.length || 300;
    const halfWidth = intent.halfWidth || 40;
    // 预警：先洒一道暗红色 ring 提示路径，0.3s 后真伤
    const cosA = Math.cos(dirAngle), sinA = Math.sin(dirAngle);
    const warnSteps = 6;
    for (let i = 0; i <= warnSteps; i++) {
      const lx = (i / warnSteps) * length;
      world.particles.push(new Particle({
        x: enemy.x + cosA * lx, y: enemy.y + sinA * lx,
        life: 0.35, color: '#ff6060', size: halfWidth * 0.45, type: 'ring',
      }));
    }
    setTimeout(() => {
      if (!enemy.alive) return;
      applyAoe(world, enemy, {
        kind: 'rect', cx: enemy.x, cy: enemy.y,
        dirAngle, length, halfWidth,
        damage: intent.value || 3, target: 'allies',
        color: '#d04040',
      });
    }, 350);
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
    // 全敌人 +speed（永久 / 本场战斗内累积）
    const bump = intent.value || 15;
    for (const o of world.enemies) {
      if (!o.alive) continue;
      o.speed += bump;
      // 视觉反馈：金色脉冲环 + "💨" 飞字
      const w = world;
      if (w) {
        w.particles.push(new Particle({
          x: o.x, y: o.y, life: 0.32, color: '#c0a040', size: o.radius + 6, type: 'ring',
        }));
      }
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
    speed: opts.speed || 360, lifetime: opts.lifetime || 4,
    attack: opts.attack || 1, bound: opts.bound || 0, penetrate: opts.penetrate || 0,
    bulletCount: 1, waveCount: 1, radius: opts.radius || 5,
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
    // 回合制：法力仅在每个玩家回合开始时回满，不自动回复
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
      playSfx('damage', 60);
      if (w) {
        FX.damage(w, this.x, this.y - this.radius - 8, amount, totalBlocked);
        FX.shake(w, clamp(3 + amount * 0.8, 3, 10), 0.2);
        // 受击 vignette：屏幕四边红色脉冲，与 shake 叠加出"撞了一下"的实感
        w.damageFlash = Math.max(w.damageFlash || 0, clamp(0.4 + amount * 0.06, 0.4, 0.85));
      }
      if (this.hp <= 0) { this.hp = 0; Events.emit('playerDied'); }
    } else if (totalBlocked > 0) {
      // 全部被格挡 → 弹出蓝色 "🛡 N"（避免与 0 伤害"哑弹"混淆）
      playSfx('armorBlock', 60);
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
    // 调试无限费用：始终成功且不扣 mana
    const wDbg = window.__game;
    if (wDbg && wDbg._debugInfiniteCost) return true;
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
  // 按 world.cannon.id 分派 (chain / summon / power / fire-legacy) → 不同颜色 + 风格化粒子
  notifyFired(world) {
    this.recoilT = this.recoilDur;
    if (!world) return;
    const mx = this.x + Math.cos(this.angle) * (this.radius + 12);
    const my = this.y + Math.sin(this.angle) * (this.radius + 12);
    const cid = world.cannon?.id;
    if (cid === 'fire')        this._muzzleFire(world, mx, my);
    else if (cid === 'chain')  this._muzzleChain(world, mx, my);
    else if (cid === 'power')  this._muzzlePower(world, mx, my);
    else if (cid === 'summon') this._muzzleSummon(world, mx, my);
    else                       this._muzzleDefault(world, mx, my);
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

  // 召唤炮台：紫色魔法 puff —— 紫白闪光 + 旋转双环 + 紫色火花
  _muzzleSummon(world, mx, my) {
    world.particles.push(new Particle({ x: mx, y: my, life: 0.15, color: '#dd99ff', size: 18, type: 'flash' }));
    world.particles.push(new Particle({ x: mx, y: my, life: 0.32, color: '#a060d0', size: 16, type: 'ring' }));
    world.particles.push(new Particle({
      x: mx + Math.cos(this.angle) * 6, y: my + Math.sin(this.angle) * 6,
      life: 0.28, color: '#7a3aa8', size: 12, type: 'ring',
    }));
    // 紫色火花朝炮口方向
    for (let i = 0; i < 7; i++) {
      const a = this.angle + (Math.random() - 0.5) * 0.6;
      const sp = 160 + Math.random() * 100;
      world.particles.push(new Particle({
        x: mx, y: my, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.32, color: i % 2 === 0 ? '#dd99ff' : '#a060d0', size: 2.6,
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
      // 奥弹炮台：射追踪奥弹（应用本回合 arcaneBuffs）—— fireArcaneMissileFromUnit 内部播放 arcaneSwoosh
      fireArcaneMissileFromUnit(world, this);
      return;
    }
    playSfx('summonAttack', 30);
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
    // HP 条（中心偏下，与敌人 / 实体子弹一致）
    const bw = this.radius * 2;
    const hpBarY = this.radius * 0.4;
    ctx.fillStyle = '#000a';
    ctx.fillRect(-bw / 2, hpBarY, bw, 3);
    ctx.fillStyle = '#5bd45b';
    ctx.fillRect(-bw / 2, hpBarY, bw * (this.hp / this.maxHp), 3);
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
  // 注：旧版 spawnSummon 里曾给 kind='skeleton' 的 Summon 继承本回合 hooks，但骷髅早已迁
  //   到 Bullet（spawnSkeleton），SUMMON_DEFS 里也没有 'skeleton' 这个 kind，所以这段已经
  //   是死代码。新版统一不让骷髅 / 奥弹继承本回合 hooks（强度过高），故彻底移除。
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

// 骷髅 = 速度 0、实体化层数默认 1 的友方"实体化子弹"。
// 不放在 world.summons，而是直接进 world.bullets（享受完整 Bullet 生命周期：
//   - 敌方子弹按距离命中实体（每次 -1 层）
//   - 实体回合开始触发 EntityTurn 钩子（含 dash） + -1 层
//   - 层数 0 → 触发 Destroyed + 死亡）
// 默认带一条 EntityTurn 钩子：挑随机敌人 → dash 撞击。
// 关键设计：召唤的骷髅 **不会** 继承本回合用过的卡牌（_turnHookCards）。
//   只有"明确说会 buff 骷髅"的效果（如骷髅号角 / 爆骨花展露 / 叫魂钻 / 墓穴 attackBonus）
//   才会改它属性 — 通过显式地遍历 world.bullets 或监听 summonSpawned 事件来实现。
//   opts.attackBonus 是给"使用就 +N 攻"型卡（墓穴银/金）的显式入口。
function spawnSkeleton(world, opts = {}) {
  const skel = _spawnOneSkeleton(world, opts);
  if (opts.attackBonus && skel) skel.attack = (skel.attack || 0) + opts.attackBonus;
  return skel;
}

function _spawnOneSkeleton(world, opts = {}) {
  const player = world.player;
  // 默认 spawn 在炮台前 180° 弧（上半圆）随机位置
  let x, y;
  if (opts.x != null && opts.y != null) {
    x = opts.x + rand(-8, 8); y = opts.y + rand(-8, 8);
  } else {
    const ang = rand(-Math.PI, 0);
    const dist = 70 + rand(0, 50);
    x = player.x + Math.cos(ang) * dist;
    y = player.y + Math.sin(ang) * dist;
  }
  const r = 8;
  const tb = trapBounds(world, y);
  x = clamp(x, tb.leftX + r, tb.rightX - r);
  y = clamp(y, r, world.h - r);

  const skel = new Bullet({
    x, y, angle: 0, speed: 0, lifetime: 9999,
    attack: 1, bound: 0, penetrate: 0,
    bulletCount: 1, waveCount: 1, radius: r,
    entityLayers: opts.entityLayers ?? 1,
  });
  skel.team = 'ally';
  skel.kind = 'skeleton';
  skel._isSkeleton = true;
  // 用现成的 skull 装饰 → Bullet.draw 会画 💀 emoji 漂浮在球体上方
  skel._entityDecos = ['skull'];

  // EntityTurn 钩子：每个实体回合 → 瞄准随机敌人发起一次"冲撞"（速度型）
  // 切到 isEntity=false 进入正常子弹飞行流程：穿透/弹射/撞墙等钩子全部沿用现成逻辑。
  // 冲撞自然结束（弹射+穿透耗尽 + 撞墙 / lifetime / 命中）→ destroy() 里再扣 entityLayer。
  skel.addHook(new Effect(Phase.EntityTurn, 0, ctx => {
    const b = ctx.bullet, w = ctx.world;
    const alive = w.enemies.filter(e => e.alive && (e.spawnT == null || e.spawnT <= 0));
    if (alive.length === 0) {
      // 无敌人 → 不冲撞，但仍消耗 1 层实体化（与其它实体子弹同步老化）
      b.entityLayers--;
      if (b.entityLayers <= 0) {
        b.triggerHooks(Phase.Destroyed, { world: w });
        b.alive = false;
      }
      return;
    }
    const t = alive[Math.floor(Math.random() * alive.length)];
    b.angle = angleBetween(b.x, b.y, t.x, t.y);
    b.speed = 420;
    b.lifetime = 2.2;
    b.born = performance.now() / 1000;
    b.isEntity = false;          // 切到正常飞行
    // 每次冲撞重置消耗型字段，让卡牌给的穿透/弹射每次都生效
    b.penetrate = b._chargeBasePierce ?? 0;
    b.bound = b._chargeBaseBound ?? 0;
    b.recentHits.clear();
    b.trail.length = 0;
  }));

  // Destroyed 钩子：对外发出 summonDied，让 bone_blossom / skeleton_lord 等沿用现有事件机制
  skel.addHook(new Effect(Phase.Destroyed, 0, ctx => {
    Events.emit('summonDied', ctx.bullet);
  }));

  // 注意：骷髅 **不再继承** world._turnHookCards 中的 hooks。
  //   旧版让 boost1 / 凝视 / 注铅 等 PreActive 钩子顺带 buff 骷髅 → 过强 + 与"骷髅领主等
  //   self-aura 不能继承"的修复方案打架。现在骷髅只吃显式 buff（骷髅号角 / 爆骨花展露 /
  //   叫魂钻 / 墓穴 attackBonus），通过遍历 world.bullets 或监听 summonSpawned 实现。
  // PreActive / Spawned 仍然触发一次（用于设置基线），但因为没有外部 hook，不会有副作用。
  skel.triggerHooks(Phase.PreActive, { world });
  skel.triggerHooks(Phase.Spawned, { world });
  // PreActive 结算完，存下"每次冲撞要复用"的穿透/弹射基线（默认全 0，未来若有显式 buff 会反映）
  skel._chargeBasePierce = skel.penetrate;
  skel._chargeBaseBound = skel.bound;
  // 出场前先归零（实体待机状态不应该有飞行属性参与碰撞计数）
  skel.penetrate = 0;
  skel.bound = 0;
  // 立即激活并进入实体态（speed=0 → 不会有飞行阶段）
  skel.activate(performance.now() / 1000);
  skel.isEntity = true;
  // 入场视觉
  for (let i = 0; i < 8; i++) {
    const a = Math.PI * 2 * Math.random();
    const sp = 50 + Math.random() * 70;
    world.particles.push(new Particle({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20,
      life: 0.32, color: i % 2 ? '#c97aff' : '#dde3ec', size: 2.6,
    }));
  }
  world.bullets.push(skel);
  Events.emit('summonSpawned', skel);
  return skel;
}

// ─── 增益 / 减益视觉特效（统一入口）────────────────────────────────
// 每种 buff/debuff 类型有自己的 emoji + 配色，分散位置避免相互叠盖。
// 在 fireFromCards / 实体增益（战旗 / 战鼓 / 令箭）/ 实体层数变化时调用。
const _BUFF_FX = {
  atk:  { emoji: '⚔',  color: '#ff7878', glow: '#ff5050' },   // 伤害（红）
  pen:  { emoji: '🎯', color: '#3ed5e8', glow: '#1ab8d0' },   // 穿透（青）
  bnd:  { emoji: '🏐', color: '#7eb1ff', glow: '#4a82d4' },   // 弹射（蓝）
  cnt:  { emoji: '🔫', color: '#ffd84a', glow: '#ffa64a' },   // 数量（金）
  wav:  { emoji: '〰', color: '#c97aff', glow: '#a060d0' },   // 波次（紫）
  ent:  { emoji: '🛡', color: '#aed0ff', glow: '#7eb1ff' },   // 实体化（淡蓝）
  fire: { emoji: '🔥', color: '#ff7030', glow: '#ffae00' },   // 燃烧（橙）
};
const _DEBUFF_FX = {
  ent_loss: { emoji: '🛡', color: '#9aa6b4', glow: '#5a6878', sign: '-' },   // 实体层数减少（灰）
};
function _spawnBuffFloat(world, x, y, type, amount, isDebuff = false) {
  if (!world || !world.particles || amount <= 0) return;
  const cfg = (isDebuff ? _DEBUFF_FX[type] : _BUFF_FX[type]);
  if (!cfg) return;
  const sign = cfg.sign || '+';
  world.particles.push(new FloatingText(x, y, `${cfg.emoji}${sign}${amount}`, {
    color: cfg.color, glow: cfg.glow, size: 14, life: 1.0, vy: -75,
  }));
}
// fireFromCards 用：玩家发射时，按"每张卡分别贡献"列出 buff items 飘出 icon。
// 例：主卡 +1 攻 + 副卡 +3 攻 → 飘两个 ⚔+1 + ⚔+3（而非合并为 ⚔+4）
//
// items 形如 [['atk', 1], ['atk', 3], ['pen', 2], ...] —— 调用方按卡片维度构造。
// 位置：炮台周围 180° 后半圆内 + 紧贴炮台外缘。
//   - 每个 item 采样 8 个候选位置 → 选与已有 floattext 粒子距离最大的 → 蓝噪声分散
//   - 既保持位置随机感（每次不一样），又避免 buff 文字相互压叠
//   - 不挡前 180° 半圆 = 不挡瞄准视线
function _emitCannonBuffFX(world, items) {
  if (!world || !world.player) return;
  if (!items || items.length === 0) return;
  const p = world.player;
  const backAngle = p.angle + Math.PI;
  const halfArc = Math.PI / 2;          // ±90° 后半圆
  const radius = p.radius || 24;
  // 记录本次 emit 内已选的位置，加上现有粒子池中的 floattext
  const placed = [];
  for (const part of world.particles) {
    if (part.type === 'floattext') placed.push({ x: part.x, y: part.y });
  }
  items.forEach((it) => {
    // 采样 8 个候选位置，选与已有粒子距离最大者（含本次 emit 已选的兄弟）
    let bestX = 0, bestY = 0, bestMinDist = -Infinity;
    for (let k = 0; k < 8; k++) {
      const relAng = (Math.random() - 0.5) * 2 * halfArc;
      const ang = backAngle + relAng;
      const dist = radius + 2 + Math.random() * 12;
      const cx = p.x + Math.cos(ang) * dist;
      const cy = p.y + Math.sin(ang) * dist - 2;
      // 找最近邻
      let minD = Infinity;
      for (const o of placed) {
        const d = Math.hypot(o.x - cx, o.y - cy);
        if (d < minD) minD = d;
      }
      if (minD > bestMinDist) {
        bestMinDist = minD;
        bestX = cx; bestY = cy;
      }
    }
    placed.push({ x: bestX, y: bestY });
    _spawnBuffFloat(world, bestX, bestY, it[0], it[1]);
  });
}
// 按 useList 计算"每张卡 PreActive 贡献了什么"。
// 实现：为每张卡建一颗 dry Bullet（共享 tpl 当前基线值），把该卡 hooks 跑一遍，
// 与基线做 diff → 得到该卡的 atk/pen/bnd/cnt/wav/ent/fire 增量。
// 之后 fireFromCards 再做"真实"的 PreActive 一次（在 tpl 上），把所有卡的增量真正累计上去。
function _computePerCardBuffItems(world, tpl, useList) {
  const items = [];
  if (!world || !useList) return items;
  const base = {
    attack: tpl.attack, bound: tpl.bound, penetrate: tpl.penetrate,
    bulletCount: tpl.bulletCount, waveCount: tpl.waveCount,
    entityLayers: tpl.entityLayers, fireOnHit: tpl._fireOnHit || 0,
  };
  for (const c of useList) {
    if (!c) continue;
    const hooks = c.initializeEffects ? c.initializeEffects() : [];
    if (!hooks || hooks.length === 0) continue;
    // 仅取 PreActive 钩子（其它阶段不影响 tpl 基线）
    const preHooks = hooks.filter(h => h.phase === Phase.PreActive);
    if (preHooks.length === 0) continue;
    const dry = new Bullet({
      x: tpl.x, y: tpl.y, angle: tpl.angle,
      speed: tpl.speed, lifetime: tpl.lifetime,
      attack: base.attack, bound: base.bound, penetrate: base.penetrate,
      bulletCount: base.bulletCount, waveCount: base.waveCount,
      entityLayers: base.entityLayers, radius: tpl.radius,
    });
    dry._fireOnHit = base.fireOnHit;
    for (const h of preHooks) dry.hooks.push(h);
    dry.triggerHooks(Phase.PreActive, { world });
    const dAtk = dry.attack - base.attack;
    const dPen = dry.penetrate - base.penetrate;
    const dBnd = dry.bound - base.bound;
    const dCnt = dry.bulletCount - base.bulletCount;
    const dWav = dry.waveCount - base.waveCount;
    const dEnt = dry.entityLayers - base.entityLayers;
    const dFire = (dry._fireOnHit || 0) - base.fireOnHit;
    if (dAtk > 0) items.push(['atk', dAtk]);
    if (dPen > 0) items.push(['pen', dPen]);
    if (dBnd > 0) items.push(['bnd', dBnd]);
    if (dCnt > 0) items.push(['cnt', dCnt]);
    if (dWav > 0) items.push(['wav', dWav]);
    if (dEnt > 0) items.push(['ent', dEnt]);
    if (dFire > 0) items.push(['fire', dFire]);
  }
  return items;
}
// 实体被 buff 时（战旗 / 战鼓 / 令箭等）：在该实体身上飘出对应数字
function _emitEntityBuffFX(world, entity, type, amount) {
  if (!world || !entity) return;
  _spawnBuffFloat(world, entity.x, entity.y - (entity.radius || 12) - 8, type, amount);
}
// 实体层数 -N 时：灰色减号飘字
function _emitEntityLayerLossFX(world, entity, amount) {
  if (!world || !entity || amount <= 0) return;
  _spawnBuffFloat(world, entity.x, entity.y - (entity.radius || 12) - 8, 'ent_loss', amount, true);
}

// 通用 buff-diff 侦测器：每帧对比所有友方实体的 attack / entityLayers 与上帧 snapshot
//   ↑ 增加 → 在实体身上飘 ⚔/🛡 浮字（被 buff 反馈）
//   ↓ 减少 → 飘灰色 🛡- 浮字（layer 减少反馈）
// 适用：任何修改 b.attack / b.entityLayers 的来源都自动触发 FX，
//      新增卡牌时不需要在卡定义里手动调 _emitXxx 助手 — 改属性就有 FX。
function _tickEntityBuffDiff(world) {
  if (!world || !world.bullets) return;
  for (const b of world.bullets) {
    // 只关心"友方且当前是实体或将变实体"的子弹
    if (!b.alive || b.team === 'enemy') continue;
    if (!(b.entityLayersMax > 0)) continue;
    // 初始化 snapshot（第一帧不报 FX，仅记录基线）
    if (b._buffSnapAttack == null) {
      b._buffSnapAttack = b.attack;
      b._buffSnapEntityLayers = b.entityLayers;
      continue;
    }
    const dAtk = b.attack - b._buffSnapAttack;
    const dEnt = b.entityLayers - b._buffSnapEntityLayers;
    if (dAtk > 0) _emitEntityBuffFX(world, b, 'atk', dAtk);
    if (dEnt > 0) _emitEntityBuffFX(world, b, 'ent', dEnt);
    else if (dEnt < 0) _emitEntityLayerLossFX(world, b, -dEnt);
    b._buffSnapAttack = b.attack;
    b._buffSnapEntityLayers = b.entityLayers;
  }
}

// 亡灵龙：超大型友方实体子弹。10 实体化 / 10 攻击。
// 每个敌方回合 → 冲撞生命值最高的敌人，命中时附加冻结 + 周围 2 范围伤害 + 2 燃烧。
// 与骷髅同样走 "destroy 里扣层 + EntityTurn 起冲" 的模式（_isUndeadDragon 标记）。
function spawnUndeadDragon(world, opts = {}) {
  const player = world.player;
  let x, y;
  if (opts.x != null && opts.y != null) {
    x = opts.x + rand(-8, 8); y = opts.y + rand(-8, 8);
  } else {
    const ang = rand(-Math.PI * 0.75, -Math.PI * 0.25);
    const dist = 100 + rand(0, 40);
    x = player.x + Math.cos(ang) * dist;
    y = player.y + Math.sin(ang) * dist;
  }
  const r = 18;
  const tb = trapBounds(world, y);
  x = clamp(x, tb.leftX + r, tb.rightX - r);
  y = clamp(y, r, world.h - r);

  const dragon = new Bullet({
    x, y, angle: 0, speed: 0, lifetime: 9999,
    attack: 10, bound: 0, penetrate: 0,
    bulletCount: 1, waveCount: 1, radius: r,
    entityLayers: 10,
  });
  dragon.team = 'ally';
  dragon.kind = 'undeadDragon';
  dragon._isUndeadDragon = true;
  dragon._entityDecos = ['dragon'];

  // EntityTurn：冲向生命值最高的敌人
  dragon.addHook(new Effect(Phase.EntityTurn, 0, ctx => {
    const b = ctx.bullet, w = ctx.world;
    const alive = w.enemies.filter(e => e.alive && (e.spawnT == null || e.spawnT <= 0));
    if (alive.length === 0) {
      b.entityLayers--;
      if (b.entityLayers <= 0) {
        b.triggerHooks(Phase.Destroyed, { world: w });
        b.alive = false;
      }
      return;
    }
    let t = alive[0];
    for (const e of alive) if (e.hp > t.hp) t = e;
    b.angle = angleBetween(b.x, b.y, t.x, t.y);
    b.speed = 360;
    b.lifetime = 2.4;
    b.born = performance.now() / 1000;
    b.isEntity = false;
    b.penetrate = 0;
    b.bound = 0;
    b.recentHits.clear();
    b.trail.length = 0;
  }));

  // HitEnemy：命中时冻结 + 周围 2 范围伤害 + 2 燃烧 + 紫绿不死爆裂视觉
  dragon.addHook(new Effect(Phase.HitEnemy, -1, ctx => {
    const e = ctx.enemy, w = ctx.world, b = ctx.bullet;
    applyFreeze(e, 1);
    applyFire(e, 2);
    applyAoe(w, b, {
      damage: 2, mult: 1.5, target: 'enemies',
      exclude: e, knockback: false,
      onHit: (en) => applyFire(en, 2),
      color: '#c97aff',
    });
    // 命中点叠加：绿色不死气息 + 紫色冰晶碎片（区别于普通爆炸的红橙色）
    for (let k = 0; k < 18; k++) {
      const a = Math.PI * 2 * Math.random();
      const sp = 90 + Math.random() * 140;
      w.particles.push(new Particle({
        x: e.x, y: e.y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30,
        life: 0.5 + Math.random() * 0.25,
        color: k % 3 === 0 ? '#3aff8c' : (k % 2 ? '#c97aff' : '#7a5ac0'),
        size: 3.0,
      }));
    }
    // 顶部小骷髅飘字 — 不死龙的标识符
    if (Math.random() < 0.8) {
      w.particles.push(new FloatingText(e.x, e.y - e.radius - 6, '💀', {
        color: '#c97aff', glow: '#3aff8c',
      }));
    }
  }));

  dragon.addHook(new Effect(Phase.Destroyed, 0, ctx => {
    Events.emit('summonDied', ctx.bullet);
  }));

  dragon.triggerHooks(Phase.PreActive, { world });
  dragon.triggerHooks(Phase.Spawned, { world });
  dragon.activate(performance.now() / 1000);
  dragon.isEntity = true;
  // 入场特效：紫绿粒子大爆 + 双层光环 + 上飘绿色烟柱 + 大震屏
  for (let i = 0; i < 36; i++) {
    const a = Math.PI * 2 * Math.random();
    const sp = 80 + Math.random() * 130;
    world.particles.push(new Particle({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30,
      life: 0.6 + Math.random() * 0.2,
      color: i % 3 === 0 ? '#3aff8c' : (i % 2 ? '#c97aff' : '#7a3ec0'),
      size: 3.6,
    }));
  }
  // 双环：内紫 / 外绿
  world.particles.push(new Particle({ x, y, life: 0.85, color: '#c97aff', size: 56, type: 'ring' }));
  world.particles.push(new Particle({ x, y, life: 0.65, color: '#3aff8c', size: 38, type: 'ring' }));
  // 上飘绿色不死烟柱（6 颗）
  for (let i = 0; i < 6; i++) {
    world.particles.push(new Particle({
      x: x + (i - 2.5) * 5, y: y,
      vx: 0, vy: -70 - Math.random() * 50,
      life: 0.9, color: '#3aff8c', size: 3.2,
    }));
  }
  // 顶部 💀 飘字（强化"不死"标签）
  world.particles.push(new FloatingText(x, y - r - 10, '💀', { color: '#c97aff', glow: '#3aff8c' }));
  FX.shake(world, 10, 0.36);
  world.bullets.push(dragon);
  Events.emit('summonSpawned', dragon);
  return dragon;
}

// 剑圣 / 觉醒剑圣：召唤类单位（不继承主卡牌效果）。每个敌方回合"瞬移到敌人身边 5 次"，
// 每次到位后挥剑（小范围 cone AOE，damage = saint.attack）。
//   awakened=true（金/钻）：每次挥剑后斩杀 60px 内 <10% HP 的敌人。
//   注意：召唤 = 凭空生成单位 → 与"实体化子弹（子弹变实体，会继承本回合 hooks）"不同。
//   剑圣的攻击属性 / 行为完全由 spawnSwordSaint 自己定义，不读 world._turnHookCards / 主卡 buff。
function spawnSwordSaint(world, opts = {}) {
  const { attack = 5, awakened = false } = opts;
  const player = world.player;
  let x, y;
  if (opts.x != null && opts.y != null) {
    x = opts.x; y = opts.y;
  } else {
    const ang = rand(-Math.PI * 0.7, -Math.PI * 0.3);
    const dist = 90 + rand(0, 40);
    x = player.x + Math.cos(ang) * dist;
    y = player.y + Math.sin(ang) * dist;
  }
  const r = 12;
  const tb = trapBounds(world, y);
  x = clamp(x, tb.leftX + r, tb.rightX - r);
  y = clamp(y, r, world.h - r);

  const saint = new Bullet({
    x, y, angle: 0, speed: 0, lifetime: 9999,
    attack, bound: 0, penetrate: 0,
    bulletCount: 1, waveCount: 1, radius: r,
    entityLayers: 5,
  });
  saint.team = 'ally';
  saint.kind = 'swordSaint';
  saint._isSwordSaint = true;
  saint._awakened = !!awakened;          // 渲染时根据此切换金 / 银配色
  saint._entityDecos = awakened ? ['saint', 'sword', 'sword'] : ['saint', 'sword'];

  // EntityTurn：5 次连续单体攻击（每次瞬移至随机敌人身旁 + 银色透镜剑光斩击）；间隔 180ms
  // 单体攻击 = 只伤害 target 一人（非范围）；命中时绘制 SwordSlashLens（两头尖中间宽的剑光梭形）
  saint.addHook(new Effect(Phase.EntityTurn, 0, ctx => {
    const b = ctx.bullet, w = ctx.world;
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        if (!b.alive) return;
        const alive = w.enemies.filter(e => e.alive && (e.spawnT == null || e.spawnT <= 0));
        if (alive.length === 0) return;
        const target = alive[randInt(0, alive.length - 1)];
        // 瞬移到敌人侧面 + 残影 trail（12 段交替色）
        const fromX = b.x, fromY = b.y;
        const angTo = Math.atan2(target.y - fromY, target.x - fromX);
        const reach = (target.radius || 16) + b.radius + 4;
        const destX = target.x - Math.cos(angTo) * reach;
        const destY = target.y - Math.sin(angTo) * reach;
        const trailColorA = awakened ? '#ffd84a' : '#dde3ec';
        const trailColorB = awakened ? '#fff4c0' : '#aed0ff';
        const steps = 12;
        for (let k = 0; k <= steps; k++) {
          const t = k / steps;
          w.particles.push(new Particle({
            x: fromX + (destX - fromX) * t,
            y: fromY + (destY - fromY) * t,
            life: 0.28, color: k % 2 ? trailColorA : trailColorB, size: 5.5 - k * 0.3,
          }));
        }
        // 起 / 落点闪环
        w.particles.push(new Particle({ x: fromX, y: fromY, life: 0.22, color: trailColorB, size: 18, type: 'ring' }));
        b.x = destX; b.y = destY;
        w.particles.push(new Particle({ x: destX, y: destY, life: 0.3, color: '#ffffff', size: 22, type: 'ring' }));

        // 单体攻击：直接对 target takeDamage（不走 HitEnemy 钩子 → 不应用主卡 buff）
        const dmg = b.attack;
        const dealt = target.takeDamage(dmg);
        if (dealt) {
          FX.damage(w, target.x, target.y - target.radius, dmg);
          if (typeof target.applyKnockback === 'function') {
            target.applyKnockback(b.x, b.y, clamp(3 + dmg * 0.6, 3, 10));
          }
        }

        // 剑光斩击特效：透镜（两头尖、中间宽）落在敌人身上，方向随每刀微随机
        const slashAngle = angTo + (Math.random() - 0.5) * 0.7;
        const slashLen = (target.radius || 16) * 2.6;
        const slashWidth = (target.radius || 16) * 0.42;
        w.particles.push(new SwordSlashLens(
          target.x, target.y, slashAngle, slashLen, slashWidth, trailColorA
        ));
        // 命中火星沿斩击方向溅射
        for (let k = 0; k < 10; k++) {
          const aa = slashAngle + (Math.random() - 0.5) * 0.6;
          const sp = 90 + Math.random() * 90;
          w.particles.push(new Particle({
            x: target.x, y: target.y,
            vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp,
            life: 0.32 + Math.random() * 0.18,
            color: awakened ? '#ffd84a' : '#ffffff', size: 2.2,
          }));
        }
        FX.shake(w, awakened ? 4 : 3, 0.12);
        // 觉醒：每次攻击后斩杀 60px 内 <10% HP 的敌人
        if (awakened) {
          for (const e of w.enemies) {
            if (!e.alive || e === target) continue;
            const d = Math.hypot(e.x - target.x, e.y - target.y);
            if (d > 60) continue;
            if (e.maxHp > 0 && e.hp / e.maxHp >= 0.10) continue;
            const killHp = e.hp;
            e.takeDamage(99999);
            FX.damage(w, e.x, e.y - e.radius, killHp);
            for (let k = 0; k < 10; k++) {
              const a = Math.PI * 2 * Math.random();
              w.particles.push(new Particle({
                x: e.x, y: e.y, vx: Math.cos(a) * 110, vy: Math.sin(a) * 110,
                life: 0.35, color: '#ffd84a', size: 2.6,
              }));
            }
          }
        }
      }, i * 180);
    }
  }));

  saint.addHook(new Effect(Phase.Destroyed, 0, ctx => {
    Events.emit('summonDied', ctx.bullet);
  }));

  saint.triggerHooks(Phase.PreActive, { world });
  saint.triggerHooks(Phase.Spawned, { world });
  saint.activate(performance.now() / 1000);
  saint.isEntity = true;
  // 入场视觉：金/银双层粒子爆裂 + 同色光环
  const primary = awakened ? '#ffd84a' : '#dde3ec';
  const secondary = awakened ? '#fff4c0' : '#aed0ff';
  for (let i = 0; i < 22; i++) {
    const a = Math.PI * 2 * Math.random();
    const sp = 70 + Math.random() * 100;
    world.particles.push(new Particle({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20,
      life: 0.5, color: i % 2 ? primary : secondary, size: 3.0,
    }));
  }
  // 双环：内环厚 / 外环薄
  world.particles.push(new Particle({ x, y, life: 0.6, color: primary, size: 40, type: 'ring' }));
  world.particles.push(new Particle({ x, y, life: 0.45, color: secondary, size: 26, type: 'ring' }));
  if (awakened) {
    // 觉醒额外金色"光柱"上升 — 4 颗向上飘
    for (let i = 0; i < 4; i++) {
      world.particles.push(new Particle({
        x: x + (i - 1.5) * 6, y: y,
        vx: 0, vy: -90 - Math.random() * 40,
        life: 0.7, color: '#ffd84a', size: 3.4,
      }));
    }
  }
  FX.shake(world, 6, 0.22);
  world.bullets.push(saint);
  Events.emit('summonSpawned', saint);
  return saint;
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
  playSfx('arcaneSwoosh', 40);
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
      if (self._shotCount === 0) {
        world.addComboStacks(1);
      }
    },
  },
  summon: {
    id: 'summon', name: '召唤炮台', desc: '每发射2次，获得+1实体化。',
    icon: '🪄', color: '#a060d0',
    baseColor: '#4a2a6a', strokeColor: '#1a0830', barrelColor: '#c89edd',
    onFire(self, world, tpl) {
      self._shotCount = ((self._shotCount || 0) + 1) % 2;
      if (self._shotCount === 0) {
        tpl.entityLayers += 1;
      }
    },
  },
  power: {
    id: 'power', name: '强能炮台', desc: '波次+1，主卡牌消耗+1。',
    icon: '⚡', color: '#7eb1ff',
    baseColor: '#4a6fa5', strokeColor: '#1a2840', barrelColor: '#aed0ff',
    mainCostMod: 1,
    onFire(self, world, tpl) {
      tpl.waveCount += 1;
    },
  },
};

const CANNON_TR = {
  chain:  { zh: { name: '锁链炮台', desc: '每发射3次，获得1层连携。' },
            en: { name: 'Chain Cannon', desc: 'Every 3 shots, gain 1 Chain stack.' } },
  summon: { zh: { name: '召唤炮台', desc: '每发射2次，获得+1实体化。' },
            en: { name: 'Summon Cannon', desc: 'Every 2 shots, gain +1 Entity layer.' } },
  power:  { zh: { name: '强能炮台', desc: '波次+1，主卡牌消耗+1。' },
            en: { name: 'Power Cannon', desc: 'Wave +1. Main card cost +1.' } },
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
    // 永久正面：当此牌在手牌中，始终为正面（不受边缘 / _foresightFaceUp 限制）。
    // 用于"造访剑圣 钻"等需要持续展露才生效的卡牌。
    this._alwaysFaceUp = !!def.alwaysFaceUp;
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
    let d = this._def.desc;
    if (!d) return '';
    if (typeof d === 'function') d = d(this);
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

// 关卡 snapshot 用：重建一张干净的卡（fresh familyId+tier），只保留玩家手动设的 locked 标记。
// 关卡内副作用（_battleCostOverride / _costMod / _foresightFaceUp / _destroyAfterUse / 替换标记 等）全部丢弃。
function _cloneCardForStageSnapshot(c) {
  if (!c) return null;
  const fresh = new Card(c.familyId, c.tier);
  if (c.locked) fresh.locked = true;
  return fresh;
}

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

// 给背包槽（商店面板 + 整理面板共用）右上角加 锁定 / 剔除 两个动作按钮。
// 调用方负责传 onChange（用户操作后重渲该面板的回调）。
// 主卡（index 0）只能锁定，不能剔除；剔除按二次点击确认（防误触）。
function attachBagSlotActions(el, card, index, world, onChange) {
  if (!card) return;
  if (card.locked) el.classList.add('bag-slot-locked');
  const actions = document.createElement('div');
  actions.className = 'bag-slot-actions';
  // 锁定按钮
  const lockBtn = document.createElement('button');
  lockBtn.type = 'button';
  lockBtn.className = 'bag-slot-act bag-slot-lock' + (card.locked ? ' active' : '');
  lockBtn.textContent = card.locked ? '🔒' : '🔓';
  lockBtn.title = t(card.locked ? 'slot_unlock_tip' : 'slot_lock_tip');
  lockBtn.addEventListener('mousedown', e => { e.stopPropagation(); });
  lockBtn.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); });
  lockBtn.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    card.locked = !card.locked;
    onChange?.();
  });
  actions.appendChild(lockBtn);
  // 剔除按钮（主卡禁用）— 收费：本局第 N 次剔除花 10 × 2^N
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'bag-slot-act bag-slot-remove';
  const _removalGold = () => (typeof world.removalCost === 'function' ? world.removalCost() : 10);
  removeBtn.innerHTML = `<span class="x">✕</span><span class="cost">💰${_removalGold()}</span>`;
  removeBtn.title = t('slot_remove_tip');
  if (index === 0) removeBtn.classList.add('disabled');
  removeBtn.addEventListener('mousedown', e => { e.stopPropagation(); });
  removeBtn.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); });
  removeBtn.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    if (index === 0) { toast(t('slot_main_no_remove'), 0.8); return; }
    if (world.deck.bag.length <= 2) { toast(t('slot_min_keep'), 0.9); return; }
    if (card.locked) { toast(t('slot_locked_remove'), 0.9); return; }
    const cost = _removalGold();
    if ((world.gold || 0) < cost) { toast(t('slot_remove_need_gold', { n: cost }), 1.0); return; }
    if (!removeBtn._confirming) {
      removeBtn._confirming = true;
      removeBtn.classList.add('confirm');
      removeBtn._timer = setTimeout(() => {
        removeBtn._confirming = false;
        removeBtn.classList.remove('confirm');
      }, 2000);
      toast(t('slot_remove_confirm_cost', { n: cost }), 1.4);
      return;
    }
    clearTimeout(removeBtn._timer);
    const removed = world.deck.removeAt(index);
    if (removed) {
      world.gold -= cost;
      world.removalCount = (world.removalCount || 0) + 1;
      Events.emit('goldChanged', world.gold);
      world.removedFamilyIds = world.removedFamilyIds || new Set();
      world.removedFamilyIds.add(removed.familyId);
      toast(t('slot_removed_toast_paid', { name: removed.name, n: cost }), 1.4);
    }
    onChange?.();
  });
  actions.appendChild(removeBtn);
  el.appendChild(actions);
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
    // rect kind: 矩形判定（dirAngle = 长边方向；length = 长度，halfWidth = 半宽）。
    // 不用 r 球形判定；先把目标坐标旋转到矩形局部坐标系再判定。
    if (opts.kind === 'rect') {
      const cosA = Math.cos(-opts.dirAngle), sinA = Math.sin(-opts.dirAngle);
      const lx = dx * cosA - dy * sinA;     // 沿长边方向（>0 = 前方）
      const ly = dx * sinA + dy * cosA;     // 沿短边方向
      const rad = v.radius || 0;
      // 长边：0 到 length；短边：-halfWidth..+halfWidth；擦边算中（含 radius）
      if (lx < -rad || lx > opts.length + rad) continue;
      if (Math.abs(ly) > opts.halfWidth + rad) continue;
    } else {
      // 擦边算中：受害者半径计入
      if (d > r + (v.radius || 0)) continue;
      if (opts.kind === 'cone') {
        let diff = Math.atan2(dy, dx) - opts.dirAngle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        if (Math.abs(diff) > opts.halfAngle) continue;
      }
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
    } else if (opts.kind === 'rect') {
      // 矩形 AOE 视觉：沿长边洒一串 ring + 在中线撒火星
      const len = opts.length, hw = opts.halfWidth;
      const cosA = Math.cos(opts.dirAngle), sinA = Math.sin(opts.dirAngle);
      const steps = Math.max(4, Math.round(len / 40));
      for (let i = 0; i <= steps; i++) {
        const lx = (i / steps) * len;
        const px = cx + cosA * lx;
        const py = cy + sinA * lx;
        world.particles.push(new Particle({
          x: px, y: py, life: 0.4, color: opts.color || '#ef7878',
          size: hw * 0.5, type: 'ring',
        }));
      }
      // 中心爆点
      for (let k = 0; k < 12; k++) {
        const a = Math.PI * 2 * Math.random();
        const sp = 80 + Math.random() * 120;
        world.particles.push(new Particle({
          x: cx + cosA * len * 0.5, y: cy + sinA * len * 0.5,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: 0.35, color: opts.color || '#ef7878', size: 3,
        }));
      }
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
      // v5：每个亡灵法师每次弃牌召唤 2 个骷髅
      for (let i = 0; i < 2; i++) {
        spawnSkeleton(world, { x: b.x + rand(-20, 20), y: b.y + rand(-20, 20) });
      }
    }
  }
}

// ─── 奥弹自动发射（旧 Card_奥弹 等价实现）──────────────────────────
// 数量+N / 波次+N（来自洗入时刻 snapshot 的卡牌）会真的让这颗奥弹分裂为多颗 / 多波，
// 而不是去洗入更多奥弹卡。流程：
//   1) 先用一个"探针 tpl bullet"跑一遍 PreActive，读出最终 bulletCount / waveCount。
//   2) 按 waveCount 分波（每波间隔 120ms，复用 fireOneWave 节奏），每波 spawn bulletCount 颗。
//   3) 每颗奥弹仍各自从炮台周围随机环形点 spawn（保留原本的发射手感）。
// 奥弹自动发射队列：多张奥弹同时被洗面 → 依次入队 + 间隔触发，让每发都有自己的"嗖"音效
// gap = 110ms：足够听清独立音效，又不会感觉拖泥带水（5 张奥弹 ≈ 0.5s 完成）
const _arcaneFireQueue = [];
let _arcaneFireBusy = false;
function _enqueueArcaneFire(world, card) {
  _arcaneFireQueue.push({ world, card });
  if (!_arcaneFireBusy) _drainArcaneFireQueue();
}
function _drainArcaneFireQueue() {
  if (_arcaneFireQueue.length === 0) { _arcaneFireBusy = false; return; }
  _arcaneFireBusy = true;
  const { world, card } = _arcaneFireQueue.shift();
  // 出队时再次校验：卡可能在等待中被弃 / 概念 / 销毁
  if (world && world.deck.hand.includes(card) && card.faceUp) {
    _autoFireArcaneMissile(world, card);
    card._lastAction = 'buff';
    world.deck.destroyCard(card);
  } else if (card) {
    card._firing = false;
  }
  setTimeout(_drainArcaneFireQueue, 110);
}

function _autoFireArcaneMissile(world, card) {
  const player = world.player;
  const evo = world._arcaneEvo || {};
  playSfx('arcaneSwoosh', 0);   // 队列已保证时间差，这里不再节流

  // 构造"模板"奥弹：装上洗入时刻 snapshot 的钩子 + 奥术进化的 buff，跑一次 PreActive
  // 之后从 tpl 读 bulletCount / waveCount / attack / bound / penetrate 等结算后属性
  const makeTpl = () => {
    const tpl = new Bullet({
      x: player.x, y: player.y, angle: 0,
      speed: 360, lifetime: 3.5,
      attack: 1 + (card._arcBonus || 0) + (evo.dmg || 0),
      bound: 0 + (evo.bound || 0), penetrate: 0 + (evo.pen || 0), radius: 6,
      bulletCount: 1, waveCount: 1,
    });
    tpl.isArcane = true;
    tpl.tracking = true;
    if (evo.fire > 0) {
      tpl._fireOnHit = (tpl._fireOnHit || 0) + evo.fire;
      tpl.addHook(_fireApplyHook);
    }
    if (evo.freezeChance > 0) {
      const chance = evo.freezeChance;
      tpl.addHook(new Effect(Phase.OnHit, -1, ctx => {
        if (Math.random() < chance) applyFreeze(ctx.enemy, 1);
      }));
    }
    // 注：旧版会把 card._inheritedHooks（洗入时刻 snapshot 的本回合用卡）当作 hook 全部
    //   塞到 tpl 上 → 让 boost1 / 凝视 等顺带 buff 奥弹。已移除：奥弹只吃显式 buff —
    //   _arcBonus（奥术强化）、world._arcaneEvo（奥术进化衍生）、_contCastBuffs（持续施法）。
    // 持续施法洗入的奥弹自带随机强化（buff 函数数组），在 PreActive 之后注入到模板
    if (card._contCastBuffs) {
      for (const fn of card._contCastBuffs) fn(tpl);
      // freezeChance 由 _contCastBuffs 设置 → 注册一次冻结钩子
      if (tpl._freezeChance && tpl._freezeChance > 0) {
        const chance = tpl._freezeChance;
        tpl.addHook(new Effect(Phase.OnHit, -1, ctx => {
          if (Math.random() < chance) applyFreeze(ctx.enemy, 1);
        }));
      }
      if (tpl._fireOnHit && tpl._fireOnHit > 0 && !tpl._fireHookAdded) {
        tpl.addHook(_fireApplyHook);
        tpl._fireHookAdded = true;
      }
    }
    tpl.triggerHooks(Phase.PreActive, { world });
    return tpl;
  };

  // 单颗奥弹 spawn（从炮台周围随机环形点起飞）
  const spawnOne = (tpl) => {
    const offA = Math.random() * Math.PI * 2;
    const offR = 24 + Math.random() * 14;
    const sx = player.x + Math.cos(offA) * offR;
    const sy = player.y + Math.sin(offA) * offR;
    const target = nearestEnemy(world, { x: sx, y: sy });
    const baseAngle = target
      ? angleBetween(sx, sy, target.x, target.y)
      : (player.angle ?? -Math.PI / 2);
    const initAngle = baseAngle + (Math.random() - 0.5) * (Math.PI / 2.6);
    const bullet = new Bullet({
      x: sx, y: sy, angle: initAngle,
      speed: tpl.speed, lifetime: tpl.lifetime,
      attack: tpl.attack, bound: tpl.bound, penetrate: tpl.penetrate, radius: tpl.radius,
    });
    bullet.isArcane = true;
    bullet.tracking = true;
    bullet.copyHooksFrom(tpl);
    if (tpl._fireOnHit) bullet._fireOnHit = tpl._fireOnHit;
    bullet.triggerHooks(Phase.Spawned, { world });
    bullet.activate(performance.now() / 1000);
    world.bullets.push(bullet);
    if (player.notifyFired) player.notifyFired(world);
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

  const fireSalvo = () => {
    const tpl = makeTpl();
    const waves = Math.max(1, tpl.waveCount);
    const perWave = Math.max(1, tpl.bulletCount);
    for (let w = 0; w < waves; w++) {
      setTimeout(() => {
        for (let i = 0; i < perWave; i++) spawnOne(tpl);
      }, w * 120);
    }
  };

  fireSalvo();
  if (card._arcDoubleFire) setTimeout(fireSalvo, 100);
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
      zh: `实体化+${ent}，速度大幅降低。每回合攻击最近的敌人。当你弃牌时，召唤2个骷髅。`,
      en: `Entity+${ent}, greatly reduced speed. Each turn attacks the nearest enemy. When you discard, summon 2 Skeletons.`,
    },
    effects: () => [
      // 所有钩子在 ctx.bullet._isSkeleton 时早退：召唤的骷髅继承本回合用过的卡牌效果，
      // 但不应继承"亡灵法师自身"的光环（避免无限传染 / 弃牌爆炸）。
      new Effect(Phase.PreActive, 0, ctx => {
        if (ctx.bullet._isSkeleton) return;
        ctx.bullet.entityLayers += ent; ctx.bullet.speed *= 0.05;
      }),
      new Effect(Phase.Spawned, 0, ctx => {
        if (ctx.bullet._isSkeleton) return;
        (ctx.bullet._entityDecos = ctx.bullet._entityDecos || []).push('skull');
        ctx.bullet._isNecromancer = true;
      }),
      new Effect(Phase.EntityTurn, 0, ctx => {
        if (ctx.bullet._isSkeleton) return;
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

// 骷髅领主：实体子弹，每回合攻击最近的敌人 attacksPerTurn 次，击杀则召唤 1 骷髅。
// 友军骷髅死亡时获得 +1 攻击（v6 改：原本是 +1 实体化层）。
// v9 改：金 实体化+4 / 钻 实体化+3（之前都是 +2）
function _skeletonLordTier(attacksPerTurn, ent, value) {
  const attackPart = attacksPerTurn > 1 ? `每回合攻击最近的敌人${attacksPerTurn}次` : `每回合攻击最近的敌人`;
  const attackPartEn = attacksPerTurn > 1
    ? `Each turn attacks the nearest enemy ${attacksPerTurn} times`
    : `Each turn attacks the nearest enemy`;
  return {
    cost: 3, value,
    desc: {
      zh: `实体化+${ent}。在场时，每个死亡的骷髅会为此单位提供+1伤害。${attackPart}，如果击杀则召唤1个骷髅。`,
      en: `Entity+${ent}. While alive, each dead skeleton grants +1 damage. ${attackPartEn}; on kill, summons 1 skeleton.`,
    },
    effects: () => [
      new Effect(Phase.PreActive, 0, ctx => {
        if (ctx.bullet._isSkeleton) return;
        ctx.bullet.entityLayers += ent;
      }),
      new Effect(Phase.Spawned, 0, ctx => {
        if (ctx.bullet._isSkeleton) return;
        const b = ctx.bullet;
        (b._entityDecos = b._entityDecos || []).push('skull');
        if (b._skLordHandler) return;
        b._skLordHandler = (s) => {
          if (!b.alive) return;
          if (!s || s.kind !== 'skeleton') return;
          b.attack = (b.attack || 0) + 1;
        };
        Events.on('summonDied', b._skLordHandler);
      }),
      new Effect(Phase.EntityTurn, 0, ctx => {
        if (ctx.bullet._isSkeleton) return;
        const b = ctx.bullet, w = ctx.world;
        for (let i = 0; i < attacksPerTurn; i++) {
          setTimeout(() => {
            if (!b.alive) return;
            const target = _nearestEnemyTo(w, b.x, b.y);
            if (!target) return;
            const bb = new Bullet({
              x: b.x, y: b.y,
              angle: angleBetween(b.x, b.y, target.x, target.y),
              speed: 380, lifetime: 2.2,
              attack: b.attack, bound: 0, penetrate: 0,
              bulletCount: 1, waveCount: 1, radius: 6,
            });
            bb._fromAlly = true;
            bb.tracking = true;
            // 击杀时召唤 1 骷髅。旧实现 bug：发射时预测 willKill，命中时再 check e.alive。
            //   HitEnemy 钩子在 _defaultHitEnemy（实际伤害）之前触发 → e.alive 永远 true → 永不召唤。
            //   改：始终挂钩子，命中时实时检查 e.hp - bb.attack ≤ 0 即判定为击杀（伤害结算前）。
            bb.addHook(new Effect(Phase.HitEnemy, -1, ctx2 => {
              const e = ctx2.enemy;
              if (!e || !e.alive) return;
              if (e.hp - (bb.attack || 0) > 0) return;
              spawnSkeleton(w, { x: b.x + rand(-22, 22), y: b.y + rand(-22, 22) });
            }));
            bb.activate(performance.now() / 1000);
            w.bullets.push(bb);
            for (let k = 0; k < 6; k++) {
              const a = Math.PI * 2 * Math.random();
              w.particles.push(new Particle({
                x: b.x, y: b.y,
                vx: Math.cos(a) * 70, vy: Math.sin(a) * 70,
                life: 0.3, color: '#c97aff', size: 3,
              }));
            }
          }, i * 120);
        }
      }),
      new Effect(Phase.Destroyed, 0, ctx => {
        if (ctx.bullet._isSkeleton) return;
        const b = ctx.bullet;
        if (b._skLordHandler) {
          Events.off('summonDied', b._skLordHandler);
          b._skLordHandler = null;
        }
      }),
    ],
  };
}

// 爆骨花：召唤 1 个骷髅；展露状态下，骷髅死亡时向随机方向造成圆锥范围伤害（+可选骷髅攻击+1）
// 爆骨花：召唤 skN 个骷髅；展露时骷髅死亡造成全圆 AOE。
//   radiusMult：AOE 半径 = 骷髅半径 × radiusMult（小/中/大：3 / 4 / 5）
//   atkBoost：钻级展露时给召唤的骷髅 +N 攻击
function _boneBlossomTier(skN, atkBoost, radiusMult, value, desc) {
  return {
    cost: 3, value, hasRevealFx: true, desc,
    effects: () => [],
    onUse(_, world) { for (let i = 0; i < skN; i++) spawnSkeleton(world); },
    onReveal(card) {
      if (card._bbHandler) return;
      card._bbHandler = (s) => {
        if (!card.faceUp) return;
        if (!s || s.kind !== 'skeleton') return;
        const w = window.__game;
        if (!w) return;
        // 全圆范围伤害：半径 = 骷髅半径 × radiusMult（3/4/5 倍）。
        // 内部公式：AOE 半径 = source.radius × AOE_VOL_RATIO(=6) × mult → 套 mult = radiusMult/6 得到所需倍数
        const dmg = s.attack || 1;
        applyAoe(w, { x: s.x, y: s.y, radius: s.radius || 8 }, {
          damage: dmg, mult: radiusMult / 6, target: 'enemies',
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
        // diamond: 展露时骷髅伤害 +N。给所有未来召唤的骷髅打 buff
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

// ─── 奥术巨人 ──────────────────────────────────────────────────────
// 实体子弹（无攻击力，3 层实体化）。你的奥弹优先以它为目标 → 接触时被"吸收"
// （奥弹销毁，不触发命中 / 穿透 / 燃烧等）→ 累计强化巨人 + 回合末激光。
//
// 累计规则（每种独立计数 → 各自浮点阈值，初始 10、每次触发后阈值 ×1.1）：
//   - 每 10 枚奥弹       → +1 实体化层数
//   - 每 10 累计奥弹伤害 → +1 激光伤害
//   - 每 10 累计奥弹弹射 → +1 激光弹射
//   - 每 10 累计奥弹穿透 → +1 激光长度（=穿透）
//   - 每 10 累计奥弹燃烧 → +1 激光燃烧
//   - 每 10% 累计奥弹冰冻 → +1% 激光冰冻
//
// 回合末激光（EntityTurn）：朝最近敌人发射；金 = 3 命中，钻 = 5 命中 + 累计加成。

// 奥弹被巨人吸收：更新巨人计数器 + 触发各种累计强化
//   + 视觉：紫色环 + spark + 巨人 body 闪光 + buff 数值飘字
//   + 音效：arcaneSwoosh（紫色魔法吸入感）
function _absorbIntoArcaneGiant(giant, missile, world) {
  const s = giant._giantStats = giant._giantStats || {
    count: 0, atkSum: 0, boundSum: 0, penSum: 0, fireSum: 0, freezePctSum: 0,
    // 各维度下一次触发的阈值（初始 10，每触发一次 ×1.1）
    nextEnt: 10, nextLAtk: 10, nextLBound: 10, nextLPen: 10, nextLFire: 10, nextLFreeze: 10,
    // 累积的"激光强化"
    laserAtk: 0, laserBound: 0, laserPen: 0, laserFire: 0, laserFreezePct: 0,
  };
  s.count += 1;
  s.atkSum += missile.attack || 0;
  s.boundSum += missile.bound || 0;
  s.penSum += missile.penetrate || 0;
  s.fireSum += missile._fireOnHit || 0;
  s.freezePctSum += (missile._freezeChance || 0) * 100;

  // 视觉：吸收一颗 → 巨人半径 +1/10 基准
  const baseR = giant._baseRadius || 18;
  giant.radius += baseR * 0.1;

  // 触发：每个维度循环判定，直到不再触发；记录 deltas → 后面飘字
  const buffDeltas = [];
  let entGain = 0;
  while (s.count >= s.nextEnt) {
    s.nextEnt *= 1.1;
    giant.entityLayers += 1;
    giant.entityLayersMax = (giant.entityLayersMax || 0) + 1;
    entGain += 1;
  }
  if (entGain > 0) buffDeltas.push(['ent', entGain]);
  let lAtkGain = 0;
  while (s.atkSum >= s.nextLAtk) { s.nextLAtk *= 1.1; s.laserAtk += 1; lAtkGain += 1; }
  if (lAtkGain > 0) buffDeltas.push(['atk', lAtkGain]);
  let lBndGain = 0;
  while (s.boundSum >= s.nextLBound) { s.nextLBound *= 1.1; s.laserBound += 1; lBndGain += 1; }
  if (lBndGain > 0) buffDeltas.push(['bnd', lBndGain]);
  let lPenGain = 0;
  while (s.penSum >= s.nextLPen) { s.nextLPen *= 1.1; s.laserPen += 1; lPenGain += 1; }
  if (lPenGain > 0) buffDeltas.push(['pen', lPenGain]);
  let lFireGain = 0;
  while (s.fireSum >= s.nextLFire) { s.nextLFire *= 1.1; s.laserFire += 1; lFireGain += 1; }
  if (lFireGain > 0) buffDeltas.push(['fire', lFireGain]);
  while (s.freezePctSum >= s.nextLFreeze) { s.nextLFreeze *= 1.1; s.laserFreezePct += 1; }
  // freezePct 没对应 _BUFF_FX type → 用 ent 蓝色凑用（或可以单独加 'freeze' type，未来扩展）

  // 巨人 body 闪光：标记 _absorbFlashT（Bullet.update 每帧 -dt，draw 时 > 0 → 加亮）
  giant._absorbFlashT = 0.22;

  // 音效：紫色魔法吸入声
  if (typeof playSfx === 'function') playSfx('arcaneSwoosh', 30);

  // 吸收视觉：紫色环 + 几颗 spark
  if (world) {
    world.particles.push(new Particle({
      x: giant.x, y: giant.y, life: 0.28, color: '#c97aff', size: giant.radius * 1.0, type: 'ring',
    }));
    // 外层更亮的"接触瞬闪"环
    world.particles.push(new Particle({
      x: giant.x, y: giant.y, life: 0.18, color: '#ffffff', size: giant.radius * 0.7, type: 'ring',
    }));
    for (let k = 0; k < 8; k++) {
      const a = Math.PI * 2 * Math.random();
      const sp = 70 + Math.random() * 80;
      world.particles.push(new Particle({
        x: missile.x, y: missile.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.3, color: k % 2 ? '#c97aff' : '#ffffff', size: 2.6,
      }));
    }
    // buff 数值飘字（实体加成 / 激光各种强化）— 在巨人头顶分散显示
    if (buffDeltas.length > 0 && typeof _emitEntityBuffFX === 'function') {
      buffDeltas.forEach((d, i) => {
        // 横向错开（每条偏移 ~24px），避免重叠
        const tempEntity = { x: giant.x + (i - (buffDeltas.length - 1) / 2) * 24, y: giant.y, radius: giant.radius };
        _emitEntityBuffFX(world, tempEntity, d[0], d[1]);
      });
    }
  }
}

// 奥术巨人回合末激光：朝最近敌人发射一发"激光"子弹，可穿透 / 弹射 / 燃烧 / 冻结。
// 奥术巨人激光（v8.4 Jinx 大招风格重做）：
//   - 瞬时跨屏激光柱（1300 px ≈ 跨整张地图）
//   - 矩形 AOE 一次性结算所有沿线敌人 damage + 燃烧 + 冻结
//   - 所有命中敌人沿激光方向**强力击退**（不是从巨人径向，而是沿光柱向前推）
//   - 视觉层：60 段沿线渐变 ring（白→淡紫→深紫，前端亮后端淡）+ 巨人 origin 3 圈扩散环
//             + 40 颗光柱两侧火星 + 30 颗 origin 爆裂 + 重屏震 0.5s + 色散 0.3s
function _fireArcaneGiantLaser(world, giant, baseHits) {
  const target = _nearestEnemyTo(world, giant.x, giant.y);
  const angle = target ? angleBetween(giant.x, giant.y, target.x, target.y) : -Math.PI / 2;
  const cosA = Math.cos(angle), sinA = Math.sin(angle);
  const s = giant._giantStats || {};
  // baseHits 作为伤害倍率（旧设计是"同时命中目标数"，新设计激光横扫全屏所有目标 → 改作 dmg scaler）
  const dmg = (1 + (s.laserAtk || 0)) * baseHits;
  const fire = s.laserFire || 0;
  const freezeChance = (s.laserFreezePct || 0) / 100;
  const knockbackForce = 50 + (s.laserBound || 0) * 10;   // laserBound 增强击退距离

  const laserLen = 1300;
  const laserHalfWidth = 32;

  // 伤害 + 击退：用 rect kind AOE，不消耗子弹 / 不走 HitEnemy 钩子链
  applyAoe(world, giant, {
    kind: 'rect',
    cx: giant.x, cy: giant.y,
    damage: dmg, dirAngle: angle,
    length: laserLen, halfWidth: laserHalfWidth,
    target: 'enemies',
    knockback: false,   // 自定义"沿激光方向"击退，不走默认径向
    fx: false,          // 自绘 visual，不要默认 explode ring
    onHit: (enemy) => {
      if (fire > 0) applyFire(enemy, fire);
      if (freezeChance > 0 && Math.random() < freezeChance) applyFreeze(enemy, 1);
      // 沿激光方向击退：构造一个"虚拟源点"在敌人身后（激光来向）→ applyKnockback 推开
      if (enemy.applyKnockback) {
        const pushSrcX = enemy.x - cosA * 100;
        const pushSrcY = enemy.y - sinA * 100;
        enemy.applyKnockback(pushSrcX, pushSrcY, knockbackForce);
      }
    },
  });

  // ─── 视觉 ──────────────────────────────────────────────────
  // 巨人 origin 三圈扩散光环（从内到外）
  for (let i = 0; i < 3; i++) {
    world.particles.push(new Particle({
      x: giant.x, y: giant.y, life: 0.5 + i * 0.12,
      color: i === 0 ? '#ffffff' : '#c97aff',
      size: 30 + i * 28, type: 'ring',
    }));
  }
  // 主光柱：60 段 ring 沿激光方向铺开，颜色从白到紫渐变（"激光柱"视觉）
  // 起点更亮粗，远端淡细 → 标识光的"流向"
  for (let i = 0; i < 60; i++) {
    const t = i / 59;
    const px = giant.x + cosA * laserLen * t;
    const py = giant.y + sinA * laserLen * t;
    // 颜色分段：前 15% 纯白，15-50% 亮紫，50-100% 深紫
    let color;
    if (t < 0.15) color = '#ffffff';
    else if (t < 0.5) color = '#e8b5ff';
    else color = '#9c4bd0';
    // 起点附近最粗 26px，远端 6px
    const size = 26 - t * 20;
    // 寿命：远端短（像激光冷却），近端长（"光源持续"感）
    const life = 0.55 - t * 0.25;
    world.particles.push(new Particle({
      x: px, y: py, life, color, size, type: 'ring',
    }));
  }
  // 光柱两侧火星：40 颗垂直激光方向喷射（朝两边对称）
  const perpA = angle + Math.PI / 2;
  for (let k = 0; k < 40; k++) {
    const t = Math.random();
    const px = giant.x + cosA * laserLen * t;
    const py = giant.y + sinA * laserLen * t;
    const sideSign = Math.random() < 0.5 ? 1 : -1;
    const jitterA = perpA + (Math.random() - 0.5) * 0.5;
    const sp = (120 + Math.random() * 180) * sideSign;
    world.particles.push(new Particle({
      x: px, y: py,
      vx: Math.cos(jitterA) * sp, vy: Math.sin(jitterA) * sp,
      life: 0.4 + Math.random() * 0.3,
      color: Math.random() < 0.5 ? '#dd99ff' : '#ffffff',
      size: 2 + Math.random() * 2,
    }));
  }
  // 巨人 origin 爆裂：30 颗向四面八方
  for (let k = 0; k < 30; k++) {
    const a = Math.PI * 2 * Math.random();
    const sp = 150 + Math.random() * 220;
    world.particles.push(new Particle({
      x: giant.x, y: giant.y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.5, color: k % 3 === 0 ? '#ffffff' : (k % 2 ? '#c97aff' : '#9c4bd0'),
      size: 3 + Math.random() * 1.5,
    }));
  }
  // 远端落点冲击（光柱末端的"爆炸感"）
  const endX = giant.x + cosA * laserLen;
  const endY = giant.y + sinA * laserLen;
  world.particles.push(new Particle({ x: endX, y: endY, life: 0.45, color: '#c97aff', size: 60, type: 'ring' }));
  for (let k = 0; k < 16; k++) {
    const a = Math.PI * 2 * Math.random();
    const sp = 100 + Math.random() * 140;
    world.particles.push(new Particle({
      x: endX, y: endY,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.45, color: k % 2 ? '#dd99ff' : '#ffffff', size: 2.6,
    }));
  }
  // 重屏震 + 色散 + hit-stop（强冲击感）
  FX.shake(world, 12, 0.5);
  FX.hitStop(world, 0.12);
  world.chromaT = Math.max(world.chromaT || 0, 0.32);
}

function _arcaneGiantTier(laserHits, value, descPrefix) {
  return {
    cost: 3, value,
    desc: {
      zh: `实体化+3。你的奥弹优先以本单位为目标并强化本单位。回合结束时，发射${descPrefix}激光。`,
      en: `Entity+3. Your Arcane Missiles prioritize this unit and empower it. At turn end, fires a ${descPrefix === '巨型强力' ? 'massive supercharged' : 'massive'} laser.`,
    },
    effects: () => [
      new Effect(Phase.PreActive, 0, ctx => {
        if (ctx.bullet._isSkeleton) return;
        // PreActive 改 tpl 数值字段（fireOneWave 会复制到 clone）
        ctx.bullet.entityLayers += 3;
        ctx.bullet.attack = 0;                   // 巨人本身无接触伤害
        ctx.bullet.radius = Math.max(ctx.bullet.radius, 18);
      }),
      new Effect(Phase.Spawned, 0, ctx => {
        if (ctx.bullet._isSkeleton) return;
        // ⚠ Spawned 在每颗 clone 上跑（PreActive 只在 tpl 上跑，clone 不继承自定义 _ 字段）
        // 所以 _isArcaneGiant / _baseRadius / _laserHits 必须在这里设 → 否则 clone 拿不到，
        //   导致 Bullet.draw 颜色 cascade fallback 黄色 + 奥弹追踪找不到巨人。
        ctx.bullet._isArcaneGiant = true;
        ctx.bullet._baseRadius = ctx.bullet.radius;
        ctx.bullet._laserHits = laserHits;
        (ctx.bullet._entityDecos = ctx.bullet._entityDecos || []).push('arcane');
      }),
      new Effect(Phase.EntityTurn, 0, ctx => {
        if (ctx.bullet._isSkeleton) return;
        _fireArcaneGiantLaser(ctx.world, ctx.bullet, ctx.bullet._laserHits || laserHits);
      }),
    ],
  };
}

// 战旗：使用 → 给所有当前友方实体子弹 +auraDmg 伤害（一次性）。
// 展露：当友方实体被召唤时，使其 +spawnDmg 伤害与 +1 实体化层（持续，直到此牌离开正面状态）。
function _warBannerTier(auraDmg, spawnDmg, value) {
  return {
    cost: 3, value, hasRevealFx: true,
    desc: {
      zh: `你场上的实体+${auraDmg}伤害。展露：当一个友方实体生成时，使其+${spawnDmg}伤害与+1实体化。`,
      en: `Your entities on the field gain +${auraDmg} damage. Reveal: each summoned friendly entity gets +${spawnDmg} damage and +1 Entity layer.`,
    },
    effects: () => [],
    onUse(_, world) {
      // 一次性 aura：场上所有活着的友方实体（含已进入实体态 / 仍带 entityLayers 的飞行体）+ auraDmg。
      // 也覆盖正在飞行但有 entityLayers 的子弹（如 撒豆成兵 还没落地就吃 aura；不再等 bulletEntity）。
      for (const b of world.bullets) {
        if (!b.alive || b.team === 'enemy') continue;
        const isEntityish = b.isEntity || (b.entityLayers || 0) > 0 || b._isSkeleton;
        if (!isEntityish) continue;
        b.attack = (b.attack || 0) + auraDmg;
      }
    },
    onReveal(card) {
      if (card._wbHandler) return;
      // 单只单位只 buff 一次：用 _wbBuffed 集合记 bullet 引用避免重复（summonSpawned + bulletEntity 都会触发）
      const apply = (b) => {
        if (!card.faceUp) return;
        if (!b || b.team === 'enemy') return;
        if (b._wbBuffed) return;
        // 友方"实体类"判定：显式 skeleton / 已 isEntity / 仍带 entityLayers 的飞行体
        const isEntityish = b._isSkeleton || b.isEntity || (b.entityLayers || 0) > 0;
        if (!isEntityish) return;
        b._wbBuffed = true;
        b.attack = (b.attack || 0) + spawnDmg;
        b.entityLayers = (b.entityLayers || 0) + 1;
        if (b.entityLayersMax != null) b.entityLayersMax += 1;
      };
      card._wbHandler = apply;
      Events.on('summonSpawned', apply);   // 骷髅 / 龙 / 剑圣 等显式 spawn
      Events.on('bulletEntity', apply);    // 撒豆成兵 等"飞行 → 实体态"自然转化
    },
    onConceal(card) {
      if (card._wbHandler) {
        Events.off('summonSpawned', card._wbHandler);
        Events.off('bulletEntity', card._wbHandler);
        card._wbHandler = null;
      }
    },
  };
}

// 掘墓（钻）：发现 1 张骷髅家族牌洗入手牌（face-up，临时）；在你回合结束时自动弃置。
function _excavateTombTier(value) {
  return {
    cost: 2, value,
    desc: {
      zh: '发现1张临时的骷髅卡牌并洗入你的手牌，它会在你回合结束时自动弃置。',
      en: 'Discover 1 temporary Skeleton card and shuffle it into your hand; auto-discards at end of your turn.',
    },
    effects: () => [],
    onUse(card, world) {
      const fams = [...SKELETON_FAMILY_IDS].filter(fid => fid !== card.familyId);
      const candidates = [];
      const used = new Set();
      let safety = 40;
      while (candidates.length < 3 && used.size < fams.length && safety-- > 0) {
        const fid = fams[randInt(0, fams.length - 1)];
        if (used.has(fid)) continue;
        used.add(fid);
        const fam = CARD_DATA[fid];
        let tier = card.tier;
        if (!fam.tiers[tier]) {
          for (const tk of ['diamond','gold','silver','bronze']) {
            if (fam.tiers[tk]) { tier = tk; break; }
          }
        }
        if (fam.tiers[tier]) candidates.push(mkCard(fid, tier));
      }
      if (candidates.length === 0) return;
      triggerDiscover(world, {
        candidates,
        sourceCard: card,
        title: LANG.current === 'zh' ? '掘墓' : 'Excavate Tomb',
        sub: LANG.current === 'zh' ? '选择一张骷髅牌' : 'Pick a Skeleton card',
        onPick: (chosen) => {
          chosen._destroyAfterUse = true;
          chosen._autoDiscardAtTurnEnd = true;
          world.deck.shuffleIntoHand(chosen);
          chosen._foresightFaceUp = true;
          world.deck._setFace(chosen, true);
          Events.emit('deckChanged');
        },
      });
    },
  };
}

// 骷髅号角：召唤 N 骷髅，并给"场上当前所有骷髅"（含此次召唤）+D 伤害。弃置 = 使用。
// 注意：buff 只作用一次性、对当前场上骷髅；不影响未来召唤的骷髅。
function _skeletonHornTier(skN, atkBoost, value) {
  const apply = (world) => {
    for (let i = 0; i < skN; i++) spawnSkeleton(world);
    // 骷髅现在是 world.bullets 中的实体化子弹（_isSkeleton 标记）
    for (const b of world.bullets) {
      if (b.alive && b._isSkeleton) b.attack = (b.attack || 0) + atkBoost;
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

// 剑士：实体化+ent 实体，每回合向最近敌人挥剑造成 cone AOE
// v9 改动：所有 tier 都"体积增大"（bullet.radius × volumeMul）；钻"每命中+1 攻击"（永久叠加 b.attack）
//   atk          : PreActive 加伤害（铜为 0）
//   ent          : PreActive 加实体化层数
//   half         : 锥形 AOE 半角（rad）—— total 角度 = 2*half
//   reachMult    : AOE 半径倍率（钻 1.5 = +50% reach）
//   volumeMul    : bullet.radius 倍率（"体积增大" 1.4×）
//   hitStackAtk  : 命中 N 个敌人时 b.attack += N（钻特性）
function _swordsmanTier({ atk = 0, ent, half, reachMult = 1, volumeMul = 1.4, hitStackAtk = false, value, desc }) {
  return {
    cost: 3, value, desc,
    effects: () => [
      new Effect(Phase.PreActive, 0, ctx => {
        if (atk > 0) ctx.bullet.attack += atk;
        ctx.bullet.entityLayers += ent;
        if (volumeMul && volumeMul !== 1) ctx.bullet.radius *= volumeMul;
      }),
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
        // 钻级：每命中一个敌人，伤害 +1（永久写入 b.attack，累积到下一回合）
        if (hitStackAtk && hits > 0) b.attack = (b.attack || 0) + hits;
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

// 弓箭手（v9 新增）：实体子弹，每回合远离最近敌人 + 发射 1 枚 tracking 弓箭。
//   atk         : PreActive 加伤害
//   allPierce   : 钻级特性 — 发射的弓箭穿透所有敌人（penetrate=99）
// 躲避方式：以敌人为起点 → 自己为方向，延长线上移动一段距离（即"反向远离敌人"）
function _archerTier(atk, allPierce, value) {
  const pierceTail = allPierce ? '该弓箭会穿透所有敌人。' : '';
  const pierceTailEn = allPierce ? ' The arrow pierces all enemies.' : '';
  return {
    cost: 3, value,
    desc: {
      zh: `伤害+${atk}，实体化+2。每回合躲避最近的敌人，并向其发射1枚弓箭。${pierceTail}`,
      en: `Damage+${atk}, Entity+2. Each turn dodges the nearest enemy and fires 1 arrow at them.${pierceTailEn}`,
    },
    effects: () => [
      new Effect(Phase.PreActive, 0, ctx => {
        if (ctx.bullet._isSkeleton) return;
        ctx.bullet.attack += atk;
        ctx.bullet.entityLayers += 2;
      }),
      new Effect(Phase.Spawned, 0, ctx => {
        if (ctx.bullet._isSkeleton) return;
        (ctx.bullet._entityDecos = ctx.bullet._entityDecos || []).push('archer');
      }),
      new Effect(Phase.EntityTurn, 0, ctx => {
        if (ctx.bullet._isSkeleton) return;
        const b = ctx.bullet, w = ctx.world;
        const target = _nearestEnemyTo(w, b.x, b.y);
        if (!target) return;
        // 1. 躲避：以敌人为起点 → 自己为方向，沿延长线移动 80px（往远离敌人方向）
        const dx = b.x - target.x, dy = b.y - target.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.01) {
          const moveDist = 80;
          const nx = dx / dist, ny = dy / dist;
          let newX = b.x + nx * moveDist;
          let newY = b.y + ny * moveDist;
          // 限制在战场梯形内
          newY = clamp(newY, b.radius, (w.h || 560) - b.radius);
          const tb = trapBounds(w, newY);
          newX = clamp(newX, tb.leftX + b.radius, tb.rightX - b.radius);
          // 躲避粒子（从旧位置）
          for (let k = 0; k < 6; k++) {
            const a = Math.PI * 2 * Math.random();
            w.particles.push(new Particle({
              x: b.x, y: b.y,
              vx: Math.cos(a) * 90, vy: Math.sin(a) * 90,
              life: 0.32, color: '#7eb1ff', size: 2.6,
            }));
          }
          b.x = newX; b.y = newY;
        }
        // 2. 发射弓箭（tracking + 钻级 all-pierce）
        const arrow = new Bullet({
          x: b.x, y: b.y,
          angle: angleBetween(b.x, b.y, target.x, target.y),
          speed: 480, lifetime: 2.4,
          attack: b.attack, bound: 0, penetrate: allPierce ? 99 : 0,
          bulletCount: 1, waveCount: 1, radius: 5,
        });
        arrow._fromAlly = true;
        arrow.tracking = true;
        arrow._archerArrow = true;
        arrow.activate(performance.now() / 1000);
        w.bullets.push(arrow);
        // 弓箭起飞粒子
        for (let k = 0; k < 5; k++) {
          const a = Math.PI * 2 * Math.random();
          w.particles.push(new Particle({
            x: b.x, y: b.y,
            vx: Math.cos(a) * 70, vy: Math.sin(a) * 70,
            life: 0.28, color: '#aed0ff', size: 2.4,
          }));
        }
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

function _arcaneboostTier(missileCount, boost, value) {
  return {
    cost: 2, value,
    desc: {
      zh: `洗入${missileCount}张奥弹。你手牌中的奥弹伤害+${boost}。`,
      en: `Shuffle in ${missileCount} Arcane Missiles. Arcane Missiles in hand gain +${boost} damage.`,
    },
    effects: () => [],
    onUse(_, world) {
      // 显式 buff：现有手牌中的奥弹获得 +boost 伤害（卡面说了"你手牌中的奥弹伤害+N"）
      for (const c of world.deck.hand) {
        if (c.familyId === 'arcane_missile') {
          c._arcBonus = (c._arcBonus || 0) + boost;
        }
      }
      // 洗入新奥弹时只携带 _arcBonus（显式 buff），不继承本回合的其它卡（设计上奥弹只吃显式 buff）
      for (let i = 0; i < missileCount; i++) {
        const newCard = mkCard('arcane_missile', 'silver');
        newCard._arcBonus = boost;
        world.deck.shuffleIntoHand(newCard);
      }
    },
  };
}

function _snipeTier(perPx, value, desc) {
  return {
    cost: 1, value, desc,
    effects: () => [
      // 基础 +2 伤害（所有 tier 共有）
      new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.attack += 2; }),
      new Effect(Phase.Spawned, 0, ctx => {
        const b = ctx.bullet;
        b._snipeStartX = b.x;
        b._snipeStartY = b.y;
        b._snipeBaseAttack = b.attack;     // 此时已含 +2 基础
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
    cost: 2, value, desc,
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

// 热气球（v9 重写）：体积放大 + 实体化+1；金/钻 额外：实体化层数不会在回合结束时消退（_noEntityDecay）
//   atk          : 加伤害（铜银 0，金 1，钻 2）
//   radiusMult   : 体积放大（"体积增加" 1.2× / "体积大幅增加" 2.0×）
//   noDecay      : 实体化层不会在回合结束扣 1 层（金/钻特性）
function _hotairTier(atk, radiusMult, noDecay, value) {
  const sizeWord = radiusMult >= 1.5 ? '体积大幅增加' : '体积增加';
  const sizeWordEn = radiusMult >= 1.5 ? 'greatly increased size' : 'larger size';
  const atkPart = atk > 0 ? `伤害+${atk}，` : '';
  const atkPartEn = atk > 0 ? `Damage+${atk}, ` : '';
  const tailZh = noDecay ? '实体化层数不会在回合结束时消退。' : '';
  const tailEn = noDecay ? ' Entity layers do not decay at turn end.' : '';
  return {
    cost: 1, value,
    desc: {
      zh: `${atkPart}实体化+1，${sizeWord}。${tailZh}`,
      en: `${atkPartEn}Entity+1, ${sizeWordEn}.${tailEn}`,
    },
    effects: () => [new Effect(Phase.PreActive, 0, ctx => {
      if (atk > 0) ctx.bullet.attack += atk;
      ctx.bullet.entityLayers += 1;
      ctx.bullet.radius *= radiusMult;
      if (noDecay) ctx.bullet._noEntityDecay = true;
    })],
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
    cost: 2, value,
    desc: { zh: `数量+${count}。伤害随距离减少。`, en: `Bullets+${count}. Damage falls off with distance.` },
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

function _arcaneFireworkTier(baseCount, extraChance, value) {
  const descZh = extraChance > 0
    ? `洗入${baseCount}张奥弹。有${Math.round(extraChance * 100)}%概率额外洗入1张。`
    : `洗入${baseCount}张奥弹。`;
  const descEn = extraChance > 0
    ? `Shuffle in ${baseCount} Arcane Missiles. ${Math.round(extraChance * 100)}% chance to add 1 more.`
    : `Shuffle in ${baseCount} Arcane Missiles.`;
  return {
    cost: 1, value,
    desc: { zh: descZh, en: descEn },
    effects: () => [],
    onUse(_, world) {
      // 洗入裸奥弹（无 _arcBonus / 无继承）— 奥弹只吃显式 buff，本卡没说要 buff
      const mk = () => mkCard('arcane_missile', 'silver');
      for (let i = 0; i < baseCount; i++) world.deck.shuffleIntoHand(mk());
      if (extraChance > 0 && Math.random() < extraChance) {
        world.deck.shuffleIntoHand(mk());
      }
    },
  };
}

// 土豆（v9 新增，替换 v8 的烫土豆）：数量+N，弹射+N。无法瞄准（每颗子弹以随机角度发射）。
//   "无法瞄准"实现：Spawned 阶段把 ctx.bullet.angle override 为 [0, 2π) 随机值
//   → fireOneWave 内的扇形分布被覆盖，每颗子弹独立朝随机方向飞
function _potatoTier(count, bound, value) {
  return {
    cost: 2, value,
    desc: { zh: `数量+${count}，弹射+${bound}。无法瞄准。`, en: `Bullets+${count}, Bounce+${bound}. Cannot aim.` },
    effects: () => [
      new Effect(Phase.PreActive, 0, ctx => {
        ctx.bullet.bulletCount += count;
        ctx.bullet.bound += bound;
      }),
      new Effect(Phase.Spawned, 0, ctx => {
        // 覆盖发射角度 — 每颗 clone 独立随机
        ctx.bullet.angle = Math.random() * Math.PI * 2;
      }),
    ],
  };
}

// 燃料匣（v9 重写）：穿透燃烧敌人时造成范围伤害；钻额外：范围伤害附带燃烧，非燃烧敌人则点燃。
//   pen / bound : PreActive 加穿 / 弹
//   aoeMult     : 命中燃烧敌人时的 AOE 半径倍数（铜 1.0=小, 银/金/钻 2.0=普通）
//   aoeSmallDesc: desc 显示用 "小范围" / "" (普通范围)
//   diamond     : 钻级特性 — AOE 附加燃烧 + 非燃烧敌人时施加燃烧
function _fuelcellTier(pen, bound, aoeMult, diamond, value) {
  const rangeWord = aoeMult < 1.5 ? '小范围' : '范围';
  const rangeWordEn = aoeMult < 1.5 ? 'small AOE' : 'AOE';
  const descZh = diamond
    ? `穿透+${pen}，弹射+${bound}。穿透燃烧敌人时造成${rangeWord}伤害并造成燃烧，否则点燃敌人。`
    : `穿透+${pen}，弹射+${bound}。穿透燃烧敌人时造成${rangeWord}伤害。`;
  const descEn = diamond
    ? `Pierce+${pen}, Bounce+${bound}. Piercing a burning enemy deals ${rangeWordEn}; non-burning enemies get Ignited.`
    : `Pierce+${pen}, Bounce+${bound}. Piercing a burning enemy deals ${rangeWordEn}.`;
  return {
    cost: 1, value,
    desc: { zh: descZh, en: descEn },
    effects: () => {
      const list = [
        new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.penetrate += pen; ctx.bullet.bound += bound; }),
      ];
      if (diamond) {
        // 钻级燃料匣会主动施加燃烧 → 也披上火焰光环
        list.push(new Effect(Phase.Spawned, 0, ctx => { ctx.bullet._burnAura = true; }));
      }
      list.push(new Effect(Phase.HitEnemy, 5, ctx => {
        const e = ctx.enemy, b = ctx.bullet;
        if (!e || b.penetrate < 1) return;
        if ((e.fire || 0) > 0) {
          // 燃烧敌人 → 范围伤害（钻：附带 1 层燃烧）
          applyAoe(ctx.world, b, {
            damage: b.attack, mult: aoeMult, target: 'enemies',
            color: '#ff7030',
            onHit: diamond ? (ee) => applyFire(ee, 1) : null,
          });
        } else if (diamond) {
          // 钻：非燃烧敌人时仅点燃（不打 AOE）
          applyFire(e, 1);
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

function _cryptTier(n, value, atkBoost = 0) {
  const summonAndBoost = (world) => {
    for (let i = 0; i < n; i++) spawnSkeleton(world, { attackBonus: atkBoost });
  };
  const descZh = atkBoost > 0
    ? `召唤${n}个骷髅，他们的伤害+${atkBoost}。弃置此牌等同于使用。`
    : `召唤${n}个骷髅。弃置此牌等同于使用。`;
  const descEn = atkBoost > 0
    ? `Summon ${n} Skeleton(s) with Damage+${atkBoost}. Discard = use.`
    : `Summon ${n} Skeleton(s). Discard = use.`;
  return {
    cost: 1, value,
    desc: { zh: descZh, en: descEn },
    effects: () => [],
    onUse(_, world) { summonAndBoost(world); },
    onDiscard(_, world) { summonAndBoost(world); },
  };
}

// 终结技：基础 +atk；若本次射击正好用光法力 → 弹射+bound、穿透+pen。
// 钻级 (diamondRefund=true)：否则下 1 次使用此牌费用-1（一次性折扣，下次使用消耗后清零）。
function _finisherTier(atk, bound, pen, diamondRefund, value) {
  const tail = diamondRefund
    ? '否则，下1次使用此牌的费用-1。'
    : '';
  const tailEn = diamondRefund
    ? ' Otherwise, the next use of this card costs 1 less.'
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
      // 消耗本次预存的"下1次-1"折扣（如果有）
      if (card._finisherNextDiscount) {
        card._finisherNextDiscount = false;
        card._battleCostOverride = null;
      }
      if (!diamondRefund) return;
      // 钻级 only: 若本次未用光法力 → 给下 1 次使用打 -1 折扣
      const p = world?.player;
      if (p && p.mana > 0) {
        card._finisherNextDiscount = true;
        const next = Math.max(0, (card.cost || 0) - 1);
        card._battleCostOverride = next;
      }
    },
  };
}

// 拥有"骷髅"关键词的卡家族 ID（叫魂用：弃出的牌若属此集合 → 额外召唤骷髅）
const SKELETON_FAMILY_IDS = new Set([
  'crypt', 'skeleton_horn', 'bone_blossom', 'skeleton_lord',
  'necromancer', 'soulcall', 'reincarnation', 'excavate_tomb',
  'brave_dragon_lair',
]);

// ─── v8 新卡：令箭 / 战鼓 / 钻头 / 造访剑圣 / 勇闯龙巢 ─────────────────

// 令箭：穿透+N。穿透时，count 个随机友方实体化单位获得实体化+1。
function _orderArrowTier(pen, count, value) {
  return {
    cost: 2, value,
    desc: {
      zh: `穿透+${pen}。穿透时，${count}个随机友方实体化单位获得实体化+1。`,
      en: `Pierce+${pen}. On pierce, ${count} random friendly Entity unit${count > 1 ? 's' : ''} gain +1 Entity layer.`,
    },
    effects: () => [
      new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.penetrate += pen; }),
      // priority 6：先于 default HitEnemy 检查；判定"还会继续穿透"= penetrate >= 1
      new Effect(Phase.HitEnemy, 6, ctx => {
        if (ctx.bullet.penetrate < 1) return;
        const w = ctx.world;
        const pool = w.bullets.filter(b =>
          b.alive && b.isEntity && b.team !== 'enemy' && b.entityLayers > 0
        );
        for (let i = 0; i < count && pool.length > 0; i++) {
          const idx = randInt(0, pool.length - 1);
          const e = pool.splice(idx, 1)[0];
          e.entityLayers = (e.entityLayers || 0) + 1;
          if (e.entityLayersMax != null && e.entityLayers > e.entityLayersMax) {
            e.entityLayersMax = e.entityLayers;
          }
          w.particles.push(new Particle({ x: e.x, y: e.y, life: 0.4, color: '#ffd84a', size: 18, type: 'ring' }));
          for (let k = 0; k < 6; k++) {
            const a = Math.PI * 2 * Math.random();
            w.particles.push(new Particle({
              x: e.x, y: e.y, vx: Math.cos(a) * 70, vy: Math.sin(a) * 70,
              life: 0.32, color: '#ffd84a', size: 2.6,
            }));
          }
          // ⚠ 浮字 FX 由 Bullet 属性 diff 侦测器统一负责
        }
      }),
    ],
  };
}

// 战鼓：弹射+N（金/钻 额外伤害+atk）。弹射时，将子弹自身总伤害加成至 targetCount 个随机友方实体。
function _warDrumTier(bound, atkBonus, targetCount, value) {
  const parts = [`弹射+${bound}`];
  const partsEn = [`Bounce+${bound}`];
  if (atkBonus > 0) { parts.push(`伤害+${atkBonus}`); partsEn.push(`Damage+${atkBonus}`); }
  return {
    cost: 2, value,
    desc: {
      zh: `${parts.join('，')}。弹射时，会将伤害加成至${targetCount}个随机友方实体化单位。`,
      en: `${partsEn.join(', ')}. On bounce, grants bonus damage equal to its own total damage to ${targetCount} random friendly Entity unit${targetCount > 1 ? 's' : ''}.`,
    },
    effects: () => [
      new Effect(Phase.PreActive, 0, ctx => {
        ctx.bullet.bound += bound;
        if (atkBonus > 0) ctx.bullet.attack += atkBonus;
      }),
      new Effect(Phase.HitWall, 5, ctx => {
        if (ctx.bullet.bound <= 0) return;
        const w = ctx.world || window.__game;
        if (!w) return;
        const totalAtk = ctx.bullet.attack || 0;
        if (totalAtk <= 0) return;
        const pool = w.bullets.filter(b =>
          b.alive && b.isEntity && b.team !== 'enemy' && b.entityLayers > 0
        );
        for (let i = 0; i < targetCount && pool.length > 0; i++) {
          const idx = randInt(0, pool.length - 1);
          const e = pool.splice(idx, 1)[0];
          e.attack = (e.attack || 0) + totalAtk;
          w.particles.push(new Particle({ x: e.x, y: e.y, life: 0.4, color: '#ff9028', size: 16, type: 'ring' }));
          for (let k = 0; k < 7; k++) {
            const a = Math.PI * 2 * Math.random();
            w.particles.push(new Particle({
              x: e.x, y: e.y, vx: Math.cos(a) * 75, vy: Math.sin(a) * 75,
              life: 0.34, color: '#ff9028', size: 2.6,
            }));
          }
          // ⚠ 浮字 FX 由 Bullet 属性 diff 侦测器统一负责
        }
      }),
    ],
  };
}

// 钻头：穿透+N。通过缩短"穿透碰撞内置 CD"（pierceHitCooldown 默认 0.5s）→ 0.1 / 0.05s，
// 让穿透时不断造成伤害 + 击退，营造"钻头"高速钻穿的效果。
function _drillTier(pen, pierceCD, value) {
  const speedWord = pierceCD <= 0.05 ? '快速' : '';
  const speedWordEn = pierceCD <= 0.05 ? ' rapidly' : '';
  return {
    cost: 3, value,
    desc: {
      zh: `穿透+${pen}。穿透时会${speedWord}消耗穿透次数并造成伤害。`,
      en: `Pierce+${pen}. While piercing, consumes Pierce charges${speedWordEn} and deals damage.`,
    },
    effects: () => [
      new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.penetrate += pen; }),
      new Effect(Phase.Spawned, 0, ctx => {
        ctx.bullet.pierceHitCooldown = pierceCD;
      }),
    ],
  };
}

// 造访剑圣：伤害+2。展露：玩家回合结束时召唤 1 个剑圣并弃置此牌（一次性触发，
// 重洗回手牌再次展露才会再触发）。金/钻 → 觉醒剑圣（+斩杀<10% HP 周围敌人）。
//   alwaysFaceUp 钻级：此牌在手牌中始终为正面。
//   设计取舍：bag[0] 主卡不能被弃置（永远在卡槽 → 无意义）→ 主卡位置时本机制 no-op。
function _swordSaintVisitTier(awakened, alwaysFaceUp, value) {
  const summonZh = awakened ? '觉醒剑圣' : '剑圣';
  const summonEn = awakened ? 'Awakened Sword Saint' : 'Sword Saint';
  const headZh = alwaysFaceUp ? '当此牌在手牌中，始终为正面。' : '';
  const headEn = alwaysFaceUp ? 'This card is always face-up while in hand. ' : '';
  return {
    cost: 1, value, hasRevealFx: true, alwaysFaceUp,
    desc: {
      zh: `伤害+2。${headZh}展露：回合结束时召唤${summonZh}。`,
      en: `Damage+2. ${headEn}Reveal: at end of turn, summon ${summonEn}.`,
    },
    effects: () => [
      new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.attack += 2; }),
    ],
    onReveal(card) {
      if (card._saintHandler) return;
      card._saintHandler = (t) => {
        if (!card.faceUp) return;
        if (t !== 'enemy') return;   // 玩家回合结束 → 进入敌方回合的瞬间
        const w = window.__game;
        if (!w) return;
        // 防重入（同回合内 turnChanged 不会重复触发，但 setTimeout 等异步路径有保险）
        if (card._saintTriggered) return;
        card._saintTriggered = true;
        spawnSwordSaint(w, { attack: awakened ? 7 : 5, awakened });
        // 弃置此牌（仅当在手牌内 — 主卡 / 已不在手牌的情况 no-op）
        const idx = w.deck.hand.indexOf(card);
        if (idx >= 0) {
          w.deck.hand.splice(idx, 1);
          card._lastAction = 'use';
          // toDiscard 内会调 _setFace(false) → 触发 onConceal → 解绑 _saintHandler
          w.deck.toDiscard(card);
        }
        // 下次再被展露（重洗后）需要重新累计 → onConceal 里把 _saintTriggered 清掉
      };
      Events.on('turnChanged', card._saintHandler);
    },
    onConceal(card) {
      if (card._saintHandler) {
        Events.off('turnChanged', card._saintHandler);
        card._saintHandler = null;
      }
      // 翻反面时清掉 triggered 标记 → 下次展露允许重新累计 + 触发
      card._saintTriggered = false;
    },
  };
}

// 征召令（v9+，临时卡，由 口谕 在每回合开始洗入）：发现 2 张"下级实体化卡牌"并完整应用它们的效果。
//   candidateTier：发现候选所在 tier（征召令自身 tier 降一级：银→铜 / 金→银 / 钻→金）。
//   _destroyAfterUse / _autoDiscardAtTurnEnd 在 CARD_DATA 注册时打到 def 上，
//   但运行时也由 onUse 内显式标记 — 因为 mkCard 生成的新实例需要这些 per-instance 状态。
//
// 设计：被选卡的"全部效果"都施加 — 不只 EntityTurn：
//   - PreActive / Spawned / HitEnemy / Destroyed / EntityTurn 等 Bullet hooks 全数加到子弹上
//   - 被选卡 onUse 在玩家点选的瞬间触发（让骷髅号角召唤骷髅、爆骨花生骨花等副作用照常发生）
//   - 被选卡不洗入手牌 / 不进背包 / 不消耗费用 — 仅作为本次发射的"行为模板 + 副作用一次性触发"
//
// 实现关键（参见 fireFromCards 流程 + modify-mechanic §2.9）：
//   1. effects() 返回的 PreActive hook 在 fireFromCards 内于 onUse 之前装到 tpl 上（闭包捕获 card，
//      实际执行延后到 continueFire 阶段）。
//   2. onUse 排队 2 次 triggerDiscover；fireFromCards 末尾检测 _discoverPending → 挂 continueFire 为延续。
//   3. 每次 onPick：① 推入 card._heroPicks ② 立即跑 picked.onUse（"等于使用了该牌"）。
//   4. 2 选完 → continueFire → tpl.triggerHooks(PreActive) → 征召令 PreActive 跑：
//        - 把 picked.initializeEffects() 的全部 hook 加到 ctx.bullet（= tpl）
//        - 对 PreActive 阶段 hook 立即手动 execute，让 attack / entityLayers / _xxxFlag 等真正写到 tpl
//          （否则 triggerHooks 已 snapshot 当前轮列表 → 后加的 PreActive 不会在同次循环跑）
//   5. fireOneWave 用 clone.copyHooksFrom(tpl) → 每颗 clone 都拿到完整 hook 列表（Spawned / EntityTurn /
//      HitEnemy / Destroyed 自然按各自时机触发）。
//   6. 自身 PreActive 用 priority 50 → 排在普通 PreActive(0) 之后、wall 类(100) 之前；保证
//      被选卡 PreActive 的 buff 叠加在主 PreActive 已结算的 tpl 上。
function _conscriptionOrderTier(candidateTier, value) {
  const tierZh = { bronze: '铜', silver: '银', gold: '金', diamond: '钻' }[candidateTier] || candidateTier;
  return {
    cost: 3, value,
    desc: {
      zh: `临时。发现并获得2张${tierZh}等级的实体化卡牌的效果。`,
      en: `Temporary. Discover 2 ${candidateTier}-tier Entity cards and apply all their effects.`,
    },
    effects: (card) => [
      // PreActive：把被选卡的所有 hook 加到 ctx.bullet（= tpl），同时立即执行被选卡的 PreActive
      new Effect(Phase.PreActive, 50, ctx => {
        const picks = card._heroPicks || [];
        for (const picked of picks) {
          if (!picked || !picked.initializeEffects) continue;
          for (const h of picked.initializeEffects()) {
            ctx.bullet.addHook(h);
            if (h.phase === Phase.PreActive) {
              try { h.execute({ bullet: ctx.bullet, world: ctx.world }); }
              catch (e) { console.error('conscription pick PreActive error', e); }
            }
          }
        }
      }),
      // Spawned：装饰 🦸（每颗 clone 都画 — 标识"征召令派生"，与被选卡的装饰并存）
      new Effect(Phase.Spawned, 0, ctx => {
        (ctx.bullet._entityDecos = ctx.bullet._entityDecos || []).push('hero');
      }),
    ],
    onUse(card, world, player) {
      // 每次使用重置 picks（多次施放不应叠加旧选择）
      card._heroPicks = [];
      for (let i = 0; i < 2; i++) {
        const cands = _rollEntityKeywordCandidates(world, 3, candidateTier);
        if (cands.length === 0) break;   // 无候选 → 跳过本次发现，不弹空窗
        const idx = i + 1;
        triggerDiscover(world, {
          candidates: cands,
          sourceCard: card,
          title: LANG.current === 'zh' ? `征召令 · 第${idx}张` : `Conscription · #${idx}`,
          sub: LANG.current === 'zh' ? '选择1张实体化卡牌' : 'Pick 1 Entity card',
          onPick: (chosen) => {
            card._heroPicks.push(chosen);
            // "等于使用了这张卡"：立刻调被选卡 onUse（骷髅号角召唤骷髅、爆骨花生骨花等副作用此刻触发）
            // 不调 onReveal — picks 不在手牌，没有"展露/隐藏"语义
            try { chosen.onUse?.(world, player); }
            catch (e) { console.error('conscription pick onUse error', e); }
          },
        });
      }
    },
  };
}

// 口谕：使用时把自身替换为 令箭 + 本关每回合开始洗入一张同 tier 临时 征召令。
//   口谕 / 征召令 tier 一一对应（银→征召令银→候选铜；金→征召令金→候选银；钻→征召令钻→候选金）。
//   _decreeTiers 是数组（多张 口谕 → 每回合多张 征召令）；按 tier 字串记录，每回合 push 一张到手牌。
//   清理见 BattleManager.resetForBattle / _startNewGame：本关结束清空。
function _decreeTier(tierKey, value) {
  return {
    cost: 3, value,
    desc: {
      zh: '用令箭替换此牌。在你的回合开始时，将一张临时征召令洗入你的手牌。',
      en: 'Replace this card with Order Arrow. At the start of each turn, shuffle a temporary Conscription Order into your hand.',
    },
    effects: () => [],
    onUse(card, world) {
      // 注册本关每回合开始洗入 征召令 同 tier
      world._decreeTiers = world._decreeTiers || [];
      world._decreeTiers.push(tierKey);
      // 立即洗入一张（首次使用就有触发感 — 与 持续施法 onUse 同设计）
      _decreeShuffleIn(world, tierKey);
      // 标记替换为 令箭 同 tier — 进入弃牌堆 / 主卡槽后由 _resolveArcaneEvoReplacements 替换
      card._becomeOrderArrow = card.tier;
    },
  };
}

// 把 1 张同 tier 临时 征召令 洗入手牌（口谕 onUse + 每回合开始触发）
// 默认洗入为反面（与所有"无说明"的洗入卡一致）；玩家正常走 _updateFaceUp 在边缘翻正面
// 临时只在"使用 / 弃置"时移除（与"临时"关键词定义一致），回合结束保留 → 没用上的征召令累积在手牌
function _decreeShuffleIn(world, tierKey) {
  const card = mkCard('conscription_order', tierKey);
  card._destroyAfterUse = true;         // 使用 / 弃置后永久移除
  world.deck.shuffleIntoHand(card);
  Events.emit('shuffledIn', card);
  Events.emit('deckChanged');
}

// 勇闯龙巢：召唤2骷髅。弃置 threshold 次（含被效果弃置）以召唤亡灵龙；召唤后计数归零，重新累计。
//   desc 是函数 → 每次渲染计算剩余次数；剩余 1 次（即将触发）→ _discardCounterReady 引导 UI 橙色高亮 + 翻面粒子。
// 勇闯龙巢：计数器在**本关内**全 family 共享（v8.6 重构）。
//   旧实现：每张卡独立 _discardCount → 必须同一张卡反复弃置 N 次才触发
//   新实现：world._discardCounters[familyId] 跨卡片共享
//           → 玩家发现 2 张勇闯龙巢钻级（threshold=2），分别弃 1 次也能召唤
//   threshold 取该被弃卡的 tier 自带值（gold=3 / diamond=2），后弃决定本次判定
//   _discardCounterReady（橙色呼吸边框 + 翻面粒子）施加到 hand / discard 中所有同 family 卡 → 统一视觉
function _braveDragonLairTier(threshold, value) {
  const FAMILY = 'brave_dragon_lair';
  return {
    cost: 2, value, hasRevealFx: true,
    desc: (card) => {
      const w = window.__game;
      const shared = (w && w._discardCounters && w._discardCounters[FAMILY]) || 0;
      const remaining = Math.max(0, threshold - shared);
      return {
        zh: `召唤2个骷髅。弃置同名卡牌${remaining}次以召唤强大的亡灵龙！`,
        en: `Summon 2 Skeletons. Discard same-name cards ${remaining} more time${remaining === 1 ? '' : 's'} to summon a mighty Undead Dragon!`,
      };
    },
    effects: () => [],
    onUse(_, world) {
      for (let i = 0; i < 2; i++) spawnSkeleton(world);
    },
    // onDiscard 在三种弃置路径都会触发（手动弃 / discardRandomFromHand / autoDiscard）
    onDiscard(card, world) {
      world._discardCounters = world._discardCounters || {};
      world._discardCounters[FAMILY] = (world._discardCounters[FAMILY] || 0) + 1;
      const shared = world._discardCounters[FAMILY];
      const markFamily = (ready) => {
        // 把"就绪"状态打到 hand / discard / bag 里所有同 family 卡上，让 UI 统一显示
        const pools = [world.deck.hand, world.deck.discard, world.deck.bag];
        for (const pool of pools) {
          for (const c of pool) {
            if (c && c.familyId === FAMILY) c._discardCounterReady = ready;
          }
        }
      };
      if (shared >= threshold) {
        spawnUndeadDragon(world);
        world._discardCounters[FAMILY] = 0;
        markFamily(false);
      } else if (shared >= threshold - 1) {
        // 剩 1 次就触发 → 橙色呼吸边框 + 翻面粒子（所有同 family 卡都标记）
        markFamily(true);
      }
      Events.emit('deckChanged');
    },
  };
}

// 火力覆盖：纯数量加成。
function _firepowerTier(damage, count, value) {
  return {
    cost: 2, value,
    desc: { zh: `伤害+${damage}，数量+${count}。`, en: `Damage+${damage}, Bullets+${count}.` },
    effects: () => [new Effect(Phase.PreActive, 0, ctx => {
      ctx.bullet.attack += damage;
      ctx.bullet.bulletCount += count;
    })],
  };
}

// 撒豆成兵：数量+N，实体化+2。子弹本身变为实体。
function _beanSoldiersTier(count, value) {
  return {
    cost: 3, value,
    desc: { zh: `数量+${count}，实体化+2。`, en: `Bullets+${count}, Entity+2.` },
    effects: () => [new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.bulletCount += count; ctx.bullet.entityLayers += 2; })],
  };
}

// 穿甲炸弹：穿透+1，每次穿透时向随机方向 cone AOE。
function _armorPiercerTier(halfAngle, value) {
  return {
    cost: 1, value,
    desc: {
      zh: `穿透+1。穿透时向随机方向造成${Math.round(halfAngle * 2 / Math.PI * 180)}°的范围伤害。`,
      en: `Pierce+1. On pierce, deal a ${Math.round(halfAngle * 2 / Math.PI * 180)}° cone in a random direction.`,
    },
    effects: () => [
      new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.penetrate += 1; }),
      new Effect(Phase.HitEnemy, 6, ctx => {
        if (ctx.bullet.penetrate < 1) return;
        applyAoe(ctx.world, ctx.bullet, {
          kind: 'cone', damage: ctx.bullet.attack,
          mult: AOE_MULT.arcaneExplode, target: 'enemies',
          dirAngle: Math.random() * Math.PI * 2, halfAngle,
          color: '#ffd84a',
        });
      }),
    ],
  };
}

// 叫魂：召唤 baseN 骷髅 + 随机弃 2 张手牌。
//   skeletonKwExtra=true（金/钻）：弃出的骷髅关键词牌每张再召唤 1 骷髅。
//   diamondBoost=true（钻）：弃出的非骷髅关键词牌反而使场上骷髅 +1 攻击。
function _soulcallTier(baseN, skeletonKwExtra, diamondBoost, value) {
  const descZh = diamondBoost
    ? `召唤${baseN}个骷髅。随机弃置2张手牌，每张包含骷髅关键词的牌会额外召唤1个骷髅，反之使场上的骷髅伤害+1。`
    : (skeletonKwExtra
      ? `召唤${baseN}个骷髅。随机弃置2张手牌，每张包含骷髅关键词的牌会额外召唤1个骷髅。`
      : `召唤${baseN}个骷髅。随机弃置2张手牌。`);
  const descEn = diamondBoost
    ? `Summon ${baseN} Skeletons. Discard 2 random hand cards; each with the Skeleton keyword summons 1 more Skeleton, otherwise +1 damage to your skeletons.`
    : (skeletonKwExtra
      ? `Summon ${baseN} Skeletons. Discard 2 random hand cards; each with the Skeleton keyword summons 1 more Skeleton.`
      : `Summon ${baseN} Skeletons. Discard 2 random hand cards.`);
  const summon = (world, n) => { for (let i = 0; i < n; i++) spawnSkeleton(world); };
  const apply = (_, world) => {
    summon(world, baseN);
    const discarded = world.deck.discardRandomFromHand(2);
    if (!skeletonKwExtra) return;   // silver：仅基础召唤 + 弃
    for (const c of discarded) {
      if (SKELETON_FAMILY_IDS.has(c.familyId)) {
        summon(world, 1);
      } else if (diamondBoost) {
        for (const b of world.bullets) {
          if (b.alive && b._isSkeleton) b.attack = (b.attack || 0) + 1;
        }
      }
    }
  };
  return {
    cost: 1, value,
    desc: { zh: descZh, en: descEn },
    effects: () => [],
    onUse(card, world) { apply(card, world); },
    onDiscard(card, world) { apply(card, world); },
  };
}

// 持续施法：使用后注册"每个玩家回合开始 → 洗入 2 张奥弹（带 N 种随机强化）"
// rollsPerMissile: 0 (silver) / 1 (gold) / 2 (diamond)
// 用完之后自身在 fireFromCards 后被替换为同 tier 奥术礼花。
function _continuousCastTier(rollsPerMissile, value) {
  // 银：句尾直接 "。"；金/钻：用"，"接随机强化短语
  const tailZh = rollsPerMissile > 0 ? `，它们具有${rollsPerMissile}种随机强化` : '';
  const tailEn = rollsPerMissile > 0
    ? `, each with ${rollsPerMissile} random buff${rollsPerMissile > 1 ? 's' : ''}`
    : '';
  return {
    cost: 3, value,
    desc: {
      zh: `在本关卡中，每回合开始时洗入2张奥弹${tailZh}。用奥术礼花替换此牌。`,
      en: `For the rest of this stage, each turn shuffle 2 Arcane Missiles into your hand${tailEn}. Replace this card with Arcane Firework.`,
    },
    effects: () => [],
    onUse(card, world) {
      // 取既有的最高强化设置（多张同时使用时不退档）
      const cur = world._contCastRolls || 0;
      world._contCastRolls = Math.max(cur, rollsPerMissile);
      world._contCastActive = true;
      // 立即洗入一组：让首次使用就有触发感（也符合"每回合"包含本回合）
      _continuousCastShuffleIn(world);
      // 标记替换为奥术礼花
      card._becomeArcaneFirework = card.tier;
    },
  };
}

// 持续施法支持：洗入 2 张奥弹 + 按 world._contCastRolls 应用随机强化
//   奥弹不继承本回合用过的卡（设计上奥弹只吃显式 buff），只带 _contCastBuffs 显式随机强化。
function _continuousCastShuffleIn(world) {
  const rolls = world._contCastRolls || 0;
  for (let i = 0; i < 2; i++) {
    const m = mkCard('arcane_missile', 'silver');
    // 随机强化：5 种之一（伤害+1 / 弹射+1 / 穿透+1 / 命中燃烧 / 25%冻结）
    const BUFFS = [
      b => { b.attack = (b.attack || 0) + 1; },
      b => { b.bound = (b.bound || 0) + 1; },
      b => { b.penetrate = (b.penetrate || 0) + 1; },
      b => { b._fireOnHit = (b._fireOnHit || 0) + 1; },
      b => { b._freezeChance = (b._freezeChance || 0) + 0.25; },
    ];
    const applied = [];
    for (let r = 0; r < rolls; r++) {
      const choice = randInt(0, BUFFS.length - 1);
      applied.push(BUFFS[choice]);
    }
    if (applied.length > 0) m._contCastBuffs = applied;
    world.deck.shuffleIntoHand(m);
  }
}

// 转生：每个敌人死亡时有 20% 概率召唤 1 骷髅；用完后自身被替换为同 tier 墓穴。
function _reincarnationTier(value) {
  return {
    cost: 3, value,
    desc: {
      zh: '在本关卡中，每个敌人死亡时，有20%的概率召唤1个骷髅。用墓穴替换此牌。',
      en: 'For the rest of this stage, each enemy death has a 20% chance to summon a Skeleton. Replace this card with Crypt.',
    },
    effects: () => [],
    onUse(card, world) {
      world._reincarnateActive = true;
      card._becomeCrypt = card.tier;
    },
  };
}

// 收集所有"含至少一个展露 tier"的家族 → 用于挖掘的候选池。
// 探针 tier 选择策略：与商店等级挂钩 → _rollTier；若该 tier 没有 reveal 版本就回落到此家族
// 最低的 reveal tier。
function _revealCandidateFamilies() {
  const out = [];
  for (const [fid, fam] of Object.entries(CARD_DATA)) {
    if (fam.excludedFromShop) continue;
    let hasReveal = false;
    for (const tk of TIER_KEYS) {
      if (fam.tiers[tk] && fam.tiers[tk].hasRevealFx) { hasReveal = true; break; }
    }
    if (hasReveal) out.push(fid);
  }
  return out;
}

// 挖掘候选：roll N 张"同等级 + 展露"的卡。tier 来自调用方（如挖掘卡自身的 tier）。
// 同等级的展露卡可能少于 N 张（如银 / 金只有 1 张爆骨花）；此时返回的数组就只有那么多张。
function _rollRevealDiscoverCandidates(world, count, tier) {
  const fams = _revealCandidateFamilies().filter(fid => {
    const t = CARD_DATA[fid].tiers[tier];
    return t && t.hasRevealFx;
  });
  return _rollDiscoverFromPool(fams, count, tier);
}

// 挖掘候选：roll N 张"同等级 + 任意非衍生"的卡。silver 挖掘用。
// 排除挖掘 / 定向勘探自身（避免递归发现）。
function _rollAnyDiscoverCandidates(world, count, tier) {
  const fams = [];
  for (const [fid, fam] of Object.entries(CARD_DATA)) {
    if (fam.excludedFromShop) continue;
    if (fid === 'excavate' || fid === 'directed_survey') continue;
    if (!fam.tiers[tier]) continue;
    fams.push(fid);
  }
  return _rollDiscoverFromPool(fams, count, tier);
}

// 定向勘探候选：roll N 张"同等级 + base cost == targetCost"的卡。
function _rollDiscoverByCost(world, count, tier, targetCost) {
  const fams = [];
  for (const [fid, fam] of Object.entries(CARD_DATA)) {
    if (fam.excludedFromShop) continue;
    if (fid === 'excavate' || fid === 'directed_survey') continue;
    const t = fam.tiers[tier];
    if (!t) continue;
    if ((t.cost ?? 0) !== targetCost) continue;
    fams.push(fid);
  }
  return _rollDiscoverFromPool(fams, count, tier);
}

// 勇者候选：roll N 张"同等级 + 真·实体化"的卡。
// 严格过滤：跑一遍 dry PreActive，若 entityLayers > 0 才算"实体化卡"
// （排除像战旗 / 令箭 / 战鼓那种 desc 提到"实体化"但自己不创造实体单位的 aura 卡）。
// 候选 tier 由调用方决定（hero 自身 tier - 1）；排除 hero 自身 + excavate / directed_survey 衍生链。
function _rollEntityKeywordCandidates(world, count, tier) {
  const fams = [];
  for (const [fid, fam] of Object.entries(CARD_DATA)) {
    if (fam.excludedFromShop) continue;
    if (fid === 'decree' || fid === 'conscription_order') continue;
    if (fid === 'excavate' || fid === 'directed_survey') continue;
    const def = fam.tiers[tier];
    if (!def || !def.effects) continue;
    let hooks;
    try { hooks = mkCard(fid, tier).initializeEffects(); } catch (e) { continue; }
    const pre = hooks.filter(h => h.phase === Phase.PreActive);
    if (pre.length === 0) continue;
    // dry-run PreActive on probe bullet to detect entityLayers grant
    const dry = new Bullet({
      x: 0, y: 0, angle: 0, speed: 480, lifetime: 3,
      bulletCount: 1, waveCount: 1, attack: 2, bound: 0, penetrate: 0, radius: 6,
    });
    for (const h of pre) dry.addHook(h);
    try { dry.triggerHooks(Phase.PreActive, { world }); } catch (e) { continue; }
    if (dry.entityLayers > 0) fams.push(fid);
  }
  return _rollDiscoverFromPool(fams, count, tier);
}

// 公共：从一个 family 列表里随机抽 count 张 tier 卡，按 family 去重，存在性不足时返回少于 N。
function _rollDiscoverFromPool(fams, count, tier) {
  if (fams.length === 0) return [];
  const out = [];
  const used = new Set();
  let safety = 40;
  while (out.length < count && used.size < fams.length && safety-- > 0) {
    const fid = fams[randInt(0, fams.length - 1)];
    if (used.has(fid)) continue;
    used.add(fid);
    out.push(mkCard(fid, tier));
  }
  return out;
}

// 挖掘：使用 → 伤害+N (PreActive)；弃置 → 发现 1 张同等级临时卡，按 tier 调 pool / cost。
// poolType: 'any' (silver - 任意非衍生卡) / 'reveal' (gold/diamond - 仅展露卡)
// costMode: 'minus1' (silver) / 'zero' (gold/diamond)
// damage: 使用本牌给本次发射加的伤害（铜/银/金/钻 = 各自配置）
function _excavateTier(poolType, costMode, damage, value) {
  const noun   = poolType === 'reveal' ? '临时的展露卡牌' : '临时的卡牌';
  const nounEn = poolType === 'reveal' ? 'temporary Reveal card' : 'temporary card';
  const tail   = costMode === 'zero' ? '，其消耗值为0' : '，其消耗值-1';
  const tailEn = costMode === 'zero' ? ', cost becomes 0' : ', cost reduced by 1';
  return {
    cost: 2, value,
    desc: {
      zh: `伤害+${damage}。弃置此牌时，发现1张${noun}，将其洗入手牌并翻为正面${tail}。`,
      en: `Damage+${damage}. When discarded, discover 1 ${nounEn}. Shuffle it into your hand face-up${tailEn}.`,
    },
    effects: () => [
      new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.attack += damage; }),
    ],
    onDiscard(card, world) {
      // 同等级候选：源挖掘卡 tier 决定候选 tier
      const candidates = poolType === 'reveal'
        ? _rollRevealDiscoverCandidates(world, 3, card.tier)
        : _rollAnyDiscoverCandidates(world, 3, card.tier);
      if (candidates.length === 0) return;
      triggerDiscover(world, {
        candidates,
        sourceCard: card,
        title: LANG.current === 'zh' ? '挖掘' : 'Excavate',
        sub: LANG.current === 'zh'
          ? (poolType === 'reveal' ? '选择一张展露卡' : '选择一张卡')
          : (poolType === 'reveal' ? 'Pick a Reveal card' : 'Pick a card'),
        onPick: (chosen) => {
          // 临时：使用 / 弃置后从卡组移除
          chosen._destroyAfterUse = true;
          // 调整 cost
          if (costMode === 'minus1') chosen._battleCostOverride = Math.max(0, (chosen.cost || 0) - 1);
          else if (costMode === 'zero') chosen._battleCostOverride = 0;
          // 洗入手牌（随机位置）
          world.deck.shuffleIntoHand(chosen);
          // 翻为正面（即使不在边缘也保持正面）
          chosen._foresightFaceUp = true;
          world.deck._setFace(chosen, true);
          Events.emit('deckChanged');
        },
      });
    },
  };
}

// 定向勘探：使用 → 伤害+2 (PreActive)；弃置 → 发现 1 张同等级 3 费临时卡，按 tier 调 cost / 洗入位置。
// 用户给的 4 tier 描述文字（费用值描述里 "为" 字不统一，保留原样）：
//   铜：消耗值为2，洗入手牌（随机位置）并翻为正面
//   银：消耗值2，洗入最左侧
//   金：消耗值1，洗入最左侧
//   钻：消耗值为0，洗入最左侧
function _directedSurveyTier(descZh, descEn, costOverride, insertPos, value) {
  return {
    cost: 1, value,
    desc: { zh: descZh, en: descEn },
    effects: () => [
      new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.attack += 2; }),
    ],
    onDiscard(card, world) {
      // 同等级候选 + 必须是 base cost = 3 的牌
      const candidates = _rollDiscoverByCost(world, 3, card.tier, 3);
      if (candidates.length === 0) return;
      triggerDiscover(world, {
        candidates,
        sourceCard: card,
        title: LANG.current === 'zh' ? '定向勘探' : 'Directed Survey',
        sub: LANG.current === 'zh' ? '选择一张3费卡' : 'Pick a 3-cost card',
        onPick: (chosen) => {
          // 临时：使用 / 弃置后从卡组移除
          chosen._destroyAfterUse = true;
          chosen._battleCostOverride = costOverride;
          if (insertPos === 'leftmost') {
            // 洗入最左侧：变成新的左缘卡 → 自然 face-up；同时打 _foresightFaceUp 让它即使被挤出边缘也保持正面
            world.deck.hand.unshift(chosen);
          } else {
            // 洗入手牌（随机位置）
            world.deck.shuffleIntoHand(chosen);
          }
          chosen._foresightFaceUp = true;
          world.deck._setFace(chosen, true);
          world.deck._updateFaceUp();
          Events.emit('deckChanged');
          Events.emit('shuffledIn', chosen);
        },
      });
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
        desc: { zh: '数量+1。展露：数量+2。', en: 'Bullets+1. Reveal: Bullets+2.' },
        effects: () => [new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.bulletCount += 1; })],
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
          zh: '触发所有燃烧效果。展露：如果有10个敌人处于燃烧状态，立刻免费使用。',
          en: 'Detonate all Burn. Reveal: if 10 enemies are burning, immediately use for free.',
        },
        effects: () => [],
        onUse(_, world) { detonateFire(world, _, 2); },
        onReveal(card) {
          if (card._revealHandler) return;
          const check = () => {
            const w = window.__game;
            if (!w) return;
            if (!card.faceUp) return;
            const burning = w.enemies.filter(e => e.alive && (e.fire || 0) > 0).length;
            if (burning < 10) return;
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
    excludedFromShop: true,
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
      gold:    _skeletonLordTier(1, 4, 39),
      diamond: _skeletonLordTier(2, 3, 50),
    },
  },

  // ─── 银 / 金 / 钻 ───
  streamlined: {
    emoji: '🌪',
    name: { zh: '流线型', en: 'Streamlined' },
    tiers: {
      silver: {
        cost: 2, value: 18,
        desc: { zh: '穿透+2，速度略微降低，可追踪敌人。', en: 'Pierce+2, slightly slower, tracks enemies.' },
        effects: () => [new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.penetrate += 2; ctx.bullet.speed *= 0.9; ctx.bullet.tracking = true; })],
      },
      gold: {
        cost: 2, value: 23,
        desc: { zh: '穿透+4，速度略微降低，可追踪敌人。', en: 'Pierce+4, slightly slower, tracks enemies.' },
        effects: () => [new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.penetrate += 4; ctx.bullet.speed *= 0.9; ctx.bullet.tracking = true; })],
      },
      diamond: {
        cost: 2, value: 30,
        desc: { zh: '穿透+5，弹射+2，可追踪敌人。', en: 'Pierce+5, Bounce+2, tracks enemies.' },
        effects: () => [new Effect(Phase.PreActive, 0, ctx => { ctx.bullet.penetrate += 5; ctx.bullet.bound += 2; ctx.bullet.tracking = true; })],
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

  // 弓箭手 (v9)：实体子弹，每回合躲避最近敌人 + 发射 1 枚 tracking 弓箭。钻：弓箭穿透所有敌人。
  archer: {
    emoji: '🏹',
    name: { zh: '弓箭手', en: 'Archer' },
    tiers: {
      bronze:  _archerTier(1, false, 23),
      silver:  _archerTier(3, false, 30),
      gold:    _archerTier(5, false, 39),
      diamond: _archerTier(5, true,  50),
    },
  },

  swordsman: {
    emoji: '🗡',
    name: { zh: '剑士', en: 'Swordsman' },
    tiers: {
      bronze:  _swordsmanTier({ atk: 0, ent: 2, half: Math.PI / 4, value: 23,
        desc: { zh: '实体化+2，体积增大。每回合向最近的一名敌人挥剑，造成90°的范围伤害。',
                en: 'Entity+2, larger volume. Each turn slashes the nearest enemy for a 90° AOE.' } }),
      silver:  _swordsmanTier({ atk: 1, ent: 2, half: Math.PI / 3, value: 30,
        desc: { zh: '伤害+1，实体化+2，体积增大。每回合向最近的一名敌人挥剑，造成120°的范围伤害。',
                en: 'Damage+1, Entity+2, larger volume. Each turn slashes the nearest enemy for a 120° AOE.' } }),
      gold:    _swordsmanTier({ atk: 1, ent: 2, half: Math.PI / 2, value: 39,
        desc: { zh: '伤害+1，实体化+2，体积增大。每回合向周围挥剑，造成180°的范围伤害。',
                en: 'Damage+1, Entity+2, larger volume. Each turn slashes 180° AOE.' } }),
      diamond: _swordsmanTier({ atk: 2, ent: 3, half: Math.PI, reachMult: 1.5, hitStackAtk: true, value: 50,
        desc: { zh: '伤害+2，实体化+3，体积增大。每回合向周围挥剑，造成360°的大范围伤害。每命中一个敌人，伤害+1。',
                en: 'Damage+2, Entity+3, larger volume. 360° slash with +50% reach. +1 damage per enemy hit.' } }),
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
      silver:  _arcaneboostTier(1, 1, 18),
      gold:    _arcaneboostTier(2, 1, 23),
      diamond: _arcaneboostTier(3, 1, 30),
    },
  },

  bone_blossom: {
    emoji: '🌸',
    name: { zh: '爆骨花', en: 'Bone Blossom' },
    tiers: {
      silver:  _boneBlossomTier(2, 0, 3, 30, { zh: '召唤2个骷髅。展露：骷髅死亡时，造成小范围伤害。', en: 'Summon 2 Skeletons. Reveal: on skeleton death, deal a small AOE.' }),
      gold:    _boneBlossomTier(2, 0, 4, 39, { zh: '召唤2个骷髅。展露：骷髅死亡时，造成范围伤害。', en: 'Summon 2 Skeletons. Reveal: on skeleton death, deal an AOE.' }),
      diamond: _boneBlossomTier(3, 1, 5, 50, { zh: '召唤3个骷髅。展露：骷髅伤害+1；骷髅死亡时，造成大范围伤害。', en: 'Summon 3 Skeletons. Reveal: skeletons +1 damage; on death, deal a large AOE.' }),
    },
  },

  // ─── 铜 / 银 / 金 / 钻 ───
  snipe: {
    emoji: '🎯',
    name: { zh: '狙击', en: 'Snipe' },
    tiers: {
      // 距离每 N 像素 +1 攻击；铜级以 1/2 战场高度（≈280px）为基准，逐级递减 1/6。基础 +2 伤害写在 _snipeTier 里。
      bronze: _snipeTier(280, 6, { zh: '伤害+2。伤害会随着经过距离增加而略微增加。', en: 'Damage+2. Damage scales slightly with distance.' }),
      silver: _snipeTier(233, 8, { zh: '伤害+2。伤害会随着经过距离增加而轻度增加。', en: 'Damage+2. Damage scales lightly with distance.' }),
      gold: _snipeTier(187, 10, { zh: '伤害+2。伤害会随着经过距离增加而增加。', en: 'Damage+2. Damage scales with distance.' }),
      diamond: _snipeTier(140, 13, { zh: '伤害+2。伤害会随着经过距离增加而快速增加。', en: 'Damage+2. Damage scales rapidly with distance.' }),
    },
  },

  leaded: {
    emoji: '⚖',
    name: { zh: '注铅', en: 'Lead Slug' },
    tiers: {
      bronze: _leadedTier(10, 23),
      silver: _leadedTier(9, 30),
      gold: _leadedTier(11, 39),
      diamond: _leadedTier(13, 50),
    },
  },

  ignite: {
    emoji: '🔥',
    name: { zh: '引燃', en: 'Ignite' },
    tiers: {
      bronze: _igniteTier(0, 2, 13),
      silver: _igniteTier(1, 2, 18),
      gold: _igniteTier(2, 2, 23),
      diamond: _igniteTier(2, 3, 30, 1),
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
      bronze:  _hotairTier(0, 1.2, false, 6),    // 实体+1，体积增加
      silver:  _hotairTier(0, 2.0, false, 8),    // 实体+1，体积大幅增加
      gold:    _hotairTier(1, 2.0, true,  10),   // 伤+1 + 实体+1 + 体积大幅 + 不消退
      diamond: _hotairTier(2, 2.0, true,  13),   // 伤+2 + 实体+1 + 体积大幅 + 不消退
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
        desc: { zh: '穿透+5，弹射-10。速度降低，体积大幅增加。', en: 'Pierce+5, Bounce-10. Slower, much larger.' },
        effects: () => [new Effect(Phase.PreActive, 100, ctx => {
          ctx.bullet.penetrate += 5;
          ctx.bullet.bound = Math.max(0, ctx.bullet.bound - 10);
          ctx.bullet.speed *= 0.5; ctx.bullet.radius *= 2.5;
        })] },
      silver: { cost: 3, value: 30,
        desc: { zh: '穿透+6，弹射-10。体积大幅增加。', en: 'Pierce+6, Bounce-10. Much larger.' },
        effects: () => [new Effect(Phase.PreActive, 100, ctx => {
          ctx.bullet.penetrate += 6;
          ctx.bullet.bound = Math.max(0, ctx.bullet.bound - 10);
          ctx.bullet.radius *= 2.5;
        })] },
      gold: { cost: 3, value: 39,
        desc: { zh: '穿透+8，弹射-10。体积大幅增加。', en: 'Pierce+8, Bounce-10. Much larger.' },
        effects: () => [new Effect(Phase.PreActive, 100, ctx => {
          ctx.bullet.penetrate += 8;
          ctx.bullet.bound = Math.max(0, ctx.bullet.bound - 10);
          ctx.bullet.radius *= 2.5;
        })] },
      diamond: { cost: 3, value: 50,
        desc: { zh: '穿透+10。体积大幅增加。', en: 'Pierce+10. Much larger.' },
        effects: () => [new Effect(Phase.PreActive, 100, ctx => {
          ctx.bullet.penetrate += 10; ctx.bullet.radius *= 2.5;
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
      bronze: _scatterTier(2, 13),
      silver: _scatterTier(3, 18),
      gold: _scatterTier(4, 23),
      diamond: _scatterTier(5, 30),
    },
  },

  arcane_firework: {
    emoji: '🎆',
    name: { zh: '奥术礼花', en: 'Arcane Firework' },
    tiers: {
      silver:  _arcaneFireworkTier(2, 0, 8),
      gold:    _arcaneFireworkTier(2, 0.5, 10),
      diamond: _arcaneFireworkTier(3, 0.5, 13),
    },
  },

  potato: {
    emoji: '🥔',
    name: { zh: '土豆', en: 'Potato' },
    tiers: {
      bronze:  _potatoTier(2, 2, 13),
      silver:  _potatoTier(2, 4, 18),
      gold:    _potatoTier(3, 4, 23),
      diamond: _potatoTier(4, 4, 30),
    },
  },

  fuelcell: {
    emoji: '⛽',
    name: { zh: '燃料匣', en: 'Fuel Cell' },
    tiers: {
      bronze:  _fuelcellTier(1, 2, 1.0, false, 6),    // 小范围伤害
      silver:  _fuelcellTier(1, 3, 2.0, false, 8),    // 普通范围伤害
      gold:    _fuelcellTier(2, 3, 2.0, false, 10),   // 普通范围伤害
      diamond: _fuelcellTier(2, 3, 2.0, true, 13),    // 普通范围伤害 + 燃烧 + 非燃烧敌人点燃
    },
  },

  slowcapsule: {
    emoji: '💊',
    name: { zh: '缓释胶囊', en: 'Slow-Release Capsule' },
    tiers: {
      bronze: _slowCapsuleTier(3, 2, 1, 13),
      silver: _slowCapsuleTier(3, 2, 2, 18),
      gold: _slowCapsuleTier(3, 3, 2, 23),
      diamond: _slowCapsuleTier(3, 3, 3, 30),
    },
  },

  crypt: {
    emoji: '⚰',
    name: { zh: '墓穴', en: 'Crypt' },
    tiers: {
      bronze: _cryptTier(1, 6, 0),
      silver: _cryptTier(1, 8, 1),
      gold: _cryptTier(2, 10, 0),
      diamond: _cryptTier(2, 13, 1),
    },
  },

  skeleton_horn: {
    emoji: '📯',
    name: { zh: '骷髅号角', en: 'Skeleton Horn' },
    tiers: {
      silver:  _skeletonHornTier(2, 1, 18),
      gold:    _skeletonHornTier(3, 1, 23),
      diamond: _skeletonHornTier(4, 1, 30),
    },
  },

  war_banner: {
    emoji: '🚩',
    name: { zh: '战旗', en: 'War Banner' },
    tiers: {
      bronze:  _warBannerTier(1, 1, 23),
      silver:  _warBannerTier(1, 2, 30),
      gold:    _warBannerTier(2, 2, 39),
      diamond: _warBannerTier(2, 3, 50),
    },
  },

  excavate_tomb: {
    emoji: '⚱',
    name: { zh: '掘墓', en: 'Excavate Tomb' },
    tiers: {
      diamond: _excavateTombTier(30),
    },
  },

  arcane_giant: {
    emoji: '🧙',
    name: { zh: '奥术巨人', en: 'Arcane Giant' },
    tiers: {
      gold:    _arcaneGiantTier(3, 39, '巨型'),
      diamond: _arcaneGiantTier(5, 50, '巨型强力'),
    },
  },

  // ─── v8 新卡：令箭 / 战鼓 / 钻头 / 造访剑圣 / 勇闯龙巢 ─────────────────
  order_arrow: {
    emoji: '🏹',
    name: { zh: '令箭', en: 'Order Arrow' },
    tiers: {
      bronze:  _orderArrowTier(1, 1, 13),
      silver:  _orderArrowTier(2, 1, 18),
      gold:    _orderArrowTier(3, 1, 23),
      diamond: _orderArrowTier(3, 2, 30),
    },
  },

  war_drum: {
    emoji: '🥁',
    name: { zh: '战鼓', en: 'War Drum' },
    tiers: {
      bronze:  _warDrumTier(2, 0, 1, 13),
      silver:  _warDrumTier(4, 0, 1, 18),
      gold:    _warDrumTier(4, 2, 1, 23),
      diamond: _warDrumTier(4, 2, 2, 30),
    },
  },

  drill: {
    emoji: '🔩',
    name: { zh: '钻头', en: 'Drill' },
    tiers: {
      // pierceHitCooldown 默认 0.5s（同一颗 bullet × 同一只 enemy 的"穿透中重复命中"间隔）
      // v8.1：用户反馈钻头多次攻击效果不明显 → 再减半 → 攻击小型敌人时一次穿过可触发多发命中
      bronze:  _drillTier(3, 0.05,  23),
      silver:  _drillTier(5, 0.05,  30),
      gold:    _drillTier(5, 0.025, 39),
      diamond: _drillTier(8, 0.025, 50),
    },
  },

  sword_saint_visit: {
    emoji: '🗡',
    name: { zh: '造访剑圣', en: 'Visit Sword Saint' },
    tiers: {
      silver:  _swordSaintVisitTier(false, false, 8),
      gold:    _swordSaintVisitTier(true,  false, 10),
      diamond: _swordSaintVisitTier(true,  true,  13),
    },
  },

  // 口谕：使用即把自身替换为 令箭，并在本关每回合开始洗入一张同 tier 临时 征召令
  decree: {
    emoji: '📜',
    name: { zh: '口谕', en: 'Decree' },
    tiers: {
      silver:  _decreeTier('silver', 30),
      gold:    _decreeTier('gold',   39),
      diamond: _decreeTier('diamond', 50),
    },
  },

  // 征召令（衍生 / 临时）：由 口谕 每回合洗入。发现并获得 2 张下级实体化卡牌的效果。
  //   银 征召令 → 发现铜；金 → 发现银；钻 → 发现金（与 口谕 对应 tier 一致）
  conscription_order: {
    emoji: '📃',
    name: { zh: '征召令', en: 'Conscription Order' },
    excludedFromShop: true,
    tiers: {
      silver:  _conscriptionOrderTier('bronze', 30),
      gold:    _conscriptionOrderTier('silver', 39),
      diamond: _conscriptionOrderTier('gold',   50),
    },
  },

  brave_dragon_lair: {
    emoji: '🐉',
    name: { zh: '勇闯龙巢', en: "Brave Dragon's Lair" },
    tiers: {
      gold:    _braveDragonLairTier(3, 23),
      diamond: _braveDragonLairTier(2, 30),
    },
  },

  lighter: {
    emoji: '🔥',
    name: { zh: '打火机', en: 'Lighter' },
    tiers: {
      bronze: _lighterTier(3, false, 6),
      silver: _lighterTier(4, false, 8),
      gold: _lighterTier(5, false, 10),
      diamond: _lighterTier(6, true, 13),
    },
  },

  finisher: {
    emoji: '⚔',
    name: { zh: '终结技', en: 'Finisher' },
    tiers: {
      bronze:  _finisherTier(4, 2, 1, false, 13),
      silver:  _finisherTier(6, 3, 2, false, 18),
      gold:    _finisherTier(8, 4, 3, false, 23),
      diamond: _finisherTier(8, 4, 3, true,  30),
    },
  },

  // 火力覆盖：伤害 + 数量混合加成
  firepower: {
    emoji: '🎯',
    name: { zh: '火力覆盖', en: 'Barrage' },
    tiers: {
      bronze: _firepowerTier(1, 1, 13),
      silver: _firepowerTier(2, 1, 18),
      gold:   _firepowerTier(2, 2, 23),
      diamond: _firepowerTier(2, 3, 30),
    },
  },

  // 挖掘：使用 +N 伤害；弃置 → 发现 1 张同等级临时卡，洗入手牌并翻为正面。
  //   银：伤害+4，发现任意卡，消耗值-1
  //   金：伤害+5，发现展露卡，消耗值为 0
  //   钻：伤害+6，发现展露卡，消耗值为 0
  excavate: {
    emoji: '⛏',
    name: { zh: '挖掘', en: 'Excavate' },
    tiers: {
      silver:  _excavateTier('any',    'minus1', 4, 18),
      gold:    _excavateTier('reveal', 'zero',   5, 23),
      diamond: _excavateTier('reveal', 'zero',   6, 30),
    },
  },

  // 定向勘探：1 费，使用 +2 伤害；弃置 → 发现 1 张同等级 3 费临时卡。
  directed_survey: {
    emoji: '🧭',
    name: { zh: '定向勘探', en: 'Directed Survey' },
    tiers: {
      bronze: _directedSurveyTier(
        '伤害+2。当你弃置此牌时，发现1张临时的3费卡牌，其消耗值为2；将其洗入手牌并翻为正面。',
        'Damage+2. When discarded, discover 1 temporary 3-cost card (cost set to 2) and shuffle it into your hand face-up.',
        2, 'random', 6,
      ),
      silver: _directedSurveyTier(
        '伤害+2。当你弃置此牌时，发现1张临时的3费卡牌，其消耗值为2；将其洗入最左侧。',
        'Damage+2. When discarded, discover 1 temporary 3-cost card (cost 2) and shuffle it to the leftmost slot.',
        2, 'leftmost', 8,
      ),
      gold: _directedSurveyTier(
        '伤害+2。当你弃置此牌时，发现1张临时的3费卡牌，其消耗值为1；将其洗入最左侧。',
        'Damage+2. When discarded, discover 1 temporary 3-cost card (cost 1) and shuffle it to the leftmost slot.',
        1, 'leftmost', 10,
      ),
      diamond: _directedSurveyTier(
        '伤害+2。当你弃置此牌时，发现1张临时的3费卡牌，其消耗值为0；将其洗入最左侧。',
        'Damage+2. When discarded, discover 1 temporary 3-cost card (cost 0) and shuffle it to the leftmost slot.',
        0, 'leftmost', 13,
      ),
    },
  },

  // 叫魂（银 / 金 / 钻）— 召唤 2 骷髅 + 随机弃 2 张；金/钻强化弃牌效果
  soulcall: {
    emoji: '💀',
    name: { zh: '叫魂', en: 'Soul Call' },
    tiers: {
      silver:  _soulcallTier(2, false, false, 8),
      gold:    _soulcallTier(2, true,  false, 10),
      diamond: _soulcallTier(2, true,  true,  13),
    },
  },

  // 撒豆成兵（银 / 金 / 钻）— 数量爆炸 + 子弹变实体
  bean_soldiers: {
    emoji: '🌱',
    name: { zh: '撒豆成兵', en: 'Bean Soldiers' },
    tiers: {
      silver:  _beanSoldiersTier(2, 30),
      gold:    _beanSoldiersTier(3, 39),
      diamond: _beanSoldiersTier(4, 50),
    },
  },

  // 持续施法（银 / 金 / 钻）— 每回合开始洗入 2 张奥弹，自身变奥术礼花
  continuous_cast: {
    emoji: '🌀',
    name: { zh: '持续施法', en: 'Continuous Cast' },
    tiers: {
      silver:  _continuousCastTier(0, 30),
      gold:    _continuousCastTier(1, 39),
      diamond: _continuousCastTier(2, 50),
    },
  },

  // 穿甲炸弹（金 / 钻）
  armor_piercer: {
    emoji: '💣',
    name: { zh: '穿甲炸弹', en: 'Armor Piercer' },
    tiers: {
      gold:    _armorPiercerTier(Math.PI / 3, 10),
      diamond: _armorPiercerTier(Math.PI / 2, 13),
    },
  },

  // 转生（钻）— 每个敌人死亡 10% 召唤骷髅；自身变墓穴
  reincarnation: {
    emoji: '♻',
    name: { zh: '转生', en: 'Reincarnation' },
    tiers: {
      diamond: _reincarnationTier(50),
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
            // 入队 —— 多张奥弹同时洗面时，每发间隔 110ms 错开播放
            _enqueueArcaneFire(w, card);
          });
        },
        onConceal(card) { card._firing = false; },
      },
    },
  },

  // ─── 奥术进化主卡：使用时洗入 5 张衍生 + 自身变为「奥术礼花」───
  // "先使用，再替换" — onUse 触发洗牌 + 标记自身待替换；fireFromCards 在 toDiscard 之后扫描标记并就地替换。
  //   非主卡：进弃牌堆后，原卡槽位被 arcane_firework 顶替（不是在手牌中追加）。
  //   主卡：bag[0] 在原位被 arcane_firework 顶替。
  // 银/金/钻 tier 对应替换后的 arcane_firework 同 tier。
  arcane_evolution: {
    emoji: '🌌',
    name: { zh: '奥术进化', en: 'Arcane Evolution' },
    tiers: {
      silver: {
        cost: 3, value: 30,
        desc: {
          zh: '将5种奥术进化洗入你的手牌。用奥术礼花替换此牌。',
          en: 'Shuffle 5 Arcane Evolution derivatives into your hand. Replace this card with Arcane Firework.',
        },
        effects: () => [],
        onUse(card, world) { _arcaneEvoOnUse(card, world, 0); },
      },
      gold: {
        cost: 3, value: 39,
        desc: {
          zh: '将5种奥术进化洗入你的手牌。将2张奥术进化翻为正面。用奥术礼花替换此牌。',
          en: 'Shuffle 5 Arcane Evolution derivatives into your hand. Flip 2 of them face-up. Replace this card with Arcane Firework.',
        },
        effects: () => [],
        onUse(card, world) { _arcaneEvoOnUse(card, world, 2); },
      },
      diamond: {
        cost: 3, value: 50,
        desc: {
          zh: '将5种奥术进化洗入你的手牌。将它们翻为正面。用奥术礼花替换此牌。',
          en: 'Shuffle 5 Arcane Evolution derivatives into your hand. Flip all of them face-up. Replace this card with Arcane Firework.',
        },
        effects: () => [],
        onUse(card, world) { _arcaneEvoOnUse(card, world, 5); },
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
        cost: 3, value: 1, destroyOnUse: true, arcEvoDerived: true,
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
        cost: 3, value: 1, destroyOnUse: true, arcEvoDerived: true,
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
        cost: 3, value: 1, destroyOnUse: true, arcEvoDerived: true,
        desc: { zh: '本局对战中，你的奥弹施加1层燃烧。移除此牌。', en: 'For this battle, your Arcane Missiles apply 1 Burn on hit. Remove this card.' },
        effects: () => [],
        onUse(_, world) { world._arcaneEvo = world._arcaneEvo || {}; world._arcaneEvo.fire = (world._arcaneEvo.fire || 0) + 1; },
      },
    },
  },
  arc_evo_missile: {
    emoji: '✷',
    name: { zh: '奥术进化-弹', en: 'Arc.Evo · Bounce' },
    excludedFromShop: true,
    tiers: {
      bronze: {
        cost: 3, value: 1, destroyOnUse: true, arcEvoDerived: true,
        desc: { zh: '本局对战中，你的奥弹弹射+1。移除此牌。', en: 'For this battle, your Arcane Missiles gain Bounce +1. Remove this card.' },
        effects: () => [],
        onUse(_, world) { world._arcaneEvo = world._arcaneEvo || {}; world._arcaneEvo.bound = (world._arcaneEvo.bound || 0) + 1; },
      },
    },
  },
  arc_evo_ice: {
    emoji: '❄',
    name: { zh: '奥术进化-冰', en: 'Arc.Evo · Ice' },
    excludedFromShop: true,
    tiers: {
      bronze: {
        cost: 3, value: 1, destroyOnUse: true, arcEvoDerived: true,
        desc: { zh: '本局对战中，你的奥弹有25%概率施加冻结。移除此牌。', en: 'For this battle, your Arcane Missiles have 25% chance to apply Freeze. Remove this card.' },
        effects: () => [],
        onUse(_, world) { world._arcaneEvo = world._arcaneEvo || {}; world._arcaneEvo.freezeChance = (world._arcaneEvo.freezeChance || 0) + 0.25; },
      },
    },
  },
};

// 5 张奥术进化衍生卡的 family id 列表（用于扫描清理 / 批量 spawn）
const ARC_EVO_DERIVED_FAMILIES = ['arc_evo_power', 'arc_evo_pierce', 'arc_evo_fire', 'arc_evo_missile', 'arc_evo_ice'];

// 奥术进化使用时调用：洗入 5 张衍生 + 标记自身待替换为 arcaneboost。
// "先使用，再替换" — onUse 只设置标记；fireFromCards 在 toDiscard 之后扫描标记并就地替换。
// revealCount: 衍生牌中翻为正面的张数（金=2, 钻=5）。0 = 不翻。
function _arcaneEvoOnUse(card, world, revealCount = 0) {
  // 洗入 5 张衍生（顺序：力 / 穿 / 火 / 弹 / 冰）。
  // 衍生 def 只有 bronze 版本（效果固定），但把 rarity / tier 覆盖成主卡同 tier
  // → 卡面边框 / 底色与主卡视觉一致（玩家一眼能看出"是哪级奥术进化产物"）。
  const cardTier = card.tier || 'bronze';
  const spawned = [];
  for (const f of ARC_EVO_DERIVED_FAMILIES) {
    const d = mkCard(f, 'bronze');
    d.tier = cardTier;
    d.rarity = cardTier;
    world.deck.shuffleIntoHand(d);
    spawned.push(d);
  }
  // 金/钻：翻 N 张为正面（_foresightFaceUp 标记 = 不只在边缘也保持正面）
  if (revealCount > 0) {
    const shuffled = spawned.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = randInt(0, i);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const n = Math.min(revealCount, shuffled.length);
    for (let i = 0; i < n; i++) {
      shuffled[i]._foresightFaceUp = true;
      world.deck._setFace(shuffled[i], true);
    }
    Events.emit('deckChanged');
  }
  // 视觉：在炮台位置撒紫色粒子表示 "进化触发"
  const p = world.player;
  if (p) {
    for (let i = 0; i < 18; i++) {
      const a = Math.PI * 2 * Math.random();
      const sp = 70 + Math.random() * 100;
      world.particles.push(new Particle({
        x: p.x, y: p.y - 30, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
        life: 0.45 + Math.random() * 0.2, color: i % 2 ? '#c97aff' : '#aef0fb', size: 3,
      }));
    }
  }
  // 打上标记：fire 流程在所有 toDiscard 完成后会扫描 bag / discard，把标记的卡换成同 tier 的奥术礼花
  // （v9：原本替换为奥术强化 [arcaneboost]，v9 改为奥术礼花 [arcane_firework]）
  card._becomeArcaneFirework = card.tier;
}

// 扫描 bag (主卡槽) + discard，把使用过后带"待替换"标记的卡就地换成对应衍生家族。
// 由 fireFromCards 在 toDiscard 之后调用。
//   _becomeArcaneFirework   → arcane_firework （奥术进化 + 持续施法）
//   _becomeCrypt            → crypt       （转生）
//   _becomeOrderArrow       → order_arrow （口谕）
const _CARD_REPLACEMENTS = [
  { mark: '_becomeArcaneFirework', family: 'arcane_firework' },
  { mark: '_becomeCrypt',          family: 'crypt' },
  { mark: '_becomeOrderArrow',     family: 'order_arrow' },
];
function _resolveArcaneEvoReplacements(world) {
  const deck = world.deck;
  if (!deck) return;
  let changed = false;
  // 临时卡（_destroyAfterUse）已经在 fireFromCards 里通过 destroyCard 移除了，
  // 这里再加一道防御：即使临时卡因某种意外仍残留在 bag/discard 里，
  // 也不要把它替换为别的卡（"替换此牌"的文字在临时卡身上不应生效）。
  const isReplaceable = (c) => !!c && !c._destroyAfterUse;
  // 主卡槽（bag[0]）— 用 deck.replaceAt 保持 face-up 状态
  const main = deck.bag[0];
  if (isReplaceable(main)) {
    for (const r of _CARD_REPLACEMENTS) {
      if (main[r.mark]) {
        deck.replaceAt(0, mkCard(r.family, main[r.mark]));
        changed = true;
        break;
      }
    }
  }
  // 弃牌堆：直接索引替换（弃牌堆里的卡 faceUp 已是 false，新卡也保持 false）
  for (let i = 0; i < deck.discard.length; i++) {
    const c = deck.discard[i];
    if (!isReplaceable(c)) continue;
    for (const r of _CARD_REPLACEMENTS) {
      if (c[r.mark]) {
        deck.discard[i] = mkCard(r.family, c[r.mark]);
        changed = true;
        break;
      }
    }
  }
  if (changed) Events.emit('deckChanged');
}

// ─── 发现（Discover）关键词框架 ──────────────────────────────────────
// 通用机制：卡牌 onUse 中调用 triggerDiscover(world, opts)
//   → 暂停发射流程 → 弹出弹窗显示 3 张候选 → 玩家点击 → 触发 onPick → 继续发射。
// opts:
//   candidates: Card[] (前 3 张被用作候选；不足 3 张按实际数显示)
//   onPick:     (chosen: Card) => void  — 玩家点击后立即调用
//   title?:     string — 弹窗标题，默认 "发现"
//   sub?:       string — 弹窗副标题，默认 "选择一张卡"
//   sourceCard?: Card — 触发此发现的源卡（UI 队列提示用）
// 候选卡只是 UI 展示用 — 框架不会自动 spawn / 入手 / 入背包。具体效果完全由 onPick 决定。
function triggerDiscover(world, opts) {
  if (!opts || !opts.candidates || !opts.onPick) return;
  const candidates = opts.candidates.filter(Boolean).slice(0, 3);
  if (candidates.length === 0) return;        // 无候选 → 直接放弃，不弹窗
  if (world._discoverPending) {
    // 已有发现在挂起 → 后者排队等前者结算（如叫魂同时弃置挖掘 + 定向勘探）
    world._discoverQueue = world._discoverQueue || [];
    world._discoverQueue.push(opts);
    // 队列变化 → 通知 UI 刷新"剩余 N 个"标签
    Events.emit('discoverQueueChanged', _discoverQueueSummary(world));
    return;
  }
  world._discoverPending = {
    candidates,
    onPick: opts.onPick,
    sourceCard: opts.sourceCard || null,
    title: opts.title || (LANG.current === 'zh' ? '发现' : 'Discover'),
    sub: opts.sub || (LANG.current === 'zh' ? '选择一张卡' : 'Pick a card'),
    resolved: false,
    _continuation: null,
  };
  Events.emit('discoverShow', {
    ...world._discoverPending,
    queueSummary: _discoverQueueSummary(world),
  });
}

// UI 点击候选卡时调用。idx 越界 / 已 resolve → 静默忽略。
function resolveDiscover(world, idx) {
  const d = world._discoverPending;
  if (!d || d.resolved) return;
  d.resolved = true;
  const chosen = d.candidates[idx];
  world._discoverPending = null;
  Events.emit('discoverHide');
  if (chosen) {
    _recordAction(world, chosen, 'discover');
    try { d.onPick(chosen); } catch (e) { console.error('triggerDiscover onPick error', e); }
  }
  // 队列中还有等待的发现 → 推下一个；否则继续发射流程
  const next = world._discoverQueue && world._discoverQueue.shift();
  const cont = d._continuation;
  if (next) {
    // 把当前 continuation 转交给下一个发现
    triggerDiscover(world, next);
    if (cont && world._discoverPending) world._discoverPending._continuation = cont;
    return;
  }
  if (cont) queueMicrotask(cont);   // 推迟一帧让 UI 隐藏先生效
  // 没有续接的发现 → 若有 action 挂起，尝试 flush
  _maybeFlushAction(world);
}

// ─── 上一操作记录系统 ──────────────────────────────────────────────
// 每次玩家"动作"（发射 / 弃牌 / 结束回合）的所有卡牌按时间顺序记录到 _currentAction，
// 整个 action 完成后 commit 到 _lastAction → 左侧栏卡堆显示。
function _beginAction(world) {
  if (!world) return;
  // 只在"真正新一轮"开头清空 currentAction：depth 0 且没有挂起的 flush（即没有正在等待 discover 收尾的 action）
  if ((world._actionDepth || 0) === 0 && !world._actionPendingFlush) {
    world._currentAction = [];
  }
  world._actionDepth = (world._actionDepth || 0) + 1;
}
function _endAction(world) {
  if (!world || !world._actionDepth) return;
  world._actionDepth--;
  if (world._actionDepth === 0) {
    world._actionPendingFlush = true;
    _maybeFlushAction(world);
  }
}
function _maybeFlushAction(world) {
  if (!world || !world._actionPendingFlush) return;
  // 发现挂起时 wait —— 等 resolveDiscover 后再 flush
  if (world._discoverPending) return;
  if (world._discoverQueue && world._discoverQueue.length > 0) return;
  if ((world._actionDepth || 0) > 0) return;
  world._actionPendingFlush = false;
  const records = world._currentAction || [];
  if (records.length > 0) {
    world._lastAction = records;
    world._currentAction = [];
    Events.emit('lastActionChanged', world._lastAction);
  }
}
function _recordAction(world, card, kind) {
  if (!world || !card) return;
  // 只在战斗中记录（包括 discover 期间 state 仍是 Battle）
  if (world.battle && world.battle.state !== State.Battle) return;
  // 没在 action 内的记录也接收（防御性）：以 0 深度先开 1 个隐式 action
  if (!world._actionDepth) {
    _beginAction(world);
    queueMicrotask(() => _endAction(world));
  }
  world._currentAction = world._currentAction || [];
  world._currentAction.push({
    familyId: card.familyId,
    tier: card.tier,
    cardRef: card,        // 弱引用：若 card 还活着则用真实数据展示
    kind,
    ts: performance.now(),
  });
}

// 返回队列中剩余发现的摘要：[{title, sourceName}]
function _discoverQueueSummary(world) {
  const q = world._discoverQueue || [];
  return q.map(opts => ({
    title: opts.title || (LANG.current === 'zh' ? '发现' : 'Discover'),
    sourceName: opts.sourceCard?.familyName || null,
  }));
}

// 战斗结束 / 阵亡时强制清理（不触发 onPick，避免对已死的世界做副作用）
function _clearDiscoverState(world) {
  world._discoverPending = null;
  world._discoverQueue = null;
  Events.emit('discoverHide');
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
    const removed = world.removedFamilyIds;
    const pool = allFamilies.filter(f => {
      if (!CARD_DATA[f].tiers[tier]) return false;
      // 玩家已剔除的 family：本局完全黑名单
      if (removed && removed.has(f)) return false;
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
    this.bag = [];          // ground truth: 10 张（关卡内可能被替换效果改写）
    this.hand = [];         // 战斗中：场上手牌（开战时 = 全部非主卡，用一张少一张）
    this.discard = [];      // 战斗中：弃牌堆（手牌空时全部洗回）
    // 关卡 snapshot：炉石模式 — 每关开始前 snapshot 一份 bag；关卡末从 snapshot 恢复 bag，
    // 让"奥术进化 → 奥术强化"、"持续施法 → 奥术礼花"、"转生 → 墓穴" 等替换只在本关有效。
    // 玩家在商店里的 inventory 编辑（拖拽 / 替换 / 剔除 / 锁定）直接修改 bag —
    // 下次开战时 snapshot 会包含这些编辑，保证编辑持久。
    this._stageOriginalBag = null;
  }

  // 把当前 bag 复制一份保存（用 mkCard 重建 → 清掉所有 in-battle 状态字段，只保留 locked）
  // 在 startBattle / _startNextStage 调；resetForBattle 之前。
  snapshotStageBag() {
    this._stageOriginalBag = this.bag.map(c => _cloneCardForStageSnapshot(c));
  }

  // 从 snapshot 还原 bag（克隆一份避免 snapshot 自己被后续修改污染）
  // 在 _endStage 调（商店开启前）。如果还没 snapshot 过（首次开战前的边角情况）→ no-op。
  restoreStageBag() {
    if (!this._stageOriginalBag) return;
    for (const c of this.bag) {
      if (c.faceUp) { c.onConceal(); c.faceUp = false; }
    }
    this.bag = this._stageOriginalBag.map(c => _cloneCardForStageSnapshot(c));
    Events.emit('bagChanged');
    Events.emit('deckChanged');
  }

  // 清掉 stage snapshot（resetForNewGame 调）
  clearStageSnapshot() { this._stageOriginalBag = null; }

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

  // 剔除卡牌：从背包移除指定槽位（splice，后续槽位前移）。
  // 主卡（index 0）不可剔；保留至少 main + 1 张其它，避免空牌组软锁。
  // 返回被移除的卡，或 null（拒绝）。
  removeAt(i) {
    if (i <= 0 || i >= this.bag.length) return null;
    if (this.bag.length <= 2) return null;
    const removed = this.bag[i];
    if (removed && removed.faceUp) { removed.onConceal(); removed.faceUp = false; }
    this.bag.splice(i, 1);
    Events.emit('bagChanged');
    return removed;
  }

  setAsMain(i) {
    if (i <= 0 || i >= this.bag.length) return;
    this.swap(0, i);
    Events.emit('mainCardSet', this.bag[0]);
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

  // 边缘卡 (最左 / 最右) 始终展露；非边缘卡仅在 _foresightFaceUp 标记下保持正面。
  // 关键规则（两向）：边缘 → 正面；非边缘 → 背面（除非主动 _foresightFaceUp 锁定）。
  //   _foresightFaceUp 的语义是"把一张当前非边缘的卡强制翻正面"。
  //   一旦该卡因移动到边缘获得自然 face-up，flag 就完成了使命 → 清零，
  //   这样后续若被挤离边缘可以正常变回背面（防止"卡 A 进入边缘后翻面，被挤开仍保持正面"的 bug）。
  _updateFaceUp() {
    for (let i = 0; i < this.hand.length; i++) {
      const c = this.hand[i];
      const isEdge = i === 0 || i === this.hand.length - 1;
      if (isEdge) {
        // 边缘卡：天然正面；同时清掉 _foresightFaceUp，让规则在它被挤离边缘时双向生效
        c._foresightFaceUp = false;
        this._setFace(c, true);
      } else {
        // 非边缘：仅当 _foresightFaceUp / _alwaysFaceUp 仍存在时保持正面
        this._setFace(c, !!c._foresightFaceUp || !!c._alwaysFaceUp);
      }
    }
  }

  _setFace(card, faceUp) {
    if (card.faceUp === faceUp) return;
    card.faceUp = faceUp;
    if (faceUp) card.onReveal();
    else card.onConceal();
    Events.emit('cardFlipped', { card, faceUp });
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
  // 注意：doDiscard 走的路径里，takeSide 已经先把卡从 hand 拿走。这里既不在 hand 也不在 discard
  //   也算"销毁"成功 — 总是发 deckChanged，让 renderHand 跑离场动画 + 触发空手洗牌检查。
  destroyCard(card) {
    // 默认按 "buff" 离场（衍生卡如奥术飞弹自毁场景视觉等同于"魔法效果"）
    if (!card._lastAction) card._lastAction = 'buff';
    card._foresightFaceUp = false;
    const i = this.hand.indexOf(card);
    if (i >= 0) this.hand.splice(i, 1);
    const j = this.discard.indexOf(card);
    if (j >= 0) this.discard.splice(j, 1);
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

  // 洗入：随机插入手牌 + 重算边缘（落在边缘的卡会自动触发 onReveal）
  // 通常配合洗入号令 / 奥弹之书 等"洗入时触发"卡：emit shuffledIn 事件
  shuffleIntoHand(card) {
    const idx = randInt(0, this.hand.length);
    this.hand.splice(idx, 0, card);
    this._updateFaceUp();
    Events.emit('deckChanged');
    Events.emit('shuffledIn', card);     // 洗入号令 / 奥弹之书 监听此事件
    // 上一操作：洗入手牌的卡（奥弹 / 挖掘衍生 / 征召令 等）记为 'shuffle'
    if (window.__game) _recordAction(window.__game, card, 'shuffle');
  }

  // 弃置 n 张随机手牌（任意面）。返回实际弃置的卡数组。叫魂用。
  // 每张弃出的卡都会触发其 onDiscard（如挖掘/定向勘探的发现），
  // 多个发现按 triggerDiscover 队列依次结算。
  discardRandomFromHand(n) {
    const world = window.__game;
    const discarded = [];
    const popped = [];
    for (let i = 0; i < n; i++) {
      if (this.hand.length === 0) break;
      const idx = randInt(0, this.hand.length - 1);
      const card = this.hand.splice(idx, 1)[0];
      this._setFace(card, false);
      popped.push(card);
      discarded.push(card);
    }
    // 触发每张被弃卡的 onDiscard（顺序：先弹出的先触发）
    for (const card of popped) {
      if (world) _recordAction(world, card, 'discard');
      try { card.onDiscard?.(world, world?.player); } catch (e) { console.error('discardRandomFromHand onDiscard', e); }
      if (world) handleDiscardForNecromancer(world);
      if (card._destroyAfterUse) {
        card._lastAction = 'shatter';
        if (world) world.deck.destroyCard(card);
      } else {
        card._lastAction = 'discard';
        this.discard.push(card);
      }
    }
    this._updateFaceUp();
    Events.emit('deckChanged');
    return discarded;
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
    // v8.3：敌方回合压缩到 0.3s + settle 0.2s = 0.5s 总（旧值 0.5+0.75=1.25s）
    // 配套：ENEMY_TYPES.* speed × 2.5，让单回合移动距离保持不变（不变成乌龟）
    this.enemyTurnDuration = 0.3;    // 怪物回合持续时间
    this.autoEndOnZeroMana = true;   // 默认开启：法力用尽自动结束回合
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
    // 玩家回合开始：护甲重置；清空本回合用过的卡牌（用于奥弹 / 骷髅继承本回合 buff）
    if (t === 'player') {
      const p = this.world.player;
      p.armor = p.armorPerTurn || 3;
      Events.emit('armorChanged', p.armor);
      this.world._turnHookCards = [];
      // 持续施法：每回合开始洗入 2 张奥弹（仅在战斗中，避免商店/选卡阶段触发）
      if (this.world._contCastActive && this.state === State.Battle) {
        _continuousCastShuffleIn(this.world);
      }
      // 口谕：每回合开始为每张已使用的 口谕 洗入一张同 tier 临时 征召令
      if (this.world._decreeTiers && this.state === State.Battle) {
        for (const tk of this.world._decreeTiers) {
          _decreeShuffleIn(this.world, tk);
        }
      }
      // v8.2 修复：法力在"玩家回合真正开始时"回满 —— 而不是在 _afterPlayerTurnComplete
      // （玩家回合结束、即将进入敌方回合时）。
      // 旧实现的 bug：法力回满后 setTurn('enemy')，但敌方真正行动还要等子弹清场 + 实体阶段
      // + enemyPhaseDeferred (0.85s+) + enemyTurnTimer (0.5s) + settle (0.75s) ≈ 2-3 秒。
      // 这段窗口里玩家鼠标点击仍能发射（doFire 不检查 turn，只检查 mana 与冷却），
      // 等于偷了一发；等真正的敌方回合结束 + setTurn('player') 时 mana 已被用空 →
      // auto-end-zero-mana 立刻触发 → 又进入一个敌方回合 → 玩家看到的就是"敌方连续 2 次"。
      // 把回满挪到回合开始 = 关闭这个偷帧窗口。
      p.mana = p.maxMana;
      Events.emit('manaChanged', p.mana);
      // 回合开始缓冲：把 auto-end 计时器预置为负值，保证玩家至少有 ~1s 反应时间
      // 即使开局法力不足以发牌（如被时空法师抽光、所有牌都贵）也不会瞬间被 auto-end 跳过。
      // 中途因发牌导致法力不足 → else 分支已经把计时器清 0，仍走 0.25s 原速度，不影响节奏。
      // v8.1：auto-end-no-enemy 缓冲 0.5s → 2.5s（避免无敌人时连续自动跳回合的视觉错乱）
      this._autoEndSettleTime = -0.75;
      this._autoEndNoEnemySettleTime = -2.0;
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
  // 骷髅本身是实体化子弹，由 _tickEntityBullets 统一驱动（含其 EntityTurn dash hook）
  _startEntityPhase() {
    this._entityPhasePending = false;
    this._tickEntityBullets();
    this._tickSummonOverTurns();
    this._tickFriendlyDecay();
    this._tickSummonFire();
    // 实体效果异步播放（setTimeout，最长 ~810ms）→ 等到所有钩子 fire 完 + 钩子里 spawn 的友方子弹
    // （蝙蝠追踪弹 lifetime 2.2s、引信扩散等）也落地，再进敌方阶段。
    // _enemyPhaseDeferred=true 时 update 轮询：先等 minDelay（0.85s），然后等友方子弹清空，
    // 最多再加 2s safety valve。
    const hasEntity = this.world.bullets.some(b => b.alive && b.isEntity);
    if (hasEntity) {
      this._enemyPhaseDeferred = true;
      this._enemyPhaseDeferT = 0;
    } else {
      this._startEnemyPhase();
    }
  }

  // 阶段 2：敌方回合（波次 spawn + intent 推进）；解锁敌人移动 + 启动回合计时
  _startEnemyPhase() {
    this._enemyPhasePending = false;
    // 重置每回合免伤次数（守卫等带 _maxImmuneCharges 的敌人）
    for (const e of this.world.enemies) {
      if (!e.alive) continue;
      if (e._maxImmuneCharges) e._immuneCharges = e._maxImmuneCharges;
    }
    this._tickWaveSpawn();
    this._tickEnemyIntents();
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
      // 骷髅 / 亡灵龙特殊：层数在 destroy() 里按"一次冲撞 -1"消耗，不在每回合开头自动 -1。
      // 这里只触发它的 EntityTurn 钩子（= 设速度起冲）。
      const isSkeleton = b._isSkeleton || b._isUndeadDragon;
      if (n === 0) {
        if (isSkeleton) continue;
        // 无 EntityTurn 钩子（纯坦克实体）→ 仅扣一层即可（_noEntityDecay 标记可豁免 — 热气球金/钻）
        if (!b._noEntityDecay) {
          b.entityLayers--;
          // 浮字 FX 由通用 buff-diff 侦测器统一负责
          if (b.entityLayers <= 0) {
            b.triggerHooks(Phase.Destroyed, { world: w });
            b.alive = false;
          }
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
      if (isSkeleton) continue;        // 骷髅不在这里扣层
      // 所有 EntityTurn 钩子播完之后再扣 1 层（整颗实体每回合仅扣 1，不论多少个挥剑钩子）
      // _noEntityDecay 标记 → 跳过回合衰减（热气球金/钻）
      if (b._noEntityDecay) continue;
      const lastFireMs = (n - 1) * staggerMs;
      setTimeout(() => {
        if (!b.alive) return;
        b.entityLayers--;
        // 浮字 FX 由通用 buff-diff 侦测器统一负责
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
    // 立即切到 Idle 防止重入：玩家选完炮台后 cb 会再调 startBattle，那时 state 必须不是
    // PostBattle，否则 resetForNewGame 会把刚选的 cannon 又清掉 → 模态死循环
    if (this.state === State.PostBattle) {
      this.world.resetForNewGame();
      this.setState(State.Idle);
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
    this.world._turnHookCards = [];     // 本回合用过的卡（奥弹/骷髅继承）清空
    this.world._contCastActive = false; // 持续施法 本局状态清空
    this.world._contCastRolls = 0;
    this.world._decreeTiers = [];       // 口谕 本局状态清空
    this.world._reincarnateActive = false; // 转生 本局状态清空
    _clearDiscoverState(this.world);     // 发现弹窗 残留清理
    this.world.summons = [];
    this.world.inventoryDiscount = 0;   // 背包减费跨关不继承
    Events.emit('inventoryDiscountChanged', 0);
    // 关卡 snapshot：在 resetForBattle 之前 snapshot 当前 bag，
    // 关卡内的"卡牌替换"效果（持续施法→奥术礼花 等）只改 bag，关卡末从 snapshot 恢复。
    this.world.deck.snapshotStageBag();
    this.world.deck.resetForBattle();
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
    if (this.world._discoverPending) return;   // 发现挂起 → 玩家必须先选择
    _beginAction(this.world);
    // 自动弃置：手牌中标记了 _autoDiscardAtTurnEnd 的卡（如掘墓发现的临时骷髅牌）。
    // 调用 onDiscard 触发其效果，然后销毁（_destroyAfterUse → 破碎；否则进弃牌堆）。
    const autoDiscards = this.world.deck.hand.filter(c => c._autoDiscardAtTurnEnd);
    for (const c of autoDiscards) {
      const idx = this.world.deck.hand.indexOf(c);
      if (idx < 0) continue;
      this.world.deck.hand.splice(idx, 1);
      this.world.deck._setFace(c, false);
      _recordAction(this.world, c, 'discard');
      try { c.onDiscard?.(this.world, this.world.player); } catch (e) { console.error('auto-discard onDiscard', e); }
      handleDiscardForNecromancer(this.world);
      if (c._destroyAfterUse) {
        c._lastAction = 'shatter';
        this.world.deck.destroyCard(c);
      } else {
        c._lastAction = 'discard';
        this.world.deck.toDiscard(c);
      }
    }
    if (autoDiscards.length > 0) {
      this.world.deck._updateFaceUp();
      Events.emit('deckChanged');
    }
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
      _endAction(this.world);
      return;
    }
    this._afterPlayerTurnComplete();
    _endAction(this.world);
  }

  // 玩家回合"完整结束"之后的统一处理（不洗牌 — 手牌保留；只进敌方回合）
  // 洗牌发生在商店关闭后（继续按钮内调 resetForBattle）
  // v8.2：之前在此处回满法力，但会让玩家在"敌方未真正行动的子弹清场期"偷射一发；
  //       已挪到 setTurn('player') 内（敌方真行动完才回满 → 关掉偷帧窗口）。
  _afterPlayerTurnComplete() {
    this.setTurn('enemy');
    this.enemyTurnTimer = this.enemyTurnDuration;
    // 重置沉淀状态：每次进入敌方回合都从"未沉淀"开始
    this._enemySettling = false;
    this._enemySettleTimer = 0;
  }

  // 商店关闭后调用：直接进入新的玩家回合（敌方回合已经在商店之前结算完了）
  // v8.2：法力由 setTurn('player') 自动回满，这里的显式赋值变成冗余但无害（设到同值）
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
    // 炉石模式：阵亡也撤销本关替换效果，让 PostBattle 期间 / restart 前的 bag 显示原卡。
    this.world.deck.restoreStageBag();
    this.world.deck.clearBattleState();
    _clearDiscoverState(this.world);
    this.setState(State.PostBattle);
    toast(t('enter_to_restart'), 2.5);
  }

  update(dt) {
    if (this.state !== State.Battle) return;

    // 阶段 0：进入敌方回合后，等场上所有非实体的我方子弹清空（撞墙 / 命中 / 寿命 / 变实体）
    //         → 启动实体回合（剑士挥剑等）→ 启动敌方回合（敌人移动 + intent）
    // "无敌人快进"：场上没有活敌人时，敌方回合的所有等待都跳过（让游戏丝滑）
    //   - 不等子弹清场（反正没人能被打到）
    //   - 不等 0.85s defer / 0.5s enemyTurnTimer / 0.75s settle
    //   - 仍走 _startEntityPhase / _startEnemyPhase（要 spawn 新波次 / tick intent）
    const _noEnemiesNow = !this.world.enemies.some(e => e.alive);

    if (this._entityPhasePending && this.turn === 'enemy') {
      const hasFlying = this.world.bullets.some(b => b.alive && !b.isEntity && b.team !== 'enemy');
      if (!hasFlying || _noEnemiesNow) this._startEntityPhase();
    }

    // 阶段 1 → 阶段 2 过渡：等实体钩子全部 fire（≥0.85s）+ 它们 spawn 出来的友方子弹
    //          （蝙蝠追踪弹 / 引信扩散弹等）落地后才启动敌方回合，避免敌人在我方子弹还在飞时就行动
    if (this._enemyPhaseDeferred && this.turn === 'enemy') {
      this._enemyPhaseDeferT += dt;
      // 无敌人 → 跳过 defer 立即启动
      const ready = _noEnemiesNow || this._enemyPhaseDeferT >= 0.85;
      if (ready) {
        const hasFriendlyFlying = this.world.bullets.some(b =>
          b.alive && !b.isEntity && b.team !== 'enemy');
        if (!hasFriendlyFlying || _noEnemiesNow || this._enemyPhaseDeferT > 0.85 + 2.0) {
          this._enemyPhaseDeferred = false;
          this._enemyPhaseDeferT = 0;
          this._startEnemyPhase();
        }
      }
    }

    // 怪物回合倒计时 → 行动结束后 0.75s 沉淀窗口（让挥剑、爆炸、AOE 等特效与扣血结算完成）
    // 阶段 1 (_enemyPhasePending) 进行中 → 不递减计时器，等我方实体效果跑完才正式开始敌方阶段
    if (this.turn === 'enemy' && !this._enemyPhasePending) {
      // 无敌人 → 直接强制把所有计时器归零，下一帧进玩家回合
      if (_noEnemiesNow) {
        this.enemyTurnTimer = 0;
        this._enemySettling = true;
        this._enemySettleTimer = 0;
        this._enemySettleExtra = 0;
      }
      if (!this._enemySettling) {
        this.enemyTurnTimer -= dt;
        if (this.enemyTurnTimer <= 0) {
          this._enemySettling = true;
          // v8.3：settle 0.75 → 0.2（与 enemyTurnDuration 配套压缩到总 0.5s）
          this._enemySettleTimer = 0.2;
          if (_noEnemiesNow) this._enemySettleTimer = 0;
        }
      } else {
        this._enemySettleTimer -= dt;
        if (this._enemySettleTimer <= 0) {
          // 沉淀期满 → 再额外等待我方"非实体"子弹清空（蝙蝠 / 亡灵法师 在 EntityTurn 中
          // 异步 spawn 的追踪弹可能还在飞）；安全阀 2s 上限避免卡死。
          // 无敌人 → 跳过 extra wait
          const hasFriendlyFlying = this.world.bullets.some(b =>
            b.alive && !b.isEntity && b.team !== 'enemy');
          this._enemySettleExtra = this._enemySettleExtra || 0;
          if (hasFriendlyFlying && this._enemySettleExtra < 2.0 && !_noEnemiesNow) {
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
        }
      }
    }

    // 设置：场上无敌人时自动结束回合（金球也算敌人 → 在场时阻塞，让玩家可以慢慢打掉换金币）
    // mana → gold 由 endPlayerTurn 统一处理（任何方式结束回合都生效）
    // 教程模式：完全禁用自动结束回合，避免反复触发回合切换 / 法力转金币干扰引导
    if (this.autoEndOnNoEnemy && !this.world._tutorialMode && this.turn === 'player'
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
    // 教程模式：禁用，由教程脚本控制回合切换
    if (this.autoEndOnZeroMana && !this.world._tutorialMode && this.turn === 'player'
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
    // 教程模式：完全跳过波次系统（由教程脚本控制 spawn）
    if (w._tutorialMode) return;
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
    // 炉石模式：关卡末从本关 snapshot 恢复 bag —— 撤销所有"关卡内"替换效果
    //   持续施法→奥术礼花 / 奥术进化→奥术强化 / 转生→墓穴 都会还原回原卡。
    //   玩家在接下来的商店里看到 + 编辑的是原始 bag。
    this.world.deck.restoreStageBag();
    this.world.pendingShops = (this.world.pendingShops || 0) + 1;
    this.resumeAfterLoot = true;
    this._stageEndPending = true;
    // 通关音：在商店打开"之前"播放（要求：关卡通过音在进入商店前播）
    playSfx('stageClear', 200);
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
    w._contCastActive = false;   // 持续施法 本局状态清空
    w._contCastRolls = 0;
    w._decreeTiers = [];          // 口谕 本局状态清空
    w._reincarnateActive = false; // 转生 本局状态清空
    w._discardCounters = {};     // 勇闯龙巢等"本关共享弃置计数"清空
    _clearDiscoverState(w);       // 发现弹窗 残留清理
    w._turnHookCards = [];       // 本回合用过的卡（奥弹/骷髅继承）清空
    w.inventoryDiscount = 0;
    Events.emit('inventoryDiscountChanged', 0);
    w.combo.reset();
    w.addComboStacks(-999);
    // 新关 snapshot：玩家可能在商店里修改了 bag，所以要 snapshot 新一份作为本关原始 bag。
    w.deck.snapshotStageBag();
    // 关卡内"洗入手牌"等临时卡也清空（这些 hook 在 deck 上由未来的卡牌系统处理 —
    // 当前 resetForBattle 已经把 hand/discard 重洗、临时卡若标记 _stageScoped 也丢弃）
    w.deck.resetForBattle();
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

  // 单波奖励预算（v 调整：降低金币掉落，避免后期金币过剩 + 让刷新涨价有意义）
  //   gold(w) = 2 + 0.025w + 0.0003w²   // 比旧公式降 ~40%
  //   xp(w)   = 10 + 0.16w              // XP 不动
  _waveRewardBudget(w) {
    return {
      gold: Math.max(1, Math.floor(2 + 0.025 * w + 0.0003 * w * w)),
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
  // 用 effectiveCardCost 统一读取（含 _battleCostOverride / _costMod / 主卡 mainCostMod）
  //   → 挖掘洗入的 0 费卡能正确算入，不会被 autoEnd 错杀。
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
    const mainCost = main ? effectiveCardCost(main, this.world, true) : 0;
    return Math.min(
      effectiveCardCost(left, this.world, false),
      effectiveCardCost(right, this.world, false),
    ) + mainCost;
  }

  _spawnEnemy(typeKey) {
    // 仅从顶部 spawn（梯形上底 = 整个 canvas 宽）；若未指定 typeKey 则按当前累计波次池随机
    const W = this.world.w, m = 40;
    if (!typeKey) {
      const pool = _availableEnemies(Math.max(1, this.waveNumber));
      typeKey = pool[randInt(0, pool.length - 1)] || 'goblin';
    }
    const e = new Enemy(rand(m, W - m), m, typeKey, this.world);
    // 按当前累计波次缩放敌人统计 — 第 10 关（waveNumber ≈ 50）后明显陡化
    //   shifted = max(0, waveNumber - 50)
    //   HP   × e^(shifted / 180)         无上限（每 180 波 ×e；wave 100 → ×1.32，wave 200 → ×2.31）
    //   攻击 ×(1 + shifted / 300), cap 5  5 倍上限（wave 1250 满；wave 100 → 1.17, wave 200 → 1.5）
    //   速度 ×(1 + shifted / 800), cap 2  2 倍上限（wave 850 满）
    const turn = this.waveNumber || 0;
    const shifted = Math.max(0, turn - 50);
    const hpMult = Math.exp(shifted / 180);
    const atkMult = Math.min(5, 1 + shifted / 300);
    const spdMult = Math.min(2, 1 + shifted / 800);
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
    // 背包打开费用减免：玩家回合结束时若有剩余法力，按数值累计到此处（上限 10）。
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
    // 刷新成本：本店内每刷一次 refreshCount++，cost = REFRESH_BASE + REFRESH_STEP * refreshCount
    // 跨关折扣：上一店里刷了 N 次 → 本店初始 refreshCount 按"折扣"反推：
    //   N = 0  → 重置为 0（初始基础价）
    //   1 ≤ N ≤ 9 → 等价于"上一店最后价 * (1 - 0.1*N)"，反推成 refreshCount
    //   N ≥ 10 → 没折扣，保留 prev refreshCount
    this.gold = 10;
    this.refreshCount = 0;
    this._lastShopRefreshCount = 0;     // 上一家店打烊时的 refreshCount（用于跨店折扣）
    // 删除卡牌花费：初始 10，每次翻倍（10/20/40/...）；阵亡重开清零
    this.removalCount = 0;
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
    // 上一操作卡堆：当前 action 中累积的卡 + 上一次 committed 的卡组（左侧栏显示）
    this._currentAction = [];
    this._lastAction = [];
    this._actionDepth = 0;
    this._actionPendingFlush = false;
    // 缓释胶囊：下 N 次射击的伤害 buff 队列 [{ atk, shots }]
    this._shotBuffs = [];
    // 满级商店后无限购买的 4 项永久升级（应用到每颗友方子弹）
    //   damage: +1 攻击 / pierce: +1 穿透 / bound: +1 弹射 / speed: +50 px/s
    // 价格 = base * e^(已买次数 / 5)，每次买涨 ~22%
    this.permUpgrades = { damage: 0, pierce: 0, bound: 0, speed: 0 };
    // 玩家剔除的卡 family（本局不再出现在商店候选）。阵亡重开时清空。
    this.removedFamilyIds = new Set();
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
    this._lastShopRefreshCount = 0;
    this.removalCount = 0;
    this.shopSlots = null;
    // 清空上一操作卡堆
    this._currentAction = [];
    this._lastAction = [];
    this._actionDepth = 0;
    this._actionPendingFlush = false;
    Events.emit('lastActionChanged', []);
    this.deck?.clearStageSnapshot();   // 关卡 snapshot 清空（炉石模式）
    this._startupQueue = _makeStartupQueue();
    this._startupCurrent = null;
    this.permUpgrades = { damage: 0, pierce: 0, bound: 0, speed: 0 };
    this.removedFamilyIds = new Set();
    this._shotBuffs = [];
    this._discardCounters = {};     // 勇闯龙巢等"本关共享弃置计数"清空
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
    // 商店升级后重置刷新成本计数（视为新一轮）— 同时清掉跨店折扣记忆
    this.refreshCount = 0;
    this._lastShopRefreshCount = 0;
    toast(t('shop_upgrade_toast', { lv: this.shopLevel, cost: cost }), 1.4);
    return true;
  }

  // 当前刷新成本：指数曲线，base × 1.5^refreshCount。
  // base = 当前关卡数（stageNumber），随关卡推进通胀。
  //   stage 1 → 1, 2, 2, 3, 5, 8, 11, 17, 26, 38, ...
  //   stage 10 → 10, 15, 23, 34, 51, 76, 114, ...
  // stageNumber 取 BattleManager；尚未开战 → 1。
  get refreshCost() {
    const base = this._refreshBasePrice() * Math.pow(1.5, this.refreshCount);
    return Math.max(0, Math.round(base));
  }
  _refreshBasePrice() {
    // 调用方是 World 实例 → battle 直接挂在 this.battle 上（不是 this.world.battle）
    return Math.max(1, this.battle?.stageNumber || 1);
  }

  // 跨店折扣：基于上一店打烊时的 refreshCount，决定本店开门时的初始 refreshCount。
  //   prev = 0          → 重置到 0（初始 base 金）
  //   prev ∈ [1, 9]     → 折扣 (1 - 0.1*prev) → 反推等效 refreshCount（log_1.5）
  //   prev ≥ 10         → 完全保留 prev（无折扣，本店初始价 = 上店最后价）
  _applyCrossShopRefreshCarry() {
    const prev = this._lastShopRefreshCount || 0;
    if (prev <= 0) {
      this.refreshCount = 0;
      return;
    }
    if (prev >= 10) {
      this.refreshCount = prev;
      return;
    }
    // 1..9：反推折扣后等效 refreshCount（指数曲线）
    // prevFinalCost = base × 1.5^prev
    // discounted    = prevFinalCost × (1 - 0.1*prev)
    // discounted    = base × 1.5^newRefreshCount → newRefreshCount = log_1.5(discounted / base)
    const base = this._refreshBasePrice();
    const prevFinalCost = base * Math.pow(1.5, prev);
    const discounted = prevFinalCost * (1 - 0.1 * prev);
    if (discounted <= base) {
      this.refreshCount = 0;
      return;
    }
    const back = Math.max(0, Math.floor(Math.log(discounted / base) / Math.log(1.5)));
    this.refreshCount = back;
  }

  // 删除卡牌：本局第 N 次删除花费 10 × 2^N
  removalCost() {
    return 10 * Math.pow(2, this.removalCount || 0);
  }
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

// 弃置计数就绪 → 翻正面时迸射橙色粒子（提示玩家：下次弃置触发召唤）
function spawnDiscardReadyFlipFX(slot) {
  if (!slot) return;
  const r = slot.getBoundingClientRect();
  if (r.width === 0) return;
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const layer = ensureFxLayer();
  const palette = ['#ff9028', '#ffd84a', '#ff6b1f'];
  const count = 20;
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'fx-card-particle';
    const c = palette[i % palette.length];
    el.style.background = c;
    el.style.boxShadow = `0 0 8px ${c}`;
    const a = Math.PI * 2 * (i / count) + Math.random() * 0.35;
    const dist = 46 + Math.random() * 28;
    el.style.left = cx + 'px';
    el.style.top = cy + 'px';
    el.style.setProperty('--tx', Math.cos(a) * dist + 'px');
    el.style.setProperty('--ty', Math.sin(a) * dist - 10 + 'px');
    layer.appendChild(el);
    setTimeout(() => el.remove(), 720);
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

// 剑光斩击（"两头尖、中间稍宽"的透镜状）：用于剑圣单体攻击的命中视觉
// 用对称的两条二次贝塞尔构造梭形：两端在 (cx ± cos*half, cy ± sin*half)，
// 中点向两侧鼓起 width（控制点偏移 = width × 1.6 让顶点更尖、中间更饱满）。
class SwordSlashLens {
  constructor(cx, cy, angle, length, width, color) {
    this.cx = cx; this.cy = cy;
    this.angle = angle;
    this.length = length;
    this.width = width;
    this.color = color || '#dde3ec';
    this.maxLife = 0.36;
    this.life = this.maxLife;
    this.alive = true;
    this.type = 'slashlens';
  }
  update(dt) {
    this.life -= dt;
    if (this.life <= 0) this.alive = false;
  }
  draw(ctx) {
    const t = this.life / this.maxLife;       // 1 → 0
    // 出场快闪：前 30% 拉满，后 70% 慢淡出
    const alpha = t > 0.7 ? 1 : Math.min(1, t / 0.7);
    const cosA = Math.cos(this.angle), sinA = Math.sin(this.angle);
    const half = this.length / 2;
    const x1 = this.cx - cosA * half, y1 = this.cy - sinA * half;
    const x2 = this.cx + cosA * half, y2 = this.cy + sinA * half;
    // 垂直方向（用于鼓胀控制点）
    const px = -sinA, py = cosA;
    // 控制点偏移 = width × 1.6 让透镜顶端更尖锐（贝塞尔顶点 = 控制点偏移的 1/2）
    const ctrlW = this.width * 1.6;
    ctx.save();
    ctx.globalAlpha = alpha;
    // 外层银色发光
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 18;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(this.cx + px * ctrlW, this.cy + py * ctrlW, x2, y2);
    ctx.quadraticCurveTo(this.cx - px * ctrlW, this.cy - py * ctrlW, x1, y1);
    ctx.closePath();
    ctx.fill();
    // 内层白色高光（更细的同形）
    ctx.globalAlpha = alpha * 0.95;
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    const ctrlWInner = ctrlW * 0.45;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(this.cx + px * ctrlWInner, this.cy + py * ctrlWInner, x2, y2);
    ctx.quadraticCurveTo(this.cx - px * ctrlWInner, this.cy - py * ctrlWInner, x1, y1);
    ctx.closePath();
    ctx.fill();
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

  // 上一操作记录：左 / 右 / 主卡都标记为 'use'
  for (const c of useList) _recordAction(world, c, 'use');

  // 单卡有效消耗：用 effectiveCardCost 统一读取（含 _battleCostOverride / _costMod / 主卡 mainCostMod）。
  const effectiveCost = (c) => effectiveCardCost(c, world, c === main);
  // 计算总法力：连携时「完美协调」cost 视为 0（_comboCostFree 标记）
  const totalCost = useList.reduce((s, c) => {
    if (isCombo && c._comboCostFree) return s;
    return s + effectiveCost(c);
  }, 0);
  if (player.mana < totalCost) { playSfx('noMana', 200); toast(t('no_mana'), 0.7); return false; }

  // 模板子弹（基础攻击 = 2，所有 PreActive 加成在此基础上累计）
  const tpl = new Bullet({
    x: player.x, y: player.y, angle: player.angle,
    speed: 480, lifetime: 3.0, bulletCount: 1, waveCount: 1, attack: 2, bound: 0, penetrate: 0,
  });
  // 标记连携，让 fireOneWave 内播放音效时区分开炮 vs 连携开炮
  tpl._fireIsCombo = !!isCombo;

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
      if (!player.spend(cost)) { playSfx('noMana', 200); toast(t('no_mana'), 0.7); return false; }
      for (const h of main.initializeEffects()) tpl.addHook(h);
    } else {
      // 连携模式：跳过 c.use 的 spend（已统计好），手动装 hook
      if (isCombo) {
        if (!player.spend(cost)) { playSfx('noMana', 200); toast(t('no_mana'), 0.7); return false; }
        for (const h of c.initializeEffects()) tpl.addHook(h);
      } else {
        // 普通使用：手动扣 effectiveCost，跳过 c.use 内部的 c.cost 扣费
        if (!player.spend(cost)) { playSfx('noMana', 200); toast(t('no_mana'), 0.7); return false; }
        for (const h of c.initializeEffects()) tpl.addHook(h);
      }
    }
    // 消耗一次性 cost 减免
    c._costMod = 0;
  }
  // 记录本回合用过的卡（供奥弹自动发射 / 骷髅召唤继承本回合 buff）。
  // 排除奥弹与奥术进化衍生（避免继承自循环 / 重复加成）；boost1 等普通强化保留。
  // 按引用去重：主卡 / 同一边缘卡若一回合内多次发射，hooks 只算 1 份
  //   （否则 spawn 骷髅 / 自动奥弹时会按使用次数叠 buff，例如剑士主卡每发射一次就 +2 实体化）。
  world._turnHookCards = world._turnHookCards || [];
  for (const c of useList) {
    if (!c) continue;
    if (c.familyId === 'arcane_missile') continue;
    if (c._def?.arcEvoDerived) continue;
    if (world._turnHookCards.includes(c)) continue;
    world._turnHookCards.push(c);
  }
  // 通知"哪一侧使用了什么"——展露类侦听该事件以做"另一侧 / 同一侧"等触发
  Events.emit('cardUsedSide', { side, cards, main });

  // 副作用：onUse 设置全局 buff、洗入卡、召唤、连携 stacks 等
  for (const c of useList) c.onUse?.(world, player);

  // 发现关键词：onUse 中触发 triggerDiscover() 时，发射流程暂停 → 弹窗结算后再继续
  // 把"PreActive → fireOneWave → 卡入弃牌堆 → 替换 → 连击 → 冷却"打包成一个延续函数
  const continueFire = () => {
    // 按"每张卡分别贡献"算 buff items（主卡 +1 + 副卡 +3 → 两条 ⚔ 浮字，分开显示）
    // 必须在真实 PreActive 之前算 — 此时 tpl 是基线状态，dry 跑出来的 delta 才是单卡贡献
    const buffItems = _computePerCardBuffItems(world, tpl, useList);
    // PreActive 一次（带 world，让连击 / 共鸣弹等可读 world.combo）
    tpl.triggerHooks(Phase.PreActive, { world });
    // 在炮台两侧 / 后方分散飘出每个 buff item（已按单卡拆分）
    _emitCannonBuffFX(world, buffItems);

    // 一波几颗、几波
    const waves = Math.max(1, tpl.waveCount);
    for (let w = 0; w < waves; w++) {
      setTimeout(() => fireOneWave(tpl, world), w * 120);
    }

    // 用过的卡入弃牌堆（主卡留在原位）
    // 标记 _lastAction → renderHand 用以播 use / buff 离场特效
    // _def.destroyOnUse 的卡（奥术进化衍生）使用后破碎 + 永久移除，不入弃牌堆
    // card._destroyAfterUse（挖掘洗入的卡）：使用 / 弃置后破碎 + 永久移除
    for (const c of cards) {
      const effects = c.initializeEffects?.() || [];
      if (c._def?.destroyOnUse || c._destroyAfterUse) {
        c._lastAction = 'shatter';
        world.deck.destroyCard(c);
      } else {
        // 无 bullet hook 的卡视为 "纯效果" / buff（加倍奥弹 / 召唤 / 战吼 / 洗入 等）
        c._lastAction = effects.length === 0 ? 'buff' : 'use';
        world.deck.toDiscard(c);
      }
    }
    // 奥术进化 / 持续施法：先使用（onUse 已洗入衍生 / 标记），再替换 — 把 bag 主卡槽 / discard 中
    // 标记 _becomeArcaneFirework 的卡就地替换成同 tier 的奥术礼花（v9 改）。
    _resolveArcaneEvoReplacements(world);

    // 连击
    world.combo.onUse(side);

    // 共享冷却
    player.notifyAction(performance.now() / 1000);
  };

  if (world._discoverPending && !world._discoverPending.resolved) {
    // 发现挂起 → 把"继续发射"挂在挂起对象上，玩家选择后由 resolveDiscover 触发
    world._discoverPending._continuation = continueFire;
  } else {
    continueFire();
  }
  return true;
}

function fireOneWave(tpl, world) {
  // 每波开火音（cardUsedSide 不再播开火音 → 这里按 wave 数等距响）
  Events.emit('fireWave', { combo: !!tpl._fireIsCombo });
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
    // 热气球金/钻：_noEntityDecay 在 PreActive 写到 tpl，需手动复制；否则 _tickEntityBullets 仍按默认衰减
    if (tpl._noEntityDecay) clone._noEntityDecay = true;
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
  // 发现弹窗的候选卡 / 标题 / sub 都是 pointer-events: auto，覆盖在 canvas 之上 →
  // 鼠标移到弹窗内时 canvas 收不到 mousemove → 炮台 targetAngle 不更新。
  // document 级兜底：始终把全局鼠标坐标换算到 canvas 坐标，更新炮台瞄准。
  document.addEventListener('mousemove', e => {
    const r = rect();
    const x = (e.clientX - r.left) * (canvas.width / r.width);
    const y = (e.clientY - r.top) * (canvas.height / r.height);
    world.player.setTarget(x, y);
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
      // 主菜单显示时：忽略任意键启动，避免按一下就弹炮台选择
      if (document.body.classList.contains('start-screen-active')) return;
      // 阵亡后任意键 → 返回主菜单（重置进度，让玩家从主界面重新选择）
      if (world.battle.state === State.PostBattle) {
        world.resetForNewGame();
        world.battle.setState(State.Idle);
        Events.emit('showStartScreen');
      } else {
        world.battle.startBattle();
      }
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
  // 用 effectiveCardCost：会读取 _battleCostOverride（如挖掘洗入卡的 cost = 0 覆盖）
  const lc = left?._comboCostFree ? 0 : effectiveCardCost(left, world, false);
  const rc = right?._comboCostFree ? 0 : effectiveCardCost(right, world, false);
  const mc = main?._comboCostFree ? 0 : effectiveCardCost(main, world, true);
  return lc + rc + mc;
}

// 连携是否会触发：有层数 + 左右都有牌 + 法力足够付三卡
function _comboWillFire(world) {
  return world.comboStacks > 0
      && world.deck.hand.length >= 2
      && world.player.mana >= _comboTotalCost(world);
}

function doFire(world, side) {
  if (world._discoverPending) return;  // 发现挂起 → 必须先选择
  _beginAction(world);
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
    _endAction(world);
    return;
  }
  // 单卡发射（含主卡 cost）
  const c = world.deck.takeSide(side);
  if (!c) { _endAction(world); return; }     // 手牌空 → 静默忽略（无 toast 提示）
  const ok = fireFromCards(world, [c], side);
  if (!ok) {
    // 还回去
    if (side === 'left') world.deck.hand.unshift(c);
    else world.deck.hand.push(c);
    world.deck._updateFaceUp();
    Events.emit('deckChanged');
  }
  _endAction(world);
}

function doFireAll(world) {
  if (world._discoverPending) return;
  if (world.deck.hand.length < 2) { toast(t('need_two'), 0.7); return; }
  _beginAction(world);
  const left = world.deck.takeSide('left');
  const right = world.deck.takeSide('right');
  const ok = fireFromCards(world, [left, right], 'any');
  if (!ok) {
    world.deck.hand.unshift(left);
    world.deck.hand.push(right);
    world.deck._updateFaceUp();
    Events.emit('deckChanged');
  }
  _endAction(world);
}

function doDiscard(world, side) {
  if (world._discoverPending) return;
  _beginAction(world);
  const c = world.deck.takeSide(side);
  if (!c) { _endAction(world); return; }
  if (!c.discard(world.player)) {
    if (side === 'left') world.deck.hand.unshift(c);
    else world.deck.hand.push(c);
    world.deck._updateFaceUp();
    Events.emit('deckChanged');
    playSfx('noMana', 200); toast(t('no_mana'), 0.7);
    _endAction(world);
    return;
  }
  _recordAction(world, c, 'discard');
  playSfx('discard', 60);
  // 弃置时副作用：双面间谍 / 战术撤退 / 弃牌号令 等
  c.onDiscard?.(world, world.player);
  // 亡灵法师：场上有活的 _isNecromancer 实体子弹 → 每次弃牌召唤 1 骷髅
  handleDiscardForNecromancer(world);
  // _destroyAfterUse（挖掘洗入的卡）：弃置时同样破碎 + 永久移除，不入弃牌堆
  if (c._destroyAfterUse) {
    c._lastAction = 'shatter';
    world.deck.destroyCard(c);
  } else {
    c._lastAction = 'discard';
    world.deck.toDiscard(c);
  }
  world.combo.reset();
  // 教程检测：玩家弃牌后教程可以前进到下一步
  Events.emit('cardDiscarded', { side, card: c });
  _endAction(world);
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
      // 边缘卡（最左 / 最右）始终在最上层，避免被中间卡叠盖；
      // 中间卡按"离中线越近越低"分配，保持自然层叠（z-index 必须是整数）
      el.style.zIndex = isEdge
        ? '20'
        : String(Math.max(1, 10 - Math.round(Math.abs(i - (n - 1) / 2))));
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
    // 弃置计数就绪（如勇闯龙巢弃置3次满）→ 橙色呼吸边框
    cardEl.classList.toggle('discard-ready', !!card._discardCounterReady);
    // 临时卡：蓝色边框 + 半透明（与发现/挖掘洗入的 _destroyAfterUse 牌一致的视觉提示）
    cardEl.classList.toggle('temporary', !!card._destroyAfterUse);
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
    const mainCost = mainCard ? effectiveCardCost(mainCard, world, true) : 0;
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
      // 单卡发射所需法力（用 effectiveCardCost 读取 _battleCostOverride）
      const singleCost = effectiveCardCost(card, world, false) + mainCost;
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
  // 卡牌翻正面 → 若标记了 _discardCounterReady（如勇闯龙巢即将触发召唤）→ 迸射橙色粒子提示
  Events.on('cardFlipped', ({ card, faceUp }) => {
    if (!faceUp || !card || !card._discardCounterReady) return;
    setTimeout(() => {
      // 在手牌中查
      const slots = Array.from($handRow.children);
      let slot = slots.find(s => s.__cardRef === card);
      // 主卡也支持
      if (!slot && $main && $main.firstChild && $main.firstChild.__cardRef === card) {
        slot = $main.firstChild;
      }
      if (slot) spawnDiscardReadyFlipFX(slot);
    }, 80);
  });
  // 卡牌描述字体自适应：所有改卡场景统一在下一帧扫描所有 .card-desc，溢出则缩字号
  Events.on('deckChanged', scheduleFitCardDescs);
  Events.on('bagChanged', scheduleFitCardDescs);
  Events.on('cannonChanged', scheduleFitCardDescs);
  Events.on('stateChanged', scheduleFitCardDescs);
  scheduleFitCardDescs();
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

  // 设置：法力用尽自动结束回合
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
      playSfx('uiClick', 0);
      setLang(LANG.current === 'zh' ? 'en' : 'zh');
    });
    Events.on('langChanged', refreshLangBtn);
  }

  // 设置面板：右上角齿轮按钮打开 / 关闭；面板内含语言 / 音量 / 静音 / 两个自动结束回合开关
  const $settingsBtn = document.getElementById('settings-btn');
  const $settingsPanel = document.getElementById('settings-panel');
  const $settingsClose = document.getElementById('settings-close-btn');
  const $sfxVol = document.getElementById('sfx-volume');
  const $sfxVolVal = document.getElementById('sfx-volume-val');
  const $sfxMute = document.getElementById('sfx-mute');
  if ($settingsBtn && $settingsPanel) {
    const refreshSettingsTip = () => { $settingsBtn.title = t('settings_btn_tip'); };
    refreshSettingsTip();
    Events.on('langChanged', refreshSettingsTip);

    const openPanel = () => {
      $settingsPanel.classList.remove('hidden');
      $settingsBtn.classList.add('active');
      playSfx('uiOpen', 0);
    };
    const closePanel = () => {
      if ($settingsPanel.classList.contains('hidden')) return;
      $settingsPanel.classList.add('hidden');
      $settingsBtn.classList.remove('active');
      playSfx('uiClose', 0);
    };
    $settingsBtn.addEventListener('click', e => {
      e.stopPropagation();
      if ($settingsPanel.classList.contains('hidden')) openPanel();
      else closePanel();
    });
    if ($settingsClose) {
      $settingsClose.addEventListener('click', e => { e.stopPropagation(); closePanel(); });
    }
    // 点击面板外关闭
    document.addEventListener('click', e => {
      if ($settingsPanel.classList.contains('hidden')) return;
      if ($settingsPanel.contains(e.target) || $settingsBtn.contains(e.target)) return;
      closePanel();
    });
    // ESC 关闭
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !$settingsPanel.classList.contains('hidden')) closePanel();
    });
  }
  // 音量滑块：0-100 映射到 0-1
  if ($sfxVol && $sfxVolVal) {
    const refreshVol = () => {
      const v = Math.round(SFX.master * 100);
      $sfxVol.value = String(v);
      $sfxVolVal.textContent = String(v);
    };
    refreshVol();
    $sfxVol.addEventListener('input', () => {
      const v = clamp(parseInt($sfxVol.value, 10) || 0, 0, 100) / 100;
      setSfxMaster(v);
      $sfxVolVal.textContent = String(Math.round(v * 100));
    });
    // 拖完之后播一下试听
    $sfxVol.addEventListener('change', () => { if (!SFX.muted) playSfx('uiClick', 0); });
    Events.on('sfxChanged', refreshVol);
  }
  if ($sfxMute) {
    $sfxMute.checked = SFX.muted;
    $sfxMute.addEventListener('change', () => {
      setSfxMuted($sfxMute.checked);
      if (!SFX.muted) playSfx('uiClick', 0);
    });
  }
  // BGM 音量 / 开关
  const $bgmVol = document.getElementById('bgm-volume');
  const $bgmVolVal = document.getElementById('bgm-volume-val');
  const $bgmEnabled = document.getElementById('bgm-enabled');
  if ($bgmVol && $bgmVolVal) {
    const refreshBgmVol = () => {
      const v = Math.round(BGM.master * 100);
      $bgmVol.value = String(v);
      $bgmVolVal.textContent = String(v);
    };
    refreshBgmVol();
    $bgmVol.addEventListener('input', () => {
      const v = clamp(parseInt($bgmVol.value, 10) || 0, 0, 100) / 100;
      setBgmMaster(v);
      $bgmVolVal.textContent = String(Math.round(v * 100));
    });
    Events.on('bgmChanged', refreshBgmVol);
  }
  if ($bgmEnabled) {
    $bgmEnabled.checked = BGM.enabled;
    $bgmEnabled.addEventListener('change', () => {
      setBgmEnabled($bgmEnabled.checked);
      if (!SFX.muted) playSfx('uiClick', 0);
    });
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
  setupActionPile(world);
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

  // ─── 发现弹窗：监听 show/hide 事件 + 点击候选卡 → resolveDiscover ───
  const $discover = document.getElementById('modal-discover');
  const $discoverTitle = document.getElementById('discover-title');
  const $discoverSub = document.getElementById('discover-sub');
  const $discoverCards = document.getElementById('discover-cards');
  const $handArea = document.getElementById('hand-area');
  // hand-area 在 DOM 中是布局尾巴 → 测出实际高度写入 CSS 变量，让弹窗精准避开
  const _updateHandAreaH = () => {
    const h = $handArea ? Math.round($handArea.getBoundingClientRect().height) : 320;
    if (h > 0) document.documentElement.style.setProperty('--hand-area-h', `${h}px`);
  };
  _updateHandAreaH();
  window.addEventListener('resize', _updateHandAreaH);
  // 手牌变化也可能改高度（虽然 hand-row min-height 是固定的，但保险起见）
  Events.on('deckChanged', _updateHandAreaH);

  const $discoverQueue = document.getElementById('discover-queue');
  // 渲染队列提示：[当前发现] 之后还有 N 个发现，分别由 [源卡名] 触发
  const _renderDiscoverQueue = (summary) => {
    if (!$discoverQueue) return;
    if (!summary || summary.length === 0) {
      $discoverQueue.classList.add('hidden');
      $discoverQueue.innerHTML = '';
      return;
    }
    const isZh = LANG.current === 'zh';
    const head = isZh
      ? `还有 ${summary.length} 个发现待选择：`
      : `${summary.length} more discover${summary.length > 1 ? 's' : ''} queued:`;
    const items = summary.map(it => {
      const label = it.sourceName || it.title;
      return `<span class="queue-item">${label}</span>`;
    }).join('');
    $discoverQueue.innerHTML = `<span class="queue-head">${head}</span>${items}`;
    $discoverQueue.classList.remove('hidden');
  };

  if ($discover && $discoverCards) {
    Events.on('discoverShow', (data) => {
      if (!data) return;
      $discoverTitle.textContent = data.title || (LANG.current === 'zh' ? '发现' : 'Discover');
      $discoverSub.textContent = data.sub || (LANG.current === 'zh' ? '选择一张卡' : 'Pick a card');
      $discoverCards.innerHTML = '';
      data.candidates.forEach((card, i) => {
        const el = modalCardEl(card);
        el.addEventListener('click', () => resolveDiscover(world, i));
        $discoverCards.appendChild(el);
      });
      _renderDiscoverQueue(data.queueSummary);
      _updateHandAreaH();          // 弹窗显示前再测一次（确保最新布局）
      $discover.classList.remove('hidden');
      // 弹窗内的候选卡描述也走字体自适应，长描述（如展露卡）能正确缩放
      scheduleFitCardDescs();
    });
    Events.on('discoverQueueChanged', (summary) => { _renderDiscoverQueue(summary); });
    Events.on('discoverHide', () => {
      $discover.classList.add('hidden');
      $discoverCards.innerHTML = '';
      _renderDiscoverQueue(null);
    });
  }

  return { update, renderHand };
}

// 上一操作 · 左侧卡牌堆：战斗中显示玩家"上一动作"触发的全部卡牌（含发射 / 弃置 / 发现 / 洗入）。
// 点击 → 弹出 #modal-action-history 详情。仅战斗中可见；进入商店 / 背包 / 阵亡画面自动隐藏。
function setupActionPile(world) {
  const $pile = document.getElementById('action-pile');
  const $cardsBox = $pile?.querySelector('.action-pile-cards');
  const $count = $pile?.querySelector('.action-pile-count');
  const $modal = document.getElementById('modal-action-history');
  const $grid = document.getElementById('action-history-grid');
  const $close = document.getElementById('action-history-close-btn');
  if (!$pile || !$cardsBox || !$modal || !$grid) return;

  // 卡可能在 action 结束后被销毁（_destroyAfterUse / merge）；展示时若引用失效则用 familyId+tier 重建副本
  function _resolveCard(record) {
    if (record.cardRef && record.cardRef.familyId === record.familyId) return record.cardRef;
    try { return mkCard(record.familyId, record.tier); } catch (e) { return null; }
  }

  // 用 record 的稳定哈希算出旋转 / 偏移角度，让同一张卡每次渲染位置一致（不抖）
  function _stableJitter(rec, idx) {
    const seed = ((rec.familyId.charCodeAt(0) || 0) * 31
                + (rec.familyId.charCodeAt(1) || 0) * 17
                + idx * 7
                + (rec.ts & 0xff)) & 0xffff;
    const rot = ((seed % 17) - 8);                  // -8 ~ +8 度
    const dx  = (((seed >> 5) % 13) - 6);           // -6 ~ +6 px
    const dy  = (((seed >> 9) % 9) - 4);            // -4 ~ +4 px
    return { rot, dx, dy };
  }

  function renderPile() {
    const inBattle = world.battle.state === State.Battle;
    const records = world._lastAction || [];
    const visible = inBattle && records.length > 0;
    $pile.classList.toggle('hidden', !visible);
    if (!visible) return;
    $cardsBox.innerHTML = '';
    // 用 modalCardEl 创建静态卡（含 emoji / 名称 / desc / 关键词高亮），无手牌区交互动画
    records.forEach((rec, i) => {
      const c = _resolveCard(rec);
      if (!c) return;
      const el = modalCardEl(c);
      el.classList.add('pile-card');
      const j = _stableJitter(rec, i);
      el.style.transform =
        `translate(calc(-50% + ${j.dx}px), calc(-50% + ${j.dy}px)) rotate(${j.rot}deg)`;
      el.style.zIndex = String(i + 1);
      $cardsBox.appendChild(el);
    });
    // 角标：>= 2 张才显示，N = 总数 - 1
    if (records.length >= 2) {
      $count.textContent = '+' + (records.length - 1);
      $count.classList.remove('hidden');
    } else {
      $count.classList.add('hidden');
    }
    scheduleFitCardDescs();
  }

  function renderHistoryModal() {
    $grid.innerHTML = '';
    const records = world._lastAction || [];
    for (const rec of records) {
      const c = _resolveCard(rec);
      if (!c) continue;
      const cell = document.createElement('div');
      cell.className = 'action-card-cell';
      cell.appendChild(modalCardEl(c));
      const label = document.createElement('div');
      label.className = 'action-card-label kind-' + rec.kind;
      label.textContent = t('action_kind_' + rec.kind);
      cell.appendChild(label);
      $grid.appendChild(cell);
    }
    scheduleFitCardDescs();
  }

  function openModal() {
    if (!world._lastAction || world._lastAction.length === 0) return;
    renderHistoryModal();
    $modal.classList.remove('hidden');
  }
  function closeModal() { $modal.classList.add('hidden'); }

  $pile.addEventListener('click', openModal);
  $close?.addEventListener('click', closeModal);
  // 点击模态空白处（modal 自身，不在内层 grid / 按钮）关闭
  $modal.addEventListener('click', e => { if (e.target === $modal) closeModal(); });
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$modal.classList.contains('hidden')) closeModal();
  });

  Events.on('lastActionChanged', () => renderPile());
  Events.on('stateChanged', (s) => {
    // 进入商店 / 背包 / 阵亡 / Idle → 隐藏 pile + 关闭模态
    if (s !== State.Battle) {
      $pile.classList.add('hidden');
      closeModal();
    } else {
      renderPile();
    }
  });
  Events.on('langChanged', () => {
    // i18n：模态标题 / 关闭按钮的 data-i18n 由 applyI18nDom 处理
    // 这里仅在模态打开时刷新 label 文案
    if (!$modal.classList.contains('hidden')) renderHistoryModal();
  });

  // 初次同步
  renderPile();
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
    if (world._discoverPending) return;   // 发现挂起 → 阻塞背包
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
    Events.emit('inventoryOpened');
  }

  function close() {
    $modal.classList.add('hidden');
    Events.emit('inventoryClosed');
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
    scheduleFitCardDescs();
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
      // 切换主卡音：和"购买点击背包牌"同款的 ka-ching 确认音
      playSfx('purchase', 0);
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

  // popover 尺寸常量（与 style.css .kw-pop 同步）
  const POP_W = 280;
  const POP_GAP = 36;        // 与（hover 放大后的）卡边缘的距离，避免贴脸

  function show(slot, keywords) {
    clear();
    // getBoundingClientRect 已包含 CSS transform → hover 放大后会反映到 rect
    // 等待一帧让 _setHoverOrigin 设的 transform 应用？— mouseover 是同步触发，但 transform 是 transition 渐进。
    // 关键词 popover 用 rect 算位置 → 在 transition 中间可能偏，但 0.2s 内会回到 hover 终态位置。
    const rect = slot.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const onRight = rect.left + rect.width / 2 < viewportW / 2;
    let leftX = onRight ? (rect.right + POP_GAP) : (rect.left - POP_W - POP_GAP);
    // viewport 钳位：靠右翻到左侧 / 反之；都不行就盖在卡上方
    leftX = clamp(leftX, 8, viewportW - POP_W - 8);

    // 反面卡：显示统一提示而非关键词解释
    const cardE = slot.querySelector('.card');
    if (cardE && cardE.classList.contains('face-down')) {
      const el = document.createElement('div');
      el.className = 'kw-pop kw-other';
      el.innerHTML = `<div class="kw-title">${t('facedown_title')}</div><div class="kw-body">${t('facedown_body')}</div>`;
      el.style.left = leftX + 'px';
      el.style.top = clamp(rect.top, 8, viewportH - 120) + 'px';
      $container.appendChild(el);
      activePops.push(el);
      return;
    }

    if (!keywords || keywords.length === 0) return;
    // Pass 1：先把所有 pop 临时放到 leftX/0 让浏览器计算高度 → 拿到每个 h
    const heights = [];
    for (const kw of keywords) {
      const el = document.createElement('div');
      el.className = 'kw-pop kw-' + kw.cls;
      el.innerHTML = `<div class="kw-title">${kw.title}</div><div class="kw-body">${kw.desc}</div>`;
      el.style.left = leftX + 'px';
      el.style.top = '0px';
      $container.appendChild(el);
      activePops.push(el);
      heights.push(el.offsetHeight);
    }
    // Pass 2：算总高 → 决定起始 y（优先紧邻卡顶，超出视口则整体上移）
    const gap = 8;
    const totalH = heights.reduce((s, h) => s + h, 0) + (heights.length - 1) * gap;
    let startY = rect.top;
    const maxStartY = viewportH - totalH - 12;
    if (startY > maxStartY) startY = Math.max(8, maxStartY);
    let y = startY;
    for (let i = 0; i < activePops.length; i++) {
      activePops[i].style.top = y + 'px';
      y += heights[i] + gap;
    }
  }

  // 事件委托：监听 document mouseover。让 show 内部决定显示关键词解释 / 反面提示 / 不显示
  // 跟踪上次悬浮的 slot：避免 mouseover 在子元素间跳动时重复播音
  let _lastHoverSlot = null;

  // 动态计算 transform-origin：避免悬浮放大时卡片溢出窗口边缘。
  //   读取卡的当前 rect（未放大态）+ scale 倍数 → 算出"放大后还能 fit 的 origin"。
  function _setHoverOrigin(slot) {
    // 找出当前 hover 的实际放大 scale（modal-card 2.05 / cannon-card 1.6 / 战斗手牌待加）
    let scale = 2.05;
    if (slot.classList.contains('cannon-card')) scale = 1.6;
    else if (slot.classList.contains('card-slot')) scale = 1.9;     // 战斗手牌 hover scale
    else if (slot.classList.contains('bag-slot')) scale = 1.6;
    const rect = slot.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    // 放大后宽 / 高
    const scaledW = rect.width * scale, scaledH = rect.height * scale;
    // origin 用百分比表示：0% = left/top, 100% = right/bottom
    // 想让放大后的卡的 left ≥ 8 且 right ≤ vw - 8：算 origin_x
    // 公式：scaledLeft = rect.left + (rect.width * (1 - scale) * (originX/100))
    //   即 origin 离 left 越远（origin 越往右），left 越向右移动 (因为放大时左侧"被推开")
    // 实际更直接：让"放大后的中心点" = clamp(rect 中心, scaledW/2 + 8, vw - scaledW/2 - 8)
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const minCx = scaledW / 2 + 8, maxCx = vw - scaledW / 2 - 8;
    const minCy = scaledH / 2 + 8, maxCy = vh - scaledH / 2 - 8;
    const targetCx = clamp(cx, minCx, maxCx);
    const targetCy = clamp(cy, minCy, maxCy);
    // 反推 origin（CSS transform-origin 百分比相对于 element 自身尺寸）
    // 放大后的中心 = origin_world + (cx - origin_world) * scale
    //              = origin_world * (1 - scale) + cx * scale
    // 解出 origin_world = (targetCx - cx * scale) / (1 - scale)，注意 scale > 1 时 (1-scale) < 0
    const originX_world = (targetCx - cx * scale) / (1 - scale);
    const originY_world = (targetCy - cy * scale) / (1 - scale);
    // 转成相对 element 的百分比
    const ox = ((originX_world - rect.left) / rect.width) * 100;
    const oy = ((originY_world - rect.top) / rect.height) * 100;
    slot.style.transformOrigin = `${clamp(ox, 0, 100)}% ${clamp(oy, 0, 100)}%`;
  }

  document.addEventListener('mouseover', e => {
    const slot = e.target.closest('.card-slot, .modal-card, .bag-slot');
    if (!slot) return;
    if (slot !== _lastHoverSlot) {
      _lastHoverSlot = slot;
      playSfx('cardHover', 30);
      _setHoverOrigin(slot);
    }
    const kws = slot.__keywords || [];
    show(slot, kws);
  });
  document.addEventListener('mouseout', e => {
    const slot = e.target.closest('.card-slot, .modal-card, .bag-slot');
    if (slot) {
      clear();
      // 离开 slot（去到非 slot 元素或别的 slot）→ 清空跟踪，让下次 mouseover 重新触发
      // 注意：不能赋成 "to"（新 slot），否则下次 mouseover 检测 slot === lastHover → 静默
      const to = e.relatedTarget && e.relatedTarget.closest
        ? e.relatedTarget.closest('.card-slot, .modal-card, .bag-slot')
        : null;
      if (to !== slot) _lastHoverSlot = null;
    }
  });
  // 任何卡 / 候选卡被点击 → 选择音
  // 注意：.bag-slot 不在此列 —— 背包槽的"替换"步骤会触发后续 uiClick / 替换音，避免双响
  // 商店候选卡（在 #loot-candidates 内）用金币 chime —— "花钱买卡"的语义
  document.addEventListener('click', e => {
    const slot = e.target.closest('.card-slot, .modal-card');
    if (!slot) return;
    if (slot.closest('#loot-candidates')) playSfx('coinCascade', 100);
    else playSfx('cardSelect', 60);
  }, true); // capture 阶段：在卡自身的 click 处理（如 resolveDiscover）之前响起来

  // 发现弹窗 / 状态切换 时，卡 DOM 会同步消失但 mouseout 不会触发
  //   → 残留 kw-pop 不会被清除。这里监听生命周期事件来主动清场。
  Events.on('discoverHide', () => { clear(); _lastHoverSlot = null; });
  Events.on('stateChanged', () => { clear(); _lastHoverSlot = null; });
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

  // 不在此处自动打开 —— 主界面（modal-start）的"开始游戏"按钮会触发 requestCannonSelect。
  // 阵亡后重开走 world.battle.startBattle() → 内部检测无 cannon → emit requestCannonSelect → open()。
}

// ---- 开始界面（首次启动 / 重开返回主菜单时）-------------------------------
// 三个按钮：开始游戏 / 新手教程 / 设置。开始游戏走 cannon-select；教程进入引导流程。
function setupStartScreen(world, tutorial) {
  const $modal = document.getElementById('modal-start');
  const $play = document.getElementById('start-play-btn');
  const $tut = document.getElementById('start-tutorial-btn');
  const $settings = document.getElementById('start-settings-btn');
  const $lang = document.getElementById('start-lang-toggle-btn');
  if (!$modal || !$play) return { show: () => {}, hide: () => {} };

  // 语言按钮：显示双语标签，点击切换；通过 langChanged 同步标签
  function refreshLang() {
    if ($lang) $lang.textContent = LANG.current === 'zh' ? '🌐 English / 中文' : '🌐 中文 / English';
  }
  Events.on('langChanged', refreshLang);
  if ($lang) {
    $lang.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      playSfx('uiClick', 0);
      setLang(LANG.current === 'zh' ? 'en' : 'zh');
    });
  }
  // 外部触发主菜单（阵亡返回 / 教程结束等）
  Events.on('showStartScreen', () => show());

  function show() {
    refreshLang();
    $modal.classList.remove('hidden');
    // 加 body 类 → CSS 隐藏游戏 HUD（金币 / 齿轮 / 侧栏 / 关卡进度条）；设置面板改为居中
    document.body.classList.add('start-screen-active');
    // 关闭可能残留的设置面板（防止上次没关）
    document.getElementById('settings-panel')?.classList.add('hidden');
    document.getElementById('settings-btn')?.classList.remove('active');
    // 屏蔽其他 modal，确保只看到开始界面
    document.getElementById('modal-cannon')?.classList.add('hidden');
    document.getElementById('modal-loot')?.classList.add('hidden');
    document.getElementById('modal-inventory')?.classList.add('hidden');
    document.getElementById('modal-tutorial-end')?.classList.add('hidden');
    document.getElementById('tutorial-overlay')?.classList.add('hidden');
  }
  function hide() {
    $modal.classList.add('hidden');
    document.body.classList.remove('start-screen-active');
    // 离开开始界面：顺手关闭设置面板，避免它停留在居中位置
    document.getElementById('settings-panel')?.classList.add('hidden');
    document.getElementById('settings-btn')?.classList.remove('active');
  }

  $play.addEventListener('click', () => {
    playSfx('uiClick', 0);
    try { localStorage.setItem('cs_seen_start', '1'); } catch (e) {}
    hide();
    // 进入正常流程：若无炮台 → 弹炮台选择；否则直接开战。
    if (!world.cannon) Events.emit('requestCannonSelect', () => world.battle.startBattle());
    else world.battle.startBattle();
  });
  $tut.addEventListener('click', () => {
    playSfx('uiClick', 0);
    hide();
    tutorial?.start();
  });
  $settings.addEventListener('click', (e) => {
    // stopPropagation：阻止 setupUI 内"点外面关设置面板"的 document handler 立刻关回去
    e.stopPropagation();
    playSfx('uiClick', 0);
    // 直接复用右上角齿轮按钮的开关逻辑，确保 open/close 状态一致
    document.getElementById('settings-btn')?.click();
  });

  return { show, hide };
}

// ---- 新手教程引导流程 -------------------------------------------------
// 全屏 dim 遮罩 + 高亮目标光环 + 提示气泡。每一步要么"点下一步"前进，
// 要么监听某个 Event（如玩家发射 / 弃牌 / 回合结束）自动前进。
// start() 会重置世界为一个干净的小战场（一只哑火哥布林 + 9 张铜级强化）。
function setupTutorial(world) {
  const $overlay = document.getElementById('tutorial-overlay');
  const $dim = document.getElementById('tutorial-dim');
  const $ring = document.getElementById('tutorial-ring');
  const $hintBox = document.getElementById('tutorial-hint-box');
  const $title = document.getElementById('tutorial-hint-title');
  const $text = document.getElementById('tutorial-hint-text');
  const $next = document.getElementById('tutorial-hint-next');
  const $skip = document.getElementById('tutorial-skip');
  const $prog = document.getElementById('tutorial-progress');
  const $endModal = document.getElementById('modal-tutorial-end');
  const $endStart = document.getElementById('tutorial-end-start-btn');
  const $endReplay = document.getElementById('tutorial-end-replay-btn');
  if (!$overlay) return { start: () => {}, finish: () => {} };

  let stepIdx = -1;
  let curCleanup = null;
  let ringRaf = 0;
  let ringResolveFn = null;

  // 步骤定义。target=DOM 选择函数；box=气泡位置（top / bottom）；
  // waitNext=true 用户点"下一步"前进；waitEvent=Events 事件名监听（condition 用于过滤）。
  // 顺序：欢迎 → 左 / 右 / 击杀 → 主卡 → 【回合】(前移：先教按 Space 回满 mana) → 背包 → 弃牌 → 连击 → 商店
  const steps = [
    { key: 's1', target: null,                                                     box: 'bottom', waitNext: true },
    { key: 's2', target: () => document.querySelectorAll('#hand-row .card')[0],     box: 'top',
                 waitEvent: 'cardUsedSide', condition: (d) => d && d.side === 'left',
                 onShow: () => ensureCards() },
    { key: 's3', target: () => {
                   const cards = document.querySelectorAll('#hand-row .card');
                   return cards[cards.length - 1];
                 },                                                                 box: 'top',
                 waitEvent: 'cardUsedSide', condition: (d) => d && d.side === 'right',
                 onShow: () => ensureCards() },
    { key: 's4', target: () => document.getElementById('stage'),                    box: 'top',
                 waitEvent: 'enemyDied',
                 onShow: () => { ensureDummy(true); ensureCards(); } },
    { key: 's5', target: () => document.getElementById('hand-main'),                box: 'top',
                 waitNext: true },
    // 回合（按 Space 结束当前回合，下一回合 mana 回满）— 在背包前先教，避免没法力开不了背包
    { key: 's9', target: () => document.querySelector('.rail-key:nth-child(7)'),    box: 'top',
                 waitEvent: 'turnChanged', condition: (t) => t === 'enemy',
                 onShow: () => { ensureCards(); ensureDummy(); } },
    // 整理背包 = 3 个连续 action：打开 → 右键设主卡 → 关闭。完成全部后才进入弃牌教程
    { key: 's6', target: () => document.getElementById('open-inventory-btn'),       box: 'top',
                 waitEvent: 'inventoryOpened',
                 onShow: () => ensureCards() },
    { key: 's6b', target: () => {
                    // 高亮背包里第二张卡（index=1 = 最左侧非主卡），引导玩家右键它
                    const bag = document.getElementById('inventory-bag');
                    if (!bag) return null;
                    return bag.children[1] || bag.children[0] || bag;
                  },                                                                box: 'top',
                  waitEvent: 'mainCardSet' },
    { key: 's6c', target: () => document.getElementById('close-inventory-btn'),    box: 'top',
                  waitEvent: 'inventoryClosed' },
    { key: 's7', target: () => document.getElementById('hand-row'),                 box: 'top',
                 waitEvent: 'cardDiscarded',
                 onShow: () => { ensureCards(); ensureDummy(); } },
    { key: 's8', target: () => document.getElementById('combo'),                    box: 'top',
                 waitNext: true },
    { key: 's10', target: () => document.getElementById('open-inventory-btn'),      box: 'top',
                  waitNext: true },
  ];

  // 取目标元素的 client 坐标
  function rectOf(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }

  function setRing(rect, pad) {
    if (!rect) { $ring.classList.add('hidden'); return; }
    const p = pad ?? 6;
    $ring.style.left = (rect.x - p) + 'px';
    $ring.style.top = (rect.y - p) + 'px';
    $ring.style.width = (rect.w + p * 2) + 'px';
    $ring.style.height = (rect.h + p * 2) + 'px';
    $ring.classList.remove('hidden');
  }

  function trackRing(resolveFn) {
    clearInterval(ringRaf);
    ringResolveFn = resolveFn;
    const tick = () => {
      if (!ringResolveFn) return;
      const el = ringResolveFn();
      setRing(rectOf(el));
    };
    // 用 setInterval 取代 RAF：tab hidden 时也能继续追踪目标位置（如背包打开后切换光环）。
    ringRaf = setInterval(tick, 60);
    tick();
  }
  function stopRing() {
    clearInterval(ringRaf);
    ringResolveFn = null;
    $ring.classList.add('hidden');
  }

  const $awaitTip = document.getElementById('tutorial-await-tip');

  function applyStepI18n() {
    const step = steps[stepIdx];
    if (!step) return;
    $title.innerHTML = t(`tut_${step.key}_title`);
    $text.innerHTML = t(`tut_${step.key}_text`);
    $prog.textContent = t('tutorial_progress', { cur: stepIdx + 1, max: steps.length });
    _updateAckLabel();
  }
  // 按钮文案：expanded → "知道了"（点击 → 最小化）；
  //          minimized + info-only → "下一步"（点击 → 进入下一步）；
  //          minimized + action → 按钮隐藏（由 CSS .minimized .tutorial-next-btn { display:none }）
  function _updateAckLabel() {
    const step = steps[stepIdx];
    if (!step) return;
    const minimized = $hintBox.classList.contains('minimized');
    if (minimized && step.waitNext) {
      $next.textContent = t('tutorial_next');
    } else {
      $next.textContent = t('tutorial_ack');
    }
  }
  function applyGlobalI18n() {
    $skip.textContent = t('tutorial_skip');
    if ($awaitTip) $awaitTip.textContent = t('tutorial_await');
    if ($endStart) $endStart.textContent = t('tutorial_end_start');
    if ($endReplay) $endReplay.textContent = t('tutorial_end_replay');
    applyStepI18n();   // 这里也会更新 $next 文案
  }
  Events.on('langChanged', applyGlobalI18n);

  // 两态切换：expanded（顶部 + 蒙版 + 知道了 / 下一步可见）
  //         minimized（右侧 + 无蒙版 + 显示"⏳ 完成操作以继续"）
  // 切换实现：先淡出（.swapping + JS 动画蒙版）→ 切类 + updateFn（位置 snap、文案同步）→ 下一帧移除 .swapping 让其淡入。
  // 蒙版透明度直接 JS 动画（CSS opacity transition 在 canvas 重度渲染下不收敛）。
  // 用 setTimeout 而非 RAF 驱动动画 —— 即使标签页 hidden（preview / 切到后台）也能跑完。
  let _dimTimer = 0;
  function _animateDim(target, duration) {
    clearInterval(_dimTimer);
    const start = parseFloat($dim.style.opacity || '1');
    const t0 = performance.now();
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / duration);
      $dim.style.opacity = String(start + (target - start) * k);
      if (k >= 1) clearInterval(_dimTimer);
    };
    _dimTimer = setInterval(tick, 16);
    tick();
  }
  function _swap(toMinimized, updateFn) {
    const wasMinimized = $hintBox.classList.contains('minimized');
    if (wasMinimized === toMinimized) {
      updateFn?.();
      return;
    }
    $hintBox.classList.add('swapping');
    _animateDim(toMinimized ? 0 : 1, 240);
    setTimeout(() => {
      // 先切类（让 updateFn 内能读到新的 .minimized 状态），再跑 updateFn
      if (toMinimized) $hintBox.classList.add('minimized');
      else $hintBox.classList.remove('minimized');
      updateFn?.();
      // 用 setTimeout 替代 RAF，确保 hidden tab 内也能淡入
      setTimeout(() => $hintBox.classList.remove('swapping'), 30);
    }, 200);
  }
  function minimizeHint() {
    _swap(true, () => { _updateAckLabel(); });
  }

  function showStep(i) {
    if (curCleanup) { curCleanup(); curCleanup = null; }
    stepIdx = i;
    const step = steps[i];
    if (!step) { finish(); return; }

    // 内容 / 位置类的更新（_swap 内部在 fade-out 后调用，保证视觉同步）
    const applyContent = () => {
      applyStepI18n();
      $hintBox.classList.toggle('top', step.box === 'top');
      // info-step：minimized 时显示"下一步"按钮；action 步骤无该类（按钮隐藏，显示"⏳ 完成操作以继续"）
      $hintBox.classList.toggle('info-step', !!step.waitNext);
      $next.classList.remove('hidden');
    };

    // 步骤 onShow（spawn dummy / refill mana 等）— 立即执行
    try { step.onShow?.(); } catch (e) { console.error('tutorial onShow', e); }

    // 高亮（指向新目标）
    if (step.target) trackRing(step.target);
    else stopRing();

    // 始终回到展开态。_swap 会在 fade-out 后同步 content + 位置 + 蒙版
    _swap(false, applyContent);

    // 监听前进事件（waitEvent 步骤）；waitNext 步骤等用户点"下一步"
    if (step.waitEvent) {
      const handler = (data) => {
        if (step.condition && !step.condition(data)) return;
        Events.off(step.waitEvent, handler);
        showStep(i + 1);
      };
      Events.on(step.waitEvent, handler);
      curCleanup = () => Events.off(step.waitEvent, handler);
    }
  }

  // 教程开始前确保有炮台
  function ensureCannon() {
    if (!world.cannon) {
      const firstId = Object.keys(CANNON_DEFS)[0];
      world.cannon = new Cannon(firstId);
      Events.emit('cannonChanged', world.cannon);
    }
  }

  // 重建教程牌组（9 张铜级强化 = 干净的 1 费基础攻击牌）
  function buildTutorialDeck() {
    const cards = [];
    for (let i = 0; i < 9; i++) cards.push(mkCard('boost1', 'bronze'));
    world.deck.setBag(cards);
    world.deck.resetForBattle();
  }

  // 中途若手牌空了或法力空了 → 补满，让玩家能继续操作
  function ensureCards() {
    if (world.deck.hand.length < 2) {
      world.deck.resetForBattle();
      Events.emit('deckChanged');
    }
    if ((world.player.mana || 0) < world.player.maxMana) {
      world.player.mana = world.player.maxMana;
      Events.emit('manaChanged', world.player.mana);
    }
  }

  // 没敌人时 spawn 一只哑火哥布林（HP 6，0 攻击，不移动；默认无敌避免太早死掉）
  // killable=true 时取消无敌（让玩家在 "击杀敌人" 步骤打死它）
  function ensureDummy(killable) {
    if (world.enemies.length === 0) {
      const e = new Enemy(world.w / 2, 260, 'goblin', world);
      e.speed = 0;
      e.attack = 0;
      e.intents = [{ kind: 'wait', icon: '⏳', cooldown: 999, desc: 'tutorial dummy' }];
      e.intentCd = 999;
      e.intentIdx = 0;
      e._invincible = !killable;
      world.enemies.push(e);
    } else if (killable) {
      // 已有 dummy → 取消无敌让它能被打死
      for (const e of world.enemies) e._invincible = false;
    }
  }

  function start() {
    world._tutorialMode = true;
    // 隐藏所有其它 modal
    document.getElementById('modal-start')?.classList.add('hidden');
    document.getElementById('modal-cannon')?.classList.add('hidden');
    document.getElementById('modal-loot')?.classList.add('hidden');
    document.getElementById('modal-inventory')?.classList.add('hidden');
    document.getElementById('modal-tutorial-end')?.classList.add('hidden');

    // 跳过 startup picks
    world._startupQueue = [];
    world._startupCurrent = null;

    ensureCannon();
    buildTutorialDeck();

    // 重置玩家状态
    world.player.hp = world.player.maxHp;
    world.player.mana = world.player.maxMana;
    world.player.armor = world.player.armorPerTurn;
    Events.emit('hpChanged', world.player.hp);
    Events.emit('manaChanged', world.player.mana);
    Events.emit('armorChanged', world.player.armor);

    // 清空战场
    world.enemies.length = 0;
    world.bullets.length = 0;
    world.summons.length = 0;
    world.particles.length = 0;
    world.combo.reset();
    world.comboStacks = 0;
    Events.emit('comboStacksChanged', 0);

    // 强制进入战斗状态（不走 startBattle 的 startup picks / 波次 spawn）
    world.battle.setState(State.Battle);
    world.battle.setTurn('player');

    ensureDummy();

    $overlay.classList.remove('hidden');
    // 重置气泡 / 蒙版态：去掉 minimized + 蒙版全显
    $hintBox.classList.remove('minimized', 'swapping');
    $dim.style.opacity = '1';
    applyGlobalI18n();
    showStep(0);
  }

  function finish() {
    if (curCleanup) { curCleanup(); curCleanup = null; }
    stopRing();
    $overlay.classList.add('hidden');
    // 显示结束面板
    if ($endStart) $endStart.textContent = t('tutorial_end_start');
    if ($endReplay) $endReplay.textContent = t('tutorial_end_replay');
    $endModal?.classList.remove('hidden');
  }

  // 教程结束后清场：退出教程模式 + 清空战场（外部决定下一步流程）
  function cleanupBattle() {
    world._tutorialMode = false;
    world.enemies.length = 0;
    world.bullets.length = 0;
    world.summons.length = 0;
    world.particles.length = 0;
    world.combo.reset();
    world.comboStacks = 0;
    Events.emit('comboStacksChanged', 0);
  }

  $next.addEventListener('click', () => {
    // 切换中点击忽略，避免半态被打乱
    if ($hintBox.classList.contains('swapping')) return;
    playSfx('uiClick', 0);
    const step = steps[stepIdx];
    if (!step) return;
    const minimized = $hintBox.classList.contains('minimized');
    if (!minimized) {
      // expanded → 缩到右侧（所有步骤统一）
      minimizeHint();
    } else if (step.waitNext) {
      // minimized + info：点击"下一步"进入下一步
      if (curCleanup) { curCleanup(); curCleanup = null; }
      showStep(stepIdx + 1);
    }
    // minimized + action：按钮被 CSS 隐藏，本不可达
  });
  $skip.addEventListener('click', () => {
    playSfx('uiClick', 0);
    if (curCleanup) { curCleanup(); curCleanup = null; }
    finish();
  });
  $endStart?.addEventListener('click', () => {
    playSfx('uiClick', 0);
    try { localStorage.setItem('cs_seen_start', '1'); } catch (e) {}
    cleanupBattle();
    $endModal.classList.add('hidden');
    // 重置世界为新游戏（卡组 / 金币 / 炮台清空），让玩家走正常流程
    world.resetForNewGame();
    world.battle.setState(State.Idle);
    Events.emit('requestCannonSelect', () => world.battle.startBattle());
  });
  $endReplay?.addEventListener('click', () => {
    playSfx('uiClick', 0);
    $endModal.classList.add('hidden');
    start();
  });

  applyGlobalI18n();

  return { start, finish };
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
    } else if (world.shopSlots && world.shopSlots.some(c => c && c._shopLocked)) {
      // 上一次商店有锁定的卡 → 保留锁定卡的位置，只填补空槽
      // 锁定的 family 先填入 dedup keys，让填补的新卡不会和锁定卡同 family / 不同 tier 重复
      const keys = new Set();
      for (const c of world.shopSlots) {
        if (c && c._shopLocked) keys.add(c.familyId);
      }
      while (world.shopSlots.length < n) world.shopSlots.push(null);
      for (let i = 0; i < world.shopSlots.length; i++) {
        if (world.shopSlots[i] == null) {
          world.shopSlots[i] = _rollShopCard(world, keys);
        }
      }
    } else {
      world.shopSlots = rollShopCandidates(world, n);
    }
    selectedIdx = -1;
    // 应用跨店折扣：根据上店打烊时 refreshCount 反推本店初始 refreshCount
    // 新手 pick 阶段不参与折扣体系（强制 refreshCount = 0）
    if (isStartupPick()) {
      world.refreshCount = 0;
      world._lastShopRefreshCount = 0;
    } else {
      world._applyCrossShopRefreshCarry();
    }
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
  // 价格 = base * e^(已购买次数 / 3.5)；每次买涨 ~33%（v: 比旧公式翻倍 + 涨幅更陡）
  const PERM_BASES = { damage: 600, pierce: 400, bound: 200, speed: 100 };
  // label 走 i18n（perm_damage/perm_pierce/...），运行时取
  const permLabel = (kind) => t('perm_' + kind);
  const PERM_ICONS  = { damage: '⚔', pierce: '🎯', bound: '💫', speed: '⚡' };
  function permUpgradePrice(kind) {
    const owned = world.permUpgrades?.[kind] || 0;
    return Math.ceil(PERM_BASES[kind] * Math.exp(owned / 3.5));
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
        <div class="pu-name">${PERM_ICONS[kind]} ${permLabel(kind)}</div>
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
        toast(t('perm_bought_toast', { label: permLabel(kind), n: world.permUpgrades[kind] }), 1.0);
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
    // 选中候选 + 非合成型 → 进入"交换模式"：文字提示 + 背包卡红虚线
    const selected = selectedCard();
    const isMerge = selected && findMergeTarget(world.deck.bag, selected) >= 0 && nextTier(selected.tier);
    const inSwapMode = selectedIdx >= 0 && !isMerge;
    document.body.classList.toggle('shop-selection-mode', inSwapMode);

    if (inSwapMode) {
      $hint.textContent = t('loot_hint_selected');
      return;
    }
    if (selectedIdx >= 0 && isMerge) {
      // 选中可合成候选：提示点击购买即触发合成
      $hint.textContent = `「${selected.name}」→ 点击购买即合成为「${selected.familyName} · ${tierLabel(nextTier(selected.tier))}」`;
      return;
    }
    if (isStartupPick()) {
      $hint.textContent = t('startup_pick_hint', { tier: tierLabel(world._startupCurrent.tier) });
      return;
    }
    if (candidatesLeft() === 0) {
      $hint.textContent = t('loot_hint_done');
      return;
    }
    $hint.textContent = t('loot_hint_pick');
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

      // 升级预览：购买可合成时，加 .mergeable 类触发脉冲 + 上升箭头 + 火花特效
      //   (旧的"→银 / →金"角标已移除 — 视觉本身已经说明可以合成，标签反而干扰 hover 放大)
      const mergeIdx = findMergeTarget(world.deck.bag, c);
      const upTier = nextTier(c.tier);
      const canMergeThis = mergeIdx >= 0 && upTier && CARD_DATA[c.familyId].tiers[upTier];
      if (canMergeThis) {
        el.classList.add('mergeable');
        const arrow = document.createElement('div');
        arrow.className = 'merge-arrow';
        arrow.textContent = '▲';
        el.appendChild(arrow);
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
        tag.textContent = t('free_label');
        tag.classList.add('free-tag');
      } else {
        tag.textContent = `💰 ${price}`;
        if (world.gold < price) tag.classList.add('cant-afford');
      }
      el.appendChild(tag);

      const idx = i;       // 闭包捕获

      // 商店候选操作按钮：锁定 + 剔除（新手 pick 阶段不显示）
      //   锁定：刷新跳过此槽位，且跨"继续游戏"保留位置
      //   剔除：本局商店池永久去除此 family（写入 world.removedFamilyIds），二次点击确认
      if (!isStartupPick()) {
        if (c._shopLocked) el.classList.add('shop-cand-locked');
        const actions = document.createElement('div');
        actions.className = 'shop-cand-actions';

        const lockBtn = document.createElement('button');
        lockBtn.type = 'button';
        lockBtn.className = 'shop-cand-act shop-cand-lock' + (c._shopLocked ? ' active' : '');
        lockBtn.textContent = c._shopLocked ? '🔒' : '🔓';
        lockBtn.title = t(c._shopLocked ? 'shop_unlock_tip' : 'shop_lock_tip');
        lockBtn.addEventListener('mousedown', e => e.stopPropagation());
        lockBtn.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); });
        lockBtn.addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          c._shopLocked = !c._shopLocked;
          renderCandidates();
          renderRerollBtn();
        });
        actions.appendChild(lockBtn);

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'shop-cand-act shop-cand-remove';
        removeBtn.textContent = '✕';
        removeBtn.title = t('slot_remove_tip');
        removeBtn.addEventListener('mousedown', e => e.stopPropagation());
        removeBtn.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); });
        removeBtn.addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          if (c._shopLocked) { toast(t('slot_locked_remove'), 0.9); return; }
          if (!removeBtn._confirming) {
            removeBtn._confirming = true;
            removeBtn.classList.add('confirm');
            removeBtn._timer = setTimeout(() => {
              removeBtn._confirming = false;
              removeBtn.classList.remove('confirm');
            }, 2000);
            toast(t('slot_remove_confirm'), 1.2);
            return;
          }
          clearTimeout(removeBtn._timer);
          world.removedFamilyIds = world.removedFamilyIds || new Set();
          world.removedFamilyIds.add(c.familyId);
          toast(t('slot_removed_toast', { name: c.name }), 1.2);
          world.shopSlots[idx] = null;
          if (selectedIdx === idx) selectedIdx = -1;
          renderCandidates();
          renderBag();
          renderRerollBtn();
          updateHint();
        });
        actions.appendChild(removeBtn);

        el.appendChild(actions);
      }

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
    scheduleFitCardDescs();
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
    // 购买确认音：饱满 "ka-ching"（Step 2 的反馈，比 uiClick 更厚实）
    playSfx('purchase', 0);
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
    scheduleFitCardDescs();
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
      // 切换主卡音：和"购买点击背包牌"同款的 ka-ching 确认音
      playSfx('purchase', 0);
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
    // 关闭面板 → 清除选卡视觉态（红虚线 / 交换警告）
    document.body.classList.remove('shop-selection-mode');
    document.getElementById('loot-selection-hint')?.classList.add('hidden');
    // 锁定的候选要跨"继续游戏 → 下次进入商店"保留：清空非锁定槽位，但保留 shopSlots 数组。
    // 完全没有锁定的话直接清空（保持旧行为，下次 showLoot 全新 roll）。
    if (world.shopSlots && world.shopSlots.some(c => c && c._shopLocked)) {
      for (let i = 0; i < world.shopSlots.length; i++) {
        if (world.shopSlots[i] && !world.shopSlots[i]._shopLocked) {
          world.shopSlots[i] = null;
        }
      }
    } else {
      world.shopSlots = null;
    }
    selectedIdx = -1;
    // 打烊：记录本店刷新次数 → 下次开店反推折扣（_applyCrossShopRefreshCarry 用）
    world._lastShopRefreshCount = world.refreshCount || 0;
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
      // 刷新：只 re-roll "非空 且 未锁定" 槽位（已购保持空、锁定保持原卡）
      // 锁定槽位的 family 先填入 keys，让重 roll 的其它槽位不会出现同 family 重复。
      const keys = new Set();
      for (const slot of world.shopSlots) {
        if (slot != null && slot._shopLocked) keys.add(slot.familyId);
      }
      for (let i = 0; i < world.shopSlots.length; i++) {
        const cur = world.shopSlots[i];
        if (cur != null && !cur._shopLocked) {
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
      // 商店升级：不重新 roll 候选，仅按新 candidatesCount 扩容
      // bug 修：dedup key 必须只用 familyId（_rollShopCard 内部就按 familyId dedup），
      // 否则新加的候选可能与现有候选同 family。
      const n = world.candidatesCount;
      if (world.shopSlots) {
        // 累计 key set：每次 _rollShopCard 内部会 add；这里先把现存槽位的 familyId 全填进去
        const keys = new Set(world.shopSlots.filter(Boolean).map(c => c.familyId));
        while (world.shopSlots.length < n) {
          world.shopSlots.push(_rollShopCard(world, keys));
        }
      }
      selectedIdx = -1;
      renderCandidates();
      renderBag();
      updateHint();
      renderRerollBtn();
      renderShopLevelBtn();
      renderProbBar();
      renderPermUpgrades();          // 升级到 16 级 → 永久升级按钮要出现
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
    renderPermUpgrades();   // 永久升级 label / 价格 toast 也要跟语言切换
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

// 把音效与游戏事件挂在一起。各 SFX 只在玩家"主动操作 / 显著状态变化"时响一次。
function setupSfxBindings(world) {
  // 模态按钮（刷新 / 升级 / 继续 / 背包 / 永久升级 等）统一 UI 点击音
  // capture 阶段：在按钮自身的 click handler 之前响起；disabled 按钮跳过；
  // 已有专属音效的按钮（设置 / 语言 / 关闭设置）跳过避免双响
  document.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.disabled) return;
    if (btn.id === 'settings-btn' || btn.id === 'settings-close-btn' || btn.id === 'lang-btn') return;
    const cls = btn.className || '';
    if (btn.id === 'open-inventory-btn') { playSfx('uiOpen', 0); return; }
    if (btn.id === 'close-inventory-btn') { playSfx('uiClose', 0); return; }
    if (btn.id === 'shop-level-btn') {
      // 升级是积极动作 → 用 cannonPick 双音脆响（disabled 已被上面拦截）
      playSfx('cannonPick', 0);
      return;
    }
    if (btn.id === 'reroll-btn') {
      // 刷新 → 用 shuffleIn 的洗牌感
      playSfx('shuffleIn', 0);
      return;
    }
    if (cls.includes('perm-upgrade-btn')) {
      // 永久升级 = 花金币买 buff（要求 #3 取消金币音 → 用 UI 脆响替代）
      playSfx('uiClick', 60);
      return;
    }
    if (cls.includes('modal-btn')) {
      playSfx('uiClick', 60);
      return;
    }
  }, true);

  // 开火：每"波"触发（fireOneWave 内 emit 'fireWave'）→ 固定 timbre，不随伤害变化；更响
  Events.on('fireWave', payload => {
    if (payload && payload.combo) playSfx('shotCombo', 20);
    else playSfx('shotFire', 20);
  });
  // 子弹弹射 / 摧毁：统一用 bulletDestroy 音色（用户要求 —— 弹射和撞墙耗尽听感一致）
  Events.on('bulletBounce', () => playSfx('bulletDestroy', 25));
  Events.on('bulletDestroyed', () => playSfx('bulletDestroy', 60));

  // 敌人死亡：boss 用更厚重的音效
  Events.on('enemyDied', enemy => {
    if (enemy && enemy.typeKey === 'boss') playSfx('bossDie', 120);
    else playSfx('enemyDie', 30);
  });

  // 玩家死亡
  Events.on('playerDied', () => playSfx('death', 0));

  // 金币变化：要求 #3 取消金币音（之前的 chime 太吵 / 频繁）

  // 连携 stacks 增加 → 提示音
  let _lastCombo = 0;
  Events.on('comboStacksChanged', n => {
    if (n > _lastCombo) playSfx('comboStack', 60);
    _lastCombo = n;
  });

  // 洗入：奥弹 / 挖掘 等
  Events.on('shuffledIn', () => playSfx('shuffleIn', 50));

  // 炮台选定
  Events.on('cannonChanged', c => { if (c) playSfx('cannonPick', 0); });

  // 关卡推进 → 通关号角已挪到 BattleManager._endStage（进商店前），这里不再监听 stageChanged

  // 关卡开始：state 转入 Battle 时播战鼓；进入商店时播店铃；进入奖励回合时播星星 arpeggio
  let _lastBattleState = null;
  Events.on('stateChanged', s => {
    if (s === 'Battle' && _lastBattleState !== 'Battle') {
      playSfx('stageStart', 400);
    }
    if (s === 'Reward' && _lastBattleState !== 'Reward') {
      playSfx('shopEnter', 200);
    }
    _lastBattleState = s;
    // BGM 曲目切换：State.Reward = 商店；其它 = 战斗（奖励关卡再由 rewardTurn 决定）
    if (s === 'Reward') setBgmTrack('shop');
    else setBgmTrack(world.battle.rewardTurn ? 'reward' : 'combat');
  });

  // 奖励回合开始 / 结束：BGM 切换 reward ↔ combat；进入奖励关卡时播 rewardEnter
  let _lastRewardTurn = false;
  Events.on('stageChanged', () => {
    const r = !!world.battle.rewardTurn;
    if (r !== _lastRewardTurn) {
      _lastRewardTurn = r;
      if (world.battle.state === 'Battle') {
        setBgmTrack(r ? 'reward' : 'combat');
      }
      if (r) playSfx('rewardEnter', 400);
    }
  });

  // 回合结束（player → enemy）= 上膛音；玩家回合开始静音（无需开始提示）
  Events.on('turnChanged', t => {
    if (t === 'enemy') playSfx('gunCock', 80);
  });

  // 召唤物事件：召唤 / 死亡（攻击在 Summon.fireOnce 内已直接 playSfx）
  Events.on('summonSpawned', () => playSfx('summonSpawn', 50));
  Events.on('summonDied', () => playSfx('summonDie', 50));
}

function main() {
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');
  const world = new World();
  const ui = setupUI(world);
  setupInput(world, canvas);
  setupSfxBindings(world);

  // 教程引导 + 开始界面（首次进入显示）。
  // setupCannonSelect 内已根据 localStorage.cs_seen_start 控制是否自动弹炮台选择；
  // 这里只负责显示开始界面（如果没看过）。
  const tutorial = setupTutorial(world);
  const startScreen = setupStartScreen(world, tutorial);
  // 每次进入都先显示主界面（开始游戏 / 新手教程 / 设置 / 语言）。
  // 玩家阵亡后按 Enter 重开走 cannon-select（保留旧流程），不重新走主界面。
  startScreen.show();

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
    const rawGold = enemy.waveGoldDrop ?? Math.max(1, Math.ceil(killValue / 5));
    // 敌人掉落 ≈ 原值 1/3（向上取整，下限 1）；奖励金球 hit 掉金币走另外的路径，不受影响。
    const goldAmount = Math.max(1, Math.ceil(rawGold / 3));
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
    // 转生：本局开启时，每个敌人死亡有 10% 概率召唤 1 个骷髅
    if (world._reincarnateActive && Math.random() < 0.20) {
      spawnSkeleton(world, { x: enemy.x, y: enemy.y });
    }
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
    // 调试冻结时间：跳过 battle.update + 敌人 AI（玩家仍可发射 / 子弹继续飞）
    const dbgFreeze = !!world._debugFreezeTime;
    // 鼠标按压持续发射（doFire 内部按 fireInterval 0.5s 节流，连按多帧无副作用）
    if (world.battle.state === State.Battle) {
      if (heldButtons.left)  doFire(world, 'left');
      if (heldButtons.right) doFire(world, 'right');
      if (!dbgFreeze) for (const e of world.enemies) e.update(dt, world);
      for (const s of world.summons) s.update(dt, world);
      for (const b of world.bullets) b.update(dt, now, world);
      // ─── 通用属性 diff：检测友方实体的 attack / entityLayers 在本帧的变化，
      //     自动在被 buff 的实体头上飘出 ⚔/🛡 浮字。
      //     这样无论 buff 来自哪种卡（战旗 / 战鼓 / 令箭 / 未来新卡）都自动生效，
      //     不需要每张卡显式调用 _emitEntityBuffFX。
      _tickEntityBuffDiff(world);
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
    if (!dbgFreeze) world.battle.update(dt);

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
  window.__triggerDiscover = triggerDiscover;
  window.__resolveDiscover = resolveDiscover;
  // 测试入口：奥术巨人吸收 + 激光 — preview verify 用，无运行时副作用
  window.__absorbIntoArcaneGiant = _absorbIntoArcaneGiant;
  window.__fireArcaneGiantLaser = _fireArcaneGiantLaser;
  window.__Bullet = Bullet;
  window.__resolveArcaneEvoReplacements = _resolveArcaneEvoReplacements;
  window.__spawnUndeadDragon = spawnUndeadDragon;
  window.__spawnSwordSaint = spawnSwordSaint;

  // ─── 隐藏调试控制台（默认隐藏，按 ` (反引号) 切换） ───
  setupDebugConsole(world);
}

function setupDebugConsole(world) {
  // 面板容器
  const panel = document.createElement('div');
  panel.id = 'debug-console';
  panel.style.cssText = `
    position: fixed; right: 10px; bottom: 10px; z-index: 9999;
    width: 340px; max-height: 80vh; overflow-y: auto;
    background: rgba(14, 18, 24, 0.96); border: 1px solid #ff9028;
    border-radius: 8px; padding: 10px 12px; color: #d6dbe2;
    font-family: "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
    font-size: 11.5px; display: none; box-shadow: 0 0 16px rgba(255,144,40,0.4);
  `;
  panel.innerHTML = `
    <div style="font-weight:700;color:#ff9028;font-size:13px;margin-bottom:8px;letter-spacing:1px;">
      🛠 DEBUG · 按 \` 关闭
    </div>
    <div class="dbg-row">
      <button class="dbg-btn" data-act="freeze">⏸ 无限时间</button>
      <button class="dbg-btn" data-act="cost">💎 无限费用</button>
    </div>
    <div class="dbg-row">
      <button class="dbg-btn" data-act="clear">💀 清空敌人</button>
      <button class="dbg-btn" data-act="dummy">🎯 中央无敌假人</button>
    </div>
    <div class="dbg-row">
      <button class="dbg-btn" data-act="refill">⚡ 回满法力</button>
      <button class="dbg-btn" data-act="dragon">🐉 召唤亡灵龙</button>
    </div>
    <div style="border-top:1px dashed #3a4452;margin:10px 0 8px;"></div>
    <div style="margin-bottom:4px;color:#ffd84a;font-weight:600;">🎒 背包编辑</div>
    <div class="dbg-row" style="gap:4px;">
      <select id="dbg-family" style="flex:1;font-size:11px;padding:3px;background:#1c232c;color:#d6dbe2;border:1px solid #3a4452;"></select>
      <select id="dbg-tier" style="font-size:11px;padding:3px;background:#1c232c;color:#d6dbe2;border:1px solid #3a4452;">
        <option value="bronze">铜</option>
        <option value="silver">银</option>
        <option value="gold">金</option>
        <option value="diamond" selected>钻</option>
      </select>
      <button class="dbg-btn" data-act="addCard" style="flex:0 0 auto;">+加入背包</button>
    </div>
    <div id="dbg-bag-list" style="margin-top:8px;display:flex;flex-direction:column;gap:3px;"></div>
  `;
  // 按钮通用样式（inject 一次性 CSS）
  if (!document.getElementById('debug-console-css')) {
    const s = document.createElement('style');
    s.id = 'debug-console-css';
    s.textContent = `
      #debug-console .dbg-row {display:flex;gap:6px;margin-bottom:5px;}
      #debug-console .dbg-btn {
        flex:1;padding:5px 8px;background:#2a3242;color:#d6dbe2;
        border:1px solid #3a4452;border-radius:4px;font-size:11px;cursor:pointer;
      }
      #debug-console .dbg-btn:hover {background:#3a4452;border-color:#ff9028;}
      #debug-console .dbg-btn.on {background:#ff9028;color:#1a1a1a;border-color:#ff9028;}
      #debug-console .dbg-bag-row {
        display:flex;align-items:center;gap:6px;padding:3px 6px;
        background:#1c232c;border:1px solid #2a3242;border-radius:4px;font-size:10.5px;
      }
      #debug-console .dbg-bag-row .dbg-bag-tier {min-width:32px;font-weight:700;text-align:center;border-radius:3px;padding:1px 4px;font-size:10px;}
      #debug-console .dbg-bag-row .tier-bronze {background:#7a5a32;color:#fff;}
      #debug-console .dbg-bag-row .tier-silver {background:#7a8898;color:#fff;}
      #debug-console .dbg-bag-row .tier-gold {background:#c8983a;color:#1a1a1a;}
      #debug-console .dbg-bag-row .tier-diamond {background:#7eb1ff;color:#1a1a1a;}
      #debug-console .dbg-bag-row .dbg-bag-name {flex:1;}
      #debug-console .dbg-bag-row .dbg-rm {
        color:#ef7878;cursor:pointer;font-weight:700;font-size:13px;padding:0 4px;
      }
      #debug-console .dbg-bag-row .dbg-rm:hover {color:#ff5050;}
    `;
    document.head.appendChild(s);
  }
  document.body.appendChild(panel);

  // 家族下拉填充：按字母排序
  const familySel = panel.querySelector('#dbg-family');
  const fids = Object.keys(CARD_DATA).sort();
  for (const fid of fids) {
    const fam = CARD_DATA[fid];
    const nm = (typeof fam.name === 'string') ? fam.name : (fam.name?.zh || fid);
    const opt = document.createElement('option');
    opt.value = fid;
    opt.textContent = `${fam.emoji || '⚙'} ${nm} (${fid})`;
    familySel.appendChild(opt);
  }

  // 渲染背包当前列表
  function renderBag() {
    const list = panel.querySelector('#dbg-bag-list');
    list.innerHTML = '';
    const bag = world.deck.bag || [];
    if (bag.length === 0) {
      list.innerHTML = '<div style="color:#6f7986;font-style:italic;">背包为空</div>';
      return;
    }
    bag.forEach((c, i) => {
      const row = document.createElement('div');
      row.className = 'dbg-bag-row';
      const tierLabel = { bronze: '铜', silver: '银', gold: '金', diamond: '钻' }[c.tier] || c.tier;
      const fam = c._family;
      const nm = (typeof fam.name === 'string') ? fam.name : (fam.name?.zh || c.familyId);
      const isMain = i === 0 ? '★ ' : '';
      row.innerHTML = `
        <span class="dbg-bag-tier tier-${c.tier}">${tierLabel}</span>
        <span class="dbg-bag-name">${isMain}${fam.emoji || '⚙'} ${nm}</span>
        <span class="dbg-rm" title="移除">✕</span>
      `;
      row.querySelector('.dbg-rm').addEventListener('click', () => {
        world.deck.bag.splice(i, 1);
        Events.emit('bagChanged');
        renderBag();
      });
      list.appendChild(row);
    });
  }

  // 按钮通用动作
  panel.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'freeze') {
      world._debugFreezeTime = !world._debugFreezeTime;
      btn.classList.toggle('on', world._debugFreezeTime);
    } else if (act === 'cost') {
      world._debugInfiniteCost = !world._debugInfiniteCost;
      btn.classList.toggle('on', world._debugInfiniteCost);
      if (world._debugInfiniteCost) {
        world.player.mana = world.player.maxMana;
        Events.emit('manaChanged', world.player.mana);
      }
    } else if (act === 'clear') {
      for (const e of world.enemies) { e.alive = false; e.hp = 0; }
    } else if (act === 'dummy') {
      const dummy = new Enemy(world.w / 2, world.h / 2 - 40, 'goblin', world);
      dummy._invincible = true;
      dummy._isDebugDummy = true;
      dummy.maxHp = 999999;
      dummy.hp = 999999;
      dummy.radius = 32;
      dummy.color = '#7eb1ff';
      dummy.attack = 0;
      dummy.spawnT = 0;
      world.enemies.push(dummy);
    } else if (act === 'refill') {
      world.player.mana = world.player.maxMana;
      Events.emit('manaChanged', world.player.mana);
    } else if (act === 'dragon') {
      spawnUndeadDragon(world);
    } else if (act === 'addCard') {
      const fid = familySel.value;
      const tier = panel.querySelector('#dbg-tier').value;
      const fam = CARD_DATA[fid];
      if (!fam || !fam.tiers[tier]) {
        // 容错：找该家族最低存在 tier
        const fallback = ['bronze','silver','gold','diamond'].find(t => fam.tiers[t]);
        if (!fallback) return;
        world.deck.bag.push(mkCard(fid, fallback));
      } else {
        world.deck.bag.push(mkCard(fid, tier));
      }
      Events.emit('bagChanged');
      renderBag();
    }
  });

  // bagChanged 也刷新（外部操作如商店购买）
  Events.on('bagChanged', renderBag);
  renderBag();

  // 切换显隐：` (反引号) 键
  window.addEventListener('keydown', (e) => {
    if (e.key === '`' || e.code === 'Backquote') {
      // 避免与输入框冲突
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      const showing = panel.style.display === 'block';
      panel.style.display = showing ? 'none' : 'block';
      if (!showing) renderBag();
    }
  });

  // 暴露给控制台手动操作
  window.__debugPanel = panel;
}

main();

})();
