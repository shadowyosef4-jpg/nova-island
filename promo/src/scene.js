// Shared scene helpers: fills [data-taskbar] with the mock app icons and marks the page for
// a background-only render (?bg=1) used to crop the island's glass backdrop.
(() => {
  if (new URLSearchParams(location.search).get('bg') === '1') document.documentElement.classList.add('bg-only');
  const apps = window.__mock?.APPS || [];
  document.querySelectorAll('[data-taskbar]').forEach((bar) => {
    const icons = apps.slice(0, 9).map((a) => `<img src="${a.icon}" alt="">`).join('');
    bar.innerHTML = `<span class="home"><i></i></span><span class="search">⌕&nbsp; Search</span>${icons}
      <div class="tray">
        <svg viewBox="0 0 24 24"><path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r=".8"/></svg>
        <svg viewBox="0 0 24 24"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>
        <div class="clock">10:24 AM<br>10/29/2026</div>
      </div>`;
  });
})();
