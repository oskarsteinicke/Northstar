-- Move progress photos out of the main sync blob. Run once in the SQL editor.
--
-- hvi_data.data is a single JSONB document holding every synced key, and it was
-- carrying up to 30 base64 photos. Sync downloads that document, merges, and
-- uploads it back, on launch and again on every visibility change — so the
-- photos travelled twice per sync, every sync, for state that changes maybe
-- once a week.
--
-- Their own column lets the hot path select `data` alone and leave the photos
-- on the server until something actually wants them.

alter table public.hvi_data
  add column if not exists photos jsonb;

-- Existing rows keep their photos inside data for now. The client rescues them
-- into the new column the first time it syncs, then writes `data` without them,
-- so the old copy clears itself. Nothing has to be migrated here.

select
  count(*)                                                as rows_total,
  count(*) filter (where data ? 'hvi_progress_photos')    as still_carrying_photos_in_data
from public.hvi_data;
