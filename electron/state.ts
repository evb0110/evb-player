import {isAbsolute} from 'node:path';
import type {ILessonProgress, IRecentCourse, TCourseProgress} from '../shared/types';

export interface IStoredState {
  recentCourses: IRecentCourse[];
  progress: Record<string, TCourseProgress>;
  lastCoursePath: string | null;
}

const IDENTIFIER_PATTERN = /^[a-f0-9]{16}$/u;
const MAX_TEXT_LENGTH = 4096;

export function createDefaultState(): IStoredState {
  return {
    recentCourses: [],
    progress: Object.create(null) as Record<string, TCourseProgress>,
    lastCoursePath: null,
  };
}

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

function sanitizeProgress(value: unknown): Record<string, TCourseProgress> {
  const progress = Object.create(null) as Record<string, TCourseProgress>;
  if (!isPlainRecord(value)) {
    return progress;
  }

  for (const [courseId, courseValue] of Object.entries(value)) {
    if (!isStoredIdentifier(courseId) || !isPlainRecord(courseValue)) {
      continue;
    }
    const courseProgress = Object.create(null) as TCourseProgress;
    for (const [lessonId, lessonValue] of Object.entries(courseValue)) {
      if (!isStoredIdentifier(lessonId)) {
        continue;
      }
      const sanitizedLesson = sanitizeLessonProgress(lessonValue);
      if (sanitizedLesson) {
        courseProgress[lessonId] = sanitizedLesson;
      }
    }
    if (Object.keys(courseProgress).length > 0) {
      progress[courseId] = courseProgress;
    }
  }
  return progress;
}

function sanitizeRecentCourses(value: unknown): IRecentCourse[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const recentCourses: IRecentCourse[] = [];
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
    if (typeof rootPath !== 'string' || !isAbsolute(rootPath) || rootPath.length > MAX_TEXT_LENGTH) {
      continue;
    }
    const mediaCount = candidate.mediaCount;
    if (typeof mediaCount !== 'number' || !Number.isSafeInteger(mediaCount) || mediaCount < 0) {
      continue;
    }
    recentCourses.push({
      id,
      name,
      rootPath,
      mediaCount,
      lastOpenedAt: timestamp(candidate.lastOpenedAt, 0),
    });
    seenIds.add(id);
    if (recentCourses.length === 12) {
      break;
    }
  }
  return recentCourses;
}

export function sanitizeStoredState(value: unknown): IStoredState | null {
  if (!isPlainRecord(value) || !Array.isArray(value.recentCourses) || !isPlainRecord(value.progress)) {
    return null;
  }

  const lastCoursePath = value.lastCoursePath;
  if (lastCoursePath !== null && (typeof lastCoursePath !== 'string' || !isAbsolute(lastCoursePath) || lastCoursePath.length > MAX_TEXT_LENGTH)) {
    return null;
  }

  return {
    recentCourses: sanitizeRecentCourses(value.recentCourses),
    progress: sanitizeProgress(value.progress),
    lastCoursePath,
  };
}
