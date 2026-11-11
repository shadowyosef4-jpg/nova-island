const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const bridge = window.nova;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const island = $('#island');
const ICON_X = '<svg class="s" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>';
const ICON_PLUS = '<svg class="s" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>';

const state = {
  hover: false,
  pinned: false,
  moving: false,
  mediaFront: false, // the player showing the media is the window in front
  dragging: false,
  tab: 'media',
  media: { has: false },
  mediaAt: 0,
  vol: null,
  muted: false,
  bright: -1,
  volLockUntil: 0,
  brightLockUntil: 0,
  peekUntil: 0,
  toast: null,
  toastUntil: 0,
  timer: { total: 0, remaining: 0, endAt: 0, running: false },
  dl: { active: false, title: '', tab: false }, // IDM Nova, filled by views/downloads.js
  features: {}, // switches from the Settings window; a missing key means on
  visible: true, // false while hidden (fullscreen app, or hidden from the menu)
  reminderUntil: 0, // a dhikr / du'a / verse card is on screen until then (views/reminders.js)
  reminderSize: [500, 140],
  sceneUntil: 0, // the island is a character (views/scene.js) until then
  radio: { on: false, name: '' }, // Quran Radio (plugin) playing, filled by views/radio.js
  radioTab: false, // the Quran Radio plugin is installed and on
};
const feat = (key) => state.features[key] !== false;

// Good news: sparkles fly out of the island's edges.
function celebrate(colors = ['#ffd479', '#30d158', '#8ab4ff', '#ff6b9d']) {
  if (!feat('celebrate') || anchor.vertical || state.features.noAnimations) return;
  const r = island.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  for (let i = 0; i < 18; i++) {
    const a = (Math.PI * 2 * i) / 18 + Math.random() * 0.3;
    // start on the pill's outline, fly outward
    const sx = cx + Math.cos(a) * r.width / 2;
    const sy = cy + Math.sin(a) * r.height / 2;
    const dist = 18 + Math.random() * 34;
    const p = document.createElement('i');
    p.className = 'spark';
    p.style.cssText = `left:${sx}px;top:${sy}px;background:${colors[i % colors.length]};--s:${(3 + Math.random() * 3).toFixed(1)}px`;
    document.body.append(p);
    p.animate([
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(a) * dist}px), calc(-50% + ${Math.sin(a) * dist}px)) scale(.2)`, opacity: 0 },
    ], { duration: 700 + Math.random() * 400, easing: 'cubic-bezier(.2,.8,.2,1)' }).onfinish = () => p.remove();
  }
}

// Things worth telling the user when they come back to the computer (views call note()).
const happenings = [];
function note(icon, text) {
  happenings.push({ at: Date.now(), icon, text });
  if (happenings.length > 40) happenings.shift();
}
let internalDrag = false; // set by the shelf while dragging a file out

const fmt = (sec) => {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60);
  const s = String(sec % 60).padStart(2, '0');
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${s}` : `${m}:${s}`;
};

// ---------------- mode ----------------
const SIZE = { idle: 1, compact: 2, toast: 3, peek: 4, reminder: 4, scene: 4, expanded: 5 };

function timerActive() {
  return state.timer.running || state.timer.remaining > 0;
}

// What the compact pill shows, by priority: timer, playing media, a running download. (The radio
// doesn't take the pill: the idle info keeps rotating, with a small "on air" mark by the prayer.)
function compactKind() {
  if (timerActive()) return 'timer';
  if (feat('mediaPill') && state.media.has && state.media.playing && !state.mediaFront) return 'media';
  if (state.dl.active) return 'dl';
  return '';
}

function currentMode() {
  const now = Date.now();
  // a character scene (adhan, water, focus) owns the island until it ends or is closed
  if (state.sceneUntil > now && !anchor.vertical) return 'scene';
  // a toast with a button (Join) stays under the cursor so it can be clicked
  if (state.toastAction && state.toast && now < state.toastUntil && !state.pinned) return 'toast';
  // a reminder stays put under the cursor so it can be read (hovering pauses it)
  if (state.reminderUntil > now && !state.pinned && !state.dragging) {
    return state.toast && now < state.toastUntil ? 'toast' : 'reminder';
  }
  if (!state.moving && (state.hover || state.pinned || state.dragging)) return 'expanded';
  if (state.toast && now < state.toastUntil) return 'toast';
  if (now < state.peekUntil && !state.mediaFront) return 'peek';
  if (compactKind()) return 'compact';
  return 'idle';
}

let lastMode = '';
function render() {
  const mode = currentMode();
  if (mode !== lastMode) {
    island.classList.toggle('shrinking', !!lastMode && SIZE[mode] < SIZE[lastMode]);
    island.classList.remove('idle', 'compact', 'toast', 'peek', 'reminder', 'scene', 'expanded');
    island.classList.add(mode);
    const prev = lastMode;
    lastMode = mode;
    if (typeof positionIsland === 'function') positionIsland();
    if (typeof wake === 'function') wake();
    window.dispatchEvent(new CustomEvent('island:mode', { detail: { mode, prev } }));
  }
  island.classList.toggle('has-media', !!state.media.has);
  island.classList.toggle('playing', !!state.media.playing);
  const kind = compactKind();
  for (const el of [$('.l-compact'), $('.l-vcompact')]) {
    el.classList.toggle('timer', kind === 'timer');
    el.classList.toggle('dl', kind === 'dl');
  }
  const showTitle = kind === 'dl' || (kind === 'media' && feat('mediaTitle'));
  const wide = showTitle;
  if (wide !== island.classList.contains('c-wide')) {
    island.classList.toggle('c-wide', wide);
    if (typeof positionIsland === 'function') positionIsland();
  }
  setCompactTitle(!showTitle ? '' : kind === 'media' ? state.media.title : state.dl.title);
  $('.c-title').hidden = !showTitle;
}

// Title between the art and the equalizer; scrolls back and forth when it doesn't fit.
let cTitle = null;
let fitTimer = null;
function setCompactTitle(text) {
  text = text || '';
  if (text === cTitle) return;
  cTitle = text;
  $('#c-title').textContent = text;
  fitCompactTitle();
}
function fitCompactTitle() {
  const box = $('.c-title');
  box.classList.remove('scroll');
  clearTimeout(fitTimer);
  // measure once the pill has finished morphing to its width
  fitTimer = setTimeout(() => {
    const span = $('#c-title');
    const over = span.scrollWidth - box.clientWidth;
    if (over <= 2 || lastMode !== 'compact') return;
    box.style.setProperty('--dist', `${-over - 12}px`);
    box.style.setProperty('--dur', `${Math.max(5, over / 22 + 3)}s`);
    box.classList.toggle('rtl', getComputedStyle(span).direction === 'rtl');
    box.classList.add('scroll');
  }, 560);
}
window.addEventListener('island:mode', (e) => {
  if (e.detail.mode === 'compact') fitCompactTitle();
});

// ---------------- hover (main process polls the cursor with hover intent) ----------------
let hoverTimer = null;
bridge.onHover((v) => {
  clearTimeout(hoverTimer);
  if (v) {
    state.hover = true;
    render();
  } else {
    hoverTimer = setTimeout(() => {
      state.hover = false;
      render();
    }, 160);
  }
});

let lastRect = '';
let lastClickable = false;
function reportRect() {
  // something on the island to click (a toast with a button, a reminder or a scene): over the
  // browser in "Stay in place" it takes the mouse again for as long as it's there
  const clickable = (lastMode === 'toast' && !!state.toastAction && Date.now() < state.toastUntil) || lastMode === 'reminder' || lastMode === 'scene';
  if (clickable !== lastClickable) {
    lastClickable = clickable;
    bridge.setClickable(clickable);
  }
  let r = island.getBoundingClientRect();
  // during a scene the card beside the character must take the mouse too
  if (lastMode === 'scene') {
    const c = $('#scene-card').getBoundingClientRect();
    const left = Math.min(r.left, c.left);
    const top = Math.min(r.top, c.top);
    r = { left, top, width: Math.max(r.right, c.right) - left, height: Math.max(r.bottom, c.bottom) - top };
  }
  const rect = { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
  const key = JSON.stringify(rect);
  if (key !== lastRect) {
    lastRect = key;
    bridge.setRect(rect);
  }
}
// The rect only changes while the island morphs or moves (the frame loop is running then), so it's
// read 20 times a second during a change and 4 times a second while it sits still; with the
// performance options on it only has to keep pace with the hover intent.
const light = () => !!(state.features.noBlur || state.features.noAnimations || state.features.glassFreeze);
setTimeout(function reportLoop() {
  reportRect();
  setTimeout(reportLoop, frameRunning || state.moving ? 50 : light() ? 300 : 250);
}, 0);

bridge.onToggle(() => {
  state.pinned = !state.pinned;
  if (!state.pinned) state.hover = false;
  bridge.setPinned(state.pinned);
  render();
});

// ---------------- drag to move (docks when dropped at the top edge) ----------------
const NO_DRAG = 'button, input, .slider, .file, .app, .pick, .picker, .clip-item, .shelf-items';
let press = null;
let justMoved = false;

island.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.target.closest(NO_DRAG)) return;
  press = { x: e.screenX, y: e.screenY, id: e.pointerId };
});
window.addEventListener('pointermove', (e) => {
  if (!press || state.moving) return;
  if (Math.hypot(e.screenX - press.x, e.screenY - press.y) < 5) return; // drag threshold
  state.moving = true;
  island.setPointerCapture(press.id);
  island.classList.add('moving');
  render();
  bridge.dragStart();
});
function endMove() {
  if (state.moving) {
    state.moving = false;
    state.hover = false;
    justMoved = true;
    setTimeout(() => (justMoved = false), 50);
    island.classList.remove('moving');
    bridge.dragEnd();
    render();
  }
  press = null;
}
window.addEventListener('pointerup', endMove);
island.addEventListener('lostpointercapture', endMove);

// a plain click on the collapsed island opens it (also right after a move)
island.addEventListener('click', (e) => {
  if (!justMoved && lastMode === 'toast' && state.toastAction) {
    const act = state.toastAction;
    state.toastAction = null;
    state.toastUntil = 0;
    render();
    act();
    return;
  }
  if (justMoved || lastMode === 'expanded' || lastMode === 'reminder' || lastMode === 'scene' || e.target.closest(NO_DRAG)) return;
  state.hover = true;
  render();
});

// ---------------- placement inside the window ----------------
// Main sends the pill's anchor (top-center) in window coordinates. Each mode is centered
// on it, then pushed back inside the window, so near the bottom or the sides the island
// opens upward / inward instead of off screen. Sizes mirror style.css.
const DIMS = {
  idle: [236, 32], compact: [300, 32], toast: [340, 34], peek: [400, 78], expanded: [548, 232],
};
const COMPACT_WIDE = 380; // compact with a title (media / download)
const VDIMS = { ...DIMS, idle: [44, 244], compact: [44, 136], toast: [44, 168] };
let anchor = { x: window.innerWidth / 2, y: 8, docked: false, vertical: false, side: 'right' };

function positionIsland() {
  let [w, h] = (anchor.vertical ? VDIMS : DIMS)[lastMode] || DIMS.idle;
  if (lastMode === 'compact' && !anchor.vertical && island.classList.contains('c-wide')) w = COMPACT_WIDE;
  if (lastMode === 'reminder') [w, h] = state.reminderSize;
  // in the browser's address bar: a slim pill, or a thin line while the user types there
  if (anchor.addr && !anchor.vertical && (lastMode === 'idle' || lastMode === 'compact')) {
    [w, h] = anchor.addr === 'line' ? [90, 3] : [anchor.sw, anchor.sh];
  }
  if (lastMode === 'scene') {
    // the body on the right, the card on its left: [card 430][gap 22][body 64], kept inside the window
    const CW = 516;
    const left = Math.min(Math.max(anchor.x - CW / 2, 8), window.innerWidth - CW - 8);
    const top = anchor.docked ? 30 : Math.min(Math.max(anchor.y + 22, 10), window.innerHeight - 130);
    island.style.setProperty('--x', `${Math.round(left + CW - 64)}px`);
    island.style.setProperty('--y', `${Math.round(top)}px`);
    const card = $('#scene-card');
    card.style.left = `${Math.round(left)}px`;
    card.style.top = `${Math.round(top - 14)}px`;
    wake();
    return;
  }
  const W = window.innerWidth;
  const H = window.innerHeight;
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  let x;
  let y;
  if (anchor.vertical) {
    // flush against the screen edge, centered on the anchor, kept inside the window
    x = anchor.side === 'left' ? 0 : W - w;
    y = clamp(anchor.y - h / 2, 4, H - h - 4);
  } else {
    x = clamp(anchor.x - w / 2, 4, W - w - 4);
    y = anchor.docked ? 0 : clamp(anchor.y, 0, H - h - 6);
  }
  island.style.setProperty('--x', `${Math.round(x)}px`);
  island.style.setProperty('--y', `${Math.round(y)}px`);
  wake(); // the glass must follow the island while it slides into place
}

bridge.onAnchor((a) => {
  anchor = a;
  island.classList.toggle('addr-slim', a.addr === 'slim');
  island.classList.toggle('addr-line', a.addr === 'line');
  if (a.addr) {
    island.style.setProperty('--sw', `${a.sw}px`);
    island.style.setProperty('--sh', `${a.sh}px`);
  }
  island.classList.toggle('docked', !!a.docked);
  island.classList.toggle('vertical', !!a.vertical);
  island.classList.toggle('side-left', !!a.vertical && a.side === 'left');
  island.classList.toggle('side-right', !!a.vertical && a.side === 'right');
  positionIsland();
});

island.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (e.target.closest('.apps-grid, .file, input')) return;
  bridge.contextMenu();
});

// ---------------- glass backdrop ----------------
const bd = $('#bd');
const bdCtx = bd.getContext('2d');
const off = document.createElement('canvas');
const offCtx = off.getContext('2d');
let fadeFrames = 0;

function sizeCanvases() {
  [bd, off].forEach((c) => {
    c.width = window.innerWidth;
    c.height = window.innerHeight;
  });
  bd.style.width = `${window.innerWidth}px`;
  bd.style.height = `${window.innerHeight}px`;
}
sizeCanvases();
window.addEventListener('resize', sizeCanvases);

// the backdrop arrives as raw pixels (BGRA, Windows' order): swapped to RGBA, then drawn blurred
bridge.onBackdrop(async (frame) => {
  let img;
  if (typeof frame === 'string') {
    img = new Image();
    img.src = frame;
    await img.decode();
  } else {
    const px = new Uint8ClampedArray(frame.bgra.buffer, frame.bgra.byteOffset, frame.bgra.byteLength);
    for (let i = 0; i < px.length; i += 4) {
      const b = px[i];
      px[i] = px[i + 2];
      px[i + 2] = b;
      px[i + 3] = 255;
    }
    img = await createImageBitmap(new ImageData(px, frame.w, frame.h));
  }
  const { width: w, height: h } = off;
  offCtx.filter = 'none';
  offCtx.drawImage(img, 0, 0, w, h);
  offCtx.filter = 'blur(22px) saturate(180%) brightness(.92)';
  offCtx.drawImage(img, -24, -24, w + 48, h + 48);
  img.close?.();
  fadeFrames = 10;
  wake(300);
});

const segThumb = $('.seg-thumb');
function placeSegThumb() {
  const a = $('.tab.active');
  if (!a) return;
  segThumb.style.width = `${a.offsetWidth}px`;
  segThumb.style.transform = `translateX(${a.offsetLeft}px)`;
}

// The frame loop only runs while something moves: the island morphing, a fresh backdrop
// fading in, or the open island (tab thumb, media progress). Idle, it stops completely.
let frameRunning = false;
let awakeUntil = 0;
let lastBd = '';
function wake(ms = 900) {
  awakeUntil = Math.max(awakeUntil, performance.now() + ms);
  if (!frameRunning) {
    frameRunning = true;
    requestAnimationFrame(frame);
  }
}

function frame() {
  // reading the layout every frame while the island sits open is wasted work; whole pixels, so
  // the captured glass doesn't tremble at its edges
  if (state.moving || performance.now() < awakeUntil) {
    const r = island.getBoundingClientRect();
    const key = `${Math.round(r.left)},${Math.round(r.top)}`;
    if (key !== lastBd) {
      lastBd = key;
      bd.style.transform = `translate(${-Math.round(r.left)}px, ${-Math.round(r.top)}px)`;
    }
  }
  if (fadeFrames > 0) {
    bdCtx.globalAlpha = fadeFrames === 1 ? 1 : 0.22;
    bdCtx.drawImage(off, 0, 0);
    fadeFrames--;
  }
  if (lastMode === 'expanded') {
    placeSegThumb();
    tickProgress();
  }
  if (fadeFrames > 0 || lastMode === 'expanded' || state.moving || performance.now() < awakeUntil) {
    requestAnimationFrame(frame);
  } else {
    frameRunning = false;
  }
}

// ---------------- tabs ----------------
$$('.tab').forEach((btn) => btn.addEventListener('click', () => selectTab(btn.dataset.tab)));
function selectTab(tab) {
  state.tab = tab;
  $$('.tab').forEach((b) => {
    const on = b.dataset.tab === tab;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on);
  });
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `v-${tab}`));
}

// ---------------- clock ----------------
function tickClock() {
  const d = new Date();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const date = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  $('#x-clock').textContent = $('#i-time').textContent = time;
  $('#x-date').textContent = $('#i-date').textContent = date;
  $('#v-time').textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  $('#v-day').textContent = d.toLocaleDateString([], { weekday: 'short', day: 'numeric' });
}
tickClock();
setInterval(tickClock, 5000);

// ---------------- idle pill: rotates clock/weather, CPU/RAM and the next prayer ----------------
let infoSlide = 0;
setInterval(() => {
  if (lastMode !== 'idle') return;
  showSlide(infoSlide + 1);
}, 6000);

// Shows the n-th slide among those turned on; with all of them off the clock stays.
function showSlide(n) {
  const all = [...$$('.info-slide')];
  let slides = all.filter((s) => !s.hidden && !s.classList.contains('off'));
  if (!slides.length) slides = [all[0]];
  infoSlide = n % slides.length;
  all.forEach((s) => s.classList.toggle('on', s === slides[infoSlide]));
}

bridge.onStats((s) => {
  const set = (id, v) => {
    $(`#i-${id}`).textContent = `${Math.round(v * 100)}%`;
    const bar = $(`#i-${id}-bar`);
    bar.style.width = `${Math.round(v * 100)}%`;
    bar.classList.toggle('warn', v >= 0.7 && v < 0.9);
    bar.classList.toggle('hot', v >= 0.9);
  };
  set('cpu', s.cpu);
  set('ram', s.ram);
  $('#v-cpu').textContent = `${Math.round(s.cpu * 100)}%`;
  $('#v-ram').textContent = `${Math.round(s.ram * 100)}%`;
});

// ---------------- sliders ----------------
function makeSlider(el, { onInput, onCommit } = {}) {
  const fill = el.querySelector('.fill');
  let value = 0;
  let dragging = false;
  const set = (v) => {
    value = Math.max(0, Math.min(1, v));
    fill.style.width = `${value * 100}%`;
    el.setAttribute('aria-valuenow', Math.round(value * 100));
  };
  const at = (e) => {
    const r = el.getBoundingClientRect();
    return (e.clientX - r.left) / r.width;
  };
  el.addEventListener('pointerdown', (e) => {
    dragging = true;
    el.classList.add('drag');
    el.setPointerCapture(e.pointerId);
    set(at(e));
    onInput?.(value);
  });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    set(at(e));
    onInput?.(value);
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('drag');
    onCommit?.(value);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  return { set, get dragging() { return dragging; } };
}

function throttle(fn, ms) {
  let last = 0;
  let timer = null;
  return (...args) => {
    const wait = ms - (Date.now() - last);
    clearTimeout(timer);
    if (wait <= 0) {
      last = Date.now();
      fn(...args);
    } else {
      timer = setTimeout(() => { last = Date.now(); fn(...args); }, wait);
    }
  };
}

// ---------------- media ----------------
const APP_NAMES = {
  spotify: 'Spotify', chrome: 'Chrome', msedge: 'Edge', firefox: 'Firefox', opera: 'Opera',
  vlc: 'VLC', zunemusic: 'Media Player', microsoftmediaplayer: 'Media Player', applemusic: 'Apple Music',
  brave: 'Brave', telegram: 'Telegram', whatsapp: 'WhatsApp', youtube: 'YouTube',
};
function appName(id) {
  if (!id) return '';
  const raw = id.split('!').pop().split('\\').pop().replace(/\.exe$/i, '');
  const key = raw.toLowerCase().replace(/[^a-z]/g, '');
  for (const k of Object.keys(APP_NAMES)) if (key.includes(k)) return APP_NAMES[k];
  return raw.split('.').pop();
}

function setAccent(r, g, b) {
  document.documentElement.style.setProperty('--accent-rgb', `${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}`);
}

function setAccentFromImage(img) {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 24;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, 24, 24);
    const px = ctx.getImageData(0, 0, 24, 24).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < px.length; i += 4) {
      const max = Math.max(px[i], px[i + 1], px[i + 2]);
      const min = Math.min(px[i], px[i + 1], px[i + 2]);
      if (max < 50 || max - min < 30) continue; // skip dark / grey pixels
      const wgt = max - min; // favour saturated pixels
      r += px[i] * wgt; g += px[i + 1] * wgt; b += px[i + 2] * wgt; n += wgt;
    }
    if (!n) return setAccent(220, 220, 230);
    r /= n; g /= n; b /= n;
    const k = 235 / Math.max(r, g, b); // lift so the accent reads on dark glass
    setAccent(Math.min(255, r * k), Math.min(255, g * k), Math.min(255, b * k));
  } catch {}
}

// Gradient tile with a note, used until (or when) the player provides no artwork.
function placeholderArt(seed) {
  const c = document.createElement('canvas');
  c.width = c.height = 160;
  const ctx = c.getContext('2d');
  let h = 210;
  for (const ch of seed || '') h = (h * 31 + ch.charCodeAt(0)) % 360;
  const g = ctx.createLinearGradient(0, 0, 160, 160);
  g.addColorStop(0, `hsl(${h}, 70%, 58%)`);
  g.addColorStop(1, `hsl(${(h + 45) % 360}, 65%, 28%)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 160, 160);
  ctx.translate(32, 32);
  ctx.scale(4, 4);
  ctx.fillStyle = 'rgba(255,255,255,.88)';
  ctx.fill(new Path2D('M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6Z'));
  return c.toDataURL('image/png');
}

function setArt(url) {
  ['#c-art', '#vc-art', '#p-art', '#m-art', '#m-art-glow'].forEach((s) => ($(s).src = url));
  const img = new Image();
  img.onload = () => setAccentFromImage(img);
  img.src = url;
}

function setPlayingUI(playing) {
  const view = $('#v-media');
  view.classList.toggle('playing', playing);
  view.classList.toggle('paused', state.media.has && !playing);
  $$('.eq').forEach((e) => e.classList.toggle('paused', !playing));
}

// True while the user is looking at the player itself (e.g. the YouTube tab in Chrome),
// so the island doesn't repeat what is already on screen.
const BROWSERS = ['chrome', 'msedge', 'firefox', 'brave', 'opera', 'vivaldi'];
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
function isMediaInFront(m) {
  if (!m.has || !m.fgProc) return false;
  const proc = m.fgProc.toLowerCase();
  const appId = (m.app || '').toLowerCase();
  const sameApp = appId.includes(proc) || (proc === 'firefox' && appId === '308046b0af4a39cb');
  if (!sameApp) return false;
  if (!BROWSERS.includes(proc)) return true;
  // browsers: only when the active tab is the one playing
  const title = norm(m.fgTitle);
  return (!!m.title && title.includes(norm(m.title))) || title.includes('youtube');
}

let lastTrack = null;
let hasRealArt = false;
bridge.onMedia((m) => {
  if (m.error) return;
  const lock = state.playLock;
  if (lock && Date.now() < lock.until && m.has && m.playing !== lock.value) {
    m.playing = lock.value;
    m.pos = mediaPos();
  } else if (lock && m.playing === lock.value) {
    state.playLock = null;
  }
  state.media = m;
  state.mediaAt = performance.now();
  state.mediaFront = isMediaInFront(m);

  const key = m.has ? `${m.title}|${m.artist}|${m.app}` : null;
  if (key !== lastTrack) {
    if (key && lastTrack && m.title && !state.mediaFront && feat('trackPeek')) {
      state.peekUntil = Date.now() + 3200;
      setTimeout(render, 3300);
    }
    lastTrack = key;
    hasRealArt = false;
    if (key) setArt(placeholderArt(m.title + m.app));
  }
  if (m.thumb) {
    hasRealArt = true;
    setArt(`data:image/png;base64,${m.thumb}`);
  }

  if (m.has) {
    $('#m-title').textContent = $('#p-title').textContent = m.title || 'Unknown';
    const sub = m.artist || m.album || appName(m.app);
    $('#m-artist').textContent = $('#p-artist').textContent = sub;
    $('#p-eyebrow').textContent = appName(m.app) ? `Now Playing · ${appName(m.app)}` : 'Now Playing';
  }
  $('#x-app-name').textContent = m.has ? appName(m.app) || 'Media' : 'Idle';
  $('#v-media').classList.toggle('browser-src', m.has && BROWSERS.some((b) => (m.app || '').toLowerCase().includes(b)) && !(m.app || '').toLowerCase().includes('firefox'));
  $('#v-media').classList.toggle('none', !m.has);
  setPlayingUI(!!m.playing);
  $('#m-progress').classList.toggle('hidden', !(m.dur > 0));

  handleVolume(m);
  handleBrightness(m);
  render();
});

function mediaPos() {
  const m = state.media;
  let pos = m.pos || 0;
  if (m.playing) pos += (performance.now() - state.mediaAt) / 1000;
  return Math.min(pos, m.dur || 0);
}

const seek = makeSlider($('#m-bar'), {
  onCommit: (v) => {
    const m = state.media;
    if (!m.has || !(m.dur > 0)) return;
    const sec = v * m.dur;
    bridge.mediaCmd(`seek ${sec.toFixed(1)}`);
    state.media.pos = sec;
    state.mediaAt = performance.now();
  },
});

function tickProgress() {
  const m = state.media;
  if (!m.has || !(m.dur > 0)) return;
  const pos = seek.dragging ? parseFloat($('#m-bar').getAttribute('aria-valuenow')) / 100 * m.dur : mediaPos();
  $('#m-pos').textContent = fmt(pos);
  $('#m-dur').textContent = `-${fmt(m.dur - pos)}`;
  if (!seek.dragging) seek.set(pos / m.dur);
}

$$('[data-cmd]').forEach((btn) =>
  btn.addEventListener('click', () => {
    const cmd = btn.dataset.cmd;
    bridge.mediaCmd(cmd);
    if (cmd === 'toggle' && state.media.has) {
      // optimistic UI; hold it until the player reports the new state (it lags ~0.5 s),
      // otherwise the island morphs back and forth for a moment
      state.media.pos = mediaPos();
      state.mediaAt = performance.now();
      state.media.playing = !state.media.playing;
      state.playLock = { value: state.media.playing, until: Date.now() + 1800 };
      setPlayingUI(state.media.playing);
      render();
    }
  })
);

// ---------------- mini player ----------------
const pipBtn = $('#pip-btn');
function flashError(text) {
  const el = $('#m-artist');
  const prev = el.textContent;
  el.textContent = text;
  el.classList.add('err');
  setTimeout(() => {
    el.classList.remove('err');
    el.textContent = prev;
  }, 3500);
}
pipBtn.addEventListener('click', async () => {
  const m = state.media;
  if (!m.has || pipBtn.classList.contains('busy')) return;
  pipBtn.classList.add('busy');
  const res = await bridge.miniOpen({ app: m.app, title: m.title, pos: mediaPos(), playing: !!m.playing });
  pipBtn.classList.remove('busy');
  if (!res?.ok) {
    flashError(res?.error === 'no-url' ? "Couldn't find this video's YouTube link" : 'Works with YouTube in Chrome, Edge or Brave');
    return;
  }
  state.hover = false;
  state.pinned = false;
  render();
});

// ---------------- volume ----------------
function volIconClass(el, vol, muted) {
  el.classList.toggle('vol-mute', muted || vol === 0);
  el.classList.toggle('vol-low', !muted && vol > 0 && vol < 0.4);
}

const sendVol = throttle((v) => bridge.mediaCmd(`vol ${v.toFixed(3)}`), 60);
function setVolume(v) {
  state.vol = Math.round(Math.max(0, Math.min(1, v)) * 100) / 100;
  state.muted = false;
  state.volLockUntil = Date.now() + 900;
  volSlider.set(state.vol);
  showVolPct(state.vol, false);
  sendVol(state.vol);
}
function showVolPct(vol, muted) {
  volIconClass($('.vol'), vol, muted);
  $('#vol-pct').textContent = muted ? 'Muted' : `${Math.round(vol * 100)}%`;
}
const volSlider = makeSlider($('#vol-slider'), { onInput: setVolume });

$('#vol-btn').addEventListener('click', () => {
  state.muted = !state.muted;
  state.volLockUntil = Date.now() + 900;
  showVolPct(state.vol ?? 0, state.muted);
  bridge.mediaCmd('mute');
});

island.addEventListener('wheel', (e) => {
  if (e.target.closest('.picker-list, .clip-list, .shelf-items') || state.vol === null) return;
  e.preventDefault();
  // proportional to the scroll distance: one mouse notch ≈ 3%, touchpads move in fine steps
  const perPx = e.deltaMode === 1 ? 0.01 : 0.0003;
  const step = Math.max(-0.05, Math.min(0.05, -e.deltaY * perPx));
  setVolume(state.vol + step);
  if (state.tab !== 'media' || lastMode !== 'expanded') showHud('vol', state.vol, false);
}, { passive: false });

function handleVolume(m) {
  if (typeof m.vol !== 'number') return;
  const locked = Date.now() < state.volLockUntil;
  const changed = state.vol !== null && (Math.abs(m.vol - state.vol) > 0.004 || !!m.muted !== state.muted);
  if (locked) return;
  state.vol = m.vol;
  state.muted = !!m.muted;
  if (!volSlider.dragging) volSlider.set(m.vol);
  showVolPct(m.vol, state.muted);
  if (changed && !(lastMode === 'expanded' && state.tab === 'media')) showHud('vol', m.vol, state.muted);
}

// ---------------- brightness ----------------
const sendBright = throttle((v) => bridge.mediaCmd(`bright ${Math.round(v * 100)}`), 150);
const brightSlider = makeSlider($('#bright-slider'), {
  onInput: (v) => {
    state.bright = Math.round(v * 100);
    state.brightLockUntil = Date.now() + 2500;
    $('#bright-val').textContent = `${state.bright}%`;
    sendBright(v);
  },
});

function handleBrightness(m) {
  if (typeof m.bright !== 'number') return;
  $('#bright-row').hidden = m.bright < 0;
  if (m.bright < 0 || Date.now() < state.brightLockUntil) return;
  const changed = state.bright >= 0 && m.bright !== state.bright;
  state.bright = m.bright;
  if (!brightSlider.dragging) brightSlider.set(m.bright / 100);
  $('#bright-val').textContent = `${m.bright}%`;
  if (changed && lastMode !== 'expanded') showHud('bright', m.bright / 100);
}

// ---------------- toasts & HUD ----------------
let toastTimer = null;
// state.toastAction: what a click on the current toast does (set right after showToast)
function showToast(kind, label, value, pct, ms = 3200) {
  state.toastAction = null;
  const t = $('.l-toast');
  t.className = `layer l-toast ${kind}`;
  $('#t-label').textContent = label;
  $('#t-value').textContent = value;
  $('.l-toast .batt b').style.width = `${Math.round((pct ?? 0) * 100)}%`;
  $('.t-bar b').style.width = `${Math.round((pct ?? 0) * 100)}%`;
  // vertical variant
  $('.l-vtoast').className = `layer vlayer l-vtoast ${kind}`;
  $('#vt-value').textContent = kind === 'done' ? 'Done' : value;
  $('.v-bar b').style.height = `${Math.round((pct ?? 0) * 100)}%`;
  state.toast = kind;
  state.toastUntil = Date.now() + ms;
  render();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(render, ms + 50);
}

function showHud(kind, value, muted) {
  if (!feat(kind === 'vol' ? 'hudVolume' : 'hudBrightness')) return;
  const pct = muted ? 0 : value;
  showToast(kind, '', muted ? 'Muted' : `${Math.round(value * 100)}%`, pct, 1600);
  if (kind === 'vol') {
    volIconClass($('.l-toast'), value, !!muted);
    volIconClass($('.l-vtoast'), value, !!muted);
  }
}

// ---------------- battery ----------------
if (navigator.getBattery) {
  navigator.getBattery().then((b) => {
    let lowShown = false;
    const pct = () => `${Math.round(b.level * 100)}%`;
    b.addEventListener('chargingchange', () => {
      if (!feat('battery')) return;
      if (b.charging) showToast('charging', 'Charging', pct(), b.level);
      else showToast(b.level <= 0.2 ? 'low' : 'battery', 'On Battery', pct(), b.level);
    });
    b.addEventListener('levelchange', () => {
      if (!b.charging && b.level <= 0.2 && !lowShown && feat('battery')) {
        lowShown = true;
        showToast('low', 'Low Battery', pct(), b.level, 4500);
      }
      if (b.level > 0.2) lowShown = false;
    });
  });
}

// ---------------- file drag & drop (routes to the shelf) ----------------
const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');
function endDrop() {
  state.dragging = false;
  island.classList.remove('dropping');
  render();
}
window.addEventListener('dragenter', (e) => {
  // with the Shelf tab switched off the island doesn't take files at all
  if (internalDrag || !hasFiles(e) || !feat('tabShelf')) return;
  e.preventDefault();
  if (!state.dragging) {
    state.dragging = true;
    island.classList.add('dropping');
    selectTab('shelf');
    render();
  }
});
window.addEventListener('dragover', (e) => {
  if (internalDrag || !hasFiles(e) || !feat('tabShelf')) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
});
window.addEventListener('dragleave', (e) => {
  if (!e.relatedTarget) endDrop();
});
window.addEventListener('drop', (e) => {
  e.preventDefault();
  const files = Array.from(e.dataTransfer.files || []);
  endDrop();
  if (internalDrag || !files.length) return;
  if (!bridge.shelf.addFiles(files)) showToast('dl-error', "Couldn't add these files to the shelf", '', 0, 3500);
});
document.addEventListener('pointermove', (e) => {
  if (internalDrag && e.buttons === 0) internalDrag = false;
});

// ---------------- timer ----------------
const RING = 276.46;

function setTimer(min, phase = null) {
  state.timer = { total: min * 60, remaining: min * 60, endAt: 0, running: false, phase };
  island.classList.toggle('focus-on', phase === 'focus');
  island.classList.toggle('break-on', phase === 'break');
  $$('[data-min]').forEach((b) => b.classList.toggle('sel', Number(b.dataset.min) === min));
  drawTimer();
  render();
}

function drawTimer() {
  const t = state.timer;
  const rem = t.running ? Math.max(0, (t.endAt - Date.now()) / 1000) : t.remaining;
  const text = fmt(Math.ceil(rem));
  $('#tm-digits').textContent = text;
  $('#c-time').textContent = $('#vc-time').textContent = text;
  $('#tm-ring').style.strokeDashoffset = t.total ? RING * (1 - rem / t.total) : RING;
  const started = t.remaining > 0 && t.remaining < t.total;
  $('#tm-start').textContent = t.running ? 'Pause' : started ? 'Resume' : 'Start';
  const label = t.phase === 'focus' ? `Focus ${focus.round + 1}` : t.phase === 'break' ? 'Break' : 'Running';
  $('#tm-state').textContent = t.running ? label : started ? 'Paused' : t.total ? 'Ready' : 'Pick a time';
  $('#tm-focus').classList.toggle('sel', !!t.phase);
  $('#tm-reset').disabled = !t.total;
  return rem;
}

// One AudioContext for every sound: Chromium limits how many can be open, so creating one
// per alert made sounds silently stop after a while.
let audioCtx = null;
function playTones(notes, { peak = 0.25, attack = 0.02, decay = 0.35, type = 'sine' } = {}) {
  try {
    audioCtx ||= new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t0 = audioCtx.currentTime;
    for (const [d, f] of notes) {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type;
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + d);
      g.gain.exponentialRampToValueAtTime(peak, t0 + d + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + decay);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0 + d);
      o.stop(t0 + d + decay + 0.05);
    }
  } catch {}
}

function beep() {
  playTones([[0, 880], [0.22, 1108], [0.44, 1318]], { peak: 0.25, decay: 0.35 });
}

$$('[data-min]').forEach((b) => b.addEventListener('click', () => setTimer(Number(b.dataset.min))));

$('#tm-start').addEventListener('click', () => {
  if (!state.timer.total) setTimer(5);
  const t = state.timer;
  if (t.running) {
    t.remaining = Math.max(0, (t.endAt - Date.now()) / 1000);
    t.running = false;
  } else if (t.remaining > 0) {
    t.endAt = Date.now() + t.remaining * 1000;
    t.running = true;
  }
  drawTimer();
  render();
});

// ---- focus sessions: focus, then a break that starts by itself (longer after every 4th) ----
const focus = { round: 0 };
function startPhase(phase) {
  const f = state.features;
  const min = phase === 'focus' ? f.focusMin || 25 : (focus.round % 4 === 0 ? f.longBreakMin || 15 : f.breakMin || 5);
  setTimer(min, phase);
  state.timer.endAt = Date.now() + state.timer.remaining * 1000;
  state.timer.running = true;
  drawTimer();
  render();
  // Nova puts her headband on and opens her laptop
  if (phase === 'focus' && feat('novaFocus')) {
    $('.sc-laptop-time').textContent = `${min}:00`;
    window.playScene?.({
      who: 'nova', props: ['band', 'laptop'], arms: 'type', tone: 'focus', badge: '🎯 Focus',
      title: 'Focus time',
      sub: `<b>${min} min</b> of deep work — reminders stay quiet until it ends`,
      ms: 6000,
    });
  }
}
// while focusing, reminders and other gentle interruptions wait
const focusing = () => state.timer.phase === 'focus' && timerActive();
$('#tm-focus').addEventListener('click', () => {
  if (state.timer.phase) return;
  focus.round = 0;
  startPhase('focus');
});

$('#tm-reset').addEventListener('click', () => {
  focus.round = 0;
  island.classList.remove('focus-on', 'break-on');
  state.timer = { total: 0, remaining: 0, endAt: 0, running: false };
  $$('[data-min]').forEach((b) => b.classList.remove('sel'));
  drawTimer();
  render();
});

setInterval(() => {
  if (!state.timer.running) return;
  const rem = drawTimer();
  if (rem <= 0 && state.timer.phase) {
    const wasFocus = state.timer.phase === 'focus';
    island.classList.add('alert');
    setTimeout(() => island.classList.remove('alert'), 1000);
    if (wasFocus) {
      focus.round++;
      startPhase('break');
      const brk = Math.round(state.timer.total / 60);
      const shown = feat('novaFocus') && window.playScene?.({
        who: 'nova', props: ['band'], arms: 'rest', tone: 'focus', badge: '🎯 Focus',
        title: 'Well done! 🎉',
        sub: `Focus session <b>${focus.round}</b> done · <b>${brk} min</b> break`,
        ms: 8000,
      });
      if (!shown) showToast('done', `Focus ${focus.round} done`, `Break ${brk} min`, 0, 4500);
      celebrate(['#ff6b6b', '#ffd479', '#ff9f0a']);
      playTones([[0, 784], [0.2, 988]], { peak: 0.2, decay: 0.6 });
    } else {
      setTimer(state.features.focusMin || 25, null);
      island.classList.remove('focus-on', 'break-on');
      showToast('done', 'Break over', 'Focus', 0, 9000);
      state.toastAction = () => startPhase('focus');
      beep();
    }
    return;
  }
  if (rem <= 0) {
    state.timer = { total: 0, remaining: 0, endAt: 0, running: false };
    $$('[data-min]').forEach((b) => b.classList.remove('sel'));
    drawTimer();
    showToast('done', 'Timer Done', '', 0, 4000);
    island.classList.add('alert');
    setTimeout(() => island.classList.remove('alert'), 1000);
    beep();
  }
}, 250);

// ---------------- settings ----------------
const TAB_FEATURE = { media: 'tabMedia', apps: 'tabApps', shelf: 'tabShelf', prayer: 'tabPrayer', timer: 'tabTimer', system: 'tabSystem' };

// Hide tabs that are switched off (Downloads shows itself only around download activity).
function refreshTabs() {
  let changed = false;
  $$('.tab').forEach((b) => {
    const t = b.dataset.tab;
    // Downloads shows itself around download activity, Radio only with its plugin
    const hide = t === 'downloads' ? !state.dl.tab : t === 'radio' ? !state.radioTab : !feat(TAB_FEATURE[t]);
    if (b.hidden !== hide) {
      b.hidden = hide;
      changed = true;
    }
  });
  if ($(`.tab[data-tab="${state.tab}"]`)?.hidden) {
    const first = [...$$('.tab')].find((b) => !b.hidden);
    if (first) selectTab(first.dataset.tab);
  } else if (changed) {
    placeSegThumb();
  }
}

function applyFeatures(f) {
  state.features = f || {};
  // performance options (or the battery saver): a solid island, and no movement
  document.body.classList.toggle('no-blur', state.features.noBlur === true);
  document.body.classList.toggle('no-anim', state.features.noAnimations === true);
  // the island's theme (themes.css); a theme without glass needs no backdrop
  document.body.dataset.theme = state.features.theme || 'original';
  document.body.classList.toggle('th-solid', !getComputedStyle(document.body).getPropertyValue('--th-glass').trim());
  $$('[data-feat]').forEach((el) => el.classList.toggle('off', !feat(el.dataset.feat)));
  if ($('.info-slide.on')?.classList.contains('off')) showSlide(0);
  refreshTabs();
  render();
  window.dispatchEvent(new CustomEvent('island:features', { detail: state.features }));
}
bridge.onFeatures(applyFeatures);
// a screen recorder is running (NVIDIA Instant Replay, OBS): a glass theme turns solid until it's gone
bridge.onRecording((on) => document.body.classList.toggle('th-rec', !!on));
bridge.onSaver((s) => showToast('saver', s.on ? 'Battery saver is on' : 'Battery saver is off', s.pct >= 0 ? `${s.pct}%` : '', 0, 3500));
bridge.onVisibility((v) => { state.visible = !!v; });
bridge.features().then(applyFeatures);
$('#open-settings').addEventListener('click', () => bridge.openSettings());

selectTab('media');
drawTimer();
render();
wake(1500);
