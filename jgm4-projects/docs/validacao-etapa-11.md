# Validação da Etapa 11 — Templates reutilizáveis de projetos

A estrutura do Plano C deixou de ser um botão/arquivo fixo: é o **template `PLAN_C` v1**, administrado pela JGM4 em `/admin/templates`, e novos projetos nascem de **qualquer template ativo**. Nenhum outro template foi cadastrado (somente o Plano C); a estrutura está pronta para receber outros. Etapa 12 não iniciada.

## 1. Modelo
`ProjectTemplate` (`code`, `name`, `description`, `version`, `status` DRAFT/ACTIVE/INACTIVE/ARCHIVED, `createdByUserId`, `createdAt/updatedAt`, `validatedAt`, `methodology`; único por `code+version`) com entidades **próprias**, sem ligação às tabelas de execução: `TemplatePhase`, `TemplateGate` (+ `TemplateGateCriterion`), `TemplateTask` (+ `TemplateChecklistItem`), `TemplateRequest` (+ `TemplateRequestRequirement`, prazo relativo opcional) e `TemplateDependency`.
Dependências são por código, dentro do mesmo template: `TASK_AFTER_TASK` (predecessora), `TASK_BLOCKED_BY_GATE` (atividade bloqueada por Gate de fase anterior) e `REQUEST_FOR_TASK` (solicitação vinculada a atividade). Gate → fase é estrutural (um Gate por fase).
`Project` ganhou apenas a **referência histórica**: `templateId`, `templateVersion`, `templateNameSnapshot`, `templateVersionSnapshot`. O projeto não consulta o template depois de criado. Migração `20261102000100_project_templates` (somente tabelas/colunas novas).

## 2. Plano C v1
`ensurePlanCTemplate` registra `PLAN_C` v1 **ACTIVE** (“Plano C — Implantação Assistida”) a partir de `plano-c.data.ts` e `plan-c-requests.ts`, **idempotente**, na inicialização da API (e usável como script); a aplicação não depende do seed. Conteúdo preservado: 5 fases, 5 Gates com critérios, **33 atividades**, **10 solicitações**, checklists (2 itens por atividade), dependências e horas — JGM4 por fase **36 / 39 / 47 / 39 / 37 = 198 h** e as horas do cliente de cada atividade.

## 3. Ciclo de vida e versionamento
| Ação | Regra |
|---|---|
| Criar | template vazio, `DRAFT` v1; código único (maiúsculas, números, `_`) |
| Editar estrutura | **somente DRAFT** (fases, Gates, critérios, atividades, checklist, solicitações, requisitos, dependências); qualquer outro estado → 409 |
| Metadados | nome/descrição editáveis exceto ARCHIVED |
| Validar | erros impedem ativar; avisos apenas informam (veja §4) |
| Ativar | só DRAFT e só válido; opção explícita **“inativar versões ativas anteriores”** (padrão: não altera nada) |
| Nova versão | de ACTIVE/INACTIVE, copia a estrutura para um DRAFT com versão+1 (um rascunho por código); não copia projetos |
| Inativar / Reativar | ACTIVE ↔ INACTIVE (reativar exige template já validado) |
| Arquivar | some da lista de novos projetos; projetos existentes seguem normais |
Somente **ACTIVE** pode criar projeto (409 caso contrário).

## 4. Validação (botão “Validar template”)
Erros: sem fases; sequência de fases não contínua a partir de 0; códigos duplicados; atividade/solicitação sem fase válida; horas ou prazos negativos; dependência para item inexistente; **dependência circular**; atividade com mais de uma predecessora; atividade bloqueada por Gate que não é de fase anterior; solicitação e atividade vinculadas em fases diferentes. Avisos: sem checklist/requisitos/Gate/critérios; horas da fase diferentes da soma das atividades.

## 5. Criação de projeto
`/admin/projects` → Novo projeto → cliente, dados, **Estrutura** (“Começar sem template” ou template ativo, com contagem de fases/atividades/Gates), responsáveis. O botão “Usar estrutura Plano C” foi substituído por **“Usar template”** (aplica a projeto sem estrutura). A instanciação copia fases, Gates, critérios, atividades, checklists, dependências e solicitações/requisitos e libera as atividades sem pendência (mesma regra do seed); **não** copia horas realizadas, evidências, auditoria, aprovações, decisões, datas reais, usuários nem vínculos. Registra `PROJECT_CREATED_FROM_TEMPLATE`.
Compatibilidade: `usePlanC` e `POST /admin/projects/:id/clone-plan-c` (Etapa 10A) continuam funcionando e apontam para a versão ativa do `PLAN_C`.

## 6. API e segurança
`/api/admin/templates` (+ `/:id`, `/preview`, `/validate`, `/activate`, `/inactivate`, `/reactivate`, `/archive`, `/new-version`, `/items/:kind[/:itemId]` com `kind` = phases, gates, criteria, tasks, checklist, requests, requirements, dependencies) — **somente JGM4_ADMIN**. `GET /api/templates/active` — JGM4_ADMIN e JGM4_CONSULTANT (leitura). Cliente: sem acesso. Campos de itens passam por lista branca e validação no backend. Auditoria (AuditLog, sem projeto): `TEMPLATE_CREATED/UPDATED/VALIDATED/VERSION_CREATED/ACTIVATED/INACTIVATED/ARCHIVED`; no projeto: `PROJECT_CREATED_FROM_TEMPLATE`.

## 7. Interface
Aba **Templates** na administração: lista (nome, código, versão, situação, fases, atividades, atualização); tela do template com **Visualizar estrutura** (fase → atividades, solicitações, Gate), **Validar**, **Ativar**, **Criar nova versão**, inativar/reativar/arquivar e, em rascunho, editores de fases, Gates e critérios, atividades e checklist, solicitações e requisitos, e dependências.

## 8. Testes
- **Backend** (`templates.spec.ts`, 8 testes, banco sem seed): criação por admin e bloqueio de consultor/cliente; edição de DRAFT; ACTIVE sem edição destrutiva; nova versão copia estrutura (inclui 66 itens de checklist e dependências); template inválido e dependência circular não ativam; projeto do Plano C com 5 fases, 33 atividades, 5 Gates, 10 solicitações, **198 h** e equivalência atividade a atividade (fase, horas JGM4/cliente, predecessora, Gate bloqueador, checklist, SOL-006→C05); nada de execução copiado (TimeEntry, evidência, Approval, vínculos; auditoria só do próprio projeto); alterar/ativar v2 não altera projeto existente; arquivado não aparece nem cria projeto; projeto antigo continua funcionando; snapshots; idempotência do registro.
- **Navegador** (`test:browser:stage11`): abre o Plano C, visualiza estrutura, cria/reaproveita rascunho, valida, ativa inativando a anterior, cria empresa e projeto por template (5 fases/Gates), barra o consultor, desktop/tablet/mobile. O cenário da 10A (`stage10a`) foi atualizado para o seletor de template.

## 9. Limitações
- `priority` da atividade é guardada no template mas não existe coluna equivalente na atividade real (não é aplicada).
- Sem importação/exportação de templates, templates de cliente ou públicos, nem aplicação de template a projeto que já tem estrutura.
- Cada execução do cenário de navegador cria uma nova versão ativa do Plano C (sem alterar conteúdo) no banco de desenvolvimento.
- O editor usa formulários genéricos por tipo de item (sem arrastar-e-soltar para reordenar; a ordem é um campo numérico).

## 10. Verificação final da Etapa 11
`npm test`: **176 testes** (168 anteriores + 8 de templates), todos passando. Única adaptação em teste antigo: na 10A a ação de auditoria da clonagem passou de `PLAN_C_CLONED` para `PROJECT_CREATED_FROM_TEMPLATE` (a clonagem agora usa o template); o comportamento verificado é o mesmo. Migrações: 13 (`20261102000100_project_templates`).
