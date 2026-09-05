-- O cronômetro passa a pertencer ao evento, e não à aba do navegador.
--
-- Antes, `running`, `seconds` e o momento atual viviam no estado do React. Com
-- duas abas abertas — a mesma pessoa em duas janelas, ou dois operadores — cada
-- uma tinha o seu tempo, e as duas transmitiam para a mesma televisão a cada
-- três segundos. A TV ficava pulando entre duas verdades.
--
-- Uma linha por evento resolve na origem: não existe conflito a arbitrar porque
-- não existem duas verdades. Toda tela (aba do operador, celular, televisão)
-- vira espectadora da mesma linha.
--
-- Correndo, quem manda é `ends_at`: um alvo absoluto, imune a aba dormindo,
-- notebook fechando e recarregamento de página. Pausado, quem manda é
-- `remaining_seconds`. `ends_at` é hora do servidor — ninguém depende do relógio
-- do próprio computador estar certo (ver a função zion_now abaixo).

create table if not exists public.zion_live_timer (
  event_id uuid primary key references public.zion_events(id) on delete cascade,
  -- O momento no ar. Guardamos o id (verdade) e a posição (atalho): se alguém
  -- reordenar o cronograma no meio do culto, o id continua apontando certo.
  moment_id uuid references public.zion_moments(id) on delete set null,
  moment_position integer not null default 0,
  running boolean not null default false,
  ends_at timestamptz,
  remaining_seconds integer not null default 0,
  updated_at timestamptz not null default now(),
  -- Nome de quem mexeu por último. Com várias pessoas na operação, a tela diz
  -- de quem foi o último clique em vez de deixar todo mundo adivinhando.
  updated_by text not null default ''
);

comment on table public.zion_live_timer is
  'Cronômetro ao vivo, uma linha por evento. Fonte da verdade compartilhada entre operadores e Modo TV.';
comment on column public.zion_live_timer.ends_at is
  'Alvo em hora do servidor enquanto o cronômetro corre. Nulo quando pausado.';
comment on column public.zion_live_timer.remaining_seconds is
  'Quanto falta quando pausado. Negativo quando o momento estourou o tempo.';

-- updated_at é carimbado pelo banco: o cliente não tem como mentir a hora do
-- último toque, nem por engano.
create or replace function public.zion_live_timer_touch()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists zion_live_timer_touch on public.zion_live_timer;
create trigger zion_live_timer_touch
  before insert or update on public.zion_live_timer
  for each row execute function public.zion_live_timer_touch();

alter table public.zion_live_timer enable row level security;

drop policy if exists member_read on public.zion_live_timer;
create policy member_read on public.zion_live_timer
  as permissive
  for select
  to authenticated
  using ((zion_current_role() IS NOT NULL));

drop policy if exists manager_write on public.zion_live_timer;
create policy manager_write on public.zion_live_timer
  as permissive
  for all
  to authenticated
  using ((zion_current_role() = ANY (ARRAY['admin'::text, 'manager'::text])))
  with check ((zion_current_role() = ANY (ARRAY['admin'::text, 'manager'::text])));

grant delete, insert, references, select, trigger, truncate, update on public.zion_live_timer to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.zion_live_timer to service_role;

-- O Supabase concede acesso a anon por padrão em tabela nova. Todas as outras
-- tabelas do projeto revogam isso, e a regra é a mesma aqui: sem sessão não se
-- lê nada. Hoje a RLS já barraria (não há política para anon), mas sem o revoke
-- bastaria alguém criar uma política `to public` — ou desligar a RLS num
-- diagnóstico — para a tabela abrir sozinha.
revoke all on table public.zion_live_timer from anon;
revoke all on function public.zion_live_timer_touch() from public, anon;

-- Sem isto o Realtime não emite mudança desta tabela e as abas só se acertariam
-- ao recarregar. É o que faz o play de um operador aparecer na tela do outro.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'zion_live_timer'
  ) then
    alter publication supabase_realtime add table public.zion_live_timer;
  end if;
end $$;

-- A hora do servidor, para o navegador medir o quanto o próprio relógio está
-- adiantado ou atrasado. Sem esta medida, um computador 40 segundos fora do ar
-- mostraria o culto 40 segundos fora do lugar — e é justamente o relógio errado
-- que ninguém percebe até estar ao vivo.
create or replace function public.zion_now()
returns timestamptz
language sql
stable
as $function$
  select now()
$function$;

revoke all on function public.zion_now() from public, anon;
grant execute on function public.zion_now() to authenticated;
