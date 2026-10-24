# Validação da Etapa 3

## Resultado

Etapa 3 implementada e validada localmente. A logo JGM4 está no cabeçalho e no documento independente da reunião. C00 inicia liberada; C05 permanece bloqueada pela SOL-006 até que a solicitação seja aceita.

## Arquivos e mudanças

- `backend/prisma/schema.prisma`: ciclo de status, dependências, responsáveis e datas da atividade, planejamento decimal, versão otimista, checklist, evidências e `TimeEntry`.
- `backend/prisma/migrations/20261023000100_task_workflow/migration.sql`: migração aditiva que preserva o ID do kick-off ao mapear F0-001 para C00; preenche o plano de C00/C05 quando não havia valor e registra auditoria. As migrations 1 e 2 permanecem intactas.
- `backend/prisma/seed.ts`: plano de 33 atividades, distribuído entre as cinco fases; cria critérios do checklist e logs sem inventar pessoas ou entradas de horas realizadas.
- `backend/src/tasks/`: rotas, validações de transição, checklist, evidências, apontamentos, totais, alertas e auditoria.
- `backend/src/requests/requests.service.ts`: o aceite da última solicitação bloqueante tenta liberar a atividade na mesma transação e registra o evento de sistema.
- `backend/test/tasks.spec.ts`: 12 testes de integração adicionais em schema temporário.
- `frontend/src/task-detail.component.ts`, `frontend/src/task-detail.component.html` e `frontend/src/styles.css`: detalhe da atividade, dependências, próxima ação, checklist, evidências, horas e histórico responsivo.
- `frontend/src/project-plan.component.ts`, `frontend/src/project-plan.component.html` e `frontend/src/project.types.ts`: resumo de horas e contagem de atividades em cada fase, com link para cada atividade.
- `scripts/browser-check-stage3.ts`: teste desktop e mobile com duas instâncias locais de API (JGM4 e Ollem) e banco isolado.
- `docs/etapa-3.md`, `README.md` e esta validação: regras e operação.
- A imagem original está em `frontend/public/assets/brand/logo-jgm4.png`. O documento da reunião em `docs/alinhamento-plano-c-preenchivel.html` inclui a logo embutida.

## Migration, seed e totais

`npm run db:status` retornou três migrations aplicadas e schema atualizado. `npm run db:seed` terminou sem apagar ou reiniciar estados existentes.

O banco local da demonstração contém 33 atividades. A soma JGM4 por fase verificada pela API é **36, 39, 47, 39 e 37 horas**, totalizando **198 h**. O esforço Ollem total planejado é **192 h**. Na Fase 0, a distribuição segue o exemplo recebido: C00 6 h, C01 8 h, C02 4 h, C03 6 h, C04 5 h, C05 4 h, C06 1 h e G0 2 h. As estimativas Ollem da Fase 0 incluem C01 6 h, C04 12 h e C05 8 h.

O estado público inicial foi conferido pela API: C00 `RELEASED`; C05 `BLOCKED`, dependência pendente `SOL-006`; fase 0 = 36 h; projeto = 198 h. Os testes de navegação e integração gravam dados somente em schemas temporários e removem esses schemas ao terminar.

## Workflow e páginas

Status: `BLOCKED → RELEASED → IN_PROGRESS → WAITING_EVIDENCE → WAITING_JGM4_VALIDATION → VALIDATED → COMPLETED`; ajuste segue `WAITING_JGM4_VALIDATION → ADJUSTMENT_REQUESTED → IN_PROGRESS`. Não há alteração genérica de status.

Para demonstrar C05 bloqueada/liberada:

1. Abra `http://127.0.0.1:4200/projects/9f1ead00-1c44-4000-8000-000000000002/plan` e selecione **C05 · Zoneamento**. A tela mostra **Bloqueada por SOL-006**.
2. Abra Solicitações, escolha SOL-006, envie à Ollem, complete seus seis critérios, envie a resposta à JGM4, inicie a análise e aceite.
3. Volte ao Plano C. O backend registra `RELEASED` em auditoria e C05 passa a permitir início. A Etapa 3 no navegador fez o mesmo ciclo em schema descartável.

Na tela da atividade, inicie a tarefa, complete os critérios, registre pelo menos uma evidência, encaminhe para validação, valide como JGM4 e conclua. O teste desktop passou pelo ciclo e verificou a barra móvel, a mensagem de 80% e a conclusão. O teste móvel confirmou que a tela cabe na largura do celular.

Para registrar horas, mantenha a atividade aberta e use **Registrar horas**. Informe data, quantidade decimal e descrição. O backend associa `JGM4` ou `CLIENT` ao apontamento de acordo com `JGM4_LOCAL_ACTOR` no `.env`; o navegador não escolhe a organização. Para testar o outro perfil, altere o valor para `CLIENT` ou `JGM4` e reinicie a API. Ao lançar 3,2 h numa tarefa planejada para 4 h, a tela exibe o alerta de 80%. Novos lançamentos acima do plano permanecem aceitos.

Como ainda não há login na aplicação, o perfil é uma configuração do servidor local, não uma identidade autenticada. IDs de usuário ficam nulos; nenhuma pessoa ou hora realizada foi inventada pelo seed. Evidências são descrições com link/referência, sem upload de arquivos.

## Endpoints adicionados

`GET /projects/:projectId/tasks/:taskId`, `POST /tasks/:id/start`, `/send-validation`, `/submit-evidence`, `/validate`, `/request-adjustment`, `/resume`, `/complete`, `PATCH /tasks/:id/requirements/:requirementId`, `POST /tasks/:id/evidence`, `POST /tasks/:id/time-entries`, `PATCH /tasks/:id/plan`, `GET /projects/:projectId/activity-summary/phases` e `GET /projects/:projectId/activity-summary`.

As transições, alterações do checklist, evidências, horas e mudanças de plano produzem AuditLog imutável. Soma, saldo e alerta são calculados a partir das entradas, nunca gravados diretamente na Task.

## Verificações

- `npm run db:status`: três migrations aplicadas.
- `npm run db:seed`: concluído; registros existentes preservados.
- `npm test`: **42 testes passaram** em três suítes, incluindo os 30 das etapas anteriores.
- `npm run build`: build NestJS e Angular passou.
- `node scripts/browser-check.ts`: plano desktop/mobile passou contra a API local.
- `npm run test:browser:stage2`: solicitações e alinhamento passaram no browser.
- `npm run test:browser:stage3`: logo, 198 h, SOL-006/C05, início, alerta de 80%, checklist, evidência, validação, conclusão e mobile passaram.

As capturas locais estão em `.local/screenshots/`, incluindo `etapa-3-c05-bloqueada.png`, `etapa-3-atividade-c05.png` e `etapa-3-atividade-mobile.png`.

Etapa 3 encerrada. Nenhuma funcionalidade da Etapa 4 foi iniciada.
