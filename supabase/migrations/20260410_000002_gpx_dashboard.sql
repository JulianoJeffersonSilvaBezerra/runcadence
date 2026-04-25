-- GPX dashboard schema
-- Created: 2026-04-10

create table if not exists public.gpx_runs (
  id bigint generated always as identity primary key,
  run_key text not null unique,
  file_name text not null,
  run_name text not null,
  run_type text default 'running',
  source text not null default 'gpx_import',
  started_at timestamptz,
  ended_at timestamptz,
  date_local date,
  duration_seconds integer not null default 0,
  moving_seconds integer not null default 0,
  distance_km numeric(8,3) not null default 0,
  avg_pace_min_km numeric(7,3),
  avg_speed_kmh numeric(7,3),
  max_speed_kmh numeric(7,3),
  elevation_gain_m numeric(9,2) default 0,
  elevation_loss_m numeric(9,2) default 0,
  min_elevation_m numeric(7,2),
  max_elevation_m numeric(7,2),
  point_count integer not null default 0,
  avg_cadence_spm numeric(6,2),
  max_cadence_spm integer,
  bbox jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_gpx_runs_date_local on public.gpx_runs(date_local desc);
create index if not exists idx_gpx_runs_started_at on public.gpx_runs(started_at desc);

create trigger trg_gpx_runs_updated_at
before update on public.gpx_runs
for each row execute function public.set_updated_at();

create or replace view public.gpx_daily_metrics as
select
  date_local,
  count(*)::int as runs,
  round(sum(distance_km)::numeric, 3) as distance_km,
  sum(duration_seconds)::int as duration_seconds,
  case when sum(distance_km) > 0
    then round(((sum(duration_seconds)::numeric / 60) / sum(distance_km))::numeric, 3)
    else null
  end as avg_pace_min_km,
  round(sum(elevation_gain_m)::numeric, 2) as elevation_gain_m
from public.gpx_runs
group by date_local
order by date_local desc;
