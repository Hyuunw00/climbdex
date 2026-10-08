-- climbdex: 도감 데이터. 사용자 본인 행만 읽고 쓴다.

create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gym_id text not null,
  at timestamptz not null,
  photo_path text,
  created_at timestamptz not null default now()
);
create index if not exists visits_user_at on public.visits(user_id, at desc);

create table if not exists public.gym_photos (
  user_id uuid not null references auth.users(id) on delete cascade,
  gym_id text not null,
  photo_path text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, gym_id)
);

alter table public.visits enable row level security;
alter table public.gym_photos enable row level security;

drop policy if exists "visits own" on public.visits;
create policy "visits own" on public.visits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "gym_photos own" on public.gym_photos;
create policy "gym_photos own" on public.gym_photos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
  values ('gym-photos', 'gym-photos', false)
  on conflict (id) do nothing;

drop policy if exists "gym-photos own read" on storage.objects;
create policy "gym-photos own read" on storage.objects
  for select using (bucket_id = 'gym-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "gym-photos own write" on storage.objects;
create policy "gym-photos own write" on storage.objects
  for insert with check (bucket_id = 'gym-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "gym-photos own update" on storage.objects;
create policy "gym-photos own update" on storage.objects
  for update using (bucket_id = 'gym-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "gym-photos own delete" on storage.objects;
create policy "gym-photos own delete" on storage.objects
  for delete using (bucket_id = 'gym-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- 회원 탈퇴: 본인 계정과 데이터 삭제 (visits/gym_photos는 cascade, storage 객체는 앱이 먼저 지움)
create or replace function public.delete_my_account()
returns void language sql security definer set search_path = public as $$
  delete from auth.users where id = auth.uid();
$$;
revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

-- 띠레벨 표 (roadmap 3번). 암장마다 한 행, tapes는 쉬운 순서 배열 [{label,color,v,vMin,vMax}]
create table if not exists public.gym_tapes (
  gym_id text primary key,
  tapes jsonb not null,
  source text not null,
  confidence text,
  record_count int,
  note text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.tape_votes (
  user_id uuid not null references auth.users(id) on delete cascade,
  gym_id text not null,
  label text not null,
  v_min int not null,
  v_max int not null,
  created_at timestamptz not null default now(),
  primary key (user_id, gym_id, label)
);
create index if not exists tape_votes_gym on public.tape_votes(gym_id);
alter table public.tape_votes drop constraint if exists tape_votes_range;
alter table public.tape_votes add constraint tape_votes_range check (v_max >= v_min and v_max - v_min <= 1);

create table if not exists public.tape_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gym_id text not null,
  kind text not null check (kind in ('order', 'v')),
  label text,
  note text,
  checked_in boolean not null default false,
  created_at timestamptz not null default now()
);

-- 완등 기록 (roadmap 3번). 영상은 폰에만, 서버엔 띠 색·완등 여부·근거만
create table if not exists public.sends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gym_id text not null,
  at timestamptz not null,
  label text,
  sent boolean not null,
  basis text not null check (basis in ('location', 'visit', 'manual')),
  video_key text not null,
  clip_id text not null,
  clip_start numeric not null,
  clip_end numeric not null,
  auto_sent boolean,
  tape_version int not null default 1,
  v_min int,
  v_max int,
  created_at timestamptz not null default now(),
  unique (user_id, video_key, clip_id)
);
alter table public.sends add column if not exists clip_id text;
alter table public.sends add column if not exists auto_sent boolean;
alter table public.sends add column if not exists tape_version int not null default 1;
alter table public.sends add column if not exists v_min int;
alter table public.sends add column if not exists v_max int;
update public.sends set clip_id = id::text where clip_id is null;
alter table public.sends alter column clip_id set not null;
alter table public.sends drop constraint if exists sends_user_id_video_key_clip_start_clip_end_key;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'sends_user_id_video_key_clip_id_key') then
    alter table public.sends add constraint sends_user_id_video_key_clip_id_key unique (user_id, video_key, clip_id);
  end if;
end $$;
create index if not exists sends_user_gym on public.sends(user_id, gym_id);
alter table public.sends enable row level security;
drop policy if exists "sends own" on public.sends;
create policy "sends own" on public.sends
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.sends alter column label drop not null;
alter table public.sends drop constraint if exists sends_basis_check;
alter table public.sends add constraint sends_basis_check check (basis in ('location', 'visit', 'manual'));
alter table public.sends add column if not exists detect_version text;
alter table public.sends add column if not exists app_version text;

create table if not exists public.video_summaries (
  user_id uuid not null references auth.users(id) on delete cascade,
  video_key text not null,
  at timestamptz not null,
  duration numeric not null,
  attempts int not null,
  candidates int not null,
  climb_seconds numeric not null,
  handheld boolean not null,
  gym_id text,
  basis text check (basis in ('location', 'visit', 'manual')),
  detect_ms int,
  detect_version text,
  app_version text,
  platform text,
  created_at timestamptz not null default now(),
  primary key (user_id, video_key)
);
alter table public.video_summaries drop constraint if exists video_summaries_basis_check;
alter table public.video_summaries add constraint video_summaries_basis_check check (basis in ('location', 'visit', 'manual'));
alter table public.video_summaries enable row level security;
drop policy if exists "video_summaries own" on public.video_summaries;
create policy "video_summaries own" on public.video_summaries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 띠 입력·투표 자격: 그 암장에 도감 등록했거나 영상 위치로 확정된 완등 기록이 있는 사용자
create or replace function public.checked_in(gym text)
returns boolean language sql stable security definer set search_path = public as $$
  select not coalesce((auth.jwt()->>'is_anonymous')::boolean, false)
     and (exists (select 1 from public.visits where user_id = auth.uid() and gym_id = gym)
      or exists (select 1 from public.sends where user_id = auth.uid() and gym_id = gym and basis = 'location'));
$$;

alter table public.gym_tapes enable row level security;
alter table public.tape_votes enable row level security;
alter table public.tape_reports enable row level security;

drop policy if exists "gym_tapes read" on public.gym_tapes;
create policy "gym_tapes read" on public.gym_tapes for select using (true);
drop policy if exists "gym_tapes insert checked-in" on public.gym_tapes;
create policy "gym_tapes insert checked-in" on public.gym_tapes
  for insert with check (auth.uid() = updated_by and source = 'user' and public.checked_in(gym_id));
drop policy if exists "gym_tapes update own" on public.gym_tapes;
create policy "gym_tapes update own" on public.gym_tapes
  for update using (auth.uid() = updated_by and source = 'user') with check (auth.uid() = updated_by and source = 'user');

drop policy if exists "tape_votes read" on public.tape_votes;
create policy "tape_votes read" on public.tape_votes for select using (true);
drop policy if exists "tape_votes own checked-in" on public.tape_votes;
create policy "tape_votes own checked-in" on public.tape_votes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id and public.checked_in(gym_id));

drop policy if exists "tape_reports insert own" on public.tape_reports;
create policy "tape_reports insert own" on public.tape_reports for insert with check (auth.uid() = user_id and not coalesce((auth.jwt()->>'is_anonymous')::boolean, false));
drop policy if exists "tape_reports read own" on public.tape_reports;
create policy "tape_reports read own" on public.tape_reports for select using (auth.uid() = user_id);

-- 암장 제보: 없는 암장·폐업·이전·정보 오류. gyms.json 갱신은 사람이 보고 함
create table if not exists public.gym_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gym_id text,
  kind text not null check (kind in ('missing', 'closed', 'moved', 'wrong')),
  name text,
  note text,
  created_at timestamptz not null default now()
);
alter table public.gym_reports enable row level security;
drop policy if exists "gym_reports insert own" on public.gym_reports;
create policy "gym_reports insert own" on public.gym_reports for insert with check (auth.uid() = user_id and not coalesce((auth.jwt()->>'is_anonymous')::boolean, false));
drop policy if exists "gym_reports read own" on public.gym_reports;
create policy "gym_reports read own" on public.gym_reports for select using (auth.uid() = user_id);

-- 익명 계정 기록을 이미 있는 계정으로 옮기기: 익명일 때 토큰을 만들고, 로그인 뒤 그 토큰으로 호출
create table if not exists public.anon_merge (
  token uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.anon_merge enable row level security;
drop policy if exists "anon_merge own" on public.anon_merge;
create policy "anon_merge own" on public.anon_merge
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.merge_anonymous(t uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  anon uuid;
  moved int := 0;
  n int;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then return 0; end if;
  select user_id into anon from public.anon_merge where token = t and created_at > now() - interval '1 hour';
  if anon is null or anon = auth.uid() then return 0; end if;
  if not exists (select 1 from auth.users where id = anon and is_anonymous) then return 0; end if;
  delete from public.sends s where s.user_id = anon
    and exists (select 1 from public.sends r where r.user_id = auth.uid() and r.video_key = s.video_key and r.clip_id = s.clip_id);
  update public.sends set user_id = auth.uid() where user_id = anon;
  get diagnostics n = row_count; moved := moved + n;
  delete from public.video_summaries v where v.user_id = anon
    and exists (select 1 from public.video_summaries r where r.user_id = auth.uid() and r.video_key = v.video_key);
  update public.video_summaries set user_id = auth.uid() where user_id = anon;
  get diagnostics n = row_count; moved := moved + n;
  delete from public.anon_merge where user_id = anon;
  delete from auth.users where id = anon and is_anonymous;
  return moved;
end $$;
revoke all on function public.merge_anonymous(uuid) from public, anon;
grant execute on function public.merge_anonymous(uuid) to authenticated;

-- 익명 계정은 자기 등반 기록·영상 요약만 쓰고, 남에게 보이거나 도감에 들어가는 쓰기는 정식 계정만 (Supabase 권장: restrictive 정책)
do $$
declare
  t text;
  c text;
begin
  foreach t in array array['gym_tapes', 'tape_votes', 'tape_reports', 'visits', 'gym_photos'] loop
    foreach c in array array['insert', 'update', 'delete'] loop
      execute format('drop policy if exists %I on public.%I', 'permanent only ' || c, t);
      if c = 'insert' then
        execute format('create policy %I on public.%I as restrictive for insert to authenticated with check ((select (auth.jwt()->>''is_anonymous'')::boolean) is not true)', 'permanent only ' || c, t);
      else
        execute format('create policy %I on public.%I as restrictive for %s to authenticated using ((select (auth.jwt()->>''is_anonymous'')::boolean) is not true)', 'permanent only ' || c, t, c);
      end if;
    end loop;
  end loop;
end $$;
drop policy if exists "gym-photos permanent only" on storage.objects;
create policy "gym-photos permanent only" on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'gym-photos' or (select (auth.jwt()->>'is_anonymous')::boolean) is not true);
