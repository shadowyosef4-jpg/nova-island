// Stand-in for the preload bridge (window.nova) so the real island UI can be staged for
// promo shots. fire(name, data) delivers an event the way the main process would.
(() => {
  const cbs = {};
  const later = (v) => Promise.resolve(typeof v === 'function' ? v() : v);
  const svgIcon = (bg, glyph) => `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient></defs><rect width="64" height="64" rx="15" fill="url(#g)"/>${glyph}</svg>`)}`;
  const W = 'fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"';
  const APPS = [
    ['notes', 'Notes', ['#ffd65c', '#f5a623'], `<path ${W} d="M20 22h24M20 32h24M20 42h14"/>`],
    ['mail', 'Mail', ['#5ac8fa', '#1a7cf5'], `<rect x="15" y="20" width="34" height="24" rx="4" ${W}/><path ${W} d="m16 22 16 12 16-12"/>`],
    ['photos', 'Photos', ['#ff8a65', '#e8457c'], `<circle cx="32" cy="32" r="11" ${W}/><circle cx="32" cy="32" r="3" fill="#fff"/>`],
    ['music', 'Music', ['#ff5f7e', '#c3155d'], `<path ${W} d="M27 42V22l16-3v20"/><circle cx="23" cy="42" r="4" fill="#fff"/><circle cx="39" cy="39" r="4" fill="#fff"/>`],
    ['calendar', 'Calendar', ['#ffffff', '#e9e9ee'], `<text x="32" y="44" font-family="Segoe UI" font-size="26" font-weight="700" text-anchor="middle" fill="#e5383b">29</text>`],
    ['files', 'Files', ['#6ec6ff', '#2f80ed'], `<path ${W} d="M16 24h12l4 4h16v16H16z"/>`],
    ['browser', 'Browser', ['#7b61ff', '#3b82f6'], `<circle cx="32" cy="32" r="14" ${W}/><path ${W} d="M18 32h28M32 18c6 6 6 22 0 28M32 18c-6 6-6 22 0 28"/>`],
    ['chat', 'Chat', ['#34d399', '#059669'], `<path ${W} d="M18 22h28v18H28l-8 6v-6h-2z"/>`],
    ['code', 'Code', ['#3b4252', '#1f2430'], `<path ${W} d="m26 24-8 8 8 8M38 24l8 8-8 8"/>`],
    ['terminal', 'Terminal', ['#2b2b33', '#0f0f13'], `<path ${W} d="m20 24 8 8-8 8M32 42h12"/>`],
    ['maps', 'Maps', ['#86efac', '#16a34a'], `<path ${W} d="M32 46s-10-10-10-17a10 10 0 0 1 20 0c0 7-10 17-10 17z"/><circle cx="32" cy="29" r="3" fill="#fff"/>`],
    ['calc', 'Calculator', ['#fb923c', '#ea580c'], `<path ${W} d="M22 22h20M22 32h8M26 28v8M36 32h6M36 42h6M22 40l6 6M28 40l-6 6"/>`],
  ].map(([id, name, bg, g]) => ({ id, name, icon: svgIcon(bg, g) }));

  const fileIcon = (bg, label) => svgIcon(bg, `<text x="32" y="40" font-family="Segoe UI" font-size="15" font-weight="700" text-anchor="middle" fill="#fff">${label}</text>`);
  const SHELF = [
    { path: 'C:/Users/me/Desktop/Brand-Guide.pdf', name: 'Brand-Guide.pdf', icon: fileIcon(['#ff6b6b', '#c92a2a'], 'PDF') },
    { path: 'C:/Users/me/Desktop/Hero-Shot.png', name: 'Hero-Shot.png', icon: fileIcon(['#a78bfa', '#6d28d9'], 'PNG') },
    { path: 'C:/Users/me/Desktop/Q4-Report.xlsx', name: 'Q4-Report.xlsx', icon: fileIcon(['#4ade80', '#15803d'], 'XLS') },
    { path: 'C:/Users/me/Desktop/Pitch.pptx', name: 'Pitch.pptx', icon: fileIcon(['#fb923c', '#c2410c'], 'PPT') },
    { path: 'C:/Users/me/Desktop/Assets.zip', name: 'Assets.zip', icon: fileIcon(['#fbbf24', '#b45309'], 'ZIP') },
  ];

  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86400000);
  const PRAYER = {
    city: 'Giza',
    today: { date: ymd(today), times: { fajr: '05:38', sunrise: '07:05', dhuhr: '12:39', asr: '15:49', maghrib: '18:13', isha: '19:31' }, hijri: '16 جُمادى الأولى 1448', method: 'Egyptian General Authority of Survey' },
    tomorrow: { date: ymd(tomorrow), times: { fajr: '05:39', sunrise: '07:06', dhuhr: '12:39', asr: '15:48', maghrib: '18:12', isha: '19:30' }, hijri: '17 جُمادى الأولى 1448', method: 'Egyptian General Authority of Survey' },
  };
  const WEATHER = { city: 'Giza', temp: 24, code: 1, isDay: true, hi: 27, lo: 17 };
  const CLIPS = ['Meeting moved to 3:30 PM — same room', 'https://nova.app/launch', 'Nova Island makes Windows feel alive'];

  window.__mock = { APPS, SHELF, PRAYER, WEATHER, CLIPS, features: {} };
  const group = (impl) => new Proxy({}, { get: (_t, k) => (k in impl ? impl[k] : () => later(null)) });
  window.nova = new Proxy({
    apps: group({ list: () => later(APPS), all: () => later(APPS) }),
    shelf: group({ list: () => later(SHELF) }),
    system: group({ snapshot: () => later({ clips: CLIPS, weather: WEATHER }) }),
    downloads: group({ snapshot: () => later({ online: false, items: [] }) }),
    prayerSnapshot: () => later(PRAYER),
    features: () => later(() => window.__mock.features),
  }, {
    get: (t, k) => {
      if (k in t) return t[k];
      if (typeof k === 'string' && k.startsWith('on')) return (cb) => (cbs[k] ||= []).push(cb);
      return () => later(null);
    },
  });
  window.fire = (name, data) => (cbs[name] || []).forEach((cb) => cb(data));
})();
