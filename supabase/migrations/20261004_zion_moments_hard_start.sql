-- Hora marcada de um momento.
--
-- O padrão continua sendo "começa quando o anterior acabar". Este campo é só
-- para o que tem hora de relógio — a Palavra, uma transmissão, o fim por causa
-- do estacionamento. Com ele, a tela calcula o atraso do culto inteiro e
-- mostra se a folga antes da âncora absorve o atraso ou se ela vai começar
-- tarde (lib/zion-plan.ts).
--
-- `time` sem fuso, como zion_events.start_time: é hora do relógio da igreja.

alter table public.zion_moments
  add column if not exists hard_start time;

comment on column public.zion_moments.hard_start is
  'Hora de relógio em que o momento tem de começar. Nulo = começa quando o anterior acabar.';
