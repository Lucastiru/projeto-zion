'use client';
import { useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';

export function AccountPanel({session,role,close}:{session:Session;role:string;close:()=>void}) {
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  async function saveProfile(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault();setBusy(true);setMessage('');const fields=new FormData(e.currentTarget);
    const first_name=String(fields.get('first_name')).trim(),last_name=String(fields.get('last_name')).trim();
    if(!first_name || !last_name){setMessage('Preencha seu nome e sobrenome.');setBusy(false);return;}
    const {error}=await supabase.auth.updateUser({data:{first_name,last_name,name:first_name+' '+last_name}});
    setBusy(false);setMessage(error ? 'Não foi possível salvar seu perfil. Tente novamente.' : 'Perfil atualizado.');
  }
  return <Dialog open onOpenChange={open=>{if(!open&&!busy)close();}}><DialogContent className="access-dialog" showCloseButton={!busy}>
    <DialogTitle>Meu perfil</DialogTitle><DialogDescription>{session.user.email}</DialogDescription>
    <span className={'access-role '+role}>{role==='admin' ? 'Administrador' : role==='manager' ? 'Operador' : 'Somente leitura'}</span>
    <form onSubmit={saveProfile}><div className="form-grid"><label>Nome<Input name="first_name" required maxLength={60} autoComplete="given-name" defaultValue={session.user.user_metadata?.first_name || ''}/></label><label>Sobrenome<Input name="last_name" required maxLength={80} autoComplete="family-name" defaultValue={session.user.user_metadata?.last_name || ''}/></label></div><Button type="submit" className="primary-solid" disabled={busy}>{busy ? 'Salvando…' : 'Salvar perfil'}</Button></form>
    <p role="status">{message}</p><Button className="ghost-btn" disabled={busy} onClick={()=>supabase.auth.signOut()}>Sair da conta</Button>
  </DialogContent></Dialog>;
}
