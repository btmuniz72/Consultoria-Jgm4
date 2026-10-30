# Fase 1 da Ollem — modelagem e carga (Etapa 10B.1)

A Fase 1 (**Estruturação do CD, 04/11/2026 a 31/01/2027**) é detalhada **dentro do projeto Ollem existente**. As 4 fases contratuais e os Gates GATE-0 a GATE-3 não mudam. Fase 2: fevereiro e março/2027. Fase 3: após a Fase 2.

## Onde cada coisa fica no banco

| O quê | Onde |
|---|---|
| Exercício / atividade / entrega | `Task` (campos novos: `category`, `classification`, `priority`, `milestoneId`, `responseData`) |
| Responsáveis, prazos, dependência | `clientResponsibleUserId`, `jgm4ResponsibleUserId`, `plannedStartDate/EndDate`, `predecessorTaskId`, `ExternalDependency` |
| Resposta e evidência | `TaskEvidence` (texto/link), `Attachment` (arquivo; metadados no banco, arquivo no storage) |
| Comentário e nota interna JGM4 | `Comment` (append-only; chaves compostas garantem mesmo projeto; nota interna só JGM4 lê e escreve) |
| Aprovação da atividade | status da `Task` + `Approval` (validação JGM4) |
| Marcos internos M1–M4 | `PhaseMilestone` + `MilestoneCriterion` (separados dos Gates contratuais) |
| Histórico | `AuditLog` |
| Percentual | **calculado** (`tasks/progress.ts`), nunca gravado |

## Regras

- Marcos M1–M4 **não** alteram o GATE-1, o status das fases nem pagamentos.
- Atividades novas têm `requiredForGate = false`.
- Exercícios absorvidos: EX-01 e EX-02 em **C01**, EX-03 em **C12**, EX-07 em **C11** (C10 define o padrão; C11 valida na prática).
- Atividades novas: EX-04, EX-05, EX-06, EX-08, EX-09, EX-10, EX-11 e CAB-01 a CAB-05 (12). C05 passa a ter EX-04 como predecessora.
- `classification`: `EXECUTE_NOW`, `PARALLEL`, `ACQUISITION`, `DEVELOPMENT`, `FUTURE` (rótulos em português na interface).

## Perfis

- `CLIENT_USER` (Operacional): executa atividades, envia evidências, anexa arquivos e comenta. Não decide Gate/marco, não altera estrutura nem usuários, não vê notas internas.
- `CLIENT_EXECUTIVE` (Diretoria): somente leitura (bloqueio central em toda rota que altera estado, exceto a conta pessoal). Não aprova por padrão.
- Decisão de marco: `CLIENT_SPONSOR` e `CLIENT_MANAGER`.

## Carga

```powershell
npm run db:migrate      # 2 migrations novas (client_executive_role, phase1_modeling)
npm run ollem:phase1    # idempotente; corrige datas/nomes, enriquece C-atividades, cria 12 atividades e M1–M4
```

O script preserva IDs e histórico, não sobrescreve campos preenchidos manualmente e registra tudo no `AuditLog` (`OLLEM_PHASE1_*`). As datas previstas dos marcos ficam em branco para a JGM4 definir.

## Pendências desta etapa

- Telas de marcos, comentários e dos novos campos na interface (back-end e API prontos).
- Integração dos marcos à Central de Aprovações.
- Armazenamento persistente de anexos em produção (9B.3G).
