-- Progresso compartilhado da sequência de músicas dentro de um momento.
-- Os índices apontam para `sequence_items`, preservando o formato atual das
-- músicas e evitando criar uma tabela paralela apenas para uma marcação booleana.
alter table public.zion_moments
  add column if not exists completed_item_indexes integer[] not null default '{}';

alter table public.zion_moments
  drop constraint if exists zion_moments_completed_item_indexes_check;
alter table public.zion_moments
  add constraint zion_moments_completed_item_indexes_check
  check (0 <= all(completed_item_indexes));
