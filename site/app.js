// Nova Island site: the live island, reveals on scroll, Nova's eyes, themes, the numbers, and
// download links that always point at the latest release.
(() => {
  // The Store listing: set STORE_ID to the app's Store ID (Partner Center > Product identity) and
  // every Store button opens the listing; until then they open a Store search for Nova Island.
  const STORE_ID = '9PHV3N1V2H7M';
  const REPO = 'NOVA-TECH-KIT/nova-island';
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  if (STORE_ID) $$('[data-store]').forEach((a) => (a.href = `https://apps.microsoft.com/detail/${STORE_ID}`));

  // one call to GitHub: the newest release for the download links (its installer, version and
  // size), and every release's installer downloads added up for the count. GitHub counts each
  // download of the file, so the total includes the updates older versions download by themselves.
  const installer = (rel) => (rel.assets || []).find((a) => /Setup.*\.exe$/i.test(a.name));
  fetch(`https://api.github.com/repos/${REPO}/releases?per_page=100`)
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((list) => {
      const releases = list.filter((r) => !r.draft && !r.prerelease);
      const latest = releases.find(installer);
      if (latest) {
        const exe = installer(latest);
        const mb = exe.size / 1048576;
        $$('[data-download]').forEach((a) => (a.href = exe.browser_download_url));
        $$('[data-size]').forEach((s) => (s.textContent = `· ${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`));
        $$('[data-version]').forEach((s) => (s.textContent = `Version ${String(latest.tag_name).replace(/^v/, '')}`));
      }
      const total = releases.reduce((n, r) => n + (installer(r)?.download_count || 0), 0);
      if (total > 0) {
        $$('[data-dl-count]').forEach((el) => {
          $('b', el).textContent = total.toLocaleString('en-US');
          el.hidden = false;
        });
      }
    })
    .catch(() => {}); // the links keep pointing at the releases page, and the count stays hidden

  // a link to a section (the README's #download): go there as soon as the layout is ready, and
  // again once the fonts are in, instead of waiting for the browser's own late jump
  const jump = () => {
    const t = location.hash.length > 1 && document.getElementById(location.hash.slice(1));
    if (t) t.scrollIntoView({ behavior: 'instant', block: 'start' });
  };
  if (location.hash.length > 1 && !location.search.includes('shots')) {
    requestAnimationFrame(jump);
    document.fonts?.ready.then(jump);
    addEventListener('load', jump, { once: true });
  }

  // nav: a stronger glass once the page moves
  const nav = $('#nav');
  addEventListener('scroll', () => nav.classList.toggle('scrolled', scrollY > 20), { passive: true });

  // reveal on scroll (and count the numbers up)
  const count = (el) => {
    const to = Number(el.dataset.count);
    if (still) return (el.textContent = to);
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 1200);
      el.textContent = Math.round(to * (1 - Math.pow(1 - k, 4)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('in');
      $$('[data-count]', e.target).forEach(count);
      io.unobserve(e.target);
    }
  }, { threshold: 0.18, rootMargin: '0px 0px -40px 0px' });
  $$('.reveal').forEach((el) => io.observe(el));
  // ?shots: everything shown at once (for page screenshots)
  if (location.search.includes('shots')) {
    document.documentElement.classList.add('shots');
    $$('.reveal').forEach((el) => { el.classList.add('in'); $$('[data-count]', el).forEach(count); });
    const target = location.hash && $(location.hash);
    if (target) requestAnimationFrame(() => target.scrollIntoView({ behavior: 'instant', block: 'start' }));
  }

  // the hero island: music, a message, prayer, a download, resting; click a state to see it
  const island = $('#hero-island');
  const order = ['music', 'note', 'prayer', 'dl', 'clock'];
  const tabs = $$('.states button');
  let at = 0;
  let timer = null;
  const show = (state) => {
    island.dataset.state = state;
    tabs.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.to === state)));
    at = order.indexOf(state);
  };
  const next = () => show(order[(at + 1) % order.length]);
  // ?shots holds a state still (?shots&state=note) for page screenshots
  const shotState = new URLSearchParams(location.search).get('state');
  const play = () => { clearInterval(timer); if (!still && !location.search.includes('shots')) timer = setInterval(next, 3400); };
  tabs.forEach((b) => b.addEventListener('click', () => { show(b.dataset.to); play(); }));
  const stage = $('.stage');
  stage.addEventListener('mouseenter', () => clearInterval(timer));
  stage.addEventListener('mouseleave', play);
  show(order.includes(shotState) ? shotState : 'music');
  play();

  // the prayer countdown ticks
  const cd = $('#cd');
  let left = 12 * 60 + 30;
  setInterval(() => {
    left = left > 0 ? left - 1 : 12 * 60 + 30;
    cd.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  }, 1000);

  // messages: one notification after another, each in its app's colour
  const notes = [
    { c: '42, 171, 238', who: 'Sara', text: 'Are we still on for tonight?', icon: '<path d="M21 4 3 11l6 2 2 6 3-4 5 4z"/>' },
    { c: '37, 211, 102', who: 'Mom', text: 'Call me when you’re free', icon: '<path d="M21 12a9 9 0 0 1-13.4 7.9L3 21l1.1-4.6A9 9 0 1 1 21 12z"/>' },
    { c: '96, 165, 250', who: 'Team', text: 'Design review moved to 4 PM', icon: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>' },
    { c: '244, 114, 182', who: 'Omar', text: 'Sent you the photos from today', icon: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/>' },
  ];
  const noteIsland = $('#note-island');
  let ni = 0;
  const setNote = (n) => {
    const face = $('.face', noteIsland);
    face.style.background = `radial-gradient(130% 220% at 0% 50%, rgba(${n.c}, .42), transparent 62%)`;
    face.innerHTML = `<span class="ico" style="--c: ${n.c}"><svg viewBox="0 0 24 24">${n.icon}</svg></span><span class="msg"><b>${n.who}</b> ${n.text}</span><span class="open" style="background: rgba(${n.c}, .95)">Open</span>`;
  };
  setNote(notes[0]);
  if (!still) {
    setInterval(() => {
      noteIsland.classList.add('swap');
      setTimeout(() => { ni = (ni + 1) % notes.length; setNote(notes[ni]); noteIsland.classList.remove('swap'); }, 320);
    }, 2800);
  }

  // Nova's eyes follow the cursor
  const pupils = $$('.eyes b'); // the logo in the header and the big Nova card
  if (!still) {
    addEventListener('pointermove', (e) => {
      for (const p of pupils) {
        const r = p.parentElement.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        const k = Math.min(1, Math.hypot(dx, dy) / 300);
        const a = Math.atan2(dy, dx);
        // a pupil goes at most a quarter of its eye's width
        const reach = r.width / 4;
        p.style.transform = `translate(${Math.cos(a) * reach * k}px, ${Math.sin(a) * reach * k}px)`;
      }
    }, { passive: true });
  }

  // themes: the island changes its look
  const themeIsland = $('#theme-island');
  $$('.swatches button').forEach((b) => b.addEventListener('click', () => {
    themeIsland.dataset.theme = b.dataset.theme;
    $$('.swatches button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
  }));

  // screenshots tilt a little toward the cursor
  if (!still && matchMedia('(hover: hover)').matches) {
    $$('.tilt').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = `perspective(1200px) rotateY(${x * 6}deg) rotateX(${-y * 6}deg) scale(1.01)`;
      });
      el.addEventListener('pointerleave', () => (el.style.transform = ''));
    });
  }
})();
