# Validação — Etapa 6: Dashboard executivo e acompanhamento operacional

## Resultado

| Verificação | Resultado |
|---|---|
| Migrations (`20261026000100` e `20261026000200`, novos estados do projeto) | Aplicadas; schema sem divergência (8 migrations) |
| Seed (`npm run db:seed`) | Cria o projeto "Simulação — Painel executivo"; idempotente; projeto Ollem inalterado |
| Testes backend (`npm test`) | **112/112** — 94 anteriores + 18 novos (`dashboard.spec.ts`) |
| Build backend e frontend (`npm run build`) | OK |
| Navegador, `BROWSER_CHANNEL=msedge npm run test:browser` (Etapas 1–6) | OK em desktop, tablet (768 px) e mobile (390 px) |

Observações:
- Os specs antigos têm lista fixa de migrations; ela ganhou as duas migrations novas (nenhuma asserção alterada).
- O projeto Ollem real continua pristino (os testes de seed exigem isso); por isso o cenário rico está em um projeto de simulação próprio. O dashboard do Ollem mostra o estado real: 0% de progresso, Fase 0, Gate 0 bloqueado.
- O `health` continua respondendo `stage: 5` (o teste da Etapa 1 fixa esse valor); não foi alterado de propósito.

## Status do projeto

`PLANNING`, `IN_PROGRESS`, `ON_HOLD`, `IMPLEMENTATION_COMPLETED`, `CANCELLED`. `PLANNED` e `COMPLETED` ficam no enum só como legado (o PostgreSQL não remove valores); a migration converte os dados existentes e troca o padrão para `PLANNING`. O status exibido é: o armazenado se for `ON_HOLD`, `CANCELLED` ou `IMPLEMENTATION_COMPLETED`; senão `PLANNING` (nenhuma atividade iniciada e nenhuma hora lançada) ou `IN_PROGRESS`. Ainda não há tela para pôr o projeto em espera (alteração direta no banco).

## Indicadores e cálculos (`backend/src/dashboard/dashboard.calc.ts`, funções puras)

| Indicador | Regra |
|---|---|
| Progresso | `COMPLETED` ÷ atividades válidas (exclui `CANCELLED`). Nunca por tempo. Por fase, idem |
| Horas planejadas | Soma das atividades válidas (JGM4 e cliente); se a fase não tem horas JGM4 nas atividades, usa `Phase.plannedJgm4Hours` |
| Horas realizadas | **Soma de `TimeEntry`** agregada no banco (`groupBy`), por organização e fase. Nada é gravado em duplicidade |
| Saldo / consumo | planejado − realizado; realizado ÷ planejado |
| Alerta de horas | Normal < 80%; **Atenção** ≥ 80%; **Excedido** > 100% (mesma regra da Etapa 3). Em fase concluída só o excesso é sinalizado |
| Fase atual | Primeira fase (por ordem) que não está `COMPLETED` |
| Gate atual | Gate da fase atual; critérios `TASK`/`REQUEST` recalculados na leitura; percentual = atendidos ÷ total |
| Prazo | Semanas planejadas = soma das fases; decorridas = semanas desde o início (início planejado do projeto ou a 1ª atividade iniciada); restantes = planejadas − decorridas. **Não** entra em progresso |
| Previsão de término | Data mais recente entre o término planejado do projeto e as datas planejadas das atividades (alterações de prazo aprovadas já atualizam a atividade). Sem forecast avançado |
| Pendências | Itens com alguém para agir agora: atividades ativas, solicitações em andamento, Gate atual acionável e alterações de aprovação abertas. As aprovações de solicitação/atividade/Gate não são contadas em dobro (já aparecem pela própria entidade) |
| Aprovações | Aprovações abertas (`PENDING`/`IN_REVIEW`) do projeto, com quantas são de prioridade alta |

Horas medem apenas esforço: nenhum valor, custo, preço/hora ou faturamento é calculado.

## Regra de atraso

Item atrasado = tem prazo anterior a hoje **e** alguém precisa agir. Prazos considerados: atividade `nextActionDueDate` (senão `plannedEndDate`); solicitação `dueDate`; Gate `nextActionDueDate`; alteração pendente (prazo de decisão = prazo atual da atividade).

Não geram atraso: fase `LOCKED`/`BLOCKED` (nem suas atividades e solicitações); atividade `BLOCKED`/`NOT_STARTED` (aguardando dependência); itens concluídos, aceitos ou cancelados; solicitação `BLOCKED`/`PLANNED`. Aprovações de entidade não duplicam o atraso. A lista mostra dias de atraso e o responsável.

## Saúde do projeto (determinística, sem IA)

| Nível | Condições (qualquer uma) |
|---|---|
| **Crítico** | projeto `ON_HOLD`; horas JGM4 do projeto ou de alguma fase > 100%; 3+ itens atrasados; algum Gate `REJECTED` |
| **Atenção** | horas JGM4 do projeto ou de fase em andamento ≥ 80%; 1–2 itens atrasados; algum Gate `CORRECTION_REQUIRED` |
| **Normal** | nenhuma das anteriores. Projeto concluído/cancelado: Normal com o motivo ("Implantação concluída.", "Projeto cancelado.") |

Sempre retorna **motivos**, ex.: "Fase 1: 82% das horas JGM4 consumidas (32 h de 39 h).", "2 itens atrasados.", "Gate 2 em correção." Mostrados no painel do projeto e como dica/linha na carteira.

## Endpoints

| Método | Rota | Acesso |
|---|---|---|
| GET | `/api/projects/:id/dashboard` | autenticado, com vínculo e empresa (guard da Etapa 5.1); 403 sem acesso, 404 só para administrador em projeto inexistente |
| GET | `/api/dashboard` | `JGM4_ADMIN` (todos os projetos) e `JGM4_CONSULTANT` (somente vínculos ativos); cliente recebe 403 |

O DTO do projeto agrega: `project`, `currentPhase`, `progress`, `phases` (progresso/horas/Gate por fase), `hours`, `tasks`, `requests`, `gate`, `schedule`, `health`, `pending`, `approvals`, `delays`, `nextActions` (até 10), `criticalPending` (prioridade HIGH/CRITICAL), `myQueue` (itens cujo responsável é o seu perfil e, se definido, o seu usuário), `recentActivity` (até 10, do `AuditLog`, mais recente primeiro) e `topAction`. **Sem N+1:** uma única rodada de consultas para o conjunto de projetos (projetos, fases, Gates com critérios, atividades, solicitações, aprovações abertas, horas agregadas, vínculos) + 2 consultas para a atividade recente.

## Telas

- `/dashboard` (JGM4): cards (projetos ativos, em atenção, críticos, aprovações pendentes, horas registradas, itens atrasados), filtros por saúde/atraso e lista de projetos (cliente, projeto, fase, progresso, saúde, Gate, próxima ação, prazo, consultor).
- `/projects/:id/dashboard`: cabeçalho (cliente, projeto, status, fase, Gate, início, previsão, consultor, gestor, patrocinador, progresso), 6 cards, saúde com motivos e regras, linha do tempo das 5 fases e progresso por fase, horas JGM4/cliente, Gate atual, prazo, próximas ações, minha fila, pendências críticas, atrasos, resumo de solicitações e de atividades e últimas movimentações.
- **Drill-down:** atrasados → âncora da lista de atrasos; aprovações → Central filtrada pelo projeto; Gate → detalhe do Gate; cada item → atividade/solicitação/aprovação; saúde na carteira → painel.
- **Após o login:** administrador → `/dashboard`; quem tem um único projeto vai direto ao painel dele; consultor com vários → carteira; cliente com vários → Início. Clientes não veem o link nem acessam a carteira JGM4.
- Responsivo: cards empilhados (2 colunas no mobile), tabela vira cartões no mobile, sem rolagem horizontal.

## Testes (`backend/test/dashboard.spec.ts`, 18)

Cobrem os itens 1–21 pedidos: progresso (38%) e por fase; cancelada fora do cálculo; horas JGM4/cliente e saldo (contra o banco); alertas de 80% e > 100%; bloqueada e fase bloqueada sem atraso; atraso com dias e responsável; saúde Normal/Atenção/Crítico com motivos (inclui `ON_HOLD` e Gate rejeitado/em correção); Gate atual e próxima ação; minha fila por perfil; membership; cliente sem acesso à carteira; admin vê todos; consultor só vinculados (e vínculo inativo); atividade recente ordenada e limitada; previsão de término. O item 22 (suítes anteriores) está verde.

## Cenário de demonstração (seed)

Projeto **Simulação — Painel executivo**: Fase 0 concluída (Gate 0 aprovado), Fase 1 em execução (30% geral; JGM4 32 h de 39 h = atenção), uma atividade e uma solicitação atrasadas, 21 atividades bloqueadas, atividade cancelada, solicitações em 6 estados, 21 lançamentos de horas (JGM4 e cliente), Gate 1 com 4/9 critérios, 3 aprovações pendentes (solicitação, validação e alteração de prazo) e histórico recente. Usuários: ver `validacao-etapa-5-1.md` (o consultor e os usuários `@demo.ollem.local` têm vínculo).

## Capturas (em `.local/screenshots/`, ignorado pelo Git)

`etapa-6-carteira-desktop.png`, `etapa-6-projeto-desktop.png`, `etapa-6-carteira-mobile.png`, `etapa-6-projeto-mobile.png`.

## Limitações

- Previsão de término é simples (sem forecast); progresso e prazo são independentes por desenho.
- `ON_HOLD`/`CANCELLED` ainda não têm tela de alteração.
- "Minha fila" usa perfil e responsável da atividade/solicitação; ainda não há atribuição individual de Gates e alterações além do perfil.
- Sem gráficos avançados, exportações (PDF/Excel), financeiro ou notificações externas (fora do escopo).
