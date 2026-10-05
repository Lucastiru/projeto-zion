-- Ministérios: identidade visual por evento.
--
-- O Eklektos tem marca própria (o roteiro já chega azul, com o logo deles), e
-- o sistema mostrava tudo como "Zion Church". Cada evento passa a pertencer a
-- um ministério opcional, e o nome, a cor e o logo dele aparecem nas telas
-- daquele evento: operador, TV, link do voluntário e PDF. Evento sem
-- ministério continua sendo Zion Church.
--
-- Só identidade: equipe, escala e acesso continuam os mesmos para todos.

create table if not exists public.zion_ministries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#15382d',
  -- Logo guardado como data URL, igual às fotos de voluntário (não há Storage).
  -- Só PNG/JPEG, porque o PDF precisa embutir; ~300 KB de arquivo cabem.
  logo_url text,
  created_at timestamptz not null default now(),
  constraint zion_ministries_name_check check (char_length(btrim(name)) between 1 and 60),
  constraint zion_ministries_color_check check (color ~ '^#[0-9a-fA-F]{6}$'),
  constraint zion_ministries_logo_check check (
    logo_url is null or (logo_url ~ '^data:image/(png|jpeg);base64,' and char_length(logo_url) <= 420000))
);
comment on table public.zion_ministries is
  'Ministérios da igreja (Eklektos, ...). Identidade visual dos eventos: nome, cor, logo.';

alter table public.zion_ministries enable row level security;
drop policy if exists member_read on public.zion_ministries;
create policy member_read on public.zion_ministries
  as permissive for select to authenticated
  using ((zion_current_role() IS NOT NULL));
-- Marca é decisão de liderança: só admin cria e muda ministério.
drop policy if exists admin_write on public.zion_ministries;
create policy admin_write on public.zion_ministries
  as permissive for all to authenticated
  using ((zion_current_role() = 'admin'::text))
  with check ((zion_current_role() = 'admin'::text));
revoke all privileges on table public.zion_ministries from anon, authenticated;
grant select, insert, update, delete on table public.zion_ministries to authenticated;

alter table public.zion_events
  add column if not exists ministry_id uuid references public.zion_ministries(id) on delete set null;
comment on column public.zion_events.ministry_id is
  'Ministério do evento. Nulo = Zion Church. Apagar o ministério devolve o evento para Zion Church.';

-- A TV não tem login e não lê tabela. Pelo id do evento (que já está no link
-- da TV) ela pede só a marca: nome, cor e logo. Nada de roteiro, pessoa ou
-- horário sai por aqui.
create or replace function public.zion_tv_identity(p_event uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select jsonb_build_object('name', m.name, 'color', m.color, 'logo', m.logo_url)
    from public.zion_events e
    join public.zion_ministries m on m.id = e.ministry_id
   where e.id = p_event
$function$;
revoke all on function public.zion_tv_identity(uuid) from public;
grant execute on function public.zion_tv_identity(uuid) to anon, authenticated;

-- O link do voluntário passa a dizer de qual ministério é cada escala. As
-- marcas vêm uma vez só, num mapa à parte: um logo de 300 KB repetido em cada
-- escala pesaria no celular de quem abre pelo WhatsApp.
create or replace function public.zion_portal(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
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
