-- FIX: leaderboard reads return 500 "infinite recursion detected in policy" (42P17)
-- The original SELECT policy on leaderboard_members queried leaderboard_members
-- inside its own policy check, which Postgres rejects as infinite recursion.
-- This broke: listing your groups, viewing a group's leaderboard, and stat updates.
--
-- Paste this whole file into Supabase SQL Editor and click Run:
-- https://supabase.com/dashboard → your project → SQL Editor

-- 1. Helper function. SECURITY DEFINER bypasses RLS inside the check,
--    which breaks the recursion.
CREATE OR REPLACE FUNCTION public.my_leaderboard_group_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT group_id FROM public.leaderboard_members WHERE user_id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.my_leaderboard_group_ids() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.my_leaderboard_group_ids() TO authenticated;

-- 2. Replace the broken policy
DROP POLICY IF EXISTS "Members can read group members" ON leaderboard_members;
CREATE POLICY "Members can read group members"
  ON leaderboard_members FOR SELECT
  TO authenticated
  USING (group_id IN (SELECT public.my_leaderboard_group_ids()));
