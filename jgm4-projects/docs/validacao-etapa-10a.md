# Validação da Etapa 10A — Administração operacional de empresas, usuários, projetos e vínculos

A JGM4 agora administra empresas, usuários, projetos, vínculos e responsabilidades **pela interface**, sem seed, SQL manual ou edição direta do banco. A Etapa 9B continua bloqueada por dependências externas; esta etapa não depende de infraestrutura externa. Etapa 10B não iniciada.

## 1. Onde fica
Menu **Administração** (somente JGM4_ADMIN) → `/admin` com abas **Empresas**, **Usuários**, **Projetos** e **Segurança** (`/admin/security`, já existente). Membros de um projeto: `/admin/projects/:id/members`. O frontend só esconde atalhos (`adminGuard`); **toda regra e toda autorização estão no backend** (`@Roles('JGM4_ADMIN')`).

## 2. Regras
| Tema | Regra |
|---|---|
| Empresa | nome (único, sem diferenciar maiúsculas), nome de exibição, identificação interna (única), observações, `createdAt/updatedAt`; **sem dados fiscais**. Situação **ACTIVE/INACTIVE** (armazenada em `Company.active`; a API expõe `status`). |
| Empresa inativa | não recebe novos projetos nem vínculos (409); usuários cliente **não autenticam** e as sessões existentes são encerradas na hora; projetos, histórico e auditoria são preservados; JGM4_ADMIN continua listando/consultando em `/admin/projects`. Inativar/reativar exige senha (+MFA) e motivo. |
| Usuário (criação) | e-mail único; nome; perfil; empresa (obrigatória para `CLIENT_*`, proibida para perfis JGM4). **Nenhuma senha é definida nem exibida**: o usuário recebe um link de uso único para criar a própria senha. Sem e-mail real, o link só é devolvido ao admin quando `APP_ENV` é `development` ou `test` (`devLink`); em staging/produção nunca. |
| Usuário (edição) | renomear; trocar empresa só de usuário cliente **sem vínculos ativos**, para empresa ativa; perfil (confirmação de senha, motivo; não troca JGM4↔cliente); ativar/inativar/bloquear (confirmação, motivo gravado em `statusReason`, visível só ao admin; o login público não revela o motivo); destravar; encerrar sessões; **enviar/redefinir acesso** (link de uso único, auditado). |
| Último administrador | ninguém altera o próprio estado/perfil nem se anonimiza; não é possível inativar, rebaixar ou anonimizar o último JGM4_ADMIN ativo. |
| Projeto | estados `PLANNING`, `IN_PROGRESS`, `ON_HOLD`, `IMPLEMENTATION_COMPLETED`, `CANCELLED`; **sem exclusão física**. Criação com cliente (obrigatório e ativo), nome (único na empresa), código (único), descrição, datas (término ≥ início), situação inicial (`PLANNING`/`IN_PROGRESS`), consultor principal, patrocinador e gestor. Ativar (`PLANNING→IN_PROGRESS`) registra evento de situação. Suspender/retomar/cancelar continuam em `/projects/:id/manage` (com reconfirmação). |
| Vínculos | usuário cliente **só** em projeto da própria empresa (ativa); consultor em vários projetos; JGM4_ADMIN opcional (tem acesso global); remover vínculo exige senha (+MFA) e preserva histórico. |
| Responsabilidades (≠ perfil de segurança) | `CONSULTANT_LEAD` (usuário JGM4), `CLIENT_SPONSOR` e `CLIENT_MANAGER` (usuários do cliente), `TEAM_MEMBER`. Lead/Sponsor/Manager são únicos: atribuir a outra pessoa rebaixa a anterior a `TEAM_MEMBER` (auditado como `RESPONSIBLE_CHANGED`); `CLIENT_SPONSOR` mantém `Project.sponsorUserId`. A troca de responsável **por atividade** continua no fluxo de aprovação (Etapa 5/8), usando só usuários do projeto. |

## 3. Clonagem da estrutura Plano C
`POST /api/admin/projects/:id/clone-plan-c` (ou a opção "Usar estrutura Plano C" ao criar) cria, **somente em projeto sem fases e atividades** (senão 409): 5 fases (Fase 0 disponível), 5 Gates com seus critérios, 33 atividades com dependências, horas planejadas JGM4/cliente, checklists base, 10 solicitações do Plano C (SOL-006 vinculada à C05) e libera as atividades sem pendência. A fonte única é `src/plans/plano-c.data.ts` (o seed de desenvolvimento passou a importar o mesmo arquivo — comportamento do seed inalterado). **Não copia** horas realizadas, evidências, auditoria, aprovações, decisões, usuários nem vínculos. Registra `PROJECT_CREATED_FROM_TEMPLATE`. Não é uma biblioteca genérica de templates (Etapa 11).

## 4. Endpoints (`/api/admin/*`, somente JGM4_ADMIN)
| Recurso | Rotas |
|---|---|
| Empresas | `GET/POST companies` · `PATCH companies/:id` · `PATCH companies/:id/status` |
| Usuários | `GET users?q&companyId&role&status` · `POST users` · `PATCH users/:id` (nome/empresa) · `PATCH users/:id/status` · `PATCH users/:id/role` · `POST users/:id/reset-access` · `unlock` · `revoke-sessions` · `anonymize` |
| Projetos | `GET projects?q&companyId&status&consultantId&phase` · `POST projects` · `PATCH projects/:id` · `POST projects/:id/activate` · `POST projects/:id/clone-plan-c` |
| Vínculos | `GET/POST projects/:id/members` · `PATCH projects/:id/members/:membershipId` (responsabilidade; `active:false` remove) |

Banco: migração `20261101000100_admin_ops` (colunas opcionais `Company.displayName/internalCode/notes`, `Project.code`, `User.statusReason`, e `AuditLog.projectId` passou a ser opcional, pois eventos de empresa/usuário não pertencem a um projeto; consultas por projeto não mudam).

## 5. Auditoria e segurança
- **AuditLog:** `COMPANY_CREATED/UPDATED/ACTIVATED/DEACTIVATED`, `USER_CREATED/UPDATED/ROLE_CHANGED/DISABLED/BLOCKED/ENABLED/ACCESS_RESET`, `PROJECT_CREATED/UPDATED/ACTIVATED`, `PROJECT_CREATED_FROM_TEMPLATE`, `MEMBERSHIP_ADDED/REMOVED/UPDATED`, `RESPONSIBLE_CHANGED`, com valor anterior, novo, ator e data.
- **SecurityEvent:** `USER_CREATED`, `USER_STATUS_CHANGED`, `USER_ROLE_CHANGED`, `ADMIN_ACCESS_RESET`, `MEMBERSHIP_CHANGED`, `COMPANY_STATUS_CHANGED`, `PROJECT_CREATED`.
- Reconfirmação de senha/MFA: inativar empresa, alterar status/perfil de usuário, remover vínculo.

## 6. Testes
- **Backend:** `test/admin-ops.spec.ts` (10 testes, banco sem seed) cobre os itens 1–21 e 28 da especificação: criação/duplicidade/perfil inválido; projeto exige empresa; clone (5 fases, 5 Gates, atividades, solicitações, sem TimeEntry/evidência/aprovação/vínculo); isolamento de empresa; consultor em vários projetos; responsabilidade única; último admin/auto-bloqueio; usuário inativo/bloqueado e empresa inativa não autenticam; auditoria e SecurityEvent; `/api/admin/*` com 401/403.
- **Navegador:** `npm run test:browser:stage10a` — admin cria empresa, convida usuário (define a senha pelo link), cria projeto com Plano C e um projeto básico clonado depois, adiciona membro, abre o projeto (5 fases/Gates), inativa o usuário e confirma o bloqueio no login; consultor é barrado; telas sem rolagem horizontal em tablet (820 px) e celular (390 px). Os dados de teste têm sufixo único e a empresa de teste é inativada ao final (nada é apagado).
- Suítes anteriores permanecem; as migrações listadas nas specs antigas receberam a nova migração.

## 7. Limitações
- Sem exclusão física de empresas/usuários/projetos (por desenho). Dados de teste inativos permanecem no banco de desenvolvimento.
- A troca de perfil e a inativação no frontend usam caixas de diálogo simples para motivo/perfil (sem drawer dedicado); a senha de confirmação fica em um campo do topo da página.
- Datas planejadas do projeto são administrativas: não recalculam fases.
- Reabrir projeto cancelado, mover projeto entre empresas e importação em massa de usuários não existem.
- Templates genéricos, financeiro, notificações de workflow, IA e Gantt **não** foram implementados (Etapa 11+).
