'use client';
import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ZionAuth({ children }: { children: (session: Session, role: string) => ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [signup, setSignup] = useState(false);
  const [areas,setAreas]=useState<{id:string;name:string;color:string}[]>([]);
  const [selectedAreas,setSelectedAreas]=useState<string[]>([]);
  const invite = typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('convite') || '';
  useEffect(() => {
    let alive = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      if (alive) { setSession(next); setLoading(false); }
    });
    supabase.auth.getSession().then(({ data, error }) => {
      if (alive) { setSession(data.session); setLoading(false); if (error) setMessage(error.message); }
    });
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    supabase.rpc('zion_public_areas').then(({data})=>setAreas(data||[]));
  },[]);
  useEffect(() => {
    let alive = true;
    setRole(null);
    if (!session) return;
    const inviteToken=invite || String(session.user.user_metadata?.invite_token || '');
    const accept=inviteToken ? supabase.rpc('zion_accept_invite',{p_token:inviteToken}) : Promise.resolve({data:null,error:null});
    accept.then(({error:inviteError})=>{
      if(inviteError)setMessage('Não foi possível aceitar o convite: '+inviteError.message);
      else if(inviteToken)history.replaceState({},'',location.pathname);
      return supabase.rpc('zion_current_role');
    }).then(({ data, error }) => {
      if (!alive) return;
      if (data) {
        setRole(data);
        try { localStorage.setItem(`zion:offline-role:${session.user.id}`, data); } catch {}
      } else if (error && !navigator.onLine) {
        let cached = '';
        try { cached = localStorage.getItem(`zion:offline-role:${session.user.id}`) || ''; } catch {}
        setRole(cached || 'denied');
        setMessage(cached ? 'Sem internet. Você está vendo a última versão salva neste aparelho.' : 'Conecte-se à internet para verificar seu acesso.');
      } else {
        setRole('denied');
        if (error) setMessage('Não foi possível verificar seu acesso: ' + error.message);
      }
    });
    return () => { alive = false; };
  }, [session?.user.id]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    const form = new FormData(event.currentTarget);
    const credentials = { email: String(form.get('email')).trim().toLowerCase(), password: String(form.get('password')) };
    try {
      const result = signup
        ? await supabase.auth.signUp({ ...credentials, options: { emailRedirectTo: `${window.location.origin}/${invite?`?convite=${encodeURIComponent(invite)}`:''}`, data: { first_name: String(form.get('first_name')).trim(), last_name: String(form.get('last_name')).trim(), name: `${String(form.get('first_name')).trim()} ${String(form.get('last_name')).trim()}`, area_ids:selectedAreas, invite_token:invite||undefined } } })
        : await supabase.auth.signInWithPassword(credentials);
      if (result.error) throw result.error;
      if (signup && !result.data.session) setMessage('Confirme o cadastro pelo e-mail enviado. Depois volte aqui e entre com sua senha.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível entrar. Tente novamente.'); }
    finally { setBusy(false); }
  }
  if (session && role && role !== 'denied') return children(session, role);
  return <main className="auth-screen"><section className="modal auth-card">
    <header className="auth-heading">
      <img src="/zion-logo.png" alt="Zion Church" width="72" height="72" />
      <p className="eyebrow">ZION CHURCH • ORDEM</p>
      <h1>A equipe começa aqui.</h1>
    </header>
    {loading || (session && role === null) ? <p>Verificando seu acesso…</p> : session ? <>
      <p>Cadastro recebido. Seu acesso está aguardando a aprovação de um administrador.</p>
      <Button onClick={() => supabase.auth.signOut()}>Sair e trocar de conta</Button>
    </> : <form onSubmit={submit}>
      {invite&&<p className="invite-banner"><strong>Você recebeu um convite.</strong> Entre com sua conta ou crie uma senha para aceitar.</p>}
      <p>{signup ? 'Crie sua conta. Sem convite, o acesso só será liberado depois da aprovação do administrador.' : 'Entre para organizar os cultos com a sua equipe.'}</p>
      {signup && <div className="form-grid"><label>Nome<Input name="first_name" autoComplete="given-name" required maxLength={60}/></label><label>Sobrenome<Input name="last_name" autoComplete="family-name" required maxLength={80}/></label></div>}
      {signup&&<fieldset className="area-checks signup-areas"><legend>Em quais áreas você serve?</legend>{areas.map(a=><label key={a.id}><input type="checkbox" checked={selectedAreas.includes(a.id)} onChange={e=>setSelectedAreas(v=>e.target.checked?[...v,a.id]:v.filter(id=>id!==a.id))}/><i style={{background:a.color}}/>{a.name}</label>)}</fieldset>}
      <label>E-mail<Input name="email" type="email" autoComplete="email" required /></label>
      <label>Senha<Input name="password" type="password" minLength={8} autoComplete={signup ? 'new-password' : 'current-password'} required /></label>
      <Button type="submit" disabled={busy}>{busy ? 'Aguarde…' : signup ? 'Criar minha conta' : 'Entrar'}</Button>
      <Button type="button" variant="ghost" onClick={() => { setSignup(!signup); setMessage(''); }}>{signup ? 'Já tenho conta' : 'Primeiro acesso? Criar senha'}</Button>
    </form>}
    {message && <p role="status">{message}</p>}
  </section></main>;
}
