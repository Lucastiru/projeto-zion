'use client';
import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock3, Download, ExternalLink, MapPin } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { clockOf, plan } from '@/lib/zion-plan';

type PublicPlan={event:{title:string;date:string;time:string;type:string;location:string;ministry:string;color:string;logo?:string};moments:{title:string;duration:number;owner:string;details:string;items:string[];hardStart?:string;type:string;color:string;attachments:{title:string;url:string}[]}[]};
const safe=(value:string)=>{try{const u=new URL(value);return /^https?:$/.test(u.protocol)?value:''}catch{return ''}};
export default function PublicPlanPage(){
  const [data,setData]=useState<PublicPlan|null>(null);const [error,setError]=useState('');
  useEffect(()=>{const token=new URLSearchParams(location.search).get('t');if(!token){setError('Este link está incompleto.');return;}void supabase.rpc('zion_public_plan',{p_token:token}).then(({data,error})=>{if(error||!data)setError('Este plano não está disponível.');else setData(data as PublicPlan);});},[]);
  const rows=useMemo(()=>data?plan(String(data.event.time).slice(0,5),data.moments.map(m=>({duration:m.duration,hardStart:m.hardStart||undefined}))):[],[data]);
  if(error)return <main className="public-plan public-empty"><strong>Plano não encontrado</strong><p>{error}</p></main>;
  if(!data)return <main className="public-plan public-empty"><p>Carregando ordem do culto…</p></main>;
  return <main className="public-plan" style={{'--public-accent':data.event.color||'#19b8ad'} as React.CSSProperties}>
    <header>{data.event.logo&&<img src={data.event.logo} alt=""/>}<div><span>{data.event.ministry}</span><h1>{data.event.title}</h1><p><CalendarDays size={15}/>{new Date(`${data.event.date}T12:00`).toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'})}<Clock3 size={15}/>{String(data.event.time).slice(0,5)}{data.event.location&&<><MapPin size={15}/>{data.event.location}</>}</p></div></header>
    <section className="public-list">{data.moments.map((m,i)=><article key={`${m.title}-${i}`}><div className="public-time"><strong>{clockOf(rows[i].start)}</strong><span>{m.duration} min</span></div><i style={{background:m.color||data.event.color}}/><div><small>{m.type}</small><h2>{m.title}</h2>{m.owner&&<p>{m.owner}</p>}{m.details&&<p>{m.details}</p>}{m.items?.length>0&&<ol>{m.items.map(x=><li key={x}>{x}</li>)}</ol>}{m.attachments?.length>0&&<nav>{m.attachments.filter(x=>safe(x.url)).map(x=><a href={safe(x.url)} target="_blank" rel="noopener noreferrer" key={x.url}><ExternalLink size={13}/>{x.title}</a>)}</nav>}</div></article>)}</section>
    <footer><Download size={14}/> Plano compartilhado somente para leitura</footer>
  </main>;
}
