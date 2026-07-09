/**
 * 文件：electron/main.mjs
 * 职责：Electron 主进程入口。负责窗口体系（panel / result / settings / overlay /
 *       long-toolbar / stitcher）、屏幕截图采集、离线 OCR 调度、长截图拼接与
 *       文本合并、托盘、全局快捷键、开机自启动、权限检测与状态广播（IPC）。
 * 依赖：electron、node:*、./ocr.swift、./stitcher.html
 * 导出：无（作为进程入口直接运行）
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  globalShortcut,
  nativeImage,
  ipcMain,
  desktopCapturer,
  screen,
  systemPreferences,
  clipboard,
  dialog,
} from 'electron';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');
const rendererDistPath = path.join(appRoot, 'dist', 'index.html');
const devServerUrl = process.env.ELECTRON_RENDERER_URL ?? 'http://localhost:3000';
const trayIconPath = path.join(appRoot, 'public', 'img', 'favicon', 'A_simple_flat_vector_tray_icon_2026-07-08T07-19-22.png');
const desktopStatePath = path.join(app.getPath('userData'), 'desktop-state.json');
const ocrScriptPath = path.join(__dirname, 'ocr.swift');

const defaultSingleShortcut = 'CommandOrControl+Shift+1';
const defaultLongShortcut = 'CommandOrControl+Shift+2';
const defaultMenuShortcut = 'CommandOrControl+Shift+M';

let tray = null;
let panelWindow = null;
let resultWindow = null;
let settingsWindow = null;
let overlayWindows = [];
let longToolbarWindow = null;
let stitcherWindow = null;
let stitcherReadyPromise = null;
let longCaptureTimer = null;
let _longCaptureBusy = false;
let _longCaptureNoChangeCount = 0;
let _longCaptureMaxSegments = 30;
let _longCaptureInterval = 800;

const hostState = {
  permissions: {
    screenCapture: 'unknown',
  },
  captureDisplays: [],
  recentCaptureResult: null,
  activeCaptureSession: null,
  longCaptureSession: null,
  captureErrorMessage: null,
  shortcutPreferences: {
    single: {
      accelerator: defaultSingleShortcut,
      displayText: '⌘/Ctrl + ⇧ + 1',
    },
    long: {
      accelerator: defaultLongShortcut,
      displayText: '⌘/Ctrl + ⇧ + 2',
    },
    menu: {
      accelerator: defaultMenuShortcut,
      displayText: '⌘/Ctrl + ⇧ + M',
    },
  },
  shortcutRegistrationError: null,
  // Auto-launch on login. Defaults to ON per product requirement; the actual
  // system registration is applied at startup and on every toggle change.
  autoLaunch: true,
  advancedFeatures: {
    enabled: true,
    filterSymbols: [],
    charReplacements: [],
    regexRules: [],
  },
};

function isDevelopment() {
  return !app.isPackaged;
}

function loadPersistedState() {
  if (!fs.existsSync(desktopStatePath)) {
    return;
  }

  try {
    const persistedJson = fs.readFileSync(desktopStatePath, 'utf-8');
    const persistedState = JSON.parse(persistedJson);
    if (
      persistedState.shortcutPreferences?.single?.accelerator &&
      persistedState.shortcutPreferences?.single?.displayText &&
      persistedState.shortcutPreferences?.long?.accelerator &&
      persistedState.shortcutPreferences?.long?.displayText
    ) {
      // Load stored preferences but keep any missing keys (e.g. the menu
      // shortcut added later) on their defaults.
      hostState.shortcutPreferences = {
        single: persistedState.shortcutPreferences.single,
        long: persistedState.shortcutPreferences.long,
        menu: persistedState.shortcutPreferences.menu ?? hostState.shortcutPreferences.menu,
      };
    } else if (persistedState.shortcutPreference?.accelerator && persistedState.shortcutPreference?.displayText) {
      hostState.shortcutPreferences.single = persistedState.shortcutPreference;
    }

    if (persistedState.recentCaptureResult) {
      const r = persistedState.recentCaptureResult;
      // Never restore image data URLs from disk — they are large and stale.
      hostState.recentCaptureResult = {
        text: typeof r.text === 'string' ? r.text : '',
        capturedAt: typeof r.capturedAt === 'string' ? r.capturedAt : new Date().toISOString(),
        wasEmpty: Boolean(r.wasEmpty),
        imageDataUrl: null,
        longImageDataUrl: null,
        loading: false,
      };
    }

    if (typeof persistedState.autoLaunch === 'boolean') {
      hostState.autoLaunch = persistedState.autoLaunch;
    }

    if (persistedState.advancedFeatures && typeof persistedState.advancedFeatures === 'object') {
      const af = persistedState.advancedFeatures;
      hostState.advancedFeatures = {
        enabled: typeof af.enabled === 'boolean' ? af.enabled : true,
        filterSymbols: Array.isArray(af.filterSymbols)
          ? af.filterSymbols.filter((s) => typeof s === 'string').slice(0, 200)
          : [],
        charReplacements: Array.isArray(af.charReplacements)
          ? af.charReplacements
              .filter((r) => r && typeof r === 'object')
              .map((r) => ({
                source: typeof r.source === 'string' ? r.source : '',
                target: typeof r.target === 'string' ? r.target : '',
              }))
              .slice(0, 200)
          : [],
        regexRules: Array.isArray(af.regexRules)
          ? af.regexRules
              .filter((r) => r && typeof r === 'object')
              .map((r) => ({
                pattern: typeof r.pattern === 'string' ? r.pattern : '',
                replacement: typeof r.replacement === 'string' ? r.replacement : '',
                flags: typeof r.flags === 'string' ? r.flags : 'g',
                mode: r.mode === 'filter' ? 'filter' : 'replace',
              }))
              .slice(0, 200)
          : [],
      };
    }
  } catch {
    hostState.captureErrorMessage = '读取本地桌面设置失败，已使用默认配置继续。';
  }
}

function persistState() {
  fs.mkdirSync(path.dirname(desktopStatePath), { recursive: true });
  // Persist only the lightweight text result — never the multi-MB image
  // data URLs, which would bloat the JSON file and slow down startup.
  const result = hostState.recentCaptureResult;
  fs.writeFileSync(
    desktopStatePath,
    JSON.stringify(
      {
        shortcutPreferences: hostState.shortcutPreferences,
        autoLaunch: hostState.autoLaunch,
        advancedFeatures: hostState.advancedFeatures,
        recentCaptureResult: result
          ? {
              text: result.text,
              capturedAt: result.capturedAt,
              wasEmpty: result.wasEmpty,
            }
          : null,
      },
      null,
      2,
    ),
    'utf-8',
  );
}

function formatShortcutDisplay(accelerator) {
  return accelerator
    .replace(/CommandOrControl/g, '⌘/Ctrl')
    .replace(/Command/g, '⌘')
    .replace(/Control/g, 'Ctrl')
    .replace(/Shift/g, '⇧');
}

/**
 * 构建并 sanitize 当前要广播的宿主状态。
 * 图片等大体积 data URL 在此被剥离（置 null），仅通过按需接口下发，
 * 避免每次状态变更向所有窗口推送数 MB base64 造成 IPC/渲染卡顿。
 * @returns 剔除图片载荷后的宿主状态快照
 */
function getShellState() {
  // Sanitize the broadcast: image payloads (often several MB of base64) are
  // stripped here and delivered on-demand via `get-recent-capture-images`.
  // Broadcasting them to every window on every state change was the single
  // largest source of IPC/renderer latency.
  const result = hostState.recentCaptureResult;
  const session = hostState.longCaptureSession;

  return {
    platform: process.platform,
    surfaces: ['panel', 'result', 'settings', 'overlay', 'long-toolbar'],
    permissions: { ...hostState.permissions },
    recentCaptureResult: result
      ? {
          text: result.text,
          capturedAt: result.capturedAt,
          wasEmpty: result.wasEmpty,
          imageDataUrl: null,
          longImageDataUrl: null,
          loading: result.loading,
        }
      : null,
    activeCaptureSession: hostState.activeCaptureSession,
    longCaptureSession: session
      ? {
          selection: session.selection,
          displayId: session.displayId,
          displayBounds: session.displayBounds,
          segmentsCaptured: session.segmentsCaptured,
          mode: session.mode,
          isPaused: session.isPaused,
          // Tiny thumbnail only (full image stays in-process for stitch/save).
          latestSegmentThumbnail: session.latestSegmentThumbnail ?? null,
        }
      : null,
    captureErrorMessage: hostState.captureErrorMessage,
    shortcutPreferences: hostState.shortcutPreferences,
    shortcutRegistrationError: hostState.shortcutRegistrationError,
    autoLaunch: hostState.autoLaunch,
    advancedFeatures: hostState.advancedFeatures,
  };
}

// ── Auto-launch (login item) ────────────────────────────────────────────────
// Cross-platform: Electron's setLoginItemSettings covers macOS, Windows and
// Linux. The call is wrapped so that an unsupported platform or a denied
// permission can never crash startup or a toggle action.
function applyLoginItemSettings(enabled) {
  try {
    if (typeof app.setLoginItemSettings !== 'function') {
      return { success: false, error: '当前平台不支持开机自启动设置。' };
    }
    app.setLoginItemSettings({ openAtLogin: enabled });
    return { success: true, error: null };
  } catch (err) {
    console.warn('[autolaunch] setLoginItemSettings failed:', err?.message ?? err);
    return { success: false, error: '设置开机自启动失败，请检查系统权限或杀毒软件拦截。' };
  }
}

// Apply the persisted preference at startup. We also sync the in-memory value
// from the real system state so the toggle never lies about its status.
function initAutoLaunch() {
  try {
    if (typeof app.getLoginItemSettings === 'function') {
      const systemState = app.getLoginItemSettings();
      // First run (no persisted value) keeps the default ON; otherwise trust
      // what we persisted. Apply it so a fresh install actually registers.
      const desired = hostState.autoLaunch;
      app.setLoginItemSettings({ openAtLogin: desired });
      // Reflect whatever the OS ultimately reports (some setups override).
      if (typeof systemState.openAtLogin === 'boolean') {
        hostState.autoLaunch = systemState.openAtLogin;
      }
    }
  } catch (err) {
    console.warn('[autolaunch] init failed:', err?.message ?? err);
  }
}

async function setAutoLaunch(request) {
  const desired = Boolean(request?.enabled);
  const previous = hostState.autoLaunch;
  hostState.autoLaunch = desired;
  persistState();

  const { success, error } = applyLoginItemSettings(desired);
  if (!success) {
    // Roll back so the UI stays consistent with the actual system state.
    hostState.autoLaunch = previous;
    persistState();
  }

  broadcastShellState();
  return { success, error: error ?? undefined };
}

function broadcastShellState() {
  const nextState = getShellState();
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('desktop-host:shell-state-updated', nextState);
    }
  }
}

function refreshPermissionState() {
  if (process.platform !== 'darwin') {
    hostState.permissions.screenCapture = 'granted';
    return;
  }

  const status = systemPreferences.getMediaAccessStatus('screen');
  hostState.permissions.screenCapture = status === 'not-determined' ? 'unknown' : status;
}

async function loadRenderer(window, surface) {
  const targetUrl = isDevelopment()
    ? `${devServerUrl}?surface=${surface}`
    : `file://${rendererDistPath}?surface=${surface}`;

  await window.loadURL(targetUrl);
}

function createHostWindow(options) {
  return new BrowserWindow({
    show: false,
    frame: false,
    // Hide the native traffic lights by default on macOS; they only appear on
    // hover, so the custom top-right close button becomes the primary control.
    titleBarStyle: 'customButtonsOnHover',
    vibrancy: 'sidebar',
    visualEffectState: 'active',
    transparent: false,
    hasShadow: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    movable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    ...options,
  });
}

function ensurePanelWindow() {
  if (panelWindow && !panelWindow.isDestroyed()) {
    return panelWindow;
  }

  panelWindow = createHostWindow({
    width: 420,
    height: 580,
    resizable: true,
    hiddenInMissionControl: true,
  });

  panelWindow.on('blur', () => {
    if (!panelWindow?.webContents.isDevToolsOpened()) {
      panelWindow?.hide();
    }
  });

  panelWindow.on('closed', () => {
    panelWindow = null;
  });

  void loadRenderer(panelWindow, 'panel');
  return panelWindow;
}

function ensureResultWindow() {
  if (resultWindow && !resultWindow.isDestroyed()) {
    return resultWindow;
  }

  resultWindow = createHostWindow({
    width: 560,
    height: 560,
    minWidth: 360,
    minHeight: 320,
    resizable: true,
    movable: true,
    skipTaskbar: true,
    hiddenInMissionControl: true,
  });

  resultWindow.on('closed', () => {
    resultWindow = null;
  });

  void loadRenderer(resultWindow, 'result');
  return resultWindow;
}

function ensureSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    return settingsWindow;
  }

  settingsWindow = createHostWindow({
    width: 460,
    height: 600,
    minHeight: 420,
    maxHeight: Math.floor(screen.getPrimaryDisplay().workArea.height - 60),
    resizable: true,
    movable: true,
    skipTaskbar: true,
    hiddenInMissionControl: true,
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });

  void loadRenderer(settingsWindow, 'settings');
  return settingsWindow;
}

function createOverlayWindow() {
  const window = new BrowserWindow({
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    fullscreenable: true,
    minimizable: false,
    maximizable: false,
    movable: false,
    focusable: true,
    skipTaskbar: true,
    roundedCorners: false,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  void loadRenderer(window, 'overlay');
  return window;
}

function ensureOverlayWindowsForDisplays(displayBoundsList) {
  closeCaptureOverlay();

  for (let i = 0; i < displayBoundsList.length; i += 1) {
    const bounds = displayBoundsList[i];
    const window = createOverlayWindow();
    window.setBounds(bounds);
    window.on('closed', () => {
      overlayWindows = overlayWindows.filter((w) => w !== window && !w.isDestroyed());
    });
    overlayWindows.push(window);
  }

  return overlayWindows;
}

function ensureLongToolbarWindow() {
  if (longToolbarWindow && !longToolbarWindow.isDestroyed()) {
    return longToolbarWindow;
  }

  longToolbarWindow = createHostWindow({
    width: 460,
    height: 200,
    skipTaskbar: true,
    hiddenInMissionControl: true,
    alwaysOnTop: true,
  });

  longToolbarWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  longToolbarWindow.on('closed', () => {
    longToolbarWindow = null;
  });

  void loadRenderer(longToolbarWindow, 'long-toolbar');
  return longToolbarWindow;
}

function togglePanelWindow() {
  const window = ensurePanelWindow();
  if (window.isVisible()) {
    window.hide();
    return;
  }

  const trayBounds = tray?.getBounds();
  if (trayBounds) {
    const [windowWidth] = window.getSize();
    const x = Math.round(trayBounds.x + trayBounds.width / 2 - windowWidth / 2);
    const y = Math.round(trayBounds.y + trayBounds.height + 8);
    window.setPosition(x, y, false);
  }

  window.show();
  window.focus();
}

function showResultWindow() {
  const window = ensureResultWindow();
  window.showInactive();
}

function showSettingsWindow() {
  const window = ensureSettingsWindow();
  window.center();
  window.show();
  window.focus();
}

function showLongToolbarWindow() {
  const window = ensureLongToolbarWindow();
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x, y, width } = primaryDisplay.workArea;
  const [windowWidth] = window.getSize();
  window.setPosition(Math.round(x + width / 2 - windowWidth / 2), y + 24, false);
  window.showInactive();
}

function closeCaptureOverlay() {
  for (const window of overlayWindows) {
    if (!window.isDestroyed()) {
      window.close();
    }
  }
  overlayWindows = [];
}

function closeLongToolbarWindow() {
  if (longToolbarWindow && !longToolbarWindow.isDestroyed()) {
    longToolbarWindow.close();
  }
}

function ensureStitcherWindow() {
  if (stitcherWindow && !stitcherWindow.isDestroyed()) {
    return stitcherWindow;
  }

  stitcherWindow = new BrowserWindow({
    show: false,
    width: 1,
    height: 1,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  stitcherWindow.on('closed', () => {
    stitcherWindow = null;
    stitcherReadyPromise = null;
  });

  const stitcherPath = path.join(__dirname, 'stitcher.html');
  stitcherReadyPromise = new Promise((resolve) => {
    stitcherWindow.webContents.once('did-finish-load', () => resolve());
  });
  void stitcherWindow.loadFile(stitcherPath);
  return stitcherWindow;
}

async function whenStitcherReady() {
  if (!stitcherWindow || stitcherWindow.isDestroyed()) {
    ensureStitcherWindow();
  }
  if (stitcherReadyPromise) {
    try {
      await stitcherReadyPromise;
    } catch {
      // ignore
    }
  }
  // Extra safety: poll until the stitch function is defined
  try {
    await stitcherWindow.webContents.executeJavaScript(`
      new Promise((resolve) => {
        if (typeof window.__stitchImages === 'function') return resolve(true);
        let tries = 0;
        const iv = setInterval(() => {
          if (typeof window.__stitchImages === 'function' || tries++ > 60) {
            clearInterval(iv);
            resolve(true);
          }
        }, 50);
      })
    `);
  } catch {
    // ignore
  }
}

function destroyStitcherWindow() {
  if (longCaptureTimer) {
    clearInterval(longCaptureTimer);
    longCaptureTimer = null;
  }
  if (stitcherWindow && !stitcherWindow.isDestroyed()) {
    stitcherWindow.close();
  }
  stitcherReadyPromise = null;
}

async function stitchLongImage(segments) {
  if (!segments || segments.length === 0) return null;
  if (segments.length === 1) return segments[0];

  const window = ensureStitcherWindow();
  await whenStitcherReady();

  try {
    const result = await window.webContents.executeJavaScript(
      `window.__stitchImages(${JSON.stringify(segments)})`,
    );
    return typeof result === 'string' && result.startsWith('data:image/png') ? result : null;
  } catch (err) {
    console.error('Stitch failed:', err);
    return null;
  }
}

function startAutoCaptureTimer() {
  stopAutoCaptureTimer();
  _longCaptureNoChangeCount = 0;
  _longCaptureBusy = false;
  longCaptureTimer = setInterval(async () => {
    if (_longCaptureBusy) {
      return;
    }
    if (!hostState.longCaptureSession ||
        hostState.longCaptureSession.isPaused ||
        hostState.longCaptureSession.mode !== 'auto') {
      return;
    }

    _longCaptureBusy = true;
    const prevImage = hostState.longCaptureSession.capturedImages?.length
      ? hostState.longCaptureSession.capturedImages[hostState.longCaptureSession.capturedImages.length - 1]
      : null;
    const result = await captureLongSegment();

    if (!result.success) return;

    // After capture, check if content has changed compared to previous segment
    if (prevImage && hostState.longCaptureSession?.capturedImages?.length) {
      const currImage = hostState.longCaptureSession.capturedImages[
        hostState.longCaptureSession.capturedImages.length - 1
      ];
      if (currImage && prevImage) {
        const hasChanged = await detectScrollChange(prevImage, currImage);
        if (!hasChanged) {
          _longCaptureNoChangeCount += 1;
          if (_longCaptureNoChangeCount >= 3) {
            stopAutoCaptureTimer();
            await finishLongCapture();
            return;
          }
        } else {
          _longCaptureNoChangeCount = 0;
        }
      }
    }

    // Check max segments
    if (hostState.longCaptureSession &&
        hostState.longCaptureSession.segmentsCaptured >= _longCaptureMaxSegments) {
      stopAutoCaptureTimer();
      await finishLongCapture();
    }

    _longCaptureBusy = false;
  }, _longCaptureInterval);
}

function stopAutoCaptureTimer() {
  if (longCaptureTimer) {
    clearInterval(longCaptureTimer);
    longCaptureTimer = null;
  }
}

async function detectScrollChange(prevDataUrl, currDataUrl) {
  if (!prevDataUrl || !currDataUrl) return true;

  const window = ensureStitcherWindow();
  try {
    const result = await window.webContents.executeJavaScript(`
      (function() {
        const imgA = new Image();
        const imgB = new Image();
        const urls = ${JSON.stringify([prevDataUrl, currDataUrl])};
        return new Promise((resolve) => {
          let loaded = 0;
          const imgs = [new Image(), new Image()];
          function check() { if (++loaded === 2) resolve(compare(imgs[0], imgs[1])); }
          imgs[0].onload = check; imgs[0].onerror = () => resolve(true);
          imgs[1].onload = check; imgs[1].onerror = () => resolve(true);
          imgs[0].src = urls[0]; imgs[1].src = urls[1];

          function compare(a, b) {
            const w = Math.min(a.naturalWidth, b.naturalWidth);
            const h = Math.min(a.naturalHeight, b.naturalHeight);
            if (w < 1 || h < 1) return true;

            const scale = 0.15;
            const sw = Math.max(1, Math.floor(w * scale));
            const sh = Math.max(1, Math.floor(h * scale));

            const canvas = document.createElement('canvas');
            canvas.width = sw * 2; canvas.height = sh;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(a, 0, 0, w, h, 0, 0, sw, sh);
            ctx.drawImage(b, 0, 0, w, h, sw, 0, sw, sh);

            const dataA = ctx.getImageData(0, 0, sw, sh).data;
            const dataB = ctx.getImageData(sw, 0, sw, sh).data;

            let totalDiff = 0;
            const len = sw * sh * 4;
            for (let i = 0; i < len; i += 4) {
              totalDiff += Math.abs(dataA[i] - dataB[i]) +
                           Math.abs(dataA[i+1] - dataB[i+1]) +
                           Math.abs(dataA[i+2] - dataB[i+2]);
            }
            const avgDiff = totalDiff / (sw * sh * 3);
            return avgDiff > 8;
          }
        });
      })()
    `);
    return Boolean(result);
  } catch {
    return true;
  }
}

function writeImageDataUrlToTempFile(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') {
    throw new Error('Missing or invalid data URL.');
  }
  const matches = dataUrl.match(/^data:image\/png;base64,([\s\S]+)$/);
  if (!matches) {
    const prefix = dataUrl.substring(0, 50);
    throw new Error(`Invalid PNG data URL (starts with: "${prefix}").`);
  }

  const tempFilePath = path.join(os.tmpdir(), `screen-ocr-${Date.now()}.png`);
  const buffer = Buffer.from(matches[1], 'base64');
  fs.writeFileSync(tempFilePath, buffer);
  console.log(`[ocr] Wrote temp image: ${tempFilePath} (${buffer.length} bytes)`);
  return tempFilePath;
}

// ── OCR engine caching ──────────────────────────────────────────────────────
// `swift ocr.swift` re-compiles the Vision-backed script on EVERY invocation,
// adding ~1-3s of startup/jit overhead per capture. Compile it once into a
// native binary (cached in tmp, rebuilt only when the source changes) so
// subsequent recognitions start instantly. Falls back to `swift` if anything
// goes wrong so behaviour stays stable.
const ocrBinaryPath = path.join(os.tmpdir(), 'screen-ocr-engine.bin');
let ocrBinaryReady = false;
let ocrBinaryFailed = false;

async function ensureOcrExecutable() {
  if (ocrBinaryReady) return ocrBinaryPath;
  if (ocrBinaryFailed) return null;

  try {
    let needsBuild = true;
    if (fs.existsSync(ocrBinaryPath) && fs.existsSync(ocrScriptPath)) {
      const binMtime = fs.statSync(ocrBinaryPath).mtimeMs;
      const srcMtime = fs.statSync(ocrScriptPath).mtimeMs;
      if (binMtime >= srcMtime) {
        needsBuild = false;
      }
    }

    if (needsBuild) {
      await new Promise((resolve) => {
        const child = spawn('swiftc', ['-O', ocrScriptPath, '-o', ocrBinaryPath], {
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let err = '';
        child.stderr.on('data', (chunk) => {
          err += chunk.toString();
        });
        child.on('close', (code) => {
          if (code !== 0) {
            console.warn('[ocr] swiftc compile failed, falling back to `swift`:', err.trim().slice(0, 240));
          }
          resolve();
        });
      });
    }

    ocrBinaryReady = fs.existsSync(ocrBinaryPath);
    if (!ocrBinaryReady) {
      ocrBinaryFailed = true;
    }
  } catch {
    ocrBinaryFailed = true;
  }

  return ocrBinaryReady ? ocrBinaryPath : null;
}

// Downscale very large images before OCR. Vision `.accurate` cost scales with
// pixel count, so a 2000px-longest-side cap keeps small/normal crops untouched
// (accuracy preserved) while drastically shrinking full stitched long images.
function downscaleImageDataUrl(dataUrl, maxSide) {
  try {
    const image = nativeImage.createFromDataURL(dataUrl);
    const { width, height } = image.getSize();
    const longest = Math.max(width, height);
    if (longest <= maxSide) {
      return dataUrl;
    }
    const scale = maxSide / longest;
    const resized = image.resize({
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
    });
    const out = resized.toDataURL();
    return out && out.length > 100 ? out : dataUrl;
  } catch {
    return dataUrl;
  }
}

const OCR_MAX_SIDE = 2000;

// Tiny (≈160px) preview for the long-capture toolbar thumbnail.
function makeThumbnailDataUrl(dataUrl, maxWidth = 160) {
  try {
    const image = nativeImage.createFromDataURL(dataUrl);
    const { width, height } = image.getSize();
    if (width <= maxWidth) {
      return dataUrl;
    }
    const scale = maxWidth / width;
    const resized = image.resize({
      width: maxWidth,
      height: Math.max(1, Math.round(height * scale)),
    });
    const out = resized.toDataURL();
    return out && out.length > 100 ? out : dataUrl;
  } catch {
    return dataUrl;
  }
}

/**
 * 离线 OCR 识别：写临时 PNG → 调用 Vision（优先用预编译二进制，失败回退 swift）
 * → 解析 JSON 结果。非 darwin 平台直接抛错；超大图先降采样到 2000px 以内。
 * 临时文件无论成功失败均在 finally 中清理。
 * @param imageDataUrl 待识别图片（PNG data URL）
 * @returns 识别出的文本（空串表示未识别到）
 */
async function recognizeTextFromImage(imageDataUrl) {
  if (!imageDataUrl) {
    return '';
  }

  if (process.platform !== 'darwin') {
    throw new Error('离线 OCR 当前仅支持 macOS。');
  }

  const downscaled = downscaleImageDataUrl(imageDataUrl, OCR_MAX_SIDE);
  const tempFilePath = writeImageDataUrlToTempFile(downscaled);

  const ocrStart = Date.now();
  try {
    const exe = await ensureOcrExecutable();
    const useBinary = Boolean(exe);
    const command = useBinary ? exe : 'swift';
    const args = useBinary ? [tempFilePath] : [ocrScriptPath, tempFilePath];

    const ocrJson = await new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('error', (error) => {
        reject(error);
      });

      child.on('close', (code) => {
        if (stderr.trim()) {
          console.log('[ocr stderr]', stderr.trim());
        }
        if (code !== 0) {
          reject(new Error(stderr.trim() || 'Vision OCR execution failed.'));
          return;
        }

        resolve(stdout.trim());
      });
    });

    const elapsed = Date.now() - ocrStart;
    if (elapsed > 300) {
      console.log(`[perf] OCR ${useBinary ? 'binary' : 'swift'} took ${elapsed}ms`);
    }

    const parsed = JSON.parse(ocrJson);
    return typeof parsed.text === 'string' ? parsed.text : '';
  } finally {
    fs.rmSync(tempFilePath, { force: true });
  }
}

/**
 * 合并多段长截图文本。对相邻两段做最多 8 行的尾部/首部重叠检测，
 * 重叠一致则去重拼接；无重叠则换行连接。
 * @param parts 各段文本数组
 * @returns 去重合并后的完整文本
 */
function mergeLongCaptureText(parts) {
  return parts.reduce((mergedText, nextPart) => {
    const nextText = nextPart.trim();
    if (!nextText) {
      return mergedText;
    }

    if (!mergedText) {
      return nextText;
    }

    const mergedLines = mergedText.split('\n');
    const nextLines = nextText.split('\n');
    const maxOverlap = Math.min(mergedLines.length, nextLines.length, 8);

    for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
      const mergedTail = mergedLines.slice(-overlap).join('\n').trim();
      const nextHead = nextLines.slice(0, overlap).join('\n').trim();
      if (mergedTail && mergedTail === nextHead) {
        return [...mergedLines, ...nextLines.slice(overlap)].join('\n').trim();
      }
    }

    return `${mergedText}\n${nextText}`.trim();
  }, '');
}

function buildTrayContextMenu() {
  return Menu.buildFromTemplate([
    {
      label: panelWindow && !panelWindow.isDestroyed() && panelWindow.isVisible()
        ? '隐藏面板'
        : '显示面板',
      click: togglePanelWindow,
    },
    { label: '开始截图', click: () => void startScreenCapture('single') },
    { label: '长截图', click: () => void startScreenCapture('long') },
    { label: '结果窗口', click: showResultWindow },
    { label: '设置', click: showSettingsWindow },
    { type: 'separator' },
    { label: '退出', role: 'quit' },
  ]);
}

function createTray() {
  const trayIcon = nativeImage.createFromPath(trayIconPath).resize({
    width: 18,
    height: 18,
  });

  trayIcon.setTemplateImage(true);
  tray = new Tray(trayIcon);
  tray.setToolTip('Screen OCR');

  // Left-click → open/toggle panel
  tray.on('click', () => {
    const win = ensurePanelWindow();
    if (!win.isVisible()) {
      const trayBounds = tray.getBounds();
      const [windowWidth] = win.getSize();
      const x = Math.round(trayBounds.x + trayBounds.width / 2 - windowWidth / 2);
      const y = Math.round(trayBounds.y + trayBounds.height + 8);
      win.setPosition(x, y, false);
      win.show();
      win.focus();
    }
  });

  // Right-click → context menu only
  tray.on('right-click', (_event, bounds) => {
    // Menu.popup requires a BrowserWindow owner. If the panel window is not
    // yet available, use any existing window or create a hidden one so the
    // context menu can open even when no other window is visible.
    const win = (panelWindow && !panelWindow.isDestroyed())
      ? panelWindow
      : (BrowserWindow.getAllWindows().find((w) => !w.isDestroyed()) ?? ensurePanelWindow());
    buildTrayContextMenu().popup({ window: win, x: bounds.x, y: bounds.y });
  });
}

function registerScreenshotShortcut() {
  globalShortcut.unregisterAll();
  hostState.shortcutRegistrationError = null;

  const prefs = hostState.shortcutPreferences;
  const accelerators = [prefs.single.accelerator, prefs.long.accelerator, prefs.menu.accelerator];

  // 1) Intra-app duplicate detection: no two shortcuts may collide.
  if (new Set(accelerators).size < accelerators.length) {
    hostState.shortcutRegistrationError = '普通截图、长截图与唤起菜单不能使用相同的快捷键，请修改后重试。';
    globalShortcut.unregisterAll();
    return false;
  }

  // 2) Register each shortcut. A `false` return means the OS or another app
  //    already owns that combination — treat it as a conflict and report it.
  try {
    const registrations = [
      ['single', () => void startScreenCapture('single')],
      ['long', () => void startScreenCapture('long')],
      ['menu', () => void togglePanelWindow()],
    ].map(([key, handler]) => globalShortcut.register(prefs[key].accelerator, handler));

    if (registrations.some((ok) => !ok)) {
      globalShortcut.unregisterAll();
      hostState.shortcutRegistrationError =
        '部分快捷键注册失败，可能已被系统功能或其他应用占用，请更换按键组合后重试。';
      return false;
    }

    return true;
  } catch {
    hostState.shortcutRegistrationError = '快捷键格式无效，无法完成注册。';
    globalShortcut.unregisterAll();
    return false;
  }
}

function updateShortcutPreference(mode, accelerator) {
  hostState.shortcutPreferences[mode] = {
    accelerator,
    displayText: formatShortcutDisplay(accelerator),
  };
  persistState();
}

/**
 * 启动一次截图会话（single 或 long）。校验无进行中会话与屏幕录制权限，
 * 截取所有显示器并为每个显示器创建 overlay 窗口，最后广播状态。
 * @param mode 'single' | 'long'
 * @returns { success } 是否成功发起
 */
async function startScreenCapture(mode = 'single') {
  if (hostState.activeCaptureSession || hostState.longCaptureSession) {
    hostState.captureErrorMessage = '当前已有截图会话进行中，请先完成或取消当前会话。';
    broadcastShellState();
    return { success: false };
  }

  hostState.captureErrorMessage = null;
  refreshPermissionState();

  if (hostState.permissions.screenCapture !== 'granted') {
    hostState.captureErrorMessage = '当前无法截图：请先在系统设置中为应用开启"屏幕录制"权限。';
    broadcastShellState();
    return { success: false };
  }

  const displays = screen.getAllDisplays();
  const displayBoundsList = displays.map((d) => ({ ...d.bounds }));
  const overlayWindows = ensureOverlayWindowsForDisplays(displayBoundsList);

  // Cap thumbnail size to avoid slow full-retina captures. The overlay is mostly
  // darkened, so a 2560-px longest-side thumbnail is enough for selection and OCR.
  const captureMaxSide = 2560;
  const [sources] = await Promise.all([
    desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: captureMaxSide, height: captureMaxSide },
    }),
    // Let overlay windows start loading in parallel with the screen capture.
    Promise.resolve(overlayWindows),
  ]);

  if (!sources || sources.length === 0) {
    hostState.captureErrorMessage = '当前未能读取屏幕内容，请稍后再试。';
    broadcastShellState();
    return { success: false };
  }

  const sourceByDisplayId = new Map();
  for (const source of sources) {
    sourceByDisplayId.set(source.display_id, source);
  }

  hostState.captureDisplays = [];
  for (const display of displays) {
    const source = sourceByDisplayId.get(`${display.id}`);
    if (source) {
      hostState.captureDisplays.push({
        displayId: `${display.id}`,
        bounds: { ...display.bounds },
        thumbnailSize: source.thumbnail.getSize(),
        screenshotDataUrl: source.thumbnail.toDataURL(),
      });
    }
  }

  if (hostState.captureDisplays.length === 0) {
    hostState.captureErrorMessage = '当前未能读取屏幕内容，请稍后再试。';
    broadcastShellState();
    return { success: false };
  }

  hostState.activeCaptureSession = {
    mode,
    overlayBounds: displays.map((d) => ({ ...d.bounds })),
  };

  for (const win of overlayWindows) {
    if (!win.isDestroyed()) {
      win.show();
      // Force the OS-level screenshot cursor on every overlay window so it stays
      // consistent when the pointer crosses between physical displays. CSS alone
      // resets to the system default at window (screen) boundaries.
      try {
        win.setCursor('crosshair');
      } catch {
        // Ignore transient cursor errors.
      }
    }
  }

  overlayWindows[0]?.focus();
  broadcastShellState();
  return { success: true };
}

/**
 * 按选区从整屏截图（data URL）中裁剪出目标区域，返回裁剪后的 data URL。
 * 坐标已缩放到实际像素；越界会被钳制到图像范围内。
 * @param dataUrl 整屏截图（display-local 缩略图）
 * @param selection 选区（已乘缩放比的实际像素坐标）
 * @returns 裁剪后的 PNG data URL
 */
function cropScreenshot(dataUrl, selection) {
  const image = nativeImage.createFromDataURL(dataUrl);
  const imageSize = image.getSize();
  const cropRect = {
    x: Math.max(0, Math.min(imageSize.width - 1, Math.round(selection.x))),
    y: Math.max(0, Math.min(imageSize.height - 1, Math.round(selection.y))),
    width: Math.max(1, Math.min(imageSize.width, Math.round(selection.width))),
    height: Math.max(1, Math.min(imageSize.height, Math.round(selection.height))),
  };

  return image.crop(cropRect).toDataURL();
}

/**
 * 根据截图框选选区与发送方 overlay 窗口，定位所属显示器并裁剪出选区图像。
 * 选区坐标为显示器本地坐标；优先按窗口 bounds 精确匹配，失败则按中心点回退。
 * @param selection overlay 回传的选区（display-local）
 * @param senderWindow 触发确认的 overlay 窗口
 * @returns 包含所属 displayId 与裁剪图像的对象；定位失败返回 null
 */
function resolveCaptureFromOverlaySelection(selection, senderWindow) {
  // Per-display overlay: selection coords are already display-local.
  // Match by center point — most robust across macOS window manager quirks.
  let windowBounds;
  try {
    windowBounds = senderWindow.getBounds();
  } catch {
    return null;
  }

  const centerX = windowBounds.x + selection.x + selection.width / 2;
  const centerY = windowBounds.y + selection.y + selection.height / 2;

  // Try exact bounds match first, then center-point fallback
  const captureDisplay = hostState.captureDisplays.find((display) => {
    const db = display.bounds;
    return (Math.abs(db.x - windowBounds.x) <= 1 &&
      Math.abs(db.y - windowBounds.y) <= 1 &&
      Math.abs(db.width - windowBounds.width) <= 1 &&
      Math.abs(db.height - windowBounds.height) <= 1);
  }) ?? hostState.captureDisplays.find((display) => {
    const { x, y, width, height } = display.bounds;
    return centerX >= x && centerX <= x + width && centerY >= y && centerY <= y + height;
  });

  if (!captureDisplay) {
    return null;
  }

  return resolveForDisplay(captureDisplay, selection);
}

function resolveForDisplay(captureDisplay, selection) {
  const scaleX = captureDisplay.thumbnailSize.width / captureDisplay.bounds.width;
  const scaleY = captureDisplay.thumbnailSize.height / captureDisplay.bounds.height;
  return {
    displayId: captureDisplay.displayId,
    imageDataUrl: cropScreenshot(captureDisplay.screenshotDataUrl, {
      x: selection.x * scaleX,
      y: selection.y * scaleY,
      width: selection.width * scaleX,
      height: selection.height * scaleY,
    }),
  };
}

async function finalizeSingleCapture(imageDataUrl) {
  // Show result window immediately with loading state
  hostState.recentCaptureResult = {
    text: '',
    capturedAt: new Date().toISOString(),
    wasEmpty: false,
    imageDataUrl,
    loading: true,
  };
  showResultWindow();
  broadcastShellState();

  try {
    console.log(`[ocr] Recognising image, data URL length: ${imageDataUrl?.length ?? 0}`);
    const recognizedText = await recognizeTextFromImage(imageDataUrl);
    console.log(`[ocr] Recognition complete, text length: ${recognizedText.length}`);
    hostState.recentCaptureResult = {
      text: recognizedText,
      capturedAt: new Date().toISOString(),
      wasEmpty: recognizedText.trim().length === 0,
      imageDataUrl,
      loading: false,
    };
  } catch (err) {
    console.error('[ocr] Recognition failed:', err.message);
    hostState.captureErrorMessage = '本机离线识别失败，请确认当前 macOS 可用 Vision OCR 后重试。';
    hostState.recentCaptureResult = {
      text: '',
      capturedAt: new Date().toISOString(),
      wasEmpty: true,
      imageDataUrl,
      loading: false,
    };
  }

  persistState();
  broadcastShellState();
}

/**
 * 处理 overlay 提交的框选结果：在关闭 overlay 前定位发送方窗口与选区并裁剪；
 * long 模式进入长截图会话并启动自动采集，否则走单次识别流程。
 * @param event IPC 事件（用于定位 sender 窗口）
 * @param selection 框选选区
 * @returns { success }
 */
async function completeScreenCapture(event, selection) {
  if (!hostState.activeCaptureSession) {
    return { success: false };
  }

  const session = hostState.activeCaptureSession;
  const senderWindow = BrowserWindow.fromWebContents(event.sender);

  // Capture sender window info BEFORE closing overlays (windows get destroyed)
  let resolvedCapture;
  let senderBounds = null;
  try {
    if (senderWindow && !senderWindow.isDestroyed()) {
      senderBounds = senderWindow.getBounds();
      resolvedCapture = resolveCaptureFromOverlaySelection(selection, senderWindow);
    }
  } catch {
    // Window may already be gone
  }

  hostState.activeCaptureSession = null;
  hostState.captureErrorMessage = null;
  closeCaptureOverlay();

  if (!resolvedCapture) {
    hostState.captureDisplays = [];
    hostState.captureErrorMessage = '当前未能定位你选择的屏幕区域，请重新框选。';
    broadcastShellState();
    return { success: false };
  }

  const imageDataUrl = resolvedCapture.imageDataUrl;

  if (session.mode === 'long') {
    // Use the SAME capture path as subsequent segments so the first segment
    // has identical resolution/coordinates (avoids stitch misalignment).
    const firstSegmentImage = await captureLongSegmentImage({
      selection,
      displayId: resolvedCapture.displayId,
    });
    const firstImageDataUrl = firstSegmentImage ?? imageDataUrl;

    let recognizedText = '';

    try {
      recognizedText = await recognizeTextFromImage(firstImageDataUrl);
    } catch {
      hostState.captureErrorMessage = '长截图首段识别失败，你仍可继续采集后续分段并在完成后统一编辑。';
    }

    const targetDisplay = hostState.captureDisplays.find(
      (d) => d.displayId === resolvedCapture.displayId,
    );

    hostState.longCaptureSession = {
      selection,
      displayId: resolvedCapture.displayId,
      displayBounds: senderBounds ?? targetDisplay?.bounds ?? { x: 0, y: 0, width: 1920, height: 1080 },
      segmentsCaptured: 1,
      latestSegmentPreview: firstImageDataUrl,
      latestSegmentThumbnail: makeThumbnailDataUrl(firstImageDataUrl),
      capturedTexts: [recognizedText],
      mode: 'auto',
      isPaused: false,
      capturedImages: [firstImageDataUrl],
    };
    hostState.captureDisplays = [];
    showLongToolbarWindow();
    broadcastShellState();
    // Start auto-capture timer (default mode is 'auto')
    startAutoCaptureTimer();
    return { success: true };
  }

  hostState.captureDisplays = [];

  await finalizeSingleCapture(imageDataUrl);
  broadcastShellState();
  return { success: true };
}

// Shared capture path so the FIRST segment and subsequent segments use the
// exact same resolution (logical 1x) and coordinate handling. This keeps all
// stitched images dimensionally consistent.
async function captureLongSegmentImage(session) {
  const displays = screen.getAllDisplays();
  const targetDisplay = displays.find((d) => `${d.id}` === session.displayId) ?? screen.getPrimaryDisplay();

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: targetDisplay.size.width, height: targetDisplay.size.height },
  });
  const source =
    sources.find((item) => item.display_id === session.displayId) ??
    sources.find((item) => item.display_id === `${targetDisplay.id}`) ??
    sources[0];
  if (!source) {
    return null;
  }

  // Selection is in display-local logical coords (overlay matches its display bounds)
  const displayBounds = targetDisplay.bounds;
  const thumbnailSize = source.thumbnail.getSize();
  const scaleX = thumbnailSize.width / displayBounds.width;
  const scaleY = thumbnailSize.height / displayBounds.height;

  const displayLocalSelection = {
    x: Math.round(session.selection.x * scaleX),
    y: Math.round(session.selection.y * scaleY),
    width: Math.round(session.selection.width * scaleX),
    height: Math.round(session.selection.height * scaleY),
  };

  return cropScreenshot(source.thumbnail.toDataURL(), displayLocalSelection);
}

async function captureLongSegment() {
  if (!hostState.longCaptureSession) {
    return { success: false };
  }

  refreshPermissionState();
  if (hostState.permissions.screenCapture !== 'granted') {
    hostState.captureErrorMessage = '当前无法继续长截图：请先在系统设置中保持"屏幕录制"权限已开启。';
    broadcastShellState();
    return { success: false };
  }

  const session = hostState.longCaptureSession;
  const imageDataUrl = await captureLongSegmentImage(session);
  if (!imageDataUrl) {
    hostState.captureErrorMessage = '当前未能读取下一段屏幕内容，请稍后再试。';
    broadcastShellState();
    return { success: false };
  }

  hostState.longCaptureSession.latestSegmentPreview = imageDataUrl;
  hostState.longCaptureSession.latestSegmentThumbnail = makeThumbnailDataUrl(imageDataUrl);
  hostState.captureErrorMessage = null;

  // Store image for stitching
  if (!hostState.longCaptureSession.capturedImages) {
    hostState.longCaptureSession.capturedImages = [];
  }
  hostState.longCaptureSession.capturedImages.push(imageDataUrl);

  try {
    const recognizedText = await recognizeTextFromImage(imageDataUrl);
    hostState.longCaptureSession.capturedTexts.push(recognizedText);
    hostState.longCaptureSession.segmentsCaptured += 1;
  } catch {
    hostState.captureErrorMessage = '当前分段识别失败，你可以继续采集下一段或直接完成本次长截图。';
    hostState.longCaptureSession.capturedTexts.push('');
    hostState.longCaptureSession.segmentsCaptured += 1;
  }

  broadcastShellState();
  return { success: true };
}

async function finishLongCapture() {
  if (!hostState.longCaptureSession) {
    return { success: false };
  }

  stopAutoCaptureTimer();

  const session = hostState.longCaptureSession;
  const mergedText = (session.capturedTexts?.length ?? 0) > 0
    ? mergeLongCaptureText(session.capturedTexts)
    : '';

  // Step 1: Stitch captured images (relatively fast)
  let longImageDataUrl = null;

  if (session.capturedImages && session.capturedImages.length > 0) {
    try {
      longImageDataUrl = await stitchLongImage(session.capturedImages);
    } catch (err) {
      console.error('Long image stitching failed:', err);
    }
  }

  if (!longImageDataUrl && session.latestSegmentPreview) {
    longImageDataUrl = session.latestSegmentPreview;
  }

  // Step 2: Show result window immediately with loading + long image preview
  hostState.recentCaptureResult = {
    text: mergedText,
    capturedAt: new Date().toISOString(),
    wasEmpty: mergedText.trim().length === 0,
    imageDataUrl: session.capturedImages?.[0] ?? session.latestSegmentPreview ?? null,
    longImageDataUrl,
    loading: true,
  };

  hostState.longCaptureSession = null;
  hostState.captureErrorMessage = null;
  _longCaptureNoChangeCount = 0;
  closeLongToolbarWindow();
  destroyStitcherWindow();
  persistState();
  showResultWindow();
  broadcastShellState();

  // Step 3: OCR the full long image (may take time)
  let fullOcrText = '';
  if (longImageDataUrl) {
    try {
      fullOcrText = await recognizeTextFromImage(longImageDataUrl);
    } catch {
      // Fall back to merged segment text
    }
  }

  const finalText = fullOcrText.trim() || mergedText;
  hostState.recentCaptureResult = {
    text: finalText,
    capturedAt: new Date().toISOString(),
    wasEmpty: finalText.trim().length === 0,
    imageDataUrl: session.latestSegmentPreview,
    longImageDataUrl,
    loading: false,
  };

  persistState();
  broadcastShellState();
  return { success: true };
}

async function cancelCaptureSession() {
  hostState.activeCaptureSession = null;
  hostState.longCaptureSession = null;
  hostState.captureErrorMessage = '已取消当前截图会话。';
  _longCaptureNoChangeCount = 0;
  stopAutoCaptureTimer();
  closeCaptureOverlay();
  closeLongToolbarWindow();
  destroyStitcherWindow();
  broadcastShellState();
  return { success: true };
}

function closeCurrentWindow(event) {
  const window = BrowserWindow.fromWebContents(event.sender);
  window?.hide();
  return { success: true };
}

function saveShortcutPreference(_, request) {
  const mode = request?.mode;
  const accelerator = request?.accelerator?.trim();
  if ((mode !== 'single' && mode !== 'long' && mode !== 'menu') || !accelerator) {
    hostState.shortcutRegistrationError = '请输入可注册的快捷键格式，例如 CommandOrControl+Shift+1。';
    broadcastShellState();
    return { success: false };
  }

  const previousPreferences = {
    single: { ...hostState.shortcutPreferences.single },
    long: { ...hostState.shortcutPreferences.long },
    menu: { ...hostState.shortcutPreferences.menu },
  };
  updateShortcutPreference(mode, accelerator);
  const registered = registerScreenshotShortcut();

  if (!registered) {
    hostState.shortcutPreferences = previousPreferences;
    registerScreenshotShortcut();
    persistState();
    broadcastShellState();
    return { success: false };
  }

  broadcastShellState();
  return { success: true };
}

function saveAdvancedFeatures(_, request) {
  const value = request?.config;
  const af = value && typeof value === 'object' ? value : {};

  hostState.advancedFeatures = {
    enabled: typeof af.enabled === 'boolean' ? af.enabled : true,
    filterSymbols: Array.isArray(af.filterSymbols)
      ? af.filterSymbols.filter((s) => typeof s === 'string').slice(0, 200)
      : [],
    charReplacements: Array.isArray(af.charReplacements)
      ? af.charReplacements
          .filter((r) => r && typeof r === 'object')
          .map((r) => ({
            source: typeof r.source === 'string' ? r.source : '',
            target: typeof r.target === 'string' ? r.target : '',
          }))
          .slice(0, 200)
      : [],
    regexRules: Array.isArray(af.regexRules)
      ? af.regexRules
          .filter((r) => r && typeof r === 'object')
          .map((r) => ({
            pattern: typeof r.pattern === 'string' ? r.pattern : '',
            replacement: typeof r.replacement === 'string' ? r.replacement : '',
            flags: typeof r.flags === 'string' ? r.flags : 'g',
            mode: r.mode === 'filter' ? 'filter' : 'replace',
          }))
          .slice(0, 200)
      : [],
  };

  persistState();
  broadcastShellState();
  return { success: true };
}

function saveRecentResultText(_, request) {
  if (!hostState.recentCaptureResult) {
    return { success: false };
  }

  const text = typeof request?.text === 'string' ? request.text : '';
  hostState.recentCaptureResult = {
    ...hostState.recentCaptureResult,
    text,
    wasEmpty: text.trim().length === 0,
  };
  persistState();
  broadcastShellState();
  return { success: true };
}

function copyResultText(_, request) {
  const text = typeof request?.text === 'string' ? request.text : '';
  if (text.startsWith('data:image/')) {
    try {
      const image = nativeImage.createFromDataURL(text);
      clipboard.writeImage(image);
      return { success: true };
    } catch {
      // fall through to text copy
    }
  }
  clipboard.writeText(text);
  return { success: true };
}

function setLongCaptureMode(_, request) {
  if (!hostState.longCaptureSession) {
    return { success: false };
  }

  const mode = request?.mode;
  if (mode !== 'auto' && mode !== 'manual') {
    return { success: false };
  }

  hostState.longCaptureSession.mode = mode;
  hostState.longCaptureSession.isPaused = false;
  _longCaptureNoChangeCount = 0;

  if (mode === 'auto') {
    startAutoCaptureTimer();
  } else {
    stopAutoCaptureTimer();
  }

  broadcastShellState();
  return { success: true };
}

function toggleLongCapturePause() {
  if (!hostState.longCaptureSession) {
    return { success: false };
  }

  if (hostState.longCaptureSession.mode !== 'auto') {
    return { success: false };
  }

  hostState.longCaptureSession.isPaused = !hostState.longCaptureSession.isPaused;
  _longCaptureNoChangeCount = 0;
  broadcastShellState();
  return { success: true };
}

async function saveLongImage() {
  if (!hostState.recentCaptureResult?.longImageDataUrl) {
    return { success: false };
  }

  const defaultPath = path.join(
    app.getPath('desktop'),
    `long-screenshot-${Date.now()}.png`,
  );

  try {
    const { canceled, filePath } = await dialog.showSaveDialog(
      resultWindow && !resultWindow.isDestroyed() ? resultWindow : undefined,
      {
        title: '保存长图',
        defaultPath,
        filters: [{ name: 'PNG 图片', extensions: ['png'] }],
      },
    );

    if (canceled || !filePath) {
      return { success: false, canceled: true };
    }

    const tempPath = writeImageDataUrlToTempFile(hostState.recentCaptureResult.longImageDataUrl);
    fs.copyFileSync(tempPath, filePath);
    fs.rmSync(tempPath, { force: true });
    return { success: true, path: filePath };
  } catch (err) {
    console.error('Save long image failed:', err);
    return { success: false };
  }
}

function openScreenCapturePreferences() {
  if (process.platform !== 'darwin') {
    return { success: false };
  }

  execFile('open', ['x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture']);
  return { success: true };
}

function registerIpcHandlers() {
  ipcMain.handle('desktop-host:get-shell-state', () => {
    refreshPermissionState();
    return getShellState();
  });

  ipcMain.handle('desktop-host:show-result-window', () => {
    showResultWindow();
    return { success: true };
  });

  ipcMain.handle('desktop-host:show-settings-window', () => {
    showSettingsWindow();
    return { success: true };
  });

  ipcMain.handle('desktop-host:toggle-panel-window', () => {
    togglePanelWindow();
    return { success: true };
  });

  ipcMain.handle('desktop-host:start-screen-capture', () => startScreenCapture('single'));
  ipcMain.handle('desktop-host:start-long-screen-capture', () => startScreenCapture('long'));

  // Keep the screenshot cursor consistent across every physical display.
  // On macOS, win.setCursor() only sticks for the *key* window. When the pointer
  // crosses from one overlay (screen) to another, the newly-entered window is not
  // key, so macOS reverts to the system default arrow. Re-asserting the cursor and
  // focusing the window under the pointer fixes the cross-screen reset.
  ipcMain.handle('desktop-host:activate-overlay', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      try {
        win.setCursor('crosshair');
      } catch {
        // Ignore transient cursor errors.
      }
      if (!win.isFocused()) {
        try {
          win.focus();
        } catch {
          // Ignore focus errors (window may be closing).
        }
      }
    }
    return { success: true };
  });
  ipcMain.handle('desktop-host:complete-screen-capture', completeScreenCapture);
  ipcMain.handle('desktop-host:cancel-capture-session', cancelCaptureSession);
  ipcMain.handle('desktop-host:capture-long-segment', captureLongSegment);
  ipcMain.handle('desktop-host:finish-long-capture', finishLongCapture);
  ipcMain.handle('desktop-host:set-long-capture-mode', setLongCaptureMode);
  ipcMain.handle('desktop-host:toggle-long-capture-pause', toggleLongCapturePause);
  ipcMain.handle('desktop-host:save-long-image', saveLongImage);
  ipcMain.handle('desktop-host:save-recent-result-text', saveRecentResultText);
  ipcMain.handle('desktop-host:save-shortcut-preference', saveShortcutPreference);
  ipcMain.handle('desktop-host:save-advanced-features', saveAdvancedFeatures);
  ipcMain.handle('desktop-host:copy-result-text', copyResultText);
  ipcMain.handle('desktop-host:get-recent-capture-images', () => {
    const r = hostState.recentCaptureResult;
    return {
      imageDataUrl: r?.imageDataUrl ?? null,
      longImageDataUrl: r?.longImageDataUrl ?? null,
    };
  });
  ipcMain.handle('desktop-host:open-screen-capture-preferences', openScreenCapturePreferences);
  ipcMain.handle('desktop-host:set-auto-launch', setAutoLaunch);
  ipcMain.handle('desktop-host:close-current-window', closeCurrentWindow);
  ipcMain.handle('desktop-host:request-window-fit', (event, contentHeight) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) {
      return { success: false };
    }
    try {
      const maxH = Math.max(360, Math.floor(screen.getPrimaryDisplay().workArea.height - 40));
      const target = Math.min(Math.max(Math.round(Number(contentHeight) || 0), 200), maxH);
      const [width] = win.getSize();
      win.setSize(width, target, true);
      return { success: true };
    } catch {
      return { success: false };
    }
  });
}

app.whenReady().then(() => {
  const startTs = Date.now();
  loadPersistedState();
  initAutoLaunch();
  refreshPermissionState();
  registerScreenshotShortcut();
  registerIpcHandlers();
  createTray();
  ensurePanelWindow();
  // Each window fetches its own state on mount (`useDesktopHostState` calls
  // getShellState), so the eager broadcast is unnecessary and would otherwise
  // push a full shell snapshot over IPC right at startup.
  console.log(`[perf] App ready in ${Date.now() - startTs}ms`);

  // Warm the compiled OCR binary in the background so the first capture does
  // not pay the swiftc cost. Non-blocking; falls back to `swift` if needed.
  void ensureOcrExecutable();

  app.on('activate', () => {
    togglePanelWindow();
  });

  if (isDevelopment()) {
    const window = ensurePanelWindow();
    window.center();
    window.show();
    window.focus();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});
