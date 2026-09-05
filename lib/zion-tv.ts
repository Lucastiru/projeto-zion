'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

// O pacote que o operador transmite para as telas em Modo TV. A televisão não
// lê o banco: tudo que ela mostra chega aqui dentro, então ela abre sem login e
// sem depender de RLS.
export type TvState = {
  event: string;
  title: string;
  owner: string;
  time: string;
  duration: number; // minutos previstos para o momento
  seconds: number; // quanto falta; negativo quando o momento estourou
  running: boolean;
};

const channelFor = (event: string) => `zion-tv-${event}`;
// Pulso de reforço: uma TV ligada no meio do culto se acerta sozinha, e o
// relógio dela volta a bater com o do operador a cada três segundos.
const HEARTBEAT = 3000;
// Sem notícia por mais que isso, a TV assume que perdeu o operador.
const SILENCE = 12000;

// Lado do operador. Publica a cada mudança de momento ou de play/pause, repete
// no pulso e responde ao "oi" de quem acabou de abrir a televisão.
export function useTvBroadcast(event: string, state: TvState | null) {
  const channel = useRef<RealtimeChannel | null>(null);
  const latest = useRef(state);
  useEffect(() => { latest.current = state; });
  useEffect(() => {
    if (!event) return;
    const live = supabase.channel(channelFor(event));
    const send = () => { if (latest.current) void live.send({ type: 'broadcast', event: 'state', payload: latest.current }); };
    live.on('broadcast', { event: 'hello' }, send).subscribe(status => { if (status === 'SUBSCRIBED') send(); });
    channel.current = live;
    const beat = setInterval(send, HEARTBEAT);
    return () => { clearInterval(beat); channel.current = null; void supabase.removeChannel(live); };
  }, [event]);
  // Com o cronômetro correndo os segundos mudam sozinhos e quem conta é a TV;
  // zerar o campo aqui evita uma mensagem por segundo sem perder o aviso de
  // pausa, retomada ou troca de momento.
  const signature = JSON.stringify(state && { ...state, seconds: state.running ? 0 : state.seconds });
  useEffect(() => {
    if (latest.current) void channel.current?.send({ type: 'broadcast', event: 'state', payload: latest.current });
  }, [signature]);
}

// Lado da televisão. O desconto do tempo usa o relógio DESTA tela a partir da
// hora em que o pacote chegou, então diferença de horário entre os aparelhos
// não desalinha o cronômetro.
export function useTvState(event: string) {
  const [state, setState] = useState<TvState | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [live, setLive] = useState(false);
  const mark = useRef(0);
  useEffect(() => {
    if (!event) return;
    const channel = supabase.channel(channelFor(event));
    channel
      .on('broadcast', { event: 'state' }, ({ payload }) => {
        const next = payload as TvState;
        mark.current = Date.now();
        setState(next); setSeconds(next.seconds); setLive(true);
      })
      .subscribe(status => { if (status === 'SUBSCRIBED') void channel.send({ type: 'broadcast', event: 'hello', payload: {} }); });
    return () => { void supabase.removeChannel(channel); };
  }, [event]);
  useEffect(() => {
    const tick = () => {
      if (!state) return;
      const since = (Date.now() - mark.current) / 1000;
      setSeconds(state.running ? Math.round(state.seconds - since) : state.seconds);
      setLive(since * 1000 < SILENCE);
    };
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [state]);
  return { state, seconds, live };
}

// Minuto e segundo com sinal: depois do zero o cronômetro segue contando o
// atraso, que é o que o palco precisa enxergar.
export function clock(seconds: number) {
  // O sinal sai do valor já arredondado: -0,4s vira 00:00, e não "-00:00".
  const whole = Math.round(seconds);
  const total = Math.abs(whole);
  return `${whole < 0 ? '-' : ''}${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// Mantém a televisão acesa enquanto a tela estiver aberta. Nem todo navegador
// tem a API, e o pedido cai sozinho quando a aba sai de vista.
export function useAwake() {
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const request = async () => {
      const api = (navigator as Navigator & { wakeLock?: { request: (kind: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock;
      if (!api || document.visibilityState !== 'visible') return;
      try { lock = await api.request('screen'); } catch { lock = null; }
    };
    void request();
    document.addEventListener('visibilitychange', request);
    return () => { document.removeEventListener('visibilitychange', request); void lock?.release().catch(() => {}); };
  }, []);
}

// O endereço que o operador entrega para a televisão.
export function useTvLink(event: string | number) {
  return useMemo(() => (typeof window === 'undefined' ? '' : `${window.location.origin}/tv?e=${encodeURIComponent(String(event))}`), [event]);
}
