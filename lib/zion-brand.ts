import type { CSSProperties } from 'react';

// Identidade padrão: evento sem ministério é Zion Church, com o verde de sempre.
export const ZION = { name: 'Zion Church', color: '#15382d', logo: '/zion-logo.png' };

export type Brand = { name: string; color: string; logo?: string };

// A cor escolhida no cadastro nunca vira fundo de texto direto: alguém escolhe
// amarelo e o branco por cima some. No CSS ela passa por color-mix — fundo é a
// cor escurecida, destaque é a cor clareada (ver .themed no globals.css). Aqui
// só entra a matéria-prima.
export const brandStyle = (brand: Brand | null | undefined): CSSProperties | undefined =>
  brand ? ({ '--brand': brand.color } as CSSProperties) : undefined;

// Para o PDF, que não tem color-mix: a mesma conta feita à mão.
export function rgb(hex: string): [number, number, number] {
  const n = parseInt(/^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : ZION.color.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const mix = (hex: string, other: [number, number, number], share: number): [number, number, number] => {
  const base = rgb(hex);
  return base.map((c, i) => Math.round(c * share + other[i] * (1 - share))) as [number, number, number];
};
// Luminância relativa (WCAG). O PDF não tem oklch: escurece/clareia em passos
// até a cor cruzar o limite, então amarelo e azul chegam ao mesmo contraste.
const luminance = ([r, g, b]: [number, number, number]) =>
  [r, g, b].map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((acc, v, i) => acc + v * [0.2126, 0.7152, 0.0722][i], 0);
const toward = (hex: string, target: [number, number, number], done: (c: [number, number, number]) => boolean) => {
  for (let share = 1; share > 0; share -= 0.05) {
    const c = mix(hex, target, share);
    if (done(c)) return c;
  }
  return target;
};
// Fundo para texto branco (contraste ≥ 7:1) e destaque sobre esse fundo.
export const deep = (hex: string) => toward(hex, [0, 0, 0], c => luminance(c) <= 0.1);
export const tint = (hex: string) => toward(hex, [255, 255, 255], c => luminance(c) >= 0.6);
