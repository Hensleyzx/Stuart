-- ============================================================
-- STUART MOTOS — SECURITY HARDENING V2
-- ============================================================
-- Execute no Supabase SQL Editor.
-- Objetivos:
-- 1) remover policies antigas/conflitantes;
-- 2) recriar RLS com princípio de menor privilégio;
-- 3) impedir acesso anônimo a dados privados;
-- 4) impedir alteração direta de histórico de vendas/clientes;
-- 5) restringir funções administrativas ao role authenticated.
--
-- Este script NÃO apaga dados.
-- É idempotente para a estrutura V2 atual da Stuart Motos.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. GARANTIR RLS NAS TABELAS DA APLICAÇÃO
-- ------------------------------------------------------------
alter table public.user_roles enable row level security;
alter table public.produtos enable row level security;
alter table public.veiculos enable row level security;
alter table public.servicos enable row level security;
alter table public.horarios enable row level security;
alter table public.configuracoes enable row level security;
alter table public.clientes enable row level security;
alter table public.vendas enable row level security;
alter table public.itens_venda enable row level security;

-- ------------------------------------------------------------
-- 2. REMOVER TODAS AS POLICIES ANTIGAS DESTAS TABELAS
--    Isso elimina policies V1/V2 duplicadas ou permissivas.
-- ------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any (array[
        'user_roles','produtos','veiculos','servicos','horarios',
        'configuracoes','clientes','vendas','itens_venda'
      ])
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      r.policyname, r.schemaname, r.tablename
    );
  end loop;
end
$$;

-- ------------------------------------------------------------
-- 3. FUNÇÃO DE AUTORIZAÇÃO DO PROPRIETÁRIO
-- ------------------------------------------------------------
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = (select auth.uid())
      and role = 'owner'
  );
$$;

revoke all on function public.is_owner() from public;
grant execute on function public.is_owner() to authenticated;

-- ------------------------------------------------------------
-- 4. POLICIES PÚBLICAS: SOMENTE CONTEÚDO PUBLICADO
-- ------------------------------------------------------------
create policy "public_read_produtos"
on public.produtos
for select
to anon, authenticated
using (publico = true and ativo = true);

create policy "public_read_veiculos"
on public.veiculos
for select
to anon, authenticated
using (publico = true and status = 'disponivel');

create policy "public_read_servicos"
on public.servicos
for select
to anon, authenticated
using (publico = true and ativo = true);

create policy "public_read_horarios"
on public.horarios
for select
to anon, authenticated
using (true);

create policy "public_read_configuracoes"
on public.configuracoes
for select
to anon, authenticated
using (id = 1);

-- ------------------------------------------------------------
-- 5. POLICIES ADMIN: CRUD SOMENTE PARA OWNER
-- ------------------------------------------------------------
create policy "owner_manage_produtos"
on public.produtos
for all
to authenticated
using ((select public.is_owner()))
with check ((select public.is_owner()));

create policy "owner_manage_veiculos"
on public.veiculos
for all
to authenticated
using ((select public.is_owner()))
with check ((select public.is_owner()));

create policy "owner_manage_servicos"
on public.servicos
for all
to authenticated
using ((select public.is_owner()))
with check ((select public.is_owner()));

create policy "owner_manage_horarios"
on public.horarios
for all
to authenticated
using ((select public.is_owner()))
with check ((select public.is_owner()));

create policy "owner_manage_configuracoes"
on public.configuracoes
for all
to authenticated
using ((select public.is_owner()))
with check ((select public.is_owner()));

-- Dados privados: leitura do owner, gravação somente pela RPC transacional.
create policy "owner_read_clientes"
on public.clientes
for select
to authenticated
using ((select public.is_owner()));

create policy "owner_read_vendas"
on public.vendas
for select
to authenticated
using ((select public.is_owner()));

create policy "owner_read_itens_venda"
on public.itens_venda
for select
to authenticated
using ((select public.is_owner()));

-- Nenhuma policy é criada para user_roles.
-- A tabela é consultada apenas pela função security definer is_owner().

-- ------------------------------------------------------------
-- 6. GRANTS — PRINCÍPIO DE MENOR PRIVILÉGIO
-- ------------------------------------------------------------
-- Retira permissões herdadas/antigas antes de conceder apenas o necessário.
revoke all on public.user_roles from anon, authenticated;
revoke all on public.produtos from anon, authenticated;
revoke all on public.veiculos from anon, authenticated;
revoke all on public.servicos from anon, authenticated;
revoke all on public.horarios from anon, authenticated;
revoke all on public.configuracoes from anon, authenticated;
revoke all on public.clientes from anon, authenticated;
revoke all on public.vendas from anon, authenticated;
revoke all on public.itens_venda from anon, authenticated;

-- Visitante: somente colunas destinadas ao site público.
grant select (
  id,nome,categoria,marca,preco,descricao,imagem_url,publico,ativo,created_at,updated_at
) on public.produtos to anon;

grant select (
  id,marca,modelo,ano,cor,quilometragem,preco,descricao,imagem_url,status,publico,created_at,updated_at
) on public.veiculos to anon;

grant select (
  id,nome,descricao,preco_base,imagem_url,ordem,ativo,publico,created_at,updated_at
) on public.servicos to anon;

grant select on public.horarios to anon;
grant select on public.configuracoes to anon;

-- Usuário autenticado: leitura pública + CRUD administrativo protegido por RLS.
grant select, insert, update, delete on public.produtos to authenticated;
grant select, insert, update, delete on public.veiculos to authenticated;
grant select, insert, update, delete on public.servicos to authenticated;
grant select, insert, update, delete on public.horarios to authenticated;
grant select, insert, update, delete on public.configuracoes to authenticated;

-- Histórico/PII: leitura somente. A escrita ocorre pela RPC registrar_venda_v2.
grant select on public.clientes to authenticated;
grant select on public.vendas to authenticated;
grant select on public.itens_venda to authenticated;

-- ------------------------------------------------------------
-- 7. HARDENING DA RPC DE VENDA
-- ------------------------------------------------------------
-- Ajusta todas as sobrecargas existentes de registrar_venda_v2 sem depender
-- de escrever a assinatura manualmente.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'registrar_venda_v2'
  loop
    execute format('alter function %s security definer', r.fn);
    execute format('alter function %s set search_path = %L', r.fn, '');
    execute format('revoke all on function %s from public', r.fn);
    execute format('grant execute on function %s to authenticated', r.fn);
  end loop;
end
$$;

-- Atualiza cache da Data API/PostgREST.
notify pgrst, 'reload schema';

commit;

-- ============================================================
-- VERIFICAÇÃO (somente leitura)
-- ============================================================
-- Policies atualmente ativas:
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = any (array[
    'user_roles','produtos','veiculos','servicos','horarios',
    'configuracoes','clientes','vendas','itens_venda'
  ])
order by tablename, policyname;

-- Confere SECURITY DEFINER e search_path das funções sensíveis:
select
  p.proname as funcao,
  p.prosecdef as security_definer,
  p.proconfig as configuracao,
  pg_get_function_identity_arguments(p.oid) as parametros
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('is_owner','registrar_venda_v2')
order by p.proname;
