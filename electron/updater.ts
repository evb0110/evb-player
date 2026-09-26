import {app, ipcMain, type BrowserWindow, type WebContents} from 'electron';
// A named import: electron-updater marks itself as an ES module, so a default import compiles to an undefined `.default`.
import {autoUpdater} from 'electron-updater';

const FIRST_CHECK_DELAY_MS = 10_000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

// Checks GitHub Releases for a newer version, downloads it in the background, and tells the
// renderer once it is ready. The update installs on the next quit, or right away from the toast.
export function startUpdater(getWindow: () => BrowserWindow | null, isTrustedRenderer: (sender: WebContents) => boolean) {
  let readyVersion: string | null = null;
  ipcMain.handle('update:get-ready', (event) => isTrustedRenderer(event.sender) ? readyVersion : null);
  ipcMain.handle('update:install', (event) => {
    if (isTrustedRenderer(event.sender) && readyVersion) {
      autoUpdater.quitAndInstall();
    }
  });

  // Source runs have no release feed; EVB_PLAYER_DISABLE_UPDATES keeps test runs of packaged builds offline.
  if (!app.isPackaged || process.env.EVB_PLAYER_DISABLE_UPDATES) {
    return;
  }

  autoUpdater.autoDownload = true;
  // Installing a .deb asks for an administrator password, so Linux installs only when the user restarts from the toast.
  autoUpdater.autoInstallOnAppQuit = process.platform !== 'linux';
  autoUpdater.on('update-downloaded', (info) => {
    readyVersion = info.version;
    getWindow()?.webContents.send('update:ready', info.version);
  });
  autoUpdater.on('error', () => {
    // Offline or no published release yet; the next scheduled check tries again.
  });

  const check = () => {
    void autoUpdater.checkForUpdates().catch(() => undefined);
  };
  setTimeout(check, FIRST_CHECK_DELAY_MS);
  setInterval(check, CHECK_INTERVAL_MS);
}
