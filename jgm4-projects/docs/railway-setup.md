# Railway — preparo para implantação futura

Este documento descreve uma alternativa técnica de hospedagem para o serviço JGM4 Projects. Railway não foi contratado nem configurado por esta revisão. O site institucional pode continuar em seu provedor atual; nenhuma tecnologia do servidor institucional foi presumida.

## Domínios e caminhos

Em produção, a URL de apresentação é `https://jgm4consultoria.com.br/projetos/`. Se o serviço ficar no Railway, o administrador do site institucional deverá configurar no proxy já existente duas rotas no mesmo host:

- `/projetos` e `/projetos/*` para o serviço JGM4 Projects, mantendo o caminho completo;
- `/api` e `/api/*` para o mesmo serviço, mantendo `/api`.

O upstream deve receber `Host` e `X-Forwarded-Proto`; configure `TRUST_PROXY` somente para os saltos confiáveis. O backend usa `req.secure` para redirecionamento HTTPS e cookies seguros. Não use configuração que capture `/`, remova o prefixo da SPA ou altere os outros caminhos do site. O formato exato depende do servidor/CMS existente e deve ser implementado pelo responsável por ele.

Staging pode usar um domínio Railway ou `staging-projetos.jgm4consultoria.com.br`; não deve compartilhar banco, cookies ou dados de produção.

## Serviço

O `Dockerfile` da raiz do projeto produz a API NestJS e o frontend Angular no mesmo serviço. O frontend usa `FRONTEND_BASE_PATH=/projetos/`; a API atende `/api`. Configure porta pela variável `PORT` injetada pelo Railway e escuta em `0.0.0.0`. Health check sugerido: `/api/health/ready`.

Variáveis mínimas devem ser fornecidas pelo painel/secret manager, nunca commitadas: `APP_ENV`, `DATABASE_URL` com TLS, `JWT_SECRET`, `DATA_ENCRYPTION_KEY`, `BACKUP_ENCRYPTION_KEY`, `PUBLIC_URL`, `ALLOWED_ORIGINS`, `FRONTEND_BASE_PATH`, `FRONTEND_DIST_DIR`, `TRUST_PROXY`, `REQUIRE_MFA_FOR_ADMIN=true`, `STORAGE_LOCAL_DIR` (se storage local persistente for escolhido), configuração de SMTP e `PRIVACY_CONTACT_EMAIL`. Validar a lista real em `deploy/production.env.example` e a validação de configuração do backend.

## Banco, arquivos e e-mail

Use PostgreSQL gerenciado com TLS, acesso de rede limitado e credenciais exclusivas. Executar migrations como etapa de release com `npm run prisma:migrate -w backend`; não executar `db push` em produção. Anexos precisam de volume privado persistente montado em `STORAGE_LOCAL_DIR` ou storage externo compatível. Confirmar limites, isolamento, backup, retenção e restauração. Configurar SMTP com remetente do domínio autenticado por SPF/DKIM/DMARC.

## Proxy, cookies e segurança

Proxy HTTPS → serviço JGM4 Projects. A API continua em `/api` na mesma origem, evitando CORS no uso normal. Cookies de sessão são `HttpOnly`, `Secure` em produção, `SameSite=Strict`, com caminhos `/api` e `/api/auth`; o cookie CSRF tem caminho `/` para funcionar entre `/projetos` e `/api`. Manter CSRF, verificação de origem, MFA, memberships, isolamento por empresa/projeto, auditoria, SecurityEvent, headers e rate limits. Nunca confiar em headers encaminhados de origem não confiável.

## Publicação controlada

Criar o projeto e domínio no Railway somente após contratação/autorização próprias, testar primeiro em staging, verificar `db:status`, migrations, health, smoke externo e navegador. A configuração Railway isolada não integra automaticamente o domínio institucional: o proxy do site precisa ser configurado por sua equipe. Esta documentação não autoriza nem executa criação de serviço, DNS ou publicação.
