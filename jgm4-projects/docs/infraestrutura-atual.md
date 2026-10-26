# Infraestrutura atual — levantamento (Etapa 9B.3B)

Levantamento feito em 2026-10-26 apenas com evidências do workspace e com consultas públicas somente de leitura ao site e ao DNS (`GET`/`HEAD`, `nslookup`, `openssl s_client`). Nenhum login, FTP, alteração de DNS ou contratação foi feito, e nenhum segredo foi lido ou registrado. Onde não há evidência, o item está como **NÃO IDENTIFICADO**.

## 1. Resumo do site institucional

```text
Site institucional:    jgm4consultoria.com.br (canônico: https://www.jgm4consultoria.com.br)
Tecnologia:            HTML/CSS/JS estático escrito à mão, com 4 scripts PHP de formulário. Sem framework e sem CMS (não há WordPress, package.json nem build na raiz).
Forma de publicação:   FTPS (curl com ssl-reqd, porta 21) por scripts PowerShell locais, com backup remoto prévio e verificação SHA-256 (scripts/Publicar-Jgm4Ftps.ps1). Sem GitHub Actions nem pipeline.
Servidor conhecido:    HostGator Brasil, servidor br198-ip04.hostgator.com.br (192.185.177.37); raiz remota /jgm4consultoria.com.br
Web server:            nginx/1.29.8 na frente (cabeçalho Server; X-Proxy-Cache) e Apache atrás, inferido pelo .htaccess ativo (RewriteRule e Header set funcionando). Versão do Apache: NÃO IDENTIFICADO.
Acesso conhecido:      FTPS com credencial no Gerenciador de Credenciais do Windows (alvo JGM4_FTPS), fora do repositório. SSH, painel (cPanel/similar) e acesso ao DNS: NÃO IDENTIFICADO.
```

Nenhuma evidência de cPanel, Plesk, Hostinger, Locaweb, AWS, Azure, Railway, Render, VPS, Docker, rsync ou SSH no site institucional. O Railway só aparece como hipótese em `docs/railway-setup.md`, sem contratação.

## 2. Evidências por fonte

| Fonte | O que comprova |
|---|---|
| `scripts/Jgm4Ftps.Common.ps1`, `Publicar-Jgm4Ftps.ps1`, `Testar-FtpsJgm4.ps1` | Host HostGator BR, FTPS, raiz `/jgm4consultoria.com.br`, credencial em cofre do Windows. O publicador recusa as pastas `.git`, `.agents`, `.codex`, `.claude`, `.vscode`, `scripts`, `documentacao`, `test-artifacts-identidade` e `backups-remotos-ftps`, além de `backup-*` e `deploy-*`. |
| `nslookup` | NS = `ns198/ns199.hostgator.com.br` (DNS gerenciado no HostGator); `www` → `192.185.177.37`, mesmo IP do FTPS; MX = `mx1/mx2.titan.email`. |
| Cabeçalhos HTTP de `/` | `Server: nginx/1.29.8`, `X-Server-Cache`, `X-Proxy-Cache`; cabeçalhos de segurança vindos do `.htaccess`. |
| Redirects ao vivo | `http→https`, sem `www`→`www`, `/web/blog.html`→`/pages/blog.html` e `/index.html`→`/` respondem 301: **`mod_rewrite` no `.htaccess` funciona em produção**. |
| `produtos/estoque-facil/submit.php` (GET → 405) | **PHP executa** em produção. |
| `lead-service.php` | PHP usa PDO/SQLite em `../jgm4-private/*.sqlite` (pasta fora da raiz pública) e PHPMailer por SMTP (`SMTP_*` em `.env` do site). Indica área gravável acima do `DocumentRoot`. |
| TLS (`openssl s_client`) | Certificado Let's Encrypt `*.jgm4consultoria.com.br` (wildcard), vence em 2026-12-07. Quem renova (HostGator ou outro) e se é automático: NÃO IDENTIFICADO. |
| DNS TXT | SPF `v=spf1 include:spf.titan.email ~all`; **DMARC ausente** (`_dmarc` inexistente); DKIM: seletor NÃO IDENTIFICADO. |
| `GET /jgm4-projects/.env` em produção | 406 (WAF/ModSecurity ou regra equivalente). `jgm4-projects/package.json` e `/docs/` respondem 404: o código da aplicação não está publicado. |
| `GET /projetos/` e `GET /api/health` em produção | 404 institucional: o proxy ainda não existe. |
| `GET /web/cursos.html` em produção | 404: a regra 301 adicionada ao `.htaccess` no commit de 2026-10-26 **ainda não foi enviada ao servidor**. |

## 3. `.htaccess` atual

| Bloco | Regra | Precisa permanecer intacta? |
|---|---|---|
| Geral | `Options -Indexes`; `ErrorDocument 404 /404.html` | Sim. |
| Compressão | Brotli/Deflate por tipo | Sim. |
| Cache | `mod_expires` e `Cache-Control`: HTML 10 min com `must-revalidate`, assets 1 ano | Sim. Assets da SPA em `/projetos/` têm hash; ver risco no item 7. |
| MIME/charset | UTF-8, AVIF, WebP, WOFF2, manifest | Sim. |
| Redirects legados | `web/(web/)?{sobre,blog,analise,politica,cursos}.html`, `blog-logistica/`, `contato-consultoria-logistica/`, `categoria-produto/consultoria/`, `produto/consultoria-em-gestao-de-armazem/`, `pages/consultor-logistico.html`, `consultor-logistico.html`, `produtos/doca-certa/` → destinos absolutos `https://www…` | Sim: são URLs antigas indexadas pelo Google. |
| Rotas limpas | `consultor-logistico/index.html` e `consultoria-logistica-para-pequenas-empresas/index.html` → URL com `/` | Sim. |
| 410 | `produto/ferramenta-de-planejamento-de-rotas/`, `tag/*` | Sim. |
| Home | `index.html` → `https://www…/` (301) | Sim. |
| Canonical | HTTPS e `www` em um único salto | Sim, mas o proxy do `/projetos/` e `/api/` tem de ficar **depois** dele e antes do 404. |
| 404 real | `RewriteCond !-f` e `!-d` → `[R=404]` | Sim, mas **captura qualquer caminho que não seja arquivo**, inclusive `/api/*` e `/projetos/*`: o proxy precisa ser avaliado antes. |
| Headers | CSP, CSP-Report-Only (Trusted Types), COOP, `nosniff`, Referrer-Policy, Permissions-Policy, `X-Frame-Options: SAMEORIGIN` para todas as respostas | Sim para o site. Para `/projetos/` e `/api/` precisam ser escopados (ver [apache-area-cliente.md](apache-area-cliente.md)); a CSP da SPA é diferente. |

## 4. Capacidade do ambiente atual

Classificação: SUPORTADO (comprovado), PROVAVELMENTE SUPORTADO, NÃO SUPORTADO (comprovado que não), NÃO IDENTIFICADO.

| Capacidade | Classificação | Evidência / lacuna |
|---|---|---|
| Frontend Angular estático em `/projetos/` | **SUPORTADO** | Arquivos HTML/CSS/JS já são servidos; o build tem 1,5 MB em 42 arquivos. Basta publicar a pasta por FTPS. |
| SPA fallback limitado a `/projetos/*` | **PROVAVELMENTE SUPORTADO** | `mod_rewrite` em `.htaccess` funciona em produção; seria uma regra `RewriteCond !-f` → `/projetos/index.html` restrita ao prefixo, mas não foi testada no servidor. |
| Reverse proxy `/api/* → backend externo` | **NÃO IDENTIFICADO** | Exige `mod_proxy` + `mod_proxy_http` e permissão para `[P]` em `.htaccess` apontando para host externo. Hospedagem compartilhada costuma bloquear isso, mas não há evidência do plano. É o **principal ponto a provar**. |
| Backend NestJS (Node 24 persistente) | **NÃO IDENTIFICADO** (sem evidência de suporte) | Nenhum indício de Node, SSH, Passenger ou processo persistente; só PHP. Tratar como indisponível até que o painel ou o suporte confirme. |
| PostgreSQL | **NÃO IDENTIFICADO** (sem evidência de suporte) | O site usa SQLite via PHP, o que não indica nenhum banco de servidor. Planos compartilhados costumam oferecer MySQL/MariaDB, não PostgreSQL 18 com TLS. |
| Storage privado persistente | **PROVAVELMENTE SUPORTADO** só para arquivos | Existe área gravável fora da raiz pública (`jgm4-private`). Não serve ao backend, que não roda lá. |
| SMTP | **SUPORTADO** | Caixa Titan Email e SMTP já usado pelo PHP dos formulários; host, limites e envio automatizado em volume: NÃO IDENTIFICADO. |
| HTTPS/TLS | **SUPORTADO** | Certificado válido, HTTP→HTTPS em 301. |
| Backup do servidor atual | NÃO IDENTIFICADO | Existe só o backup remoto feito localmente pelos scripts antes de cada publicação. |
| Monitoramento | NÃO IDENTIFICADO | Nada no repositório. |

Conclusão técnica: o servidor atual hospeda com folga o **front estático**, mas nada prova que ele execute o backend, o PostgreSQL ou o proxy externo.

## 5. O que a Área do Cliente exige do ambiente (resumo)

Detalhado em [arquitetura-producao.md](arquitetura-producao.md). Todas as exigências abaixo vêm do código: `engines` Node `>=24 <25`; Prisma 7 com `@prisma/adapter-pg`; migrations do PostgreSQL (versão local 18.6); armazenamento só em disco (`STORAGE_PROVIDER=local`; qualquer outro valor lança erro porque não há adaptador); e-mail por SMTP (Nodemailer) obrigatório em produção; antimalware ClamAV exigido por padrão em produção (`SCAN_REQUIRED`).

## 6. Pendências de informação externa

1. Plano exato do HostGator (compartilhado, revenda, VPS ou dedicado) e acesso ao painel.
2. O plano permite `mod_proxy` / `[P]` em `.htaccess` para um host externo? Há Node.js persistente e PostgreSQL?
3. Quem administra o DNS e quem renova o certificado wildcard.
4. SMTP: host, porta, limites de envio e seletor DKIM da Titan.
5. Backup do servidor atual (frequência, retenção, quem restaura).

## 7. Riscos já visíveis

- **Cache longo × SPA.** O `.htaccess` define `Cache-Control: max-age=31536000` para `.js` e `.css`. Os arquivos do Angular têm hash no nome, então é seguro; o `index.html` da SPA precisa continuar com cache curto (a aplicação já envia `no-cache`).
- **CDN/proxy nginx na frente** (`X-Proxy-Cache`): pode armazenar respostas de `/api/` e `/projetos/`. É preciso garantir `Cache-Control: no-store` na API e conferir se o cache da frente respeita os cabeçalhos antes de qualquer login real. NÃO IDENTIFICADO como se configura.
- **Publicador FTPS sem bloqueio de `jgm4-projects/`.** O publicador recusa certas pastas, mas **`jgm4-projects`, `node_modules` e `.env` não estão na lista**. Hoje o código não está no servidor porque o pacote enviado é montado à parte; recomenda-se incluí-los na lista de recusa (alteração simples em `scripts/Publicar-Jgm4Ftps.ps1`, não feita nesta etapa).
- **HEAD × GET divergentes** em URLs inexistentes (HEAD → 200, GET → 404). Perguntar ao provedor.
- **Certificado vence em 2026-12-07:** confirmar renovação automática.
- **Regra do `.htaccess` (`/web/cursos.html` e `/produtos/doca-certa/`) ainda não publicada**.
