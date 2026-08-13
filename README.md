# Stuart Motos — Supabase + GitHub Pages

Esta versão foi preparada para:

- banco PostgreSQL no Supabase;
- Supabase Auth;
- visitante sem login;
- login exclusivo do dono;
- RLS para impedir alterações por visitantes;
- CRUD de produtos;
- CRUD de veículos;
- horários editáveis pelo dono;
- vendas com produtos, mão de obra e veículo;
- baixa de estoque no banco;
- recibos;
- publicação como site estático no GitHub Pages.

## Ordem correta de configuração

### 1. Crie o projeto no Supabase

Crie um projeto e aguarde o banco ficar disponível.

### 2. Execute o banco

Abra:

`SQL Editor`

e execute o arquivo:

`supabase/schema.sql`

### 3. Crie o usuário do dono

No Supabase:

`Authentication > Users > Add user`

Crie o email e a senha do proprietário.

Não existe tela de cadastro público no site.

### 4. Marque o usuário como owner

Abra:

`supabase/make_owner.sql`

Troque:

`TROQUE_PELO_EMAIL_DO_DONO@exemplo.com`

pelo email real criado no Authentication e execute o arquivo no SQL Editor.

Isso evita erros de UUID.

### 5. Pegue as credenciais públicas

No painel do Supabase, copie:

- Project URL;
- Publishable Key.

Em projetos antigos, pode aparecer `anon key`.

NUNCA use no frontend:

- service_role;
- secret key;
- senha do banco.

### 6. Configure o site

Abra:

`config.js`

e troque:

```js
supabaseUrl: "COLE_SUA_PROJECT_URL_AQUI",
supabasePublishableKey: "COLE_SUA_PUBLISHABLE_KEY_AQUI"
```

pelos valores do seu projeto.

### 7. Teste localmente

O ideal é abrir com um servidor local em vez de clicar diretamente no HTML.

Se tiver Python:

```bash
python -m http.server 5500
```

Depois abra:

`http://localhost:5500`

### 8. Publique no GitHub Pages

Crie um repositório no GitHub e coloque TODO o conteúdo desta pasta na raiz.

A estrutura deve ficar assim:

```text
index.html
style.css
config.js
supabase-client.js
app.js
.nojekyll
assets/
supabase/
README.md
```

Depois, no repositório:

`Settings > Pages`

Escolha publicar pela branch principal (`main`) e pasta raiz (`/`), ou use GitHub Actions.

### 9. Configure a URL no Supabase

Quando o GitHub Pages gerar a URL final, configure no Supabase:

`Authentication > URL Configuration`

Use o endereço final do site como `Site URL`.

Se futuramente usar recuperação de senha, login social ou links por email, configure também os Redirect URLs.

## Segurança

A Publishable Key fica visível no navegador por natureza.

A proteção vem de:

1. autenticação Supabase Auth;
2. RLS nas tabelas;
3. função `is_owner()`;
4. nenhuma Secret Key/service_role no site;
5. função SQL `registrar_venda()` verificando o owner e fazendo a venda em uma transação.

## Nota fiscal

O sistema gera recibo/documento comercial interno.

Para NF-e/NFC-e oficial no Brasil será necessário outro estágio com integração fiscal, certificado digital, dados tributários e normalmente uma função/backend protegido.
