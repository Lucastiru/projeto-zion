-- Quando cada momento começou e terminou de verdade.
--
-- O relatório pós-culto mostrava "No horário" e uma nota 92/100 fixos no
-- código, sem conta nenhuma por trás. Para comparar papel com realidade é
-- preciso guardar a realidade — e quem melhor sabe a hora é o banco:
--
-- - começou: o primeiro play do momento (insert ignora os seguintes, então
--   pausar e retomar não move o início);
-- - terminou: quando o momento é concluído. Desfazer a conclusão reabre.
--
-- Os dois carimbos saem de gatilhos, com now() do servidor. Nenhuma tela
-- precisa lembrar de registrar, e relógio torto no notebook não entra na conta.

create table if not exists public.zion_moment_runs (
  event_id uuid not null references public.zion_events(id) on delete cascade,
  moment_id uuid not null references public.zion_moments(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  primary key (event_id, moment_id)
);

comment on table public.zion_moment_runs is
  'Início (primeiro play) e fim (conclusão) reais de cada momento. Preenchida por gatilhos.';

alter table public.zion_moment_runs enable row level security;

drop policy if exists member_read on public.zion_moment_runs;
create policy member_read on public.zion_moment_runs
  as permissive
  for select
  to authenticated
  using ((zion_current_role() IS NOT NULL));

drop policy if exists manager_write on public.zion_moment_runs;
create policy manager_write on public.zion_moment_runs
  as permissive
  for all
  to authenticated
  using ((zion_current_role() = ANY (ARRAY['admin'::text, 'manager'::text])))
  with check ((zion_current_role() = ANY (ARRAY['admin'::text, 'manager'::text])));

-- Mesmo padrão do endurecimento de 05/09: só o que a aplicação usa, e nada
-- para anon.
revoke all privileges on table public.zion_moment_runs from anon, authenticated;
grant select, insert, update, delete on table public.zion_moment_runs to authenticated;

-- Começou: primeiro play de cada momento.
create or replace function public.zion_moment_runs_start()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if new.running and new.moment_id is not null then
    insert into public.zion_moment_runs (event_id, moment_id, started_at)
    values (new.event_id, new.moment_id, now())
    on conflict (event_id, moment_id) do nothing;
  end if;
  return new;
end;
$function$;

drop trigger if exists zion_moment_runs_start on public.zion_live_timer;
create trigger zion_moment_runs_start
  after insert or update of running, moment_id on public.zion_live_timer
  for each row execute function public.zion_moment_runs_start();

-- Terminou: conclusão do momento. Desfazer a conclusão apaga o fim, para que
-- um momento retomado seja medido até a conclusão de verdade.
create or replace function public.zion_moment_runs_end()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if new.completed is distinct from old.completed then
    update public.zion_moment_runs
       set ended_at = case when new.completed then now() else null end
     where event_id = new.event_id and moment_id = new.id;
  end if;
  return new;
end;
$function$;

drop trigger if exists zion_moment_runs_end on public.zion_moments;
create trigger zion_moment_runs_end
  after update of completed on public.zion_moments
  for each row execute function public.zion_moment_runs_end();

revoke all on function public.zion_moment_runs_start() from public, anon;
revoke all on function public.zion_moment_runs_end() from public, anon;
