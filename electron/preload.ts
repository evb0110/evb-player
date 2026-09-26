import {contextBridge, ipcRenderer} from 'electron';
import type {
  IFolder,
  IPlayerApi,
  IRecentFolder,
  ISaveLessonProgressPayload,
  TFolderProgress,
} from '../shared/types';

const api: IPlayerApi = {
  chooseFolder: () => ipcRenderer.invoke('folder:choose') as Promise<IFolder | null>,
  openRecentFolder: (rootPath: string) => ipcRenderer.invoke('folder:open-recent', rootPath) as Promise<IFolder | null>,
  restoreLastFolder: () => ipcRenderer.invoke('folder:restore-last') as Promise<IFolder | null>,
  getRecentFolders: () => ipcRenderer.invoke('folder:get-recent') as Promise<IRecentFolder[]>,
  removeRecentFolder: (rootPath: string) => ipcRenderer.invoke('folder:remove-recent', rootPath) as Promise<void>,
  revealFolder: (rootPath: string) => ipcRenderer.invoke('folder:reveal', rootPath) as Promise<void>,
  getFolderProgress: (folderId: string) => ipcRenderer.invoke('progress:get', folderId) as Promise<TFolderProgress>,
  saveLessonProgress: (payload: ISaveLessonProgressPayload) => ipcRenderer.invoke('progress:save', payload) as Promise<void>,
  clearLessonProgress: (folderId: string, lessonId: string) => ipcRenderer.invoke('progress:clear-lesson', folderId, lessonId) as Promise<void>,
  clearFolderProgress: (folderId: string) => ipcRenderer.invoke('progress:clear', folderId) as Promise<void>,
  openMediaExternally: (mediaUrl: string) => ipcRenderer.invoke('media:open-external', mediaUrl) as Promise<void>,
  setWindowFullscreen: (fullscreen: boolean) => ipcRenderer.invoke('window:set-fullscreen', fullscreen) as Promise<boolean>,
  onWindowFullscreenChanged: (listener: (fullscreen: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, fullscreen: unknown) => listener(fullscreen === true);
    ipcRenderer.on('window:fullscreen-changed', handler);
    return () => ipcRenderer.removeListener('window:fullscreen-changed', handler);
  },
  getReadyUpdate: () => ipcRenderer.invoke('update:get-ready') as Promise<string | null>,
  onUpdateReady: (listener: (version: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, version: unknown) => {
      if (typeof version === 'string') {
        listener(version);
      }
    };
    ipcRenderer.on('update:ready', handler);
    return () => ipcRenderer.removeListener('update:ready', handler);
  },
  installUpdate: () => ipcRenderer.invoke('update:install') as Promise<void>,
};

contextBridge.exposeInMainWorld('evbPlayer', api);
