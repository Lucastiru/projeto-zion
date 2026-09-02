'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import type { Moment, Issue, PrepItem, ChurchEvent, Volunteer } from '@/app/page';

type Row = Record<string, any>;
type Update<T> = T[] | ((previous: T[]) => T[]);
type Codec<T> = { read: (row: Row) => T; write: (item: T, index: number) => Row };
const eventsCodec: Codec<ChurchEvent> = {
  read: r => ({ id:r.id, title:r.title, date:r.event_date, time:r.start_time.slice(0,5), type:r.event_type, location:r.location }),
  write: r => ({ id:r.id, title:r.title, event_date:r.date, start_time:r.time, event_type:r.type, location:r.location }),
};
const momentsCodec: Codec<Moment> = {
  read: r => ({ id:r.id, title:r.title, duration:r.duration_minutes, owner:r.owner_name, details:r.details, items:r.sequence_items, done:r.completed }),
  write: (r,i) => ({ id:r.id, title:r.title, duration_minutes:r.duration, owner_name:r.owner, details:r.details, sequence_items:r.items || [], completed:!!r.done, position:i }),
};
const prepCodec: Codec<PrepItem> = {
  read: r => ({ id:r.id, team:r.team, text:r.description, assigned:r.assigned_to || '', done:r.completed }),
  write: r => ({ id:r.id, team:r.team, description:r.text, assigned_to:r.assigned || null, completed:r.done }),
};
const issuesCodec: Codec<Issue> = {
  read: r => ({ id:r.id, time:new Date(r.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}), type:r.area, description:r.description, status:r.resolved ? 'Resolvido' : 'Aberto' }),
  write: r => ({ id:r.id, area:r.type, description:r.description, resolved:r.status === 'Resolvido' }),
};
const volunteersCodec: Codec<Volunteer> = {
  read: r => ({ id:r.id, name:r.name, email:r.email, team:r.team, phone:r.phone, photo:r.photo_url || undefined, scheduled:false }),
  write: r => ({ id:r.id, name:r.name, email:r.email.trim().toLowerCase(), team:r.team, phone:r.phone, photo_url:r.photo || null }),
};

// Mutations only send changed columns; updates to other rows are never overwritten.
function useRows<T extends {id: string | number}>(table: string, codec: Codec<T>, event: string | number | undefined, report: (text: string) => void) {
  const [rows, render] = useState<T[]>([]);
  const current = useRef<T[]>([]);
  const scope = useRef(event); scope.current = event;
  const queue = useRef(Promise.resolve());
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true; current.current = []; render([]); setLoading(true);
    if (event === '') { setLoading(false); return; }
    let query = supabase.from(table).select('*');
    if (event !== undefined) query = query.eq('event_id',event);
    if (table === 'zion_moments') query = query.order('position');
    query.then(({ data, error }) => {
      if (!alive) return;
      setLoading(false);
      if (error) { report('Falha ao carregar: ' + error.message); return; }
      current.current = (data || []).map(codec.read); render(current.current);
    });
    return () => { alive = false; };
  }, [table, event, codec, report]);
  const change = async (update: Update<T>): Promise<boolean> => {
    const target = event;
    let success = false;
    const task = async () => {
      if (scope.current !== target || loading) return;
      if (target === '') { report('Selecione ou crie um evento antes de salvar.'); return; }
      const before = current.current;
      const after = typeof update === 'function' ? update(before) : update;
      report('Salvando…');
      try {
        for (const [index,item] of after.entries()) {
          const previousIndex = before.findIndex(x => x.id === item.id);
          const previous = before[previousIndex];
          const payload = { ...codec.write(item,index), ...(target === undefined ? {} : {event_id:target}) };
          if (!previous) {
            const {error} = await supabase.from(table).insert(payload).select().single(); if (error) throw error;
          } else {
            const old = codec.write(previous,previousIndex);
            const delta = Object.fromEntries(Object.entries(payload).filter(([key,value]) => key !== 'id' && key !== 'event_id' && JSON.stringify(value) !== JSON.stringify(old[key])));
            if (Object.keys(delta).length) {
              const {error} = await supabase.from(table).update(delta).eq('id',item.id).select().single(); if (error) throw error;
            }
          }
        }
        for (const item of before.filter(x => !after.some(y => x.id === y.id))) {
          const {error} = await supabase.from(table).delete().eq('id',item.id).select().single(); if (error) throw error;
        }
        if (scope.current === target) { current.current = after; render(after); }
        report('Salvo no Supabase'); success = true;
      } catch (error) {
        report('Não foi possível salvar. Reabra a tela antes de tentar novamente. ' + (error instanceof Error ? error.message : (error as Row)?.message || 'Verifique sua conexão e permissão.'));
      }
    };
    queue.current = queue.current.then(task,task); await queue.current;
    return success;
  };
  return { rows, change, loading };
}

export function useZionData(event: string | number) {
  const [status,setStatus] = useState('Conectado ao Supabase');
  const eventRef = useRef(event); eventRef.current = event;
  const report = useCallback((text: string) => setStatus(text),[]);
  const events = useRows('zion_events',eventsCodec,undefined,report);
  const volunteers = useRows('zion_volunteers',volunteersCodec,undefined,report);
  const moments = useRows('zion_moments',momentsCodec,event,report);
  const prep = useRows('zion_preparation',prepCodec,event,report);
  const issues = useRows('zion_issues',issuesCodec,event,report);
  const [roster,setRoster] = useState<string[]>([]);
  const [rosterLoading,setRosterLoading] = useState(false);
  useEffect(() => {
    let alive = true; setRoster([]); setRosterLoading(!!event);
    if (event) supabase.from('zion_roster').select('volunteer_id').eq('event_id',event).then(({data,error}) => {
      if (!alive) return;
      setRosterLoading(false);
      if (error) report('Falha ao carregar escala: ' + error.message);
      else setRoster((data || []).map(x => x.volunteer_id));
    });
    return () => { alive = false; };
  },[event,report]);
  const visibleVolunteers = volunteers.rows.map(v => ({...v,scheduled:roster.includes(String(v.id))}));
  async function setVolunteers(update: Update<Volunteer>) {
    const next = typeof update === 'function' ? update(visibleVolunteers) : update;
    if (!(await volunteers.change(next))) return false;
    for (const volunteer of next) {
      if (volunteer.scheduled === roster.includes(String(volunteer.id))) continue;
      if (!event || rosterLoading) { report('Selecione um evento antes de alterar a escala.'); return false; }
      const result = volunteer.scheduled
        ? await supabase.from('zion_roster').upsert({event_id:event,volunteer_id:volunteer.id})
        : await supabase.from('zion_roster').delete().eq('event_id',event).eq('volunteer_id',volunteer.id).select().single();
      if (result.error) { report('Não foi possível salvar a escala: ' + result.error.message); return false; }
    }
    if (eventRef.current === event) setRoster(next.filter(x => x.scheduled).map(x => String(x.id))); return true;
  }
  return { events:events.rows,setEvents:events.change,volunteers:visibleVolunteers,setVolunteers,
    moments:moments.rows,setMoments:moments.change,prep:prep.rows,setPrep:prep.change,issues:issues.rows,setIssues:issues.change,
    status,report,loading:events.loading || volunteers.loading || moments.loading || prep.loading || issues.loading || rosterLoading };
}
