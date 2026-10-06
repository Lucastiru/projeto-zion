-- Acesso somente por aprovação do administrador ou convite válido.
create table if not exists public.zion_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#2f6b57',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint zion_areas_name_check check (char_length(btrim(name)) between 2 and 60),
  constraint zion_areas_color_check check (color ~ '^#[0-9a-fA-F]{6}$')
);
create table if not exists public.zion_user_areas (
  email text not null references public.zion_access(email) on delete cascade,
  area_id uuid not null references public.zion_areas(id) on delete cascade,
  primary key (email, area_id)
);
create table if not exists public.zion_access_invites (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  email text,
  role text not null default 'volunteer',
  area_ids uuid[] not null default '{}',
  expires_at timestamptz not null default (now() + interval '7 days'),
  used_at timestamptz,
  used_by text,
  created_at timestamptz not null default now(),
  created_by text not null default lower(auth.jwt() ->> 'email'),
  constraint zion_access_invites_role_check check (role in ('admin','manager','volunteer')),
  constraint zion_access_invites_email_check check (email is null or email = lower(email))
);

insert into public.zion_areas(name,color) values
 ('Louvor','#8b5cf6'),('Mídia','#0ea5e9'),('Recepção','#f59e0b'),
 ('Palco','#ef4444'),('Intercessão','#14b8a6'),('Produção','#2f6b57')
on conflict (name) do nothing;

alter table public.zion_areas enable row level security;
alter table public.zion_user_areas enable row level security;
alter table public.zion_access_invites enable row level security;
create policy areas_member_read on public.zion_areas for select to authenticated using (public.zion_current_role() is not null);
create policy areas_admin_write on public.zion_areas for all to authenticated using (public.zion_current_role()='admin') with check (public.zion_current_role()='admin');
create policy user_areas_read on public.zion_user_areas for select to authenticated using (email=lower(auth.jwt()->>'email') or public.zion_current_role()='admin');
create policy user_areas_admin_write on public.zion_user_areas for all to authenticated using (public.zion_current_role()='admin') with check (public.zion_current_role()='admin');
create policy invites_admin on public.zion_access_invites for all to authenticated using (public.zion_current_role()='admin') with check (public.zion_current_role()='admin');
grant select,insert,update,delete on public.zion_areas,public.zion_user_areas,public.zion_access_invites to authenticated;

create or replace function public.zion_public_areas()
returns table(id uuid,name text,color text) language sql stable security definer set search_path=public as $$
 select id,name,color from public.zion_areas where active order by name;
$$;
revoke all on function public.zion_public_areas() from public;
grant execute on function public.zion_public_areas() to anon,authenticated;

drop function if exists public.zion_pending_users();
create function public.zion_pending_users()
returns table(email text,name text,created_at timestamptz,confirmed boolean,area_ids uuid[])
language sql stable security definer set search_path='' as $$
 select lower(u.email)::text,
   coalesce(nullif(btrim(u.raw_user_meta_data->>'name'),''),split_part(u.email,'@',1))::text,
   u.created_at,u.email_confirmed_at is not null,
   coalesce(array(select value::uuid from jsonb_array_elements_text(coalesce(u.raw_user_meta_data->'area_ids','[]'::jsonb))),array[]::uuid[])
 from auth.users u
 where public.zion_current_role()='admin' and u.deleted_at is null
 and not exists(select 1 from public.zion_access a where a.email=lower(u.email))
 order by u.created_at;
$$;

create or replace function public.zion_accept_invite(p_token uuid)
returns text language plpgsql security definer set search_path=public as $$
declare v public.zion_access_invites; v_email text:=lower(auth.jwt()->>'email'); v_area uuid;
begin
 if auth.uid() is null then raise exception 'Faça login para aceitar o convite'; end if;
 select * into v from public.zion_access_invites where token=p_token for update;
 if v.id is null or v.used_at is not null or v.expires_at<now() then raise exception 'Convite inválido ou expirado'; end if;
 if v.email is not null and v.email<>v_email then raise exception 'Este convite pertence a outro e-mail'; end if;
 insert into public.zion_access(email,role) values(v_email,v.role) on conflict(email) do update set role=excluded.role;
 delete from public.zion_user_areas where email=v_email;
 foreach v_area in array v.area_ids loop insert into public.zion_user_areas(email,area_id) values(v_email,v_area) on conflict do nothing; end loop;
 update public.zion_access_invites set used_at=now(),used_by=v_email where id=v.id;
 return v.role;
end;$$;
revoke all on function public.zion_accept_invite(uuid) from public;
grant execute on function public.zion_accept_invite(uuid) to authenticated;
