-- STUART MOTOS — correção de leitura pública do catálogo
-- Seguro para executar no Supabase SQL Editor sem apagar dados.
-- Corrige as políticas RLS de produtos, veículos e serviços para visitantes (role anon).

begin;

-- PRODUTOS: visitantes veem somente itens marcados como públicos e ativos.
drop policy if exists "public_products" on public.produtos;
create policy "public_products"
on public.produtos
for select
to anon
using (publico = true and ativo = true);

-- VEÍCULOS: visitantes veem somente veículos públicos e disponíveis.
drop policy if exists "public_vehicles" on public.veiculos;
create policy "public_vehicles"
on public.veiculos
for select
to anon
using (publico = true and status = 'disponivel');

-- SERVIÇOS: visitantes veem somente serviços públicos e ativos.
drop policy if exists "public_services" on public.servicos;
create policy "public_services"
on public.servicos
for select
to anon
using (publico = true and ativo = true);

-- Mantém acesso público somente às colunas apropriadas.
revoke all on public.produtos from anon;
grant select(id,nome,categoria,marca,preco,descricao,imagem_url,publico,ativo,created_at,updated_at)
on public.produtos to anon;

revoke all on public.veiculos from anon;
grant select(id,marca,modelo,ano,cor,quilometragem,preco,descricao,imagem_url,status,publico,created_at,updated_at)
on public.veiculos to anon;

revoke all on public.servicos from anon;
grant select(id,nome,descricao,preco_base,imagem_url,ordem,ativo,publico,created_at,updated_at)
on public.servicos to anon;

-- Atualiza o cache de schema do PostgREST/Supabase.
notify pgrst, 'reload schema';

commit;

-- Diagnóstico opcional: confira se os itens que deseja exibir estão realmente públicos.
select id, nome, ativo, publico from public.produtos order by created_at desc;
select id, marca, modelo, status, publico from public.veiculos order by created_at desc;
select id, nome, ativo, publico from public.servicos order by ordem, created_at;
