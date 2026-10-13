-- =====================================================================
-- Venus, Re-posed · shared group platform — Supabase setup
-- Run once: Supabase dashboard → SQL Editor → New query → paste → Run.
-- The last lines set the group's edit code (pre-filled below; change it
-- if you like). Visitors never need it; group members type it once on
-- the website to add, edit and delete works.
-- Running the file again is safe (it only resets the edit code).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- tables ----------
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  code_hash text not null
);
create table if not exists public.members (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{1,40}$'),
  nick text not null check (char_length(nick) between 1 and 30),
  role text not null default '' check (char_length(role) <= 40),
  updated_at timestamptz not null default now()
);
create table if not exists public.works (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{1,40}$'),
  owner text not null check (owner ~ '^[A-Za-z0-9_-]{1,40}$'),
  pub boolean not null default true,
  data jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 262144),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists works_created_idx on public.works (created_at desc);
create table if not exists public.hall (
  key text primary key check (key ~ '^[a-z]{1,20}$'),
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.upload_tickets (
  name text primary key,
  expires timestamptz not null
);

-- ---------- who may read what ----------
-- Everyone (visitors included) reads members, the hall settings and the
-- works marked public. Nothing is written directly: every write goes
-- through the functions below, which check the edit code first.
alter table public.settings enable row level security;
alter table public.members enable row level security;
alter table public.works enable row level security;
alter table public.hall enable row level security;
alter table public.upload_tickets enable row level security;

grant select on public.members, public.works, public.hall to anon, authenticated;

drop policy if exists "read members" on public.members;
create policy "read members" on public.members for select using (true);
drop policy if exists "read public works" on public.works;
create policy "read public works" on public.works for select using (pub);
drop policy if exists "read hall" on public.hall;
create policy "read hall" on public.hall for select using (true);

-- ---------- the edit code ----------
create or replace function public.code_ok(code text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from public.settings s
    where s.id = 1 and s.code_hash = extensions.crypt(coalesce(code, ''), s.code_hash)
  );
$$;

create or replace function public.check_code(code text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select public.code_ok(code);
$$;

create or replace function public.require_code(code text) returns void
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not public.code_ok(code) then
    raise exception 'wrong edit code' using errcode = '28000';
  end if;
end $$;

-- ---------- group members (with the code) ----------
-- every work, public or group-only
create or replace function public.list_works(code text) returns setof public.works
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform public.require_code(code);
  return query select * from public.works order by created_at desc limit 2000;
end $$;

create or replace function public.save_work(code text, wid text, wowner text, wdata jsonb)
returns public.works
language plpgsql security definer set search_path = public, extensions as $$
declare r public.works;
begin
  perform public.require_code(code);
  insert into public.works (id, owner, pub, data)
  values (wid, wowner, coalesce((wdata->>'pub')::boolean, true), wdata)
  on conflict (id) do update
    set owner = excluded.owner, pub = excluded.pub, data = excluded.data, updated_at = now()
  returning * into r;
  return r;
end $$;

create or replace function public.delete_work(code text, wid text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.require_code(code);
  delete from public.works where id = wid;
  delete from public.hall where key = 'main' and data->>'item' = wid;
end $$;

create or replace function public.save_member(code text, mid text, mnick text, mrole text)
returns public.members
language plpgsql security definer set search_path = public, extensions as $$
declare r public.members;
begin
  perform public.require_code(code);
  insert into public.members (id, nick, role) values (mid, btrim(mnick), btrim(coalesce(mrole, '')))
  on conflict (id) do update set nick = excluded.nick, role = excluded.role, updated_at = now()
  returning * into r;
  return r;
end $$;

-- hall settings, e.g. key 'main' = the default sequence; null data removes it
create or replace function public.set_hall(code text, hkey text, hdata jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.require_code(code);
  if hdata is null then
    delete from public.hall where key = hkey;
  else
    insert into public.hall (key, data) values (hkey, hdata)
    on conflict (key) do update set data = excluded.data, updated_at = now();
  end if;
end $$;

-- ---------- file uploads ----------
-- A member asks for an upload ticket (with the code); the storage policy
-- below only accepts files whose name has a fresh ticket.
create or replace function public.request_upload(code text, ext text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare n text;
begin
  perform public.require_code(code);
  if ext !~ '^[a-z0-9]{1,8}$' then raise exception 'bad file extension'; end if;
  delete from public.upload_tickets where expires < now();
  n := 'u/' || extensions.gen_random_uuid()::text || '.' || ext;
  insert into public.upload_tickets (name, expires) values (n, now() + interval '30 minutes');
  return n;
end $$;

create or replace function public.ticket_ok(objname text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from public.upload_tickets t where t.name = objname and t.expires > now());
$$;

revoke all on function public.code_ok(text), public.check_code(text), public.require_code(text), public.list_works(text),
  public.save_work(text, text, text, jsonb), public.delete_work(text, text), public.save_member(text, text, text, text),
  public.set_hall(text, text, jsonb), public.request_upload(text, text), public.ticket_ok(text) from public;
grant execute on function public.check_code(text), public.list_works(text), public.save_work(text, text, text, jsonb),
  public.delete_work(text, text), public.save_member(text, text, text, text), public.set_hall(text, text, jsonb),
  public.request_upload(text, text), public.ticket_ok(text) to anon, authenticated;

-- public bucket for the files (50 MB per file, the free-plan maximum)
insert into storage.buckets (id, name, public, file_size_limit)
values ('works', 'works', true, 52428800)
on conflict (id) do update set public = true, file_size_limit = 52428800;

drop policy if exists "venus upload with ticket" on storage.objects;
create policy "venus upload with ticket" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'works' and public.ticket_ok(name));
drop policy if exists "venus read own upload" on storage.objects;
create policy "venus read own upload" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'works' and public.ticket_ok(name));

-- a first shared item: the group's research site (kept if it already exists)
insert into public.works (id, owner, pub, data) values ('seed-atlas', 'group', true, jsonb_build_object(
  'kind', 'link', 'title', 'Goddess Sculpture Atlas（组内研究网站）',
  'note', '105 件维纳斯与女神雕塑的模型、姿势标注和骨骼候选；展厅里的雕塑都来自这里。',
  'cat', 'research', 'link', 'https://goddess-sculpture-atlas.silkykoala4.chatgpt.site',
  'files', '[]'::jsonb, 'pub', true, 'createdAt', '2026-10-13T11:01:00.000Z', 'updatedAt', '2026-10-13T11:01:00.000Z'))
on conflict (id) do nothing;

-- ---------- the edit code (to change it later, edit and run just this statement) ----------
insert into public.settings (id, code_hash)
values (1, extensions.crypt('venus-n7b3-xp65-3qr2', extensions.gen_salt('bf', 8)))
on conflict (id) do update set code_hash = excluded.code_hash;
