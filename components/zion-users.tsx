'use client';
import { useEffect, useState } from 'react';
import { ShieldCheck, Search, Plus, Pencil, UserRound, Ban, Copy } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';

type Access = {email:string;role:'admin'|'manager'|'volunteer';created_at:string};
export const roleLabel = {admin:'Administrador',manager:'Operador',volunteer:'Somente leitura'};
const descriptions = {admin:'Gerencia acessos e todas as áreas do sistema.',manager:'Edita eventos, cronogramas, escalas e ocorrências.',volunteer:'Consulta os dados, sem permissão de edição.'};

export function UsersPanel({email,role}:{email:string;role:string}) {
  const [rows,setRows] = useState<Access[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [search,setSearch] = useState('');
  const [filter,setFilter] = useState('all');
  const [editing,setEditing] = useState<Access | 'new' | null>(null);
  const [revoking,setRevoking] = useState<Access | null>(null);
  const [busy,setBusy] = useState(false);
  const [formError,setFormError] = useState('');
  async function load() {
    if(role!=='admin')return;
    setLoading(true);setError('');
    const {data,error}=await supabase.from('zion_access').select('email,role,created_at').order('created_at');
    setLoading(false);
    if(error)setError('Não foi possível carregar os acessos. Tente novamente.');
    else setRows(data as Access[]);
  }
  useEffect(()=>{void load();},[role]);
  async function save(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault();if(role!=='admin' || !editing || busy)return;
    setBusy(true);setFormError('');
    const f=new FormData(e.currentTarget);
    const target=editing==='new' ? String(f.get('email')).trim().toLowerCase() : editing.email;
    const permission=String(f.get('role'));
    if(target===email.toLowerCase()){setFormError('Sua própria permissão não pode ser alterada aqui.');setBusy(false);return;}
    const result=editing==='new'
      ? await supabase.from('zion_access').insert({email:target,role:permission}).select().single()
      : await supabase.from('zion_access').update({role:permission}).eq('email',target).select().single();
    setBusy(false);
    if(result.error){setFormError(result.error.code==='23505' ? 'Este e-mail já tem acesso. Edite a permissão na lista.' : 'Não foi possível salvar. Confira sua conexão e permissão.');return;}
    setRows(list=>[...list.filter(x=>x.email!==target),result.data as Access]);
    setNotice(editing==='new' ? 'Acesso autorizado. Compartilhe o endereço do sistema com a pessoa.' : 'Permissão atualizada.');setEditing(null);
  }
  async function revoke() {
    if(!revoking || role!=='admin' || revoking.email===email.toLowerCase() || busy)return;
    setBusy(true);setFormError('');
    const {error}=await supabase.from('zion_access').delete().eq('email',revoking.email).select().single();
    setBusy(false);
    if(error){setFormError('Não foi possível revogar o acesso. Tente novamente.');return;}
    setRows(list=>list.filter(x=>x.email!==revoking.email));setRevoking(null);setNotice('Acesso revogado. O cadastro e a escala de voluntários não foram alterados.');
  }
  if(role!=='admin')return null;
  const filtered=rows.filter(x=>x.email.includes(search.trim().toLowerCase()) && (filter==='all' || x.role===filter));
  return <section className="access-page">
    <div className="view-head"><div><p className="eyebrow">ADMINISTRAÇÃO</p><h2>Usuários e acessos</h2><p>Defina quem pode entrar e o que cada pessoa pode fazer.</p></div><Button className="primary-solid" onClick={()=>{setEditing('new');setFormError('');}}><Plus size={16}/>Autorizar usuário</Button></div>
    <div className="access-summary"><ShieldCheck size={22}/><div><strong>Acesso ao sistema, separado da escala</strong><p>Cadastrar um voluntário não cria uma conta. Autorizar um usuário não o adiciona à escala.</p></div><span>{loading ? '…' : rows.length} autorizados</span></div>
    <div className="access-table-card">
      <div className="access-toolbar"><label className="access-search"><Search size={16}/><Input aria-label="Buscar usuário por e-mail" placeholder="Buscar por e-mail" value={search} onChange={e=>setSearch(e.target.value)}/></label><select aria-label="Filtrar por permissão" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Todas as permissões</option>{Object.entries(roleLabel).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></div>
      {loading ? <p className="access-empty" role="status">Carregando usuários…</p> : error ? <div className="access-empty" role="alert"><p>{error}</p><Button className="ghost-btn" onClick={load}>Tentar novamente</Button></div> : <div className="access-table-scroll"><table><thead><tr><th>Usuário</th><th>Permissão</th><th>Autorizado em</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>{filtered.map(item=><tr key={item.email}><td><div className="access-person"><span className="access-avatar"><UserRound size={18}/></span><div><strong>{item.email}</strong><small>{item.email===email.toLowerCase() ? 'Você' : 'Acesso autorizado'}</small></div></div></td><td><span className={`access-role ${item.role}`}>{roleLabel[item.role]}</span></td><td>{new Date(item.created_at).toLocaleDateString('pt-BR')}</td><td><div className="access-actions"><Button className="ghost-btn" disabled={item.email===email.toLowerCase()} aria-label={`Editar permissão de ${item.email}`} onClick={()=>{setEditing(item);setFormError('');}}><Pencil size={14}/>Editar</Button><Button className="revoke-btn" disabled={item.email===email.toLowerCase()} aria-label={`Revogar acesso de ${item.email}`} onClick={()=>{setRevoking(item);setFormError('');}}><Ban size={14}/></Button></div></td></tr>)}</tbody></table>{!filtered.length && <p className="access-empty">Nenhum usuário encontrado.</p>}</div>}
    </div>
    {notice && <p role="status" className="access-notice">{notice}</p>}
    <div className="access-permissions">{Object.entries(roleLabel).map(([key,label])=><article key={key}><span className={`access-role ${key}`}>{label}</span><p>{descriptions[key as keyof typeof descriptions]}</p></article>)}</div>
    <div className="access-invite-note"><div><strong>Como a pessoa entra?</strong><p>Após a autorização, compartilhe o endereço do sistema. A pessoa cria sua senha e confirma seu e-mail. O envio de convites e o acompanhamento de aceite ainda não estão disponíveis.</p></div><Button className="ghost-btn" onClick={async()=>{try{await navigator.clipboard.writeText(window.location.origin);setNotice('Endereço do sistema copiado.');}catch{setNotice('Compartilhe o endereço exibido no navegador.');}}}><Copy size={14}/>Copiar endereço</Button></div>
    <Dialog open={editing!==null} onOpenChange={open=>{if(!open&&!busy)setEditing(null);}}><DialogContent className="access-dialog" showCloseButton={!busy}><DialogTitle>{editing==='new' ? 'Autorizar usuário' : 'Editar permissão'}</DialogTitle><DialogDescription>Esta autorização é exclusiva para acesso ao sistema.</DialogDescription><form onSubmit={save}><label>E-mail<Input name="email" type="email" required disabled={editing!=='new'} defaultValue={editing && editing!=='new' ? editing.email : ''}/></label><label>Permissão<select name="role" defaultValue={editing && editing!=='new' ? editing.role : 'volunteer'}>{Object.entries(roleLabel).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label><p role="alert">{formError}</p><div className="access-actions"><Button type="button" className="ghost-btn" disabled={busy} onClick={()=>setEditing(null)}>Cancelar</Button><Button type="submit" className="primary-solid" disabled={busy}>{busy ? 'Salvando…' : 'Salvar acesso'}</Button></div></form></DialogContent></Dialog>
    <Dialog open={!!revoking} onOpenChange={open=>{if(!open&&!busy)setRevoking(null);}}><DialogContent className="access-dialog" showCloseButton={!busy}><DialogTitle>Revogar acesso?</DialogTitle><DialogDescription>{revoking?.email} perderá a autorização para consultar e alterar os dados. Isso não exclui sua conta nem seu cadastro de voluntário. Você poderá autorizar o e-mail novamente.</DialogDescription><p role="alert">{formError}</p><div className="access-actions"><Button className="ghost-btn" disabled={busy} onClick={()=>setRevoking(null)}>Cancelar</Button><Button className="danger-solid" disabled={busy} onClick={revoke}>{busy ? 'Revogando…' : 'Revogar acesso'}</Button></div></DialogContent></Dialog>
  </section>;
}

export function SettingsPanel({role,status}:{role:string;status:string}) {
  if(role!=='admin')return null;
  return <section className="access-page"><div className="view-head"><div><p className="eyebrow">ADMINISTRAÇÃO</p><h2>Configurações</h2><p>Integrações e informações técnicas do sistema.</p></div></div><div className="access-permissions settings-cards"><article><span className="eyebrow">E-MAILS</span><h3>Remetente de testes</h3><p>As confirmações de cadastro continuam com o remetente padrão do Supabase. Nenhuma configuração de envio foi alterada.</p><span className="access-role">Ambiente de testes</span></article><article><span className="eyebrow">DADOS</span><h3>Conexão com Supabase</h3><details><summary>Ver diagnóstico técnico</summary><p role="status">{status}</p><Button className="ghost-btn" onClick={()=>window.location.reload()}>Atualizar dados</Button></details></article></div></section>;
}
