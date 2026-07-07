-- Arete Leaderboard Tables
-- Paste this into Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor)

-- 1. Groups table
CREATE TABLE IF NOT EXISTS leaderboard_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code varchar(8) NOT NULL UNIQUE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- 2. Members table
CREATE TABLE IF NOT EXISTS leaderboard_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid REFERENCES leaderboard_groups(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  display_name text NOT NULL DEFAULT 'Anonymous',
  stats jsonb DEFAULT '{}',
  updated_at timestamptz DEFAULT now(),
  UNIQUE(group_id, user_id)
);

-- 3. Enable RLS
ALTER TABLE leaderboard_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_members ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for groups
-- Anyone authenticated can create a group
CREATE POLICY "Users can create groups"
  ON leaderboard_groups FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- Anyone can read groups (need to look up by code to join)
CREATE POLICY "Anyone can read groups"
  ON leaderboard_groups FOR SELECT
  TO authenticated
  USING (true);

-- 5. RLS Policies for members
-- Anyone authenticated can join a group (insert themselves)
CREATE POLICY "Users can join groups"
  ON leaderboard_members FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Members can read all members in groups they belong to.
-- NOTE: the membership check must go through a SECURITY DEFINER function —
-- a plain subquery on leaderboard_members inside its own policy causes
-- "infinite recursion detected in policy" (42P17) on every SELECT.
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

CREATE POLICY "Members can read group members"
  ON leaderboard_members FOR SELECT
  TO authenticated
  USING (group_id IN (SELECT public.my_leaderboard_group_ids()));

-- Members can update their own stats
CREATE POLICY "Users can update own stats"
  ON leaderboard_members FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Members can leave (delete themselves)
CREATE POLICY "Users can leave groups"
  ON leaderboard_members FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 6. Index for fast code lookups
CREATE INDEX IF NOT EXISTS idx_lb_groups_code ON leaderboard_groups(code);
CREATE INDEX IF NOT EXISTS idx_lb_members_group ON leaderboard_members(group_id);
CREATE INDEX IF NOT EXISTS idx_lb_members_user ON leaderboard_members(user_id);
