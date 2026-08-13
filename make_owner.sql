-- ============================================================
-- STUART MOTOS - TRANSFORMAR UM USUÁRIO AUTH EM DONO
-- ============================================================
-- ANTES:
-- 1) Supabase > Authentication > Users
-- 2) Crie o usuário do dono com email e senha
-- 3) Troque o email abaixo pelo MESMO email criado no Auth
-- 4) Execute este SQL
--
-- Assim você NÃO precisa copiar UUID manualmente.
-- ============================================================

do $$
declare
  v_user_id uuid;
  v_email text := 'TROQUE_PELO_EMAIL_DO_DONO@exemplo.com';
begin
  select id
    into v_user_id
    from auth.users
   where lower(email) = lower(v_email)
   limit 1;

  if v_user_id is null then
    raise exception 'Usuário com email % não foi encontrado em Authentication > Users', v_email;
  end if;

  insert into public.user_roles (user_id, role)
  values (v_user_id, 'owner')
  on conflict (user_id)
  do update set role = excluded.role;

  raise notice 'Usuário % configurado como owner.', v_email;
end
$$;

-- Conferência:
select
  u.id,
  u.email,
  r.role
from auth.users u
left join public.user_roles r on r.user_id = u.id
order by u.created_at desc;
