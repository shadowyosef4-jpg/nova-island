// Ultimate Nova Share Web Client JS with:
// Multi-Drive Navigation, Batch Select, Filters, Touch Gestures, Stream & CRUD
(() => {
  let currentPath = '';
  let allFiles = [];
  let isReadOnly = false;
  let isRootDrives = false;
  let activeFilter = 'all';
  let viewMode = 'grid'; // 'grid' or 'list'
  let selectedPaths = new Set();

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  const filesList = $('#files-list');
  const breadcrumbs = $('#breadcrumbs');
  const dropzone = $('#dropzone');
  const fileInput = $('#file-input');
  const uploadProgress = $('#upload-progress');
  const progressFill = $('#progress-fill');
  const uploadPct = $('#upload-pct');
  const uploadStatus = $('#upload-status');
  const searchInput = $('#search-input');
  const btnToggleView = $('#btn-toggle-view');
  const batchBar = $('#batch-bar');
  const batchCount = $('#batch-count');
  const btnBatchDelete = $('#btn-batch-delete');
  const btnBatchClear = $('#btn-batch-clear');

  const mediaModal = $('#media-modal');
  const mediaTitle = $('#media-title');
  const mediaBody = $('#media-body');
  const modalClose = $('#modal-close');

  const promptModal = $('#prompt-modal');
  const promptTitle = $('#prompt-title');
  const promptInput = $('#prompt-input');
  const promptOk = $('#prompt-ok');
  const promptCancel = $('#prompt-cancel');
  let promptCallback = null;

  const ICONS = {
    drive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="6" y1="12" x2="6.01" y2="12"/><line x1="10" y1="12" x2="10.01" y2="12"/></svg>',
    folder: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
    audio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
    doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>',
    download: '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    edit: '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'
  };

  const extOf = (name) => (name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
  function fileCategory(item) {
    if (item.isDrive) return 'drive';
    if (item.isDir) return 'folder';
    const ext = extOf(item.name);
    if (/^(mp4|mkv|webm|mov|m4v|avi|ts|ogv)$/.test(ext)) return 'video';
    if (/^(mp3|wav|ogg|m4a|aac|flac|weba)$/.test(ext)) return 'audio';
    if (/^(jpg|jpeg|png|gif|webp|svg|bmp|ico|avif)$/.test(ext)) return 'image';
    if (/^(pdf|txt|md|json|js|html|css|py|csv|log|doc|docx|xls|xlsx|ppt|pptx)$/.test(ext)) return 'doc';
    return 'file';
  }

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function formatDate(ms) {
    if (!ms) return '';
    const d = new Date(ms);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  async function load(dir = '') {
    currentPath = dir;
    selectedPaths.clear();
    updateBatchBar();
    updateBreadcrumbs(dir);

    try {
      const res = await fetch(`/api/files?dir=${encodeURIComponent(dir)}`);
      const data = await res.json();
      isReadOnly = !!data.readOnly;
      isRootDrives = !!data.isRoot;

      $('#access-badge').textContent = isReadOnly ? 'Read Only' : 'Full Access';
      $('#btn-new-folder').style.display = (isReadOnly || isRootDrives) ? 'none' : 'inline-flex';
      $('#btn-upload').style.display = (isReadOnly || isRootDrives) ? 'none' : 'inline-flex';
      dropzone.style.display = (isReadOnly || isRootDrives) ? 'none' : 'block';
      $('#btn-download-zip').style.display = isRootDrives ? 'none' : 'inline-flex';

      allFiles = data.files || [];
      filterAndRender();
    } catch (e) {
      filesList.innerHTML = `<div style="grid-column:1/-1; color:#f85149; text-align:center; padding:40px;">Failed to load: ${e.message}</div>`;
    }
  }

  function updateBreadcrumbs(dir) {
    breadcrumbs.innerHTML = '';
    const rootCrumb = document.createElement('span');
    rootCrumb.className = `crumb ${!dir ? 'current' : ''}`;
    rootCrumb.textContent = 'Drives Root';
    rootCrumb.onclick = () => load('');
    breadcrumbs.appendChild(rootCrumb);

    if (!dir) return;
    const parts = dir.replace(/\\/g, '/').split('/').filter(Boolean);
    let accum = '';
    parts.forEach((p, idx) => {
      const slash = document.createTextNode(' / ');
      breadcrumbs.appendChild(slash);
      accum += (accum ? '/' : '') + p;
      const curAccum = accum;
      const span = document.createElement('span');
      span.className = `crumb ${idx === parts.length - 1 ? 'current' : ''}`;
      span.textContent = p;
      if (idx !== parts.length - 1) {
        span.onclick = () => load(curAccum);
      }
      breadcrumbs.appendChild(span);
    });
  }

  function filterAndRender() {
    let items = allFiles;
    const q = searchInput.value.toLowerCase().trim();
    if (q) {
      items = items.filter(f => f.name.toLowerCase().includes(q));
    }
    if (activeFilter !== 'all') {
      items = items.filter(f => f.isDrive || f.isDir || fileCategory(f) === activeFilter);
    }
    renderFiles(items);
  }

  function renderFiles(items) {
    filesList.innerHTML = '';
    if (!items.length) {
      filesList.innerHTML = '<div style="grid-column: 1/-1; text-align:center; color:var(--text-muted); padding:40px;">No files or folders found</div>';
      return;
    }

    const sorted = [...items].sort((a, b) => {
      if (a.isDrive && !b.isDrive) return -1;
      if (!a.isDrive && b.isDrive) return 1;
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });

    sorted.forEach((item) => {
      const cat = fileCategory(item);
      const div = document.createElement('div');
      div.className = `file-item ${selectedPaths.has(item.name) ? 'selected' : ''}`;

      const itemPath = currentPath ? `${currentPath}/${item.name}` : item.name;
      const rawUrl = `/raw/${encodeURIComponent(itemPath).replace(/%2F/g, '/')}`;

      div.innerHTML = `
        ${(!item.isDrive && !isReadOnly) ? `<input type="checkbox" class="file-checkbox" ${selectedPaths.has(itemPath) ? 'checked' : ''}>` : ''}
        <div class="file-icon ${cat}">
          ${ICONS[cat] || ICONS.file}
        </div>
        <div class="file-info">
          <div class="file-name" title="${item.name}">${item.name}</div>
          <div class="file-meta">
            <span>${item.isDrive ? 'Local Disk' : item.isDir ? 'Folder' : formatBytes(item.size)}</span>
            <span>·</span>
            <span>${formatDate(item.mtime)}</span>
          </div>
        </div>
        <div class="file-actions">
          ${!item.isDir && !item.isDrive ? `<a class="action-btn" href="${rawUrl}?download=1" download title="Download">${ICONS.download}</a>` : ''}
          ${!item.isDrive && !isReadOnly ? `
            <button class="action-btn rename-btn" title="Rename">${ICONS.edit}</button>
            <button class="action-btn del delete-btn" title="Delete">${ICONS.trash}</button>
          ` : ''}
        </div>
      `;

      // Checkbox handler
      const chk = div.querySelector('.file-checkbox');
      if (chk) {
        chk.onclick = (e) => {
          e.stopPropagation();
          if (chk.checked) selectedPaths.add(itemPath);
          else selectedPaths.delete(itemPath);
          div.classList.toggle('selected', chk.checked);
          updateBatchBar();
        };
      }

      // Touch / Click Handler
      let touchStartTime = 0;
      div.addEventListener('touchstart', () => { touchStartTime = Date.now(); }, { passive: true });
      div.addEventListener('touchend', (e) => {
        // Long press (>500ms) toggles selection
        if (Date.now() - touchStartTime > 500 && chk) {
          e.preventDefault();
          chk.checked = !chk.checked;
          chk.dispatchEvent(new Event('click'));
        }
      });

      div.onclick = (e) => {
        if (e.target.closest('.file-actions') || e.target.closest('.file-checkbox')) return;
        if (selectedPaths.size > 0 && chk) {
          chk.checked = !chk.checked;
          chk.dispatchEvent(new Event('click'));
          return;
        }
        if (item.isDrive || item.isDir) {
          load(itemPath);
        } else {
          openMedia(item, rawUrl);
        }
      };

      if (!isReadOnly && !item.isDrive) {
        div.querySelector('.rename-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          showPrompt('Rename Item', item.name, async (newName) => {
            if (!newName || newName === item.name) return;
            await fetch('/api/rename', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ oldPath: itemPath, newName })
            });
            load(currentPath);
          });
        });

        div.querySelector('.delete-btn')?.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (confirm(`Delete "${item.name}"?`)) {
            await fetch('/api/delete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path: itemPath })
            });
            load(currentPath);
          }
        });
      }

      filesList.appendChild(div);
    });
  }

  function updateBatchBar() {
    if (selectedPaths.size > 0) {
      batchCount.textContent = `${selectedPaths.size} items selected`;
      batchBar.classList.add('show');
    } else {
      batchBar.classList.remove('show');
    }
  }

  btnBatchClear.onclick = () => {
    selectedPaths.clear();
    $$('.file-item').forEach(el => el.classList.remove('selected'));
    $$('.file-checkbox').forEach(el => el.checked = false);
    updateBatchBar();
  };

  btnBatchDelete.onclick = async () => {
    if (!selectedPaths.size) return;
    if (confirm(`Delete ${selectedPaths.size} selected items?`)) {
      await fetch('/api/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: Array.from(selectedPaths) })
      });
      load(currentPath);
    }
  };

  function openMedia(item, url) {
    const cat = fileCategory(item);
    mediaTitle.textContent = item.name;
    mediaBody.innerHTML = '';

    if (cat === 'video') {
      mediaBody.innerHTML = `<video controls autoplay playsinline src="${url}"></video>`;
      mediaModal.classList.add('open');
    } else if (cat === 'audio') {
      mediaBody.innerHTML = `
        <div style="width:100%; text-align:center; padding:20px;">
          <div style="margin-bottom:20px; font-size:48px;">🎵</div>
          <audio controls autoplay src="${url}"></audio>
        </div>`;
      mediaModal.classList.add('open');
    } else if (cat === 'image') {
      mediaBody.innerHTML = `<img src="${url}" alt="${item.name}">`;
      mediaModal.classList.add('open');
    } else if (extOf(item.name) === 'pdf') {
      mediaBody.innerHTML = `<iframe src="${url}" style="width:100%; height:75vh; border:none; border-radius:8px;"></iframe>`;
      mediaModal.classList.add('open');
    } else if (cat === 'doc') {
      fetch(url)
        .then(r => r.text())
        .then(t => {
          mediaBody.innerHTML = `<pre style="width:100%; max-height:70vh; overflow:auto; background:#0d1117; padding:16px; border-radius:8px; font-size:0.85rem; color:#f0f6fc; white-space:pre-wrap;">${escapeHtml(t)}</pre>`;
          mediaModal.classList.add('open');
        })
        .catch(() => window.open(url, '_blank'));
    } else {
      window.open(url, '_blank');
    }
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  modalClose.onclick = () => {
    mediaModal.classList.remove('open');
    mediaBody.innerHTML = '';
  };
  mediaModal.onclick = (e) => {
    if (e.target === mediaModal) modalClose.onclick();
  };

  // View mode toggle
  btnToggleView.onclick = () => {
    viewMode = viewMode === 'grid' ? 'list' : 'grid';
    filesList.className = `files-container ${viewMode}`;
  };

  // Filter chips
  $$('.chip-btn').forEach(btn => {
    btn.onclick = () => {
      $$('.chip-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      filterAndRender();
    };
  });

  searchInput.oninput = () => filterAndRender();

  // Upload
  async function uploadFiles(fileList) {
    if (!fileList || !fileList.length || isReadOnly || isRootDrives) return;
    uploadProgress.style.display = 'block';
    const total = fileList.length;

    for (let i = 0; i < total; i++) {
      const file = fileList[i];
      uploadStatus.textContent = `Uploading ${file.name} (${i + 1}/${total})...`;
      const pct = Math.round((i / total) * 100);
      progressFill.style.width = pct + '%';
      uploadPct.textContent = pct + '%';

      const formData = new FormData();
      formData.append('dir', currentPath);
      formData.append('file', file);

      try {
        await fetch('/api/upload', {
          method: 'POST',
          body: formData
        });
      } catch (err) {
        console.error(err);
      }
    }

    progressFill.style.width = '100%';
    uploadPct.textContent = '100%';
    uploadStatus.textContent = 'Completed!';
    setTimeout(() => {
      uploadProgress.style.display = 'none';
      load(currentPath);
    }, 700);
  }

  dropzone.onclick = () => fileInput.click();
  $('#btn-upload').onclick = () => fileInput.click();
  fileInput.onchange = () => {
    uploadFiles(fileInput.files);
    fileInput.value = '';
  };

  ['dragenter', 'dragover'].forEach(name => {
    window.addEventListener(name, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    window.addEventListener(name, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });

  window.addEventListener('drop', (e) => {
    if (e.dataTransfer && e.dataTransfer.files.length) {
      uploadFiles(e.dataTransfer.files);
    }
  });

  function showPrompt(title, defaultVal, cb) {
    promptTitle.textContent = title;
    promptInput.value = defaultVal || '';
    promptCallback = cb;
    promptModal.classList.add('open');
    promptInput.focus();
    promptInput.select();
  }
  promptCancel.onclick = () => {
    promptModal.classList.remove('open');
    promptCallback = null;
  };
  promptOk.onclick = () => {
    const val = promptInput.value.trim();
    promptModal.classList.remove('open');
    if (promptCallback) promptCallback(val);
    promptCallback = null;
  };
  promptInput.onkeydown = (e) => {
    if (e.key === 'Enter') promptOk.onclick();
    if (e.key === 'Escape') promptCancel.onclick();
  };

  $('#btn-new-folder').onclick = () => {
    if (isReadOnly || isRootDrives) return;
    showPrompt('Create Folder', '', async (name) => {
      if (!name) return;
      await fetch('/api/mkdir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dir: currentPath, name })
      });
      load(currentPath);
    });
  };

  $('#btn-download-zip').onclick = () => {
    if (isRootDrives) return;
    window.location.href = `/api/zip?dir=${encodeURIComponent(currentPath)}`;
  };

  load('');
})();
