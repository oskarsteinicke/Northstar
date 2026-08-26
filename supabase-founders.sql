-- Free access for every account that exists right now. Run this once in the
-- Supabase SQL editor.
--
-- This table is a fixed allowlist, not a running count. It is written here and
-- nowhere else: the Worker only ever reads it. So there is no counter to drift,
-- no race to lose, and no way for a client to add itself.
--
-- The cutoff is the moment you run this. Accounts created afterwards are not in
-- the table and do not get free access. Re-running re-declares the cutoff as
-- that new moment, which will sweep in anyone who signed up in between.

-- Safe to drop: every row is rebuilt from auth.users by the insert below, so
-- there is nothing in here that is not immediately regenerated.
drop table if exists public.founders;

create table public.founders (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now()
);

insert into public.founders (user_id)
select id from auth.users;

-- Nothing reads this table from the browser. The Worker uses the service role,
-- which bypasses RLS entirely, so enabling RLS with no policy is exactly right:
-- it denies every anon and authenticated client while leaving the Worker
-- working. Without this line the table would be readable by anyone holding the
-- public anon key.
alter table public.founders enable row level security;

-- What you should see: one row per account that exists today.
select count(*) as accounts_with_free_access from public.founders;
