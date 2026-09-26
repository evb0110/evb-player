import type {IFolder, IMediaTrack, IPlaylist, IPlaylistAddedTrack} from './types';
import {isPlainRecord, isStoredIdentifier} from './state';

const MAX_PLAYLIST_ENTRIES = 10_000;
const MAX_RELATIVE_PATH_LENGTH = 4096;

export function playlistTracks(folder: IFolder): IMediaTrack[] {
  const playlist = folder.playlist;
  if (!playlist) {
    return folder.tracks;
  }
  const removed = new Set(playlist.removed);
  const available = new Map([...folder.tracks.filter((track) => !removed.has(track.id)), ...folder.addedTracks].map((track) => [track.id, track] as const));
  if (!playlist.order) {
    return [...available.values()];
  }
  const ordered = playlist.order.flatMap((id) => {
    const track = available.get(id);
    available.delete(id);
    return track ? [track] : [];
  });
  // Files that appeared since the last edit go last, in folder order.
  return [...ordered, ...available.values()];
}

function normalizePlaylist(playlist: IPlaylist): IPlaylist | null {
  return playlist.order === null && playlist.removed.length === 0 && playlist.favorites.length === 0 && playlist.added.length === 0
    ? null
    : playlist;
}

function playlistFor(playlist: IPlaylist | null) {
  return playlist ?? {order: null, removed: [], favorites: [], added: []};
}

function appendToOrder(order: string[] | null, trackIds: string[]) {
  if (!order) {
    return null;
  }
  const nextOrder = [...order];
  for (const trackId of trackIds) {
    const existingIndex = nextOrder.indexOf(trackId);
    if (existingIndex >= 0) {
      nextOrder.splice(existingIndex, 1);
    }
    nextOrder.push(trackId);
  }
  return nextOrder;
}

export function movePlaylistTrack(folder: IFolder, playlist: IPlaylist | null, trackId: string, targetIndex: number): IPlaylist | null {
  const tracks = [...playlistTracks({...folder, playlist})];
  const sourceIndex = tracks.findIndex((track) => track.id === trackId);
  if (sourceIndex < 0 || !Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= tracks.length || sourceIndex === targetIndex) {
    return playlist;
  }
  const [track] = tracks.splice(sourceIndex, 1);
  tracks.splice(targetIndex, 0, track!);
  return normalizePlaylist({...playlistFor(playlist), order: tracks.map((candidate) => candidate.id)});
}

export function togglePlaylistFavorite(playlist: IPlaylist | null, trackId: string): IPlaylist | null {
  const next = playlistFor(playlist);
  const favorites = next.favorites.includes(trackId)
    ? next.favorites.filter((id) => id !== trackId)
    : [...next.favorites, trackId];
  return normalizePlaylist({...next, favorites});
}

export function removePlaylistTrack(folder: IFolder, playlist: IPlaylist | null, track: IMediaTrack): IPlaylist | null {
  const next = playlistFor(playlist);
  const removed = track.folderId === folder.id
    ? [...new Set([...next.removed, track.id])]
    : next.removed;
  const added = track.folderId === folder.id
    ? next.added
    : next.added.filter((entry) => entry.folderId !== track.folderId || entry.relativePath !== track.relativePath);
  return normalizePlaylist({
    ...next,
    order: next.order?.filter((id) => id !== track.id) ?? null,
    removed,
    favorites: next.favorites.filter((id) => id !== track.id),
    added,
  });
}

export function addPlaylistTracks(folder: IFolder, playlist: IPlaylist | null, tracks: IMediaTrack[]): IPlaylist | null {
  const next = playlistFor(playlist);
  const currentFolder = {...folder, playlist};
  const availableIds = new Set(playlistTracks(currentFolder).map((track) => track.id));
  const removed = new Set(next.removed);
  const added = [...next.added];
  const addedKeys = new Set(added.map((entry) => `${entry.folderId}:${entry.relativePath}`));
  const appendedIds: string[] = [];

  for (const track of tracks) {
    if (availableIds.has(track.id)) {
      continue;
    }
    if (track.folderId === folder.id) {
      removed.delete(track.id);
    } else {
      const key = `${track.folderId}:${track.relativePath}`;
      if (!addedKeys.has(key)) {
        added.push({folderId: track.folderId, relativePath: track.relativePath});
        addedKeys.add(key);
      }
    }
    availableIds.add(track.id);
    appendedIds.push(track.id);
  }

  return normalizePlaylist({
    ...next,
    removed: [...removed],
    added,
    order: appendToOrder(next.order, appendedIds),
  });
}

function sanitizeIdentifierList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: string[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    if (!isStoredIdentifier(candidate) || seen.has(candidate)) {
      continue;
    }
    result.push(candidate);
    seen.add(candidate);
    if (result.length === MAX_PLAYLIST_ENTRIES) {
      break;
    }
  }
  return result;
}

function isStoredRelativePath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_RELATIVE_PATH_LENGTH || value.startsWith('/') || value.includes('\\') || value.includes('\0')) {
    return false;
  }
  const segments = value.split('/');
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

function sanitizeAddedTracks(value: unknown): IPlaylistAddedTrack[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: IPlaylistAddedTrack[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    if (!isPlainRecord(candidate) || !isStoredIdentifier(candidate.folderId) || !isStoredRelativePath(candidate.relativePath)) {
      continue;
    }
    const key = `${candidate.folderId}:${candidate.relativePath}`;
    if (seen.has(key)) {
      continue;
    }
    result.push({folderId: candidate.folderId, relativePath: candidate.relativePath});
    seen.add(key);
    if (result.length === MAX_PLAYLIST_ENTRIES) {
      break;
    }
  }
  return result;
}

export function sanitizePlaylist(value: unknown): IPlaylist | null {
  if (!isPlainRecord(value)) {
    return null;
  }
  const order = value.order === null || !Array.isArray(value.order) ? null : sanitizeIdentifierList(value.order);
  return normalizePlaylist({
    order,
    removed: sanitizeIdentifierList(value.removed),
    favorites: sanitizeIdentifierList(value.favorites),
    added: sanitizeAddedTracks(value.added),
  });
}

export function sanitizePlaylists(value: unknown): Record<string, IPlaylist> {
  const playlists = Object.create(null) as Record<string, IPlaylist>;
  if (!isPlainRecord(value)) {
    return playlists;
  }
  for (const [folderId, candidate] of Object.entries(value)) {
    if (!isStoredIdentifier(folderId)) {
      continue;
    }
    const playlist = sanitizePlaylist(candidate);
    if (playlist) {
      playlists[folderId] = playlist;
    }
  }
  return playlists;
}
