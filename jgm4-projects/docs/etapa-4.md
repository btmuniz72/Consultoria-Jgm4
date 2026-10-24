# Etapa 4 — Gates e liberação controlada

## Regra de decisão

Um Gate fica `BLOCKED` enquanto houver atividade da fase não concluída ou solicitação obrigatória bloqueante sem aceite. O backend recalcula os critérios automáticos e muda o Gate para `AVAILABLE`, com registro de auditoria. A disponibilidade permite análise, mas não autoriza avanço.

Fluxo: `BLOCKED → AVAILABLE → UNDER_REVIEW → TECHNICALLY_APPROVED → APPROVED`. Durante a análise, JGM4 pode solicitar correção (`CORRECTION_REQUIRED`) e retomar a revisão. O parecer favorável da JGM4 não libera fase; apenas a decisão `APPROVE` do patrocinador Ollem faz isso. `HOLD` conserva a aprovação técnica sem liberar a fase; `REJECT` encerra o avanço.

Critérios `TASK` e `REQUEST` são calculados pelo sistema. Os demais critérios são técnicos e só o perfil JGM4 pode validá-los. Quando um critério exige evidência, a referência fica no próprio critério e no AuditLog. O parecer favorável é recusado se houver critério obrigatório pendente.

## Fases

Na implantação do Plano C, Fase 0 fica `AVAILABLE` e Fases 1–4 ficam `LOCKED`. O início da primeira atividade registra a fase como `IN_PROGRESS`. Ao concluir as atividades, ela passa a `WAITING_GATE`. A aprovação do Gate conclui a fase e libera a próxima como `AVAILABLE`; as atividades da nova fase são liberadas respeitando predecessor e solicitações. Gate 4 aprovado encerra o projeto como `IMPLEMENTATION_COMPLETED`.

O backend também bloqueia início, checklist, envio para validação e lançamento de horas em atividade de fase `LOCKED`, mesmo se uma chamada for feita diretamente à API.

## Endpoints

- `GET /projects/:projectId/gates` e `GET /projects/:projectId/gates/:gateId` — sequência, critérios, atividades, solicitações e histórico.
- `POST /gates/:id/start-review`, `/request-correction`, `/resume-review`, `/technical-opinion`, `/client-decision` e `/criteria` — transições formais e avaliação manual.

Cada transição, alteração de critério, disponibilidade automática, início/conclusão de fase e liberação de fase gera AuditLog. Histórico não é removido.

## Cenário de demonstração

O seed mantém SOL-006 pendente e C05 bloqueada. O Gate 0 também permanece bloqueado enquanto houver atividades pendentes na Fase 0. Acesse **Gates** no menu do projeto para consultar os cinco Gates e abrir o detalhe.

Para percorrer uma decisão completa em ambiente local, use o perfil JGM4 para iniciar análise, validar critérios manuais, resolver atividades e solicitações pendentes e emitir parecer técnico `ADVANCE`. Mude `JGM4_LOCAL_ACTOR` para `CLIENT` e reinicie a API para registrar a decisão do patrocinador. A aprovação Ollem libera a fase seguinte; o perfil local é apenas uma chave de demonstração, pois a autenticação definitiva está fora desta etapa.

## Critérios sem pessoas fictícias

O seed cria os critérios dos cinco Gates sem criar usuários, decisões, pareceres ou evidências fictícias. Itens manuais começam pendentes. As referências de evidências podem ser URLs ou identificadores de documentos existentes.
