// Quran Radio (a plugin): live Qur'an stations played by the island itself, so they keep going
// in the background. Nothing of it shows until the plugin is installed and on. It has its own
// Radio tab (station, live, stop, volume, the station list) and a button in the Prayer tab. The
// collapsed island stays as it is; a small radio with waves sits by the prayer countdown. A dropped
// stream reconnects by itself (a short stall is waited out first); "Pause at prayer time" stops it
// when the prayer comes in.
(() => {
  const RETRY_S = [2, 5, 15];
  const STALL_MS = 10000; // a live stream often pauses for a moment and goes on by itself
  const card = $('#radio');
  const prBtn = $('#pr-radio');
  const picker = $('#rd-picker');
  const listEl = $('#rd-list');
  const search = $('#rd-search');
  const audio = new Audio();
  audio.preload = 'none';

  let plugin = null; // { id, stations, values }
  let station = null;
  let want = false; // the user wants it playing
  let live = false;
  let fails = 0;
  let retryTimer = null;
  let stallTimer = null;

  const status = (t) => { $('#rd-status').textContent = t; };
  const showVol = (v) => { $('#rd-vol-pct').textContent = `${Math.round(v * 100)}%`; };
  // the line above the name: live while it plays, the station's kind otherwise
  const eyebrow = () => { $('#rd-eyebrow').textContent = want && live ? 'بث مباشر' : station?.group || 'راديو القرآن'; };

  function sync() {
    state.radio = { on: want, name: station?.name || '' };
    card.classList.toggle('playing', want);
    card.classList.toggle('live', want && live);
    eyebrow();
    prBtn.classList.toggle('on', want);
    island.classList.toggle('radio-on', want);
    render();
  }

  function stopAudio() {
    clearTimeout(retryTimer);
    clearTimeout(stallTimer);
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    live = false;
  }

  function connect() {
    if (!want || !station) return;
    clearTimeout(retryTimer);
    live = false;
    status(fails ? 'Reconnecting…' : 'جارٍ الاتصال…');
    audio.src = station.url;
    audio.volume = Math.min(1, Math.max(0, (plugin.values.volume ?? 80) / 100));
    audio.play().catch(() => {});
    sync();
  }

  function play() {
    if (!station) return;
    want = true;
    fails = 0;
    connect();
  }

  function stop(text = 'متوقفة') {
    want = false;
    stopAudio();
    status(text);
    sync();
  }

  // the stream dropped (no internet, the station restarted): try again, a little later each time
  function dropped() {
    clearTimeout(stallTimer);
    if (!want) return;
    live = false;
    const wait = RETRY_S[Math.min(fails, RETRY_S.length - 1)];
    fails++;
    status('Reconnecting…');
    sync();
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, wait * 1000);
  }

  audio.addEventListener('playing', () => {
    clearTimeout(stallTimer);
    fails = 0;
    live = true;
    status(station?.group === 'القرّاء' ? 'تلاوات متواصلة' : 'إذاعة رسمية');
    sync();
  });
  // an error or the end of the stream: reconnect; a stall: only if it hasn't gone on in 10 s
  ['error', 'ended'].forEach((ev) => audio.addEventListener(ev, () => {
    if (want && audio.getAttribute('src')) dropped();
  }));
  ['waiting', 'stalled'].forEach((ev) => audio.addEventListener(ev, () => {
    if (!want || !audio.getAttribute('src')) return;
    if (live) status('جارٍ التحميل…');
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => { if (want && (audio.paused || audio.readyState < 3)) dropped(); }, STALL_MS);
  }));
  audio.addEventListener('timeupdate', () => {
    if (!stallTimer || audio.readyState < 3) return;
    clearTimeout(stallTimer);
    stallTimer = null;
    if (live) status(station?.group === 'القرّاء' ? 'تلاوات متواصلة' : 'إذاعة رسمية');
  });
  // back online: no need to wait for the next try
  bridge.onNetwork((n) => {
    if (want && !live && n.internet) connect();
  });

  // ---------- controls ----------
  $('#rd-play').addEventListener('click', () => (want ? stop() : play()));
  prBtn.addEventListener('click', () => (want ? stop() : play()));

  const vol = makeSlider($('#rd-vol'), {
    onInput: (v) => {
      audio.volume = v;
      showVol(v);
    },
    onCommit: (v) => {
      if (!plugin) return;
      plugin.values.volume = Math.round(v * 100);
      bridge.pluginSet(plugin.id, 'volume', plugin.values.volume);
    },
  });

  function choose(id) {
    const next = plugin?.stations.find((s) => s.id === id);
    if (!next) return;
    station = next;
    $('#rd-name').textContent = station.name;
    bridge.pluginSet(plugin.id, 'station', id);
    closePicker();
    play();
  }

  function renderList() {
    const q = search.value.trim();
    let group = null;
    listEl.innerHTML = '';
    for (const s of plugin?.stations || []) {
      if (q && !s.name.includes(q)) continue;
      if (!q && s.group !== group) {
        group = s.group;
        if (group) {
          const g = document.createElement('div');
          g.className = 'rd-group';
          g.textContent = group;
          listEl.append(g);
        }
      }
      const b = document.createElement('button');
      b.className = `pick${s.id === station?.id ? ' sel' : ''}`;
      b.innerHTML = '<span></span>';
      b.querySelector('span').textContent = s.name;
      b.addEventListener('click', () => choose(s.id));
      listEl.append(b);
    }
  }
  function openPicker() {
    picker.hidden = false;
    search.value = '';
    renderList();
    bridge.focusInput(true);
    setTimeout(() => search.focus(), 60);
  }
  function closePicker() {
    if (picker.hidden) return;
    picker.hidden = true;
    bridge.focusInput(false);
  }
  $('#rd-pick').addEventListener('click', openPicker);
  $('#rd-done').addEventListener('click', closePicker);
  search.addEventListener('input', renderList);
  search.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePicker(); });
  window.addEventListener('island:mode', (e) => { if (e.detail.mode !== 'expanded') closePicker(); });

  // the prayer came in: stop, if the user asked for it
  window.addEventListener('island:adhan', () => {
    if (want && plugin?.values.pauseAtPrayer) stop('متوقفة لوقت الصلاة');
  });

  // ---------- the plugin: installed, switched on/off, its settings ----------
  function apply(list) {
    const p = (list || []).find((x) => x.kind === 'radio') || null;
    plugin = p;
    card.hidden = !p;
    prBtn.hidden = !p;
    if (state.radioTab !== !!p) {
      state.radioTab = !!p;
      refreshTabs();
    }
    if (!p) {
      if (want) stop();
      station = null;
      closePicker();
      sync();
      return;
    }
    const next = p.stations.find((s) => s.id === p.values.station) || p.stations[0];
    const changed = next.id !== station?.id;
    station = next;
    $('#rd-name').textContent = station.name;
    if (!vol.dragging) {
      vol.set((p.values.volume ?? 80) / 100);
      showVol((p.values.volume ?? 80) / 100);
    }
    audio.volume = (p.values.volume ?? 80) / 100;
    if (changed && want) connect();
    if (!want) status('اضغط للتشغيل');
    if (!picker.hidden) renderList();
    sync();
  }
  bridge.onPlugins(apply);
  bridge.plugins().then(apply);
})();
