-- Escala com aceite: o voluntário confirma ou recusa, e marca os dias em que
-- não pode servir.
--
-- Voluntário não tem login — zion_volunteers é cadastro, separado de
-- zion_access. O acesso dele é um link pessoal (/escala?v=<token>), mandado
-- pelo WhatsApp, no mesmo espírito do link do Modo TV. O token é a credencial:
-- uuid aleatório (122 bits), um por voluntário.
--
-- O navegador anônimo não toca tabela nenhuma (continua sem grant). Ele só
-- chama três funções security definer, e cada uma começa achando o voluntário
-- pelo token: sem token válido, não há linha; com token, só as linhas DELE.

-- 1. Link pessoal
alter table public.zion_volunteers
  add column if not exists portal_token uuid not null default gen_random_uuid();
create unique index if not exists zion_volunteers_portal_token_key
  on public.zion_volunteers (portal_token);
comment on column public.zion_volunteers.portal_token is
  'Credencial do link pessoal /escala?v=. Quem tiver o link responde pela pessoa.';

-- 2. Resposta na escala. Desescalar e escalar de novo cria linha nova, que
--    nasce pendente: um convite novo pede resposta nova.
alter table public.zion_roster
  add column if not exists status text not null default 'pendente',
  add column if not exists decline_reason text not null default '',
  add column if not exists responded_at timestamptz,
  add column if not exists invited_at timestamptz;
alter table public.zion_roster drop constraint if exists zion_roster_status_check;
alter table public.zion_roster add constraint zion_roster_status_check
  check (status in ('pendente', 'confirmado', 'recusado'));
alter table public.zion_roster drop constraint if exists zion_roster_decline_reason_check;
alter table public.zion_roster add constraint zion_roster_decline_reason_check
  check (char_length(decline_reason) <= 200);

-- 3. Dias em que o voluntário não pode servir.
create table if not exists public.zion_volunteer_blocks (
  volunteer_id uuid not null references public.zion_volunteers(id) on delete cascade,
  day date not null,
  primary key (volunteer_id, day)
);
comment on table public.zion_volunteer_blocks is
  'Dias em que o voluntário avisou que não pode servir. Ele mesmo marca pelo link pessoal.';

alter table public.zion_volunteer_blocks enable row level security;
drop policy if exists member_read on public.zion_volunteer_blocks;
create policy member_read on public.zion_volunteer_blocks
  as permissive for select to authenticated
  using ((zion_current_role() IS NOT NULL));
drop policy if exists manager_write on public.zion_volunteer_blocks;
create policy manager_write on public.zion_volunteer_blocks
  as permissive for all to authenticated
  using ((zion_current_role() = ANY (ARRAY['admin'::text, 'manager'::text])))
  with check ((zion_current_role() = ANY (ARRAY['admin'::text, 'manager'::text])));
revoke all privileges on table public.zion_volunteer_blocks from anon, authenticated;
grant select, insert, update, delete on table public.zion_volunteer_blocks to authenticated;

-- Datas comparadas no fuso da igreja: em UTC, às 21h de um culto já é o dia
-- seguinte, e quem respondesse tarde ouviria que a escala "já passou".

-- 4. O que o link pessoal mostra: nome, equipe, escalas de ontem em diante e
--    dias bloqueados. Nada de outro voluntário, nada de e-mail ou telefone.
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
               'status', r.status, 'reason', r.decline_reason)
             order by e.event_date, e.start_time)
        from public.zion_roster r
        join public.zion_events e on e.id = r.event_id
       where r.volunteer_id = v.id and e.event_date >= (now() at time zone 'America/Sao_Paulo')::date - 1), '[]'::jsonb),
    'blocks', coalesce((
      select jsonb_agg(b.day order by b.day)
        from public.zion_volunteer_blocks b
       where b.volunteer_id = v.id and b.day >= (now() at time zone 'America/Sao_Paulo')::date), '[]'::jsonb))
  from public.zion_volunteers v
  where v.portal_token = p_token
$function$;

-- 5. Confirmar ou recusar uma escala. Só a dele, só de culto que ainda não
--    passou.
create or replace function public.zion_portal_respond(p_token uuid, p_event uuid, p_status text, p_reason text default '')
returns void
language plpgsql
security definer
set search_path to ''
as $function$
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

-- 6. Marcar ou desmarcar um dia indisponível. Só de hoje em diante.
create or replace function public.zion_portal_block(p_token uuid, p_day date, p_blocked boolean)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
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

revoke all on function public.zion_portal(uuid) from public;
revoke all on function public.zion_portal_respond(uuid, uuid, text, text) from public;
revoke all on function public.zion_portal_block(uuid, date, boolean) from public;
grant execute on function public.zion_portal(uuid) to anon, authenticated;
grant execute on function public.zion_portal_respond(uuid, uuid, text, text) to anon, authenticated;
grant execute on function public.zion_portal_block(uuid, date, boolean) to anon, authenticated;
