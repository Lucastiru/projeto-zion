'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import type { Moment, Issue, PrepItem, ChurchEvent, Volunteer, Ministry, ServiceTemplate } from '@/app/page';

type Row = Record<string, any>;
type Update<T> = T[] | ((previous: T[]) => T[]);
type Codec<T> = { read: (row: Row) => T; write: (item: T, index: number) => Row };
const offlineTables = new Set(['zion_events', 'zion_moments']);
function offlineKey(table: string, event: string | number | undefined) {
  return `zion:offline:${table}:${event ?? 'all'}`;
}
function readOffline<T>(table: string, event: string | number | undefined): T[] {
  if (!offlineTables.has(table)) return [];
  try { return JSON.parse(localStorage.getItem(offlineKey(table, event)) || '[]') as T[]; }
  catch { return []; }
}
function writeOffline<T>(table: string, event: string | number | undefined, rows: T[]) {
  if (!offlineTables.has(table)) return;
  try { localStorage.setItem(offlineKey(table, event), JSON.stringify(rows)); } catch {}
}
const eventsCodec: Codec<ChurchEvent> = {
  read: r => ({ id:r.id, title:r.title, date:r.event_date, time:r.start_time.slice(0,5), type:r.event_type, location:r.location, notes:r.notes_url || '', ministryId:r.ministry_id || '', publicToken:r.public_token || '' }),
  write: r => ({ id:r.id, title:r.title, event_date:r.date, start_time:r.time, event_type:r.type, location:r.location, notes_url:r.notes?.trim() || null, ministry_id:r.ministryId || null }),
};
const ministriesCodec: Codec<Ministry> = {
  read: r => ({ id:r.id, name:r.name, color:r.color, logo:r.logo_url || '' }),
  write: r => ({ id:r.id, name:r.name.trim(), color:r.color, logo_url:r.logo || null }),
};
const momentsCodec: Codec<Moment> = {
  read: r => ({ id:r.id, title:r.title, duration:r.duration_minutes, owner:r.owner_name, details:r.details, items:r.sequence_items, completedItems:r.completed_item_indexes || [], hardStart:r.hard_start ? String(r.hard_start).slice(0,5) : '', itemType:r.item_type || 'momento', itemColor:r.item_color || '#2f6b57', attachments:r.attachments || [], teamNotes:r.team_notes || [], done:r.completed }),
  write: (r,i) => ({ id:r.id, title:r.title, duration_minutes:r.duration, owner_name:r.owner, details:r.details, sequence_items:r.items || [], completed_item_indexes:r.completedItems || [], hard_start:r.hardStart || null, item_type:r.itemType || 'momento', item_color:r.itemColor || '#2f6b57', attachments:r.attachments || [], team_notes:r.teamNotes || [], completed:!!r.done, position:i }),
};
const templatesCodec: Codec<ServiceTemplate> = {
  read: r => ({ id:r.id,name:r.name,eventType:r.event_type,ministryId:r.ministry_id || '',moments:r.moments || [],preparation:r.preparation || [] }),
  write: r => ({ id:r.id,name:r.name.trim(),event_type:r.eventType,ministry_id:r.ministryId || null,moments:r.moments,preparation:r.preparation }),
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
  read: r => ({ id:r.id, name:r.name, email:r.email, team:r.team, phone:r.phone, photo:r.photo_url || undefined, token:r.portal_token, scheduled:false }),
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
      if (error) {
        const cached = readOffline<T>(table, event);
        if (!navigator.onLine && cached.length) {
          current.current = cached; render(cached);
          report('Sem internet — mostrando o último cronograma salvo neste aparelho.');
        } else report('Falha ao carregar: ' + error.message);
        return;
      }
      current.current = (data || []).map(codec.read); render(current.current);
      writeOffline(table, event, current.current);
    });
    return () => { alive = false; };
  }, [table, event, codec, report]);
  // Mudanças feitas por outro operador aparecem sem recarregar a página. Para
  // a lista de músicas, isto mantém celular, computador e cabine na mesma etapa.
  useEffect(() => {
    if (event === '' || event === undefined) return;
    const channel = supabase
      .channel(`zion-rows-${table}-${event}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter: `event_id=eq.${event}` }, payload => {
        const updated = codec.read(payload.new as Row);
        current.current = current.current.map(item => item.id === updated.id ? updated : item);
        render(current.current);
        writeOffline(table, event, current.current);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [table, event, codec]);
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
        if (scope.current === target) { current.current = after; render(after); writeOffline(table, target, after); }
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
  const ministries = useRows('zion_ministries',ministriesCodec,undefined,report);
  const templates = useRows('zion_service_templates',templatesCodec,undefined,report);
  const moments = useRows('zion_moments',momentsCodec,event,report);
  const prep = useRows('zion_preparation',prepCodec,event,report);
  const issues = useRows('zion_issues',issuesCodec,event,report);
  // A escala traz a resposta de cada um: quem confirmou, quem recusou e por
  // quê, e se o convite já saiu. `reload` busca de novo — o voluntário responde
  // pelo link dele, fora desta tela.
  type Seat = { volunteer_id: string; status: 'pendente' | 'confirmado' | 'recusado'; decline_reason: string; invited_at: string | null };
  const [seats,setSeats] = useState<Seat[]>([]);
  const roster = seats.map(x => x.volunteer_id);
  const setRoster = (ids: string[]) => setSeats(previous => ids.map(id => previous.find(x => x.volunteer_id === id) ?? { volunteer_id: id, status: 'pendente', decline_reason: '', invited_at: null }));
  const [rosterLoading,setRosterLoading] = useState(false);
  const [rosterVersion,setRosterVersion] = useState(0);
  useEffect(() => {
    let alive = true; setSeats([]); setRosterLoading(!!event);
    if (event) supabase.from('zion_roster').select('volunteer_id,status,decline_reason,invited_at').eq('event_id',event).then(({data,error}) => {
      if (!alive) return;
      setRosterLoading(false);
      if (error) report('Falha ao carregar escala: ' + error.message);
      else setSeats((data || []) as Seat[]);
    });
    return () => { alive = false; };
  },[event,report,rosterVersion]);
  const visibleVolunteers = volunteers.rows.map(v => {
    const seat = seats.find(x => x.volunteer_id === String(v.id));
    return { ...v, scheduled: !!seat, status: seat?.status, reason: seat?.decline_reason || '', invitedAt: seat?.invited_at || null };
  });
  // Carimba que o convite saiu: o líder vê quem já foi chamado e quem falta.
  async function markInvited(volunteerId: string | number) {
    if (!event) return;
    const at = new Date().toISOString();
    const { error } = await supabase.from('zion_roster').update({ invited_at: at }).eq('event_id', event).eq('volunteer_id', volunteerId);
    if (error) report('Convite aberto, mas não ficou registrado: ' + error.message);
    else setSeats(previous => previous.map(x => (x.volunteer_id === String(volunteerId) ? { ...x, invited_at: at } : x)));
  }
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
  return { events:events.rows,setEvents:events.change,ministries:ministries.rows,setMinistries:ministries.change,templates:templates.rows,setTemplates:templates.change,volunteers:visibleVolunteers,setVolunteers,markInvited,reloadRoster:() => setRosterVersion(n => n + 1),
    moments:moments.rows,setMoments:moments.change,prep:prep.rows,setPrep:prep.change,issues:issues.rows,setIssues:issues.change,
    status,report,loading:events.loading || volunteers.loading || moments.loading || prep.loading || issues.loading || rosterLoading };
}
