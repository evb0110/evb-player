import {parseBlob} from 'music-metadata';
import type {
  IFolder,
  IMediaTrack,
  IPlaylist,
  IPlayerApi,
  IPlayerSettings,
  IRecentFolder,
  ISaveTrackProgressPayload,
  IUpdateStatus,
  TFolderProgress,
  TLocale,
  TTheme,
  TMenuAction,
} from '../../shared/types';
import {isSupportedLocale, resolveSupportedLocale} from '../../shared/i18n';
import {isTheme, readCookieValue, THEME_COOKIE, writeBrowserCookie} from '../../shared/theme';
import {
  isPlainRecord,
  isStoredIdentifier,
  MAX_LIBRARY_FOLDERS,
  sanitizeProgress,
  sanitizeRecentFolders,
  summarizeRecentFolders,
} from '../../shared/state';
import {
  compareMediaTracks,
  compareMediaPaths,
  extensionForFileName,
  MEDIA_TYPES,
  sectionForRelativePath,
  titleForFile,
} from '../../shared/media';
import {playlistTracks, sanitizePlaylist, sanitizePlaylists} from '../../shared/playlist';
import {
  getDirectoryHandle,
  getAllDirectoryHandles,
  putDirectoryHandle,
} from './browserDirectoryStorage';

interface IStoredBrowserState {
  recentFolders: IRecentFolder[];
  progress: Record<string, TFolderProgress>;
  lastFolderId: string | null;
}

interface IScannedFile {
  file: File;
  relativePath: string;
}

interface IFolderPickerWindow extends Window {
  showDirectoryPicker?: (options: {id: string; mode: 'read'}) => Promise<FileSystemDirectoryHandle>;
}

interface IPermissionDirectoryHandle extends FileSystemDirectoryHandle {
  queryPermission(options: {mode: 'read'}): Promise<PermissionState>;
  requestPermission(options: {mode: 'read'}): Promise<PermissionState>;
}

const STATE_KEY = 'evb-player-web-state';
const SETTINGS_KEY = 'evb-player-web-settings';
const PLAYLISTS_KEY = 'evb-player-web-playlists';
const stateDefault = (): IStoredBrowserState => ({recentFolders: [], progress: Object.create(null) as Record<string, TFolderProgress>, lastFolderId: null});
let browserState: IStoredBrowserState | null = null;
let stateCanBeWritten = true;
let browserSettings: IPlayerSettings | null = null;
let settingsCanBeWritten = true;
let browserPlaylists: Record<string, IPlaylist> | null = null;
let playlistsCanBeWritten = true;
const mediaUrlsByFolder = new Map<string, Set<string>>();
const idleUpdateStatus: IUpdateStatus = {phase: 'idle', currentVersion: '', manual: false, requiresPassword: false};

function readStoredState() {
  if (browserState) {
    return browserState;
  }
  try {
    const saved = localStorage.getItem(STATE_KEY);
    if (saved === null) {
      browserState = stateDefault();
      return browserState;
    }
    const parsed: unknown = JSON.parse(saved);
    if (!isPlainRecord(parsed) || !isPlainRecord(parsed.progress)) {
      stateCanBeWritten = false;
      browserState = stateDefault();
      return browserState;
    }
    if (!Array.isArray(parsed.recentFolders)) {
      stateCanBeWritten = false;
      browserState = stateDefault();
      return browserState;
    }
    const recentFolders = sanitizeRecentFolders(parsed.recentFolders, () => true);
    const lastFolderId = parsed.lastFolderId;
    if (lastFolderId !== null && !isStoredIdentifier(lastFolderId)) {
      stateCanBeWritten = false;
      browserState = stateDefault();
      return browserState;
    }
    browserState = {recentFolders, progress: sanitizeProgress(parsed.progress), lastFolderId};
  } catch {
    stateCanBeWritten = false;
    browserState = stateDefault();
  }
  return browserState;
}

function writeStoredState() {
  if (!stateCanBeWritten) {
    return;
  }
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(readStoredState()));
  } catch {
    stateCanBeWritten = false;
  }
}

function defaultSettings(): IPlayerSettings {
  return {
    locale: resolveSupportedLocale(navigator.languages.length ? navigator.languages : [navigator.language]),
    skippedUpdateVersion: null,
  };
}

function readThemeCookie() {
  const theme = readCookieValue(document.cookie, THEME_COOKIE);
  return isTheme(theme) ? theme : undefined;
}

function readStoredSettings() {
  if (browserSettings) {
    return browserSettings;
  }
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved === null) {
      browserSettings = defaultSettings();
      return browserSettings;
    }
    const parsed: unknown = JSON.parse(saved);
    if (!isPlainRecord(parsed)
      || !isSupportedLocale(parsed.locale)
      || (parsed.skippedUpdateVersion !== undefined
        && parsed.skippedUpdateVersion !== null
        && (typeof parsed.skippedUpdateVersion !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(parsed.skippedUpdateVersion)))) {
      settingsCanBeWritten = false;
      browserSettings = defaultSettings();
      return browserSettings;
    }
    browserSettings = {
      theme: readThemeCookie(),
      locale: parsed.locale as TLocale,
      skippedUpdateVersion: typeof parsed.skippedUpdateVersion === 'string' ? parsed.skippedUpdateVersion : null,
    };
  } catch {
    settingsCanBeWritten = false;
    browserSettings = defaultSettings();
  }
  return browserSettings;
}

function writeStoredSettings() {
  if (!settingsCanBeWritten) {
    return;
  }
  try {
    const savedSettings = {...readStoredSettings()};
    delete savedSettings.theme;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(savedSettings));
  } catch {
    settingsCanBeWritten = false;
  }
}

function readStoredPlaylists() {
  if (browserPlaylists) {
    return browserPlaylists;
  }
  try {
    const saved = localStorage.getItem(PLAYLISTS_KEY);
    if (saved === null) {
      browserPlaylists = Object.create(null) as Record<string, IPlaylist>;
      return browserPlaylists;
    }
    const parsed: unknown = JSON.parse(saved);
    if (!isPlainRecord(parsed)) {
      playlistsCanBeWritten = false;
      browserPlaylists = Object.create(null) as Record<string, IPlaylist>;
      return browserPlaylists;
    }
    browserPlaylists = sanitizePlaylists(parsed);
  } catch {
    playlistsCanBeWritten = false;
    browserPlaylists = Object.create(null) as Record<string, IPlaylist>;
  }
  return browserPlaylists;
}

function writeStoredPlaylists(playlists: Record<string, IPlaylist>) {
  if (!playlistsCanBeWritten) {
    throw new Error('Saved playlists could not be read.');
  }
  try {
    localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(playlists));
    browserPlaylists = playlists;
  } catch (cause) {
    playlistsCanBeWritten = false;
    throw cause;
  }
}

function hashHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function folderIdForName(name: string) {
  return hashHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`name:${name}`))).slice(0, 16);
}

async function trackIdForPath(folderId: string, relativePath: string) {
  return hashHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${folderId}:${relativePath}`))).slice(0, 16);
}

function randomFolderId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function revokeFolderMedia(folderId: string) {
  for (const url of mediaUrlsByFolder.get(folderId) ?? []) {
    URL.revokeObjectURL(url);
  }
  mediaUrlsByFolder.delete(folderId);
}

function createMediaUrl(folderId: string, file: File) {
  const url = URL.createObjectURL(file);
  const urls = mediaUrlsByFolder.get(folderId) ?? new Set<string>();
  urls.add(url);
  mediaUrlsByFolder.set(folderId, urls);
  return url;
}

async function readDurations(files: IScannedFile[]) {
  const durations = new Map<string, number>();
  for (let index = 0; index < files.length; index += 4) {
    const batch = files.slice(index, index + 4);
    const results = await Promise.all(batch.map(async ({file, relativePath}) => {
      try {
        const metadata = await parseBlob(file, {duration: true, skipCovers: true});
        return metadata.format.duration && Number.isFinite(metadata.format.duration) && metadata.format.duration > 0
          ? {relativePath, duration: metadata.format.duration}
          : null;
      } catch {
        return null;
      }
    }));
    for (const result of results) {
      if (result) {
        durations.set(result.relativePath, result.duration);
      }
    }
  }
  return durations;
}

async function buildMediaTracks(
  folderId: string,
  name: string,
  files: IScannedFile[],
  mediaOwnerFolderId: string,
) {
  const durations = await readDurations(files);
  const tracks: IMediaTrack[] = await Promise.all(files.map(async ({file, relativePath}, index) => {
    const fileName = file.name;
    const {sequence, title} = titleForFile(fileName);
    return {
      id: await trackIdForPath(folderId, relativePath),
      folderId,
      sequence: sequence || index + 1,
      title: title || fileName,
      fileName,
      relativePath,
      section: sectionForRelativePath(name, relativePath),
      kind: MEDIA_TYPES[extensionForFileName(fileName)] as IMediaTrack['kind'],
      mediaUrl: createMediaUrl(mediaOwnerFolderId, file),
      bytes: file.size,
      duration: durations.get(relativePath) ?? null,
    };
  }));
  return tracks;
}

async function resolveFileFromDirectory(root: FileSystemDirectoryHandle, relativePath: string) {
  const segments = relativePath.split('/');
  if (!segments.length || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    return null;
  }
  try {
    let directory = root;
    for (const segment of segments.slice(0, -1)) {
      directory = await directory.getDirectoryHandle(segment);
    }
    const fileHandle = await directory.getFileHandle(segments.at(-1)!);
    return await fileHandle.getFile();
  } catch {
    return null;
  }
}

async function resolveAddedTracks(folderId: string, playlist: IPlaylist | null) {
  const pickerWindow = window as IFolderPickerWindow;
  if (!pickerWindow.showDirectoryPicker || !playlist?.added.length) {
    return [];
  }
  const recentFolders = readStoredState().recentFolders;
  const tracksByPath = new Map<string, IMediaTrack>();
  const sourceFolderIds = [...new Set(playlist.added.map((entry) => entry.folderId).filter((sourceId) => sourceId !== folderId))];
  for (const sourceFolderId of sourceFolderIds) {
    const sourceFolder = recentFolders.find((folder) => folder.id === sourceFolderId);
    if (!sourceFolder) {
      continue;
    }
    const handle = await getDirectoryHandle(sourceFolderId).catch(() => null);
    if (!handle || !await permissionGranted(handle, false)) {
      continue;
    }
    const resolvedFiles: IScannedFile[] = [];
    for (const entry of playlist.added.filter((candidate) => candidate.folderId === sourceFolderId)) {
      const file = await resolveFileFromDirectory(handle, entry.relativePath);
      if (file && MEDIA_TYPES[extensionForFileName(file.name)]) {
        resolvedFiles.push({file, relativePath: entry.relativePath});
      }
    }
    const tracks = (await buildMediaTracks(sourceFolder.id, sourceFolder.name, resolvedFiles, folderId))
      .map((track) => ({...track, section: sourceFolder.name}));
    for (const track of tracks) {
      tracksByPath.set(`${sourceFolderId}:${track.relativePath}`, track);
    }
  }
  return playlist.added.flatMap((entry) => {
    const track = tracksByPath.get(`${entry.folderId}:${entry.relativePath}`);
    return track ? [track] : [];
  });
}

async function finishFolderScan(
  folderId: string,
  name: string,
  files: IScannedFile[],
): Promise<IFolder> {
  revokeFolderMedia(folderId);
  files.sort((left, right) => compareMediaPaths(left.relativePath, right.relativePath));
  const tracks = await buildMediaTracks(folderId, name, files, folderId);
  tracks.sort(compareMediaTracks);
  const playlist = readStoredPlaylists()[folderId] ?? null;
  const state = readStoredState();
  const folder: IFolder = {
    id: folderId,
    name,
    rootPath: name,
    tracks,
    addedTracks: await resolveAddedTracks(folderId, playlist),
    playlist,
    scannedAt: Date.now(),
  };
  state.lastFolderId = folderId;
  state.recentFolders = [
    {id: folderId, name, rootPath: name, mediaCount: playlistTracks(folder).length, lastOpenedAt: Date.now()},
    ...state.recentFolders.filter((recentFolder) => recentFolder.id !== folderId),
  ].slice(0, MAX_LIBRARY_FOLDERS);
  writeStoredState();
  return folder;
}

async function collectFromDirectory(root: FileSystemDirectoryHandle) {
  const files: IScannedFile[] = [];
  const walk = async (directory: FileSystemDirectoryHandle, prefix: string) => {
    for await (const [name, entry] of directory.entries()) {
      if (name.startsWith('.')) {
        continue;
      }
      const relativePath = prefix ? `${prefix}/${name}` : name;
      if (entry.kind === 'directory') {
        const childDirectory = entry as FileSystemDirectoryHandle;
        await walk(childDirectory, relativePath);
      } else if (entry.kind === 'file' && MEDIA_TYPES[extensionForFileName(name)]) {
        files.push({file: await (entry as FileSystemFileHandle).getFile(), relativePath});
      }
    }
  };
  await walk(root, '');
  return files;
}

async function findSavedFolderId(handle: FileSystemDirectoryHandle) {
  try {
    for (const record of await getAllDirectoryHandles()) {
      if (await handle.isSameEntry(record.handle)) {
        return record.folderId;
      }
    }
  } catch {
    return null;
  }
  return null;
}

async function scanDirectoryHandle(handle: FileSystemDirectoryHandle, folderId: string): Promise<IFolder> {
  const files = await collectFromDirectory(handle);
  const folder = await finishFolderScan(folderId, handle.name, files);
  await putDirectoryHandle(folderId, handle).catch(() => undefined);
  return folder;
}

async function getLibraryFolderTracks(folderId: string, forFolderId: string) {
  const recentFolder = readStoredState().recentFolders.find((folder) => folder.id === folderId);
  if (!recentFolder) {
    return [];
  }
  const handle = await getDirectoryHandle(folderId).catch(() => null);
  if (!handle || !await permissionGranted(handle, true)) {
    return [];
  }
  const files = (await collectFromDirectory(handle)).sort((left, right) => compareMediaPaths(left.relativePath, right.relativePath));
  const tracks = await buildMediaTracks(folderId, recentFolder.name, files, forFolderId);
  tracks.sort(compareMediaTracks);
  return tracks;
}

async function chooseDirectoryHandle() {
  const pickerWindow = window as IFolderPickerWindow;
  if (!pickerWindow.showDirectoryPicker) {
    return null;
  }
  try {
    return await pickerWindow.showDirectoryPicker({id: 'evb-player', mode: 'read'});
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      return null;
    }
    throw cause;
  }
}

function chooseDirectoryFiles() {
  return new Promise<File[] | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.setAttribute('webkitdirectory', '');
    input.addEventListener('change', () => resolve(input.files ? Array.from(input.files) : []), {once: true});
    input.addEventListener('cancel', () => resolve(null), {once: true});
    input.click();
  });
}

function scanChosenFiles(files: File[]) {
  const firstPath = files[0]?.webkitRelativePath ?? '';
  const name = firstPath.split('/')[0] || 'Selected folder';
  const scannedFiles = files.flatMap((file) => {
    const pathParts = file.webkitRelativePath.split('/');
    if (pathParts.length < 2 || pathParts.some((part) => part.startsWith('.'))) {
      return [];
    }
    const relativePath = pathParts.slice(1).join('/');
    return MEDIA_TYPES[extensionForFileName(file.name)] ? [{file, relativePath}] : [];
  });
  return folderIdForName(name).then((folderId) => finishFolderScan(folderId, name, scannedFiles));
}

function updateFolderProgress(folderId: string, update: (progress: TFolderProgress) => TFolderProgress) {
  const state = readStoredState();
  const folderProgress = update({...state.progress[folderId]});
  if (Object.keys(folderProgress).length) {
    state.progress[folderId] = folderProgress;
  } else {
    delete state.progress[folderId];
  }
  writeStoredState();
}

async function permissionGranted(handle: FileSystemDirectoryHandle, allowPrompt: boolean) {
  const permissionHandle = handle as IPermissionDirectoryHandle;
  if (await permissionHandle.queryPermission({mode: 'read'}) === 'granted') {
    return true;
  }
  return allowPrompt && await permissionHandle.requestPermission({mode: 'read'}) === 'granted';
}

export const browserPlayerApi: IPlayerApi = {
  capabilities: {
    revealFolder: false,
    openMediaExternally: false,
    updates: false,
    addFromOtherFolders: typeof (window as IFolderPickerWindow).showDirectoryPicker === 'function',
  },
  async getSettings() {
    return {...readStoredSettings()};
  },
  async setTheme(theme: TTheme) {
    writeBrowserCookie(THEME_COOKIE, theme);
    readStoredSettings().theme = theme;
    writeStoredSettings();
  },
  async setLocale(locale: TLocale) {
    readStoredSettings().locale = locale;
    writeStoredSettings();
  },
  async chooseFolder() {
    const handle = await chooseDirectoryHandle();
    if (handle) {
      const folderId = await findSavedFolderId(handle) ?? randomFolderId();
      return scanDirectoryHandle(handle, folderId);
    }
    if ((window as IFolderPickerWindow).showDirectoryPicker) {
      return null;
    }
    const files = await chooseDirectoryFiles();
    return files ? scanChosenFiles(files) : null;
  },
  async openRecentFolder(rootPath: string, folderId?: string) {
    const recentFolder = readStoredState().recentFolders.find((candidate) => candidate.id === folderId)
      ?? readStoredState().recentFolders.find((candidate) => candidate.rootPath === rootPath);
    if (!recentFolder) {
      return null;
    }
    const handle = await getDirectoryHandle(recentFolder.id).catch(() => null);
    if (handle) {
      if (!await permissionGranted(handle, true)) {
        throw new Error('Folder access was denied.');
      }
      return scanDirectoryHandle(handle, recentFolder.id);
    }
    const files = await chooseDirectoryFiles();
    return files ? scanChosenFiles(files) : null;
  },
  async restoreLastFolder() {
    const folderId = readStoredState().lastFolderId;
    if (!folderId) {
      return null;
    }
    const handle = await getDirectoryHandle(folderId).catch(() => null);
    if (!handle || !await permissionGranted(handle, false)) {
      return null;
    }
    return scanDirectoryHandle(handle, folderId);
  },
  async getRecentFolders() {
    const state = readStoredState();
    return summarizeRecentFolders(state.recentFolders, state.progress);
  },
  async getFolderTracks(folderId: string, forFolderId: string) {
    return getLibraryFolderTracks(folderId, forFolderId);
  },
  async savePlaylist(payload) {
    if (!isStoredIdentifier(payload.folderId) || !Number.isSafeInteger(payload.trackCount) || payload.trackCount < 0) {
      return;
    }
    const state = readStoredState();
    if (!state.recentFolders.some((folder) => folder.id === payload.folderId)) {
      return;
    }
    const playlist = payload.playlist === null ? null : sanitizePlaylist(payload.playlist);
    const nextPlaylists = {...readStoredPlaylists()};
    if (playlist) {
      nextPlaylists[payload.folderId] = playlist;
    } else {
      delete nextPlaylists[payload.folderId];
    }
    writeStoredPlaylists(nextPlaylists);
    state.recentFolders = state.recentFolders.map((folder) => folder.id === payload.folderId
      ? {...folder, mediaCount: payload.trackCount}
      : folder);
    writeStoredState();
  },
  async removeRecentFolder(rootPath: string, folderId?: string) {
    const state = readStoredState();
    const recentFolder = state.recentFolders.find((candidate) => candidate.id === folderId)
      ?? state.recentFolders.find((candidate) => candidate.rootPath === rootPath);
    if (!recentFolder) {
      return;
    }
    state.recentFolders = state.recentFolders.filter((candidate) => candidate.id !== recentFolder.id);
    if (state.lastFolderId === recentFolder.id) {
      state.lastFolderId = null;
    }
    revokeFolderMedia(recentFolder.id);
    writeStoredState();
    // Keep the handle identity so reselecting this folder restores its id and playlist references.
  },
  async closeFolder(folderId: string) {
    revokeFolderMedia(folderId);
  },
  async revealFolder() {},
  async getFolderProgress(folderId: string) {
    return {...(readStoredState().progress[folderId] ?? {})};
  },
  async saveTrackProgress({folderId, trackId, progress}: ISaveTrackProgressPayload) {
    updateFolderProgress(folderId, (folderProgress) => ({...folderProgress, [trackId]: progress}));
  },
  async clearTrackProgress(folderId: string, trackId: string) {
    updateFolderProgress(folderId, (folderProgress) => {
      delete folderProgress[trackId];
      return folderProgress;
    });
  },
  async clearFolderProgress(folderId: string) {
    updateFolderProgress(folderId, () => ({}));
  },
  async openMediaExternally() {},
  async setWindowFullscreen(fullscreen: boolean) {
    if (fullscreen) {
      await document.documentElement.requestFullscreen();
    } else if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
    return Boolean(document.fullscreenElement);
  },
  onWindowFullscreenChanged(listener) {
    const handler = () => listener(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  },
  onMenuAction(_listener: (action: TMenuAction) => void) {
    return () => undefined;
  },
  async getUpdateStatus() {
    return {...idleUpdateStatus};
  },
  onUpdateStatus(_listener: (status: IUpdateStatus) => void) {
    return () => undefined;
  },
  async checkForUpdates() {},
  async downloadUpdate() {},
  async installUpdate() {},
  async skipUpdate(_version: string) {},
};
