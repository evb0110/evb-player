import {contextBridge, ipcRenderer} from 'electron';
import type {
  ICourse,
  ICourseShelfApi,
  IRecentCourse,
  ISaveLessonProgressPayload,
  TCourseProgress,
} from '../shared/types';

const api: ICourseShelfApi = {
  chooseFolder: () => ipcRenderer.invoke('course:choose-folder') as Promise<ICourse | null>,
  openRecentCourse: (rootPath: string) => ipcRenderer.invoke('course:open-recent', rootPath) as Promise<ICourse | null>,
  restoreLastCourse: () => ipcRenderer.invoke('course:restore-last') as Promise<ICourse | null>,
  getRecentCourses: () => ipcRenderer.invoke('course:get-recent') as Promise<IRecentCourse[]>,
  getCourseProgress: (courseId: string) => ipcRenderer.invoke('progress:get', courseId) as Promise<TCourseProgress>,
  saveLessonProgress: (payload: ISaveLessonProgressPayload) => ipcRenderer.invoke('progress:save', payload) as Promise<void>,
  clearLessonProgress: (courseId: string, lessonId: string) => ipcRenderer.invoke('progress:clear-lesson', courseId, lessonId) as Promise<void>,
  clearCourseProgress: (courseId: string) => ipcRenderer.invoke('progress:clear', courseId) as Promise<void>,
  setWindowFullscreen: (fullscreen: boolean) => ipcRenderer.invoke('window:set-fullscreen', fullscreen) as Promise<boolean>,
  onWindowFullscreenChanged: (listener: (fullscreen: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, fullscreen: unknown) => listener(fullscreen === true);
    ipcRenderer.on('window:fullscreen-changed', handler);
    return () => ipcRenderer.removeListener('window:fullscreen-changed', handler);
  },
};

contextBridge.exposeInMainWorld('courseShelf', api);
