-- 農の里（仮称）Phase 2 初期スキーマ（ドラフト v0.1）
-- Supabase の SQL Editor でそのまま実行できる形を目指す。
-- 方針: 公開範囲はすべて RLS で強制する。詳細住所・本名・連絡先のカラムは作らない。

-- =========================================================
-- プロフィール（個人）
-- =========================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 30),
  area text not null default '' , -- 市町村程度のみ（自由入力・詳細住所は入れない運用）
  stage text not null default 'はじめたばかり',
  interests text[] not null default '{}',
  one_liner text not null default '',
  looking_for text not null default '',
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 運営判定（RLS から使う）
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- 仲間探しに出すため全員が読める（出すカラム自体を絞ってある）
create policy "profiles_select_all" on public.profiles
  for select using (true);
create policy "profiles_insert_own" on public.profiles
  for insert with check (id = auth.uid());
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid());

-- =========================================================
-- 団体（承認制）
-- =========================================================
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  -- デモ団体は所有者なしで投入する（実団体は申請時に必ず owner_id が付く）
  owner_id uuid references auth.users (id) on delete cascade,
  display_name text not null,
  area text not null default '',
  stage text not null default '',
  methods text[] not null default '{}',
  note text not null default '',
  activity text not null default '',
  rhythm text not null default '',
  welcome text not null default '',
  links jsonb not null default '{}', -- {website, instagram, sns} 団体自身のみ登録
  photo text not null default 'photo-community',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.groups enable row level security;

create policy "groups_select_public" on public.groups
  for select using (status = 'approved' or owner_id = auth.uid() or public.is_admin());
create policy "groups_insert_own" on public.groups
  for insert with check (owner_id = auth.uid());
-- 所有者は内容を編集できるが status は運営のみ（update は列単位で守れないため、
-- status 変更は運営専用 RPC で行い、この update ポリシーではトリガで status 変更を拒否する）
create policy "groups_update_own" on public.groups
  for update using (owner_id = auth.uid() or public.is_admin());

create or replace function public.reject_status_change()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status and not public.is_admin() then
    raise exception 'status is managed by admin';
  end if;
  return new;
end;
$$;

create trigger groups_guard_status
  before update on public.groups
  for each row execute function public.reject_status_change();

-- =========================================================
-- 季節の便り（一方向・返信なし）
-- =========================================================
create table public.group_updates (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  published_on date not null default current_date,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.group_updates enable row level security;

create policy "group_updates_select_public" on public.group_updates
  for select using (
    exists (select 1 from groups g where g.id = group_id and (g.status = 'approved' or g.owner_id = auth.uid() or public.is_admin()))
  );
create policy "group_updates_write_owner" on public.group_updates
  for all using (
    exists (select 1 from groups g where g.id = group_id and (g.owner_id = auth.uid() or public.is_admin()))
  );

-- =========================================================
-- イベント（承認済み団体が作成、運営確認で公開）
-- =========================================================
create table public.events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  title text not null,
  event_type text not null default '観察会', -- 観察会/勉強会/見学会/交流会/ワークショップ/種の交換会
  event_date date not null,
  time_label text not null default '', -- 例 "9:30 - 11:30"
  place text not null default '',      -- 市町村程度
  area_note text not null default '詳細な場所は参加確定後にご案内',
  description text not null default '',
  capacity int,
  fee text not null default '無料',
  deadline date,
  belongings text not null default '',
  note text not null default '',
  welcome text not null default '',
  rain_policy text not null default '',
  schedule jsonb not null default '[]', -- [{time,label}]
  seed_exchange boolean not null default false,
  photo text not null default 'photo-field',
  -- デモ用の初期表示値。実ユーザーの操作数は user_event_actions / event_counts で数える。
  -- Phase 2 が軌道に乗ったら 0 に戻すか列ごと削除する。
  interested_base int not null default 0,
  attending_base int not null default 0,
  status text not null default 'pending' check (status in ('pending', 'published', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.events enable row level security;

create policy "events_select_public" on public.events
  for select using (
    status = 'published'
    or exists (select 1 from groups g where g.id = group_id and g.owner_id = auth.uid())
    or public.is_admin()
  );
create policy "events_insert_approved_group" on public.events
  for insert with check (
    exists (select 1 from groups g where g.id = group_id and g.owner_id = auth.uid() and g.status = 'approved')
  );
create policy "events_update_owner" on public.events
  for update using (
    exists (select 1 from groups g where g.id = group_id and g.owner_id = auth.uid())
    or public.is_admin()
  );

create trigger events_guard_status
  before update on public.events
  for each row execute function public.reject_status_change();

-- 参加した人の声
create table public.event_voices (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  who text not null default '', -- 例 "40代・家庭菜園1年目"（個人特定情報は入れない）
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.event_voices enable row level security;

create policy "event_voices_select_all" on public.event_voices
  for select using (true);
create policy "event_voices_write_owner" on public.event_voices
  for all using (
    exists (
      select 1 from events e join groups g on g.id = e.group_id
      where e.id = event_id and (g.owner_id = auth.uid() or public.is_admin())
    )
  );

-- =========================================================
-- 個人の軽い操作（気になる / 参加予定 / 受け取る / 誘った）
-- =========================================================
create table public.user_event_actions (
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  kind text not null check (kind in ('interested', 'joined')),
  created_at timestamptz not null default now(),
  primary key (user_id, event_id, kind)
);

alter table public.user_event_actions enable row level security;

create policy "actions_own" on public.user_event_actions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 件数だけは全員に公開（個人の行は見せない）
create or replace view public.event_counts
with (security_invoker = off) as
  select event_id,
         count(*) filter (where kind = 'interested') as interested_count,
         count(*) filter (where kind = 'joined') as joined_count
  from public.user_event_actions
  group by event_id;

grant select on public.event_counts to anon, authenticated;

create table public.follows (
  user_id uuid not null references auth.users (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, group_id)
);

alter table public.follows enable row level security;
create policy "follows_own" on public.follows
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.invites (
  user_id uuid not null references auth.users (id) on delete cascade,
  peer_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, peer_id)
);

alter table public.invites enable row level security;
create policy "invites_own" on public.invites
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =========================================================
-- 栽培記録（本人のみ。公開する手段を作らない）
-- =========================================================
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  noted_on date not null default current_date,
  crop text not null,
  method text not null default '',
  memo text not null default '',
  learning text not null default '',
  photo text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notes enable row level security;
create policy "notes_owner_only" on public.notes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =========================================================
-- 在来種（公開データ・運営管理）と情報提供キュー
-- =========================================================
create table public.seeds (
  id text primary key, -- 例 'yasato-zairai-daizu'
  name text not null,
  aliases text[] not null default '{}',
  crop_type text not null default '',
  area text not null default '', -- 市町村程度
  lat double precision,
  lng double precision,
  source_type text not null default 'research_needed' check (source_type in ('local_material', 'research_needed')),
  source_label text not null default '',
  source_name text not null default '',
  source_url text not null default '',
  description_short text not null default '',
  data_confidence text not null default '',
  location_note text not null default '',
  photo text not null default 'photo-seed',
  related_group_id uuid references public.groups (id),
  published boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.seeds enable row level security;
create policy "seeds_select_published" on public.seeds
  for select using (published or public.is_admin());
create policy "seeds_admin_write" on public.seeds
  for all using (public.is_admin());

-- イベント⇔在来種の相互リンク
create table public.event_seeds (
  event_id uuid not null references public.events (id) on delete cascade,
  seed_id text not null references public.seeds (id) on delete cascade,
  primary key (event_id, seed_id)
);

alter table public.event_seeds enable row level security;
create policy "event_seeds_select_all" on public.event_seeds
  for select using (true);
create policy "event_seeds_write_owner" on public.event_seeds
  for all using (
    exists (
      select 1 from events e join groups g on g.id = e.group_id
      where e.id = event_id and (g.owner_id = auth.uid() or public.is_admin())
    )
  );

create table public.seed_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  seed_name text not null,
  crop_type text not null default '',
  area text not null default '', -- 市町村程度
  story text not null default '',
  source_hint text not null default '', -- 出典・入手経緯のヒント
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note text not null default '',
  created_at timestamptz not null default now()
);

alter table public.seed_contributions enable row level security;
create policy "seed_contrib_select_own_or_admin" on public.seed_contributions
  for select using (user_id = auth.uid() or public.is_admin());
create policy "seed_contrib_insert_auth" on public.seed_contributions
  for insert with check (auth.uid() is not null and user_id = auth.uid());
create policy "seed_contrib_admin_update" on public.seed_contributions
  for update using (public.is_admin());

-- =========================================================
-- updated_at 自動更新
-- =========================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger touch_profiles before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger touch_groups before update on public.groups
  for each row execute function public.touch_updated_at();
create trigger touch_events before update on public.events
  for each row execute function public.touch_updated_at();
create trigger touch_notes before update on public.notes
  for each row execute function public.touch_updated_at();
