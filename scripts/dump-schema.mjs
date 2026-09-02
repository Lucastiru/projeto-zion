#!/usr/bin/env node
// Reconstrói o DDL do banco Supabase a partir do catálogo do Postgres.
// Uso: node scripts/dump-schema.mjs
// Credencial: SUPABASE_ACCESS_TOKEN no ambiente ou em ~/.config/zion/supabase.env
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'svcpwtmccskohjfbjqfx';
const OUT_DIR = new URL('../supabase/schema/', import.meta.url).pathname;

function token() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  const file = join(homedir(), '.config/zion/supabase.env');
  try {
    const line = readFileSync(file, 'utf8').split('\n').find(l => l.startsWith('SUPABASE_ACCESS_TOKEN='));
    if (line) return line.slice('SUPABASE_ACCESS_TOKEN='.length).trim().replace(/^["']|["']$/g, '');
  } catch {}
  console.error(`Faltou o token. Crie ${file} com uma linha:\n  SUPABASE_ACCESS_TOKEN=sbp_...\ne rode: chmod 600 ${file}`);
  process.exit(1);
}
const TOKEN = token();

async function q(sql) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

const ident = name => (/^[a-z_][a-z0-9_]*$/.test(name) ? name : `"${name}"`);
const lit = value => `'${String(value).replace(/'/g, "''")}'`;

const CATALOG = {
  enums: `select t.typname as name, array_agg(e.enumlabel order by e.enumsortorder) as labels
          from pg_type t join pg_enum e on e.enumtypid = t.oid
          join pg_namespace n on n.oid = t.typnamespace
          where n.nspname = 'public' group by 1 order by 1`,
  sequences: `select sequencename as name, data_type, start_value, increment_by, min_value, max_value, cycle
              from pg_sequences where schemaname = 'public' order by 1`,
  tables: `select c.relname as name, c.relrowsecurity as rls, c.relforcerowsecurity as force_rls,
                  obj_description(c.oid) as comment
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' order by 1`,
  columns: `select c.relname as "table", a.attname as name, format_type(a.atttypid, a.atttypmod) as type,
                   a.attnotnull as notnull, a.attidentity as identity, a.attgenerated as generated,
                   pg_get_expr(d.adbin, d.adrelid) as "default", a.attnum,
                   coll.collname as collation, col_description(c.oid, a.attnum) as comment
            from pg_attribute a
            join pg_class c on c.oid = a.attrelid
            join pg_namespace n on n.oid = c.relnamespace
            left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
            left join pg_collation coll on coll.oid = a.attcollation and coll.collname <> 'default'
            where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
            order by c.relname, a.attnum`,
  constraints: `select c.relname as "table", con.conname as name, con.contype as type,
                       pg_get_constraintdef(con.oid) as def
                from pg_constraint con
                join pg_class c on c.oid = con.conrelid
                join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'public'
                order by case con.contype when 'p' then 0 when 'u' then 1 when 'c' then 2 else 3 end, c.relname, con.conname`,
  indexes: `select i.indexname as name, i.tablename as "table", i.indexdef as def
            from pg_indexes i
            where i.schemaname = 'public'
              and not exists (select 1 from pg_constraint con where con.conname = i.indexname
                              and con.connamespace = 'public'::regnamespace)
            order by 1`,
  views: `select c.relname as name, c.relkind as kind, pg_get_viewdef(c.oid, true) as def
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind in ('v','m') order by 1`,
  functions: `select n.nspname as schema, p.proname as name, pg_get_functiondef(p.oid) as def
              from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.prokind in ('f','p')
                and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
              order by 1, 2`,
  // Só o que é nosso: triggers de auth/storage são criadas pela própria plataforma.
  triggers: `select n.nspname as schema, c.relname as "table", t.tgname as name, pg_get_triggerdef(t.oid) as def
             from pg_trigger t
             join pg_class c on c.oid = t.tgrelid
             join pg_namespace n on n.oid = c.relnamespace
             where not t.tgisinternal and n.nspname = 'public'
             order by 1, 2, 3`,
  platform_triggers: `select n.nspname as schema, c.relname as "table", t.tgname as name
                      from pg_trigger t
                      join pg_class c on c.oid = t.tgrelid
                      join pg_namespace n on n.oid = c.relnamespace
                      where not t.tgisinternal and n.nspname in ('auth','storage')
                      order by 1, 2, 3`,
  policies: `select tablename as "table", policyname as name, permissive, roles, cmd, qual, with_check
             from pg_policies where schemaname = 'public' order by tablename, policyname`,
  grants: `select table_name as "table", grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
           from information_schema.role_table_grants
           where table_schema = 'public' and grantee in ('anon','authenticated','service_role')
           group by 1, 2 order by 1, 2`,
  counts: `select relname as "table", n_live_tup as rows
           from pg_stat_user_tables where schemaname = 'public' order by 1`,
};

const catalog = {};
for (const [key, sql] of Object.entries(CATALOG)) {
  try { catalog[key] = await q(sql); }
  catch (error) { console.error(`falhou ${key}: ${error.message}`); catalog[key] = []; }
}

const out = [];
const write = line => out.push(line);
write('-- Baseline do schema public, extraído do projeto Supabase ' + PROJECT_REF + '.');
write('-- Gerado por scripts/dump-schema.mjs em ' + new Date().toISOString() + '.');
write('-- Reconstruído do catálogo do Postgres: confira antes de aplicar num banco novo.');
write('');

if (catalog.enums.length) {
  write('-- Tipos enumerados');
  for (const e of catalog.enums) write(`create type public.${ident(e.name)} as enum (${e.labels.map(lit).join(', ')});`);
  write('');
}

const ownedBy = [];
if (catalog.sequences.length) {
  write('-- Sequências');
  for (const s of catalog.sequences) {
    write(`create sequence if not exists public.${ident(s.name)} as ${s.data_type} increment by ${s.increment_by} start with ${s.start_value}${s.cycle ? ' cycle' : ''};`);
  }
  write('');
}

write('-- Tabelas');
const columnsOf = table => catalog.columns.filter(c => c.table === table);
for (const t of catalog.tables) {
  const lines = columnsOf(t.name).map(c => {
    let piece = `  ${ident(c.name)} ${c.type}`;
    if (c.collation) piece += ` collate ${ident(c.collation)}`;
    if (c.identity) piece += ` generated ${c.identity === 'a' ? 'always' : 'by default'} as identity`;
    else if (c.generated === 's' && c.default) piece += ` generated always as (${c.default}) stored`;
    else if (c.default) piece += ` default ${c.default}`;
    if (c.notnull) piece += ' not null';
    if (c.default && /nextval\('([^']+)'/.test(c.default)) {
      ownedBy.push(`alter sequence ${RegExp.$1} owned by public.${ident(t.name)}.${ident(c.name)};`);
    }
    return piece;
  });
  write(`create table if not exists public.${ident(t.name)} (\n${lines.join(',\n')}\n);`);
  if (t.comment) write(`comment on table public.${ident(t.name)} is ${lit(t.comment)};`);
  for (const c of columnsOf(t.name).filter(c => c.comment)) {
    write(`comment on column public.${ident(t.name)}.${ident(c.name)} is ${lit(c.comment)};`);
  }
  write('');
}
if (ownedBy.length) { write('-- Sequências ligadas às colunas'); ownedBy.forEach(write); write(''); }

if (catalog.constraints.length) {
  write('-- Constraints');
  for (const c of catalog.constraints) {
    write(`alter table public.${ident(c.table)} add constraint ${ident(c.name)} ${c.def};`);
  }
  write('');
}

if (catalog.indexes.length) {
  write('-- Índices');
  for (const i of catalog.indexes) write(`${i.def};`);
  write('');
}

if (catalog.views.length) {
  write('-- Views');
  for (const v of catalog.views) {
    write(`create or replace ${v.kind === 'm' ? 'materialized view' : 'view'} public.${ident(v.name)} as\n${v.def}`);
    write('');
  }
}

if (catalog.functions.length) {
  write('-- Funções');
  for (const f of catalog.functions) { write(f.def.trimEnd() + ';'); write(''); }
}

if (catalog.triggers.length) {
  write('-- Triggers');
  for (const t of catalog.triggers) write(`${t.def};`);
  write('');
}

write('-- Row Level Security');
for (const t of catalog.tables) {
  write(`alter table public.${ident(t.name)} ${t.rls ? 'enable' : 'disable'} row level security;`);
  if (t.force_rls) write(`alter table public.${ident(t.name)} force row level security;`);
}
write('');

if (catalog.policies.length) {
  write('-- Políticas');
  for (const p of catalog.policies) {
    const roles = Array.isArray(p.roles) ? p.roles : String(p.roles || '').replace(/^\{|\}$/g, '').split(',').filter(Boolean);
    let piece = `create policy ${ident(p.name)} on public.${ident(p.table)}`;
    piece += `\n  as ${p.permissive === 'PERMISSIVE' ? 'permissive' : 'restrictive'}`;
    piece += `\n  for ${String(p.cmd || 'ALL').toLowerCase()}`;
    if (roles.length) piece += `\n  to ${roles.map(r => ident(r.trim())).join(', ')}`;
    if (p.qual) piece += `\n  using (${p.qual})`;
    if (p.with_check) piece += `\n  with check (${p.with_check})`;
    write(piece + ';');
    write('');
  }
}

if (catalog.grants.length) {
  write('-- Grants');
  for (const g of catalog.grants) write(`grant ${g.privileges.toLowerCase()} on public.${ident(g.table)} to ${ident(g.grantee)};`);
  write('');
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'baseline.sql'), out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n');
writeFileSync(join(OUT_DIR, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
console.log(`OK: ${catalog.tables.length} tabelas, ${catalog.policies.length} políticas, ${catalog.functions.length} funções, ${catalog.triggers.length} triggers.`);
console.log('Linhas por tabela:', catalog.counts.map(c => `${c.table}=${c.rows}`).join(' '));
console.log('Escrito em supabase/schema/baseline.sql');
