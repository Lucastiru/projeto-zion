'use client';
import { useSyncExternalStore } from 'react';
import { Maximize2 } from 'lucide-react';
import { clock, useAwake, useTvState } from '@/lib/zion-tv';

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
  const elapsed = state ? state.duration * 60 - seconds : 0;
  const progress = state?.duration ? Math.min(100, Math.max(0, (elapsed / (state.duration * 60)) * 100)) : 0;
  function fullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen().catch(() => {});
  }
  return (
    <main className={`tv ${over ? 'tv-over' : ''}`}>
      <header className="tv-head">
        <img src="/zion-logo.png" alt="" width="34" height="34" />
        <span className="tv-event">{state?.event || 'ZION CHURCH'}</span>
        <span className={`tv-signal ${live ? 'on' : ''}`}>
          <i />
          {live ? (state?.running ? 'Ao vivo' : 'Pausado') : 'Aguardando o operador'}
        </span>
        <button className="tv-expand" onClick={fullscreen} aria-label="Tela cheia">
          <Maximize2 size={18} />
        </button>
      </header>
      {event && state ? (
        <>
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
