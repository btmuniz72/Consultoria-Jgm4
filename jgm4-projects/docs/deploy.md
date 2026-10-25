# Deploy — JGM4 Projects

## Arquitetura pública

A experiência de produção deve ser apresentada como Área do Cliente do site institucional: `https://www.jgm4consultoria.com.br/projetos/`, conforme o canonical atual. O mesmo host atende a API em `/api`. O JGM4 Projects pode continuar em processo e infraestrutura separados; o proxy reverso encaminha os dois caminhos ao upstream da aplicação e preserva o prefixo `/projetos`. O menu da homepage contém o link “Área do Cliente”.

O site é HTML estático com `.htaccess`, que atualmente serve 404 real para rotas ausentes. A regra de encaminhamento deve ser configurada no virtual host antes dessa resposta 404. Não altere `.htaccess` com uma regra presumida nem substitua o virtual host existente com base nos exemplos deste repositório. Encaminhe apenas `/projetos` e `/api`, preservando as rotas e conteúdo públicos. A integração conceitual e os limites estão em [arquitetura-area-cliente.md](arquitetura-area-cliente.md).

O pacote JGM4 Projects pode atender a SPA e à API pela mesma origem. No contêiner, o Angular é compilado com base `/projetos/`; o Nest serve os arquivos e o fallback da SPA nesse prefixo, enquanto as rotas Nest continuam em `/api`. Cookies de sessão usam `/api` e `/api/auth`; o cookie CSRF permanece em `/`, para que o navegador o envie e o Angular o leia quando opera em `/projetos`.

## Pré-requisitos para uma publicação futura

Definir com a JGM4 o proxy compatível com o servidor atual do site, domínio e DNS de staging, serviço de aplicação, PostgreSQL gerenciado com TLS e backup, storage privado, SMTP com SPF/DKIM/DMARC e cofre de segredos. Nenhum desses recursos foi criado por esta revisão.

## Staging

1. Usar um host técnico isolado, por exemplo `https://staging-projetos.jgm4consultoria.com.br`; staging não altera o site institucional.
2. Criar banco exclusivo, usuário da aplicação restrito ao schema, usuário separado para migrations quando possível, rede privada e backup.
3. Guardar segredos somente no cofre e definir `APP_ENV=staging`, `PUBLIC_APP_URL=https://staging-projetos.jgm4consultoria.com.br/projetos`, `PUBLIC_BASE_PATH=/projetos`, `API_BASE_PATH=/api`, `ALLOWED_ORIGINS=https://staging-projetos.jgm4consultoria.com.br` e `FRONTEND_DIST_DIR` para o diretório compilado.
4. Construir o contêiner, que compila o Angular para `/projetos/`; aplicar migrations com `npm run prisma:migrate -w backend` e publicar apenas no host de staging.
5. Executar `BASE_URL=https://staging-projetos.jgm4consultoria.com.br/projetos npm run smoke:external` (PowerShell: `$env:BASE_URL='https://staging-projetos.jgm4consultoria.com.br/projetos'; npm run smoke:external`). Com `SMOKE_EMAIL` e `SMOKE_PASSWORD` configurados no ambiente, o smoke verifica cookies, CSRF e logout.
6. Executar os testes externos de navegador com a mesma `BASE_URL` e usuários de homologação, conforme `docs/homologacao-etapa-9.md`.

## Release posterior

1. `npm test`, `npm run build`, `npm run db:status` e `npm run test:browser` locais; revisar `npm audit --omit=dev`.
2. Fazer backup e confirmar cópia externa.
3. Em staging: migrations compatíveis, publicação, smoke HTTPS e cenários de navegador/responsividade.
4. Confirmar com o responsável pelo site que o proxy mantém `/projetos` e `/api` no mesmo host, não remove o prefixo da SPA e não muda qualquer outro caminho público.
5. Produção só após decisão explícita de go-live, checklist completo, aprovação responsável e plano de rollback. Esta revisão não publica staging nem produção.

## Infraestrutura que continua necessária

PostgreSQL gerenciado com TLS; storage privado persistente (ou provedor compatível); SMTP real; backups e teste de restore; segredos no cofre; logs sanitizados e rotacionados; monitoramento de `/api/health/live` e `/api/health/ready`. Veja `deploy/`, `docs/plano-rollback.md` e `docs/backup-e-restore.md`.
