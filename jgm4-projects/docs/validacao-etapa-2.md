# Validação da Etapa 2

Execução local em **22/10/2026**, horário de São Paulo.

## Resultado

- PostgreSQL 18.6, porta 5433, preservado. Duas migrations aplicadas; `prisma migrate status` confirmou banco atualizado.
- Migration `20261022000200_requests` aplicada sem reset ou exclusão dos dados da Ollem.
- Seed atualizado e executado: 1 empresa, 1 projeto, 5 fases, 5 Gates, 2 atividades e 10 solicitações. Seis disponíveis e quatro futuras bloqueadas; sem usuários fictícios.
- Horas e duração preservadas: **198 h JGM4 e 16 semanas**.
- Backend e frontend compilados. Bundle inicial de produção do Angular: aproximadamente **345 kB**.
- **30 testes de integração aprovados**, em duas suítes: 11 originais da Etapa 1, inalterados, e 19 da Etapa 2.
- Regressão de navegador da Etapa 1 aprovada; o ponto de entrada do teste foi ajustado de `/` para `/projects` porque `/` agora é a tela inicial solicitada. As verificações anteriores do plano foram preservadas.
- Navegador da Etapa 2 aprovado: início, fila, filtros, bloqueio, ciclo completo com ajuste e aceite, relação SOL-006/C05, roteiro, rascunho, documento preenchível independente, impressão/PDF, proteção do conteúdo exportado e mobile.
- Capturas de início desktop/mobile e detalhe da solicitação revisadas visualmente.
- Consulta HTTP real pelo proxy do Angular confirmou projeto, totais e as dez solicitações.
- Conferência final: nenhum schema temporário de teste remanescente; banco principal da Ollem mantém 6 solicitações AVAILABLE e 4 BLOCKED, sem avanço causado pelos testes. Frontend retornou HTTP 200 e health check confirmou conexão do PostgreSQL.

## Arquivos criados

| Área | Arquivos |
| --- | --- |
| Migration | `backend/prisma/migrations/20261022000200_requests/migration.sql` |
| Backend | `backend/src/requests/plan-c-requests.ts`, `requests.dto.ts`, `requests.service.ts`, `requests.controller.ts` |
| Integração | `backend/test/requests.spec.ts` |
| Início e navegação | `frontend/src/home.component.ts`, `project-nav.component.ts` |
| Solicitações | `frontend/src/request.types.ts`, `requests.component.ts`, `request-detail.component.ts`, `request-detail.component.html` |
| Alinhamento | `frontend/src/alignment.data.ts`, `alignment-document.ts`, `alignment.component.ts` |
| Scripts | `scripts/browser-check-stage2.ts`, `scripts/export-alignment-document.ts` |
| Documentação | `docs/etapa-2.md`, `docs/validacao-etapa-2.md`, `docs/alinhamento-plano-c-preenchivel.html` |

## Arquivos alterados

- `backend/prisma/schema.prisma`, `backend/prisma/seed.ts`.
- `backend/src/app.module.ts`, `configure-app.ts`, `main.ts`.
- `backend/src/prisma/prisma.service.ts`: seleção explícita do schema PostgreSQL, mantendo `public` como padrão e permitindo os testes isolados.
- `backend/src/projects/projects.service.ts`: informação adicional sobre bloqueio por solicitações nas atividades.
- `frontend/src/main.ts`, `project-plan.component.ts`, `project-plan.component.html`, `styles.css`.
- `frontend/package.json`, `package-lock.json`: inclusão do módulo oficial `@angular/forms`, alinhado à versão do Angular existente.
- `package.json`: comandos de verificação da Etapa 2 e geração do documento.
- `scripts/browser-check.ts`: entrada da regressão do plano em `/projects`.
- `README.md`.

O teste `backend/test/read-api.spec.ts`, a migration original, o site institucional e o e-book não foram alterados. Os arquivos e alterações preexistentes fora desta aplicação foram preservados.

## Migration e seed

A migration adiciona `ProjectRequest`, `RequestRequirement`, `AuditLog` e o enum de solicitações. Inclui chaves estrangeiras compostas para preservar o vínculo correto entre projeto, fase e atividade, além de triggers de imutabilidade da auditoria.

A atividade de zoneamento existente passou de `F0-002` para `C05`, mantendo ID, título e demais dados existentes. A mudança de código fica registrada na auditoria. Instalações novas recebem o código C05 diretamente pelo seed.

O gerador `ensurePlanCRequests` centraliza a criação antecipada das dez solicitações e seus requisitos. O seed chama esse gerador na transação do projeto. A reexecução preserva status, requisitos e respostas existentes. SOL-006 está vinculada a C05 e possui seis requisitos obrigatórios. SOL-007 a SOL-010 existem no banco, bloqueadas pelo Gate anterior.

O escopo não acrescenta cadastro de projetos via HTTP; essa integração utiliza o ponto único do template quando esse cadastro for implementado. A API original de projetos continua de leitura.

## Endpoints e regras

Os endpoints, payloads, filtros, códigos HTTP e a matriz de transições estão em [etapa-2.md](etapa-2.md#endpoints).

O caminho principal é `AVAILABLE → REQUESTED → CLIENT_PREPARING → SENT_TO_JGM4 → JGM4_REVIEW → ACCEPTED`. O pedido de ajuste vai de `JGM4_REVIEW` para `ADJUSTMENT_REQUESTED` e retorna à preparação do cliente pela ação `start`. O envio exige requisitos obrigatórios completos no backend; ajuste exige motivo. Não há PATCH genérico de status, cancelamento, aprovação de Gate ou início de atividade.

## Testes de integração

Foram verificados os onze cenários exigidos: bloqueada não enviada, disponível enviada, início da preparação, rejeição sem requisitos, envio com requisitos completos, início da revisão, pedido de ajuste, retorno ao cliente, aceite, permanência no histórico e remoção da dependência sobre C05.

Os cenários adicionais cobrem geração antecipada/auditoria, DTOs, filtros, referências entre projetos, ausência de alteração arbitrária de status, controle de versão e concorrência, revalidação do Gate, imutabilidade de logs e idempotência do template. O aceite remove apenas o bloqueio por solicitação; o status da atividade permanece `BLOCKED`, preservando a separação do workflow de atividades.

Os testes da Etapa 2 aplicam as migrations em um schema PostgreSQL temporário próprio. O navegador utiliza uma API temporária na porta 3001 e redireciona somente suas chamadas de teste para esse backend real. Os namespaces de teste são descartados ao encerrar. Os testes não avançam as solicitações da Ollem no schema principal.

## Documento e roteiro

- Tela com 17 partes do roteiro fornecido e 12 informações de síntese.
- Rascunho salvo no navegador, por projeto; recarga recupera o preenchimento.
- Download de HTML independente com as respostas presentes.
- Edição fora do aplicativo e botão **Salvar cópia preenchida** verificados pela abertura da cópia salva.
- Impressão da tela e geração de PDF verificadas pelo navegador automatizado.
- Texto contendo tags de script foi tratado como conteúdo, sem execução no documento exportado.
- Documento em branco gerado em `docs/alinhamento-plano-c-preenchivel.html`.

Essas respostas são notas de alinhamento. Não alteram solicitações ou Gates e não são compartilhadas automaticamente entre navegadores.

## Comandos executados

Na pasta `jgm4-projects/`:

```powershell
npm run db:start
npm run db:generate
npm exec --workspace backend -- prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script --output prisma/migrations/20261022000200_requests/migration.sql
npm run db:migrate
npm run db:seed
npm install @angular/forms@21.2.25 --workspace frontend --no-fund --no-audit
npm run test
npm run build
npm run db:status
npm run docs:alignment
npm run dev
npm run test:browser
```

Após o ajuste de interação dos checkboxes, o build do frontend e o teste completo de navegador foram executados novamente. Os 11 testes originais de integração não receberam alterações.

## Teste manual e estado da entrega

Abra **http://127.0.0.1:4200/**. Use os acessos **Plano de implantação**, **Solicitações** e **Reunião de alinhamento**. O procedimento completo está em [Como testar manualmente](etapa-2.md#como-testar-manualmente).

A aplicação permanece disponível localmente, retomando o ambiente que o usuário havia solicitado abrir. Caso seja encerrada, execute `npm run db:start` e `npm run dev`.

Autenticação, RBAC e visibilidade específica do cliente continuam para uma etapa própria, conforme o prompt. O ambiente atual é local, com visão completa JGM4 e organização responsável derivada da ação, sem identidade autenticada. A entrega termina na Etapa 2 e aguarda validação do usuário. A Etapa 3 não foi iniciada.
