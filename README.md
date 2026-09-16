# Stuart Motos — Site Profissional V2

Nova versão inspirada na linguagem visual de sites grandes do setor automotivo, mas mantendo identidade própria da Stuart Motos.

## O que mudou

### Site público
- navegação limpa e profissional;
- hero de grande impacto;
- serviços, motos e peças carregados do Supabase;
- seção institucional e contato;
- horário aberto/fechado em tempo real;
- WhatsApp configurável pelo dono;
- responsivo.

### Acesso secreto do proprietário
Não existe botão "Admin" visível.

Para abrir o login:
- clique **5 vezes rapidamente na logo Stuart Motos** no topo; ou
- use `Ctrl + Shift + O`.

Isso apenas esconde a entrada. A segurança real continua sendo:
- email e senha do Supabase Auth;
- função `is_owner()`;
- RLS no PostgreSQL.

### Painel do dono
- dashboard;
- produtos e estoque;
- veículos;
- serviços;
- venda com produto + mão de obra + veículo;
- recibos;
- horários;
- edição do conteúdo público e contato.

## IMPORTANTE — Banco V2

O arquivo:

`supabase/01_SCHEMA_V2_RESET.sql`

**APAGA as tabelas antigas da Stuart Motos e recria o banco.**

Se houver dados importantes, faça backup antes.

### Ordem para configurar

1. Supabase > SQL Editor.
2. Execute `supabase/01_SCHEMA_V2_RESET.sql`.
3. Supabase > Authentication > Users: crie/garanta a conta do dono.
4. Abra `supabase/02_MAKE_OWNER.sql`.
5. Troque o email de exemplo pelo email real do dono e execute.
6. Execute `supabase/03_VERIFY.sql`.
7. Confira `config.js`.
8. Publique os arquivos no GitHub Pages.

## Credenciais no frontend

O `config.js` contém somente:
- Project URL;
- Publishable Key.

Nunca coloque:
- service_role;
- Secret Key;
- senha do banco.

## GitHub Pages

Coloque todos os arquivos na raiz do repositório:

- `index.html`
- `style.css`
- `app.js`
- `config.js`
- `supabase-client.js`
- `.nojekyll`
- `assets/`
- `supabase/`

Depois:
`Settings > Pages > Deploy from a branch > main > /(root)`.

## Recibos x Nota Fiscal

O painel gera recibo/documento comercial interno.

NF-e/NFC-e oficial exige integração fiscal, certificado e regras tributárias próprias.
Site Stuart Motos
