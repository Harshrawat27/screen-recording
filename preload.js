// PRELOAD SCRIPT - This runs before the web page loads
// It safely exposes specific APIs to the renderer process
// Think of it as a secure bridge between main and renderer

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Methods to communicate with main process
  getSources: () => ipcRenderer.invoke('get-sources'),
  startRecording: (sourceId) => ipcRenderer.invoke('start-recording', sourceId),
  stopRecording: () => ipcRenderer.invoke('stop-recording'),
  getRecordingStatus: () => ipcRenderer.invoke('get-recording-status'),

  // File operations
  saveRecording: (videoBlob) => ipcRenderer.invoke('save-recording', videoBlob),
  openRecordingsFolder: () => ipcRenderer.invoke('open-recordings-folder'),
  getRecordingsDirectory: () => ipcRenderer.invoke('get-recordings-directory'),

  // Listen for status updates from main process
  onRecordingStatus: (callback) => {
    ipcRenderer.on('recording-status', (event, data) => callback(data));
  },

  // Remove listeners (good practice for cleanup)
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
});

console.log('🔐 Preload script loaded - secure bridge established!');
