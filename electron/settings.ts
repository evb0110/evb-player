import {mkdir, readFile, rename, unlink, writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import type {IPlayerSettings, TTheme} from '../shared/types';
import {isPlainRecord} from './state';
import {isSupportedLocale, resolveSupportedLocale} from '../shared/i18n/locales';

let writeSequence = 0;

export function createDefaultSettings(preferredLanguages: readonly string[]): IPlayerSettings {
  return {
    locale: resolveSupportedLocale(preferredLanguages),
    skippedUpdateVersion: null,
  };
}

function isTheme(value: unknown): value is TTheme {
  return value === 'light' || value === 'dark';
}

function isVersion(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= 64
    && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value);
}

export function sanitizeSettings(value: unknown, preferredLanguages: readonly string[]): IPlayerSettings {
  const defaults = createDefaultSettings(preferredLanguages);
  if (!isPlainRecord(value)) {
    return defaults;
  }

  const theme = isTheme(value.theme) ? value.theme : undefined;
  return {
    ...(theme ? {theme} : {}),
    locale: isSupportedLocale(value.locale) ? value.locale : defaults.locale,
    skippedUpdateVersion: isVersion(value.skippedUpdateVersion) ? value.skippedUpdateVersion : null,
  };
}

function errorCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return undefined;
  }
  return typeof error.code === 'string' ? error.code : undefined;
}

export async function readSettingsFile(filePath: string, preferredLanguages: readonly string[]): Promise<IPlayerSettings> {
  let rawSettings: string;
  try {
    rawSettings = await readFile(filePath, 'utf8');
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      return createDefaultSettings(preferredLanguages);
    }
    throw error;
  }

  let parsedSettings: unknown;
  try {
    parsedSettings = JSON.parse(rawSettings) as unknown;
  } catch {
    return createDefaultSettings(preferredLanguages);
  }
  return sanitizeSettings(parsedSettings, preferredLanguages);
}

export async function writeSettingsFile(filePath: string, settings: IPlayerSettings) {
  const temporaryPath = `${filePath}.${process.pid}.${++writeSequence}.tmp`;
  await mkdir(dirname(filePath), {recursive: true});
  try {
    await writeFile(temporaryPath, JSON.stringify(settings, null, 2), {encoding: 'utf8', mode: 0o600});
    await rename(temporaryPath, filePath);
  } catch (error) {
    try {
      await unlink(temporaryPath);
    } catch {
      // Keep the write error as the useful failure.
    }
    throw error;
  }
}
