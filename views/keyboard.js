// Keyboard language and Caps Lock toasts. The helper reports the layout of the window in front
// (kl, a Windows language id) and the Caps Lock state with every media update.
(() => {
  // primary language (low 10 bits) -> name and badge
  const LANGS = {
    0x01: ['العربية', 'ع'], 0x09: ['English', 'EN'], 0x0c: ['Français', 'FR'], 0x07: ['Deutsch', 'DE'],
    0x0a: ['Español', 'ES'], 0x10: ['Italiano', 'IT'], 0x1f: ['Türkçe', 'TR'], 0x29: ['فارسی', 'فا'],
    0x20: ['اردو', 'ار'], 0x19: ['Русский', 'RU'], 0x16: ['Português', 'PT'], 0x0d: ['עברית', 'HE'],
  };
  let lastKl = null;
  let lastCaps = null;
  let lastProc = null;

  bridge.onMedia((m) => {
    if (m.error) return;
    const proc = m.fgProc || '';
    if (typeof m.kl === 'number' && m.kl > 0) {
      // with per-app layouts, switching windows also changes the layout: only real switches count
      if (lastKl !== null && m.kl !== lastKl && proc === lastProc && feat('kbdToast')) {
        const [name, badge] = LANGS[m.kl & 0x3ff] || [`0x${m.kl.toString(16)}`, '⌨'];
        showToast('kbd', name, badge, 0, 1400);
      }
      lastKl = m.kl;
    }
    if (typeof m.caps === 'boolean') {
      if (lastCaps !== null && m.caps !== lastCaps && feat('capsToast')) {
        showToast('caps', 'Caps Lock', m.caps ? 'On' : 'Off', 0, 1400);
        $('.l-toast').classList.toggle('on', m.caps);
      }
      lastCaps = m.caps;
    }
    lastProc = proc;
  });
})();
