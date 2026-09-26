import {app, ipcMain, type BrowserWindow, type WebContents} from 'electron';
// A named import: electron-updater marks itself as an ES module, so a default import compiles to an undefined `.default`.
import {autoUpdater} from 'electron-updater';
import type {IUpdateStatus} from '../shared/types';

const FIRST_CHECK_DELAY_MS = 10_000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

interface IUpdaterSettings {
  getSkippedVersion(): Promise<string | null>;
  setSkippedVersion(version: string): Promise<void>;
}

function compareVersions(left: string, right: string) {
  const leftParts = left.split(/[.+-]/).slice(0, 3).map(Number);
  const rightParts = right.split(/[.+-]/).slice(0, 3).map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

function validVersion(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= 64
    && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value);
}

export function startUpdater(
  getWindow: () => BrowserWindow | null,
  isTrustedRenderer: (sender: WebContents) => boolean,
  settings: IUpdaterSettings,
) {
  const currentVersion = app.getVersion();
  const requiresPassword = process.platform === 'linux';
  let status: IUpdateStatus = {phase: 'idle', currentVersion, manual: false, requiresPassword};
  let currentCheck: Promise<void> | null = null;
  let activeCheckManual = false;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = process.platform !== 'linux';

  const publishStatus = (next: IUpdateStatus) => {
    status = next;
    getWindow()?.webContents.send('update:status', {...status});
  };

  const idleStatus = (manual = false): IUpdateStatus => ({phase: 'idle', currentVersion, manual, requiresPassword});

  const checkForUpdates = async (manual: boolean) => {
    if (!app.isPackaged || process.env.EVB_PLAYER_DISABLE_UPDATES) {
      if (manual) {
        publishStatus({phase: 'error', currentVersion, manual: true, requiresPassword});
      }
      return;
    }
    // Once an update is downloading or downloaded, a check would only offer it again; a manual
    // check shows where it stands instead.
    if (status.phase === 'downloading' || status.phase === 'ready') {
      if (manual) {
        publishStatus({...status, manual: true});
      }
      return;
    }
    if (currentCheck) {
      if (manual && !activeCheckManual) {
        activeCheckManual = true;
        publishStatus({phase: 'checking', currentVersion, manual: true, requiresPassword});
      }
      return currentCheck;
    }

    activeCheckManual = manual;
    publishStatus({phase: 'checking', currentVersion, manual, requiresPassword});
    const check = async () => {
      try {
        const result = await autoUpdater.checkForUpdates();
        if (!result) {
          throw new Error('The update check returned no result.');
        }
        const checkWasManual = activeCheckManual;
        if (!result.isUpdateAvailable) {
          publishStatus(checkWasManual
            ? {phase: 'up-to-date', currentVersion, manual: true, requiresPassword}
            : idleStatus());
          return;
        }

        const version = result.updateInfo.version;
        const skippedVersion = await settings.getSkippedVersion();
        if (!checkWasManual && skippedVersion && compareVersions(version, skippedVersion) <= 0) {
          publishStatus(idleStatus());
          return;
        }
        publishStatus({phase: 'available', currentVersion, version, manual: checkWasManual, requiresPassword});
      } catch {
        publishStatus(activeCheckManual
          ? {phase: 'error', currentVersion, manual: true, requiresPassword}
          : idleStatus());
      } finally {
        currentCheck = null;
        activeCheckManual = false;
      }
    };
    currentCheck = check();
    return currentCheck;
  };

  const downloadUpdate = async () => {
    if (status.phase !== 'available' || !status.version) {
      return;
    }
    const {version, manual} = status;
    publishStatus({phase: 'downloading', currentVersion, version, percent: 0, manual, requiresPassword});
    try {
      await autoUpdater.downloadUpdate();
    } catch {
      publishStatus({phase: 'error', currentVersion, version, manual, requiresPassword});
    }
  };

  ipcMain.handle('update:get-status', (event) => isTrustedRenderer(event.sender) ? {...status} : idleStatus());
  ipcMain.handle('update:check', (event) => isTrustedRenderer(event.sender) ? checkForUpdates(true) : undefined);
  ipcMain.handle('update:download', (event) => isTrustedRenderer(event.sender) ? downloadUpdate() : undefined);
  ipcMain.handle('update:install', (event) => {
    if (isTrustedRenderer(event.sender) && status.phase === 'ready') {
      autoUpdater.quitAndInstall();
    }
  });
  ipcMain.handle('update:skip', async (event, version: unknown) => {
    if (!isTrustedRenderer(event.sender) || !validVersion(version) || status.phase !== 'available' || version !== status.version) {
      return;
    }
    await settings.setSkippedVersion(version);
    publishStatus(idleStatus());
  });

  autoUpdater.on('download-progress', (progress) => {
    if (status.phase !== 'downloading' || !status.version) {
      return;
    }
    publishStatus({
      phase: 'downloading',
      currentVersion,
      version: status.version,
      percent: Math.max(0, Math.min(100, Math.round(progress.percent))),
      manual: status.manual,
      requiresPassword,
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    publishStatus({
      phase: 'ready',
      currentVersion,
      version: info.version,
      manual: status.manual,
      requiresPassword,
    });
  });

  if (app.isPackaged && !process.env.EVB_PLAYER_DISABLE_UPDATES) {
    const firstCheck = setTimeout(() => void checkForUpdates(false), FIRST_CHECK_DELAY_MS);
    const interval = setInterval(() => void checkForUpdates(false), CHECK_INTERVAL_MS);
    firstCheck.unref();
    interval.unref();
  }

}
