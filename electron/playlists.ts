import {copyFile, mkdir, readFile, rename, unlink, writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import type {IPlaylist} from '../shared/types';
import {isPlainRecord} from '../shared/state';
import {sanitizePlaylists} from '../shared/playlist';

function errorCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return undefined;
  }
  return typeof error.code === 'string' ? error.code : undefined;
}

export function createPlaylistStore(getFilePath: () => string) {
  let storedPlaylists: Record<string, IPlaylist> | null = null;
  let loadPromise: Promise<Record<string, IPlaylist>> | null = null;
  let writeQueue: Promise<void> = Promise.resolve();
  let writeSequence = 0;
  let unreadableFileNeedsBackup = false;

  async function ensurePlaylists() {
    if (storedPlaylists) {
      return storedPlaylists;
    }
    if (loadPromise) {
      return loadPromise;
    }

    loadPromise = (async () => {
      let rawPlaylists: string;
      try {
        rawPlaylists = await readFile(getFilePath(), 'utf8');
      } catch (error) {
        if (errorCode(error) === 'ENOENT') {
          storedPlaylists = Object.create(null) as Record<string, IPlaylist>;
          return storedPlaylists;
        }
        throw error;
      }

      try {
        const parsed: unknown = JSON.parse(rawPlaylists);
        if (!isPlainRecord(parsed)) {
          unreadableFileNeedsBackup = true;
          storedPlaylists = Object.create(null) as Record<string, IPlaylist>;
        } else {
          storedPlaylists = sanitizePlaylists(parsed);
        }
      } catch {
        unreadableFileNeedsBackup = true;
        storedPlaylists = Object.create(null) as Record<string, IPlaylist>;
      }
      return storedPlaylists;
    })().catch((error: unknown) => {
      loadPromise = null;
      throw error;
    });
    return loadPromise;
  }

  async function preserveUnreadableFile(filePath: string) {
    if (!unreadableFileNeedsBackup) {
      return;
    }
    try {
      await copyFile(filePath, `${filePath}.unreadable-${Date.now()}`);
    } catch {
      // The next write can still replace the unreadable file.
    }
  }

  async function writeSnapshot(playlists: Record<string, IPlaylist>) {
    const filePath = getFilePath();
    const temporaryPath = `${filePath}.${process.pid}.${++writeSequence}.tmp`;
    await mkdir(dirname(filePath), {recursive: true});
    await preserveUnreadableFile(filePath);
    try {
      await writeFile(temporaryPath, JSON.stringify(playlists, null, 2), {encoding: 'utf8', mode: 0o600});
      await rename(temporaryPath, filePath);
    } catch (error) {
      try {
        await unlink(temporaryPath);
      } catch {
        // Keep the write error as the useful failure.
      }
      throw error;
    }
    unreadableFileNeedsBackup = false;
  }

  function get(folderId: string) {
    return ensurePlaylists().then((playlists) => playlists[folderId] ?? null);
  }

  function save(folderId: string, playlist: IPlaylist | null) {
    const write = writeQueue.then(async () => {
      const current = await ensurePlaylists();
      const next = {...current};
      if (playlist) {
        next[folderId] = playlist;
      } else {
        delete next[folderId];
      }
      await writeSnapshot(next);
      storedPlaylists = next;
    });
    writeQueue = write.catch(() => undefined);
    return write;
  }

  return {get, save};
}
