import {app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, net, protocol, session, shell} from 'electron';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {access, copyFile, mkdir, readdir, readFile, realpath, rename, stat, unlink, writeFile} from 'node:fs/promises';
import {basename, dirname, extname, join, relative, resolve, sep} from 'node:path';
import {Readable} from 'node:stream';
import {pathToFileURL} from 'node:url';
import type {
  IFolder,
  IMediaLesson,
  IRecentFolder,
  TMediaKind,
  TFolderProgress,
} from '../shared/types';
import {
  createDefaultState,
  isPlainRecord,
  isStoredIdentifier,
  sanitizeLessonProgress,
  sanitizeStoredState,
  type IStoredState,
} from './state';
import {readDurationMap} from './durations';
import {startUpdater} from './updater';

const MEDIA_SCHEME = 'evb-media';
const RENDERER_SCHEME = 'evb-player';
const DEV_SERVER_URL = process.env.EVB_PLAYER_DEV_SERVER_URL?.trim();
const appIconPath = join(app.getAppPath(), 'resources', 'icon.png');
const mediaRoots = new Set<string>();
const authorizedFolderRoots = new Set<string>();
// Automation runs keep the window off screen so they never take focus from the desktop.
const HIDE_WINDOW = process.env.EVB_PLAYER_HIDE_WINDOW === '1';
const stateFilePath = () => join(app.getPath('userData'), 'evb-player-state.json');

// Source runs get their own name and profile so they never share progress,
// storage, or the single-instance lock with the installed app. An explicit
// --user-data-dir (used by automation) takes precedence.
if (!app.isPackaged && !app.commandLine.hasSwitch('user-data-dir')) {
  const devAppName = 'EVB Player Dev';
  app.setName(devAppName);
  app.setPath('userData', join(app.getPath('appData'), devAppName));
}

const singleInstanceLock = app.requestSingleInstanceLock();

let storedState: IStoredState | null = null;
let stateLoadPromise: Promise<IStoredState> | null = null;
let stateMutationQueue = Promise.resolve();
let writeQueue = Promise.resolve();
let pendingWriteCount = 0;
let writeSequence = 0;
let quitFlushStarted = false;
let mainWindow: BrowserWindow | null = null;

if (!singleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const window = mainWindow ?? BrowserWindow.getAllWindows()[0];
    if (!window || window.isDestroyed()) {
      return;
    }
    if (window.isMinimized()) {
      window.restore();
    }
    if (!window.isVisible()) {
      window.show();
    }
    window.focus();
  });
}

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

function folderIdForPath(rootPath: string) {
  return createHash('sha256').update(rootPath).digest('hex').slice(0, 16);
}

function lessonIdForPath(folderId: string, relativePath: string) {
  return createHash('sha256').update(`${folderId}:${relativePath}`).digest('hex').slice(0, 16);
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

function errorCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return undefined;
  }
  const code = error.code;
  return typeof code === 'string' ? code : undefined;
}

// A file that exists but can't be read, such as one from a build with another format, is
// copied aside before the next save replaces it, so a mismatch never destroys saved progress.
async function preserveUnreadableStateFile(filePath: string) {
  try {
    await copyFile(filePath, `${filePath}.unreadable-${Date.now()}`);
  } catch {
    // Loading continues with the next candidate either way.
  }
}

async function readStoredStateFile(filePath: string) {
  try {
    const rawState = await readFile(filePath, 'utf8');
    const state = sanitizeStoredState(JSON.parse(rawState) as unknown);
    if (!state) {
      await preserveUnreadableStateFile(filePath);
    }
    return state;
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      return null;
    }
    if (error instanceof SyntaxError) {
      await preserveUnreadableStateFile(filePath);
      return null;
    }
    throw error;
  }
}

function ensureState() {
  if (storedState) {
    return Promise.resolve(storedState);
  }
  if (stateLoadPromise) {
    return stateLoadPromise;
  }

  stateLoadPromise = (async () => {
    for (const filePath of [stateFilePath(), `${stateFilePath()}.bak`]) {
      const state = await readStoredStateFile(filePath);
      if (state) {
        storedState = state;
        return storedState;
      }
    }
    storedState = createDefaultState();
    return storedState;
  })().catch((error: unknown) => {
    stateLoadPromise = null;
    throw error;
  });
  return stateLoadPromise;
}

function cloneStoredState(state: IStoredState): IStoredState {
  const progress = Object.create(null) as Record<string, TFolderProgress>;
  for (const [folderId, folderProgress] of Object.entries(state.progress)) {
    const clonedFolderProgress = Object.create(null) as TFolderProgress;
    for (const [lessonId, lessonProgress] of Object.entries(folderProgress)) {
      clonedFolderProgress[lessonId] = {...lessonProgress};
    }
    progress[folderId] = clonedFolderProgress;
  }
  return {
    recentFolders: state.recentFolders.map((folder) => ({...folder})),
    progress,
    lastFolderPath: state.lastFolderPath,
  };
}

async function writeStateSnapshot() {
  const state = await ensureState();
  const statePath = stateFilePath();
  const temporaryPath = `${statePath}.${process.pid}.${++writeSequence}.tmp`;
  await mkdir(dirname(statePath), {recursive: true});
  try {
    await writeFile(temporaryPath, JSON.stringify(state, null, 2), {encoding: 'utf8', mode: 0o600});
    await rename(temporaryPath, statePath);
  } catch (error) {
    try {
      await unlink(temporaryPath);
    } catch {
      // The original error is the useful one for the caller.
    }
    throw error;
  }

  try {
    await copyFile(statePath, `${statePath}.bak`);
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') {
      // The primary snapshot is already committed and remains usable.
    }
  }
}

function persistState() {
  pendingWriteCount += 1;
  const nextWrite = writeQueue.then(writeStateSnapshot, writeStateSnapshot);
  const settledWrite = nextWrite.finally(() => {
    pendingWriteCount -= 1;
  });
  writeQueue = settledWrite.catch(() => undefined);
  return settledWrite;
}

function updateState(mutator: (state: IStoredState) => boolean | void) {
  const nextMutation = stateMutationQueue.then(async () => {
    const currentState = await ensureState();
    const nextState = cloneStoredState(currentState);
    if (mutator(nextState) === false) {
      return;
    }
    const previousState = storedState;
    storedState = nextState;
    try {
      await persistState();
    } catch (error) {
      storedState = previousState;
      throw error;
    }
  });
  stateMutationQueue = nextMutation.catch(() => undefined);
  return nextMutation;
}

async function drainStateWrites() {
  for (;;) {
    const mutationsAtStart = stateMutationQueue;
    await mutationsAtStart;
    const queueAtStart = writeQueue;
    await queueAtStart;
    if (mutationsAtStart === stateMutationQueue && queueAtStart === writeQueue) {
      return;
    }
  }
}

async function collectMediaFiles(directory: string, isRoot = false): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, {withFileTypes: true});
  } catch (error) {
    if (isRoot) {
      throw error;
    }
    return [];
  }
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

async function collectFileStats(filePaths: string[]) {
  const fileStats = new Map<string, Awaited<ReturnType<typeof stat>>>();
  const batchSize = 256;
  for (let index = 0; index < filePaths.length; index += batchSize) {
    const batch = filePaths.slice(index, index + batchSize);
    const results = await Promise.all(batch.map(async (filePath) => {
      try {
        const fileStats = await stat(filePath);
        return fileStats.isFile() ? {filePath, fileStats} : null;
      } catch {
        return null;
      }
    }));
    for (const result of results) {
      if (result) {
        fileStats.set(result.filePath, result.fileStats);
      }
    }
  }
  return fileStats;
}

async function scanFolder(folderPath: string): Promise<IFolder> {
  const rootPath = await realpath(folderPath);
  const rootStats = await stat(rootPath);
  if (!rootStats.isDirectory()) {
    throw new Error('The selected path is not a folder.');
  }

  mediaRoots.add(rootPath);
  authorizedFolderRoots.add(rootPath);
  const folderId = folderIdForPath(rootPath);
  const filePaths = (await collectMediaFiles(rootPath, true)).sort((left, right) => left.localeCompare(right, undefined, {numeric: true}));
  const fileStats = await collectFileStats(filePaths);
  const scannableFilePaths = filePaths.filter((filePath) => fileStats.has(filePath));
  const durationMap = await readDurationMap(scannableFilePaths);
  const lessons: IMediaLesson[] = scannableFilePaths.map((filePath, index) => {
    const fileName = basename(filePath);
    const relativePath = relative(rootPath, filePath).split(sep).join('/');
    const parentPath = dirname(relativePath);
    const {sequence, title} = titleForFile(fileName);
    const currentFileStats = fileStats.get(filePath);
    if (!currentFileStats) {
      return null;
    }
    return {
      id: lessonIdForPath(folderId, relativePath),
      sequence: sequence || index + 1,
      title: title || fileName,
      fileName,
      relativePath,
      // Files at the top of the folder are grouped under the folder's own name.
      section: parentPath === '.' ? basename(rootPath) : parentPath,
      kind: MEDIA_TYPES[extname(fileName).toLowerCase()],
      mediaUrl: mediaUrlForPath(filePath),
      bytes: currentFileStats.size,
      duration: durationMap.get(filePath) ?? null,
    };
  }).filter((lesson): lesson is IMediaLesson => lesson !== null);

  lessons.sort((left, right) => left.sequence - right.sequence || left.title.localeCompare(right.title, undefined, {numeric: true}));
  const totalDuration = lessons.reduce((total, lesson) => total + (lesson.duration ?? 0), 0);
  const videoCount = lessons.filter((lesson) => lesson.kind === 'video').length;
  const audioCount = lessons.length - videoCount;
  const folder: IFolder = {
    id: folderId,
    name: basename(rootPath),
    rootPath,
    lessons,
    videoCount,
    audioCount,
    totalBytes: lessons.reduce((total, lesson) => total + lesson.bytes, 0),
    totalDuration,
    scannedAt: Date.now(),
  };

  await updateState((state) => {
    state.lastFolderPath = rootPath;
    state.recentFolders = [
      {
        id: folder.id,
        name: folder.name,
        rootPath: folder.rootPath,
        mediaCount: folder.lessons.length,
        lastOpenedAt: Date.now(),
      },
      ...state.recentFolders.filter((recentFolder) => recentFolder.id !== folder.id),
    ].slice(0, 12);
  });

  return folder;
}

async function isAllowedMediaPath(filePath: string) {
  if (!filePath || filePath.includes('\0')) {
    return null;
  }
  const resolvedPath = resolve(filePath);
  for (const rootPath of mediaRoots) {
    if (resolvedPath !== rootPath && !resolvedPath.startsWith(`${rootPath}${sep}`)) {
      continue;
    }

    try {
      const actualPath = await realpath(resolvedPath);
      if (actualPath !== rootPath && !actualPath.startsWith(`${rootPath}${sep}`)) {
        continue;
      }
      const fileStats = await stat(actualPath);
      if (fileStats.isFile() && MEDIA_TYPES[extname(actualPath).toLowerCase()]) {
        return actualPath;
      }
    } catch {
      continue;
    }
  }
  return null;
}

function mediaPathFromUrl(mediaUrl: unknown) {
  if (typeof mediaUrl !== 'string' || mediaUrl.length === 0 || mediaUrl.length > 16_384) {
    return null;
  }
  try {
    const parsedUrl = new URL(mediaUrl);
    if (parsedUrl.protocol !== `${MEDIA_SCHEME}:` || parsedUrl.hostname !== 'local' || (parsedUrl.pathname !== '' && parsedUrl.pathname !== '/') || parsedUrl.searchParams.size !== 1) {
      return null;
    }
    return parsedUrl.searchParams.get('path');
  } catch {
    return null;
  }
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
  const rangeHeader = request.headers.get('range');
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    return new Response('Method not allowed.', {status: 405, headers: {Allow: 'GET, HEAD'}});
  }

  let requestedPath: string | null;
  try {
    const requestUrl = new URL(request.url);
    if (requestUrl.hostname !== 'local' || (requestUrl.pathname !== '' && requestUrl.pathname !== '/') || requestUrl.searchParams.size !== 1) {
      return new Response('Media path is not available.', {status: 403});
    }
    requestedPath = requestUrl.searchParams.get('path');
  } catch {
    return new Response('Invalid media request.', {status: 400});
  }
  if (!requestedPath) {
    return new Response('Missing media path.', {status: 400});
  }

  try {
    const filePath = await isAllowedMediaPath(requestedPath);
    if (!filePath) {
      return new Response('Media path is not available.', {status: 403});
    }

    const fileSize = (await stat(filePath)).size;
    const headers = responseHeaders(filePath, fileSize);

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
  } catch {
    return new Response('Media file could not be opened.', {status: 404});
  }
}

function rendererRootPath() {
  return resolve(__dirname, '../../.output/public');
}

function isAllowedRendererUrl(url: string) {
  try {
    const parsedUrl = new URL(url);
    if (DEV_SERVER_URL) {
      return parsedUrl.origin === new URL(DEV_SERVER_URL).origin;
    }
    return parsedUrl.protocol === `${RENDERER_SCHEME}:` && parsedUrl.hostname === 'app';
  } catch {
    return false;
  }
}

function isAllowedExternalUrl(url: string) {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
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
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    return new Response('Method not allowed.', {status: 405, headers: {Allow: 'GET, HEAD'}});
  }
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
    method,
  });
}

function isTrustedRenderer(sender: Electron.WebContents) {
  return mainWindow?.webContents === sender && isAllowedRendererUrl(sender.getURL());
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 4096;
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1040,
    minHeight: 700,
    title: 'EVB Player',
    icon: appIconPath,
    backgroundColor: '#101214',
    show: !HIDE_WINDOW,
    webPreferences: {
      backgroundThrottling: !HIDE_WINDOW,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, 'preload.js'),
    },
  });
  mainWindow = window;
  window.setFullScreenable(true);

  const sendFullscreenState = (fullscreen: boolean) => {
    if (!window.isDestroyed()) {
      window.webContents.send('window:fullscreen-changed', fullscreen);
    }
  };
  window.on('enter-full-screen', () => sendFullscreenState(true));
  window.on('leave-full-screen', () => sendFullscreenState(false));
  window.on('enter-html-full-screen', () => sendFullscreenState(true));
  window.on('leave-html-full-screen', () => sendFullscreenState(false));
  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  window.webContents.setWindowOpenHandler(({url}) => {
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return {action: 'deny'};
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (isAllowedRendererUrl(url)) {
      return;
    }
    event.preventDefault();
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url);
    }
  });
  window.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });

  if (DEV_SERVER_URL) {
    void window.loadURL(DEV_SERVER_URL);
  } else {
    void window.loadURL(`${RENDERER_SCHEME}://app/`);
  }

  return window;
}

function registerIpcHandlers() {
  ipcMain.handle('folder:choose', async (event) => {
    if (!isTrustedRenderer(event.sender)) {
      return null;
    }
    const result = await dialog.showOpenDialog({
      title: 'Choose a folder of videos or audio',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) {
      return null;
    }
    return scanFolder(result.filePaths[0]);
  });

  ipcMain.handle('folder:open-recent', async (event, rootPath: unknown) => {
    if (!isTrustedRenderer(event.sender) || !isNonEmptyText(rootPath)) {
      return null;
    }
    const state = await ensureState();
    const recentFolder = state.recentFolders.find((candidate) => candidate.rootPath === rootPath);
    if (!recentFolder && !authorizedFolderRoots.has(rootPath)) {
      return null;
    }
    let canonicalPath: string;
    try {
      canonicalPath = await realpath(rootPath);
    } catch {
      throw new Error('Folder unavailable. It may have been moved or disconnected.');
    }
    if (canonicalPath !== rootPath) {
      return null;
    }
    return scanFolder(canonicalPath);
  });

  ipcMain.handle('folder:reveal', async (event, rootPath: unknown) => {
    if (!isTrustedRenderer(event.sender) || !isNonEmptyText(rootPath)) {
      throw new Error('The folder is not authorized.');
    }
    const state = await ensureState();
    if (!state.recentFolders.some((folder) => folder.rootPath === rootPath) && !mediaRoots.has(rootPath)) {
      throw new Error('The folder is not in your library.');
    }
    try {
      if (await realpath(rootPath) !== rootPath || !(await stat(rootPath)).isDirectory()) {
        throw new Error('Invalid folder');
      }
    } catch {
      throw new Error('Folder unavailable. It may have been moved or disconnected.');
    }
    shell.showItemInFolder(rootPath);
  });

  ipcMain.handle('folder:restore-last', async (event) => {
    if (!isTrustedRenderer(event.sender)) {
      return null;
    }
    const state = await ensureState();
    if (!state.lastFolderPath) {
      return null;
    }
    try {
      await access(state.lastFolderPath);
      return await scanFolder(state.lastFolderPath);
    } catch {
      return null;
    }
  });

  ipcMain.handle('folder:get-recent', async (event) => {
    if (!isTrustedRenderer(event.sender)) {
      return [];
    }
    return (await ensureState()).recentFolders;
  });

  ipcMain.handle('folder:remove-recent', async (event, rootPath: unknown) => {
    if (!isTrustedRenderer(event.sender) || !isNonEmptyText(rootPath)) {
      return;
    }
    const state = await ensureState();
    const removedFolder = state.recentFolders.find((recentFolder) => recentFolder.rootPath === rootPath);
    if (!removedFolder) {
      return;
    }
    await updateState((nextState) => {
      nextState.recentFolders = nextState.recentFolders.filter((recentFolder) => recentFolder.rootPath !== rootPath);
      if (nextState.lastFolderPath === rootPath) {
        nextState.lastFolderPath = null;
      }
    });
    mediaRoots.delete(removedFolder.rootPath);
  });

  ipcMain.handle('progress:get', async (event, folderId: unknown) => {
    if (!isTrustedRenderer(event.sender) || !isStoredIdentifier(folderId)) {
      return {};
    }
    const folderProgress = (await ensureState()).progress[folderId];
    return folderProgress ? {...folderProgress} : {};
  });

  ipcMain.handle('progress:save', async (event, payload: unknown) => {
    if (!isTrustedRenderer(event.sender) || !isPlainRecord(payload)) {
      return;
    }
    const folderId = payload.folderId;
    const lessonId = payload.lessonId;
    if (!isStoredIdentifier(folderId) || !isStoredIdentifier(lessonId)) {
      return;
    }
    const progress = sanitizeLessonProgress(payload.progress);
    if (!progress) {
      return;
    }
    await updateState((state) => {
      const folderProgress = state.progress[folderId] ?? Object.create(null);
      state.progress[folderId] = {
        ...folderProgress,
        [lessonId]: progress,
      };
    });
  });

  ipcMain.handle('progress:clear-lesson', async (event, folderId: unknown, lessonId: unknown) => {
    if (!isTrustedRenderer(event.sender) || !isStoredIdentifier(folderId) || !isStoredIdentifier(lessonId)) {
      return;
    }
    await updateState((state) => {
      const folderProgress = state.progress[folderId];
      if (!folderProgress || !(lessonId in folderProgress)) {
        return false;
      }
      delete folderProgress[lessonId];
      if (Object.keys(folderProgress).length === 0) {
        delete state.progress[folderId];
      }
    });
  });

  ipcMain.handle('progress:clear', async (event, folderId: unknown) => {
    if (!isTrustedRenderer(event.sender) || !isStoredIdentifier(folderId)) {
      return;
    }
    await updateState((state) => {
      if (!(folderId in state.progress)) {
        return false;
      }
      delete state.progress[folderId];
    });
  });

  ipcMain.handle('media:open-external', async (event, mediaUrl: unknown) => {
    if (!isTrustedRenderer(event.sender)) {
      throw new Error('The media request is not authorized.');
    }
    const requestedPath = mediaPathFromUrl(mediaUrl);
    if (!requestedPath) {
      throw new Error('Only local EVB Player media can be opened externally.');
    }
    const filePath = await isAllowedMediaPath(requestedPath);
    if (!filePath) {
      throw new Error('The media file is not available.');
    }
    const openError = await shell.openPath(filePath);
    if (openError) {
      throw new Error(openError);
    }
  });

  ipcMain.handle('window:set-fullscreen', (event, fullscreen: unknown) => {
    if (!isTrustedRenderer(event.sender)) {
      return false;
    }
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
  if (!singleInstanceLock) {
    return;
  }
  // Dark native title bars on Windows and Linux, matching the app.
  nativeTheme.themeSource = 'dark';
  if (process.platform === 'darwin') {
    app.dock?.setIcon(appIconPath);
  } else {
    // macOS keeps its standard app menu; elsewhere Electron's default File/Edit/View bar has nothing to offer.
    Menu.setApplicationMenu(null);
  }
  protocol.handle(MEDIA_SCHEME, handleMediaRequest);
  protocol.handle(RENDERER_SCHEME, handleRendererRequest);
  registerIpcHandlers();
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  createWindow();
  startUpdater(() => mainWindow, isTrustedRenderer);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('will-quit', (event) => {
  if (quitFlushStarted) {
    return;
  }
  event.preventDefault();
  quitFlushStarted = true;
  // Quit again from a macrotask: when app.quit() closed the windows, will-quit is emitted from native code and a
  // microtask would run before Electron clears its quitting flag, so the second quit would be ignored.
  const quitAfterDrain = () => setImmediate(() => app.quit());
  void drainStateWrites().then(quitAfterDrain, quitAfterDrain);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
