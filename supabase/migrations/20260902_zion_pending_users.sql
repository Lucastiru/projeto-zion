-- Fila de aprovação: quem criou conta e ainda não tem acesso.
--
-- Cadastrar-se grava uma linha em auth.users, que o navegador não pode ler.
-- Sem esta função o administrador não tem como saber que alguém está esperando,
-- e precisaria adivinhar o e-mail para autorizar.
--
-- Segurança: security definer para alcançar auth.users, com search_path vazio e
-- o filtro de papel dentro do corpo — para quem não é admin a função devolve
-- zero linhas, mesmo que o EXECUTE esteja aberto.

create or replace function public.zion_pending_users()
returns table (email text, name text, created_at timestamptz, confirmed boolean)
language sql
stable
security definer
set search_path to ''
as $function$
  select lower(u.email)::text,
         coalesce(nullif(btrim(u.raw_user_meta_data ->> 'name'), ''), split_part(u.email, '@', 1))::text,
         u.created_at,
         u.email_confirmed_at is not null
  from auth.users u
  where public.zion_current_role() = 'admin'
    and u.deleted_at is null
    and not exists (select 1 from public.zion_access a where a.email = lower(u.email))
  order by u.created_at
$function$;

revoke all on function public.zion_pending_users() from public, anon;
grant execute on function public.zion_pending_users() to authenticated;
