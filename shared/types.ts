export type TMediaKind = 'video' | 'audio';
export type TTheme = 'system' | 'light' | 'dark';
export type TLocale = 'en' | 'ru' | 'fr' | 'de' | 'es' | 'it' | 'pt' | 'pt-BR' | 'nl';

export interface IPlayerSettings {
  theme: TTheme;
  locale: TLocale;
}

export interface IMediaLesson {
  id: string;
  sequence: number;
  title: string;
  fileName: string;
  relativePath: string;
  section: string;
  kind: TMediaKind;
  mediaUrl: string;
  bytes: number;
  duration: number | null;
}

export interface IFolder {
  id: string;
  name: string;
  rootPath: string;
  lessons: IMediaLesson[];
  videoCount: number;
  audioCount: number;
  totalBytes: number;
  totalDuration: number;
  scannedAt: number;
}

export interface IRecentFolder {
  id: string;
  name: string;
  rootPath: string;
  mediaCount: number;
  lastOpenedAt: number;
}

export interface ILessonProgress {
  position: number;
  duration: number;
  completed: boolean;
  updatedAt: number;
}

export type TFolderProgress = Record<string, ILessonProgress>;

export interface ISaveLessonProgressPayload {
  folderId: string;
  lessonId: string;
  progress: ILessonProgress;
}

export interface IPlayerCapabilities {
  revealFolder: boolean;
  openMediaExternally: boolean;
  updates: boolean;
}

export interface IPlayerApi {
  capabilities: IPlayerCapabilities;
  getSettings(): Promise<IPlayerSettings>;
  setTheme(theme: TTheme): Promise<void>;
  setLocale(locale: TLocale): Promise<void>;
  chooseFolder(): Promise<IFolder | null>;
  openRecentFolder(rootPath: string, folderId?: string): Promise<IFolder | null>;
  restoreLastFolder(): Promise<IFolder | null>;
  getRecentFolders(): Promise<IRecentFolder[]>;
  removeRecentFolder(rootPath: string, folderId?: string): Promise<void>;
  closeFolder(folderId: string): Promise<void>;
  revealFolder(rootPath: string): Promise<void>;
  getFolderProgress(folderId: string): Promise<TFolderProgress>;
  saveLessonProgress(payload: ISaveLessonProgressPayload): Promise<void>;
  clearLessonProgress(folderId: string, lessonId: string): Promise<void>;
  clearFolderProgress(folderId: string): Promise<void>;
  openMediaExternally(mediaUrl: string): Promise<void>;
  setWindowFullscreen(fullscreen: boolean): Promise<boolean>;
  onWindowFullscreenChanged(listener: (fullscreen: boolean) => void): () => void;
  getReadyUpdate(): Promise<string | null>;
  onUpdateReady(listener: (version: string) => void): () => void;
  installUpdate(): Promise<void>;
}
