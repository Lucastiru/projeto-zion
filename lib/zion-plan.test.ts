import { plan, project, clockOf } from './zion-plan.ts';
let fail = 0; const eq = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', name, ok ? '' : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };
// Worship Night 01/10: 10,5,3,40,10,15,15,10,7 a partir de 19:45 → 21:40
const wn = [10,5,3,40,10,15,15,10,7].map(d => ({ duration: d }));
const p = plan('19:45', wn);
eq('plano termina 21:40', clockOf(p.at(-1)!.end), '21:40');
eq('palavra planejada 21:08', clockOf(p[6].start), '21:08');
// Adoração (idx 3) soltou às 20:10 em vez de 20:03; às 20:17 faltam 33 min → 7 atrasado
const pr = project(p, wn, 3, 20*60+17, 33);
eq('atraso de 7 min escorre até o fim', Math.round(pr.offset), 7);
eq('término esperado 21:47', clockOf(pr.finish), '21:47');
// Palavra com hora marcada 21:08 e uma folga de 5 min antes dela absorvendo 7 de atraso
const ancorado = wn.map((s,i) => i === 6 ? { ...s, hardStart: '21:15' } : s);
const pa = plan('19:45', ancorado);
eq('folga de 7 min antes da palavra', pa[6].start - pa[5].end, 7);
const pra = project(pa, ancorado, 3, 20*60+17, 33);
eq('âncora com folga absorve o atraso', Math.round(pra.expected[6].late), 0);
eq('palavra segue em 21:15', clockOf(pra.expected[6].start), '21:15');
// Âncora sem folga: começa tarde e avisa
const apertado = wn.map((s,i) => i === 6 ? { ...s, hardStart: '21:08' } : s);
const pp = plan('19:45', apertado);
const prp = project(pp, apertado, 3, 20*60+17, 33);
eq('âncora sem folga começa 7 min tarde', Math.round(prp.expected[6].late), 7);
// Plano que não cabe: momentos antes da âncora passam dela
const naoCabe = wn.map((s,i) => i === 6 ? { ...s, hardStart: '21:00' } : s);
eq('overlap do próprio plano = 8', plan('19:45', naoCabe)[6].overlap, 8);
// Momento estourado (remaining negativo) termina "agora", não no passado
const est = project(p, wn, 3, 20*60+50, -4);
eq('estourado: fim do momento = agora', clockOf(est.expected[3].end), '20:50');
// Adiantado
const adi = project(p, wn, 3, 20*60+3, 30);
eq('adiantado 10 min', Math.round(adi.offset), -10);
if (fail) throw new Error(`${fail} teste(s) falharam`);
