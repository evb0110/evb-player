import type {ILessonProgress, IRecentFolder, TFolderProgress} from './types';

const IDENTIFIER_PATTERN = /^[a-f0-9]{16}$/u;
const MAX_TEXT_LENGTH = 4096;

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function isStoredIdentifier(value: unknown): value is string {
  return typeof value === 'string' && IDENTIFIER_PATTERN.test(value);
}

function nonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
}

function timestamp(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

export function sanitizeLessonProgress(value: unknown, fallbackUpdatedAt = Date.now()): ILessonProgress | null {
  if (!isPlainRecord(value)) {
    return null;
  }

  const position = value.position;
  const duration = value.duration;
  if (!nonNegativeNumber(position) || !nonNegativeNumber(duration)) {
    return null;
  }

  return {
    position: duration > 0 ? Math.min(position, duration) : position,
    duration,
    completed: value.completed === true,
    updatedAt: timestamp(value.updatedAt, fallbackUpdatedAt),
  };
}

export function sanitizeProgress(value: unknown): Record<string, TFolderProgress> {
  const progress = Object.create(null) as Record<string, TFolderProgress>;
  if (!isPlainRecord(value)) {
    return progress;
  }

  for (const [folderId, folderValue] of Object.entries(value)) {
    if (!isStoredIdentifier(folderId) || !isPlainRecord(folderValue)) {
      continue;
    }
    const folderProgress = Object.create(null) as TFolderProgress;
    for (const [lessonId, lessonValue] of Object.entries(folderValue)) {
      if (!isStoredIdentifier(lessonId)) {
        continue;
      }
      const sanitizedLesson = sanitizeLessonProgress(lessonValue);
      if (sanitizedLesson) {
        folderProgress[lessonId] = sanitizedLesson;
      }
    }
    if (Object.keys(folderProgress).length > 0) {
      progress[folderId] = folderProgress;
    }
  }
  return progress;
}

export function sanitizeRecentFolders(value: unknown, isValidRootPath: (rootPath: string) => boolean): IRecentFolder[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const recentFolders: IRecentFolder[] = [];
  const seenIds = new Set<string>();
  for (const candidate of value) {
    if (!isPlainRecord(candidate)) {
      continue;
    }
    const id = candidate.id;
    const name = candidate.name;
    const rootPath = candidate.rootPath;
    if (!isStoredIdentifier(id) || seenIds.has(id) || typeof name !== 'string' || name.length === 0 || name.length > MAX_TEXT_LENGTH) {
      continue;
    }
    if (typeof rootPath !== 'string' || rootPath.length === 0 || rootPath.length > MAX_TEXT_LENGTH || !isValidRootPath(rootPath)) {
      continue;
    }
    const mediaCount = candidate.mediaCount;
    if (typeof mediaCount !== 'number' || !Number.isSafeInteger(mediaCount) || mediaCount < 0) {
      continue;
    }
    recentFolders.push({
      id,
      name,
      rootPath,
      mediaCount,
      lastOpenedAt: timestamp(candidate.lastOpenedAt, 0),
    });
    seenIds.add(id);
    if (recentFolders.length === 12) {
      break;
    }
  }
  return recentFolders;
}
