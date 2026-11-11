-- alter table public.notes enable row level security;
create table if not exists public.notes (
  id uuid primary key,
  user_id uuid not null,
  body text not null
);

create table public.profiles (
  id uuid primary key,
  display_name text
);

create table public."Notes" (
  id uuid primary key
);

create table public.audit_log (
  id bigint generated always as identity primary key
);

alter table public.audit_log enable row level security;

alter table public.legacy_flags disable row level security;
