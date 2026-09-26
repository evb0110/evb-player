import {contextBridge, ipcRenderer} from 'electron';
import type {
  ICourse,
  IPlayerApi,
  IRecentCourse,
  ISaveLessonProgressPayload,
  TCourseProgress,
} from '../shared/types';

const api: IPlayerApi = {
  chooseFolder: () => ipcRenderer.invoke('course:choose-folder') as Promise<ICourse | null>,
  openRecentCourse: (rootPath: string) => ipcRenderer.invoke('course:open-recent', rootPath) as Promise<ICourse | null>,
  restoreLastCourse: () => ipcRenderer.invoke('course:restore-last') as Promise<ICourse | null>,
  getRecentCourses: () => ipcRenderer.invoke('course:get-recent') as Promise<IRecentCourse[]>,
  removeRecentCourse: (rootPath: string) => ipcRenderer.invoke('course:remove-recent', rootPath) as Promise<void>,
  revealCourse: (rootPath: string) => ipcRenderer.invoke('course:reveal', rootPath) as Promise<void>,
  getCourseProgress: (courseId: string) => ipcRenderer.invoke('progress:get', courseId) as Promise<TCourseProgress>,
  saveLessonProgress: (payload: ISaveLessonProgressPayload) => ipcRenderer.invoke('progress:save', payload) as Promise<void>,
  clearLessonProgress: (courseId: string, lessonId: string) => ipcRenderer.invoke('progress:clear-lesson', courseId, lessonId) as Promise<void>,
  clearCourseProgress: (courseId: string) => ipcRenderer.invoke('progress:clear', courseId) as Promise<void>,
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
