'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';

type Seat = { event_id: string; title: string; date: string; time: string; location: string; status: 'pendente' | 'confirmado' | 'recusado'; reason: string; ministry_id: string | null };
type Mark = { name: string; color: string; logo: string | null };
// `ministries` vem uma vez, num mapa à parte das escalas: logo repetido em
// cada escala pesaria no celular de quem abre pelo WhatsApp.
type Portal = { name: string; team: string; schedule: Seat[]; ministries?: Record<string, Mark>; blocks: string[] };

// Data do banco (AAAA-MM-DD) por extenso, ao meio-dia para o fuso não puxar o
// dia para trás.
const longDate = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
const today = () => new Date().toLocaleDateString('en-CA');

export default function VolunteerPortal() {
  // O link pessoal é a credencial (ver a migration da escala com aceite): não
  // há login, e cada chamada ao banco leva o token e só alcança as linhas dele.
  const search = useSyncExternalStore(() => () => {}, () => window.location.search, () => '');
  const token = new URLSearchParams(search).get('v') || '';
  const [portal, setPortal] = useState<Portal | null>(null);
  const [state, setState] = useState<'carregando' | 'pronto' | 'invalido'>('carregando');
  const [notice, setNotice] = useState('');
  const [declining, setDeclining] = useState('');
  const [reason, setReason] = useState('');
  const [day, setDay] = useState('');
  // Cada resposta salva incrementa a versão e a tela relê do banco: o que
  // aparece é sempre o que ficou gravado, não o que se achou que gravou.
  const [version, setVersion] = useState(0);
  const load = () => setVersion(n => n + 1);
  useEffect(() => {
    let alive = true;
    if (token) void supabase.rpc('zion_portal', { p_token: token }).then(({ data, error }) => {
      if (!alive) return;
      if (error || !data) { setState('invalido'); return; }
      setPortal(data as Portal);
      setState('pronto');
    });
    return () => { alive = false; };
  }, [token, version]);

  async function answer(seat: Seat, status: 'confirmado' | 'recusado') {
    setNotice('');
    const { error } = await supabase.rpc('zion_portal_respond', { p_token: token, p_event: seat.event_id, p_status: status, p_reason: status === 'recusado' ? reason : '' });
    if (error) { setNotice('Não deu para salvar: ' + error.message); return; }
    setDeclining(''); setReason('');
    setNotice(status === 'confirmado' ? 'Confirmado. Obrigado por servir!' : 'Tudo bem — avisamos a liderança.');
    load();
  }
  async function block(target: string, blocked: boolean) {
    setNotice('');
    const { error } = await supabase.rpc('zion_portal_block', { p_token: token, p_day: target, p_blocked: blocked });
    if (error) { setNotice('Não deu para salvar: ' + error.message); return; }
    setDay('');
    load();
  }

  if (!token || state === 'invalido') {
    return (
      <main className="portal">
        <header className="portal-head"><img src="/zion-logo.png" alt="" width="40" height="40" /><b>ZION CHURCH</b></header>
        <section className="portal-card"><h1>Link não encontrado</h1><p>Peça para a liderança mandar o seu link de novo.</p></section>
      </main>
    );
  }
  if (!portal) return <main className="portal"><p className="portal-loading">Carregando sua escala…</p></main>;
  const upcoming = portal.schedule.filter(s => s.date >= today());
  return (
    <main className="portal">
      <header className="portal-head"><img src="/zion-logo.png" alt="" width="40" height="40" /><b>ZION CHURCH</b></header>
      <section className="portal-hello">
        <h1>Olá, {portal.name.trim().split(/\s+/)[0]}!</h1>
        <p>{portal.team}</p>
      </section>
      {notice && <output className="portal-notice">{notice}</output>}

      <section className="portal-card">
        <h2>Suas escalas</h2>
        {!upcoming.length && <p className="portal-empty">Nenhuma escala marcada por enquanto.</p>}
        {upcoming.map(seat => (
          <article key={seat.event_id} className={`portal-seat ${seat.status}`}>
            <div>
              {(() => {
                const mark = seat.ministry_id ? portal.ministries?.[seat.ministry_id] : undefined;
                return mark ? (
                  <em className="portal-ministry" style={{ background: mark.color }}>
                    {mark.logo && <img src={mark.logo} alt="" />}
                    {mark.name}
                  </em>
                ) : null;
              })()}
              <strong>{seat.title}</strong>
              <span>{longDate(seat.date)} · {seat.time}{seat.location ? ` · ${seat.location}` : ''}</span>
            </div>
            {seat.status !== 'pendente' && (
              <p className="portal-status">
                {seat.status === 'confirmado' ? '✓ Você confirmou' : `Você avisou que não pode${seat.reason ? `: ${seat.reason}` : ''}`}
              </p>
            )}
            {declining === seat.event_id ? (
              <div className="portal-decline">
                <input value={reason} onChange={e => setReason(e.target.value)} maxLength={200} placeholder="Quer contar o motivo? (opcional)" />
                <div className="portal-actions">
                  <button type="button" className="portal-no" onClick={() => void answer(seat, 'recusado')}>Enviar</button>
                  <button type="button" className="portal-ghost" onClick={() => setDeclining('')}>Voltar</button>
                </div>
              </div>
            ) : (
              <div className="portal-actions">
                {seat.status !== 'confirmado' && <button type="button" className="portal-yes" onClick={() => void answer(seat, 'confirmado')}>Confirmo</button>}
                {seat.status !== 'recusado' && <button type="button" className="portal-no" onClick={() => { setDeclining(seat.event_id); setReason(''); }}>Não posso</button>}
              </div>
            )}
          </article>
        ))}
      </section>

      <section className="portal-card">
        <h2>Dias em que não posso servir</h2>
        <p className="portal-help">Marque aqui viagens e compromissos. A liderança vê antes de montar a escala.</p>
        <form className="portal-block" onSubmit={e => { e.preventDefault(); if (day) void block(day, true); }}>
          <input type="date" min={today()} value={day} onChange={e => setDay(e.target.value)} />
          <button type="submit" disabled={!day}>Marcar</button>
        </form>
        {portal.blocks.map(b => (
          <div key={b} className="portal-blocked">
            <span>{longDate(b)}</span>
            <button type="button" onClick={() => void block(b, false)}>Remover</button>
          </div>
        ))}
      </section>
    </main>
  );
}
