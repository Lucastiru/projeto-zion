'use client';
import { useEffect, useMemo, useState } from 'react';
import { ZionAuth } from '@/components/zion-auth';
import { AccountPanel } from '@/components/zion-account';
import { UsersPanel, SettingsPanel } from '@/components/zion-users';
import { useZionData } from '@/lib/zion-data';
import { downloadSchedulePdf } from '@/lib/zion-pdf';
import { supabase } from '@/lib/supabase';
import { clock, useTvBroadcast, useTvLink } from '@/lib/zion-tv';
import { useLiveTimer } from '@/lib/zion-timer';
import { clockOf, compare, plan, project, warnSeconds, type Planned } from '@/lib/zion-plan';
import type { Session } from '@supabase/supabase-js';
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  FileText,
  GripVertical,
  LayoutList,
  Maximize2,
  MoreHorizontal,
  PanelLeftClose,
  Pause,
  Pencil,
  Play,
  Plus,
  Radio,
  Settings,
  ShieldCheck,
  Trash2,
  Tv,
  Users,
  X,
} from 'lucide-react';

export type Moment = {
  id: string | number;
  title: string;
  duration: number;
  owner: string;
  details: string;
  items?: string[];
  completedItems?: number[];
  // Hora de relógio em que o momento tem de começar (HH:MM). Vazio = começa
  // quando o anterior acabar.
  hardStart?: string;
  done?: boolean;
};
export type Issue = {
  id: string | number;
  time: string;
  type: string;
  description: string;
  status: 'Aberto' | 'Resolvido';
};
export type PrepItem = {
  id: string | number;
  team: string;
  text: string;
  done: boolean;
  assigned?: string;
};
export type ChurchEvent = {
  id: string | number;
  date: string;
  time: string;
  title: string;
  type: string;
  location: string;
  notes?: string;
};
export type Volunteer = {
  id: string | number;
  name: string;
  team: string;
  phone: string;
  email: string;
  scheduled: boolean;
  photo?: string;
  // Link pessoal (/escala?v=) e a resposta dele na escala do evento aberto.
  token?: string;
  status?: 'pendente' | 'confirmado' | 'recusado';
  reason?: string;
  invitedAt?: string | null;
};
// O quarto item é o rótulo curto, usado na barra inferior do celular.
const nav = [
  ['calendar', 'Calendário', CalendarDays, 'Agenda'],
  ['live', 'Operação ao vivo', Radio, 'Ao vivo'],
  ['schedule', 'Cronograma', LayoutList, 'Ordem'],
  ['prep', 'Preparação', CheckCircle2, 'Preparo'],
  ['volunteers', 'Voluntários', Users, 'Equipe'],
  ['issues', 'Problemas', CircleAlert, 'Problemas'],
  ['report', 'Relatório', BarChart3, 'Números'],
] as const;
// Um endereço vindo do formulário só vira link se for http(s): "javascript:..."
// num href é código que roda no clique de quem confia na tela.
function driveLink(value?: string) {
  const address = (value || '').trim();
  if (!address) return '';
  try {
    const parsed = new URL(address);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? address : '';
  } catch { return ''; }
}
function safeDuration(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export default function Home() { return <ZionAuth>{(session,role) => <ZionWorkspace session={session} role={role}/>}</ZionAuth>; }
function ZionWorkspace({session,role}:{session:Session;role:string}) {
  const [selectedEvent,setSelectedEvent] = useState<string | number>('');
  const {events,setEvents,moments,setMoments,prep,setPrep,issues,setIssues,volunteers,setVolunteers,markInvited,reloadRoster,status,loading,report} = useZionData(selectedEvent);
  useEffect(() => { if (!selectedEvent && events.length) setSelectedEvent(events[0].id); },[events,selectedEvent]);
  const [view, setView] = useState('calendar');
  const displayName = session.user.user_metadata?.name || 'Meu perfil';
  // "Meu perfil" é rótulo de menu, não nome de gente: no cronômetro compartilhado
  // quem aparece é quem mexeu, e sem nome cadastrado o e-mail já identifica.
  const myName = String(session.user.user_metadata?.name || session.user.email || '').trim();
  const initials = session.user.user_metadata?.name ? String(session.user.user_metadata.name).trim().split(/\s+/).map(part=>part[0]).slice(0,2).join('').toUpperCase() : 'EU';
  const event = events.find(e=>e.id===selectedEvent);
  const failed = /falha|não foi possível|selecione|use uma/i.test(status);
  // Quem controla o cronômetro é o evento, não esta aba: ver lib/zion-timer.ts.
  const canDrive = role === 'admin' || role === 'manager';
  const { current, seconds, running, driver, toggle, goTo, stop, nudge, stamp, started, now, message, say } = useLiveTimer({
    event: selectedEvent, moments, can: canDrive, who: myName, report,
  });
  const [editing, setEditing] = useState<Moment | null>(null);
  const [prepEditing, setPrepEditing] = useState<PrepItem | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState<ChurchEvent | 'new' | null>(null);
  const [start] = [events.find((e) => e.id === selectedEvent)?.time ?? '19:45'];
  const [moreOpen, setMoreOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [volunteerEditing, setVolunteerEditing] = useState<Volunteer | null>(
    null,
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [liveFullscreen, setLiveFullscreen] = useState(false);
  const [tvOpen, setTvOpen] = useState(false);
  // O roteiro no papel, respeitando hora marcada: ver lib/zion-plan.ts.
  const slots = useMemo(() => moments.map(m => ({ duration: safeDuration(m.duration), hardStart: m.hardStart || undefined })), [moments]);
  const planned = useMemo(() => plan(start, slots), [start, slots]);
  const timings = useMemo(
    () => moments.map((m, i) => ({ ...m, duration: slots[i].duration, time: clockOf(planned[i].start), end: clockOf(planned[i].end), hard: planned[i].hard, overlap: planned[i].overlap })),
    [moments, slots, planned],
  );
  // Extensão do culto no papel, folgas antes de hora marcada incluídas.
  const total = planned.length ? Math.round(planned[planned.length - 1].end - planned[0].start) : 0;
  const prepared = prep.filter((x) => x.done).length;
  const active = timings[current] ?? timings[0];
  const next = timings[current + 1];
  // O roteiro corrigido pelo que já aconteceu. Antes do primeiro comando, e
  // depois que o último momento foi concluído, vale o papel.
  const closed = !!active?.done && current === timings.length - 1;
  const nowMinutes = (() => { const d = new Date(now()); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; })();
  const forecast = started && !closed && timings.length ? project(planned, slots, current, nowMinutes, seconds / 60) : null;
  const offset = forecast ? Math.round(forecast.offset) : 0;
  const pace = !forecast ? `Início ${timings[0]?.time ?? start}` : Math.abs(offset) < 1 ? 'No horário' : offset > 0 ? `${offset} min atrasado` : `${-offset} min adiantado`;
  const finish = forecast ? clockOf(forecast.finish) : timings.at(-1)?.end ?? start;
  const warning = seconds > 0 && !!active && seconds <= warnSeconds(active.duration);
  // O Modo TV é alimentado por esta transmissão: o operador continua sendo o
  // dono do cronômetro e a televisão só repete o que ele fizer. Quem só tem
  // leitura não transmite, para duas telas não disputarem o mesmo canal.
  const tvState = useMemo(
    () => (event && active && canDrive
      ? { event: event.title, title: active.title, owner: active.owner, time: active.time, duration: active.duration, seconds, running, stamp, finish, offset, message }
      : null),
    [event, active, seconds, running, stamp, canDrive, finish, offset, message],
  );
  useTvBroadcast(tvState ? String(selectedEvent) : '', tvState);
  async function saveMoment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const duration = safeDuration(Number(f.get('duration')));
    const isNew = !editing || editing.id === 0;
    const items = String(f.get('items') || '')
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean);
    const data = {
      id: isNew ? crypto.randomUUID() : editing.id,
      title: String(f.get('title')).trim(),
      duration,
      owner: String(f.get('owner')).trim(),
      details: String(f.get('details')).trim(),
      items,
      hardStart: (() => { const v = f.get('hard_start'); return typeof v === 'string' ? v : ''; })(),
    };
    const saved = await setMoments((ms) =>
      isNew
        ? [...ms, data]
        : ms.map((m) => (m.id === data.id ? { ...m, ...data } : m)),
    );
    if (saved) setEditing(null);
  }
  async function savePrep(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const isNew = !prepEditing || prepEditing.id === 0;
    const data = {
      id: isNew ? crypto.randomUUID() : prepEditing.id,
      team: String(f.get('team')).trim(),
      text: String(f.get('text')).trim(),
      assigned: String(f.get('assigned') || ''),
      done: prepEditing?.done ?? false,
    };
    const saved = await setPrep((v) =>
      isNew ? [...v, data] : v.map((x) => (x.id === data.id ? data : x)),
    );
    if (saved) setPrepEditing(null);
  }
  async function saveEvent(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!eventOpen) return;
    const f = new FormData(e.currentTarget);
    const editing = eventOpen === 'new' ? null : eventOpen;
    const notesField = f.get('notes');
    const item = {
      id: editing ? editing.id : crypto.randomUUID(),
      date: String(f.get('date')),
      time: String(f.get('time')),
      title: String(f.get('title')).trim(),
      type: String(f.get('type')),
      location: String(f.get('location')).trim(),
      // f.get devolve string ou File; só a string interessa aqui.
      notes: (typeof notesField === 'string' ? notesField : '').trim(),
    };
    const saved = await setEvents((v) => editing ? v.map(x => x.id === item.id ? item : x) : [...v, item]);
    if (!saved) return;
    const copyField = f.get('copy_from');
    const source = !editing && typeof copyField === 'string' ? copyField : '';
    if (source && !(await copyEvent(source, String(item.id), f.get('copy_prep') === 'on'))) return;
    setSelectedEvent(item.id);
    setEventOpen(null);
  }
  // Toda semana o roteiro é quase o mesmo do culto anterior: copiar e ajustar o
  // que mudou é o caminho, não redigitar nove momentos. Vai linha a linha com
  // select('*') para que coluna nova no momento (hora marcada, por exemplo) já
  // venha junto sem ninguém lembrar de mexer aqui. O que é do dia — concluído,
  // músicas riscadas, checklist feito — nasce zerado.
  async function copyEvent(from: string, to: string, withPrep: boolean) {
    const fresh = (rows: Record<string, unknown>[] | null) =>
      (rows || []).map(({ id: _id, event_id: _event, created_at: _created, ...rest }) => ({ ...rest, event_id: to }));
    const moments = await supabase.from('zion_moments').select('*').eq('event_id', from).order('position');
    if (moments.error) { report('Evento criado, mas o roteiro não foi copiado: ' + moments.error.message); return false; }
    const copied = fresh(moments.data).map(m => ({ ...m, completed: false, completed_item_indexes: [] }));
    if (copied.length) {
      const { error } = await supabase.from('zion_moments').insert(copied);
      if (error) { report('Evento criado, mas o roteiro não foi copiado: ' + error.message); return false; }
    }
    if (withPrep) {
      const prep = await supabase.from('zion_preparation').select('*').eq('event_id', from);
      const items = fresh(prep.data).map(p => ({ ...p, completed: false }));
      const { error } = prep.error ? prep : items.length ? await supabase.from('zion_preparation').insert(items) : { error: null };
      if (error) { report('Roteiro copiado, mas o checklist não: ' + error.message); return false; }
    }
    report(`Roteiro copiado: ${copied.length} momentos.`);
    return true;
  }
  async function saveVolunteer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const file = f.get('photo') as File;
    if (file?.size > 500000 || (file?.size && !['image/jpeg','image/png','image/webp'].includes(file.type))) { report('Use uma foto JPG, PNG ou WebP de até 500 KB.'); return; }
    const photo = file?.size ? await new Promise<string>((resolve,reject) => { const reader = new FileReader(); reader.onload=()=>resolve(String(reader.result)); reader.onerror=reject; reader.readAsDataURL(file); }) : volunteerEditing?.photo;
    const isNew = !volunteerEditing || volunteerEditing.id === 0;
    const item: Volunteer = {
      id: isNew ? crypto.randomUUID() : volunteerEditing.id,
      name: String(f.get('name')).trim(),
      team: String(f.get('team')),
      phone: String(f.get('phone')).trim(),
      email: String(f.get('email')).trim(),
      scheduled: volunteerEditing?.scheduled ?? false,
      photo,
    };
    const saved = await setVolunteers((v) =>
      isNew ? [...v, item] : v.map((x) => (x.id === item.id ? item : x)),
    );
    if (saved) setVolunteerEditing(null);
  }
  async function complete() {
    const saved = await setMoments((ms) =>
      ms.map((m, i) => (i === current ? { ...m, done: true } : m)),
    );
    if (!saved) return;
    if (current < moments.length - 1) goTo(current + 1);
    else { stop(); setView('report'); }
  }
  async function toggleSequenceItem(index: number) {
    if (!active || !canDrive) return;
    await setMoments((ms) => ms.map((moment) => {
      if (moment.id !== active.id) return moment;
      const completed = new Set(moment.completedItems || []);
      if (completed.has(index)) completed.delete(index);
      else completed.add(index);
      return { ...moment, completedItems: [...completed].sort((a, b) => a - b) };
    }));
  }
  async function addIssue(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const saved = await setIssues((v) => [
      {
        id: crypto.randomUUID(),
        time: new Date().toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        type: String(f.get('type')),
        description: String(f.get('description')),
        status: 'Aberto',
      },
      ...v,
    ]);
    if (saved) setIssueOpen(false);
  }
  return (
    <main
      className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${liveFullscreen ? 'live-fullscreen' : ''}`}
    >
      <aside className="sidebar">
        <div className="brand">
          <img src="/zion-logo.png" alt="Zion Church" />
          <span>
            <b>ZION</b>
            <small>CHURCH • ORDEM</small>
          </span>
          <button
            aria-label="Recolher menu"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            <PanelLeftClose size={16} />
          </button>
        </div>
        <nav>
          {nav.map(([id, label, Icon, short]) => (
            <button
              key={id}
              className={`nav-item ${view === id ? 'active' : ''}`}
              onClick={() => setView(id)}
              title={label}
            >
              <Icon size={17} />
              <span className="nav-label">{label}</span>
              <span className="nav-label-short">{short}</span>
              {id === 'issues' && issues.some((i) => i.status === 'Aberto') ? (
                <b className="nav-dot" />
              ) : null}
            </button>
          ))}
          {role==='admin' && <button title="Usuários e acessos" className={`nav-item ${view==='users' ? 'active' : ''}`} onClick={()=>setView('users')}><ShieldCheck size={17}/><span className="nav-label">Usuários e acessos</span><span className="nav-label-short">Acessos</span></button>}
          {role === 'admin' && <button title="Configurações" className={`nav-item ${view==='settings' ? 'active' : ''}`} onClick={()=>setView('settings')}><Settings size={17}/><span className="nav-label">Configurações</span><span className="nav-label-short">Ajustes</span></button>}
        </nav>
        {event && <div className="side-caption">
          <span>EVENTO SELECIONADO</span>
          <strong>{events.find((e) => e.id === selectedEvent)?.title}</strong>
          <small>
            {events.find((e) => e.id === selectedEvent)?.time} •{' '}
            {events
              .find((e) => e.id === selectedEvent)
              ?.date.split('-')
              .reverse()
              .join('/')}
          </small>
        </div>
        }
        <button className="sidebar-footer" onClick={() => setProfileOpen(true)}>
          <div className="avatar">{initials}</div>
          <div>
            <strong>{displayName}</strong>
            <small>{role==='admin' ? 'Administrador' : role==='manager' ? 'Operador' : 'Somente leitura'}</small>
          </div>
          <Settings size={15} />
        </button>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">ZION CHURCH{event && view!=='settings' && view!=='users' ? ' • '+event.type.toUpperCase() : ''}</p>
            <h1>{view==='users' ? 'Usuários e acessos' : view==='settings' ? 'Configurações' : event ? event.title+' • '+event.date.split('-').reverse().join('/') : 'Agenda da igreja'}</h1>
          </div>
          <div className="top-actions">

            {view === 'live' && (
              <button
                className="ghost-btn"
                onClick={() => setLiveFullscreen(!liveFullscreen)}
              >
                <Maximize2 size={14} />{' '}
                {liveFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
              </button>
            )}
            {view === 'live' && event && (
              <button className="ghost-btn" onClick={() => setTvOpen(true)}>
                <Tv size={14} /> Modo TV
              </button>
            )}
            {driveLink(event?.notes) && view!=='settings' && view!=='users' && (
              <a className="notes-chip" href={driveLink(event?.notes)} target="_blank" rel="noopener noreferrer">
                <FileText size={14} /> Recados
              </a>
            )}
            {event && view!=='settings' && view!=='users' && <button className="ghost-btn" onClick={() => setView('schedule')}>Editar cronograma</button>}
            <div className="more-wrap">
              <button
                className="icon-btn"
                aria-label="Mais opções"
                onClick={() => setMoreOpen(!moreOpen)}
              >
                <MoreHorizontal size={19} />
              </button>
              {moreOpen && (
                <div className="more-menu">
                  <button
                    onClick={() => {
                      setView('calendar');
                      setMoreOpen(false);
                    }}
                  >
                    Trocar evento
                  </button>
                  <button
                    onClick={() => {
                      setView('volunteers');
                      setMoreOpen(false);
                    }}
                  >
                    Ver escala do dia
                  </button>
                  <button
                    onClick={() => {
                      setView('report');
                      setMoreOpen(false);
                    }}
                  >
                    Abrir relatório
                  </button>
                  {event && (
                    <button
                      onClick={() => {
                        setEventOpen(event);
                        setMoreOpen(false);
                      }}
                    >
                      Editar evento
                    </button>
                  )}
                  {driveLink(event?.notes) && (
                    <a
                      href={driveLink(event?.notes)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setMoreOpen(false)}
                    >
                      Abrir recados no Drive
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>
        <div className="page-wrap">
          {failed && view!=='settings' && view!=='users' && <p role="alert" className="operation-error">Não foi possível concluir a operação. Verifique sua conexão e tente novamente.{role==='admin' && <button onClick={()=>setView('settings')}>Ver detalhes</button>}</p>}
          {view==='users' && role==='admin' && <UsersPanel role={role} email={session.user.email || ''}/>}
          {view==='settings' && role==='admin' && <SettingsPanel role={role} status={loading ? 'Carregando dados…' : status}/>}

          {view === 'live' && !active && <div className="surface"><h2>Nenhum momento neste evento</h2><button className="primary-solid" onClick={() => setView('schedule')}>Montar cronograma</button></div>}
          {view === 'live' && active && (
            <>
              <div className="content-grid">
                <section className="main-column">
                  <div className="live-card">
                    <div className="live-top">
                      <span className="live-label">
                        <Radio size={14} /> AGORA • {active.time}
                      </span>
                      <span className={`ahead ${offset >= 1 ? 'late' : offset <= -1 ? 'early' : ''}`} title={`Término previsto ${finish}`}>{pace}</span>
                    </div>
                    <div className="live-body">
                      <div>
                        <p>{active.title}</p>
                        <h2>{active.owner}</h2>
                        <span>{active.details}</span>
                        {active.items?.length ? (
                          <ol className="live-sequence live-sequence-checklist">
                            {active.items.map((item, i) => (
                              <li key={`${item}-${i}`} className={active.completedItems?.includes(i) ? 'completed' : ''}>
                                <button
                                  type="button"
                                  onClick={() => toggleSequenceItem(i)}
                                  disabled={!canDrive}
                                  aria-label={`${active.completedItems?.includes(i) ? 'Desmarcar' : 'Marcar'} ${item} como concluída`}
                                  aria-pressed={active.completedItems?.includes(i) || false}
                                >
                                  {active.completedItems?.includes(i) ? <Check size={13} /> : <span>{i + 1}</span>}
                                </button>
                                <span>{item}</span>
                              </li>
                            ))}
                          </ol>
                        ) : null}
                      </div>
                      <div className={`timer ${seconds < 0 ? 'over' : warning ? 'warn' : ''}`}>
                        <strong>{clock(seconds)}</strong>
                        <span>
                          {seconds < 0 ? 'passou do tempo' : `de ${active.duration}:00`}
                        </span>
                        <div className="timer-nudge">
                          <button type="button" onClick={() => nudge(-60)} disabled={!canDrive} title="Tirar um minuto (soltou tarde)">−1 min</button>
                          <button type="button" onClick={() => nudge(60)} disabled={!canDrive} title="Devolver um minuto">+1 min</button>
                        </div>
                      </div>
                    </div>
                    <div className="progress">
                      <i
                        style={{
                          width: `${Math.min(100, Math.max(0, 100 - (seconds / (active.duration * 60)) * 100))}%`,
                        }}
                      />
                    </div>
                    <div className="live-actions">
                      <button
                        className="primary-btn"
                        onClick={toggle}
                        disabled={!canDrive}
                      >
                        {running ? (
                          <Pause size={16} fill="currentColor" />
                        ) : (
                          <Play size={16} fill="currentColor" />
                        )}
                        {running ? 'Pausar' : 'Iniciar cronômetro'}
                      </button>
                      <button className="secondary-btn" onClick={complete} disabled={!canDrive}>
                        Concluir momento
                      </button>
                      <button
                        className="issue-button"
                        onClick={() => setIssueOpen(true)}
                      >
                        <AlertTriangle size={15} /> Registrar problema
                      </button>
                    </div>
                    {canDrive && <StageMessage current={message} send={say} />}
                    {(driver || !canDrive) && (
                      <p className="live-driver">
                        {canDrive
                          ? `Último comando: ${driver}`
                          : `Somente acompanhando${driver ? ` • quem comanda é ${driver}` : ''}`}
                      </p>
                    )}
                  </div>
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">ROTEIRO</p>
                      <h3>Cronograma do culto</h3>
                    </div>
                    <span className={`summary-time ${offset >= 1 ? 'late' : ''}`}>
                      Término previsto {finish}
                      {forecast && Math.abs(offset) >= 1 ? ` (papel: ${timings.at(-1)?.end})` : ''}
                    </span>
                  </div>
                  <div className="schedule-list">
                    {timings.map((item, i) => (
                      <div
                        className={`schedule-row ${item.done ? 'done' : ''} ${i === current ? 'live' : ''}`}
                        key={item.id}
                      >
                        <div className="time">
                          {(() => {
                            const shift = forecast && i > current && !item.done ? Math.round(forecast.expected[i].start - planned[i].start) : 0;
                            return shift ? (
                              <strong className={shift > 0 ? 'late' : 'early'} title={`No papel: ${item.time}`}>
                                {clockOf(forecast!.expected[i].start)}
                              </strong>
                            ) : (
                              <strong>{item.time}</strong>
                            );
                          })()}
                          <span>
                            {item.hard ? '⚓ ' : ''}
                            {item.duration} min
                          </span>
                          {forecast && forecast.expected[i]?.late >= 1 && i > current ? (
                            <em className="anchor-late">marcada {item.hardStart} · +{Math.round(forecast.expected[i].late)} min</em>
                          ) : null}
                        </div>
                        <div className="node">
                          {item.done ? (
                            <Check size={13} />
                          ) : i === current ? (
                            <span />
                          ) : null}
                        </div>
                        <div className="moment">
                          <strong>{item.title}</strong>
                          <span>
                            {item.owner}
                            {item.items?.length
                              ? ` • ${item.items.length} itens na sequência`
                              : ''}
                          </span>
                        </div>
                        <button
                          className="row-btn"
                          onClick={() => goTo(i)}
                          disabled={!canDrive}
                        >
                          <ChevronRight size={17} />
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
                <aside className="right-panel">
                  <div className="next-card">
                    <p className="eyebrow">A SEGUIR • {next?.time}</p>
                    <h3>{next?.title}</h3>
                    <p>{next?.owner}</p>
                    {next?.items?.length ? (
                      <div className="next-sequence">
                        {next.items.map((item, i) => (
                          <span key={item}>
                            {i + 1}. {item}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="mini-check">
                        {prep.slice(0, 3).map((x) => (
                          <span key={x.id} className={!x.done ? 'pending' : ''}>
                            {x.done ? <Check size={14} /> : <i />}
                            {x.text}
                          </span>
                        ))}
                      </div>
                    )}
                    <button onClick={() => setView('prep')}>
                      Ver preparação <ChevronRight size={15} />
                    </button>
                  </div>
                  <div className="attention-card">
                    <div className="attention-icon">
                      <CheckCircle2 size={18} />
                    </div>
                    <div>
                      <strong>
                        {prepared === prep.length
                          ? 'Tudo preparado'
                          : `${prepared} de ${prep.length} itens prontos`}
                      </strong>
                      <p>
                        {prepared === prep.length
                          ? 'A equipe confirmou todos os itens.'
                          : 'Revise os itens pendentes antes do próximo momento.'}
                      </p>
                    </div>
                  </div>
                </aside>
              </div>
            </>
          )}
          {view === 'calendar' && (
            <CalendarView
              events={events}
              selectedEvent={selectedEvent}
              choose={(id) => {
                setSelectedEvent(id);
                setView('live');
              }}
              open={() => setEventOpen('new')}
            />
          )}{' '}
          {view === 'schedule' && (
            <ScheduleView
              event={event}
              timings={timings}
              total={total}
              start={start}
              setEditing={setEditing}
              setMoments={setMoments}
            />
          )}{' '}
          {view === 'prep' && (
            <PrepView
              prep={prep}
              setPrep={setPrep}
              edit={setPrepEditing}
              volunteers={volunteers}
            />
          )}{' '}
          {view === 'volunteers' && (
            <VolunteersView
              volunteers={volunteers}
              setVolunteers={setVolunteers}
              edit={setVolunteerEditing}
              event={event}
              markInvited={markInvited}
              reload={reloadRoster}
            />
          )}{' '}
          {view === 'issues' && (
            <IssuesView
              issues={issues}
              setIssues={setIssues}
              open={() => setIssueOpen(true)}
            />
          )}{' '}
          {view === 'report' && (
            <ReportView
              eventId={selectedEvent}
              moments={moments}
              planned={planned}
              timings={timings}
              issues={issues}
              prepared={prepared}
              prepTotal={prep.length}
            />
          )}
        </div>
      </section>
      {editing !== null && (
        <MomentModal
          moment={editing.id === 0 ? null : editing}
          close={() => setEditing(null)}
          save={saveMoment}
        />
      )}{' '}
      {prepEditing !== null && (
        <PrepModal
          item={prepEditing.id === 0 ? null : prepEditing}
          volunteers={volunteers}
          close={() => setPrepEditing(null)}
          save={savePrep}
        />
      )}{' '}
      {issueOpen && (
        <IssueModal close={() => setIssueOpen(false)} save={addIssue} />
      )}{' '}
      {eventOpen && (
        <EventModal
          close={() => setEventOpen(null)}
          save={saveEvent}
          event={eventOpen === 'new' ? undefined : eventOpen}
          events={events}
        />
      )}{' '}
      {volunteerEditing !== null && (
        <VolunteerModal
          item={volunteerEditing.id === 0 ? null : volunteerEditing}
          close={() => setVolunteerEditing(null)}
          save={saveVolunteer}
        />
      )}{' '}
      {profileOpen && <AccountPanel session={session} role={role} close={() => setProfileOpen(false)} />}{' '}
      {tvOpen && event && <TvModal event={selectedEvent} close={() => setTvOpen(false)} />}
    </main>
  );
}

// Recado para o palco, como no StageTimer: o pregador não ouve o operador, mas
// lê a TV. Os atalhos são os recados de todo culto; o resto se digita.
const STAGE_SHORTCUTS = ['5 minutos', '2 minutos', 'Encerrar', 'Pode estender'];
function StageMessage({ current, send }: { current: string; send: (text: string) => Promise<void> }) {
  const [draft, setDraft] = useState('');
  return (
    <div className="stage-message">
      <div className="stage-message-head">
        <span>Mensagem para o palco</span>
        {current && (
          <button type="button" className="stage-clear" onClick={() => void send('')}>
            Tirar da tela
          </button>
        )}
      </div>
      {current && <p className="stage-current">No palco agora: <b>{current}</b></p>}
      <div className="stage-shortcuts">
        {STAGE_SHORTCUTS.map(text => (
          <button type="button" key={text} onClick={() => void send(text)} className={current === text ? 'active' : ''}>
            {text}
          </button>
        ))}
      </div>
      <form
        className="stage-form"
        onSubmit={e => { e.preventDefault(); if (draft.trim()) { void send(draft); setDraft(''); } }}
      >
        <input value={draft} onChange={e => setDraft(e.target.value)} maxLength={120} placeholder="Escreva um recado curto…" />
        <button type="submit" disabled={!draft.trim()}>Enviar</button>
      </form>
    </div>
  );
}

// O Modo TV entrega um endereço aberto: a televisão não faz login e não lê o
// banco, ela só escuta o cronômetro do operador. É a alternativa a amarrar o
// tempo no ProPresenter — dá para usar um ou outro.
function TvModal({ event, close }: { event: string | number; close: () => void }) {
  const link = useTvLink(event);
  const [copied, setCopied] = useState('');
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied('Link copiado.');
    } catch {
      setCopied('Copie o endereço acima na mão.');
    }
  }
  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">OPERAÇÃO AO VIVO</p>
            <h3>Modo TV</h3>
          </div>
          <button type="button" onClick={close}>
            <X />
          </button>
        </div>
        <p className="tv-modal-text">
          Abra este endereço na televisão. O cronômetro grande acompanha o que
          você fizer aqui: iniciar, pausar e trocar de momento.
        </p>
        <label>
          Endereço da televisão
          <input readOnly value={link} onFocus={e => e.currentTarget.select()} />
        </label>
        <p className="user-note">
          A tela não pede login e mostra só o momento e o tempo. Quem abrir o
          endereço vê o cronômetro, então trate o link como interno da equipe.
        </p>
        {copied && <p role="status" className="tv-modal-text">{copied}</p>}
        <div className="modal-actions">
          <button type="button" className="ghost-btn" onClick={copy}>
            Copiar link
          </button>
          <button
            type="button"
            className="primary-solid"
            onClick={() => window.open(link, '_blank', 'noopener')}
          >
            Abrir a televisão
          </button>
        </div>
      </div>
    </div>
  );
}

function CalendarView({
  events,
  selectedEvent,
  choose,
  open,
}: {
  events: ChurchEvent[];
  selectedEvent: string | number;
  choose: (id: string | number) => void;
  open: () => void;
}) {
  const [month,setMonth] = useState(() => new Date(new Date().getFullYear(),new Date().getMonth(),1));
  const prefix = `${month.getFullYear()}-${String(month.getMonth()+1).padStart(2,'0')}-`;
  const days = [...Array.from({length:(month.getDay()+6)%7},()=>null), ...Array.from({ length: new Date(month.getFullYear(),month.getMonth()+1,0).getDate() }, (_, i) => i + 1)];
  const week = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'];
  // A grade de 7 colunas não cabe num celular. A agenda abaixo mostra os mesmos
  // eventos em lista, e é ela que aparece no lugar da grade em telas estreitas.
  const monthEvents = events
    .filter(e => e.date.startsWith(prefix))
    .sort((a,b) => a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date));
  return (
    <div className="surface calendar-surface">
      <div className="view-head">
        <div>
          <p className="eyebrow">AGENDA DA IGREJA</p>
          <h2>Calendário de eventos</h2>
          <p>
            Escolha um evento para abrir sua operação, preparação e cronograma.
          </p>
        </div>
        <button className="primary-solid" onClick={open}>
          <Plus size={16} /> Novo evento
        </button>
      </div>
      <div className="calendar-toolbar">
        <button aria-label="Mês anterior" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}>
          <ChevronLeft size={17} />
        </button>
        <strong>{month.toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}</strong>
        <button aria-label="Próximo mês" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}>
          <ChevronRight size={17} />
        </button>
        <span>{monthEvents.length} {monthEvents.length === 1 ? 'evento' : 'eventos'}</span>
      </div>
      <div className="calendar-grid">
        {week.map((w) => (
          <div className="weekday" key={w}>
            {w}
          </div>
        ))}
        {days.map((day, i) =>
          day === null ? (
            <div className="calendar-day muted-day" key={`b${i}`} />
          ) : (
            <div
              className={`calendar-day ${prefix + String(day).padStart(2,'0') === new Date().toLocaleDateString('en-CA') ? 'today' : ''}`}
              key={day}
            >
              <span className="day-number">{day}</span>
              <div className="day-events">
                {events
                  .filter((e) => e.date === prefix + String(day).padStart(2,'0'))
                  .map((e) => (
                    <button
                      className={`calendar-event ${e.id === selectedEvent ? 'selected' : ''}`}
                      key={e.id}
                      onClick={() => choose(e.id)}
                    >
                      <strong>{e.time}</strong>
                      <span>{e.title}</span>
                    </button>
                  ))}
              </div>
            </div>
          ),
        )}
      </div>
      <ul className="calendar-agenda">
        {monthEvents.length ? monthEvents.map((e) => (
          <li key={e.id}>
            <button
              className={`agenda-item ${e.id === selectedEvent ? 'selected' : ''}`}
              onClick={() => choose(e.id)}
            >
              <span className="agenda-date">
                <strong>{Number(e.date.slice(8,10))}</strong>
                <small>{new Date(`${e.date}T12:00:00`).toLocaleDateString('pt-BR',{weekday:'short'}).replace('.','')}</small>
              </span>
              <span className="agenda-body">
                <strong>{e.title}</strong>
                <small>{e.time} · {e.type}{e.location ? ` · ${e.location}` : ''}</small>
              </span>
              <ChevronRight size={16} />
            </button>
          </li>
        )) : (
          <li className="agenda-empty">
            Nenhum evento em {month.toLocaleDateString('pt-BR',{month:'long'})}.
          </li>
        )}
      </ul>
      <div className="calendar-hint">
        <CalendarDays size={17} />
        <span>
          <strong>Mais de um evento no mesmo dia?</strong> Cada cartão é
          independente. Clique no evento desejado para abrir o cronograma
          correspondente.
        </span>
      </div>
    </div>
  );
}
function ScheduleView({
  event,
  timings,
  total,
  start,
  setEditing,
  setMoments,
}: {
  event?: ChurchEvent;
  timings: (Moment & { time: string; end: string; hard: boolean; overlap: number })[];
  total: number;
  start: string;
  setEditing: (m: Moment) => void;
  setMoments: React.Dispatch<React.SetStateAction<Moment[]>>;
}) {
  return (
    <div className="surface">
      <div className="view-head">
        <div>
          <p className="eyebrow">PLANEJAMENTO</p>
          <h2>Editor de cronograma</h2>
          <p>
            Organize cada momento. Os horários são recalculados automaticamente.
          </p>
        </div>
        <div className="view-actions">
          <button className="ghost-btn" disabled={!event || !timings.length} onClick={() => event && void downloadSchedulePdf(event, timings, total)}>
            <FileText size={15} /> Baixar PDF
          </button>
          <button className="ghost-btn">
            <FileText size={15} /> Duplicar último culto
          </button>
          <button
            className="primary-solid"
            onClick={() =>
              setEditing({
                id: 0,
                title: '',
                duration: 5,
                owner: '',
                details: '',
              })
            }
          >
            <Plus size={16} /> Novo momento
          </button>
        </div>
      </div>
      <div className="timeline-summary">
        <div>
          <span>Início</span>
          <strong>{start}</strong>
        </div>
        <ChevronRight />
        <div>
          <span>Duração</span>
          <strong>
            {Math.floor(total / 60)}h {total % 60}min
          </strong>
        </div>
        <ChevronRight />
        <div>
          <span>Término previsto</span>
          <strong>{timings.at(-1)?.end ?? start}</strong>
        </div>
        {timings.some(m => m.overlap > 0) ? (
          <span className="valid invalid">
            <AlertTriangle size={14} /> Não cabe antes de uma hora marcada
          </span>
        ) : (
          <span className="valid">
            <Check size={14} /> Cronograma válido
          </span>
        )}
      </div>
      <div className="editor-list">
        {timings.map((m) => (
          <div className="editor-row" key={m.id}>
            <GripVertical size={18} />
            <div className="editor-time">
              <strong>{m.hard ? '⚓ ' : ''}{m.time}</strong>
              <span>até {m.end}</span>
              {m.overlap > 0 && <em className="anchor-late">o anterior passa {m.overlap} min da hora marcada</em>}
            </div>
            <div className="editor-main">
              <strong>{m.title}</strong>
              <span>
                {m.owner} • {m.details}
              </span>
            </div>
            <b>{m.duration} min</b>
            <button onClick={() => setEditing(m)}>
              <Pencil size={15} />
            </button>
            <button
              className="danger-icon"
              onClick={() => setMoments((v) => v.filter((x) => x.id !== m.id))}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
      <button
        className="add-row"
        onClick={() =>
          setEditing({ id: 0, title: '', duration: 5, owner: '', details: '' })
        }
      >
        <Plus size={16} /> Adicionar momento
      </button>
    </div>
  );
}
function PrepView({
  prep,
  setPrep,
  edit,
  volunteers,
}: {
  prep: PrepItem[];
  setPrep: React.Dispatch<React.SetStateAction<PrepItem[]>>;
  edit: (x: PrepItem) => void;
  volunteers: Volunteer[];
}) {
  const groups = [...new Set(prep.map((x) => x.team))];
  const ready = prep.filter((x) => x.done).length;
  return (
    <div className="surface">
      <div className="view-head">
        <div>
          <p className="eyebrow">ANTES DO CULTO</p>
          <h2>Central de preparação</h2>
          <p>Cada tarefa pode ter um voluntário escalado como responsável.</p>
        </div>
        <div className="view-actions">
          <div className="readiness">
            <strong>
              {ready}/{prep.length}
            </strong>
            <span>itens prontos</span>
          </div>
          <button
            className="primary-solid"
            onClick={() =>
              edit({ id: 0, team: 'Palco', text: '', done: false })
            }
          >
            <Plus size={16} /> Novo item
          </button>
        </div>
      </div>
      <div className="readiness-bar">
        <i
          style={{ width: `${prep.length ? (ready / prep.length) * 100 : 0}%` }}
        />
      </div>
      <div className="prep-grid">
        {groups.map((g) => (
          <section className="team-card" key={g}>
            <div className="team-title">
              <div className="team-icon">
                <Users size={16} />
              </div>
              <div>
                <strong>{g}</strong>
                <span>
                  {volunteers
                    .filter((v) => v.team === g && v.scheduled)
                    .map((v) => v.name)
                    .join(', ') || 'Sem voluntário escalado'}
                </span>
              </div>
            </div>
            {prep
              .filter((x) => x.team === g)
              .map((x) => (
                <div
                  className={`check-row ${x.done ? 'checked' : ''}`}
                  key={x.id}
                >
                  <label>
                    <input
                      type="checkbox"
                      checked={x.done}
                      onChange={() =>
                        setPrep((v) =>
                          v.map((i) =>
                            i.id === x.id ? { ...i, done: !i.done } : i,
                          ),
                        )
                      }
                    />
                    <span className="fake-check">
                      {x.done && <Check size={13} />}
                    </span>
                    <span>
                      {x.text}
                      {x.assigned && (
                        <small className="assigned-name">{volunteers.find(v => v.id === x.assigned)?.name || "Responsável indisponível"}</small>
                      )}
                    </span>
                  </label>
                  <button onClick={() => edit(x)}>
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() =>
                      setPrep((v) => v.filter((i) => i.id !== x.id))
                    }
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
          </section>
        ))}
      </div>
    </div>
  );
}
// Telefone do cadastro vira número do wa.me: só dígitos, com 55 na frente
// quando veio só DDD + número. Sem telefone, o WhatsApp abre para escolher o
// contato — o recado vai pronto do mesmo jeito.
function whatsappTo(phone: string, text: string) {
  const digits = phone.replace(/\D/g, '');
  const number = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}
const SEAT_LABEL = { pendente: 'Sem resposta', confirmado: 'Confirmou', recusado: 'Não pode' } as const;
function VolunteersView({
  volunteers,
  setVolunteers,
  edit,
  event,
  markInvited,
  reload,
}: {
  volunteers: Volunteer[];
  setVolunteers: React.Dispatch<React.SetStateAction<Volunteer[]>>;
  edit: (v: Volunteer) => void;
  event?: ChurchEvent;
  markInvited: (id: string | number) => Promise<void>;
  reload: () => void;
}) {
  const teams = [...new Set(volunteers.map((v) => v.team))];
  const scheduled = volunteers.filter(v => v.scheduled);
  // Quem avisou pelo link que não pode servir no dia deste evento.
  const [blocked, setBlocked] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    if (event?.date) void supabase.from('zion_volunteer_blocks').select('volunteer_id').eq('day', event.date).then(({ data }) => {
      if (alive) setBlocked((data || []).map(x => String(x.volunteer_id)));
    });
    return () => { alive = false; };
  }, [event?.date]);
  const [copied, setCopied] = useState('');
  const linkOf = (v: Volunteer) => `${window.location.origin}/escala?v=${v.token}`;
  function invite(v: Volunteer) {
    if (!event) return;
    const first = v.name.trim().split(/\s+/)[0];
    const text = `Oi, ${first}! Você está na escala do ${event.title} em ${event.date.split('-').reverse().slice(0, 2).join('/')} às ${event.time}. Consegue confirmar por aqui? ${linkOf(v)}`;
    window.open(whatsappTo(v.phone, text), '_blank', 'noopener');
    void markInvited(v.id);
  }
  async function copyLink(v: Volunteer) {
    try { await navigator.clipboard.writeText(linkOf(v)); setCopied(String(v.id)); } catch { setCopied(''); }
  }
  return (
    <div className="surface">
      <div className="view-head">
        <div>
          <p className="eyebrow">EQUIPE E ESCALA</p>
          <h2>Voluntários</h2>
          <p>
            Pessoas que servem nos eventos. Este cadastro é independente do acesso ao sistema.
          </p>
        </div>
        <button
          className="primary-solid"
          onClick={() =>
            edit({
              id: 0,
              name: '',
              team: 'Palco',
              phone: '',
              email: '',
              scheduled: false,
            })
          }
        >
          <Plus size={16} /> Cadastrar voluntário
        </button>
      </div>
      <div className="roster-summary">
        <div>
          <strong>{scheduled.length}</strong>
          <span>na escala{event ? ` de ${event.date.split('-').reverse().slice(0, 2).join('/')}` : ''}</span>
        </div>
        {scheduled.length > 0 && (
          <div className="roster-answers">
            <span className="seat confirmado">{scheduled.filter(v => v.status === 'confirmado').length} confirmaram</span>
            <span className="seat pendente">{scheduled.filter(v => v.status === 'pendente').length} sem resposta</span>
            <span className="seat recusado">{scheduled.filter(v => v.status === 'recusado').length} não podem</span>
            <button type="button" className="ghost-btn" onClick={reload}>Atualizar respostas</button>
          </div>
        )}
        <div className="roster-chips">
          {teams.map((t) => (
            <span key={t}>
              {t} •{' '}
              {volunteers.filter((v) => v.team === t && v.scheduled).length}
            </span>
          ))}
        </div>
      </div>
      <div className="volunteer-list">
        {volunteers.map((v) => (
          <div className="volunteer-row" key={v.id}>
            <div className="volunteer-avatar">
              {v.photo ? (
                <img src={v.photo} alt="" />
              ) : (
                v.name
                  .split(' ')
                  .map((x) => x[0])
                  .slice(0, 2)
                  .join('')
              )}
            </div>
            <div>
              <strong>{v.name}</strong>
              <span>
                {v.team} • {v.email}
              </span>
              {blocked.includes(String(v.id)) && <em className="seat-block">Avisou que não pode neste dia</em>}
              {v.scheduled && v.status && (
                <em className={`seat ${v.status}`} title={v.reason || undefined}>
                  {SEAT_LABEL[v.status]}
                  {v.status === 'recusado' && v.reason ? `: ${v.reason}` : ''}
                  {v.status === 'pendente' && v.invitedAt ? ' · convite enviado' : ''}
                </em>
              )}
              {v.scheduled && (
                <span className="seat-actions">
                  <button type="button" onClick={() => invite(v)} disabled={!event}>
                    {v.invitedAt ? 'Lembrar no WhatsApp' : 'Convidar no WhatsApp'}
                  </button>
                  <button type="button" onClick={() => void copyLink(v)}>
                    {copied === String(v.id) ? 'Link copiado' : 'Copiar link'}
                  </button>
                </span>
              )}
            </div>
            <button className="edit-volunteer" onClick={() => edit(v)}>
              <Pencil size={14} /> Editar
            </button>
            <label className="schedule-toggle">
              <input
                type="checkbox"
                checked={v.scheduled}
                onChange={() =>
                  setVolunteers((list) =>
                    list.map((x) =>
                      x.id === v.id ? { ...x, scheduled: !x.scheduled } : x,
                    ),
                  )
                }
              />
              <i />
              {v.scheduled ? 'Escalado' : 'Adicionar à escala'}
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
function IssuesView({
  issues,
  setIssues,
  open,
}: {
  issues: Issue[];
  setIssues: React.Dispatch<React.SetStateAction<Issue[]>>;
  open: () => void;
}) {
  return (
    <div className="surface">
      <div className="view-head">
        <div>
          <p className="eyebrow">ACOMPANHAMENTO</p>
          <h2>Problemas e ocorrências</h2>
          <p>Registre o que aconteceu e acompanhe a resolução.</p>
        </div>
        <button className="primary-solid" onClick={open}>
          <Plus size={16} /> Registrar problema
        </button>
      </div>
      <div className="metrics">
        <div>
          <strong>{issues.length}</strong>
          <span>Total registrado</span>
        </div>
        <div>
          <strong>{issues.filter((x) => x.status === 'Aberto').length}</strong>
          <span>Em aberto</span>
        </div>
        <div>
          <strong>
            {issues.filter((x) => x.status === 'Resolvido').length}
          </strong>
          <span>Resolvidos</span>
        </div>
      </div>
      <div className="issue-list">
        {issues.length === 0 ? (
          <div className="empty">
            <CheckCircle2 />
            <strong>Nenhuma ocorrência</strong>
            <span>Quando algo acontecer, registre aqui.</span>
          </div>
        ) : (
          issues.map((i) => (
            <div className="issue-row" key={i.id}>
              <div className="issue-badge">
                <AlertTriangle size={16} />
              </div>
              <div>
                <span>
                  {i.time} • {i.type}
                </span>
                <strong>{i.description}</strong>
              </div>
              <button
                className={
                  i.status === 'Resolvido' ? 'resolved' : 'open-status'
                }
                onClick={() =>
                  setIssues((v) =>
                    v.map((x) =>
                      x.id === i.id
                        ? {
                            ...x,
                            status:
                              x.status === 'Aberto' ? 'Resolvido' : 'Aberto',
                          }
                        : x,
                    ),
                  )
                }
              >
                {i.status}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
function ReportView({
  eventId,
  moments,
  planned,
  timings,
  issues,
  prepared,
  prepTotal,
}: {
  eventId: string | number;
  moments: Moment[];
  planned: Planned[];
  timings: (Moment & { time: string; end: string })[];
  issues: Issue[];
  prepared: number;
  prepTotal: number;
}) {
  const [feedback,setFeedback] = useState('');
  const [notice,setNotice] = useState('');
  useEffect(() => { let alive=true; setFeedback(''); if(eventId) supabase.from('zion_feedback').select('content').eq('event_id',eventId).maybeSingle().then(({data,error})=>{ if(alive) { if(error) setNotice(error.message); else setFeedback(data?.content || ''); } }); return()=>{alive=false}; },[eventId]);
  // O que aconteceu de verdade: início no primeiro play, fim na conclusão,
  // carimbados pelo banco (zion_moment_runs). Sem registro, sem número.
  const [runs, setRuns] = useState<{ moment_id: string; started_at: string; ended_at: string | null }[]>([]);
  useEffect(() => {
    let alive = true;
    if (eventId) void supabase.from('zion_moment_runs').select('moment_id,started_at,ended_at').eq('event_id', eventId).then(({ data, error }) => {
      if (!alive) return;
      if (error) setNotice('Não foi possível ler os horários reais: ' + error.message);
      else setRuns(data || []);
    });
    return () => { alive = false; };
  }, [eventId]);
  const minuteOf = (iso: string) => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; };
  const real = compare(planned, moments.map(m => {
    const run = runs.find(x => x.moment_id === String(m.id));
    return run ? { start: minuteOf(run.started_at), end: run.ended_at ? minuteOf(run.ended_at) : null } : undefined;
  }));
  const signed = (n: number | null) => (n === null ? '—' : Math.abs(Math.round(n)) < 1 ? 'no tempo' : `${n > 0 ? '+' : '−'}${Math.abs(Math.round(n))} min`);
  const verdict = real.startDelta === null
    ? 'Sem registro'
    : real.endDelta === null
      ? `Começou ${signed(real.startDelta) === 'no tempo' ? 'no horário' : signed(real.startDelta)}`
      : Math.abs(real.endDelta) < 1 ? 'Terminou no horário' : real.endDelta > 0 ? `Terminou ${Math.round(real.endDelta)} min atrasado` : `Terminou ${Math.round(-real.endDelta)} min adiantado`;
  function exportCsv() {
    const header = ['Momento', 'Responsável', 'Início no papel', 'Início real', 'Diferença no início', 'Duração no papel (min)', 'Duração real (min)', 'Diferença na duração'];
    const lines = moments.map((m, i) => {
      const r = real.rows[i];
      return [m.title, m.owner, clockOf(r.plannedStart), r.realStart === null ? '' : clockOf(r.realStart), signed(r.startDelta), r.plannedDuration, r.realDuration === null ? '' : Math.round(r.realDuration), signed(r.durationDelta)];
    });
    const csv = [header, ...lines].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
    link.download = 'relatorio-culto.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  }
  async function saveFeedback(){ if(!eventId)return; const {error}=await supabase.from('zion_feedback').upsert({event_id:eventId,content:feedback,updated_at:new Date().toISOString()}).select().single(); setNotice(error ? 'Não foi possível salvar: '+error.message : 'Feedback salvo.'); }
  return (
    <div className="surface">
      <div className="view-head">
        <div>
          <p className="eyebrow">PÓS-CULTO</p>
          <h2>Relatório da operação</h2>
          <p>Resumo automático para a liderança.</p>
        </div>
        <button className="primary-solid" onClick={exportCsv} disabled={!moments.length}>
          <FileText size={16} /> Baixar planilha (CSV)
        </button>
      </div>
      <div className="report-hero">
        <div>
          <span>Pontualidade</span>
          <strong>{verdict}</strong>
          <small>
            No papel: {timings[0]?.time ?? '—'} → {timings.at(-1)?.end ?? '—'}
            {real.startDelta !== null ? ` • Início real ${signed(real.startDelta)}` : ''}
          </small>
        </div>
        <div className="score">
          {real.measured ? (
            <>
              {real.onTime}
              <small>/{real.measured} no tempo</small>
            </>
          ) : (
            <small>sem medição</small>
          )}
        </div>
      </div>
      <div className="report-table-scroll">
        <table className="report-table">
          <thead>
            <tr><th>Momento</th><th>Papel</th><th>Real</th><th>Início</th><th>Duração</th></tr>
          </thead>
          <tbody>
            {moments.map((m, i) => {
              const r = real.rows[i];
              const tone = (n: number | null) => (n === null || Math.abs(n) < 1 ? '' : n > 0 ? 'late' : 'early');
              return (
                <tr key={m.id}>
                  <td><strong>{m.title}</strong><small>{m.owner}</small></td>
                  <td>{clockOf(r.plannedStart)} · {r.plannedDuration} min</td>
                  <td>{r.realStart === null ? <em>não rodou</em> : `${clockOf(r.realStart)} · ${r.realDuration === null ? 'sem conclusão' : `${Math.round(r.realDuration)} min`}`}</td>
                  <td className={tone(r.startDelta)}>{signed(r.startDelta)}</td>
                  <td className={tone(r.durationDelta)}>{signed(r.durationDelta)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="metrics four">
        <div>
          <strong>
            {moments.filter((x) => x.done).length}/{moments.length}
          </strong>
          <span>Momentos concluídos</span>
        </div>
        <div>
          <strong>
            {prepared}/{prepTotal}
          </strong>
          <span>Preparação</span>
        </div>
        <div>
          <strong>{issues.length}</strong>
          <span>Ocorrências</span>
        </div>
        <div>
          <strong>{issues.filter((x) => x.status === 'Aberto').length}</strong>
          <span>Pendências</span>
        </div>
      </div>
      <section className="feedback-box">
        <p className="eyebrow">FEEDBACK DO MANAGER</p>
        <textarea value={feedback} onChange={e=>setFeedback(e.target.value)} placeholder="Conte para a liderança o que funcionou bem, o que precisa melhorar e quais decisões devem ser tomadas no próximo culto..." />
        <button className="primary-solid" onClick={saveFeedback}>Salvar feedback</button><p role="status">{notice}</p>
      </section>
    </div>
  );
}
function MomentModal({
  moment,
  close,
  save,
}: {
  moment: Moment | null;
  close: () => void;
  save: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={save}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">CRONOGRAMA</p>
            <h3>{moment ? 'Editar momento' : 'Novo momento'}</h3>
          </div>
          <button type="button" onClick={close}>
            <X />
          </button>
        </div>
        <label>
          Nome do momento
          <input name="title" required defaultValue={moment?.title} />
        </label>
        <div className="form-grid">
          <label>
            Duração (min)
            <input
              name="duration"
              type="number"
              min="1"
              required
              defaultValue={moment?.duration ?? 5}
            />
          </label>
          <label>
            Responsável
            <input name="owner" required defaultValue={moment?.owner} />
          </label>
        </div>
        <label>
          Hora marcada{' '}
          <small className="field-help">
            Opcional. Só para o que tem de começar no relógio — a Palavra, uma
            transmissão. O atraso antes dela é absorvido pela folga, se houver.
          </small>
          <input name="hard_start" type="time" defaultValue={moment?.hardStart} />
        </label>
        <label>
          Orientações para a equipe
          <textarea name="details" defaultValue={moment?.details} />
        </label>
        <label>
          Sequência do momento{' '}
          <small className="field-help">
            Um louvor, aviso ou item por linha
          </small>
          <textarea
            name="items"
            className="sequence-input"
            defaultValue={moment?.items?.join('\n')}
            placeholder={
              'Ex.:\nGratidão — João\nPai Nosso — Hellen\nOração final'
            }
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="ghost-btn" onClick={close}>
            Cancelar
          </button>
          <button className="primary-solid">Salvar momento</button>
        </div>
      </form>
    </div>
  );
}
function PrepModal({
  item,
  volunteers,
  close,
  save,
}: {
  item: PrepItem | null;
  volunteers: Volunteer[];
  close: () => void;
  save: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={save}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">PREPARAÇÃO</p>
            <h3>{item ? 'Editar item' : 'Novo item'}</h3>
          </div>
          <button type="button" onClick={close}>
            <X />
          </button>
        </div>
        <label>
          Equipe
          <select name="team" defaultValue={item?.team ?? 'Palco'}>
            <option>Palco</option>
            <option>Mídia</option>
            <option>Som</option>
            <option>Pessoas</option>
            <option>Recepção</option>
            <option>Iluminação</option>
            <option>Louvor</option>
          </select>
        </label>
        <label>
          O que precisa ser preparado?
          <input
            name="text"
            required
            defaultValue={item?.text}
            placeholder="Ex.: Testar microfone do pregador"
          />
        </label>
        <label>
          Voluntário responsável
          <select name="assigned" defaultValue={item?.assigned ?? ''}>
            <option value="">Ainda não definido</option>
            {volunteers
              .filter((v) => v.scheduled)
              .map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
          </select>
        </label>
        <div className="modal-actions">
          <button type="button" className="ghost-btn" onClick={close}>
            Cancelar
          </button>
          <button className="primary-solid">Salvar item</button>
        </div>
      </form>
    </div>
  );
}
function EventModal({
  close,
  save,
  event,
  events,
}: {
  close: () => void;
  save: (e: React.FormEvent<HTMLFormElement>) => void;
  event?: ChurchEvent;
  events: ChurchEvent[];
}) {
  // O mais recente vem primeiro e já selecionado: é quase sempre o culto da
  // semana passada, que é de onde se quer partir.
  const sources = [...events].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={save}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">CALENDÁRIO</p>
            <h3>{event ? 'Editar evento' : 'Novo evento'}</h3>
          </div>
          <button type="button" onClick={close}>
            <X />
          </button>
        </div>
        <label>
          Nome do evento
          <input name="title" required placeholder="Ex.: Culto Ekletos" defaultValue={event?.title} />
        </label>
        <div className="form-grid event-fields">
          <label>
            Data
            <input name="date" type="date" required defaultValue={event?.date ?? new Date().toLocaleDateString('en-CA')} />
          </label>
          <label>
            Horário
            <input name="time" type="time" required defaultValue={event?.time ?? '19:45'} />
          </label>
        </div>
        <div className="form-grid">
          <label>
            Tipo
            <select name="type" defaultValue={event?.type}>
              <option>Culto</option>
              <option>Conferência</option>
              <option>Reunião</option>
              <option>Ensaio</option>
              <option>Outro</option>
            </select>
          </label>
          <label>
            Local
            <input name="location" defaultValue={event?.location ?? 'Auditório principal'} />
          </label>
        </div>
        <label>
          Recados no Drive{' '}
          <small className="field-help">
            Cole o endereço da pasta ou do documento. Quem abrir usa a própria
            conta Google — a permissão continua sendo do Drive.
          </small>
          <input
            name="notes"
            type="url"
            inputMode="url"
            placeholder="https://drive.google.com/..."
            pattern="https?://.+"
            defaultValue={event?.notes}
          />
        </label>
        {!event && sources.length > 0 && (
          <div className="copy-source">
            <label>
              Começar a partir de
              <select name="copy_from" defaultValue={String(sources[0].id)}>
                <option value="">Roteiro em branco</option>
                {sources.map(s => (
                  <option key={s.id} value={String(s.id)}>
                    {s.title} • {s.date.split('-').reverse().join('/')}
                  </option>
                ))}
              </select>
            </label>
            <label className="copy-check">
              <input type="checkbox" name="copy_prep" defaultChecked /> Copiar também o checklist de preparação
            </label>
            <small className="field-help">Copia momentos, durações, responsáveis e sequência. Depois é só ajustar o que mudou.</small>
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="ghost-btn" onClick={close}>
            Cancelar
          </button>
          <button className="primary-solid">{event ? 'Salvar evento' : 'Criar evento'}</button>
        </div>
      </form>
    </div>
  );
}
function VolunteerModal({
  item,
  close,
  save,
}: {
  item: Volunteer | null;
  close: () => void;
  save: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={save}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">VOLUNTÁRIO</p>
            <h3>{item ? 'Editar voluntário' : 'Cadastrar voluntário'}</h3>
          </div>
          <button type="button" onClick={close}>
            <X />
          </button>
        </div>
        <label className="photo-upload">
          <Camera size={18} />
          <span>
            {item?.photo ? 'Trocar foto de perfil' : 'Adicionar foto de perfil'}
          </span>
          <input name="photo" type="file" accept="image/*" />
        </label>
        <label>
          Nome completo
          <input
            name="name"
            required
            defaultValue={item?.name}
            placeholder="Nome do voluntário"
          />
        </label>
        <label>
          E-mail de contato
          <input
            name="email"
            type="email"
            required
            defaultValue={item?.email}
            placeholder="nome@zion.church"
          />
        </label>
        <div className="form-grid">
          <label>
            Time
            <select name="team" defaultValue={item?.team ?? 'Palco'}>
              <option>Palco</option>
              <option>Mídia</option>
              <option>Som</option>
              <option>Louvor</option>
              <option>Recepção</option>
              <option>Iluminação</option>
              <option>Manager</option>
            </select>
          </label>
          <label>
            Telefone
            <input
              name="phone"
              defaultValue={item?.phone}
              placeholder="(11) 99999-9999"
            />
          </label>
        </div>
        <p className="user-note">
          O cadastro do voluntário não libera o login. O administrador gerencia o login em Usuários e acessos, separadamente.
        </p>
        <div className="modal-actions">
          <button type="button" className="ghost-btn" onClick={close}>
            Cancelar
          </button>
          <button className="primary-solid">Salvar voluntário</button>
        </div>
      </form>
    </div>
  );
}
function IssueModal({
  close,
  save,
}: {
  close: () => void;
  save: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={save}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">OCORRÊNCIA</p>
            <h3>Registrar problema</h3>
          </div>
          <button type="button" onClick={close}>
            <X />
          </button>
        </div>
        <label>
          Área
          <select name="type">
            <option>Palco</option>
            <option>Mídia</option>
            <option>Som</option>
            <option>Pessoas</option>
            <option>Horário</option>
            <option>Outro</option>
          </select>
        </label>
        <label>
          O que aconteceu?
          <textarea
            name="description"
            required
            placeholder="Descreva de forma objetiva..."
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="ghost-btn" onClick={close}>
            Cancelar
          </button>
          <button className="primary-solid">Registrar ocorrência</button>
        </div>
      </form>
    </div>
  );
}
