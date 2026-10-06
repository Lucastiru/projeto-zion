-- Planejamento avançado: modelos, metadados por momento e plano público.
alter table public.zion_events
  add column if not exists public_token uuid not null default gen_random_uuid();
create unique index if not exists zion_events_public_token_key on public.zion_events(public_token);

alter table public.zion_moments
  add column if not exists item_type text not null default 'momento',
  add column if not exists item_color text not null default '#2f6b57',
  add column if not exists attachments jsonb not null default '[]'::jsonb,
  add column if not exists team_notes jsonb not null default '[]'::jsonb;

alter table public.zion_moments drop constraint if exists zion_moments_item_type_check;
alter table public.zion_moments add constraint zion_moments_item_type_check
  check (item_type in ('momento','louvor','palavra','midia','transicao','oracao','aviso'));
alter table public.zion_moments drop constraint if exists zion_moments_item_color_check;
alter table public.zion_moments add constraint zion_moments_item_color_check
  check (item_color ~ '^#[0-9a-fA-F]{6}$');
alter table public.zion_moments drop constraint if exists zion_moments_attachments_check;
alter table public.zion_moments add constraint zion_moments_attachments_check
  check (jsonb_typeof(attachments) = 'array' and octet_length(attachments::text) <= 20000);
alter table public.zion_moments drop constraint if exists zion_moments_team_notes_check;
alter table public.zion_moments add constraint zion_moments_team_notes_check
  check (jsonb_typeof(team_notes) = 'array' and octet_length(team_notes::text) <= 20000);

create table if not exists public.zion_service_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_type text not null default 'Culto',
  ministry_id uuid references public.zion_ministries(id) on delete set null,
  moments jsonb not null default '[]'::jsonb,
  preparation jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint zion_service_templates_name_check check (char_length(btrim(name)) between 1 and 80),
  constraint zion_service_templates_payload_check check (
    jsonb_typeof(moments) = 'array' and jsonb_typeof(preparation) = 'array'
    and octet_length(moments::text) <= 150000 and octet_length(preparation::text) <= 80000
  )
);
alter table public.zion_service_templates enable row level security;
drop policy if exists manager_write on public.zion_service_templates;
create policy manager_write on public.zion_service_templates for all to authenticated
  using (public.zion_current_role() in ('admin','manager'))
  with check (public.zion_current_role() in ('admin','manager'));
drop policy if exists member_read on public.zion_service_templates;
create policy member_read on public.zion_service_templates for select to authenticated
  using (public.zion_current_role() is not null);
revoke all privileges on table public.zion_service_templates from anon, authenticated;
grant select, insert, update, delete on table public.zion_service_templates to authenticated;

-- Retorna apenas os dados deliberadamente públicos, sem e-mails, escala ou notas internas.
create or replace function public.zion_public_plan(p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'event', jsonb_build_object(
      'title', e.title, 'date', e.event_date, 'time', e.start_time,
      'type', e.event_type, 'location', e.location,
      'ministry', coalesce(m.name, 'Zion Church'),
      'color', coalesce(m.color, '#19b8ad'), 'logo', m.logo_url
    ),
    'moments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', z.title, 'duration', z.duration_minutes, 'owner', z.owner_name,
        'details', z.details, 'items', z.sequence_items, 'hardStart', z.hard_start,
        'type', z.item_type, 'color', z.item_color, 'attachments', z.attachments
      ) order by z.position) from public.zion_moments z where z.event_id = e.id
    ), '[]'::jsonb)
  ) from public.zion_events e left join public.zion_ministries m on m.id=e.ministry_id
  where e.public_token=p_token;
$$;
revoke all on function public.zion_public_plan(uuid) from public;
grant execute on function public.zion_public_plan(uuid) to anon, authenticated;
