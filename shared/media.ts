import type {IMediaLesson, TMediaKind} from './types';

export const MEDIA_TYPES: Record<string, TMediaKind> = {
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

export const MEDIA_MIME_TYPES: Record<string, string> = {
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

export function extensionForFileName(fileName: string) {
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex > 0 ? fileName.slice(dotIndex).toLowerCase() : '';
}

export function titleForFile(fileName: string) {
  const extension = extensionForFileName(fileName);
  const withoutExtension = extension ? fileName.slice(0, -extension.length) : fileName;
  const numberedName = withoutExtension.match(/^(\d{1,5})\s*[._)\-]+\s*(.+)$/u);
  if (!numberedName) {
    return {sequence: 0, title: withoutExtension.replace(/[._]+/gu, ' ').trim()};
  }

  return {
    sequence: Number(numberedName[1]),
    title: (numberedName[2] ?? '').replace(/[._]+/gu, ' ').replace(/\s+/gu, ' ').trim(),
  };
}

export function compareMediaPaths(left: string, right: string) {
  return left.localeCompare(right, undefined, {numeric: true});
}

export function sectionForRelativePath(folderName: string, relativePath: string) {
  const separatorIndex = relativePath.lastIndexOf('/');
  return separatorIndex === -1 ? folderName : relativePath.slice(0, separatorIndex);
}

export function compareMediaLessons(left: Pick<IMediaLesson, 'sequence' | 'title'>, right: Pick<IMediaLesson, 'sequence' | 'title'>) {
  return left.sequence - right.sequence || left.title.localeCompare(right.title, undefined, {numeric: true});
}
