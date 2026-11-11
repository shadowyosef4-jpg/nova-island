// Mini player page: YouTube embed driven through the iframe postMessage API so playback
// starts at the exact second the tab was paused, and the reached time goes back to the tab.
const YT = 'https://www.youtube.com';
const q = new URLSearchParams(location.search);
const id = q.get('v') || '';
const start = Math.max(0, parseFloat(q.get('t') || '0') || 0);
const frame = document.getElementById('yt');

document.getElementById('title').textContent = q.get('title') || 'Mini Player';
document.title = q.get('title') || 'Mini Player';

let current = start;
let ready = false;
let seeked = false;

function post(func, args = []) {
  frame.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args, id: 1, channel: 'widget' }), YT);
}

frame.src =
  `${YT}/embed/${encodeURIComponent(id)}?autoplay=1&start=${Math.floor(start)}` +
  `&enablejsapi=1&playsinline=1&rel=0&modestbranding=1&origin=${encodeURIComponent(location.origin)}`;

// the embed only reports events after it hears "listening"
frame.addEventListener('load', () => {
  let tries = 0;
  const ping = setInterval(() => {
    if (ready || ++tries > 40) return clearInterval(ping);
    frame.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), YT);
  }, 250);
});

window.addEventListener('message', (e) => {
  if (e.origin !== YT && e.origin !== 'https://www.youtube-nocookie.com') return;
  let d;
  try {
    d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
  } catch {
    return;
  }
  if (!d || !d.event) return;

  if (d.event === 'onReady' || (d.event === 'initialDelivery' && !ready)) {
    ready = true;
    document.getElementById('loading').classList.add('done');
    if (!seeked) {
      seeked = true;
      post('seekTo', [start, true]); // sub-second precision ("start=" only takes whole seconds)
      post('playVideo');
    }
  }
  if (d.event === 'infoDelivery' && d.info && typeof d.info.currentTime === 'number') {
    current = d.info.currentTime;
  }
  if (d.event === 'onError') {
    // 101 / 150 / 153: the owner doesn't allow embedding
    document.getElementById('loading').classList.add('done');
    document.getElementById('msg').hidden = false;
    setTimeout(() => mini.close(start, true), 2600);
  }
});

setInterval(() => mini.time(current), 1000);

mini.onHover((v) => document.body.classList.toggle('hover', v));

document.getElementById('back').addEventListener('click', () => {
  post('pauseVideo');
  mini.close(current, true);
});
document.getElementById('close').addEventListener('click', () => {
  post('pauseVideo');
  mini.close(current, false);
});

document.querySelectorAll('.rz').forEach((el) => {
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    mini.resizeStart(el.dataset.corner);
  });
  const end = () => mini.resizeEnd();
  el.addEventListener('pointerup', end);
  el.addEventListener('lostpointercapture', end);
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.getElementById('back').click();
});
