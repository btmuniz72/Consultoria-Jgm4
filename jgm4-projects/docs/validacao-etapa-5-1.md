# Validação — Etapa 5.1: Autenticação real, vínculo usuário-projeto e isolamento

## Resultado

| Verificação | Resultado |
|---|---|
| Migration `20261025000100_auth` (`ProjectMembership`) | Aplicada; `prisma migrate diff` sem divergência |
| Seed (`npm run db:seed`) | Cria 7 usuários de desenvolvimento e os vínculos; idempotente (não sobrescreve usuário/senha existente) |
| Testes backend (`npm test`) | **94/94** — 77 anteriores (Etapas 1–5) + 17 novos (`auth.spec.ts`) |
| Build backend e frontend (`npm run build`) | OK |
| Navegador (`BROWSER_CHANNEL=msedge npm run test:browser`): Etapas 1, 2, 3, 4 e 5/5.1, desktop e mobile | OK |

Observações:
- Os specs antigos (Etapas 1–5) exercitam workflows com o **ator de desenvolvimento**; por isso `backend/test/setup-env.ts` liga `ALLOW_DEV_ACTOR_HEADER=true` para eles (nenhuma asserção foi alterada; só a lista de migrations dos fixtures ganhou a nova). A suíte `auth.spec.ts` desliga esse modo e usa tokens reais.
- Os scripts de navegador das Etapas 2/3 usam APIs isoladas com o ator de desenvolvimento (`ALLOW_DEV_ACTOR_HEADER=true`, `NODE_ENV` ≠ production); os das Etapas 1, 4 e 5 fazem login real pela tela. Os scripts das Etapas 2/3 já estavam desatualizados desde a Etapa 5 (lista fixa de migrations e contagem de projetos); foram corrigidos (lista de migrations lida da pasta; seletor restrito ao projeto Ollem).

## Autenticação

- `POST /api/auth/login` (e-mail + senha) → `{ accessToken, user }` e cookie de sessão `jgm4_session`.
- `GET /api/auth/me` → usuário, perfil, empresa e ids dos projetos vinculados.
- `POST /api/auth/logout` → remove o cookie (sessão sem estado no servidor).
- Senhas: **bcrypt** (`bcryptjs`, custo 12 por padrão; `BCRYPT_COST` ajusta, mín. 4 para testes). Nunca em texto.
- Login: mesma resposta (`401 Credenciais inválidas.`) para e-mail inexistente, senha errada, usuário ou empresa inativa; compara contra um hash fictício quando o e-mail não existe (tempo semelhante). Bloqueio por tentativas: 5 falhas em 15 min por e-mail+IP → `429`.
- E-mails são normalizados em minúsculas.

## JWT

- HS256, emissor `jgm4-projects`, validade `JWT_EXPIRES_IN` (padrão 8 h). Conteúdo: apenas `sub` (userId), `role` e `companyId` (+ `iat/exp/iss`).
- **O token só identifica o usuário.** A cada requisição o backend recarrega usuário, perfil e empresa do banco e rejeita usuário/empresa inativos; um token forjado/alterado com `role: JGM4_ADMIN` (mesmo assinado) não eleva privilégios (teste 13).
- `JWT_SECRET` (≥ 32 caracteres) é obrigatório em produção; a API falha na inicialização se faltar. Em desenvolvimento, sem segredo, usa um segredo efêmero (sessões caem a cada reinício). `npm run db:start` gera um `JWT_SECRET` ao criar o `.env`.
- Transporte: cookie **HttpOnly**, **SameSite=Strict**, `Secure` em produção, `path=/api`; também aceita `Authorization: Bearer` (testes e clientes de API). O frontend nunca lê o token.

## Roles e alçadas

Mantida a matriz da Etapa 5 (ver `validacao-etapa-5.md`), agora aplicada ao perfil do **usuário autenticado**. Acrescentado: no lado cliente, executar atividades e responder solicitações exige `TASK_EXECUTE`/`REQUEST_RESPOND` (portanto `CLIENT_USER` não executa); a checagem acontece antes das regras de estado, para não vazar estado a quem não tem alçada.

## ProjectMembership e isolamento (tenant)

`ProjectMembership(projectId, userId, roleInProject?, active)` com unicidade `(projectId, userId)`.

| Perfil | Acesso |
|---|---|
| `JGM4_ADMIN` | todos os projetos |
| `JGM4_CONSULTANT` | somente com vínculo ativo |
| `CLIENT_SPONSOR` / `CLIENT_MANAGER` / `CLIENT_USER` | vínculo ativo **e** projeto da própria empresa (vínculo a projeto de outra empresa é ignorado) |

Implementação centralizada (`backend/src/auth/`):
- `AuthGuard` (global): autentica (401) e aplica `@Roles(...)` (403). `@Public()` libera login, logout e health.
- `ProjectAccessGuard` (global): descobre o projeto da rota (`:projectId`, `/projects/:id`, ou pela entidade em `:taskId`, `:gateId`, `/approvals/:id`) e exige acesso (403). Para quem não é administrador, projeto/entidade inexistente também é 403 (não revela existência); identificador malformado é 400.
- `AccessService`: lista de projetos acessíveis; usada para filtrar `GET /projects`, `GET /companies`, `GET /approvals`, `/approvals/summary`.
- `@Roles` aplicado às ações de Gate (parecer/critérios/correção: JGM4; decisão: patrocinador). A alçada fina continua no serviço (`can(role, permission)`).

## Ator real nos registros

`currentUser()/currentUserId()/currentRole()` vêm do contexto autenticado (nunca do corpo/cabeçalho em modo normal). Gravam o usuário real: `AuditLog.userId` e `actorType` (= perfil, em vez de `JGM4_LOCAL`/`CLIENT_LOCAL`), `Approval.requestedByUserId/decidedByUserId`, `TimeEntry.userId`, `TaskEvidence.createdByUserId`, `completedByUserId` (checklists/requisitos), `GateCriterion.satisfiedByUserId`, `Gate.technicalApprovedByUserId/clientDecisionByUserId`. Registros gerados automaticamente pelo sistema (ex.: liberação de atividade) continuam `SYSTEM`. `TimeEntry.organizationType` é derivado do perfil (JGM4 ou cliente); o DTO rejeita `organizationType`/`userId` vindos do cliente.

## Modo de desenvolvimento (`x-actor-role`)

Desligado por padrão. Só funciona se **`ALLOW_DEV_ACTOR_HEADER=true` e `NODE_ENV` ≠ `production`**; então, sem token, o cabeçalho `x-actor-role` (ou `JGM4_LOCAL_ACTOR`) define um ator sintético com acesso global a projetos. Com token válido, o token sempre prevalece. Em produção é ignorado/rejeitado (401) mesmo com a flag ligada. Uso previsto: testes automatizados e scripts locais com API isolada. **Não use no ambiente normal** e nunca em produção. O seletor de perfil do frontend foi removido.

## Usuários de desenvolvimento (seed)

Senha local padrão: `Jgm4-Dev-2026!` (ou `SEED_USER_PASSWORD`). **Somente desenvolvimento.** Em produção o seed não cria usuários sem `SEED_USER_PASSWORD` explícita e nunca usa a senha padrão.

| E-mail | Perfil | Empresa | Projetos |
|---|---|---|---|
| admin@jgm4.local | JGM4_ADMIN | — | todos (acesso global) |
| consultor@jgm4.local | JGM4_CONSULTANT | — | Ollem + 2 simulações |
| sponsor@ollem.local | CLIENT_SPONSOR | Ollem do Brasil | Ollem |
| gestor@ollem.local | CLIENT_MANAGER | Ollem do Brasil | Ollem |
| operacao@ollem.local | CLIENT_USER | Ollem do Brasil | Ollem |
| sponsor@demo.ollem.local | CLIENT_SPONSOR | Ollem do Brasil — Demonstração | 2 simulações |
| gestor@demo.ollem.local | CLIENT_MANAGER | Ollem do Brasil — Demonstração | 2 simulações |

(Os dois últimos existem porque os projetos de simulação pertencem a outra empresa.)

## Frontend

- `/login` (e-mail e senha; sem credenciais na tela; redireciona só para caminhos internos).
- `authGuard` em todas as rotas de projeto/Central; 401 no meio da sessão volta ao login. API inalcançável não é tratada como logout (a página mostra o erro de conexão).
- Cabeçalho: nome, perfil e empresa do usuário, badge de aprovações e **Sair**.
- A segurança real é do backend; o guard é apenas experiência de uso.

## Testes novos (`backend/test/auth.spec.ts`, 17)

Cobrem os 18 itens: 1 login válido (+ token mínimo, hash bcrypt, cookie); 2 login inválido (+ bloqueio); 3 sem token/expirado/assinatura errada → 401; 4 `/auth/me` e usuário desativado; 5 gestor acessa o próprio projeto; 6 isolamento entre empresas (leitura, escrita, aprovações, horas, Gate como JGM4, vínculo indevido); 7 consultor sem vínculo → 403 em tudo (parecer, validação, aceite, Central); 8 consultor com vínculo; 9 administrador; 10 ator da aprovação; 11 AuditLog com usuário real; 12 TimeEntry; 13 perfil/identidade forjados (cabeçalho, corpo, claims); 14 modo dev só quando habilitado; 15 produção recusa o modo dev; 16 Central respeita vínculo/destinatário; 17 Gates e alçada (+ `CLIENT_USER`); 18 suítes anteriores verdes.

## BROWSER_CHANNEL

Todos os scripts de navegador (`scripts/browser-*.ts`) usam `scripts/browser-helpers.ts`. Sem variável: Chromium do Playwright. Com `BROWSER_CHANNEL=msedge` (ou `chrome`): navegador instalado. Neste PC o Chromium embutido falha (erro de ICU), então use `BROWSER_CHANNEL=msedge`. Pré-requisitos dos scripts das Etapas 1, 4 e 5: API (3000) e frontend (4200) rodando e `npm run db:seed`.

## Limitações restantes

- **Logout não revoga o token**: ele vale até expirar (8 h). Para revogação real é preciso versão de token/lista de revogação (próxima etapa).
- Sem reset de senha, MFA, SSO, convite por e-mail, troca de senha pela interface nem política de senha (fora do escopo).
- Limite de tentativas de login em memória (reinicia com a API; não compartilhado entre instâncias).
- CSRF: mitigado por `SameSite=Strict` + CORS restrito; sem token CSRF dedicado. Revisar antes de expor com domínio/CDN externos.
- Vínculos (`ProjectMembership`) ainda não têm tela de administração; criam-se por seed/SQL. `roleInProject` é informativo.
- Troca de responsável continua só pela API (falta cadastro/listagem de usuários na tela).
- HTTPS, domínio externo e deploy não foram tratados (fora do escopo).
