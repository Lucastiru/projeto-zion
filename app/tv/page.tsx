'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Bell, BellOff, Maximize2 } from 'lucide-react';
import { clock, useAwake, useTvState } from '@/lib/zion-tv';
import { warnSeconds } from '@/lib/zion-plan';

export default function TvScreen() {
  // A tela lê o evento do próprio endereço: assim a televisão é só um monitor,
  // sem sessão, sem menu e sem nada para alguém clicar errado no meio do culto.
  // No servidor não existe endereço; useSyncExternalStore devolve vazio lá e o
  // valor real na tela, sem descompasso entre um e outro.
  const search = useSyncExternalStore(() => () => {}, () => window.location.search, () => '');
  const event = new URLSearchParams(search).get('e');
  const { state, seconds, live } = useTvState(event || '');
  useAwake();
  const over = seconds < 0;
  const warn = !over && !!state && seconds <= warnSeconds(state.duration);
  const late = state?.offset ?? 0;
  const message = state?.message || '';
  // Gongo. O navegador só toca som depois de um toque na página, então o sino
  // nasce desligado a cada abertura e o toque nele é o próprio desbloqueio.
  // Não guardamos a escolha de propósito: depois de recarregar, um sino
  // "ligado" que o navegador ainda não liberou ficaria mudo — e enganaria.
  const [sound, setSound] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  function chime(times: number) {
    const ctx = audio.current;
    if (!sound || !ctx) return;
    for (let i = 0; i < times; i++) {
      const at = ctx.currentTime + i * 0.45;
      const tone = ctx.createOscillator();
      const gain = ctx.createGain();
      tone.frequency.value = i % 2 ? 660 : 880;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.4, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);
      tone.connect(gain).connect(ctx.destination);
      tone.start(at);
      tone.stop(at + 0.42);
    }
  }
  function toggleSound() {
    const next = !sound;
    if (next && !audio.current) audio.current = new AudioContext();
    void audio.current?.resume();
    setSound(next);
    if (next) chimeNow(audio.current);
  }
  // Um toque de confirmação ao ligar: quem está ajustando a TV ouve na hora se
  // o som está saindo, em vez de descobrir no meio do culto.
  function chimeNow(ctx: AudioContext | null) {
    if (!ctx) return;
    const tone = ctx.createOscillator();
    const gain = ctx.createGain();
    tone.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
    tone.connect(gain).connect(ctx.destination);
    tone.start();
    tone.stop(ctx.currentTime + 0.32);
  }
  // Um toque ao entrar no amarelo, dois no estouro, um a cada recado novo.
  // Compara com o valor anterior para soar na virada, não a cada segundo.
  const previous = useRef({ warn, over, message });
  useEffect(() => {
    const before = previous.current;
    if (state?.running && warn && !before.warn) chime(1);
    if (state?.running && over && !before.over) chime(2);
    if (message && message !== before.message) chime(1);
    previous.current = { warn, over, message };
  });
  const elapsed = state ? state.duration * 60 - seconds : 0;
  const progress = state?.duration ? Math.min(100, Math.max(0, (elapsed / (state.duration * 60)) * 100)) : 0;
  function fullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen().catch(() => {});
  }
  return (
    <main className={`tv ${over ? 'tv-over' : warn ? 'tv-warn' : ''} ${message ? 'tv-has-message' : ''}`}>
      <header className="tv-head">
        <img src="/zion-logo.png" alt="" width="34" height="34" />
        <span className="tv-event">{state?.event || 'ZION CHURCH'}</span>
        <span className={`tv-signal ${live ? 'on' : ''}`}>
          <i />
          {live ? (state?.running ? 'Ao vivo' : 'Pausado') : 'Aguardando o operador'}
        </span>
        <button className="tv-expand" onClick={toggleSound} aria-label={sound ? 'Desligar som' : 'Ligar som'} title={sound ? 'Som ligado' : 'Som desligado — toque para ligar o gongo'}>
          {sound ? <Bell size={18} /> : <BellOff size={18} />}
        </button>
        <button className="tv-expand" onClick={fullscreen} aria-label="Tela cheia">
          <Maximize2 size={18} />
        </button>
      </header>
      {event && state ? (
        <>
          {message && (
            <output className="tv-message" key={message}>
              {message}
            </output>
          )}
          <div className="tv-now">
            <p>{state.title}</p>
            <span>
              {state.owner}
              {state.owner && state.time ? ' • ' : ''}
              {state.time}
            </span>
          </div>
          <strong className="tv-clock">{clock(seconds)}</strong>
          <span className="tv-scale">{over ? 'passou do tempo' : `de ${String(state.duration).padStart(2, '0')}:00`}</span>
          {state.finish && (
            <span className={`tv-finish ${late >= 1 ? 'late' : ''}`}>
              Término do culto {state.finish}
              {Math.abs(late) >= 1 ? ` · ${late > 0 ? `${late} min atrasado` : `${-late} min adiantado`}` : ''}
            </span>
          )}
          <div className="tv-progress">
            <i style={{ width: `${progress}%` }} />
          </div>
        </>
      ) : (
        <div className="tv-empty">
          <strong>{event ? 'Esperando o cronômetro' : 'Modo TV'}</strong>
          <span>
            {event
              ? 'Assim que o operador abrir a operação ao vivo o tempo aparece aqui.'
              : 'Abra esta tela pelo botão Modo TV, dentro da operação ao vivo.'}
          </span>
        </div>
      )}
    </main>
  );
}
