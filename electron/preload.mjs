import { contextBridge, ipcRenderer } from 'electron';

const desktopHost = {
  getSurface() {
    const url = new URL(window.location.href);
    return url.searchParams.get('surface') ?? 'panel';
  },
  getShellState() {
    return ipcRenderer.invoke('desktop-host:get-shell-state');
  },
  showResultWindow() {
    return ipcRenderer.invoke('desktop-host:show-result-window');
  },
  showSettingsWindow() {
    return ipcRenderer.invoke('desktop-host:show-settings-window');
  },
  togglePanelWindow() {
    return ipcRenderer.invoke('desktop-host:toggle-panel-window');
  },
  startScreenCapture() {
    return ipcRenderer.invoke('desktop-host:start-screen-capture');
  },
  startLongScreenCapture() {
    return ipcRenderer.invoke('desktop-host:start-long-screen-capture');
  },
  activateOverlay() {
    return ipcRenderer.invoke('desktop-host:activate-overlay');
  },
  completeScreenCapture(selection) {
    return ipcRenderer.invoke('desktop-host:complete-screen-capture', selection);
  },
  cancelCaptureSession() {
    return ipcRenderer.invoke('desktop-host:cancel-capture-session');
  },
  captureLongSegment() {
    return ipcRenderer.invoke('desktop-host:capture-long-segment');
  },
  finishLongCapture() {
    return ipcRenderer.invoke('desktop-host:finish-long-capture');
  },
  setLongCaptureMode(request) {
    return ipcRenderer.invoke('desktop-host:set-long-capture-mode', request);
  },
  toggleLongCapturePause() {
    return ipcRenderer.invoke('desktop-host:toggle-long-capture-pause');
  },
  saveLongImage() {
    return ipcRenderer.invoke('desktop-host:save-long-image');
  },
  saveRecentResultText(request) {
    return ipcRenderer.invoke('desktop-host:save-recent-result-text', request);
  },
  saveShortcutPreference(request) {
    return ipcRenderer.invoke('desktop-host:save-shortcut-preference', request);
  },
  saveAdvancedFeatures(request) {
    return ipcRenderer.invoke('desktop-host:save-advanced-features', request);
  },
  copyResultText(request) {
    return ipcRenderer.invoke('desktop-host:copy-result-text', request);
  },
  getRecentCaptureImages() {
    return ipcRenderer.invoke('desktop-host:get-recent-capture-images');
  },
  openScreenCapturePreferences() {
    return ipcRenderer.invoke('desktop-host:open-screen-capture-preferences');
  },
  setAutoLaunch(request) {
    return ipcRenderer.invoke('desktop-host:set-auto-launch', request);
  },
  closeCurrentWindow() {
    return ipcRenderer.invoke('desktop-host:close-current-window');
  },
  requestWindowFit(contentHeight) {
    return ipcRenderer.invoke('desktop-host:request-window-fit', contentHeight);
  },
  subscribeShellState(listener) {
    const subscription = (_, state) => {
      listener(state);
    };

    ipcRenderer.on('desktop-host:shell-state-updated', subscription);
    return () => {
      ipcRenderer.removeListener('desktop-host:shell-state-updated', subscription);
    };
  },
};

contextBridge.exposeInMainWorld('desktopHost', desktopHost);
