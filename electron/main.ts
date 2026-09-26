import {app, BrowserWindow, dialog, ipcMain, nativeTheme, net, protocol, session, shell} from 'electron';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {access, copyFile, mkdir, readdir, readFile, realpath, rename, stat, unlink, writeFile} from 'node:fs/promises';
import {basename, dirname, extname, join, relative, resolve, sep} from 'node:path';
import {Readable} from 'node:stream';
import {pathToFileURL} from 'node:url';
import type {
  IFolder,
  IMediaTrack,
  IPlayerSettings,
  TLocale,
  TMenuAction,
  TTheme,
  TFolderProgress,
} from '../shared/types';
import {isSupportedLocale, messages} from '../shared/i18n';
import {compareMediaTracks, compareMediaPaths, MEDIA_MIME_TYPES, MEDIA_TYPES, sectionForRelativePath, titleForFile} from '../shared/media';
import {
  createDefaultState,
  isPlainRecord,
  isStoredIdentifier,
  MAX_LIBRARY_FOLDERS,
  sanitizeTrackProgress,
  sanitizeStoredState,
  summarizeRecentFolders,
  type IStoredState,
} from './state';
import {readDurationMap} from './durations';
import {readSettingsFile, writeSettingsFile} from './settings';
import {setApplicationMenu} from './menu';
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
const settingsFilePath = () => join(app.getPath('userData'), 'evb-player-settings.json');

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
let storedSettings: IPlayerSettings | null = null;
let settingsLoadPromise: Promise<IPlayerSettings> | null = null;
let settingsMutationQueue = Promise.resolve();

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

function trackIdForPath(folderId: string, relativePath: string) {
  return createHash('sha256').update(`${folderId}:${relativePath}`).digest('hex').slice(0, 16);
}

function mediaUrlForPath(filePath: string) {
  return `${MEDIA_SCHEME}://local?path=${encodeURIComponent(filePath)}`;
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

function ensureSettings() {
  if (storedSettings) {
    return Promise.resolve(storedSettings);
  }
  if (settingsLoadPromise) {
    return settingsLoadPromise;
  }

  settingsLoadPromise = readSettingsFile(settingsFilePath(), app.getPreferredSystemLanguages())
    .then((settings) => {
      storedSettings = settings;
      return settings;
    })
    .catch((error: unknown) => {
      settingsLoadPromise = null;
      throw error;
    });
  return settingsLoadPromise;
}

function isTheme(value: unknown): value is TTheme {
  return value === 'light' || value === 'dark';
}

function localizedMainMessage(locale: TLocale, key: keyof typeof messages.en.main) {
  return messages[locale].main[key];
}

function shellBackgroundColor() {
  return nativeTheme.shouldUseDarkColors ? '#101214' : '#f5f6f7';
}

function updateWindowBackground() {
  const backgroundColor = shellBackgroundColor();
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.setBackgroundColor(backgroundColor);
    }
  }
}

function applyTheme(theme: TTheme | undefined) {
  nativeTheme.themeSource = theme ?? 'system';
  updateWindowBackground();
}

function updateAboutPanel(locale: TLocale) {
  const options: Electron.AboutPanelOptionsOptions = {
    applicationName: 'EVB Player',
    applicationVersion: app.getVersion(),
    copyright: `${messages[locale].footer.copyright} © 2026 Eugene Barsky`,
  };
  if (process.platform === 'darwin' || process.platform === 'win32') {
    options.credits = 'evb-stack.com';
  }
  if (process.platform === 'linux') {
    options.website = 'https://evb-stack.com';
    options.authors = ['Eugene Barsky'];
  }
  if (process.platform === 'win32' || process.platform === 'linux') {
    options.iconPath = appIconPath;
  }
  app.setAboutPanelOptions(options);
}

function updateSettings(update: (settings: IPlayerSettings) => IPlayerSettings) {
  const write = settingsMutationQueue.then(async () => {
    const settings = update(await ensureSettings());
    await writeSettingsFile(settingsFilePath(), settings);
    storedSettings = settings;
    return settings;
  });
  settingsMutationQueue = write.then(() => undefined, () => undefined);
  return write;
}

function cloneStoredState(state: IStoredState): IStoredState {
  const progress = Object.create(null) as Record<string, TFolderProgress>;
  for (const [folderId, folderProgress] of Object.entries(state.progress)) {
    const clonedFolderProgress = Object.create(null) as TFolderProgress;
    for (const [trackId, trackProgress] of Object.entries(folderProgress)) {
      clonedFolderProgress[trackId] = {...trackProgress};
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
    const settings = await ensureSettings();
    throw new Error(localizedMainMessage(settings.locale, 'selectedPathNotFolder'));
  }

  mediaRoots.add(rootPath);
  authorizedFolderRoots.add(rootPath);
  const folderId = folderIdForPath(rootPath);
  const filePaths = (await collectMediaFiles(rootPath, true)).sort(compareMediaPaths);
  const fileStats = await collectFileStats(filePaths);
  const scannableFilePaths = filePaths.filter((filePath) => fileStats.has(filePath));
  const durationMap = await readDurationMap(scannableFilePaths);
  const tracks: IMediaTrack[] = scannableFilePaths.map((filePath, index) => {
    const fileName = basename(filePath);
    const relativePath = relative(rootPath, filePath).split(sep).join('/');
    const {sequence, title} = titleForFile(fileName);
    const currentFileStats = fileStats.get(filePath);
    if (!currentFileStats) {
      return null;
    }
    return {
      id: trackIdForPath(folderId, relativePath),
      sequence: sequence || index + 1,
      title: title || fileName,
      fileName,
      relativePath,
      // Files at the top of the folder are grouped under the folder's own name.
      section: sectionForRelativePath(basename(rootPath), relativePath),
      kind: MEDIA_TYPES[extname(fileName).toLowerCase()],
      mediaUrl: mediaUrlForPath(filePath),
      bytes: currentFileStats.size,
      duration: durationMap.get(filePath) ?? null,
    };
  }).filter((track): track is IMediaTrack => track !== null);

  tracks.sort(compareMediaTracks);
  const totalDuration = tracks.reduce((total, track) => total + (track.duration ?? 0), 0);
  const videoCount = tracks.filter((track) => track.kind === 'video').length;
  const audioCount = tracks.length - videoCount;
  const folder: IFolder = {
    id: folderId,
    name: basename(rootPath),
    rootPath,
    tracks,
    videoCount,
    audioCount,
    totalBytes: tracks.reduce((total, track) => total + track.bytes, 0),
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
        mediaCount: folder.tracks.length,
        lastOpenedAt: Date.now(),
      },
      ...state.recentFolders.filter((recentFolder) => recentFolder.id !== folder.id),
    ].slice(0, MAX_LIBRARY_FOLDERS);
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

function sendMenuAction(action: TMenuAction) {
  const window = mainWindow;
  if (window && !window.isDestroyed() && isTrustedRenderer(window.webContents)) {
    window.webContents.send('menu:action', action);
  }
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
    backgroundColor: shellBackgroundColor(),
    show: !HIDE_WINDOW,
    autoHideMenuBar: process.platform !== 'darwin',
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
  // Read synchronously by the preload so the page can apply the theme before its first frame. On Linux,
  // prefers-color-scheme keeps following the system even when themeSource is set, so the page can't ask CSS.
  ipcMain.on('settings:initial-theme', (event) => {
    event.returnValue = isTrustedRenderer(event.sender) && nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  });

  ipcMain.handle('settings:get', async (event) => {
    if (!isTrustedRenderer(event.sender)) {
      return {locale: 'en', skippedUpdateVersion: null} satisfies IPlayerSettings;
    }
    return {...await ensureSettings()};
  });

  ipcMain.handle('settings:set-theme', async (event, theme: unknown) => {
    if (!isTrustedRenderer(event.sender) || !isTheme(theme)) {
      return;
    }
    const settings = await updateSettings((current) => ({...current, theme}));
    applyTheme(settings.theme);
  });

  ipcMain.handle('settings:set-locale', async (event, locale: unknown) => {
    if (!isTrustedRenderer(event.sender) || !isSupportedLocale(locale)) {
      return;
    }
    const settings = await updateSettings((current) => ({...current, locale}));
    updateAboutPanel(settings.locale);
    setApplicationMenu(settings.locale, sendMenuAction);
  });

  ipcMain.handle('folder:choose', async (event) => {
    if (!isTrustedRenderer(event.sender)) {
      return null;
    }
    const locale = (await ensureSettings()).locale;
    const result = await dialog.showOpenDialog({
      title: localizedMainMessage(locale, 'chooseFolderTitle'),
      buttonLabel: localizedMainMessage(locale, 'chooseFolderButton'),
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) {
      return null;
    }
    try {
      return await scanFolder(result.filePaths[0]);
    } catch (cause) {
      if (cause instanceof Error && cause.message === localizedMainMessage(locale, 'selectedPathNotFolder')) {
        throw cause;
      }
      throw new Error(localizedMainMessage(locale, 'folderUnavailable'));
    }
  });

  ipcMain.handle('folder:open-recent', async (event, rootPath: unknown) => {
    if (!isTrustedRenderer(event.sender) || !isNonEmptyText(rootPath)) {
      return null;
    }
    const locale = (await ensureSettings()).locale;
    const state = await ensureState();
    const recentFolder = state.recentFolders.find((candidate) => candidate.rootPath === rootPath);
    if (!recentFolder && !authorizedFolderRoots.has(rootPath)) {
      return null;
    }
    let canonicalPath: string;
    try {
      canonicalPath = await realpath(rootPath);
    } catch {
      throw new Error(localizedMainMessage(locale, 'folderUnavailable'));
    }
    if (canonicalPath !== rootPath) {
      return null;
    }
    try {
      return await scanFolder(canonicalPath);
    } catch {
      const locale = (await ensureSettings()).locale;
      throw new Error(localizedMainMessage(locale, 'folderUnavailable'));
    }
  });

  ipcMain.handle('folder:reveal', async (event, rootPath: unknown) => {
    if (!isTrustedRenderer(event.sender) || !isNonEmptyText(rootPath)) {
      throw new Error(localizedMainMessage('en', 'folderNotAuthorized'));
    }
    const locale = (await ensureSettings()).locale;
    const state = await ensureState();
    if (!state.recentFolders.some((folder) => folder.rootPath === rootPath) && !mediaRoots.has(rootPath)) {
      throw new Error(localizedMainMessage(locale, 'folderNotInLibrary'));
    }
    try {
      if (await realpath(rootPath) !== rootPath || !(await stat(rootPath)).isDirectory()) {
        throw new Error(localizedMainMessage(locale, 'invalidFolder'));
      }
    } catch {
      throw new Error(localizedMainMessage(locale, 'folderUnavailable'));
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
    const state = await ensureState();
    return summarizeRecentFolders(state.recentFolders, state.progress);
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
    const trackId = payload.trackId;
    if (!isStoredIdentifier(folderId) || !isStoredIdentifier(trackId)) {
      return;
    }
    const progress = sanitizeTrackProgress(payload.progress);
    if (!progress) {
      return;
    }
    await updateState((state) => {
      const folderProgress = state.progress[folderId] ?? Object.create(null);
      state.progress[folderId] = {
        ...folderProgress,
        [trackId]: progress,
      };
    });
  });

  ipcMain.handle('progress:clear-track', async (event, folderId: unknown, trackId: unknown) => {
    if (!isTrustedRenderer(event.sender) || !isStoredIdentifier(folderId) || !isStoredIdentifier(trackId)) {
      return;
    }
    await updateState((state) => {
      const folderProgress = state.progress[folderId];
      if (!folderProgress || !(trackId in folderProgress)) {
        return false;
      }
      delete folderProgress[trackId];
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
      throw new Error(localizedMainMessage('en', 'mediaNotAuthorized'));
    }
    const locale = (await ensureSettings()).locale;
    const requestedPath = mediaPathFromUrl(mediaUrl);
    if (!requestedPath) {
      throw new Error(localizedMainMessage(locale, 'onlyLocalMedia'));
    }
    const filePath = await isAllowedMediaPath(requestedPath);
    if (!filePath) {
      throw new Error(localizedMainMessage(locale, 'mediaFileUnavailable'));
    }
    const openError = await shell.openPath(filePath);
    if (openError) {
      throw new Error(localizedMainMessage(locale, 'couldNotOpenMedia'));
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
  return ensureSettings().then((settings) => {
    applyTheme(settings.theme);
    nativeTheme.on('updated', updateWindowBackground);
    updateAboutPanel(settings.locale);
    if (process.platform === 'darwin') {
      app.dock?.setIcon(appIconPath);
    }
    setApplicationMenu(settings.locale, sendMenuAction);
    protocol.handle(MEDIA_SCHEME, handleMediaRequest);
    protocol.handle(RENDERER_SCHEME, handleRendererRequest);
    registerIpcHandlers();
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    startUpdater(() => mainWindow, isTrustedRenderer, {
      getSkippedVersion: async () => (await ensureSettings()).skippedUpdateVersion,
      setSkippedVersion: async (version) => {
        await updateSettings((current) => ({...current, skippedUpdateVersion: version}));
      },
    });
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
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
