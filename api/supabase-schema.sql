-- Rode este SQL no editor SQL do Supabase (Project > SQL Editor > New query)

create table if not exists synced_events (
  id bigserial primary key,
  date_key text not null,
  dashboard_event_id text not null,
  google_event_id text not null,
  content_hash text not null,
  last_synced_at timestamptz not null default now(),
  unique (date_key, dashboard_event_id)
);

create index if not exists idx_synced_events_lookup on synced_events (date_key, dashboard_event_id);

create table if not exists team_members (
  id bigserial primary key,
  name text not null unique,
  email text,
  updated_at timestamptz not null default now()
);

-- Opcional: pré-popular com a equipe atual (edite os e-mails depois pelo admin.html)
insert into team_members (name) values
  ('Bryan'), ('João'), ('Gustavo'), ('Ana Clara'), ('Tábata'), ('Ramom')
on conflict (name) do nothing;
