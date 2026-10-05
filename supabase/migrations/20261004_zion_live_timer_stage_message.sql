-- Mensagem do operador para o palco.
--
-- Mora na mesma linha do cronômetro porque tem o mesmo dono e o mesmo caminho:
-- toda aba do operador lê pelo Realtime, e a televisão recebe pelo canal de
-- transmissão junto com o tempo. Uma TV que liga no meio do culto já pega a
-- mensagem que está no palco, em vez de só as que chegarem depois.
--
-- Vazio = nada no palco. O limite é de tela, não de banco: mais que isso não
-- se lê de longe.

alter table public.zion_live_timer
  add column if not exists stage_message text not null default '',
  add column if not exists stage_message_at timestamptz;

alter table public.zion_live_timer
  drop constraint if exists zion_live_timer_stage_message_check;
alter table public.zion_live_timer
  add constraint zion_live_timer_stage_message_check
  check (char_length(stage_message) <= 120);

comment on column public.zion_live_timer.stage_message is
  'Texto que o operador manda para a tela do palco. Vazio = sem mensagem.';
