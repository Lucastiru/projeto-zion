# Schema do Supabase — projeto Zion

O banco vive no projeto Supabase `svcpwtmccskohjfbjqfx`. Este diretório é a cópia
versionada dele: sem isto, o schema só existia dentro do painel.

| Arquivo | O que é |
| --- | --- |
| `baseline.sql` | DDL do schema `public` reconstruído do catálogo do Postgres. |
| `catalog.json` | Resposta crua das consultas de catálogo, para conferência. |

## Como atualizar

```zsh
node scripts/dump-schema.mjs
```

O script lê `SUPABASE_ACCESS_TOKEN` do ambiente ou de `~/.config/zion/supabase.env`
(um Personal Access Token, criado em https://supabase.com/dashboard/account/tokens).
Só faz `select` em `pg_catalog`/`information_schema` — nunca escreve.

Rode depois de qualquer alteração feita pelo SQL Editor ou pelo painel, e commite o
diff junto com o código que depende dela.

## Modelo

Um evento (`zion_events`) é a raiz. Pendurados nele, tudo com
`on delete cascade`: `zion_moments` (cronograma, ordenado por `position`),
`zion_preparation` (checklist), `zion_issues` (ocorrências ao vivo),
`zion_roster` (escala, N:N com `zion_volunteers`) e `zion_feedback` (uma linha por evento).

**`zion_access` é a tabela de autorização e é separada do cadastro de voluntários.**
Chave é o e-mail em minúsculas; papel é `admin`, `manager` ou `volunteer`. Cadastrar
um voluntário não cria acesso, e autorizar um acesso não coloca ninguém na escala.

## Autorização

Toda a segurança está na RLS — a chave usada pelo navegador
(`lib/supabase.ts`) é publicável e não concede nada por si.

O juiz é `zion_current_role()`, uma função `security definer` com `search_path`
vazio que cruza o e-mail do JWT com `zion_access`. Sobre ela, duas políticas por tabela:

- `member_read` — `select` para quem tem qualquer papel (`zion_current_role() is not null`).
- `manager_write` — tudo, para `admin` e `manager`.

`zion_access` foge do padrão: cada um lê a própria linha, e só `admin` escreve.
O papel `anon` não tem grant nenhum: sem sessão, não se lê nada.

## O que este dump NÃO cobre

Estão só no painel do Supabase, e mudá-los não aparece em nenhum diff:

- **Configuração de Auth.** Hoje: cadastro público aberto (`disable_signup=false`,
  qualquer pessoa cria conta — o que barra o acesso é a RLS, não o cadastro),
  confirmação de e-mail exigida, senha mínima de 6 caracteres, sem captcha,
  SMTP padrão do Supabase (limitado a 2 e-mails/hora),
  `site_url=https://operacaoigreja.com.br`.
- **Storage.** Nenhum bucket existe. As fotos de voluntário são gravadas como
  data URL base64 dentro de `zion_volunteers.photo_url` (`text`).
- **Segredos e chaves.** Nada de credencial mora neste repositório.
