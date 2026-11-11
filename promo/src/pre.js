// Loaded before the island's own scripts: pins the clock (?t=HH:MM, default 10:24) so every
// shot shows the same time, while still ticking forward normally.
(() => {
  const q = new URLSearchParams(location.search);
  const [h, m] = (q.get('t') || '10:24').split(':').map(Number);
  const Real = Date;
  const target = new Real();
  target.setHours(h, m, 0, 0);
  const offset = target.getTime() - Real.now();
  class PinnedDate extends Real {
    constructor(...args) {
      if (args.length) super(...args);
      else super(Real.now() + offset);
    }
    static now() {
      return Real.now() + offset;
    }
  }
  window.Date = PinnedDate;
})();
