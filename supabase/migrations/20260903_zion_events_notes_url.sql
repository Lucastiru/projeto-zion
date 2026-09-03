-- Link dos recados do culto (pasta ou documento no Google Drive).
--
-- Guardamos apenas o endereço: nada de OAuth, token ou cópia de arquivo. Quem
-- abre o link usa a própria conta Google, então a permissão continua sendo
-- decidida no Drive, e não aqui.
--
-- A checagem impede que se guarde qualquer coisa que não seja http(s) — sem
-- ela, um endereço javascript: viraria código executável ao ser clicado.

alter table public.zion_events
  add column if not exists notes_url text;

alter table public.zion_events
  drop constraint if exists zion_events_notes_url_check;

alter table public.zion_events
  add constraint zion_events_notes_url_check
  check (notes_url is null or notes_url ~* '^https?://[^[:space:]]+$');

comment on column public.zion_events.notes_url is
  'Endereço dos recados do culto no Drive. Somente http(s).';
