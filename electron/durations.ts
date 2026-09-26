import {open, type FileHandle} from 'node:fs/promises';
import {extname} from 'node:path';

const MP4_EXTENSIONS = new Set(['.mp4', '.m4v', '.m4a', '.mov']);

interface IBoxRange {
  start: number;
  end: number;
}

async function findBox(handle: FileHandle, range: IBoxRange, type: string): Promise<IBoxRange | null> {
  const header = Buffer.alloc(16);
  for (let offset = range.start; offset + 8 <= range.end;) {
    const {bytesRead} = await handle.read(header, 0, 16, offset);
    if (bytesRead < 8) {
      return null;
    }
    let boxSize = header.readUInt32BE(0);
    let headerSize = 8;
    if (boxSize === 1) {
      if (bytesRead < 16) {
        return null;
      }
      boxSize = Number(header.readBigUInt64BE(8));
      headerSize = 16;
    } else if (boxSize === 0) {
      boxSize = range.end - offset;
    }
    if (boxSize < headerSize) {
      return null;
    }
    if (header.toString('latin1', 4, 8) === type) {
      return {start: offset + headerSize, end: Math.min(offset + boxSize, range.end)};
    }
    offset += boxSize;
  }
  return null;
}

// The movie header (moov/mvhd) holds the whole presentation's length, including videos without an audio track.
async function readMp4Duration(filePath: string) {
  const handle = await open(filePath, 'r');
  try {
    const moov = await findBox(handle, {start: 0, end: (await handle.stat()).size}, 'moov');
    const mvhd = moov && await findBox(handle, moov, 'mvhd');
    if (!mvhd) {
      return null;
    }
    const body = Buffer.alloc(32);
    const {bytesRead} = await handle.read(body, 0, 32, mvhd.start);
    const version = body.readUInt8(0);
    if (bytesRead < (version === 1 ? 32 : 20)) {
      return null;
    }
    const timescale = body.readUInt32BE(version === 1 ? 20 : 12);
    const duration = version === 1 ? Number(body.readBigUInt64BE(24)) : body.readUInt32BE(16);
    // Fragmented files leave the duration at zero or all ones.
    return timescale > 0 && duration > 0 && duration !== 0xffffffff ? duration / timescale : null;
  } finally {
    await handle.close();
  }
}

async function readDuration(filePath: string) {
  if (MP4_EXTENSIONS.has(extname(filePath).toLowerCase())) {
    const duration = await readMp4Duration(filePath).catch(() => null);
    if (duration) {
      return duration;
    }
  }
  const {parseFile} = await import('music-metadata');
  const {format} = await parseFile(filePath, {duration: false, skipCovers: true});
  return format.duration;
}

// Reads durations from the container headers, so it works on every platform and on unindexed drives.
export async function readDurationMap(filePaths: string[]) {
  const durations = new Map<string, number>();
  const queue = [...filePaths];
  const readNext = async () => {
    for (let filePath = queue.shift(); filePath; filePath = queue.shift()) {
      try {
        const duration = await readDuration(filePath);
        if (duration && Number.isFinite(duration) && duration > 0) {
          durations.set(filePath, duration);
        }
      } catch {
        // An unreadable or unsupported header leaves the duration to be filled in on playback.
      }
    }
  };
  await Promise.all(Array.from({length: Math.min(8, filePaths.length)}, readNext));
  return durations;
}
