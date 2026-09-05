'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Moment } from '@/app/page';

// Espelho da linha em zion_live_timer.
type Row = {
  event_id: string;
  moment_id: string | null;
  moment_position: number;
  running: boolean;
  ends_at: string | null;
  remaining_seconds: number;
  updated_at: string;
  updated_by: string;
};

const minutes = (value?: number) => (Number.isFinite(value) && (value as number) > 0 ? (value as number) : 1);

// O cronômetro é do evento, não da aba. Toda tela aberta neste evento lê a mesma
// linha, então duas janelas do mesmo operador — ou dois operadores em máquinas
// diferentes — mostram o mesmo tempo e alimentam a televisão com o mesmo valor.
export function useLiveTimer({ event, moments, can, who, report }: {
  event: string | number;
  moments: Moment[];
  can: boolean;
  who: string;
  report: (text: string) => void;
}) {
  // A linha guardada carrega o evento a que pertence: trocar de evento passa a
  // ser uma leitura diferente, e não um "limpa e recarrega" que pisca na tela.
  const [held, setHeld] = useState<{ event: string; row: Row | null }>({ event: '', row: null });
  const row = held.event === String(event) ? held.row : null;
  // Quanto o relógio DESTE navegador está longe do relógio do banco. Medido uma
  // vez, é o que permite confiar num alvo absoluto (ends_at) sem exigir que a
  // máquina de quem opera esteja com a hora certa.
  const [skew, setSkew] = useState(0);
  const [, redraw] = useState(0);

  useEffect(() => {
    let alive = true;
    if (!event) return;
    const scope = String(event);
    void supabase.rpc('zion_now').then(({ data }) => {
      if (alive && typeof data === 'string') setSkew(Date.parse(data) - Date.now());
    });
    void supabase.from('zion_live_timer').select('*').eq('event_id', event).maybeSingle().then(({ data, error }) => {
      if (!alive) return;
      if (error) report('Falha ao carregar o cronômetro: ' + error.message);
      else setHeld({ event: scope, row: (data as Row) || null });
    });
    const channel = supabase
      .channel(`zion-timer-${scope}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'zion_live_timer', filter: `event_id=eq.${scope}` }, payload => {
        if (alive) setHeld({ event: scope, row: payload.eventType === 'DELETE' ? null : (payload.new as Row) });
      })
      .subscribe();
    return () => { alive = false; void supabase.removeChannel(channel); };
  }, [event, report]);

  // Correndo, a tela precisa se redesenhar sozinha; parado, não há o que animar.
  useEffect(() => {
    if (!row?.running) return;
    const beat = setInterval(() => redraw(n => n + 1), 250);
    return () => clearInterval(beat);
  }, [row?.running]);

  const serverNow = useCallback(() => Date.now() + skew, [skew]);
  // A posição sai do id do momento; a coluna numérica é só o atalho de quando o
  // momento foi apagado. Assim reordenar o cronograma ao vivo não move o culto.
  const byId = row?.moment_id ? moments.findIndex(m => String(m.id) === row.moment_id) : -1;
  const current = Math.min(Math.max(byId >= 0 ? byId : (row?.moment_position ?? 0), 0), Math.max(moments.length - 1, 0));
  const seconds = row
    ? Math.round(row.running && row.ends_at ? (Date.parse(row.ends_at) - serverNow()) / 1000 : row.remaining_seconds)
    : minutes(moments[current]?.duration) * 60;
  const running = !!row?.running;

  const write = useCallback(async (position: number, left: number, next: boolean) => {
    if (!can || !event) return;
    const moment = moments[position];
    const payload = {
      event_id: String(event),
      moment_id: moment ? String(moment.id) : null,
      moment_position: position,
      running: next,
      // Correndo vira alvo absoluto; parado, guarda o que sobrou. Uma aba que
      // dormir ou recarregar volta no lugar certo em vez de continuar contando
      // de onde parou de receber.
      ends_at: next ? new Date(serverNow() + left * 1000).toISOString() : null,
      remaining_seconds: Math.round(left),
      updated_by: who,
    };
    // O botão responde ao clique na hora; o Realtime confirma logo atrás com o
    // mesmo valor, e é ele que leva a mudança às outras telas.
    setHeld(previous => ({ event: String(event), row: { ...(previous.row ?? { updated_at: '' }), ...payload } as Row }));
    const { error } = await supabase.from('zion_live_timer').upsert(payload).select().single();
    if (error) report('Não foi possível mudar o cronômetro: ' + error.message);
  }, [can, event, moments, who, serverNow, report]);

  return {
    current,
    seconds,
    running,
    // Quem deu o último comando, para a equipe não ficar adivinhando de quem foi.
    driver: row?.updated_by || '',
    toggle: () => write(current, seconds, !running),
    goTo: (position: number) => write(position, minutes(moments[position]?.duration) * 60, false),
    stop: () => write(current, 0, false),
  };
}
