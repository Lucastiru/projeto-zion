'use client';
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function AccountPanel({session,role,close,settings=false,status=''}:{session:Session;role:string;close:()=>void;settings?:boolean;status?:string}) {
  const [access,setAccess] = useState<{email:string;role:string}[]>([]);
  const [message,setMessage] = useState('');
  const [busy,setBusy] = useState(false);
  useEffect(() => { if(settings && role==='admin') supabase.from('zion_access').select('email,role').then(({data,error})=>{if(error)setMessage(error.message);else setAccess(data || [])}); },[role,settings]);
  async function saveProfile(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault();setBusy(true);setMessage('');const fields=new FormData(e.currentTarget);
    const first_name=String(fields.get('first_name')).trim(),last_name=String(fields.get('last_name')).trim();
    if(!first_name || !last_name){setMessage('Preencha seu nome e sobrenome.');setBusy(false);return;}
    const {error}=await supabase.auth.updateUser({data:{first_name,last_name,name:`${first_name} ${last_name}`}});
    setBusy(false);setMessage(error ? 'Não foi possível salvar seu perfil. Tente novamente.' : 'Perfil atualizado.');
  }
  async function authorize(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault();const form=e.currentTarget;const fields=new FormData(form);setBusy(true);
    const row={email:String(fields.get('email')).trim().toLowerCase(),role:String(fields.get('role'))};
    if (row.email === session.user.email?.toLowerCase()) { setMessage('Não altere sua própria permissão de administrador.'); setBusy(false); return; }
    const {error}=await supabase.from('zion_access').upsert(row).select().single();setBusy(false);
    if(error){setMessage(error.message);return;}
    setAccess(list=>[...list.filter(x=>x.email!==row.email),row]);setMessage('E-mail autorizado. A pessoa já pode criar sua conta; nenhum convite por e-mail foi enviado.');form.reset();
  }
  if(settings && role!=='admin') return null;
  return <div className={settings ? 'surface settings-surface' : 'modal-backdrop'}><section className={settings ? 'settings-content' : 'modal'}>
    <div className="modal-head"><h3>{settings ? 'Configurações' : 'Meu perfil'}</h3>{!settings && <Button variant="ghost" onClick={close}>Fechar</Button>}</div>
    {!settings && <><p>{session.user.email}</p><p>Permissão: {role === 'admin' ? 'Administrador' : role === 'manager' ? 'Manager' : 'Voluntário (consulta)'}</p>
    <form onSubmit={saveProfile}><div className="form-grid"><label>Nome<Input name="first_name" required maxLength={60} autoComplete="given-name" defaultValue={session.user.user_metadata?.first_name || ''}/></label><label>Sobrenome<Input name="last_name" required maxLength={80} autoComplete="family-name" defaultValue={session.user.user_metadata?.last_name || ''}/></label></div><Button disabled={busy}>Salvar perfil</Button></form></>}
    {settings && role==='admin' && <><h3>Usuários e acessos</h3><p>Autorize somente pessoas da sua equipe. Managers podem editar; voluntários podem consultar.</p>
      <ul>{access.map(item=><li key={item.email}>{item.email} — {item.role}</li>)}</ul>
      <form onSubmit={authorize}><label>E-mail<Input name="email" type="email" required /></label>
        <label>Permissão<select name="role"><option value="volunteer">Voluntário — consulta</option><option value="manager">Manager — edição</option></select></label>
        <Button disabled={busy}>Autorizar acesso</Button>
      </form><section className="settings-diagnostics"><h3>Integração e diagnóstico</h3><p>Banco de dados: Supabase</p><p role="status">{status}</p><Button variant="outline" onClick={()=>window.location.reload()}>Atualizar dados</Button><h3>E-mails de acesso</h3><p>Remetente padrão mantido durante os testes. O envio automático de convites ainda não está configurado; autorizar um e-mail libera o cadastro, mas não envia convite.</p></section></>}
    <p role="status">{message}</p>{!settings && <Button variant="outline" onClick={()=>supabase.auth.signOut()}>Sair da conta</Button>}
  </section></div>;
}
