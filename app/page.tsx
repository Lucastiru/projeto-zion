'use client';
import { useEffect, useMemo, useState } from 'react';
import { ZionAuth } from '@/components/zion-auth';
import { AccountPanel } from '@/components/zion-account';
import { useZionData } from '@/lib/zion-data';
import { supabase } from '@/lib/supabase';
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
  Trash2,
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
};
export type Volunteer = {
  id: string | number;
  name: string;
  team: string;
  phone: string;
  email: string;
  scheduled: boolean;
  photo?: string;
};
const nav = [
  ['calendar', 'Calendário', CalendarDays],
  ['live', 'Operação ao vivo', Radio],
  ['schedule', 'Cronograma', LayoutList],
  ['prep', 'Preparação', CheckCircle2],
  ['volunteers', 'Voluntários', Users],
  ['issues', 'Problemas', CircleAlert],
  ['report', 'Relatório', BarChart3],
] as const;
function safeDuration(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 1;
}
function asTime(start: string, plus: number) {
  const parts = start.split(':').map(Number);
  const h = Number.isFinite(parts[0]) ? parts[0] : 0;
  const m = Number.isFinite(parts[1]) ? parts[1] : 0;
  const total = h * 60 + m + (Number.isFinite(plus) ? plus : 0);
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export default function Home() { return <ZionAuth>{(session,role) => <ZionWorkspace session={session} role={role}/>}</ZionAuth>; }
function ZionWorkspace({session,role}:{session:Session;role:string}) {
  const [selectedEvent,setSelectedEvent] = useState<string | number>('');
  const {events,setEvents,moments,setMoments,prep,setPrep,issues,setIssues,volunteers,setVolunteers,status,loading,report} = useZionData(selectedEvent);
  useEffect(() => { if (!selectedEvent && events.length) setSelectedEvent(events[0].id); },[events,selectedEvent]);
  useEffect(() => { setRunning(false); setCurrent(0); setSeconds(0); },[selectedEvent]);
  const [view, setView] = useState('calendar');
  const displayName = session.user.user_metadata?.name || 'Meu perfil';
  const initials = session.user.user_metadata?.name ? String(session.user.user_metadata.name).trim().split(/\s+/).map(part=>part[0]).slice(0,2).join('').toUpperCase() : 'EU';
  const event = events.find(e=>e.id===selectedEvent);
  const failed = /falha|não foi possível|selecione|use uma/i.test(status);
  const [current, setCurrent] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  useEffect(() => { if (!running) setSeconds((moments[current]?.duration || 0)*60); },[selectedEvent,moments[current]?.id]);
  const [editing, setEditing] = useState<Moment | null>(null);
  const [prepEditing, setPrepEditing] = useState<PrepItem | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [start] = [events.find((e) => e.id === selectedEvent)?.time ?? '19:45'];
  const [moreOpen, setMoreOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [volunteerEditing, setVolunteerEditing] = useState<Volunteer | null>(
    null,
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [liveFullscreen, setLiveFullscreen] = useState(false);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [running]);
  const timings = useMemo(() => {
    let sum = 0;
    return moments.map((m) => {
      const duration = safeDuration(m.duration);
      const time = asTime(start, sum);
      sum += duration;
      return { ...m, duration, time, end: asTime(start, sum) };
    });
  }, [moments, start]);
  const total = moments.reduce((a, m) => a + safeDuration(m.duration), 0);
  const prepared = prep.filter((x) => x.done).length;
  const active = timings[current] ?? timings[0];
  const next = timings[current + 1];
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
    const f = new FormData(e.currentTarget);
    const item = {
      id: crypto.randomUUID(),
      date: String(f.get('date')),
      time: String(f.get('time')),
      title: String(f.get('title')).trim(),
      type: String(f.get('type')),
      location: String(f.get('location')).trim(),
    };
    if (!(await setEvents((v) => [...v, item]))) return;
    setSelectedEvent(item.id);
    setEventOpen(false);
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
    setRunning(false);
    if (current < moments.length - 1) {
      setCurrent(current + 1);
      setSeconds(safeDuration(moments[current + 1].duration) * 60);
    } else {
      setSeconds(0);
      setView('report');
    }
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
          {nav.map(([id, label, Icon]) => (
            <button
              key={id}
              className={`nav-item ${view === id ? 'active' : ''}`}
              onClick={() => setView(id)}
            >
              <Icon size={17} />
              {label}
              {id === 'issues' && issues.some((i) => i.status === 'Aberto') ? (
                <b className="nav-dot" />
              ) : null}
            </button>
          ))}
          {role === 'admin' && <button title="Configurações" className={`nav-item ${view==='settings' ? 'active' : ''}`} onClick={()=>setView('settings')}><Settings size={17}/>Configurações</button>}
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
            <small>{role==='admin' ? 'Administrador' : role==='manager' ? 'Manager' : 'Voluntário'}</small>
          </div>
          <Settings size={15} />
        </button>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">ZION CHURCH{event && view!=='settings' ? ' • '+event.type.toUpperCase() : ''}</p>
            <h1>{view==='settings' ? 'Administração' : event ? event.title+' • '+event.date.split('-').reverse().join('/') : 'Agenda da igreja'}</h1>
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
            {event && view!=='settings' && <button className="ghost-btn" onClick={() => setView('schedule')}>Editar cronograma</button>}
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
                </div>
              )}
            </div>
          </div>
        </header>
        <div className="page-wrap">
          {failed && view!=='settings' && <p role="alert" className="operation-error">Não foi possível concluir a operação. Verifique sua conexão e tente novamente.{role==='admin' && <button onClick={()=>setView('settings')}>Ver detalhes</button>}</p>}
          {view==='settings' && role==='admin' && <AccountPanel settings session={session} role={role} status={loading ? 'Carregando dados…' : status} close={()=>setView('calendar')}/>}

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
                      <span className="ahead">No horário</span>
                    </div>
                    <div className="live-body">
                      <div>
                        <p>{active.title}</p>
                        <h2>{active.owner}</h2>
                        <span>{active.details}</span>
                        {active.items?.length ? (
                          <ol className="live-sequence">
                            {active.items.map((item, i) => (
                              <li key={`${item}-${i}`}>
                                <b>{i + 1}</b>
                                {item}
                              </li>
                            ))}
                          </ol>
                        ) : null}
                      </div>
                      <div className="timer">
                        <strong>
                          {String(Math.floor(seconds / 60)).padStart(2, '0')}:
                          {String(seconds % 60).padStart(2, '0')}
                        </strong>
                        <span>de {active.duration}:00</span>
                      </div>
                    </div>
                    <div className="progress">
                      <i
                        style={{
                          width: `${100 - (seconds / (active.duration * 60)) * 100}%`,
                        }}
                      />
                    </div>
                    <div className="live-actions">
                      <button
                        className="primary-btn"
                        onClick={() => setRunning(!running)}
                      >
                        {running ? (
                          <Pause size={16} fill="currentColor" />
                        ) : (
                          <Play size={16} fill="currentColor" />
                        )}
                        {running ? 'Pausar' : 'Iniciar cronômetro'}
                      </button>
                      <button className="secondary-btn" onClick={complete}>
                        Concluir momento
                      </button>
                      <button
                        className="issue-button"
                        onClick={() => setIssueOpen(true)}
                      >
                        <AlertTriangle size={15} /> Registrar problema
                      </button>
                    </div>
                  </div>
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">ROTEIRO</p>
                      <h3>Cronograma do culto</h3>
                    </div>
                    <span className="summary-time">
                      Término previsto {asTime(start, total)}
                    </span>
                  </div>
                  <div className="schedule-list">
                    {timings.map((item, i) => (
                      <div
                        className={`schedule-row ${item.done ? 'done' : ''} ${i === current ? 'live' : ''}`}
                        key={item.id}
                      >
                        <div className="time">
                          <strong>{item.time}</strong>
                          <span>{item.duration} min</span>
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
                          onClick={() => { setRunning(false); setCurrent(i); setSeconds(item.duration*60); }}
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
              open={() => setEventOpen(true)}
            />
          )}{' '}
          {view === 'schedule' && (
            <ScheduleView
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
        <EventModal close={() => setEventOpen(false)} save={saveEvent} />
      )}{' '}
      {volunteerEditing !== null && (
        <VolunteerModal
          item={volunteerEditing.id === 0 ? null : volunteerEditing}
          close={() => setVolunteerEditing(null)}
          save={saveVolunteer}
        />
      )}{' '}
      {profileOpen && <AccountPanel session={session} role={role} close={() => setProfileOpen(false)} />}
    </main>
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
        <span>{events.length} eventos</span>
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
  timings,
  total,
  start,
  setEditing,
  setMoments,
}: {
  timings: (Moment & { time: string; end: string })[];
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
          <strong>{asTime(start, total)}</strong>
        </div>
        <span className="valid">
          <Check size={14} /> Cronograma válido
        </span>
      </div>
      <div className="editor-list">
        {timings.map((m) => (
          <div className="editor-row" key={m.id}>
            <GripVertical size={18} />
            <div className="editor-time">
              <strong>{m.time}</strong>
              <span>até {m.end}</span>
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
function VolunteersView({
  volunteers,
  setVolunteers,
  edit,
}: {
  volunteers: Volunteer[];
  setVolunteers: React.Dispatch<React.SetStateAction<Volunteer[]>>;
  edit: (v: Volunteer) => void;
}) {
  const teams = [...new Set(volunteers.map((v) => v.team))];
  return (
    <div className="surface">
      <div className="view-head">
        <div>
          <p className="eyebrow">USUÁRIOS E ESCALA</p>
          <h2>Voluntários</h2>
          <p>
            Cada voluntário tem perfil próprio e pode ser selecionado para o
            evento.
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
          <strong>{volunteers.filter((v) => v.scheduled).length}</strong>
          <span>na escala de hoje</span>
        </div>
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
  timings,
  issues,
  prepared,
  prepTotal,
}: {
  eventId: string | number;
  moments: Moment[];
  timings: (Moment & { time: string; end: string })[];
  issues: Issue[];
  prepared: number;
  prepTotal: number;
}) {
  const [feedback,setFeedback] = useState('');
  const [notice,setNotice] = useState('');
  useEffect(() => { let alive=true; setFeedback(''); if(eventId) supabase.from('zion_feedback').select('content').eq('event_id',eventId).maybeSingle().then(({data,error})=>{ if(alive) { if(error) setNotice(error.message); else setFeedback(data?.content || ''); } }); return()=>{alive=false}; },[eventId]);
  async function saveFeedback(){ if(!eventId)return; const {error}=await supabase.from('zion_feedback').upsert({event_id:eventId,content:feedback,updated_at:new Date().toISOString()}).select().single(); setNotice(error ? 'Não foi possível salvar: '+error.message : 'Feedback salvo.'); }
  return (
    <div className="surface">
      <div className="view-head">
        <div>
          <p className="eyebrow">PÓS-CULTO</p>
          <h2>Relatório da operação</h2>
          <p>Resumo automático para a liderança.</p>
        </div>
        <button className="primary-solid">
          <FileText size={16} /> Exportar relatório
        </button>
      </div>
      <div className="report-hero">
        <div>
          <span>Pontualidade</span>
          <strong>No horário</strong>
          <small>Início 19:45 • Término previsto {timings.at(-1)?.end}</small>
        </div>
        <div className="score">
          92<small>/100</small>
        </div>
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
}: {
  close: () => void;
  save: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={save}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">CALENDÁRIO</p>
            <h3>Novo evento</h3>
          </div>
          <button type="button" onClick={close}>
            <X />
          </button>
        </div>
        <label>
          Nome do evento
          <input name="title" required placeholder="Ex.: Culto Ekletos" />
        </label>
        <div className="form-grid event-fields">
          <label>
            Data
            <input name="date" type="date" required defaultValue={new Date().toLocaleDateString('en-CA')} />
          </label>
          <label>
            Horário
            <input name="time" type="time" required defaultValue="19:45" />
          </label>
        </div>
        <div className="form-grid">
          <label>
            Tipo
            <select name="type">
              <option>Culto</option>
              <option>Conferência</option>
              <option>Reunião</option>
              <option>Ensaio</option>
              <option>Outro</option>
            </select>
          </label>
          <label>
            Local
            <input name="location" defaultValue="Auditório principal" />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="ghost-btn" onClick={close}>
            Cancelar
          </button>
          <button className="primary-solid">Criar evento</button>
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
            <p className="eyebrow">USUÁRIO</p>
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
          E-mail de acesso
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
          O cadastro do voluntário não libera o login. O administrador autoriza o e-mail em Configurações → Usuários e acessos.
        </p>
        <div className="modal-actions">
          <button type="button" className="ghost-btn" onClick={close}>
            Cancelar
          </button>
          <button className="primary-solid">Salvar usuário</button>
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
