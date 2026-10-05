'use client';
import { useState } from 'react';
import type { Ministry } from '@/app/page';
import { ZION } from '@/lib/zion-brand';

type Update = Ministry[] | ((previous: Ministry[]) => Ministry[]);

// Cadastro de ministérios: nome, cor e logo. A cor pode ser qualquer uma — a
// tela escurece para fundo e clareia para destaque, então não há escolha que
// deixe texto ilegível. O logo vai como data URL (não há Storage no projeto),
// só PNG/JPEG porque o PDF precisa embutir.
export function MinistriesPanel({ ministries, setMinistries, report }: {
  ministries: Ministry[];
  setMinistries: (update: Update) => Promise<boolean>;
  report: (text: string) => void;
}) {
  const [editing, setEditing] = useState<Ministry | null>(null);
  const [logo, setLogo] = useState<string | undefined>();
  const [color, setColor] = useState(ZION.color);
  function open(m: Ministry | null) {
    const base = m ?? { id: 0, name: '', color: '#1f4fa8' };
    setEditing(base); setLogo(base.logo || undefined); setColor(base.color);
  }
  async function pickLogo(file: File | undefined) {
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 300_000) {
      report('Use um logo PNG ou JPG de até 300 KB.');
      return;
    }
    setLogo(await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = reject;
      reader.readAsDataURL(file);
    }));
  }
  async function save(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    const field = new FormData(e.currentTarget).get('name');
    const item: Ministry = { id: editing.id || crypto.randomUUID(), name: typeof field === 'string' ? field.trim() : '', color, logo };
    const ok = await setMinistries(list => (editing.id ? list.map(m => (m.id === item.id ? item : m)) : [...list, item]));
    if (ok) setEditing(null);
  }
  async function remove(m: Ministry) {
    if (await setMinistries(list => list.filter(x => x.id !== m.id))) setEditing(null);
  }
  return (
    <section className="access-page ministries">
      <div className="view-head">
        <div>
          <p className="eyebrow">IDENTIDADE</p>
          <h2>Ministérios</h2>
          <p>Cada evento pode pertencer a um ministério. O nome, a cor e o logo dele aparecem nas telas do evento, na TV, no link do voluntário e no PDF.</p>
        </div>
        <button className="primary-solid" onClick={() => open(null)}>Novo ministério</button>
      </div>
      <div className="ministry-list">
        <div className="ministry-row">
          <span className="ministry-swatch" style={{ background: ZION.color }}><img src={ZION.logo} alt="" /></span>
          <div><strong>Zion Church</strong><small>Padrão — eventos sem ministério</small></div>
        </div>
        {ministries.map(m => (
          <div className="ministry-row" key={m.id}>
            <span className="ministry-swatch" style={{ background: m.color }}>{m.logo ? <img src={m.logo} alt="" /> : m.name.slice(0, 2).toUpperCase()}</span>
            <div><strong>{m.name}</strong><small>{m.color.toUpperCase()}</small></div>
            <button className="ghost-btn" onClick={() => open(m)}>Editar</button>
          </div>
        ))}
      </div>
      {editing && (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={save}>
            <div className="modal-head">
              <div><p className="eyebrow">MINISTÉRIO</p><h3>{editing.id ? 'Editar ministério' : 'Novo ministério'}</h3></div>
              <button type="button" onClick={() => setEditing(null)}>×</button>
            </div>
            <label>Nome<input name="name" required maxLength={60} defaultValue={editing.name} placeholder="Ex.: Eklektos" /></label>
            <div className="form-grid">
              <label>Cor<input type="color" value={color} onChange={e => setColor(e.target.value)} /></label>
              <label>
                Logo <small className="field-help">PNG ou JPG, até 300 KB</small>
                <input type="file" accept="image/png,image/jpeg" onChange={e => void pickLogo(e.target.files?.[0])} />
              </label>
            </div>
            {/* Prévia com as mesmas misturas da tela: o que se vê aqui é o
                que o operador e a TV vão ver. */}
            <div className="ministry-preview themed" style={{ ['--brand' as string]: color }}>
              {logo ? <img src={logo} alt="" /> : <b>{(editing.name || 'Ministério').slice(0, 2).toUpperCase()}</b>}
              <span><strong>Prévia</strong><small>Fundo e destaque desta cor</small></span>
              <i>05:00</i>
            </div>
            {logo && <button type="button" className="ghost-btn" onClick={() => setLogo(undefined)}>Tirar logo</button>}
            <div className="modal-actions">
              {editing.id ? <button type="button" className="ghost-btn danger" onClick={() => void remove(editing)}>Apagar</button> : null}
              <button type="button" className="ghost-btn" onClick={() => setEditing(null)}>Cancelar</button>
              <button className="primary-solid">Salvar</button>
            </div>
            {editing.id ? <p className="user-note">Apagar o ministério devolve os eventos dele para Zion Church. Nada do roteiro se perde.</p> : null}
          </form>
        </div>
      )}
    </section>
  );
}
