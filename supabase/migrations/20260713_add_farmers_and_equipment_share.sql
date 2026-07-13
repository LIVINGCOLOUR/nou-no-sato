-- Existing Supabase migration: farmer profiles and equipment sharing.
alter table public.groups add column if not exists entity_type text not null default 'group';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'groups_entity_type_check') then
    alter table public.groups add constraint groups_entity_type_check check (entity_type in ('group', 'farmer'));
  end if;
end $$;

create table public.equipment_listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  group_id uuid references public.groups (id) on delete set null,
  title text not null check (char_length(title) between 1 and 80),
  category text not null check (category in ('hand_tool', 'small_powered', 'material')),
  area text not null default '', maker text not null default '', model text not null default '',
  years_used text not null default '', last_inspected_on date,
  condition_label text not null default '', known_issues text not null default '',
  manual_available boolean not null default false,
  fee_type text not null default 'free' check (fee_type in ('free', 'paid')),
  fee_amount integer not null default 0 check (fee_amount >= 0),
  fee_unit text not null default 'day' check (fee_unit in ('half_day', 'day', 'week')),
  fee_note text not null default '',
  consumables_policy text not null default 'owner' check (consumables_policy in ('included', 'actual_cost', 'owner')),
  experience_required boolean not null default false,
  transport_note text not null default '', description text not null default '', lender_terms text not null default '',
  risk_level text not null default 'low' check (risk_level in ('low', 'powered')),
  safety_confirmed boolean not null default false check (safety_confirmed),
  photo text not null default 'photo-tool-generic',
  availability_status text not null default 'available' check (availability_status in ('available', 'paused', 'loaned', 'archived')),
  moderation_status text not null default 'pending' check (moderation_status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((fee_type = 'free' and fee_amount = 0) or (fee_type = 'paid' and fee_amount > 0))
);
alter table public.equipment_listings enable row level security;
create policy "equipment_select_visible" on public.equipment_listings for select using (
  (moderation_status = 'approved' and availability_status <> 'archived') or owner_id = auth.uid() or public.is_admin()
);
create policy "equipment_insert_own" on public.equipment_listings for insert with check (
  owner_id = auth.uid() and (group_id is null or exists (
    select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid() and g.status = 'approved'
  ))
);
create policy "equipment_update_owner" on public.equipment_listings for update
  using (owner_id = auth.uid() or public.is_admin()) with check (owner_id = auth.uid() or public.is_admin());

create or replace function public.guard_equipment_listing() returns trigger language plpgsql as $$
begin
  if public.is_admin() then return new; end if;
  if new.owner_id is distinct from old.owner_id then raise exception 'owner_id cannot be changed'; end if;
  new.moderation_status := old.moderation_status;
  if (to_jsonb(new) - array['availability_status', 'moderation_status', 'updated_at']) is distinct from
     (to_jsonb(old) - array['availability_status', 'moderation_status', 'updated_at']) then
    new.moderation_status := 'pending';
  end if;
  return new;
end $$;
create trigger equipment_listing_guard before update on public.equipment_listings
  for each row execute function public.guard_equipment_listing();

create table public.equipment_requests (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.equipment_listings (id) on delete cascade,
  borrower_id uuid not null references public.profiles (id) on delete cascade,
  start_on date not null, end_on date not null,
  purpose text not null default '', experience text not null default '', transport_plan text not null default '',
  borrower_note text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'cancelled', 'handed_over', 'returned', 'incident')),
  lender_contact text not null default '', handover_condition text not null default '',
  return_condition text not null default '', incident_note text not null default '',
  terms_accepted boolean not null default false check (terms_accepted),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (end_on >= start_on)
);
alter table public.equipment_requests enable row level security;
create policy "equipment_requests_select_parties" on public.equipment_requests for select using (
  borrower_id = auth.uid() or exists (
    select 1 from public.equipment_listings l where l.id = listing_id and l.owner_id = auth.uid()
  ) or public.is_admin()
);
create policy "equipment_requests_insert_borrower" on public.equipment_requests for insert with check (
  borrower_id = auth.uid() and exists (
    select 1 from public.equipment_listings l where l.id = listing_id and l.owner_id <> auth.uid()
      and l.moderation_status = 'approved' and l.availability_status = 'available'
  )
);
create policy "equipment_requests_update_borrower" on public.equipment_requests for update
  using (borrower_id = auth.uid() and status = 'pending')
  with check (borrower_id = auth.uid() and status in ('pending', 'cancelled'));
create policy "equipment_requests_update_owner" on public.equipment_requests for update using (
  exists (select 1 from public.equipment_listings l where l.id = listing_id and l.owner_id = auth.uid()) or public.is_admin()
) with check (
  exists (select 1 from public.equipment_listings l where l.id = listing_id and l.owner_id = auth.uid()) or public.is_admin()
);

create or replace function public.guard_equipment_request_identity() returns trigger language plpgsql as $$
begin
  if new.listing_id is distinct from old.listing_id or new.borrower_id is distinct from old.borrower_id then
    raise exception 'request parties cannot be changed';
  end if;
  return new;
end $$;
create trigger equipment_request_identity_guard before update on public.equipment_requests
  for each row execute function public.guard_equipment_request_identity();

create or replace function public.report_equipment_incident(request_id uuid, note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.equipment_requests set status = 'incident', incident_note = left(coalesce(note, ''), 1000)
  where id = request_id and borrower_id = auth.uid() and status = 'handed_over';
  if not found then raise exception 'request cannot be reported'; end if;
end $$;
grant execute on function public.report_equipment_incident(uuid, text) to authenticated;

create index equipment_listings_public_idx on public.equipment_listings (moderation_status, availability_status, area);
create index equipment_requests_listing_idx on public.equipment_requests (listing_id);
create index equipment_requests_borrower_idx on public.equipment_requests (borrower_id);
create trigger touch_equipment_listings before update on public.equipment_listings
  for each row execute function public.touch_updated_at();
create trigger touch_equipment_requests before update on public.equipment_requests
  for each row execute function public.touch_updated_at();
