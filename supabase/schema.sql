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
  label text not null,
  sent boolean not null,
  basis text not null check (basis in ('location', 'visit')),
  video_key text not null,
  clip_start numeric not null,
  clip_end numeric not null,
  created_at timestamptz not null default now(),
  unique (user_id, video_key, clip_start, clip_end)
);
create index if not exists sends_user_gym on public.sends(user_id, gym_id);
alter table public.sends enable row level security;
drop policy if exists "sends own" on public.sends;
create policy "sends own" on public.sends
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 띠 입력·투표 자격: 그 암장에 도감 등록했거나 영상 위치로 확정된 완등 기록이 있는 사용자
create or replace function public.checked_in(gym text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.visits where user_id = auth.uid() and gym_id = gym)
      or exists (select 1 from public.sends where user_id = auth.uid() and gym_id = gym);
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
create policy "tape_reports insert own" on public.tape_reports for insert with check (auth.uid() = user_id);
drop policy if exists "tape_reports read own" on public.tape_reports;
create policy "tape_reports read own" on public.tape_reports for select using (auth.uid() = user_id);
