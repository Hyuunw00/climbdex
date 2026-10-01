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
