# Apache — Área do Cliente (Site-First)

## Estado

Este documento prepara a configuração; nenhuma alteração foi aplicada ao Apache ou ao `.htaccess` institucional, e nada foi publicado. A experiência pública é `https://www.jgm4consultoria.com.br/` → "Área do Cliente" → `https://www.jgm4consultoria.com.br/projetos/`, com a API em `/api/`, tudo na mesma origem ([site-first-architecture.md](site-first-architecture.md)). O mesmo upstream interno atende `/projetos/` (SPA) e `/api/` (NestJS).

Em 2026-10-26, em produção, `GET /projetos/` e `GET /api/health` respondem o 404 institucional, o que confirma que o proxy ainda não existe. Observação: `HEAD` nessas URLs retornou 200 enquanto `GET` retorna 404; verifique essa diferença com o provedor, pois HEAD e GET devem concordar.

## Ordem das regras (obrigatória)

1. `/api/*` → proxy para o NestJS.
2. `/projetos/*` → proxy para o NestJS, que serve a SPA.
3. Fallback SPA **somente** em `/projetos/*` (feito pela aplicação; o Apache não tem fallback global).
4. Demais URLs → site institucional.
5. 404 institucional (`ErrorDocument 404 /404.html`, status 404) para rotas públicas inexistentes.

O proxy tem de vir **antes** da regra final do `.htaccess` que devolve 404 para caminhos que não são arquivo nem diretório. Nunca configure fallback para `/`, `/contato`, `/sobre`, `/servicos`, `/blog`, `/politica-de-privacidade` ou qualquer página institucional.

## VirtualHost de referência (placeholders — não aplicar sem revisão)

Pressupõe Apache terminando TLS e a aplicação acessível só em `127.0.0.1:<PORTA_APP>` (container publicado como `127.0.0.1:3000:3000`, nunca na interface pública). Módulos: `mod_proxy`, `mod_proxy_http`, `mod_headers`, `mod_alias`, `mod_ssl`.

```apache
<VirtualHost *:443>
    ServerName   <HOST_PUBLICO>            # produção: www.jgm4consultoria.com.br
    DocumentRoot <DIRETORIO_DO_SITE>       # somente o site institucional publicado
    SSLEngine on
    SSLCertificateFile    <CAMINHO_CERTIFICADO>
    SSLCertificateKeyFile <CAMINHO_CHAVE>

    ErrorDocument 404 /404.html            # status 404 preservado

    ProxyRequests Off
    ProxyPreserveHost On
    # O Apache é o único proxy confiável: sobrescreve o que o cliente enviar.
    RequestHeader set X-Forwarded-Proto "https"
    RequestHeader set X-Forwarded-Port  "443"

    # 1. API
    RedirectMatch 308 ^/api$ /api/
    ProxyPass        "/api/" "http://127.0.0.1:<PORTA_APP>/api/" connectiontimeout=5 timeout=60
    ProxyPassReverse "/api/" "http://127.0.0.1:<PORTA_APP>/api/"

    # 2/3. Área do Cliente (a SPA trata os deep links)
    RedirectMatch 308 ^/projetos$ /projetos/
    ProxyPass        "/projetos/" "http://127.0.0.1:<PORTA_APP>/projetos/" connectiontimeout=5 timeout=60
    ProxyPassReverse "/projetos/" "http://127.0.0.1:<PORTA_APP>/projetos/"

    # 4/5. Todo o restante: site institucional + .htaccess existente (canonical, redirects, 404).
    <Directory <DIRETORIO_DO_SITE>>
        AllowOverride All
        Options -Indexes
        Require all granted
    </Directory>
</VirtualHost>
```

Não use IPs, portas ou nomes fictícios como definitivos: `<...>` precisa ser preenchido pelo responsável do servidor. Revise limites de corpo e timeout para uploads conforme `UPLOAD_MAX_MB`.

### Pontos de atenção a validar no Apache real

- **Cabeçalhos do `.htaccess` institucional.** O `.htaccess` define `Header set Content-Security-Policy`, `Referrer-Policy`, `Cross-Origin-Opener-Policy` e `X-Frame-Options` para tudo o que o diretório serve. Dependendo de como o proxy é montado, esses cabeçalhos podem sobrescrever os da aplicação (CSP específica da SPA e da API, `Referrer-Policy: no-referrer`). Após a implantação, compare os cabeçalhos de `/projetos/` e `/api/health` com os do backend direto; se divergirem, escope-os com `<Location "/projetos/">` / `<Location "/api/">` ou use `Header unset` nesses prefixos para que valham os da aplicação. Não afrouxe a CSP institucional para acomodar a SPA.
- **Interação com o 404 do `.htaccess`.** Com `ProxyPass` no virtual host, as regras de `.htaccess` não deveriam ser avaliadas para esses prefixos; confirme que `/projetos/qualquer-rota` não devolve 404 institucional e que `/rota-inexistente` continua devolvendo.
- **Pastas não públicas.** O repositório contém `jgm4-projects/`, `backups-remotos-ftps/`, `ferramentas/` e outros diretórios de trabalho. Garanta que o processo de publicação do site os exclua do `DocumentRoot` (o código e o `.env` do backend nunca devem ficar sob a raiz pública). Em 2026-10-26, `jgm4-projects/package.json` e `backups-remotos-ftps/` responderam 404 em produção e `ferramentas/` 403, mas isso depende da publicação, não do `.htaccess`.

## Alternativa só com `.htaccess`

Exige `mod_rewrite`, `mod_proxy`, `mod_proxy_http` e `AllowOverride FileInfo`. As regras `[P]` ficam depois da canonicalização de protocolo/host e **antes** da regra final de 404, com `/api/` primeiro:

```apache
RewriteRule ^api/?$        http://127.0.0.1:<PORTA_APP>/api/        [P,L]
RewriteRule ^api/(.*)$     http://127.0.0.1:<PORTA_APP>/api/$1      [P,L]
RewriteRule ^projetos/?$   http://127.0.0.1:<PORTA_APP>/projetos/   [P,L]
RewriteRule ^projetos/(.*)$ http://127.0.0.1:<PORTA_APP>/projetos/$1 [P,L]
```

Não testada no servidor; o virtual host é preferível. Hospedagem compartilhada costuma não permitir `[P]` para `localhost`.

## Proxy confiável (`TRUST_PROXY`)

Com uma única camada Apache, `TRUST_PROXY=1`, e somente se a porta da aplicação for inacessível externamente e o Apache sobrescrever `X-Forwarded-*`. Isso garante `req.secure`, cookies `Secure`, IP de auditoria e limites de requisição corretos. Em produção a aplicação **recusa iniciar** com `TRUST_PROXY` ausente (sem ele o redirecionamento HTTPS entraria em laço) ou amplo demais (`true`, `*`, `all`, mais de 3 saltos). Se houver CDN ou outro proxy, defina saltos/endereços confiáveis exatos; `mod_remoteip` apenas para proxies conhecidos.

## Verificação após a implantação

Antes de recarregar: `apachectl configtest`. Depois, a partir da homepage: `/`, clique em "Área do Cliente", `/projetos/`, refresh em `/projetos/login` e em rota profunda, assets e chunks sob `/projetos/`, `/api/health/live`, `/api/health/ready`, login, cookies (host-only, `Secure`, `HttpOnly`), CSRF, logout, o 404 de `/rota-publica-inexistente` e os cabeçalhos citados acima. Nada disso foi executado contra Apache real nesta etapa; o teste local `npm run test:site-integration` usa um gateway que imita a ordem das regras.
