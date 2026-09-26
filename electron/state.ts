import {isAbsolute} from 'node:path';
import type {IRecentFolder, TFolderProgress} from '../shared/types';
import {
  isPlainRecord,
  isStoredIdentifier,
  sanitizeProgress,
  sanitizeRecentFolders,
} from '../shared/state';

export {isPlainRecord, isStoredIdentifier, MAX_LIBRARY_FOLDERS, sanitizeTrackProgress, summarizeRecentFolders} from '../shared/state';

export interface IStoredState {
  recentFolders: IRecentFolder[];
  progress: Record<string, TFolderProgress>;
  lastFolderPath: string | null;
}

export function createDefaultState(): IStoredState {
  return {
    recentFolders: [],
    progress: Object.create(null) as Record<string, TFolderProgress>,
    lastFolderPath: null,
  };
}

export function sanitizeStoredState(value: unknown): IStoredState | null {
  if (!isPlainRecord(value) || !Array.isArray(value.recentFolders) || !isPlainRecord(value.progress)) {
    return null;
  }

  const lastFolderPath = value.lastFolderPath;
  if (lastFolderPath !== null && (typeof lastFolderPath !== 'string' || !isAbsolute(lastFolderPath) || lastFolderPath.length > 4096)) {
    return null;
  }

  return {
    recentFolders: sanitizeRecentFolders(value.recentFolders, isAbsolute),
    progress: sanitizeProgress(value.progress),
    lastFolderPath,
  };
}
