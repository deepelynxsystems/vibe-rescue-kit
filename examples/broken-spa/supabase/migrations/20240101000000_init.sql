create table if not exists public.notes (
  id uuid primary key,
  user_id uuid,
  body text
);

create table public.profiles (
  id uuid primary key
);
