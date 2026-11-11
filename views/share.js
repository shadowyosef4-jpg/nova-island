// Nova Share View: UI controller for Web File Manager & FTP server toggles
(() => {
  const tabBtn = $('button[data-tab="share"]');
  const view = $('#v-share');
  if (!view) return;

  const btnToggleWeb = $('#btn-toggle-web');
  const btnToggleFtp = $('#btn-toggle-ftp');
  const statusWeb = $('#share-web-status');
  const statusFtp = $('#share-ftp-status');
  const webBody = $('#web-info-body');
  const ftpBody = $('#ftp-info-body');
  const webUrl = $('#share-web-url');
  const ftpUrl = $('#share-ftp-url');
  const btnCopyWeb = $('#btn-copy-web');
  const btnCopyFtp = $('#btn-copy-ftp');
  const btnShowQr = $('#btn-show-qr');
  const btnCloseQr = $('#btn-close-qr');
  const qrModal = $('#share-qr-modal');
  const qrImg = $('#share-qr-img');
  const btnOpenFolder = $('#btn-open-share-folder');
  const shareBadge = $('#share-badge');
  const statusSummary = $('#share-status-summary');

  let currentStatus = {
    webRunning: false,
    ftpRunning: false,
    ip: '127.0.0.1',
    webUrl: '',
    ftpUrl: '',
    qrDataUrl: '',
  };

  function updateUI(s) {
    currentStatus = s;

    // Web server
    if (s.webRunning) {
      statusWeb.textContent = 'Running';
      statusWeb.style.color = '#3fb950';
      btnToggleWeb.textContent = 'Stop';
      btnToggleWeb.classList.add('stop');
      webBody.hidden = false;
      webUrl.textContent = s.webUrl;
    } else {
      statusWeb.textContent = 'Stopped';
      statusWeb.style.color = 'var(--text-muted, #8b949e)';
      btnToggleWeb.textContent = 'Start';
      btnToggleWeb.classList.remove('stop');
      webBody.hidden = true;
    }

    // FTP server
    if (s.ftpRunning) {
      statusFtp.textContent = 'Running';
      statusFtp.style.color = '#3fb950';
      btnToggleFtp.textContent = 'Stop';
      btnToggleFtp.classList.add('stop');
      ftpBody.hidden = false;
      ftpUrl.textContent = s.ftpUrl;
    } else {
      statusFtp.textContent = 'Stopped';
      statusFtp.style.color = 'var(--text-muted, #8b949e)';
      btnToggleFtp.textContent = 'Start';
      btnToggleFtp.classList.remove('stop');
      ftpBody.hidden = true;
    }

    // Badge on the tab
    const anyActive = s.webRunning || s.ftpRunning;
    if (shareBadge) {
      shareBadge.classList.toggle('on', anyActive);
    }

    // Summary
    if (s.webRunning && s.ftpRunning) {
      statusSummary.textContent = 'Web & FTP Active';
    } else if (s.webRunning) {
      statusSummary.textContent = 'Web Server Active';
    } else if (s.ftpRunning) {
      statusSummary.textContent = 'FTP Server Active';
    } else {
      statusSummary.textContent = 'Ready to transfer';
    }

    // QR Image update
    if (s.qrDataUrl) {
      qrImg.src = s.qrDataUrl;
    }
  }

  // Toggle Web
  btnToggleWeb.addEventListener('click', async (e) => {
    e.stopPropagation();
    btnToggleWeb.disabled = true;
    try {
      if (currentStatus.webRunning) {
        const s = await bridge.share.stopWeb();
        updateUI(s);
      } else {
        const s = await bridge.share.startWeb();
        updateUI(s);
      }
    } catch (err) {
      console.error(err);
    } finally {
      btnToggleWeb.disabled = false;
    }
  });

  // Toggle FTP
  btnToggleFtp.addEventListener('click', async (e) => {
    e.stopPropagation();
    btnToggleFtp.disabled = true;
    try {
      if (currentStatus.ftpRunning) {
        const s = await bridge.share.stopFtp();
        updateUI(s);
      } else {
        const s = await bridge.share.startFtp();
        updateUI(s);
      }
    } catch (err) {
      console.error(err);
    } finally {
      btnToggleFtp.disabled = false;
    }
  });

  // Copy buttons
  btnCopyWeb.addEventListener('click', (e) => {
    e.stopPropagation();
    if (currentStatus.webUrl) {
      navigator.clipboard.writeText(currentStatus.webUrl);
      webUrl.textContent = 'Copied to clipboard!';
      setTimeout(() => { webUrl.textContent = currentStatus.webUrl; }, 1500);
    }
  });

  btnCopyFtp.addEventListener('click', (e) => {
    e.stopPropagation();
    if (currentStatus.ftpUrl) {
      navigator.clipboard.writeText(currentStatus.ftpUrl);
      ftpUrl.textContent = 'Copied to clipboard!';
      setTimeout(() => { ftpUrl.textContent = currentStatus.ftpUrl; }, 1500);
    }
  });

  // QR Modal
  btnShowQr.addEventListener('click', (e) => {
    e.stopPropagation();
    if (currentStatus.qrDataUrl) {
      qrImg.src = currentStatus.qrDataUrl;
      qrModal.hidden = false;
    }
  });

  btnCloseQr.addEventListener('click', (e) => {
    e.stopPropagation();
    qrModal.hidden = true;
  });

  qrModal.addEventListener('click', (e) => {
    if (e.target === qrModal) qrModal.hidden = true;
  });

  // Open folder
  btnOpenFolder.addEventListener('click', (e) => {
    e.stopPropagation();
    bridge.share.openFolder();
  });

  // Open share settings
  const btnOpenPrefs = $('#btn-open-share-prefs');
  if (btnOpenPrefs) {
    btnOpenPrefs.addEventListener('click', (e) => {
      e.stopPropagation();
      bridge.openSettings();
    });
  }

  // Listen for live updates
  bridge.share.onStatus((s) => updateUI(s));

  // Initial fetch
  bridge.share.status().then((s) => updateUI(s)).catch(() => {});
})();

