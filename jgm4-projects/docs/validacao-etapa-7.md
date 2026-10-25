# Validação — Etapa 7: Relatórios executivos, exportações e fechamento do projeto

## Resultado

| Verificação | Resultado |
|---|---|
| Migration `20261027000100_reports` | Aplicada; schema sem divergência (9 migrations) |
| Seed | Cria "Simulação — Implantação concluída" (habilita o Relatório Final); idempotente |
| Testes backend (`npm test`) | **130/130** — 112 anteriores + 18 novos (`reports.spec.ts`) |
| Build backend e frontend | OK (telas novas carregadas sob demanda; bundle inicial 442 kB) |
| Navegador (`BROWSER_CHANNEL=msedge npm run test:browser`, Etapas 1–7) | OK em desktop, tablet (768 px) e mobile (390 px), com **download real** de PDF e XLSX |

## Relatórios

Todos são montados de forma determinística a partir dos dados registrados (sem IA) em um modelo único de documento (seções). O mesmo modelo gera a **prévia na tela** e o **PDF** (pdfkit, no backend).

| Relatório | Rota (prévia JSON · download) | Observações |
|---|---|---|
| Executivo do projeto | `reports/executive` · `/pdf` | Identificação, resumo, progresso, horas (JGM4/cliente), Gates, solicitações, pendências, riscos e próximos passos. Opção `?detail=true` lista as solicitações |
| Da fase | `reports/phases/:phaseId` · `/pdf` | Período, progresso, atividades, horas, solicitações, pendências, riscos, Gate, próximos passos |
| Encerramento da fase | `reports/phases/:phaseId/closure` · `/pdf` | **409** se o Gate da fase não estiver `APPROVED`. Inclui desvios e pendências transferidas |
| Do Gate (registro formal) | `reports/gates/:gateId` · `/pdf` | Critérios, evidências, **PARECER TÉCNICO JGM4** e **DECISÃO DO CLIENTE** em blocos separados, usuários envolvidos, auditoria relevante, pendências atuais |
| Final de implantação | `reports/final` · `/pdf` | 12 seções. **409** a menos que o projeto esteja `IMPLEMENTATION_COMPLETED` e o Gate final `APPROVED` |
| Plano de Ação | `reports/action-plan` · `/xlsx` | 21 colunas pedidas (atividade, datas, próxima ação, horas planejadas/realizadas JGM4 e cliente, dependências, observações) |
| Horas | `reports/hours` · `/xlsx?from&to&phaseId&organization&userId` | Aba "Horas" + aba "Totais". Fonte: `TimeEntry`. Sem valores financeiros |
| Histórico de solicitações | `reports/requests` · `/xlsx` | Datas de criação, solicitação, envio e aceite (do AuditLog), prazo, atraso e resultado |
| Auditoria | `GET audit` · `audit/xlsx` | Filtros: período, usuário, entidade, ação; paginação (`limit`/`offset`). Somente leitura |
| Histórico de exportações | `GET reports/history` | Documento, formato, usuário, data |

Regras determinísticas: **pendências** = atrasados + prioridade alta/crítica + Gate em correção + aprovações abertas + atividades bloqueadas da fase atual (duplicatas mescladas, motivos concatenados); **riscos** = motivos da saúde + bloqueios + alterações de prazo pendentes + previsão de término ausente; **próximos passos** (até 10) = ordenados por prioridade, atraso, prazo e código.

Arquivos: `Ollem_Plano_C_Relatorio_Executivo_2026-11-15.pdf`, `Ollem_Plano_C_Plano_de_Acao.xlsx`, `Ollem_Plano_C_Gate_1.pdf`, `Ollem_Plano_C_Relatorio_Final.pdf`, etc. PDFs: logo JGM4, cliente/projeto/data no cabeçalho de **todas** as páginas, rodapé "JGM4 Consultoria Logística · projeto · Página X de Y · data", tabelas com cabeçalho repetido e quebra de página. XLSX reais (exceljs): cabeçalho estilizado, autofiltro, primeira linha congelada, larguras, datas do Excel e horas numéricas. Sem assinatura eletrônica.

## Ciclo de vida do projeto (`ON_HOLD` / `CANCELLED`)

| Ação | Rota | Regras |
|---|---|---|
| Suspender | `POST projects/:id/status/hold` | Motivo, data de efeito e observação obrigatórios; previsão de retomada opcional. De `PLANNING`/`IN_PROGRESS` |
| Cancelar | `POST projects/:id/status/cancel` | Motivo, data e observação obrigatórios. Irreversível |
| Retomar | `POST projects/:id/status/resume` | Motivo obrigatório; `ON_HOLD` → `IN_PROGRESS` |
| Histórico | `GET projects/:id/status` | Eventos imutáveis (`ProjectStatusEvent`) |

Somente `JGM4_ADMIN` altera; cada mudança grava evento + `AuditLog` (`PROJECT_ON_HOLD`/`PROJECT_CANCELLED`/`PROJECT_RESUMED`). **Projeto cancelado é somente consulta**: atividades, solicitações, Gates, aprovações, apontamentos, plano de sustentação e pendências transferidas devolvem 409; consulta, dashboard, relatórios e auditoria continuam. Projeto suspenso mostra "Projeto temporariamente suspenso" (motivo, data e previsão) nos relatórios e a saúde fica **Crítica**.

## Plano de sustentação e pendências transferidas

`GET/POST sustainment`, `PATCH sustainment/:itemId` (itens são desativados, nunca apagados) e `GET/POST carried-items`, `POST carried-items/:itemId/resolve`. Escrita só para perfis JGM4; clientes (patrocinador/gestor) leem. A pendência transferida registra descrição, responsável, prazo e fase de destino (posterior à de origem; a fase de origem precisa estar encerrando — Gate com parecer favorável ou aprovado) e nunca é apagada. Tudo é auditado. Tela: `/projects/:id/manage` (apenas JGM4).

## Segurança

- Todas as rotas passam pelo `ProjectAccessGuard` (vínculo + empresa) e por `@Roles`: relatórios e exportações para `JGM4_ADMIN`, `JGM4_CONSULTANT`, `CLIENT_SPONSOR`, `CLIENT_MANAGER`; **`CLIENT_USER` não acessa** relatórios; auditoria apenas JGM4 e patrocinador; alteração de situação só administrador.
- Gate/fase de outro projeto devolve 404 mesmo com acesso ao projeto atual; usuário sem vínculo e cliente de outra empresa recebem 403 em todas as rotas (testado por rota); sem token, 401.
- Cada download grava `ReportGenerationLog` (tipo, formato, arquivo, parâmetros, usuário e perfil). Prévias não geram registro. Os registros são somente de acréscimo (trigger).
- Respostas de download usam `Cache-Control: private, no-store`.

## Telas

`/projects/:id/reports` (Central + histórico), `/projects/:id/reports/view/:kind` (prévia com botão de download), `/projects/:id/audit` (filtros, paginação, XLSX), `/projects/:id/manage` (situação, sustentação, pendências). Navegação do projeto ganhou Relatórios, Auditoria e Gestão (conforme o perfil).

## Testes (`backend/test/reports.spec.ts`, 18)

Cobrem os itens 1–19 pedidos: relatório do projeto correto e PDF real (texto extraído); 403 sem vínculo e entre empresas; horas vindas de `TimeEntry`; progresso igual ao dashboard; Gate e pendências atuais; pendências críticas; XLSX do plano (colunas, filtro, painel congelado, tipos); XLSX de horas com filtros; auditoria filtrada e imutável; encerramento de fase só com Gate aprovado (parecer e decisão separados); relatório final condicionado; `ON_HOLD`/`CANCELLED` exigem motivo e só o administrador; projeto cancelado bloqueia execução; retomada auditada; exportação registra usuário; acesso externo bloqueado; plano de sustentação. O item 20 (suítes anteriores) está verde.

## Capturas (`.local/screenshots/`, ignorado pelo Git)

`etapa-7-central-desktop.png`, `etapa-7-executivo-desktop.png`, `etapa-7-final-desktop.png`, `etapa-7-auditoria-desktop.png`, `etapa-7-gestao-desktop.png` e versões `-mobile`.

## Limitações

- Prévia de Plano de Ação, Horas e Solicitações mostra até 200 linhas; o XLSX contém tudo (limite de 20.000 linhas por exportação).
- O filtro por usuário no relatório de horas existe na API, mas não na tela (falta lista de membros do projeto — tratada na Etapa 8).
- O PDF usa a fonte padrão (WinAnsi); caracteres fora dela são substituídos.
- Não há armazenamento permanente dos arquivos (gerados sob demanda), assinatura eletrônica, financeiro ou envio por e-mail (fora do escopo).
