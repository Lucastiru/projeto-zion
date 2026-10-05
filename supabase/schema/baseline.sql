-- Baseline do schema public, extraído do projeto Supabase svcpwtmccskohjfbjqfx.
-- Gerado por scripts/dump-schema.mjs em 2026-10-05T12:25:09.463Z.
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
  notes_url text,
  ministry_id uuid
);
comment on column public.zion_events.notes_url is 'Endereço dos recados do culto no Drive. Somente http(s).';
comment on column public.zion_events.ministry_id is 'Ministério do evento. Nulo = Zion Church. Apagar o ministério devolve o evento para Zion Church.';

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
  updated_by text default ''::text not null,
  stage_message text default ''::text not null,
  stage_message_at timestamp with time zone
);
comment on table public.zion_live_timer is 'Cronômetro ao vivo, uma linha por evento. Fonte da verdade compartilhada entre operadores e Modo TV.';
comment on column public.zion_live_timer.ends_at is 'Alvo em hora do servidor enquanto o cronômetro corre. Nulo quando pausado.';
comment on column public.zion_live_timer.remaining_seconds is 'Quanto falta quando pausado. Negativo quando o momento estourou o tempo.';
comment on column public.zion_live_timer.stage_message is 'Texto que o operador manda para a tela do palco. Vazio = sem mensagem.';

create table if not exists public.zion_ministries (
  id uuid default gen_random_uuid() not null,
  name text not null,
  color text default '#15382d'::text not null,
  logo_url text,
  created_at timestamp with time zone default now() not null
);
comment on table public.zion_ministries is 'Ministérios da igreja (Eklektos, ...). Identidade visual dos eventos: nome, cor, logo.';

create table if not exists public.zion_moment_runs (
  event_id uuid not null,
  moment_id uuid not null,
  started_at timestamp with time zone default now() not null,
  ended_at timestamp with time zone
);
comment on table public.zion_moment_runs is 'Início (primeiro play) e fim (conclusão) reais de cada momento. Preenchida por gatilhos.';

create table if not exists public.zion_moments (
  id uuid default gen_random_uuid() not null,
  event_id uuid not null,
  position integer default 0 not null,
  title text not null,
  duration_minutes integer not null,
  owner_name text default ''::text not null,
  details text default ''::text not null,
  sequence_items jsonb default '[]'::jsonb not null,
  completed boolean default false not null,
  completed_item_indexes integer[] default '{}'::integer[] not null,
  hard_start time without time zone
);
comment on column public.zion_moments.hard_start is 'Hora de relógio em que o momento tem de começar. Nulo = começa quando o anterior acabar.';

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
  volunteer_id uuid not null,
  status text default 'pendente'::text not null,
  decline_reason text default ''::text not null,
  responded_at timestamp with time zone,
  invited_at timestamp with time zone
);

create table if not exists public.zion_volunteer_blocks (
  volunteer_id uuid not null,
  day date not null
);
comment on table public.zion_volunteer_blocks is 'Dias em que o voluntário avisou que não pode servir. Ele mesmo marca pelo link pessoal.';

create table if not exists public.zion_volunteers (
  id uuid default gen_random_uuid() not null,
  name text not null,
  email text not null,
  team text not null,
  phone text default ''::text not null,
  photo_url text,
  created_at timestamp with time zone default now() not null,
  portal_token uuid default gen_random_uuid() not null
);
comment on column public.zion_volunteers.portal_token is 'Credencial do link pessoal /escala?v=. Quem tiver o link responde pela pessoa.';

-- Constraints
alter table public.zion_access add constraint zion_access_pkey PRIMARY KEY (email);
alter table public.zion_events add constraint zion_events_pkey PRIMARY KEY (id);
alter table public.zion_feedback add constraint zion_feedback_pkey PRIMARY KEY (event_id);
alter table public.zion_issues add constraint zion_issues_pkey PRIMARY KEY (id);
alter table public.zion_live_timer add constraint zion_live_timer_pkey PRIMARY KEY (event_id);
alter table public.zion_ministries add constraint zion_ministries_pkey PRIMARY KEY (id);
alter table public.zion_moment_runs add constraint zion_moment_runs_pkey PRIMARY KEY (event_id, moment_id);
alter table public.zion_moments add constraint zion_moments_pkey PRIMARY KEY (id);
alter table public.zion_preparation add constraint zion_preparation_pkey PRIMARY KEY (id);
alter table public.zion_roster add constraint zion_roster_pkey PRIMARY KEY (event_id, volunteer_id);
alter table public.zion_volunteer_blocks add constraint zion_volunteer_blocks_pkey PRIMARY KEY (volunteer_id, day);
alter table public.zion_volunteers add constraint zion_volunteers_pkey PRIMARY KEY (id);
alter table public.zion_volunteers add constraint zion_volunteers_email_key UNIQUE (email);
alter table public.zion_access add constraint zion_access_email_check CHECK ((email = lower(email)));
alter table public.zion_access add constraint zion_access_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'manager'::text, 'volunteer'::text])));
alter table public.zion_events add constraint zion_events_notes_url_check CHECK (((notes_url IS NULL) OR (notes_url ~* '^https?://[^[:space:]]+$'::text)));
alter table public.zion_feedback add constraint zion_feedback_content_size_check CHECK ((octet_length(content) <= 20000));
alter table public.zion_live_timer add constraint zion_live_timer_stage_message_check CHECK ((char_length(stage_message) <= 120));
alter table public.zion_ministries add constraint zion_ministries_color_check CHECK ((color ~ '^#[0-9a-fA-F]{6}$'::text));
alter table public.zion_ministries add constraint zion_ministries_logo_check CHECK (((logo_url IS NULL) OR ((logo_url ~ '^data:image/(png|jpeg);base64,'::text) AND (char_length(logo_url) <= 420000))));
alter table public.zion_ministries add constraint zion_ministries_name_check CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 60)));
alter table public.zion_moments add constraint zion_moments_completed_item_indexes_check CHECK ((0 <= ALL (completed_item_indexes)));
alter table public.zion_moments add constraint zion_moments_duration_minutes_check CHECK ((duration_minutes > 0));
alter table public.zion_moments add constraint zion_moments_sequence_items_check CHECK ((jsonb_typeof(sequence_items) = 'array'::text));
alter table public.zion_roster add constraint zion_roster_decline_reason_check CHECK ((char_length(decline_reason) <= 200));
alter table public.zion_roster add constraint zion_roster_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'confirmado'::text, 'recusado'::text])));
alter table public.zion_volunteers add constraint zion_volunteers_photo_url_size_check CHECK (((photo_url IS NULL) OR (octet_length(photo_url) <= 700000)));
alter table public.zion_events add constraint zion_events_ministry_id_fkey FOREIGN KEY (ministry_id) REFERENCES zion_ministries(id) ON DELETE SET NULL;
alter table public.zion_feedback add constraint zion_feedback_event_id_fkey FOREIGN KEY (event_id) REFERENCES zion_events(id) ON DELETE CASCADE;
alter table public.zion_issues add constraint zion_issues_event_id_fkey FOREIGN KEY (event_id) REFERENCES zion_events(id) ON DELETE CASCADE;
alter table public.zion_live_timer add constraint zion_live_timer_event_id_fkey FOREIGN KEY (event_id) REFERENCES zion_events(id) ON DELETE CASCADE;
alter table public.zion_live_timer add constraint zion_live_timer_moment_id_fkey FOREIGN KEY (moment_id) REFERENCES zion_moments(id) ON DELETE SET NULL;
alter table public.zion_moment_runs add constraint zion_moment_runs_event_id_fkey FOREIGN KEY (event_id) REFERENCES zion_events(id) ON DELETE CASCADE;
alter table public.zion_moment_runs add constraint zion_moment_runs_moment_id_fkey FOREIGN KEY (moment_id) REFERENCES zion_moments(id) ON DELETE CASCADE;
alter table public.zion_moments add constraint zion_moments_event_id_fkey FOREIGN KEY (event_id) REFERENCES zion_events(id) ON DELETE CASCADE;
alter table public.zion_preparation add constraint zion_preparation_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES zion_volunteers(id) ON DELETE SET NULL;
alter table public.zion_preparation add constraint zion_preparation_event_id_fkey FOREIGN KEY (event_id) REFERENCES zion_events(id) ON DELETE CASCADE;
alter table public.zion_roster add constraint zion_roster_event_id_fkey FOREIGN KEY (event_id) REFERENCES zion_events(id) ON DELETE CASCADE;
alter table public.zion_roster add constraint zion_roster_volunteer_id_fkey FOREIGN KEY (volunteer_id) REFERENCES zion_volunteers(id) ON DELETE CASCADE;
alter table public.zion_volunteer_blocks add constraint zion_volunteer_blocks_volunteer_id_fkey FOREIGN KEY (volunteer_id) REFERENCES zion_volunteers(id) ON DELETE CASCADE;

-- Índices
CREATE INDEX zion_events_event_date_idx ON public.zion_events USING btree (event_date);
CREATE INDEX zion_issues_event_id_idx ON public.zion_issues USING btree (event_id);
CREATE INDEX zion_moments_event_id_position_idx ON public.zion_moments USING btree (event_id, "position");
CREATE INDEX zion_preparation_event_id_idx ON public.zion_preparation USING btree (event_id);
CREATE UNIQUE INDEX zion_volunteers_portal_token_key ON public.zion_volunteers USING btree (portal_token);

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

CREATE OR REPLACE FUNCTION public.zion_moment_runs_end()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.completed is distinct from old.completed then
    update public.zion_moment_runs
       set ended_at = case when new.completed then now() else null end
     where event_id = new.event_id and moment_id = new.id;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.zion_moment_runs_start()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.running and new.moment_id is not null then
    insert into public.zion_moment_runs (event_id, moment_id, started_at)
    values (new.event_id, new.moment_id, now())
    on conflict (event_id, moment_id) do nothing;
  end if;
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

CREATE OR REPLACE FUNCTION public.zion_portal(p_token uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'name', v.name,
    'team', v.team,
    'schedule', coalesce((
      select jsonb_agg(jsonb_build_object(
               'event_id', e.id, 'title', e.title, 'date', e.event_date,
               'time', to_char(e.start_time, 'HH24:MI'), 'location', e.location,
               'status', r.status, 'reason', r.decline_reason, 'ministry_id', e.ministry_id)
             order by e.event_date, e.start_time)
        from public.zion_roster r
        join public.zion_events e on e.id = r.event_id
       where r.volunteer_id = v.id
         and e.event_date >= (now() at time zone 'America/Sao_Paulo')::date - 1), '[]'::jsonb),
    'ministries', coalesce((
      select jsonb_object_agg(m.id, jsonb_build_object('name', m.name, 'color', m.color, 'logo', m.logo_url))
        from public.zion_ministries m
       where m.id in (
         select e.ministry_id from public.zion_roster r
           join public.zion_events e on e.id = r.event_id
          where r.volunteer_id = v.id
            and e.event_date >= (now() at time zone 'America/Sao_Paulo')::date - 1)), '{}'::jsonb),
    'blocks', coalesce((
      select jsonb_agg(b.day order by b.day)
        from public.zion_volunteer_blocks b
       where b.volunteer_id = v.id
         and b.day >= (now() at time zone 'America/Sao_Paulo')::date), '[]'::jsonb))
  from public.zion_volunteers v
  where v.portal_token = p_token
$function$;

CREATE OR REPLACE FUNCTION public.zion_portal_block(p_token uuid, p_day date, p_blocked boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
begin
  select id into v_id from public.zion_volunteers where portal_token = p_token;
  if v_id is null then
    raise exception 'Link inválido';
  end if;
  if p_day < (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'Só dá para marcar de hoje em diante';
  end if;
  if p_blocked then
    insert into public.zion_volunteer_blocks (volunteer_id, day) values (v_id, p_day)
    on conflict do nothing;
  else
    delete from public.zion_volunteer_blocks where volunteer_id = v_id and day = p_day;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.zion_portal_respond(p_token uuid, p_event uuid, p_status text, p_reason text DEFAULT ''::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
begin
  if p_status not in ('confirmado', 'recusado') then
    raise exception 'Resposta inválida';
  end if;
  select id into v_id from public.zion_volunteers where portal_token = p_token;
  if v_id is null then
    raise exception 'Link inválido';
  end if;
  update public.zion_roster r
     set status = p_status,
         decline_reason = case when p_status = 'recusado' then left(coalesce(btrim(p_reason), ''), 200) else '' end,
         responded_at = now()
    from public.zion_events e
   where r.volunteer_id = v_id and r.event_id = p_event
     and e.id = r.event_id and e.event_date >= (now() at time zone 'America/Sao_Paulo')::date;
  if not found then
    raise exception 'Escala não encontrada ou já passou';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.zion_tv_identity(p_event uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object('name', m.name, 'color', m.color, 'logo', m.logo_url)
    from public.zion_events e
    join public.zion_ministries m on m.id = e.ministry_id
   where e.id = p_event
$function$;

-- Triggers
CREATE TRIGGER zion_live_timer_touch BEFORE INSERT OR UPDATE ON public.zion_live_timer FOR EACH ROW EXECUTE FUNCTION zion_live_timer_touch();
CREATE TRIGGER zion_moment_runs_start AFTER INSERT OR UPDATE OF running, moment_id ON public.zion_live_timer FOR EACH ROW EXECUTE FUNCTION zion_moment_runs_start();
CREATE TRIGGER zion_moment_runs_end AFTER UPDATE OF completed ON public.zion_moments FOR EACH ROW EXECUTE FUNCTION zion_moment_runs_end();

-- Row Level Security
alter table public.zion_access enable row level security;
alter table public.zion_events enable row level security;
alter table public.zion_feedback enable row level security;
alter table public.zion_issues enable row level security;
alter table public.zion_live_timer enable row level security;
alter table public.zion_ministries enable row level security;
alter table public.zion_moment_runs enable row level security;
alter table public.zion_moments enable row level security;
alter table public.zion_preparation enable row level security;
alter table public.zion_roster enable row level security;
alter table public.zion_volunteer_blocks enable row level security;
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

create policy admin_write on public.zion_ministries
  as permissive
  for all
  to authenticated
  using ((zion_current_role() = 'admin'::text))
  with check ((zion_current_role() = 'admin'::text));

create policy member_read on public.zion_ministries
  as permissive
  for select
  to authenticated
  using ((zion_current_role() IS NOT NULL));

create policy manager_write on public.zion_moment_runs
  as permissive
  for all
  to authenticated
  using ((zion_current_role() = ANY (ARRAY['admin'::text, 'manager'::text])))
  with check ((zion_current_role() = ANY (ARRAY['admin'::text, 'manager'::text])));

create policy member_read on public.zion_moment_runs
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

create policy manager_write on public.zion_volunteer_blocks
  as permissive
  for all
  to authenticated
  using ((zion_current_role() = ANY (ARRAY['admin'::text, 'manager'::text])))
  with check ((zion_current_role() = ANY (ARRAY['admin'::text, 'manager'::text])));

create policy member_read on public.zion_volunteer_blocks
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
grant delete, insert, select, update on public.zion_access to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.zion_access to service_role;
grant delete, insert, select, update on public.zion_events to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.zion_events to service_role;
grant delete, insert, select, update on public.zion_feedback to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.zion_feedback to service_role;
grant delete, insert, select, update on public.zion_issues to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.zion_issues to service_role;
grant delete, insert, select, update on public.zion_live_timer to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.zion_live_timer to service_role;
grant delete, insert, select, update on public.zion_ministries to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.zion_ministries to service_role;
grant delete, insert, select, update on public.zion_moment_runs to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.zion_moment_runs to service_role;
grant delete, insert, select, update on public.zion_moments to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.zion_moments to service_role;
grant delete, insert, select, update on public.zion_preparation to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.zion_preparation to service_role;
grant delete, insert, select, update on public.zion_roster to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.zion_roster to service_role;
grant delete, insert, select, update on public.zion_volunteer_blocks to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.zion_volunteer_blocks to service_role;
grant delete, insert, select, update on public.zion_volunteers to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.zion_volunteers to service_role;
