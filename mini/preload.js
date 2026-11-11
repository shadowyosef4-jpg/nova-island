const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mini', {
  onHover: (cb) => ipcRenderer.on('mini-hover', (_e, v) => cb(v)),
  time: (t) => ipcRenderer.send('mini-time', t),
  close: (time, resume) => ipcRenderer.send('mini-close', { time, resume }),
  resizeStart: (corner) => ipcRenderer.send('mini-resize-start', corner),
  resizeEnd: () => ipcRenderer.send('mini-resize-end'),
});
