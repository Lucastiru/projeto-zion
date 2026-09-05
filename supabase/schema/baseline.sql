-- Baseline do schema public, extraído do projeto Supabase svcpwtmccskohjfbjqfx.
-- Gerado por scripts/dump-schema.mjs em 2026-09-05T18:59:46.234Z.
-- Reconstruído do catálogo do Postgres: confira antes de aplicar num banco novo.

-- Tabelas
create table if not exists public.zion_access (
  email text not null,
  role text default 'volunteer'::text not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.zion_events (
  id uuid default gen_random_uuid() not null,
  title text not null,
  event_date date not null,
  start_time time without time zone not null,
  event_type text default 'Culto'::text not null,
  location text default ''::text not null,
  created_at timestamp with time zone default now() not null,
  notes_url text
);
comment on column public.zion_events.notes_url is 'Endereço dos recados do culto no Drive. Somente http(s).';

create table if not exists public.zion_feedback (
  event_id uuid not null,
  content text default ''::text not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.zion_issues (
  id uuid default gen_random_uuid() not null,
  event_id uuid not null,
  area text not null,
  description text not null,
  resolved boolean default false not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.zion_live_timer (
  event_id uuid not null,
  moment_id uuid,
  moment_position integer default 0 not null,
  running boolean default false not null,
  ends_at timestamp with time zone,
  remaining_seconds integer default 0 not null,
  updated_at timestamp with time zone default now() not null,
  updated_by text default ''::text not null
);
comment on table public.zion_live_timer is 'Cronômetro ao vivo, uma linha por evento. Fonte da verdade compartilhada entre operadores e Modo TV.';
comment on column public.zion_live_timer.ends_at is 'Alvo em hora do servidor enquanto o cronômetro corre. Nulo quando pausado.';
comment on column public.zion_live_timer.remaining_seconds is 'Quanto falta quando pausado. Negativo quando o momento estourou o tempo.';

create table if not exists public.zion_moments (
  id uuid default gen_random_uuid() not null,
  event_id uuid not null,
  position integer default 0 not null,
  title text not null,
  duration_minutes integer not null,
  owner_name text default ''::text not null,
  details text default ''::text not null,
  sequence_items jsonb default '[]'::jsonb not null,
  completed boolean default false not null
);

create table if not exists public.zion_preparation (
  id uuid default gen_random_uuid() not null,
  event_id uuid not null,
  team text not null,
  description text not null,
  assigned_to uuid,
  completed boolean default false not null
);

create table if not exists public.zion_roster (
  event_id uuid not null,
  volunteer_id uuid not null
);

create table if not exists public.zion_volunteers (
  id uuid default gen_random_uuid() not null,
  name text not null,
  email text not null,
  team text not null,
  phone text default ''::text not null,
  photo_url text,
  created_at timestamp with time zone default now() not null
);

-- Constraints
alter table public.zion_access add constraint zion_access_pkey PRIMARY KEY (email);
alter table public.zion_events add constraint zion_events_pkey PRIMARY KEY (id);
alter table public.zion_feedback add constraint zion_feedback_pkey PRIMARY KEY (event_id);
alter table public.zion_issues add constraint zion_issues_pkey PRIMARY KEY (id);
alter table public.zion_live_timer add constraint zion_live_timer_pkey PRIMARY KEY (event_id);
alter table public.zion_moments add constraint zion_moments_pkey PRIMARY KEY (id);
alter table public.zion_preparation add constraint zion_preparation_pkey PRIMARY KEY (id);
alter table public.zion_roster add constraint zion_roster_pkey PRIMARY KEY (event_id, volunteer_id);
alter table public.zion_volunteers add constraint zion_volunteers_pkey PRIMARY KEY (id);
alter table public.zion_volunteers add constraint zion_volunteers_email_key UNIQUE (email);
alter table public.zion_access add constraint zion_access_email_check CHECK ((email = lower(email)));
alter table public.zion_access add constraint zion_access_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'manager'::text, 'volunteer'::text])));
alter table public.zion_events add constraint zion_events_notes_url_check CHECK (((notes_url IS NULL) OR (notes_url ~* '^https?://[^[:space:]]+$'::text)));
alter table public.zion_moments add constraint zion_moments_duration_minutes_check CHECK ((duration_minutes > 0));
alter table public.zion_moments add constraint zion_moments_sequence_items_check CHECK ((jsonb_typeof(sequence_items) = 'array'::text));
alter table public.zion_feedback add constraint zion_feedback_event_id_fkey FOREIGN KEY (event_id) REFERENCES zion_events(id) ON DELETE CASCADE;
alter table public.zion_issues add constraint zion_issues_event_id_fkey FOREIGN KEY (event_id) REFERENCES zion_events(id) ON DELETE CASCADE;
alter table public.zion_live_timer add constraint zion_live_timer_event_id_fkey FOREIGN KEY (event_id) REFERENCES zion_events(id) ON DELETE CASCADE;
alter table public.zion_live_timer add constraint zion_live_timer_moment_id_fkey FOREIGN KEY (moment_id) REFERENCES zion_moments(id) ON DELETE SET NULL;
alter table public.zion_moments add constraint zion_moments_event_id_fkey FOREIGN KEY (event_id) REFERENCES zion_events(id) ON DELETE CASCADE;
alter table public.zion_preparation add constraint zion_preparation_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES zion_volunteers(id) ON DELETE SET NULL;
alter table public.zion_preparation add constraint zion_preparation_event_id_fkey FOREIGN KEY (event_id) REFERENCES zion_events(id) ON DELETE CASCADE;
alter table public.zion_roster add constraint zion_roster_event_id_fkey FOREIGN KEY (event_id) REFERENCES zion_events(id) ON DELETE CASCADE;
alter table public.zion_roster add constraint zion_roster_volunteer_id_fkey FOREIGN KEY (volunteer_id) REFERENCES zion_volunteers(id) ON DELETE CASCADE;

-- Índices
CREATE INDEX zion_events_event_date_idx ON public.zion_events USING btree (event_date);
CREATE INDEX zion_issues_event_id_idx ON public.zion_issues USING btree (event_id);
CREATE INDEX zion_moments_event_id_position_idx ON public.zion_moments USING btree (event_id, "position");
CREATE INDEX zion_preparation_event_id_idx ON public.zion_preparation USING btree (event_id);

-- Funções
CREATE OR REPLACE FUNCTION public.zion_current_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select role from public.zion_access
  where email = lower(auth.jwt() ->> 'email') and auth.uid() is not null
$function$;

CREATE OR REPLACE FUNCTION public.zion_live_timer_touch()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.zion_now()
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE
AS $function$
  select now()
$function$;

CREATE OR REPLACE FUNCTION public.zion_pending_users()
 RETURNS TABLE(email text, name text, created_at timestamp with time zone, confirmed boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select lower(u.email)::text,
         coalesce(nullif(btrim(u.raw_user_meta_data ->> 'name'), ''), split_part(u.email, '@', 1))::text,
         u.created_at,
         u.email_confirmed_at is not null
  from auth.users u
  where public.zion_current_role() = 'admin'
    and u.deleted_at is null
    and not exists (select 1 from public.zion_access a where a.email = lower(u.email))
  order by u.created_at
$function$;

-- Triggers
CREATE TRIGGER zion_live_timer_touch BEFORE INSERT OR UPDATE ON public.zion_live_timer FOR EACH ROW EXECUTE FUNCTION zion_live_timer_touch();

-- Row Level Security
alter table public.zion_access enable row level security;
alter table public.zion_events enable row level security;
alter table public.zion_feedback enable row level security;
alter table public.zion_issues enable row level security;
alter table public.zion_live_timer enable row level security;
alter table public.zion_moments enable row level security;
alter table public.zion_preparation enable row level security;
alter table public.zion_roster enable row level security;
alter table public.zion_volunteers enable row level security;

-- Políticas
create policy access_admin on public.zion_access
  as permissive
  for all
  to authenticated
  using ((zion_current_role() = 'admin'::text))
  with check ((zion_current_role() = 'admin'::text));

create policy access_read on public.zion_access
  as permissive
  for select
  to authenticated
  using (((email = lower((auth.jwt() ->> 'email'::text))) OR (zion_current_role() = 'admin'::text)));

create policy manager_write on public.zion_events
  as permissive
  for all
  to authenticated
  using ((zion_current_role() = ANY (ARRAY['admin'::text, 'manager'::text])))
  with check ((zion_current_role() = ANY (ARRAY['admin'::text, 'manager'::text])));

create policy member_read on public.zion_events
  as permissive
  for select
  to authenticated
  using ((zion_current_role() IS NOT NULL));

create policy manager_write on public.zion_feedback
  as permissive
  for all
  to authenticated
  using ((zion_current_role() = ANY (ARRAY['admin'::text, 'manager'::text])))
  with check ((zion_current_role() = ANY (ARRAY['admin'::text, 'manager'::text])));

create policy member_read on public.zion_feedback
  as permissive
  for select
  to authenticated
  using ((zion_current_role() IS NOT NULL));

create policy manager_write on public.zion_issues
  as permissive
  for all
  to authenticated
  using ((zion_current_role() = ANY (ARRAY['admin'::text, 'manager'::text])))
  with check ((zion_current_role() = ANY (ARRAY['admin'::text, 'manager'::text])));

create policy member_read on public.zion_issues
  as permissive
  for select
  to authenticated
  using ((zion_current_role() IS NOT NULL));

create policy manager_write on public.zion_live_timer
  as permissive
  for all
  to authenticated
  using ((zion_current_role() = ANY (ARRAY['admin'::text, 'manager'::text])))
  with check ((zion_current_role() = ANY (ARRAY['admin'::text, 'manager'::text])));

create policy member_read on public.zion_live_timer
  as permissive
  for select
  to authenticated
  using ((zion_current_role() IS NOT NULL));

create policy manager_write on public.zion_moments
  as permissive
  for all
  to authenticated
  using ((zion_current_role() = ANY (ARRAY['admin'::text, 'manager'::text])))
  with check ((zion_current_role() = ANY (ARRAY['admin'::text, 'manager'::text])));

create policy member_read on public.zion_moments
  as permissive
  for select
  to authenticated
  using ((zion_current_role() IS NOT NULL));

create policy manager_write on public.zion_preparation
  as permissive
  for all
  to authenticated
  using ((zion_current_role() = ANY (ARRAY['admin'::text, 'manager'::text])))
  with check ((zion_current_role() = ANY (ARRAY['admin'::text, 'manager'::text])));

create policy member_read on public.zion_preparation
  as permissive
  for select
  to authenticated
  using ((zion_current_role() IS NOT NULL));

create policy manager_write on public.zion_roster
  as permissive
  for all
  to authenticated
  using ((zion_current_role() = ANY (ARRAY['admin'::text, 'manager'::text])))
  with check ((zion_current_role() = ANY (ARRAY['admin'::text, 'manager'::text])));

create policy member_read on public.zion_roster
  as permissive
  for select
  to authenticated
  using ((zion_current_role() IS NOT NULL));

create policy manager_write on public.zion_volunteers
  as permissive
  for all
  to authenticated
  using ((zion_current_role() = ANY (ARRAY['admin'::text, 'manager'::text])))
  with check ((zion_current_role() = ANY (ARRAY['admin'::text, 'manager'::text])));

create policy member_read on public.zion_volunteers
  as permissive
  for select
  to authenticated
  using ((zion_current_role() IS NOT NULL));

-- Grants
grant delete, insert, references, select, trigger, truncate, update on public.zion_access to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.zion_access to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.zion_events to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.zion_events to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.zion_feedback to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.zion_feedback to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.zion_issues to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.zion_issues to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.zion_live_timer to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.zion_live_timer to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.zion_moments to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.zion_moments to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.zion_preparation to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.zion_preparation to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.zion_roster to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.zion_roster to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.zion_volunteers to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.zion_volunteers to service_role;
