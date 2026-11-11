// System tab: weather (also in the header), CPU / memory meters, clipboard history.
(() => {
  const CLOUD = '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>';
  const CLOUD_TOP = '<path d="M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24"/>';
  const WX = {
    sun: { label: 'Clear', svg: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>' },
    moon: { label: 'Clear', svg: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>' },
    partly: { label: 'Partly Cloudy', svg: '<path d="M12 2v2M4.9 4.9l1.4 1.4M20 12h2M19.1 4.9l-1.4 1.4M15.95 12.65a4 4 0 0 0-5.93-4.13"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/>' },
    cloud: { label: 'Cloudy', svg: CLOUD },
    fog: { label: 'Fog', svg: `${CLOUD_TOP}<path d="M16 17H7M17 21H9"/>` },
    rain: { label: 'Rain', svg: `${CLOUD_TOP}<path d="M16 14v6M8 14v6M12 16v6"/>` },
    snow: { label: 'Snow', svg: `${CLOUD_TOP}<path d="M8 15h.01M8 19h.01M12 17h.01M12 21h.01M16 15h.01M16 19h.01"/>` },
    storm: { label: 'Thunderstorm', svg: '<path d="M6 16.33A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.97"/><path d="m13 12-3 5h4l-3 5"/>' },
  };

  function wxKind(code, isDay) {
    if (code === 0) return isDay ? 'sun' : 'moon';
    if (code <= 2) return isDay ? 'partly' : 'cloud';
    if (code === 3) return 'cloud';
    if (code === 45 || code === 48) return 'fog';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
    if (code >= 95) return 'storm';
    return 'rain';
  }

  function renderWeather(w) {
    if (!w) return;
    const kind = wxKind(w.code, w.isDay);
    const info = WX[kind];
    const card = $('#wx-card');
    card.classList.toggle('night', !w.isDay);
    card.classList.toggle('cloudy', ['cloud', 'fog', 'rain', 'snow', 'storm'].includes(kind));
    $('#wx-ico').innerHTML = info.svg;
    $('#wx-temp').textContent = `${w.temp}°`;
    $('#wx-desc').textContent = info.label;
    $('#wx-meta').textContent = `${w.city ? `${w.city} · ` : ''}H ${w.hi}° L ${w.lo}°`;
    const mini = $('#wx-mini');
    mini.hidden = false;
    mini.querySelector('svg').innerHTML = info.svg;
    mini.querySelector('b').textContent = `${w.temp}°`;
    mini.title = `${info.label}${w.city ? ` in ${w.city}` : ''}`;
    for (const pill of [$('#i-wx'), $('#v-wx')]) {
      pill.hidden = false;
      pill.querySelector('svg').innerHTML = info.svg;
      pill.querySelector('b').textContent = `${w.temp}°`;
    }
  }

  function meter(bar, val, v) {
    const pct = Math.round(v * 100);
    bar.style.width = `${pct}%`;
    bar.classList.toggle('warn', v >= 0.7 && v < 0.9);
    bar.classList.toggle('hot', v >= 0.9);
    val.textContent = `${pct}%`;
  }

  bridge.onStats((s) => {
    meter($('#cpu-bar'), $('#cpu-val'), s.cpu);
    meter($('#ram-bar'), $('#ram-val'), s.ram);
    $('#ram-val').title = `${(s.ramUsed / 2 ** 30).toFixed(1)} / ${(s.ramTotal / 2 ** 30).toFixed(1)} GB`;
  });

  const clipList = $('#clip-list');
  function renderClips(clips) {
    clipList.innerHTML = '';
    if (!clips.length) {
      clipList.innerHTML = '<div class="clip-empty">Copied text shows up here</div>';
      return;
    }
    clips.forEach((text, i) => {
      const b = document.createElement('button');
      b.className = 'clip-item';
      b.dir = 'auto';
      b.title = 'Click to copy';
      b.textContent = text.replace(/\s+/g, ' ').trim();
      b.addEventListener('click', () => {
        bridge.system.copyClip(i);
        b.classList.add('copied');
      });
      clipList.append(b);
    });
  }
  $('#clip-clear').addEventListener('click', () => bridge.system.clearClips());

  bridge.onWeather(renderWeather);
  bridge.onClipboard(renderClips);
  bridge.system.snapshot().then((s) => {
    renderClips(s.clips);
    renderWeather(s.weather);
  });
})();
