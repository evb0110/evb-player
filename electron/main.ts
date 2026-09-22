import {app, BrowserWindow, dialog, ipcMain, net, protocol, session, shell} from 'electron';
import {createHash} from 'node:crypto';
import {createReadStream, statSync} from 'node:fs';
import {access, mkdir, readdir, readFile, realpath, stat, writeFile, rename} from 'node:fs/promises';
import {basename, dirname, extname, join, relative, resolve, sep} from 'node:path';
import {execFile} from 'node:child_process';
import {Readable} from 'node:stream';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';
import type {
  ICourse,
  ILessonProgress,
  IMediaLesson,
  IRecentCourse,
  ISaveLessonProgressPayload,
  TMediaKind,
  TCourseProgress,
} from '../shared/types';

const execFileAsync = promisify(execFile);
const MEDIA_SCHEME = 'course-media';
const RENDERER_SCHEME = 'course-shelf';
const DEV_SERVER_URL = process.env.COURSE_SHELF_DEV_SERVER_URL?.trim();
const appIconPath = join(app.getAppPath(), 'resources', 'icon.png');
const mediaRoots = new Set<string>();
const stateFilePath = () => join(app.getPath('userData'), 'course-shelf-state.json');

interface IStoredState {
  recentCourses: IRecentCourse[];
  progress: Record<string, TCourseProgress>;
  lastCoursePath: string | null;
}

const DEFAULT_STATE: IStoredState = {
  recentCourses: [],
  progress: {},
  lastCoursePath: null,
};

let storedState: IStoredState | null = null;
let writeQueue = Promise.resolve();

const MEDIA_TYPES: Record<string, TMediaKind> = {
  '.aac': 'audio',
  '.flac': 'audio',
  '.m4a': 'audio',
  '.mp3': 'audio',
  '.ogg': 'audio',
  '.opus': 'audio',
  '.wav': 'audio',
  '.avi': 'video',
  '.flv': 'video',
  '.m4v': 'video',
  '.mkv': 'video',
  '.mov': 'video',
  '.mp4': 'video',
  '.ogv': 'video',
  '.webm': 'video',
  '.wmv': 'video',
};

const MEDIA_MIME_TYPES: Record<string, string> = {
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
};

protocol.registerSchemesAsPrivileged([{
  scheme: MEDIA_SCHEME,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    stream: true,
    corsEnabled: true,
  },
}, {
  scheme: RENDERER_SCHEME,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    stream: true,
    corsEnabled: true,
  },
}]);

function courseIdForPath(rootPath: string) {
  return createHash('sha256').update(rootPath).digest('hex').slice(0, 16);
}

function lessonIdForPath(courseId: string, relativePath: string) {
  return createHash('sha256').update(`${courseId}:${relativePath}`).digest('hex').slice(0, 16);
}

function mediaUrlForPath(filePath: string) {
  return `${MEDIA_SCHEME}://local?path=${encodeURIComponent(filePath)}`;
}

function titleForFile(fileName: string) {
  const withoutExtension = basename(fileName, extname(fileName));
  const numberedName = withoutExtension.match(/^(\d{1,5})\s*[._)\-]+\s*(.+)$/u);
  if (!numberedName) {
    return {sequence: 0, title: withoutExtension.replace(/[._]+/gu, ' ').trim()};
  }

  return {
    sequence: Number(numberedName[1]),
    title: numberedName[2].replace(/[._]+/gu, ' ').replace(/\s+/gu, ' ').trim(),
  };
}

async function ensureState() {
  if (storedState) {
    return storedState;
  }

  try {
    const rawState = await readFile(stateFilePath(), 'utf8');
    const parsed = JSON.parse(rawState) as Partial<IStoredState>;
    storedState = {
      recentCourses: Array.isArray(parsed.recentCourses) ? parsed.recentCourses : [],
      progress: parsed.progress && typeof parsed.progress === 'object' ? parsed.progress : {},
      lastCoursePath: typeof parsed.lastCoursePath === 'string' ? parsed.lastCoursePath : null,
    };
  } catch {
    storedState = {...DEFAULT_STATE};
  }

  return storedState;
}

function persistState() {
  writeQueue = writeQueue.then(async () => {
    const state = await ensureState();
    const directory = dirname(stateFilePath());
    await mkdir(directory, {recursive: true});
    const temporaryPath = `${stateFilePath()}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(state, null, 2), 'utf8');
    await rename(temporaryPath, stateFilePath());
  });
  return writeQueue;
}

async function collectMediaFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, {withFileTypes: true});
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }

    const entryPath = join(directory, entry.name);
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      files.push(...await collectMediaFiles(entryPath));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const extension = extname(entry.name).toLowerCase();
    if (MEDIA_TYPES[extension]) {
      files.push(entryPath);
    }
  }

  return files;
}

interface IMediaMetadata {
  duration: number | null;
  pixelWidth: number | null;
  pixelHeight: number | null;
}

async function readMediaMetadataMap(filePaths: string[]) {
  if (filePaths.length === 0) {
    return new Map<string, IMediaMetadata>();
  }

  try {
    const result = await execFileAsync('mdls', [
      '-raw',
      '-name', 'kMDItemDurationSeconds',
      '-name', 'kMDItemPixelWidth',
      '-name', 'kMDItemPixelHeight',
      ...filePaths,
    ], {
      maxBuffer: 1024 * 1024,
    });
    const values = result.stdout.split('\0').map((value) => value.trim());
    const metadata = new Map<string, IMediaMetadata>();
    filePaths.forEach((filePath, index) => {
      const offset = index * 3;
      const duration = Number(values[offset]);
      const pixelWidth = Number(values[offset + 1]);
      const pixelHeight = Number(values[offset + 2]);
      metadata.set(filePath, {
        duration: Number.isFinite(duration) && duration > 0 ? duration : null,
        pixelWidth: Number.isFinite(pixelWidth) && pixelWidth > 0 ? pixelWidth : null,
        pixelHeight: Number.isFinite(pixelHeight) && pixelHeight > 0 ? pixelHeight : null,
      });
    });
    return metadata;
  } catch {
    return new Map<string, IMediaMetadata>();
  }
}

const ffprobeCandidates = [
  process.env.FFPROBE_PATH,
  '/opt/homebrew/bin/ffprobe',
  '/usr/local/bin/ffprobe',
  '/opt/local/bin/ffprobe',
  'ffprobe',
].filter((candidate): candidate is string => Boolean(candidate));

let resolvedFfprobePath: string | null | undefined;

async function resolveFfprobePath() {
  if (resolvedFfprobePath !== undefined) {
    return resolvedFfprobePath;
  }

  for (const candidate of ffprobeCandidates) {
    try {
      await execFileAsync(candidate, ['-version'], {maxBuffer: 64 * 1024, timeout: 5000});
      resolvedFfprobePath = candidate;
      return candidate;
    } catch {
      // Try the next known installation location.
    }
  }

  resolvedFfprobePath = null;
  return null;
}

function normalizeVideoRotation(rotation: number) {
  const normalized = ((rotation % 360) + 360) % 360;
  const signed = normalized > 180 ? normalized - 360 : normalized;
  return Math.abs(signed) === 90 ? signed : 0;
}

async function readVideoRotationMap(filePaths: string[]) {
  const videoPaths = filePaths.filter((filePath) => MEDIA_TYPES[extname(filePath).toLowerCase()] === 'video');
  const ffprobePath = await resolveFfprobePath();
  const rotations = new Map<string, number>();
  if (!ffprobePath || videoPaths.length === 0) {
    return rotations;
  }

  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < videoPaths.length) {
      const filePath = videoPaths[nextIndex++];
      try {
        const result = await execFileAsync(ffprobePath, [
          '-v', 'error',
          '-select_streams', 'v:0',
          '-show_entries', 'stream_side_data=rotation',
          '-of', 'default=noprint_wrappers=1:nokey=1',
          filePath,
        ], {maxBuffer: 64 * 1024, timeout: 15000});
        const rotation = normalizeVideoRotation(Number(result.stdout.trim()));
        if (rotation !== 0) {
          rotations.set(filePath, rotation);
        }
      } catch {
        // Media without probeable rotation metadata stays unmodified.
      }
    }
  };

  await Promise.all(Array.from({length: Math.min(4, videoPaths.length)}, () => worker()));
  return rotations;
}

async function scanCourse(folderPath: string): Promise<ICourse> {
  const rootPath = await realpath(folderPath);
  const rootStats = await stat(rootPath);
  if (!rootStats.isDirectory()) {
    throw new Error('The selected path is not a folder.');
  }

  mediaRoots.add(rootPath);
  const courseId = courseIdForPath(rootPath);
  const filePaths = (await collectMediaFiles(rootPath)).sort((left, right) => left.localeCompare(right, undefined, {numeric: true}));
  const mediaMetadataMap = await readMediaMetadataMap(filePaths);
  const rotationMap = await readVideoRotationMap(filePaths);
  const lessons: IMediaLesson[] = filePaths.map((filePath, index) => {
    const fileName = basename(filePath);
    const relativePath = relative(rootPath, filePath).split(sep).join('/');
    const parentPath = dirname(relativePath);
    const {sequence, title} = titleForFile(fileName);
    const fileStats = statSync(filePath);
    const metadata = mediaMetadataMap.get(filePath);
    return {
      id: lessonIdForPath(courseId, relativePath),
      sequence: sequence || index + 1,
      title: title || fileName,
      fileName,
      relativePath,
      section: parentPath === '.' ? 'Course' : parentPath,
      kind: MEDIA_TYPES[extname(fileName).toLowerCase()],
      mediaUrl: mediaUrlForPath(filePath),
      bytes: fileStats.size,
      duration: metadata?.duration ?? null,
      sourceWidth: metadata?.pixelWidth ?? null,
      sourceHeight: metadata?.pixelHeight ?? null,
      rotation: rotationMap.get(filePath) ?? 0,
    };
  });

  lessons.sort((left, right) => left.sequence - right.sequence || left.title.localeCompare(right.title, undefined, {numeric: true}));
  const totalDuration = lessons.reduce((total, lesson) => total + (lesson.duration ?? 0), 0);
  const videoCount = lessons.filter((lesson) => lesson.kind === 'video').length;
  const audioCount = lessons.length - videoCount;
  const course: ICourse = {
    id: courseId,
    name: basename(rootPath),
    rootPath,
    lessons,
    videoCount,
    audioCount,
    totalBytes: lessons.reduce((total, lesson) => total + lesson.bytes, 0),
    totalDuration,
    scannedAt: Date.now(),
  };

  const state = await ensureState();
  state.lastCoursePath = rootPath;
  state.recentCourses = [
    {
      id: course.id,
      name: course.name,
      rootPath: course.rootPath,
      mediaCount: course.lessons.length,
      lastOpenedAt: Date.now(),
    },
    ...state.recentCourses.filter((recentCourse) => recentCourse.id !== course.id),
  ].slice(0, 12);
  await persistState();

  return course;
}

async function isAllowedMediaPath(filePath: string) {
  const resolvedPath = resolve(filePath);
  for (const rootPath of mediaRoots) {
    if (resolvedPath !== rootPath && !resolvedPath.startsWith(`${rootPath}${sep}`)) {
      continue;
    }

    try {
      const actualPath = await realpath(resolvedPath);
      if (actualPath === rootPath || actualPath.startsWith(`${rootPath}${sep}`)) {
        return actualPath;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function responseHeaders(filePath: string, size: number) {
  return {
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache',
    'Content-Length': String(size),
    'Content-Type': MEDIA_MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
  };
}

function streamFile(filePath: string, start?: number, end?: number) {
  return Readable.toWeb(createReadStream(filePath, {start, end})) as ReadableStream;
}

function parseByteRange(rangeHeader: string, size: number) {
  const match = /^bytes=(\d*)-(\d*)$/u.exec(rangeHeader);
  if (!match || (!match[1] && !match[2]) || size <= 0) {
    return null;
  }

  const requestedStart = match[1] ? Number(match[1]) : null;
  const requestedEnd = match[2] ? Number(match[2]) : null;
  if (requestedStart !== null && !Number.isSafeInteger(requestedStart)) {
    return null;
  }
  if (requestedEnd !== null && !Number.isSafeInteger(requestedEnd)) {
    return null;
  }

  if (requestedStart === null) {
    if (requestedEnd === null || requestedEnd <= 0) {
      return null;
    }
    return {
      start: Math.max(0, size - requestedEnd),
      end: size - 1,
    };
  }

  if (requestedStart >= size || (requestedEnd !== null && requestedStart > requestedEnd)) {
    return null;
  }

  return {
    start: requestedStart,
    end: Math.min(requestedEnd ?? size - 1, size - 1),
  };
}

async function handleMediaRequest(request: Request) {
  const requestUrl = new URL(request.url);
  const requestedPath = requestUrl.searchParams.get('path');
  if (!requestedPath) {
    return new Response('Missing media path.', {status: 400});
  }

  const filePath = await isAllowedMediaPath(requestedPath);
  if (!filePath) {
    return new Response('Media path is not available.', {status: 403});
  }

  const fileSize = (await stat(filePath)).size;
  const headers = responseHeaders(filePath, fileSize);
  const rangeHeader = request.headers.get('range');
  const method = request.method.toUpperCase();

  if (rangeHeader) {
    const range = parseByteRange(rangeHeader, fileSize);
    if (!range) {
      return new Response(null, {
        status: 416,
        headers: {
          ...headers,
          'Content-Length': '0',
          'Content-Range': `bytes */${fileSize}`,
        },
      });
    }

    const contentLength = range.end - range.start + 1;
    return new Response(method === 'HEAD' ? null : streamFile(filePath, range.start, range.end), {
      status: 206,
      headers: {
        ...headers,
        'Content-Length': String(contentLength),
        'Content-Range': `bytes ${range.start}-${range.end}/${fileSize}`,
      },
    });
  }

  return new Response(method === 'HEAD' ? null : streamFile(filePath), {
    status: 200,
    headers,
  });
}

function rendererRootPath() {
  return resolve(__dirname, '../../.output/public');
}

function rendererFilePath(requestUrl: string) {
  const requestUrlObject = new URL(requestUrl);
  if (requestUrlObject.hostname !== 'app') {
    return null;
  }

  let requestPath: string;
  try {
    requestPath = decodeURIComponent(requestUrlObject.pathname);
  } catch {
    return null;
  }

  const rootPath = rendererRootPath();
  const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/u, '');
  const filePath = resolve(rootPath, relativePath);
  if (filePath !== rootPath && !filePath.startsWith(`${rootPath}${sep}`)) {
    return null;
  }
  return filePath;
}

async function handleRendererRequest(request: Request) {
  const filePath = rendererFilePath(request.url);
  if (!filePath) {
    return new Response('Renderer path is not available.', {status: 403});
  }

  try {
    await access(filePath);
  } catch {
    return new Response('Renderer file is not available.', {status: 404});
  }

  return net.fetch(pathToFileURL(filePath).toString(), {
    headers: request.headers,
    method: request.method,
  });
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1040,
    minHeight: 700,
    title: 'Course Shelf',
    icon: appIconPath,
    backgroundColor: '#101214',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: join(__dirname, 'preload.js'),
    },
  });
  mainWindow.setFullScreenable(true);

  const sendFullscreenState = (fullscreen: boolean) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:fullscreen-changed', fullscreen);
    }
  };
  mainWindow.on('enter-full-screen', () => sendFullscreenState(true));
  mainWindow.on('leave-full-screen', () => sendFullscreenState(false));
  mainWindow.on('enter-html-full-screen', () => sendFullscreenState(true));
  mainWindow.on('leave-html-full-screen', () => sendFullscreenState(false));

  mainWindow.webContents.setWindowOpenHandler(({url}) => {
    if (url.startsWith('https://')) {
      void shell.openExternal(url);
    }
    return {action: 'deny'};
  });

  if (DEV_SERVER_URL) {
    void mainWindow.loadURL(DEV_SERVER_URL);
  } else {
    void mainWindow.loadURL(`${RENDERER_SCHEME}://app/`);
  }

  return mainWindow;
}

function registerIpcHandlers() {
  ipcMain.handle('course:choose-folder', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose a course or media folder',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) {
      return null;
    }
    return scanCourse(result.filePaths[0]);
  });

  ipcMain.handle('course:open-recent', (_event, rootPath: unknown) => {
    if (typeof rootPath !== 'string' || !rootPath.trim()) {
      return null;
    }
    return scanCourse(rootPath);
  });

  ipcMain.handle('course:restore-last', async () => {
    const state = await ensureState();
    if (!state.lastCoursePath) {
      return null;
    }
    try {
      await access(state.lastCoursePath);
      return await scanCourse(state.lastCoursePath);
    } catch {
      return null;
    }
  });

  ipcMain.handle('course:get-recent', async () => (await ensureState()).recentCourses);

  ipcMain.handle('progress:get', async (_event, courseId: unknown) => {
    if (typeof courseId !== 'string') {
      return {};
    }
    return (await ensureState()).progress[courseId] ?? {};
  });

  ipcMain.handle('progress:save', async (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return;
    }
    const candidate = payload as Partial<ISaveLessonProgressPayload>;
    if (typeof candidate.courseId !== 'string' || typeof candidate.lessonId !== 'string' || !candidate.progress) {
      return;
    }
    const state = await ensureState();
    const progress = candidate.progress as ILessonProgress;
    state.progress[candidate.courseId] = {
      ...(state.progress[candidate.courseId] ?? {}),
      [candidate.lessonId]: {
        position: Number(progress.position) || 0,
        duration: Number(progress.duration) || 0,
        completed: progress.completed === true,
        updatedAt: Number(progress.updatedAt) || Date.now(),
      },
    };
    await persistState();
  });

  ipcMain.handle('progress:clear-lesson', async (_event, courseId: unknown, lessonId: unknown) => {
    if (typeof courseId !== 'string' || typeof lessonId !== 'string') {
      return;
    }
    const state = await ensureState();
    const courseProgress = state.progress[courseId];
    if (!courseProgress || !(lessonId in courseProgress)) {
      return;
    }
    delete courseProgress[lessonId];
    if (Object.keys(courseProgress).length === 0) {
      delete state.progress[courseId];
    }
    await persistState();
  });

  ipcMain.handle('progress:clear', async (_event, courseId: unknown) => {
    if (typeof courseId !== 'string') {
      return;
    }
    const state = await ensureState();
    delete state.progress[courseId];
    await persistState();
  });

  ipcMain.handle('window:set-fullscreen', (event, fullscreen: unknown) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      return false;
    }
    const nextFullscreen = fullscreen === true;
    window.setFullScreen(nextFullscreen);
    return nextFullscreen;
  });
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock?.setIcon(appIconPath);
  }
  protocol.handle(MEDIA_SCHEME, handleMediaRequest);
  protocol.handle(RENDERER_SCHEME, handleRendererRequest);
  registerIpcHandlers();
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
