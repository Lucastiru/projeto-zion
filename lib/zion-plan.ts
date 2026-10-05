// O horário do culto em dois tempos: o planejado (o roteiro no papel) e o
// esperado (o roteiro corrigido pelo que já aconteceu ao vivo). Tudo em minutos
// desde a meia-noite, sem Date, para a conta ser só aritmética.
//
// Duas regras vêm dos sistemas de rundown de evento (Rundown Studio, Ontime):
// - Hora mole é o padrão: o momento começa quando o anterior acaba.
// - Hora marcada é âncora: o momento tem hora de relógio. Atraso que chega até
//   ela é absorvido pela folga antes dela, se houver; se não houver, ela começa
//   tarde e a tela avisa — em vez de cortar todo mundo pela metade.

export type Slot = { duration: number; hardStart?: string };
export type Planned = { start: number; end: number; hard: boolean; overlap: number };

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};

export const clockOf = (minutes: number) => {
  const total = Math.round(minutes);
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(((total % 60) + 60) % 60).padStart(2, '0')}`;
};

// O roteiro no papel. `overlap` > 0 quer dizer que os momentos antes de uma hora
// marcada não cabem nela: o próprio plano já nasce atrasado ali.
export function plan(start: string, slots: Slot[]): Planned[] {
  let cursor = toMinutes(start);
  return slots.map(slot => {
    const hard = !!slot.hardStart;
    const anchor = hard ? toMinutes(slot.hardStart as string) : cursor;
    const overlap = hard ? Math.max(0, cursor - anchor) : 0;
    const begin = hard ? Math.max(anchor, cursor) : cursor;
    cursor = begin + slot.duration;
    return { start: begin, end: cursor, hard, overlap };
  });
}

export type Projection = {
  expected: { start: number; end: number; late: number }[]; // late = minutos depois da hora marcada
  offset: number; // término esperado − término planejado; positivo = atrasado
  finish: number;
};

// O roteiro corrigido. O momento no ar termina quando o tempo dele acabar a
// partir de agora (ou agora, se já estourou e ninguém concluiu); dali para
// frente a fila escorre, parando em cada hora marcada que ainda tiver folga.
export function project(planned: Planned[], slots: Slot[], current: number, now: number, remainingMinutes: number): Projection {
  const expected = planned.map(p => ({ start: p.start, end: p.end, late: 0 }));
  if (!planned.length) return { expected, offset: 0, finish: 0 };
  const here = Math.min(Math.max(current, 0), planned.length - 1);
  const end = now + Math.max(remainingMinutes, 0);
  expected[here] = { start: Math.min(planned[here].start, end), end, late: 0 };
  let cursor = end;
  for (let i = here + 1; i < planned.length; i++) {
    const anchor = slots[i].hardStart ? toMinutes(slots[i].hardStart as string) : null;
    const begin = anchor === null ? cursor : Math.max(anchor, cursor);
    expected[i] = { start: begin, end: begin + slots[i].duration, late: anchor === null ? 0 : Math.max(0, cursor - anchor) };
    cursor = begin + slots[i].duration;
  }
  const finish = expected[expected.length - 1].end;
  return { expected, offset: finish - planned[planned.length - 1].end, finish };
}

// Amarelo antes do vermelho: momento curto avisa no último minuto, momento de
// dez minutos ou mais avisa nos dois últimos.
export const warnSeconds = (durationMinutes: number) => (durationMinutes >= 10 ? 120 : 60);
