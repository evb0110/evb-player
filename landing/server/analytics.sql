-- Landing analytics in the shared Neon database (DATABASE_URL). Apply once; safe to re-run.
create table if not exists evb_player_landing_event (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('view', 'download')),
  -- The landing language: the page viewed, or the page a download started from.
  locale text not null,
  -- The installer downloaded, or the platform the page offered the visitor.
  platform text check (platform in ('mac', 'win', 'linux')),
  -- The release version downloaded.
  version text,
  -- ISO 3166-1 alpha-2 country from Vercel's edge.
  country text,
  -- The host of an external referring page.
  referrer_host text,
  -- An anonymous hash that changes every UTC day: counts unique visitors per day, links nothing across days.
  visitor text
);

create index if not exists evb_player_landing_event_created_at on evb_player_landing_event (created_at);
