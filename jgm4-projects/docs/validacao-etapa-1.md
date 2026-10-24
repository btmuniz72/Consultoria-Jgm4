# Verificação da Etapa 1

Executada localmente em **22/10/2026**, horário de São Paulo.

## Resultado

- Migration `20261022000100_initial` aplicada com sucesso no PostgreSQL 18.6 exclusivo, porta 5433.
- `prisma migrate status`: banco atualizado, uma migration aplicada.
- Seed Ollem executado com sucesso: 1 empresa, 1 projeto, 5 fases, 5 Gates e 2 atividades da Fase 0. Nenhum usuário criado.
- Backend NestJS e frontend Angular compilados com sucesso. Bundle inicial de produção do frontend: aproximadamente 250 kB.
- **11 testes de integração aprovados**, utilizando PostgreSQL real.
- Verificação automatizada do navegador aprovada em desktop (1440 px) e mobile (390 px), incluindo recuperação de falha de conexão.
- Health check HTTP confirmou `status: ok`, `database: connected` e `stage: 1`.
- Consulta via proxy do Angular confirmou 16 semanas, 198 horas JGM4, 5 fases e 5 Gates.
- Capturas de desktop e mobile revisadas visualmente.
- `.env`, cluster local, dependências, Prisma Client gerado e builds confirmados como ignorados pelo Git.
- As alterações já existentes no site e no aplicativo de diagnóstico foram preservadas.
- Parada e reinício do cluster, seguidos do comando integrado `npm run setup`, verificados com sucesso; nenhuma migration pendente e seed preservado.

## Comandos executados

Na pasta `jgm4-projects/`:

```powershell
npm install --no-fund --no-audit
npm run db:start
npm run db:generate
npm exec --workspace backend -- prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script --output prisma/migrations/20261022000100_initial/migration.sql
npm run db:migrate
npm run db:seed
npm run db:status
npm run build
npm run test
npx playwright install chromium
npm run dev
npm run test:browser
npm run db:stop
npm run setup
```

A migration foi gerada pelo Prisma a partir do schema e aplicada pelo Prisma Migrate; não foi usado `db push` nem reset de banco existente. Houve ajuste da unicidade composta de Gate antes de aplicar a migration e do gerenciamento de processos do PostgreSQL no Windows antes da verificação final.

## Cobertura dos testes

Integração: conexão real; leitura da Ollem; filtro por empresa; totais e metadados do projeto; ordem e estados iniciais de fases/Gates; atividades por projeto; rejeição de UUID e filtros inválidos; projeto inexistente; ausência de rotas de escrita/workflow; integridade referencial composta de Gate/Task; seed reexecutável sem duplicação ou sobrescrita. As fixtures temporárias são removidas pelo teste; o teste de relação inválida usa rollback.

Navegador: redirecionamento inicial; carregamento real por HTTP; totais; cinco fases e cinco Gates; abertura da pergunta de Gate; recarga da URL; layout sem rolagem horizontal em 390 px; lista vazia; projeto inexistente; API indisponível; recuperação pelo botão de nova tentativa; ausência de erros JavaScript.

Capturas locais (ignoradas no Git):

- `../.local/screenshots/desktop.png`
- `../.local/screenshots/mobile.png`

## Versões verificadas

- Node.js 24.21.0; npm 11.19.0.
- Angular core 21.2.25; Angular CLI 21.2.28.
- NestJS core 11.2.7.
- Prisma Client/CLI 7.10.1, com adapter PostgreSQL.
- TypeScript 5.9.3.

## Limite da aprovação

Essas verificações aprovam a base local de leitura da Etapa 1. Autenticação, autorização multiempresa e workflow operacional ainda precisam de etapas próprias. A entrega termina na Etapa 1, aguardando validação do usuário.

Os servidores usados na verificação foram encerrados. Para abrir a entrega novamente, execute `npm run db:start` e `npm run dev`; os dados e o `.env` local permanecem preservados.
