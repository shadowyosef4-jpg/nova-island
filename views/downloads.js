// IDM Nova downloads, plus browser downloads seen in the download folders (no size known, no
// pause): compact pill (ring + name + speed + %), a liquid progress line on the idle pill,
// start / done / failed toasts, and a live list with pause, resume, open and folder.
(() => {
  const view = $('#v-downloads');
  const list = $('#dl-list');
  const MOVING = ['downloading', 'processing'];
  const TAB_FOR_MS = 60 * 60 * 1000; // the tab stays for an hour after the last activity
  let lastSeen = 0;
  const ORDER = { downloading: 0, processing: 0, queued: 1, paused: 2, error: 3, completed: 4 };

  const ICONS = {
    pause: '<svg class="s" viewBox="0 0 24 24"><path d="M9 5v14M15 5v14"/></svg>',
    resume: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"/></svg>',
    open: '<svg class="s" viewBox="0 0 24 24"><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>',
    reveal: '<svg class="s" viewBox="0 0 24 24"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>',
  };
  const TITLES = { pause: 'Pause', resume: 'Resume', open: 'Open', reveal: 'Show in folder' };

  const TYPES = [
    [/^(mp4|mkv|webm|avi|mov|wmv|flv|m4v|ts)$/, 'video', 270],
    [/^(mp3|m4a|opus|ogg|wav|flac|aac|wma)$/, 'audio', 140],
    [/^(zip|rar|7z|tar|gz|xz|bz2|iso)$/, 'archive', 32],
    [/^(exe|msi|msix|appx|apk|bat|cmd)$/, 'app', 355],
    [/^(pdf|docx?|xlsx?|pptx?|txt|epub|csv)$/, 'doc', 212],
    [/^(png|jpe?g|gif|webp|svg|bmp|heic)$/, 'image', 320],
  ];
  const ext = (name) => (String(name).match(/\.([a-z0-9]{1,5})$/i)?.[1] || '').toLowerCase();
  const hueOf = (name) => (TYPES.find(([re]) => re.test(ext(name))) || [0, 'file', 230])[2];

  const bytes = (n) => {
    if (!(n >= 0)) return '—';
    if (n < 1024) return `${n} B`;
    if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
    if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
    return `${(n / 1024 ** 3).toFixed(2)} GB`;
  };
  const speedText = (n) => `${bytes(n)}/s`;
  const pctOf = (d) => (d.total > 0 ? Math.min(1, d.downloaded / d.total) : null);

  function meta(d) {
    const of = d.total > 0 ? `${bytes(d.downloaded)} of ${bytes(d.total)}` : bytes(d.downloaded);
    switch (d.status) {
      case 'processing': return 'Merging audio & video…';
      case 'queued': return 'Waiting in queue';
      case 'paused': return `Paused · ${of}`;
      case 'error': return `Failed${d.error ? ` · ${d.error}` : ''}`;
      case 'completed': return `${bytes(d.total || d.downloaded)} · Done`;
      default:
        if (d.stage === 'connecting' || d.stage === 'starting') return 'Connecting…';
        return [of, d.speed > 0 && speedText(d.speed), d.eta != null && `${fmt(d.eta)} left`].filter(Boolean).join(' · ');
    }
  }

  function actions(d) {
    if (d.source === 'folder') return d.status === 'completed' ? ['open', 'reveal'] : [];
    if (MOVING.includes(d.status) || d.status === 'queued') return ['pause'];
    if (d.status === 'paused' || d.status === 'error') return ['resume'];
    if (d.status === 'completed') return ['open', 'reveal'];
    return [];
  }

  // ---- list rows, updated in place so buttons don't flicker under the cursor ----
  // thumbnails arrive once (dl-thumb) keyed by their remote URL; progress updates carry the URL
  const thumbs = new Map();
  const thumbOf = (d) => (d.thumbnail?.startsWith('data:') ? d.thumbnail : thumbs.get(d.thumbnail) || '');
  let lastItems = [];

  const rows = new Map();
  function row(d) {
    let r = rows.get(d.id);
    if (!r) {
      r = document.createElement('div');
      r.className = 'dl-row';
      r.innerHTML = '<div class="dl-ico"></div><div class="dl-main"><div class="dl-name" dir="auto"></div>' +
        '<div class="dl-bar"><b></b></div><div class="dl-meta"></div></div><div class="dl-acts"></div>';
      r.querySelector('.dl-acts').addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (b) bridge.downloads.control(r.dataset.id, b.dataset.act);
      });
      r.dataset.id = d.id;
      rows.set(d.id, r);
    }
    r.className = `dl-row ${d.status}${d.status === 'processing' || (MOVING.includes(d.status) && pctOf(d) == null) ? ' busy' : ''}`;
    const ico = r.querySelector('.dl-ico');
    const thumb = thumbOf(d);
    const icoKey = thumb ? `t:${d.thumbnail.slice(-40)}` : `e:${d.name}`;
    if (ico.dataset.key !== icoKey) {
      ico.dataset.key = icoKey;
      ico.style.setProperty('--h', hueOf(d.name));
      ico.innerHTML = thumb ? `<img src="${thumb}" alt="">` : `<span>${esc(ext(d.name) || 'file')}</span>`;
    }
    const name = r.querySelector('.dl-name');
    if (name.textContent !== d.name) {
      name.textContent = d.name;
      name.title = d.name;
    }
    const pct = d.status === 'completed' ? 1 : pctOf(d);
    r.querySelector('.dl-bar b').style.width = `${Math.round((pct ?? 0) * 1000) / 10}%`;
    r.querySelector('.dl-meta').textContent = meta(d);
    const acts = actions(d);
    const key = acts.join();
    const box = r.querySelector('.dl-acts');
    if (box.dataset.key !== key) {
      box.dataset.key = key;
      box.innerHTML = acts.map((a) => `<button class="dl-btn" data-act="${a}" title="${TITLES[a]}" aria-label="${TITLES[a]}">${ICONS[a]}</button>`).join('');
    }
    return r;
  }

  function renderList(items) {
    const sorted = [...items].sort((a, b) => (ORDER[a.status] ?? 5) - (ORDER[b.status] ?? 5) || b.createdAt - a.createdAt);
    const ids = new Set(sorted.map((d) => d.id));
    for (const [id, r] of rows) {
      if (!ids.has(id)) {
        r.remove();
        rows.delete(id);
      }
    }
    const els = sorted.map(row);
    // re-append only when the order changed (moving nodes would reset :hover)
    if (els.some((el, i) => list.children[i] !== el)) els.forEach((el) => list.append(el));
  }

  // ---- toasts on transitions ----
  const known = new Map(); // id -> last status
  let primed = false; // the first list (and IDM Nova's first after it comes online) is history, not news
  let idmPrimed = false;
  function announce(items, idmOnline) {
    for (const d of items) {
      const prev = known.get(d.id);
      if ((d.source === 'folder' ? primed : idmPrimed) && feat('dlToasts')) {
        if (!prev && (MOVING.includes(d.status) || d.status === 'queued')) {
          showToast('dl-start', d.name, 'Downloading', 0, 2600);
        // a quick browser download may show up already finished
        } else if ((prev ? prev !== 'completed' : d.source === 'folder') && d.status === 'completed') {
          island.classList.add('dl-flash');
          setTimeout(() => island.classList.remove('dl-flash'), 4300);
          showToast('dl-done', d.name, 'Done', 1, 4200);
          note('✅', `Downloaded ${d.name}`);
          celebrate(['#30d158', '#40c8ff', '#ffd479']);
        } else if (prev && prev !== 'error' && d.status === 'error') {
          showToast('dl-error', d.name, 'Failed', 0, 4200);
          note('⚠️', `Download failed: ${d.name}`);
        }
      }
      known.set(d.id, d.status);
    }
    primed = true;
    idmPrimed = idmOnline;
  }

  // ---- pill: ring, name, speed, percent, liquid line ----
  function pill(items) {
    const moving = items.filter((d) => MOVING.includes(d.status));
    const sized = moving.filter((d) => d.total > 0);
    const total = sized.reduce((a, d) => a + d.total, 0);
    const done = sized.reduce((a, d) => a + Math.min(d.downloaded, d.total), 0);
    const pct = total > 0 && sized.length === moving.length ? done / total : null;
    const speed = moving.reduce((a, d) => a + (d.speed || 0), 0);
    const merging = moving.length > 0 && moving.every((d) => d.status === 'processing');

    state.dl = {
      active: moving.length > 0,
      title: moving.length ? `${moving[0].name}${moving.length > 1 ? `  +${moving.length - 1}` : ''}` : '',
    };
    const pctText = pct == null ? '' : `${Math.floor(pct * 100)}%`;
    $('#c-dl-pct').textContent = $('#vc-dl-pct').textContent = merging ? '' : pctText || '•••';
    $('#c-dl-speed').textContent = merging ? 'Merging' : speed > 0 ? speedText(speed) : '';
    const spin = merging || pct == null;
    $$('.c-ring').forEach((r) => {
      r.classList.toggle('spin', spin);
      r.style.setProperty('--p', spin ? 28 : Math.max(2, pct * 100));
    });
    island.classList.toggle('downloading', moving.length > 0);
    island.style.setProperty('--dlp', `${(pct ?? 0) * 100}%`);
    island.classList.toggle('dl-indet', spin);
    $('#dl-badge').classList.toggle('on', moving.length > 0);
    $('#dl-summary').textContent = moving.length
      ? `${moving.length} downloading${speed > 0 ? ` · ${speedText(speed)}` : ''}`
      : `${items.length} recent`;
  }

  function update(p) {
    for (const [url, data] of Object.entries(p?.thumbs || {})) thumbs.set(url, data);
    const items = p?.items || [];
    // IDM Nova went away: its downloads are forgotten, the folder ones stay
    if (!p?.online) for (const id of known.keys()) if (!id.startsWith('f:')) known.delete(id);
    view.classList.toggle('dl-offline', !items.length);
    $('#dl-empty-title').textContent = p?.outdated
      ? 'IDM Nova needs an update'
      : p?.online ? 'No active downloads' : 'IDM Nova is not running';
    $('#dl-empty-sub').textContent = p?.outdated
      ? 'This IDM Nova build can\'t share live progress yet. Install the latest build.'
      : p?.online
        ? 'Downloads from IDM Nova show up here live, with progress and speed.'
        : 'Start it and your downloads will show up here live.';
    $('#dl-launch').hidden = !p?.canLaunch;

    if (items.length) lastSeen = Date.now();
    announce(items, !!p?.online);
    pill(items);
    lastItems = items;
    renderList(items);
    showTab();
    render();
  }

  // Downloads tab: only while something is downloading or within an hour of the last download.
  function showTab() {
    const on = (feat('downloads') || feat('folderDownloads')) && (state.dl.active || (lastSeen > 0 && Date.now() - lastSeen < TAB_FOR_MS));
    if (on === state.dl.tab) return;
    state.dl.tab = on;
    refreshTabs();
  }
  setInterval(showTab, 60 * 1000);
  window.addEventListener('island:features', showTab);

  $('#dl-show').addEventListener('click', () => bridge.downloads.control('', 'show'));
  $('#dl-launch').addEventListener('click', () => bridge.downloads.control('', 'launch'));

  // opening the island from the download pill lands on the Downloads tab
  window.addEventListener('island:mode', (e) => {
    if (e.detail.mode === 'expanded' && e.detail.prev === 'compact' && compactKind() === 'dl') selectTab('downloads');
  });

  bridge.onDownloads(update);
  bridge.onDownloadThumb(({ url, data }) => {
    thumbs.set(url, data);
    renderList(lastItems);
  });
  bridge.downloads.snapshot().then(update);
})();
