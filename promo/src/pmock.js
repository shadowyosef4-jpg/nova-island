// Stand-in for the Settings window bridge (window.prefs) for promo shots. ?sec=<section id>
// opens that page.
(() => {
  const features = {
    tabMedia: true, tabApps: true, tabShelf: true, tabPrayer: true, tabTimer: true, tabSystem: true,
    slideClock: true, slideStats: true, slidePrayer: true, mediaPill: true, mediaTitle: true, trackPeek: true,
    hudVolume: true, hudBrightness: true, battery: false, prayerAlerts: true, downloads: true, dlToasts: true, folderDownloads: true,
    hideFullscreen: true, reminders: true, remindAyah: true, remindDhikr: true, remindDua: true, remindEvery: 5, remindFor: 30,
    quietHours: true, quietFrom: 1380, quietTo: 420, asrHanafi: false, hijriAdjust: 0, prayerAlerts: true,
    novaEyes: true, novaPrayer: true, novaFocus: true, celebrate: true, morningBrief: true, welcomeBack: true, wellbeing: true,
    netToasts: true, smartClipboard: true, water: true, waterEvery: 60, waterGoal: 8, meetings: true, privacyDots: true,
    clipboardHistory: true, kbdToast: true, capsToast: true, screenshotToast: true, shotAutoShelf: true, shotShelfMinutes: 20, addrIsland: true,
  };
  const general = { shown: true, vertical: true, startWithWindows: true, version: '1.4.0' };
  const noop = () => {};
  window.prefs = {
    features: async () => ({ ...features }), general: async () => ({ ...general }),
    setFeatures: noop, resetFeatures: noop, onFeatures: noop, setGeneral: noop, onGeneral: noop,
    window: noop, previewReminder: noop,
    bridgeStatus: async () => ({ state: 'ok', detail: '' }), openLog: noop, copyReport: async () => true, openSupport: noop, downloadFolders: async () => [{ path: 'C:/Users/user/Downloads', fixed: true }, { path: 'D:/Downloads', fixed: false }], addDownloadFolder: async () => [], removeDownloadFolder: async () => [],
    location: async () => ({ mode: 'auto', name: 'Giza' }), searchCity: async () => [], setLocation: noop, onLocation: noop,
    calendar: async () => ({ events: [], error: '', updated: 0, hasUrl: false }), setCalendar: async () => ({ ok: true }), onCalendar: noop,
  };
  // the page to open (prefs.js reads the remembered page when it starts)
  const sec = new URLSearchParams(location.search).get('sec');
  try { localStorage.setItem('prefs-page', sec || 'general'); } catch {}
})();
