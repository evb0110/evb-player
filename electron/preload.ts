import {contextBridge, ipcRenderer} from 'electron';
import type {
  IFolder,
  IMediaTrack,
  IPlayerSettings,
  IPlayerApi,
  IRecentFolderSummary,
  ISavePlaylistPayload,
  ISaveTrackProgressPayload,
  IUpdateStatus,
  TLocale,
  TMenuAction,
  TTheme,
  TFolderProgress,
} from '../shared/types';

const api: IPlayerApi = {
  capabilities: {revealFolder: true, openMediaExternally: true, updates: true, addFromOtherFolders: true},
  getSettings: () => ipcRenderer.invoke('settings:get') as Promise<IPlayerSettings>,
  setTheme: (theme: TTheme) => ipcRenderer.invoke('settings:set-theme', theme) as Promise<void>,
  setLocale: (locale: TLocale) => ipcRenderer.invoke('settings:set-locale', locale) as Promise<void>,
  chooseFolder: () => ipcRenderer.invoke('folder:choose') as Promise<IFolder | null>,
  openRecentFolder: (rootPath: string) => ipcRenderer.invoke('folder:open-recent', rootPath) as Promise<IFolder | null>,
  restoreLastFolder: () => ipcRenderer.invoke('folder:restore-last') as Promise<IFolder | null>,
  getRecentFolders: () => ipcRenderer.invoke('folder:get-recent') as Promise<IRecentFolderSummary[]>,
  getFolderTracks: (folderId: string, forFolderId: string) => ipcRenderer.invoke('folder:get-tracks', folderId, forFolderId) as Promise<IMediaTrack[]>,
  savePlaylist: (payload: ISavePlaylistPayload) => ipcRenderer.invoke('playlist:save', payload) as Promise<void>,
  removeRecentFolder: (rootPath: string) => ipcRenderer.invoke('folder:remove-recent', rootPath) as Promise<void>,
  closeFolder: async () => undefined,
  revealFolder: (rootPath: string) => ipcRenderer.invoke('folder:reveal', rootPath) as Promise<void>,
  getFolderProgress: (folderId: string) => ipcRenderer.invoke('progress:get', folderId) as Promise<TFolderProgress>,
  saveTrackProgress: (payload: ISaveTrackProgressPayload) => ipcRenderer.invoke('progress:save', payload) as Promise<void>,
  clearTrackProgress: (folderId: string, trackId: string) => ipcRenderer.invoke('progress:clear-track', folderId, trackId) as Promise<void>,
  clearFolderProgress: (folderId: string) => ipcRenderer.invoke('progress:clear', folderId) as Promise<void>,
  openMediaExternally: (mediaUrl: string) => ipcRenderer.invoke('media:open-external', mediaUrl) as Promise<void>,
  setWindowFullscreen: (fullscreen: boolean) => ipcRenderer.invoke('window:set-fullscreen', fullscreen) as Promise<boolean>,
  onWindowFullscreenChanged: (listener: (fullscreen: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, fullscreen: unknown) => listener(fullscreen === true);
    ipcRenderer.on('window:fullscreen-changed', handler);
    return () => ipcRenderer.removeListener('window:fullscreen-changed', handler);
  },
  onMenuAction: (listener: (action: TMenuAction) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, action: unknown) => {
      if (action === 'add-folder' || action === 'keyboard-shortcuts' || action === 'check-for-updates') {
        listener(action);
      }
    };
    ipcRenderer.on('menu:action', handler);
    return () => ipcRenderer.removeListener('menu:action', handler);
  },
  getUpdateStatus: () => ipcRenderer.invoke('update:get-status') as Promise<IUpdateStatus>,
  onUpdateStatus: (listener: (status: IUpdateStatus) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: IUpdateStatus) => listener(status);
    ipcRenderer.on('update:status', handler);
    return () => ipcRenderer.removeListener('update:status', handler);
  },
  checkForUpdates: () => ipcRenderer.invoke('update:check') as Promise<void>,
  downloadUpdate: () => ipcRenderer.invoke('update:download') as Promise<void>,
  installUpdate: () => ipcRenderer.invoke('update:install') as Promise<void>,
  skipUpdate: (version: string) => ipcRenderer.invoke('update:skip', version) as Promise<void>,
};

contextBridge.exposeInMainWorld('evbPlayer', api);
contextBridge.exposeInMainWorld('evbPlayerInitialTheme', ipcRenderer.sendSync('settings:initial-theme') as TTheme);
