# Apache — Área do Cliente

## Estado

Este documento prepara a configuração; nenhuma alteração foi aplicada ao Apache ou ao `.htaccess` institucional. O site público continua em `https://www.jgm4consultoria.com.br`, servido como HTML estático. A aplicação JGM4 Projects atende a SPA em `/projetos/` e a API em `/api/`, pelo mesmo upstream interno.

O `.htaccess` institucional canonicaliza para `www.jgm4consultoria.com.br` e responde 404 para caminhos que não são arquivos ou diretórios reais. Um host de staging não deve herdar essa regra: use virtual host, `DocumentRoot` e configuração próprios, sem redirecionar o host técnico para produção. Na produção, o proxy precisa ser configurado no virtual host SSL e encaminhar esses prefixos antes do 404 do `.htaccess`.

## Exemplo para revisão pelo responsável do servidor

Confirme versão do Apache, módulos, topologia e upstream antes de adaptar. A configuração pressupõe Apache terminando TLS e o processo da aplicação acessível somente no próprio host em `127.0.0.1:3000`. O container escuta internamente em `0.0.0.0:3000`; publique a porta no host como `127.0.0.1:3000:3000`, nunca diretamente na interface pública.

Habilite `mod_proxy`, `mod_proxy_http`, `mod_headers` e `mod_alias` (ou use regras equivalentes de rewrite). Dentro do virtual host HTTPS:

```apache
ProxyRequests Off
ProxyPreserveHost On
ProxyAddHeaders On

# O Apache é o único proxy confiável neste exemplo. Sobrescreva valores
# recebidos do cliente; não aceite X-Forwarded-Proto arbitrário.
RequestHeader set X-Forwarded-Proto "https"
RequestHeader set X-Forwarded-Port "443"

RedirectMatch 308 ^/projetos$ /projetos/
RedirectMatch 308 ^/api$ /api/

ProxyPass        "/projetos/" "http://127.0.0.1:3000/projetos/" connectiontimeout=5 timeout=60
ProxyPassReverse "/projetos/" "http://127.0.0.1:3000/projetos/"
ProxyPass        "/api/"      "http://127.0.0.1:3000/api/"      connectiontimeout=5 timeout=60
ProxyPassReverse "/api/"      "http://127.0.0.1:3000/api/"
```

Preserve os prefixos no destino. Não configure fallback de SPA em `/`; o fallback pertence exclusivamente às rotas `/projetos/*` e é servido pela aplicação. Os demais caminhos continuam no site institucional. Revise também limites de corpo/timeout para uploads conforme a política do servidor e da aplicação.

Se a hospedagem só permitir `.htaccess`, a alternativa exige `mod_rewrite`, `mod_proxy`, `mod_proxy_http` e `AllowOverride FileInfo`. As regras `[P]` devem ficar depois do canonical HTTP/host e antes do 404 existente, no diretório raiz:

```apache
RewriteRule ^projetos/?$ http://127.0.0.1:3000/projetos/ [P,L]
RewriteRule ^projetos/(.*)$ http://127.0.0.1:3000/projetos/$1 [P,L]
RewriteRule ^api/?$ http://127.0.0.1:3000/api/ [P,L]
RewriteRule ^api/(.*)$ http://127.0.0.1:3000/api/$1 [P,L]
```

Essa alternativa não foi testada no servidor e não deve ser copiada sem confirmar permissões e suporte do provedor. O virtual host é preferível.

## Proxy confiável e verificação

Para uma única camada Apache, configure `TRUST_PROXY=1` somente se a porta da aplicação estiver inacessível externamente e o Apache substituir os cabeçalhos encaminhados. Não use `TRUST_PROXY=true` indiscriminadamente. Se houver CDN ou outro proxy, identifique endereços e saltos confiáveis antes de configurar Express; se necessário, configure `mod_remoteip` apenas para proxies conhecidos. O encaminhamento incorreto afeta HTTPS, cookies seguros, IP de auditoria e limites de requisição.

Antes de qualquer recarga, valide sintaxe (`apachectl configtest` ou `httpd -t`), revise o virtual host efetivo e faça teste de configuração em staging. Após autorização e implantação pelo responsável, verifique `/`, `/projetos/`, refresh de rotas profundas, assets, `/api/health/live`, `/api/health/ready`, login, cookies e a resposta 404 de caminhos públicos desconhecidos. Esses comandos não foram executados contra Apache real nesta etapa.
