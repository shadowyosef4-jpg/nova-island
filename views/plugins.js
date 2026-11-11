// Installing a plugin (from Settings > Plugins): the island shows it like a download, and the
// same green "done" note with a celebration when it's in.
(() => {
  bridge.onPluginProgress((p) => {
    if (p.error) showToast('dl-error', `${p.name} didn't install`, 'Failed', 0, 4000);
    else if (p.done) {
      showToast('dl-done', `${p.name} installed`, '✓', 0, 4000);
      celebrate();
    } else if (p.pct === 0) showToast('dl-start', `Installing ${p.name}`, '', 0, 2500);
  });
})();
