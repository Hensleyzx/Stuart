-- ============================================================
-- STUART MOTOS — MFA AAL2 HARDENING
-- ============================================================
-- Execute no Supabase SQL Editor SOMENTE depois de confirmar que
-- o login com TOTP/Authenticator está funcionando no site.
--
-- O que este script faz:
-- 1) mantém public.is_owner() para identificar o dono após email/senha;
-- 2) cria public.is_owner_aal2() para exigir MFA nas ações administrativas;
-- 3) troca as policies administrativas para exigir owner + AAL2;
-- 4) adiciona proteção extra nas tabelas usadas pela RPC de venda,
--    impedindo a RPC SECURITY DEFINER de gravar sem MFA.
--
-- Não apaga dados.
-- ============================================================

begin;

-- 1. Owner + MFA verificado (AAL2)
create or replace function public.is_owner_aal2()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select public.is_owner())
    and coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2';
$$;

revoke all on function public.is_owner_aal2() from public;
grant execute on function public.is_owner_aal2() to authenticated;

-- 2. Policies administrativas: agora exigem owner + AAL2.
drop policy if exists "owner_manage_produtos" on public.produtos;
create policy "owner_manage_produtos"
on public.produtos
for all
to authenticated
using ((select public.is_owner_aal2()))
with check ((select public.is_owner_aal2()));

drop policy if exists "owner_manage_veiculos" on public.veiculos;
create policy "owner_manage_veiculos"
on public.veiculos
for all
to authenticated
using ((select public.is_owner_aal2()))
with check ((select public.is_owner_aal2()));

drop policy if exists "owner_manage_servicos" on public.servicos;
create policy "owner_manage_servicos"
on public.servicos
for all
to authenticated
using ((select public.is_owner_aal2()))
with check ((select public.is_owner_aal2()));

drop policy if exists "owner_manage_horarios" on public.horarios;
create policy "owner_manage_horarios"
on public.horarios
for all
to authenticated
using ((select public.is_owner_aal2()))
with check ((select public.is_owner_aal2()));

drop policy if exists "owner_manage_configuracoes" on public.configuracoes;
create policy "owner_manage_configuracoes"
on public.configuracoes
for all
to authenticated
using ((select public.is_owner_aal2()))
with check ((select public.is_owner_aal2()));

drop policy if exists "owner_read_clientes" on public.clientes;
create policy "owner_read_clientes"
on public.clientes
for select
to authenticated
using ((select public.is_owner_aal2()));

drop policy if exists "owner_read_vendas" on public.vendas;
create policy "owner_read_vendas"
on public.vendas
for select
to authenticated
using ((select public.is_owner_aal2()));

drop policy if exists "owner_read_itens_venda" on public.itens_venda;
create policy "owner_read_itens_venda"
on public.itens_venda
for select
to authenticated
using ((select public.is_owner_aal2()));

-- 3. Defesa extra para a RPC SECURITY DEFINER de venda.
--    Se uma chamada autenticada tentar escrever nestas tabelas sem AAL2,
--    o trigger interrompe a transação inteira.
create or replace function public.require_owner_aal2_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- SQL Editor / operações internas sem JWT continuam possíveis.
  if (select auth.uid()) is not null then
    if not (select public.is_owner_aal2()) then
      raise exception 'MFA AAL2 obrigatório para esta operação.'
        using errcode = '42501';
    end if;
  end if;

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

revoke all on function public.require_owner_aal2_write() from public;

-- Remove versões antigas dos triggers, se existirem.
drop trigger if exists trg_require_aal2_clientes on public.clientes;
drop trigger if exists trg_require_aal2_vendas on public.vendas;
drop trigger if exists trg_require_aal2_itens_venda on public.itens_venda;

create trigger trg_require_aal2_clientes
before insert or update or delete on public.clientes
for each row execute function public.require_owner_aal2_write();

create trigger trg_require_aal2_vendas
before insert or update or delete on public.vendas
for each row execute function public.require_owner_aal2_write();

create trigger trg_require_aal2_itens_venda
before insert or update or delete on public.itens_venda
for each row execute function public.require_owner_aal2_write();

notify pgrst, 'reload schema';

commit;

-- ============================================================
-- VERIFICAÇÃO
-- ============================================================
select
  public.is_owner() as owner,
  public.is_owner_aal2() as owner_com_mfa,
  auth.jwt() ->> 'aal' as nivel_aal;

select tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and policyname like 'owner_%'
order by tablename, policyname;
