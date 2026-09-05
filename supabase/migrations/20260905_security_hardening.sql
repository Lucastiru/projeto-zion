-- Least privilege for browser sessions.
--
-- RLS filters row operations, but privileges that bypass row-level operations
-- (especially TRUNCATE) must never be granted to an application user. Keep the
-- service role untouched; it is reserved for trusted server-side administration.

revoke all privileges on table public.zion_access from anon, authenticated;
revoke all privileges on table public.zion_events from anon, authenticated;
revoke all privileges on table public.zion_feedback from anon, authenticated;
revoke all privileges on table public.zion_issues from anon, authenticated;
revoke all privileges on table public.zion_live_timer from anon, authenticated;
revoke all privileges on table public.zion_moments from anon, authenticated;
revoke all privileges on table public.zion_preparation from anon, authenticated;
revoke all privileges on table public.zion_roster from anon, authenticated;
revoke all privileges on table public.zion_volunteers from anon, authenticated;

grant select, insert, update, delete on table public.zion_access to authenticated;
grant select, insert, update, delete on table public.zion_events to authenticated;
grant select, insert, update, delete on table public.zion_feedback to authenticated;
grant select, insert, update, delete on table public.zion_issues to authenticated;
grant select, insert, update, delete on table public.zion_live_timer to authenticated;
grant select, insert, update, delete on table public.zion_moments to authenticated;
grant select, insert, update, delete on table public.zion_preparation to authenticated;
grant select, insert, update, delete on table public.zion_roster to authenticated;
grant select, insert, update, delete on table public.zion_volunteers to authenticated;

-- Guard against oversized payloads sent directly to PostgREST. The UI already
-- applies stricter limits, but database constraints are the actual trust boundary.
alter table public.zion_volunteers
  drop constraint if exists zion_volunteers_photo_url_size_check;
alter table public.zion_volunteers
  add constraint zion_volunteers_photo_url_size_check
  check (photo_url is null or octet_length(photo_url) <= 700000) not valid;
alter table public.zion_volunteers
  validate constraint zion_volunteers_photo_url_size_check;

alter table public.zion_feedback
  drop constraint if exists zion_feedback_content_size_check;
alter table public.zion_feedback
  add constraint zion_feedback_content_size_check
  check (octet_length(content) <= 20000) not valid;
alter table public.zion_feedback
  validate constraint zion_feedback_content_size_check;
