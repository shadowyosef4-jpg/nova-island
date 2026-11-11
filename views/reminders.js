// Dhikr, du'a and Qur'an reminders: every N minutes a large card for N seconds (Settings).
// Hovering the card pauses its countdown; it waits while the island is open or a toast shows.
(() => {
  const layer = $('.l-reminder');
  const textEl = $('#rm-text');
  const bar = $('.rm-time b');
  const KIND_NAME = { ayah: 'آية', dhikr: 'ذكر', dua: 'دعاء' };
  const KIND_FEATURE = { ayah: 'remindAyah', dhikr: 'remindDhikr', dua: 'remindDua' };
  const WIDTH = 500;
  const V_WIDTH = 340; // docked to a side edge
  const MAX_H = 270;

  const everyMs = () => (state.features.remindEvery || 5) * 60000;
  // quiet hours may wrap past midnight (23:00 -> 07:00)
  function inQuietHours() {
    const f = state.features;
    if (!f.quietHours) return false;
    const d = new Date();
    const m = d.getHours() * 60 + d.getMinutes();
    const from = f.quietFrom ?? 1380;
    const to = f.quietTo ?? 420;
    return from <= to ? m >= from && m < to : m >= from || m < to;
  }
  const showMs = () => (state.features.remindFor || 30) * 1000;

  // shuffled bag so nothing repeats until every text has been shown once
  let bag = [];
  let last = null;
  function draw() {
    let pool = REMINDERS.filter((r) => feat(KIND_FEATURE[r.kind]));
    if (!pool.length) pool = REMINDERS;
    bag = bag.filter((r) => pool.includes(r));
    if (!bag.length) {
      bag = [...pool].sort(() => Math.random() - 0.5);
      if (bag.length > 1 && bag[0] === last) bag.push(bag.shift());
    }
    last = bag.shift();
    return last;
  }

  // verses get ornate brackets; one inline block so they wrap with the words
  // the Qur'an font draws «،» like a verse-end circle, so commas use the UI font
  const body = (text) => esc(text).replace(/،/g, '<i class="sep">،</i>');
  // a verse number ("٢٨") becomes the verse-end ornament: the Qur'an font draws U+06DD followed
  // by the number as one ornament with the number inside
  const ayahEnds = (html) => html.replace(/(^|\s)([٠-٩]{1,3})(?=\s|$)/g, (_m, sp, n) =>
    `${sp}<i class="an">۝${n}</i>`);
  const isQuran = (item) => item.kind === 'ayah' || item.quran;
  const words = (item) => (isQuran(item)
    ? `<span><i class="br">﴿</i>${ayahEnds(body(item.text))}<i class="br">﴾</i></span>`
    : `<span>${body(item.text)}</span>`);

  // size the card to its text
  const measure = document.createElement('div');
  measure.className = 'rm-text rm-measure';
  measure.dir = 'rtl';
  document.body.append(measure);
  // companion cards bring their own (escaped) HTML and use the UI font
  const content = (item) => item.html ?? words(item);
  function fit(item) {
    if (item.html != null) {
      const w = anchor.vertical ? V_WIDTH : WIDTH;
      measure.classList.add('ui');
      measure.style.width = `${w - 44}px`;
      measure.innerHTML = item.html;
      const h = Math.min(MAX_H, Math.ceil(measure.scrollHeight) + 82);
      measure.classList.remove('ui');
      state.reminderSize = [w, h];
      island.style.setProperty('--rw', `${w}px`);
      island.style.setProperty('--rh', `${h}px`);
      return;
    }
    // diacritics and Qur'anic marks (U+064B–065F, U+0670, U+06D6–06ED) add characters but no width
    const len = item.text.replace(/[ً-ٰٟۖ-ۭ]/g, '').length;
    let fs = len <= 40 ? 30 : len <= 80 ? 26 : 23;
    const w = anchor.vertical ? V_WIDTH : WIDTH;
    measure.style.width = `${w - 44}px`;
    measure.innerHTML = words(item);
    // long texts (سيد الاستغفار) step the font down until they fit under MAX_H
    // padding 12 + head 24 + gaps 12 + ref 16 + bottom 16
    for (;;) {
      measure.style.setProperty('--rm-fs', `${fs}px`);
      if (fs <= 17 || measure.scrollHeight + 82 <= MAX_H) break;
      fs -= 2;
    }
    layer.style.setProperty('--rm-fs', `${fs}px`);
    const h = Math.min(MAX_H, Math.ceil(measure.scrollHeight) + 82);
    state.reminderSize = [w, h];
    island.style.setProperty('--rw', `${w}px`);
    island.style.setProperty('--rh', `${h}px`);
  }

  let total = 0;
  let nextAt = 0;
  let nextEvery = null; // the interval nextAt was counted with
  function schedule() {
    nextEvery = state.features.remindEvery;
    nextAt = Date.now() + everyMs();
  }
  let lastTick = Date.now();

  const FONT = '26px "Nova Quran"';
  const loadFonts = () => document.fonts.load(FONT);
  let fontReady = false;
  loadFonts().then(() => { fontReady = true; });

  function show(item) {
    layer.className = `layer l-reminder ${item.kind}`;
    const english = item.html != null;
    layer.dir = measure.dir = english ? 'ltr' : 'rtl';
    layer.lang = english ? 'en' : 'ar';
    $('#rm-kind').textContent = item.badge || KIND_NAME[item.kind] || '';
    textEl.innerHTML = content(item);
    textEl.classList.toggle('ui', item.html != null);
    $('#rm-ref').textContent = item.ref || '';
    fit(item);
    // first card before the Qur'an font finished loading: measure again once it has
    if (!fontReady) loadFonts().then(() => { fit(item); positionIsland(); });
    total = item.ms || showMs();
    state.reminderUntil = Date.now() + total;
    bar.style.width = '100%';
    render();
    positionIsland();
  }

  function hide() {
    state.reminderUntil = 0;
    state.hover = false; // don't spring open under the cursor when the card leaves
    schedule();
    render();
  }

  function tick() {
    const now = Date.now();
    const dt = now - lastTick;
    lastTick = now;
    if (state.reminderUntil) {
      if (!feat('reminders') && !previewing) return hide();
      const reading = state.hover && lastMode === 'reminder';
      layer.classList.toggle('paused', reading);
      if (reading) state.reminderUntil += dt;
      if (now >= state.reminderUntil) {
        previewing = false;
        return hide();
      }
      bar.style.width = `${Math.max(0, (state.reminderUntil - now) / total) * 100}%`;
      return;
    }
    if (!feat('reminders')) return;
    if (!nextAt) schedule();
    if (now < nextAt) return;
    // wait for a calm moment: not while hidden, open, being dragged or showing a toast
    if (focusing() || inQuietHours()) return;
    if (window.sceneShowing?.()) return;
    if (!state.visible || lastMode === 'expanded' || state.pinned || state.moving || (state.toast && now < state.toastUntil)) return;
    show(draw());
  }
  setInterval(tick, 250);

  $('#rm-close').addEventListener('click', (e) => {
    e.stopPropagation();
    previewing = false;
    hide();
  });

  // a new interval counts from now
  window.addEventListener('island:features', () => {
    if (nextAt && !state.reminderUntil && state.features.remindEvery !== nextEvery) schedule();
  });

  // other views open the big card for their own messages (welcome back, morning, breaks)
  window.showCard = (item) => {
    previewing = true; // independent of the reminders switch
    show(item);
  };
  window.cardShowing = () => state.reminderUntil > Date.now();

  // "show one now" from the Settings window works even with reminders switched off
  let previewing = false;
  bridge.onReminderNow(() => {
    previewing = true;
    show(draw());
  });
})();
