'use client';
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function AccountPanel({session,role,close}:{session:Session;role:string;close:()=>void}) {
  const [access,setAccess] = useState<{email:string;role:string}[]>([]);
  const [message,setMessage] = useState('');
  const [busy,setBusy] = useState(false);
  useEffect(() => { if(role==='admin') supabase.from('zion_access').select('email,role').then(({data,error})=>{if(error)setMessage(error.message);else setAccess(data || [])}); },[role]);
  async function authorize(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault();const form=e.currentTarget;const fields=new FormData(form);setBusy(true);
    const row={email:String(fields.get('email')).trim().toLowerCase(),role:String(fields.get('role'))};
    if (row.email === session.user.email?.toLowerCase()) { setMessage('Não altere sua própria permissão de administrador.'); setBusy(false); return; }
    const {error}=await supabase.from('zion_access').upsert(row).select().single();setBusy(false);
    if(error){setMessage(error.message);return;}
    setAccess(list=>[...list.filter(x=>x.email!==row.email),row]);setMessage('E-mail autorizado. A pessoa já pode criar sua conta; nenhum convite por e-mail foi enviado.');form.reset();
  }
  return <div className="modal-backdrop"><section className="modal">
    <div className="modal-head"><h3>Minha conta</h3><Button variant="ghost" onClick={close}>Fechar</Button></div>
    <p>{session.user.email}</p><p>Permissão: {role === 'admin' ? 'Administrador' : role === 'manager' ? 'Manager' : 'Voluntário (consulta)'}</p>
    {role==='admin' && <><h3>Acessos da equipe</h3><p>Autorize somente pessoas da sua equipe. Managers podem editar; voluntários podem consultar.</p>
      <ul>{access.map(item=><li key={item.email}>{item.email} — {item.role}</li>)}</ul>
      <form onSubmit={authorize}><label>E-mail<Input name="email" type="email" required /></label>
        <label>Permissão<select name="role"><option value="volunteer">Voluntário — consulta</option><option value="manager">Manager — edição</option></select></label>
        <Button disabled={busy}>Autorizar acesso</Button>
      </form></>}
    <p role="status">{message}</p><Button variant="outline" onClick={()=>supabase.auth.signOut()}>Sair da conta</Button>
  </section></div>;
}
