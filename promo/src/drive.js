// Loaded after the island's scripts: puts the real island into one state for a promo shot.
// ?state=music|compact|downloads|dlpill|reminder|prayer|apps|system|shelf|volume|idle
// &bd=<backdrop image> &ax/&ay=<anchor> &v=1 (vertical) &side=left|right &rm=<reminder ref>
(async () => {
  const q = new URLSearchParams(location.search);
  const state = q.get('state') || 'idle';
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const b64 = async (url) => {
    const blob = await (await fetch(url)).blob();
    return new Promise((res) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.readAsDataURL(blob);
    });
  };

  fire('onAnchor', {
    x: Number(q.get('ax') || 320),
    y: Number(q.get('ay') || 8),
    docked: q.get('docked') === '1',
    vertical: q.get('v') === '1',
    side: q.get('side') || 'right',
  });
  if (q.get('bd')) fire('onBackdrop', q.get('bd'));
  if (q.get('theme')) applyFeatures({ ...state.features, theme: q.get('theme'), ...(q.get('clock') === '1' ? { slideStats: false, slidePrayer: false } : {}) });
  if (q.get('rec') === '1') document.body.classList.add('th-rec');
  fire('onStats', { cpu: 0.27, ram: 0.54, ramUsed: 8.6e9, ramTotal: 16e9 });
  fire('onWeather', window.__mock.WEATHER);
  fire('onClipboard', window.__mock.CLIPS);

  const cover = await b64('promo/src/assets/cover.png');
  const video = await b64('promo/src/assets/video.jpg');
  const media = (extra) => fire('onMedia', {
    has: true, playing: true, title: 'Golden Hour', artist: 'Nova Sessions', album: 'Lakeside',
    app: 'Nova Player', pos: 84, dur: 212, thumb: cover.split(',')[1], vol: 0.64, muted: false, bright: -1,
    fs: false, fgProc: 'explorer', fgTitle: 'Desktop', ...extra,
  });
  const items = [
    { id: 'a', name: 'Golden Hour — Live at the Lake (4K).mp4', kind: 'media', status: 'downloading', stage: 'downloading', downloaded: 712e6, total: 1148e6, speed: 8.6e6, eta: 51, createdAt: 4, thumbnail: video },
    { id: 'b', name: 'Linux-Workstation-24.04.iso', kind: 'http', status: 'downloading', stage: 'downloading', downloaded: 1.62e9, total: 5.8e9, speed: 11.2e6, eta: 373, createdAt: 3 },
    { id: 'c', name: 'Nova Sessions — Golden Hour.mp3', kind: 'media', status: 'completed', downloaded: 9.4e6, total: 9.4e6, createdAt: 2, thumbnail: cover },
    { id: 'd', name: 'Project-Assets.zip', kind: 'http', status: 'paused', downloaded: 220e6, total: 640e6, createdAt: 1 },
  ];
  const open = (tab) => {
    fire('onHover', true);
    selectTab(tab);
  };

  await wait(150);
  switch (state) {
    case 'music': media(); open('media'); break;
    case 'compact': media({ title: 'Golden Hour — Live at the Lake', app: 'chrome', fgProc: 'explorer', thumb: video.split(',')[1] }); break;
    case 'downloads':
      fire('onDownloads', { online: true, items: [] });
      fire('onDownloads', { online: true, items });
      await wait(3200); // let the "started" toast pass
      open('downloads');
      break;
    case 'dlpill':
      fire('onDownloads', { online: true, items: [] });
      fire('onDownloads', { online: true, items: [items[0]] });
      await wait(3200);
      break;
    case 'reminder': {
      const ref = q.get('rm');
      for (let i = 0; i < 200; i++) {
        fire('onReminderNow');
        if (!ref || $('#rm-ref').textContent === ref) break;
      }
      break;
    }
    case 'prayer':
      fire('onPrayer', window.__mock.PRAYER);
      await wait(1100);
      open('prayer');
      break;
    case 'apps': open('apps'); break;
    case 'system': open('system'); break;
    case 'shelf': open('shelf'); break;
    case 'volume': media(); showHud('vol', 0.64, false); break;
    case 'privacy':
      media({ title: 'Golden Hour — Live at the Lake', fgProc: 'explorer' });
      fire('onPrivacy', { mic: [], cam: [] });
      fire('onPrivacy', { mic: ['Teams'], cam: ['Teams'] });
      await wait(3600); // past the "is using" toast: dots on the pill
      break;
    case 'privacy-toast':
      fire('onPrivacy', { mic: [], cam: [] });
      fire('onPrivacy', { mic: ['Teams'], cam: [] });
      break;
    case 'kbd':
      fire('onMedia', { has: false, kl: 0x0409, caps: false, fgProc: 'notepad' });
      fire('onMedia', { has: false, kl: 0x0401, caps: false, fgProc: 'notepad' });
      break;
    case 'caps':
      fire('onMedia', { has: false, kl: 0x0409, caps: false, fgProc: 'notepad' });
      fire('onMedia', { has: false, kl: 0x0409, caps: true, fgProc: 'notepad' });
      break;
    case 'meet-now': {
      const t = Date.now() - 5000;
      fire('onCalendar', { events: [{ id: 'm1', title: 'Design review', start: t, end: t + 1800e3, link: 'https://meet.google.com/abc-defg-hij' }] });
      await wait(5600);
      break;
    }
    case 'focus':
      $('#tm-focus').click();
      break;
    case 'focus-tab':
      $('#tm-focus').click();
      open('timer');
      break;
    case 'ramadan':
    case 'ramadan-tab': {
      const P = window.__mock.PRAYER;
      const ram = (d) => ({ ...d, hijriMonth: 9, hijri: '14 رمضان 1448', times: { imsak: '04:12', ...d.times } });
      fire('onPrayer', { ...P, today: ram(P.today), tomorrow: ram(P.tomorrow) });
      await wait(1100);
      if (state === 'ramadan-tab') open('prayer');
      else showSlide([...$$('.info-slide')].filter((s) => !s.hidden && !s.classList.contains('off')).indexOf($('.rmd-slide')));
      break;
    }
    case 'radio':
    case 'radio-pill': {
      // Quran Radio (plugin), shown live (the stream itself doesn't play in the headless shot)
      fire('onPlugins', [{ id: 'quran-radio', kind: 'radio', name: 'Quran Radio', values: { station: 'cairo', volume: 70, pauseAtPrayer: false },
        stations: [{ id: 'cairo', name: 'إذاعة القرآن الكريم من القاهرة', url: 'https://stream.radiojar.com/8s5u5tpdtwzuv', group: 'إذاعات' }] }]);
      fire('onPrayer', window.__mock.PRAYER);
      await wait(300);
      $('#radio').classList.add('playing', 'live');
      $('#rd-eyebrow').textContent = 'بث مباشر';
      $('#rd-status').textContent = 'إذاعة رسمية';
      island.classList.add('radio-on');
      if (state === 'radio') open('radio');
      else {
        await wait(900);
        showSlide([...$$('.info-slide')].filter((s) => !s.hidden && !s.classList.contains('off')).indexOf($('.pr-slide')));
      }
      break;
    }
    case 'eyes':
      fire('onNear', { dx: 140, dy: 60 });
      break;
    case 'prayer-nova-card':
    case 'prayer-nova-pill': {
      // mock-up only: the Nova prayer call, card (A) and pill (B)
      const st = document.createElement('style');
      st.textContent = `
        .l-reminder.prayer-call { --rm-rgb: 255, 212, 121; }
        #island.reminder .l-reminder.prayer-call ~ * {}
        .pc { display: flex; flex-direction: column; align-items: center; gap: 6px; }
        .pc-face { position: relative; display: flex; gap: 16px; padding: 10px 22px; margin-bottom: 2px; }
        .pc-face::before { content: ""; position: absolute; inset: -6px -10px; border-radius: 50%; background: radial-gradient(closest-side, rgba(255, 212, 121, .28), transparent); }
        .pc-face i { position: relative; width: 15px; height: 21px; border-radius: 8px; background: #fff; box-shadow: 0 0 14px rgba(255, 255, 255, .45); }
        .pc-face i b { position: absolute; left: 50%; top: 42%; width: 8px; height: 9px; margin-left: -4px; border-radius: 50%; background: #0b0b12; }
        .pc-title { font-family: "Nova Quran", serif; font-size: 34px; line-height: 1.2; color: #fff; text-shadow: 0 0 18px rgba(255, 212, 121, .45); }
        .pc-sub { font-size: 15px; color: var(--text-2); }
        .pc-sub b { color: #ffd479; font-weight: 700; }
        .pc-time { display: inline-block; margin-inline-start: 6px; padding: 1px 10px; border-radius: 99px; background: rgba(255, 212, 121, .16); color: #ffd479; font-weight: 700; font-size: 13px; direction: ltr; }
        .l-toast.prayer-pill .t-left { gap: 10px; }
        .pf { display: inline-flex; gap: 5px; flex: none; }
        .pf i { width: 7px; height: 10px; border-radius: 4px; background: #fff; box-shadow: 0 0 6px rgba(255,255,255,.5); position: relative; }
        .pf i b { position: absolute; left: 50%; top: 45%; width: 4px; height: 4px; margin-left: -2px; border-radius: 50%; background: #0b0b12; }
        .l-toast.prayer-pill #t-label { color: #fff; font-weight: 600; }
        .l-toast.prayer-pill #t-value { color: #ffd479; }
        #island.toast.pp-glow .glow { opacity: 1; background: radial-gradient(120% 140% at 50% 0%, rgba(255, 212, 121, .35), transparent 65%); }
      `;
      document.head.append(st);
      if (state === 'prayer-nova-card') {
        showCard({
          kind: 'prayer-call', badge: 'الأذان',
          html: '<span class="pc"><span class="pc-face"><i><b></b></i><i><b></b></i></span>'
            + '<span class="pc-title">أَقِمْ صَلَاتَكَ</span>'
            + '<span class="pc-sub">حان الآن وقت صلاة <b>العصر</b><span class="pc-time">3:49 PM</span></span></span>',
          ref: 'الجيزة', ms: 60000,
        });
      } else {
        showToast('prayer-pill', 'أقم صلاتك · حان الآن وقت العصر', '3:49 PM', 0, 60000);
        const left = document.querySelector('.l-toast .t-left');
        const f = document.createElement('span');
        f.className = 'pf';
        f.innerHTML = '<i><b></b></i><i><b></b></i>';
        left.prepend(f);
        island.classList.add('pp-glow');
      }
      break;
    }
    case 'addr-idle':
    case 'addr-media':
    case 'addr-line':
      fire('onAnchor', { x: 320, y: 8, docked: false, vertical: false, side: 'right', addr: state === 'addr-line' ? 'line' : 'slim', sw: 360, sh: 30 });
      if (state === 'addr-media') media({ title: 'Golden Hour — Live at the Lake', fgProc: 'explorer' });
      break;
    case 'scene-prayer':
      playScene({ who: 'nova', props: ['cap', 'rug'], arms: 'fold', tone: 'gold', badge: '☾ الأذان', lang: 'ar', title: 'أَقِمْ صَلَاتَكَ', quran: true, sub: 'حان الآن وقت صلاة <b>العصر</b><bdi dir="ltr">3:49 PM</bdi>', ms: 60000 });
      break;
    case 'scene-water':
      playScene({ who: 'drop', props: ['glass'], arms: 'hold', tone: 'water', badge: '💧 Water', title: 'Drink a glass of water', sub: '<b>3</b> of 8 glasses today', ms: 60000, button: { label: 'I drank ✓', onClick: () => {} } });
      break;
    case 'scene-focus':
      $('.sc-laptop-time').textContent = '25:00';
      playScene({ who: 'nova', props: ['band', 'laptop'], arms: 'type', tone: 'focus', badge: '🎯 Focus', title: 'Focus time', sub: '<b>25 min</b> of deep work — reminders stay quiet until it ends', ms: 60000 });
      break;
    case 'scene-focus-end':
      playScene({ who: 'nova', props: ['band'], arms: 'rest', tone: 'focus', badge: '🎯 Focus', title: 'Well done! 🎉', sub: 'Focus session <b>1</b> done · <b>5 min</b> break', ms: 60000 });
      break;
    case 'welcome':
      note('✅', 'Downloaded Golden Hour — Live at the Lake (4K).mp4');
      note('🕌', 'أذان الظهر 12:39 PM');
      note('📶', 'Back online after 3 min');
      fire('onMedia', { has: false, idle: 1500 });
      await wait(200);
      fire('onMedia', { has: false, idle: 0 });
      break;
    case 'care':
      showCard({ kind: 'care', badge: 'Break', html: '<span class="big">Rest your eyes 🌿</span><span class="ln">Look at something 20 feet away for 20 seconds — the 20-20-20 rule.</span>', ref: '', ms: 15000 });
      break;
    case 'net-off':
      fire('onNetwork', { link: 'ethernet', internet: true, prev: { link: 'none', internet: null } });
      fire('onNetwork', { link: 'ethernet', internet: false, prev: { link: 'ethernet', internet: true } });
      break;
    case 'clip-url':
      fire('onDownloads', { online: true, items: [] });
      fire('onClipSmart', { type: 'url', url: 'https://www.youtube.com/watch?v=golden', host: 'youtube.com' });
      break;
    case 'clip-math':
      fire('onClipSmart', { type: 'math', expr: '(1500 - 200) × 15%', result: '195' });
      break;
    case 'clip-color':
      fire('onClipSmart', { type: 'color', color: '#ff6b6b' });
      break;
    case 'celebrate':
      celebrate();
      break;
    case 'update':
      fire('onUpdate', { version: '1.4.0' });
      break;
    case 'updating':
      fire('onUpdate', { version: '1.4.0' });
      await wait(300);
      island.click(); // "Update now"
      break;
    case 'shot':
    case 'shot-auto':
      fire('onScreenshot', { thumb: video, width: 1600, height: 900, auto: state === 'shot-auto' });
      break;
    case 'meet-slide': {
      const t = Date.now() + 25 * 60e3;
      fire('onCalendar', { events: [{ id: 'm2', title: 'Design review', start: t, end: t + 1800e3, link: '' }] });
      await wait(400);
      showSlide([...$$('.info-slide')].filter((s) => !s.hidden && !s.classList.contains('off')).indexOf($('.mt-slide')));
      break;
    }
    default: break;
  }
  await wait(1200);
  document.documentElement.dataset.ready = '1';
})();
