# Arquitetura Site-First — Área do Cliente JGM4

## Princípio

O cliente entra pelo site institucional e chega à Área do Cliente sem trocar de domínio:

```text
https://www.jgm4consultoria.com.br/            → site institucional (HTML estático)
        │  menu: "Área do Cliente" (<a href="/projetos/">)
        ▼
https://www.jgm4consultoria.com.br/projetos/   → JGM4 Projects (SPA Angular)
        │  chamadas XHR same-origin
        ▼
https://www.jgm4consultoria.com.br/api/        → backend NestJS
```

Não existe domínio público `app.` ou `api.`. Um host técnico só é usado em staging (e mesmo assim com os mesmos caminhos `/`, `/projetos/` e `/api/`).

## Por que `/projetos/` na mesma origem

- **Cookies e CSRF:** sessão, refresh e CSRF são cookies *host-only* (sem atributo `Domain`) com `SameSite=Strict`. Com a SPA e a API na mesma origem não há cookie de terceiros, subdomínio compartilhado nem CORS em uso.
- **Segurança:** uma única origem a proteger (`ALLOWED_ORIGINS=https://www.jgm4consultoria.com.br`), sem curingas e sem domínio amplo em cookies.
- **Experiência e confiança:** o cliente permanece em `www.jgm4consultoria.com.br`, a marca que já conhece.
- **SEO:** o site institucional não muda. A Área do Cliente é `noindex` e fica fora do sitemap.

## Responsabilidades por caminho

| Caminho | Quem atende | Observações |
|---|---|---|
| `/`, `/pages/*`, `/blog/*`, assets, `robots.txt`, `sitemap.xml` | Apache + arquivos do site | Sem alteração; 404 institucional (`404.html`, status 404) para o que não existe. |
| `/api/*` | Proxy → NestJS | Regra avaliada **primeiro**. Preserva o prefixo. |
| `/projetos/*` | Proxy → NestJS, que serve o build Angular | `<base href="/projetos/">`. Fallback SPA **somente** neste prefixo, e somente para URLs sem extensão: `/projetos/main-x.js` inexistente responde 404, nunca `index.html`. |
| qualquer outro caminho | Site institucional | Nunca cai no Angular. |

## Componentes

- **Frontend:** Angular compilado por `scripts/build-frontend.mjs` com `PUBLIC_BASE_PATH=/projetos` e `API_BASE_PATH=/api`. O caminho da API entra no `index.html` por `<meta name="jgm4-api-base-path">`; o código usa `/api` relativo, sem host.
- **Backend:** NestJS com prefixo global `/api`, atrás do Apache em `127.0.0.1:3000`. `TRUST_PROXY=1` (exatamente uma camada confiável); `validateProductionConfig` recusa iniciar em produção com `TRUST_PROXY` ausente, `true`, `*` ou número grande.
- **Banco:** PostgreSQL com TLS, usuário exclusivo da aplicação, migrations versionadas (`prisma migrate deploy`).
- **Storage:** anexos em volume privado (`STORAGE_LOCAL_DIR`), fora de qualquer pasta pública do site; download só após autorização por projeto.
- **Apache:** termina TLS, faz proxy de `/api/` e `/projetos/` e serve o site. Exemplo em [apache-area-cliente.md](apache-area-cliente.md).
- **Health:** `/api/health`, `/api/health/live` e `/api/health/ready` respondem apenas `{status}`; falha de banco devolve 503 sem detalhes.

## Ambientes

| | Local | Staging | Produção |
|---|---|---|---|
| Entrada | `http://127.0.0.1:3019/` (gateway do teste) | Host técnico temporário, p. ex. `https://<host-staging>/` | `https://www.jgm4consultoria.com.br/` |
| Área do Cliente | `/projetos/` | `/projetos/` | `/projetos/` |
| API | `/api/` | `/api/` | `/api/` |
| Banco e segredos | Postgres local `:5433`, schema temporário nos testes | Exclusivos de staging | Exclusivos de produção |
| Status | Validado (`npm run test:site-integration`) | **Não provisionado** | **Não publicado** |

Staging simula a arquitetura inteira: o host técnico precisa responder `/` (site institucional ou página de teste), `/projetos/` e `/api/`. Homologar apenas `/projetos/` não vale: o roteiro obrigatório parte da homepage (ver [homologacao-etapa-9b-3.md](homologacao-etapa-9b-3.md)).

## Cookies (revisão para produção)

| Cookie | Path | Flags | Observação |
|---|---|---|---|
| `jgm4_session` | `/api` | HttpOnly, Secure (produção), SameSite=Strict | Access token curto; nunca enviado ao site institucional. |
| `jgm4_refresh` | `/api/auth` | HttpOnly, Secure, SameSite=Strict | Só nas rotas de autenticação. |
| `jgm4_csrf` | `/` | Secure, SameSite=Strict, legível pelo front | Não é credencial. Precisa de `Path=/` porque a SPA (`/projetos/`) o lê e a API (`/api/`) o valida; é enviado também às páginas institucionais, sem efeito. |

Nenhum cookie define `Domain`. Não adicionar `Domain=.jgm4consultoria.com.br`: expõe a sessão a qualquer subdomínio.

## Privacidade e termos

`/projetos/privacy` redireciona para a página institucional `/pages/politica.html`; não há segunda versão da política. `/projetos/terms` ainda usa texto provisório (pendência jurídica registrada em [arquitetura-area-cliente.md](arquitetura-area-cliente.md)).

## SEO e indexação

HTML da Área do Cliente com `<meta name="robots" content="noindex, nofollow, noarchive">` e header `X-Robots-Tag` igual em todas as respostas da SPA. Decisão: **não** bloquear `/projetos/` no `robots.txt` — o bloqueio impediria o Google de ver o `noindex` e poderia deixar a URL listada sem conteúdo. O site institucional não recebe nenhum desses cabeçalhos.

## Como validar localmente

```bash
npm run build
BROWSER_CHANNEL=msedge npm run test:site-integration   # BROWSER_CHANNEL só se o Chromium do Playwright falhar
```

O teste sobe NestJS e um gateway que imita o virtual host (mesma ordem de regras), usa um schema PostgreSQL temporário com dados fictícios e começa pela homepage. Não substitui a validação no Apache real.
