import { createHash } from 'node:crypto';
import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import type { H3Event } from 'h3';
import type { TPlatform } from '#shared/release';
import { LOCALE_OPTIONS } from '../../../shared/i18n/locales';

interface ILandingEvent {
  kind: 'view' | 'download';
  platform: TPlatform;
  version?: string;
  // The page the event belongs to: the one viewed, or the one a download started from.
  pagePath: string;
}

interface IVercelRequestContext {
  waitUntil?: (promise: Promise<unknown>) => void;
}

const localeCodes = new Set<string>(LOCALE_OPTIONS.map(({ code }) => code));
let sql: NeonQueryFunction<false, false> | null = null;

export function localeForPath(path: string) {
  const segment = path.split(/[/?#]/u)[1] ?? '';
  return localeCodes.has(segment) ? segment : 'en';
}

// The Referer's host when it isn't this site, for traffic sources. Paths and queries are not kept.
function externalReferrerHost(event: H3Event) {
  const referrer = getRequestHeader(event, 'referer');
  if (!referrer) {
    return null;
  }
  try {
    const host = new URL(referrer).host;
    return host === getRequestHost(event, { xForwardedHost: true }) ? null : host;
  } catch {
    return null;
  }
}

// Unique visitors per day without storing addresses: the hash mixes in the day and a server secret, so it
// can't be reversed from the IP space or linked across days.
function dailyVisitor(event: H3Event, secret: string) {
  const address = getRequestIP(event, { xForwardedFor: true }) ?? '';
  const day = new Date().toISOString().slice(0, 10);
  return createHash('sha256').update(`${day}|${address}|${getRequestHeader(event, 'user-agent') ?? ''}|${secret}`).digest('hex').slice(0, 16);
}

/** Stores one landing event without delaying the response; failures never reach the visitor. */
export async function recordLandingEvent(event: H3Event, { kind, platform, version, pagePath }: ILandingEvent) {
  const databaseUrl = useRuntimeConfig(event).databaseUrl;
  if (!databaseUrl || isCrawler(getRequestHeader(event, 'user-agent'))) {
    return;
  }
  sql ??= neon(databaseUrl);
  const write = sql`
    insert into evb_player_landing_event (kind, locale, platform, version, country, referrer_host, visitor)
    values (${kind}, ${localeForPath(pagePath)}, ${platform}, ${version ?? null}, ${getRequestHeader(event, 'x-vercel-ip-country') ?? null},
      ${kind === 'view' ? externalReferrerHost(event) : null}, ${dailyVisitor(event, databaseUrl)})
  `.catch((error: unknown) => {
    console.error('Landing analytics write failed', error instanceof Error ? error.message : error);
  });
  // Vercel keeps the function alive for waitUntil work after the response (the same request context that
  // @vercel/functions uses). Elsewhere, or if that context is missing, the write is awaited instead.
  const vercel = (globalThis as { [key: symbol]: { get?: () => IVercelRequestContext } | undefined })[Symbol.for('@vercel/request-context')]?.get?.();
  if (vercel?.waitUntil) {
    vercel.waitUntil(write);
  } else {
    await write;
  }
}
