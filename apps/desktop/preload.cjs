const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('signalZeroDesktop', {
  serverUrl: 'http://127.0.0.1:2567',
});
