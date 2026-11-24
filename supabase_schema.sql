-- Supabase SQL Editorで実行してください。
-- 全テーブルでRLSを有効化し、利用者本人の行だけ読取・追加・変更・削除を許可します。

create table if not exists public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  eaten_at timestamptz not null default now(),
  meal_type text not null,
  description text,
  seasoning_note text,
  photo_path text,
  dish_name text,
  calories_kcal numeric not null default 0,
  carbs_g numeric not null default 0,
  protein_g numeric not null default 0,
  fat_g numeric not null default 0,
  fiber_g numeric not null default 0,
  estimate_notes text,
  is_ai_estimate boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.glucose_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measured_at timestamptz not null default now(),
  glucose_mg_dl numeric not null,
  timing text,
  related_meal text,
  note text,
  created_at timestamptz not null default now()
);
create table if not exists public.body_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measured_at timestamptz not null default now(),
  height_cm numeric,
  weight_kg numeric not null,
  body_fat_pct numeric,
  muscle_kg numeric,
  water_pct numeric,
  visceral_fat_level numeric,
  note text,
  created_at timestamptz not null default now()
);

alter table public.meals enable row level security;
alter table public.glucose_records enable row level security;
alter table public.body_records enable row level security;

drop policy if exists "Users manage own meals" on public.meals;
create policy "Users manage own meals" on public.meals for all to authenticated
using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage own glucose records" on public.glucose_records;
create policy "Users manage own glucose records" on public.glucose_records for all to authenticated
using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage own body records" on public.body_records;
create policy "Users manage own body records" on public.body_records for all to authenticated
using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 写真用Storage bucket。Privateに設定し、パスの先頭をユーザーIDにします。
insert into storage.buckets (id, name, public) values ('meal-photos', 'meal-photos', false)
on conflict (id) do nothing;
drop policy if exists "Users upload own meal photos" on storage.objects;
create policy "Users upload own meal photos" on storage.objects for insert to authenticated
with check (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users view own meal photos" on storage.objects;
create policy "Users view own meal photos" on storage.objects for select to authenticated
using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users delete own meal photos" on storage.objects;
create policy "Users delete own meal photos" on storage.objects for delete to authenticated
using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);
