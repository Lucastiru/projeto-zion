#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'svcpwtmccskohjfbjqfx';
const argument = process.argv[2];
if (!argument) throw new Error('Informe o arquivo SQL da migração.');
const migration = isAbsolute(argument) ? argument : resolve(process.cwd(), argument);
const tokenFile = join(homedir(), '.config/zion/supabase.env');
const stored = readFileSync(tokenFile, 'utf8').split('\n').find(line => line.startsWith('SUPABASE_ACCESS_TOKEN='));
const token = (process.env.SUPABASE_ACCESS_TOKEN || stored?.slice('SUPABASE_ACCESS_TOKEN='.length) || '').trim().replace(/^["']|["']$/g, '');
if (!token) throw new Error('SUPABASE_ACCESS_TOKEN não configurado.');
const query = readFileSync(migration, 'utf8');
const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
});
const body = await response.text();
if (!response.ok) throw new Error(`Supabase respondeu ${response.status}: ${body.slice(0, 500)}`);
console.log(`Migração aplicada: ${migration}`);
