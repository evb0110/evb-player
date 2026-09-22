export type TMediaKind = 'video' | 'audio';

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

export interface ICourse {
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

export interface IRecentCourse {
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

export type TCourseProgress = Record<string, ILessonProgress>;

export interface ISaveLessonProgressPayload {
  courseId: string;
  lessonId: string;
  progress: ILessonProgress;
}

export interface ICourseShelfApi {
  chooseFolder(): Promise<ICourse | null>;
  openRecentCourse(rootPath: string): Promise<ICourse | null>;
  restoreLastCourse(): Promise<ICourse | null>;
  getRecentCourses(): Promise<IRecentCourse[]>;
  removeRecentCourse(rootPath: string): Promise<void>;
  getCourseProgress(courseId: string): Promise<TCourseProgress>;
  saveLessonProgress(payload: ISaveLessonProgressPayload): Promise<void>;
  clearLessonProgress(courseId: string, lessonId: string): Promise<void>;
  clearCourseProgress(courseId: string): Promise<void>;
  openMediaExternally(mediaUrl: string): Promise<void>;
  setWindowFullscreen(fullscreen: boolean): Promise<boolean>;
  onWindowFullscreenChanged(listener: (fullscreen: boolean) => void): () => void;
}
