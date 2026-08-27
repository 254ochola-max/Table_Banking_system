-- THE DEBORAH'S — Supabase database setup
-- Paste this entire file into Supabase Dashboard -> SQL Editor and click RUN.
-- The application uses these exact table names.

create extension if not exists pgcrypto;

-- ---------- Profiles / authentication ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'user' check (role in ('admin','user')),
  status text not null default 'Active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_role text;
  mem_id text;
begin
  -- The first registered account becomes the bootstrap administrator.
  -- All later accounts are regular users.
  if not exists (select 1 from public.profiles) then
    assigned_role := 'admin';
  else
    assigned_role := 'user';
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email,''), '@', 1)),
    assigned_role
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name;

  mem_id := 'mem-' || replace(new.id::text, '-', '');

  if assigned_role = 'admin' then
    insert into public.members (id, full_name, phone, email, user_email, id_number, status, role, date_joined, auth_user_id)
    values (
      mem_id,
      coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email,''), '@', 1)),
      coalesce(new.raw_user_meta_data->>'phone', 'N/A'),
      new.email,
      new.email,
      coalesce(new.raw_user_meta_data->>'id_number', 'ADMIN'),
      'Active',
      'Chairperson',
      current_date,
      new.id::text
    )
    on conflict (id) do update set user_email = excluded.user_email, email = excluded.email, auth_user_id = excluded.auth_user_id;
  else
    insert into public.members (id, full_name, phone, email, user_email, id_number, status, role, date_joined, auth_user_id)
    values (
      mem_id,
      coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email,''), '@', 1)),
      coalesce(new.raw_user_meta_data->>'phone', 'N/A'),
      new.email,
      new.email,
      coalesce(new.raw_user_meta_data->>'id_number', 'PENDING'),
      'Pending',
      'Member',
      current_date,
      new.id::text
    )
    on conflict (id) do update set user_email = excluded.user_email, email = excluded.email, auth_user_id = excluded.auth_user_id;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- ---------- Application tables ----------
create table if not exists public.members (
  id text primary key,
  auth_user_id text,
  full_name text not null,
  phone text not null,
  email text,
  user_email text,
  id_number text not null,
  gender text,
  address text,
  photo_url text,
  status text default 'Active',
  date_joined date,
  total_savings numeric(14,2) default 0,
  total_shares numeric(14,2) default 0,
  role text default 'Member',
  description text,
  created_at timestamptz default now()
);

-- Ensure columns exist if table was created previously
alter table public.members add column if not exists auth_user_id text;
alter table public.members add column if not exists photo_url text;

create table if not exists public.contributions (
  id text primary key,
  member_id text not null,
  member_name text not null,
  amount numeric(14,2) not null,
  payment_method text default 'Cash',
  month text not null,
  year integer not null,
  date_paid date not null,
  transaction_ref text,
  bank_name text,
  bank_account text,
  bank_branch text,
  evidence_notes text,
  status text default 'Pending Verification',
  notes text,
  created_at timestamptz default now()
);

create table if not exists public.loans (
  id text primary key,
  member_id text not null,
  member_name text not null,
  amount numeric(14,2) not null,
  principal_amount numeric(14,2),
  interest_rate numeric(8,2) default 10,
  interest_amount numeric(14,2),
  total_amount numeric(14,2),
  total_payable numeric(14,2),
  duration_months integer,
  monthly_repayment numeric(14,2),
  amount_repaid numeric(14,2) default 0,
  balance numeric(14,2),
  status text default 'Pending',
  application_date date not null,
  approval_date date,
  issue_date date,
  due_date date,
  next_payment_date date,
  purpose text,
  guarantor text,
  reminder_sent boolean default false,
  description text,
  approvals jsonb default '[]'::jsonb,
  rejection_reason text,
  rejected_by text,
  rejection_date date,
  created_at timestamptz default now()
);

create table if not exists public.repayments (
  id text primary key,
  loan_id text not null,
  member_id text not null,
  member_name text not null,
  amount numeric(14,2) not null,
  payment_date date not null,
  payment_method text default 'Cash',
  balance_after numeric(14,2),
  notes text,
  transaction_ref text,
  bank_name text,
  bank_account text,
  status text default 'Pending Verification',
  created_at timestamptz default now()
);

create table if not exists public.fines (
  id text primary key,
  member_id text not null,
  member_name text not null,
  reason text not null,
  amount numeric(14,2) not null,
  status text default 'Unpaid',
  date_issued date not null,
  date_paid date,
  description text,
  created_at timestamptz default now()
);

create table if not exists public.transactions (
  id text primary key,
  member_id text,
  member_name text,
  type text not null,
  amount numeric(14,2) not null,
  description text,
  date date not null,
  reference text,
  created_at timestamptz default now()
);

create table if not exists public.groupsettings (
  id text primary key,
  group_name text not null default 'Table Banking Group',
  monthly_contribution numeric(14,2) default 1000,
  monthly_savings_target numeric(14,2) default 50000,
  interest_rate numeric(8,2) default 10,
  loan_interest_rate numeric(8,2) default 10,
  max_loan_multiplier numeric(8,2) default 3,
  late_payment_fine numeric(14,2) default 200,
  fine_late_payment numeric(14,2),
  currency text default 'KES',
  reminder_days_before integer default 3,
  description text,
  created_at timestamptz default now()
);

create table if not exists public.groupsummarytables (
  id text primary key,
  row_label text not null,
  row_order integer not null,
  values jsonb default '{}'::jsonb,
  highlight boolean default false,
  description text,
  created_at timestamptz default now()
);

create table if not exists public.profilechangerequests (
  id text primary key,
  member_id text not null,
  member_name text not null,
  field_key text not null,
  field_label text,
  old_value text,
  new_value text,
  request_date timestamptz default now(),
  status text default 'Pending',
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz default now()
);

-- ---------- Contact Messages (public inbox for the leaders/admin panel) ----------
create table if not exists public.contact_messages (
  id text primary key,
  sender_name text not null,
  sender_email text,
  subject text,
  message text not null,
  status text default 'Unread',   -- 'Unread' | 'Read'
  replied_by text,
  created_at timestamptz default now()
);

-- ---------- Helpful indexes ----------
create index if not exists idx_members_user_email on public.members(lower(user_email));
create index if not exists idx_members_email on public.members(lower(email));
create index if not exists idx_contributions_member on public.contributions(member_id);
create index if not exists idx_loans_member on public.loans(member_id);
create index if not exists idx_repayments_member on public.repayments(member_id);
create index if not exists idx_fines_member on public.fines(member_id);
create index if not exists idx_transactions_member on public.transactions(member_id);
create index if not exists idx_profilechangerequests_member on public.profilechangerequests(member_id);
create index if not exists idx_contact_messages_created on public.contact_messages(created_at desc);

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.members enable row level security;
alter table public.contributions enable row level security;
alter table public.loans enable row level security;
alter table public.repayments enable row level security;
alter table public.fines enable row level security;
alter table public.transactions enable row level security;
alter table public.groupsettings enable row level security;
alter table public.groupsummarytables enable row level security;
alter table public.profilechangerequests enable row level security;
alter table public.contact_messages enable row level security;

-- ---------- Helper Security Functions (SECURITY DEFINER) ----------
-- Using security definer bypasses RLS inside helper queries to prevent infinite recursion
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'Active'
  );
$$;

create or replace function public.is_leader()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.members m
    join public.profiles p on lower(coalesce(m.user_email, m.email, '')) = lower(p.email)
    where p.id = auth.uid()
      and m.role in ('Chairperson', 'Assistant Chairperson', 'Secretary', 'Assistant Secretary', 'Organizing Secretary', 'Treasurer')
  );
$$;

create or replace function public.is_group_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or public.is_leader();
$$;

create or replace function public.is_member_owner(p_member_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.members m
    where m.id = p_member_id
      and lower(coalesce(m.user_email, m.email, '')) =
          lower(coalesce((select email from public.profiles where id = auth.uid()), ''))
  );
$$;

create or replace function public.current_profile_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select email from public.profiles where id = auth.uid();
$$;

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- Profiles RLS ----------
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
for select to authenticated
using (id = auth.uid() or public.is_admin());

-- ---------- Members RLS ----------
drop policy if exists members_select_authenticated on public.members;
create policy members_select_authenticated on public.members
for select to authenticated
using (true);

drop policy if exists members_admin_insert on public.members;
drop policy if exists members_insert_authenticated on public.members;
create policy members_insert_authenticated on public.members
for insert to authenticated
with check (
  public.is_group_admin() or
  lower(coalesce(user_email, email, '')) = lower(coalesce(auth.jwt()->>'email', (select email from public.profiles where id = auth.uid()), '')) or
  status = 'Pending'
);

drop policy if exists members_admin_update on public.members;
drop policy if exists members_update_authenticated on public.members;
create policy members_update_authenticated on public.members
for update to authenticated
using (
  public.is_group_admin() or
  lower(coalesce(user_email, email, '')) = lower(coalesce(auth.jwt()->>'email', (select email from public.profiles where id = auth.uid()), ''))
)
with check (
  public.is_group_admin() or
  lower(coalesce(user_email, email, '')) = lower(coalesce(auth.jwt()->>'email', (select email from public.profiles where id = auth.uid()), ''))
);

drop policy if exists members_admin_delete on public.members;
create policy members_admin_delete on public.members
for delete to authenticated
using (public.is_group_admin());

-- ---------- Contributions RLS ----------
drop policy if exists contributions_select_authenticated on public.contributions;
create policy contributions_select_authenticated on public.contributions
for select to authenticated
using (public.is_group_admin() or public.is_member_owner(member_id));

drop policy if exists contributions_admin_insert on public.contributions;
create policy contributions_admin_insert on public.contributions
for insert to authenticated
with check (public.is_group_admin() or public.is_member_owner(member_id));

drop policy if exists contributions_admin_update on public.contributions;
create policy contributions_admin_update on public.contributions
for update to authenticated
using (public.is_group_admin())
with check (public.is_group_admin());

drop policy if exists contributions_admin_delete on public.contributions;
create policy contributions_admin_delete on public.contributions
for delete to authenticated
using (public.is_group_admin());

-- ---------- Loans RLS ----------
drop policy if exists loans_select_authenticated on public.loans;
create policy loans_select_authenticated on public.loans
for select to authenticated
using (public.is_group_admin() or public.is_member_owner(member_id));

drop policy if exists loans_insert_authenticated on public.loans;
create policy loans_insert_authenticated on public.loans
for insert to authenticated
with check (public.is_group_admin() or public.is_member_owner(member_id));

drop policy if exists loans_update_authenticated on public.loans;
create policy loans_update_authenticated on public.loans
for update to authenticated
using (public.is_group_admin() or public.is_member_owner(member_id))
with check (public.is_group_admin() or public.is_member_owner(member_id));

drop policy if exists loans_admin_delete on public.loans;
create policy loans_admin_delete on public.loans
for delete to authenticated
using (public.is_group_admin());

-- ---------- Repayments RLS ----------
drop policy if exists repayments_select_authenticated on public.repayments;
create policy repayments_select_authenticated on public.repayments
for select to authenticated
using (public.is_group_admin() or public.is_member_owner(member_id));

drop policy if exists repayments_insert_authenticated on public.repayments;
create policy repayments_insert_authenticated on public.repayments
for insert to authenticated
with check (public.is_group_admin() or public.is_member_owner(member_id));

drop policy if exists repayments_update_authenticated on public.repayments;
create policy repayments_update_authenticated on public.repayments
for update to authenticated
using (public.is_group_admin())
with check (public.is_group_admin());

drop policy if exists repayments_admin_delete on public.repayments;
create policy repayments_admin_delete on public.repayments
for delete to authenticated
using (public.is_group_admin());

-- ---------- Fines RLS ----------
drop policy if exists fines_select_authenticated on public.fines;
create policy fines_select_authenticated on public.fines
for select to authenticated
using (public.is_group_admin() or public.is_member_owner(member_id));

drop policy if exists fines_admin_insert on public.fines;
create policy fines_admin_insert on public.fines
for insert to authenticated
with check (public.is_group_admin());

drop policy if exists fines_admin_update on public.fines;
create policy fines_admin_update on public.fines
for update to authenticated
using (public.is_group_admin())
with check (public.is_group_admin());

drop policy if exists fines_admin_delete on public.fines;
create policy fines_admin_delete on public.fines
for delete to authenticated
using (public.is_group_admin());

-- ---------- Transactions RLS ----------
drop policy if exists transactions_select_authenticated on public.transactions;
create policy transactions_select_authenticated on public.transactions
for select to authenticated
using (public.is_group_admin() or public.is_member_owner(member_id));

drop policy if exists transactions_admin_insert on public.transactions;
create policy transactions_admin_insert on public.transactions
for insert to authenticated
with check (public.is_group_admin());

drop policy if exists transactions_admin_update on public.transactions;
create policy transactions_admin_update on public.transactions
for update to authenticated
using (public.is_group_admin())
with check (public.is_group_admin());

drop policy if exists transactions_admin_delete on public.transactions;
create policy transactions_admin_delete on public.transactions
for delete to authenticated
using (public.is_group_admin());

-- ---------- Group Settings RLS ----------
drop policy if exists groupsettings_select_authenticated on public.groupsettings;
create policy groupsettings_select_authenticated on public.groupsettings
for select to authenticated
using (true);

drop policy if exists groupsettings_admin_insert on public.groupsettings;
create policy groupsettings_admin_insert on public.groupsettings
for insert to authenticated
with check (public.is_group_admin());

drop policy if exists groupsettings_admin_update on public.groupsettings;
create policy groupsettings_admin_update on public.groupsettings
for update to authenticated
using (public.is_group_admin())
with check (public.is_group_admin());

drop policy if exists groupsettings_admin_delete on public.groupsettings;
create policy groupsettings_admin_delete on public.groupsettings
for delete to authenticated
using (public.is_group_admin());

-- ---------- Group Summary Tables RLS ----------
drop policy if exists groupsummary_select_authenticated on public.groupsummarytables;
create policy groupsummary_select_authenticated on public.groupsummarytables
for select to authenticated
using (true);

drop policy if exists groupsummary_admin_insert on public.groupsummarytables;
create policy groupsummary_admin_insert on public.groupsummarytables
for insert to authenticated
with check (public.is_group_admin());

drop policy if exists groupsummary_admin_update on public.groupsummarytables;
create policy groupsummary_admin_update on public.groupsummarytables
for update to authenticated
using (public.is_group_admin())
with check (public.is_group_admin());

drop policy if exists groupsummary_admin_delete on public.groupsummarytables;
create policy groupsummary_admin_delete on public.groupsummarytables
for delete to authenticated
using (public.is_group_admin());

-- ---------- Profile Change Requests RLS ----------
drop policy if exists profilechangerequests_select_authenticated on public.profilechangerequests;
create policy profilechangerequests_select_authenticated on public.profilechangerequests
for select to authenticated
using (public.is_group_admin() or public.is_member_owner(member_id));

drop policy if exists profilechangerequests_insert_authenticated on public.profilechangerequests;
create policy profilechangerequests_insert_authenticated on public.profilechangerequests
for insert to authenticated
with check (public.is_group_admin() or public.is_member_owner(member_id));

drop policy if exists profilechangerequests_update_authenticated on public.profilechangerequests;
create policy profilechangerequests_update_authenticated on public.profilechangerequests
for update to authenticated
using (public.is_group_admin())
with check (public.is_group_admin());

drop policy if exists profilechangerequests_delete_authenticated on public.profilechangerequests;
create policy profilechangerequests_delete_authenticated on public.profilechangerequests
for delete to authenticated
using (public.is_group_admin());

-- ---------- Contact Messages RLS ----------
-- Anyone (even unauthenticated visitors) can send a contact message.
drop policy if exists contact_messages_insert_anon on public.contact_messages;
create policy contact_messages_insert_anon on public.contact_messages
for insert to anon, authenticated
with check (true);

-- Only admins and leaders can read messages.
drop policy if exists contact_messages_select_admin on public.contact_messages;
create policy contact_messages_select_admin on public.contact_messages
for select to authenticated
using (public.is_group_admin());

-- Only admins and leaders can update (e.g. mark as Read).
drop policy if exists contact_messages_update_admin on public.contact_messages;
create policy contact_messages_update_admin on public.contact_messages
for update to authenticated
using (public.is_group_admin())
with check (public.is_group_admin());

-- Only admins and leaders can delete messages.
drop policy if exists contact_messages_delete_admin on public.contact_messages;
create policy contact_messages_delete_admin on public.contact_messages
for delete to authenticated
using (public.is_group_admin());

-- ---------- Repayment to Group Summary Table Sync Trigger ----------
create or replace function public.sync_repayment_to_group_summary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row_id text;
  v_values jsonb;
  v_member_id text;
  v_amount numeric;
  v_old_amount numeric := 0;
  v_new_amount numeric := 0;
  v_current_member_total numeric := 0;
begin
  -- Locate or create the 'Repayment' row in public.groupsummarytables
  select id, coalesce(values, '{}'::jsonb) into v_row_id, v_values
  from public.groupsummarytables
  where row_label = 'Repayment';

  if v_row_id is null then
    v_row_id := 'summary-row-repayment';
    v_values := '{}'::jsonb;
    insert into public.groupsummarytables (id, row_label, row_order, values, highlight)
    values (v_row_id, 'Repayment', 8, v_values, true)
    on conflict (id) do nothing;
  end if;

  -- Case 1: INSERT
  if (TG_OP = 'INSERT') then
    if (new.status = 'Verified') then
      v_member_id := new.member_id;
      v_amount := coalesce(new.amount, 0);
      v_current_member_total := coalesce((v_values->>v_member_id)::numeric, 0);
      v_values := jsonb_set(v_values, array[v_member_id], to_jsonb(v_current_member_total + v_amount));
      update public.groupsummarytables set values = v_values where id = v_row_id;
    end if;

  -- Case 2: UPDATE
  elsif (TG_OP = 'UPDATE') then
    v_member_id := new.member_id;
    
    -- Was verified, now rejected/pending -> subtract old amount
    if (old.status = 'Verified' and new.status <> 'Verified') then
      v_old_amount := coalesce(old.amount, 0);
      v_current_member_total := coalesce((v_values->>v_member_id)::numeric, 0);
      v_values := jsonb_set(v_values, array[v_member_id], to_jsonb(greatest(0, v_current_member_total - v_old_amount)));
      update public.groupsummarytables set values = v_values where id = v_row_id;
      
    -- Was not verified, now verified -> add new amount
    elsif (old.status <> 'Verified' and new.status = 'Verified') then
      v_new_amount := coalesce(new.amount, 0);
      v_current_member_total := coalesce((v_values->>v_member_id)::numeric, 0);
      v_values := jsonb_set(v_values, array[v_member_id], to_jsonb(v_current_member_total + v_new_amount));
      update public.groupsummarytables set values = v_values where id = v_row_id;
      
    -- Was verified, amount changed -> update difference
    elsif (old.status = 'Verified' and new.status = 'Verified' and old.amount <> new.amount) then
      v_old_amount := coalesce(old.amount, 0);
      v_new_amount := coalesce(new.amount, 0);
      v_current_member_total := coalesce((v_values->>v_member_id)::numeric, 0);
      v_values := jsonb_set(v_values, array[v_member_id], to_jsonb(greatest(0, v_current_member_total - v_old_amount + v_new_amount)));
      update public.groupsummarytables set values = v_values where id = v_row_id;
    end if;

  -- Case 3: DELETE
  elsif (TG_OP = 'DELETE') then
    if (old.status = 'Verified') then
      v_member_id := old.member_id;
      v_old_amount := coalesce(old.amount, 0);
      v_current_member_total := coalesce((v_values->>v_member_id)::numeric, 0);
      v_values := jsonb_set(v_values, array[v_member_id], to_jsonb(greatest(0, v_current_member_total - v_old_amount)));
      update public.groupsummarytables set values = v_values where id = v_row_id;
    end if;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_sync_repayment_group_summary on public.repayments;
create trigger trg_sync_repayment_group_summary
after insert or update or delete on public.repayments
for each row execute procedure public.sync_repayment_to_group_summary();

-- ---------- Function Execution Security Hardening (Linter Fixes) ----------
-- 1. Drop or revoke legacy / internal trigger functions from public execution over REST API
drop function if exists public.handle_new_user_profile() cascade;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.sync_repayment_to_group_summary() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- 2. Restrict RPC helper functions execution from anon role
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

revoke execute on function public.is_member_owner(text) from public, anon;
grant execute on function public.is_member_owner(text) to authenticated;

revoke execute on function public.is_leader() from public, anon;
grant execute on function public.is_leader() to authenticated;

revoke execute on function public.is_group_admin() from public, anon;
grant execute on function public.is_group_admin() to authenticated;

revoke execute on function public.current_profile_email() from public, anon;
grant execute on function public.current_profile_email() to authenticated;

revoke execute on function public.current_profile_role() from public, anon;
grant execute on function public.current_profile_role() to authenticated;