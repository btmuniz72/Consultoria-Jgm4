# JGM4 Projects — revisão Ollem

Aplicação local do projeto **Estruturação do Almoxarifado**, da **Ollem do Brasil**. O sistema inclui plano, solicitações, workflow controlado das atividades, apontamento de horas, Gates com parecer técnico e decisão formal de avanço, e documento de alinhamento. O banco fica no PostgreSQL local da porta 5433. A revisão Ollem acrescenta proposta técnica/comercial, horas contratadas, aceite versionado, contrato separado, condições comerciais por fase e dependências externas.

## Estrutura

```text
jgm4-projects/
├── frontend/       Angular, porta 4200
├── backend/        NestJS, porta 3000; Prisma, schema, migration e seed
├── scripts/        PostgreSQL local e verificação no navegador
├── docs/           Escopo, arquitetura e registro de verificação
├── .env.example    Variáveis fictícias
└── package.json    npm workspaces e comandos integrados
```

A pasta está isolada dentro do repositório Git existente. O site institucional e o arquivo de e-book não foram alterados. Não foi criado um segundo `.git`. O lockfile registra as versões utilizadas e permite levar esta pasta a um repositório próprio no GitHub futuramente.

## Pré-requisitos

- Node.js **24 LTS** e npm 11.
- PostgreSQL **18** instalado, com `initdb`, `pg_ctl`, `psql` e `createdb` na pasta `bin`.
- Git.

Stack: Angular 21, NestJS 11, Prisma 7 e TypeScript 5.9. A interface usa Angular standalone e comunicação HTTP real com a API. O Prisma utiliza o adapter PostgreSQL `pg`.

## Instalação e primeira execução

No PowerShell:

```powershell
cd D:\Programas\Consultoria-JGM4\jgm4-projects
npm ci
npm run setup
npm run dev
```

Abra **http://localhost:4200** para acessar a **Central de projetos**, com links para Plano C, Solicitações e Reunião de alinhamento. A URL do plano do seed é:

```text
http://localhost:4200/projects/9f1ead00-1c44-4000-8000-000000000002/plan
```

`setup` inicia o PostgreSQL local, gera o Prisma Client, aplica as migrations versionadas e executa o seed. `dev` inicia frontend e backend juntos. Use `Ctrl+C` para encerrar os dois aplicativos.

### PostgreSQL local isolado

O helper detecta `D:/Program Files/PostgreSQL/18/bin` ou `C:/Program Files/PostgreSQL/18/bin`. Para outro caminho, defina antes de executar o setup:

```powershell
$env:PG_BIN = 'C:/caminho/PostgreSQL/18/bin'
npm run setup
```

O cluster exclusivo fica em `.local/postgres`, escuta somente em `127.0.0.1:5433` e usa autenticação SCRAM. O helper cria uma senha aleatória em `.env`, ignorado pelo Git. O PostgreSQL existente em 5432 não é modificado. Não é necessário copiar `.env.example` para utilizar esse helper.

Para retomar uma instalação já configurada:

```powershell
npm run db:start
npm run dev
```

Para encerrar o banco exclusivo, após parar os aplicativos:

```powershell
npm run db:stop
```

Se optar por um PostgreSQL gerenciado separadamente, crie previamente um banco vazio exclusivo, copie `.env.example` para `.env`, configure `DATABASE_URL` localmente e execute `db:generate`, `db:migrate` e `db:seed` separadamente. O comando `db:start` gerencia apenas o cluster exclusivo na porta 5433.

Não remova `.env` de uma instalação com cluster existente: esse arquivo guarda a senha gerada. Nenhuma credencial real pertence ao Git.

## O que conferir na interface

1. Cliente **Ollem do Brasil**, projeto **Estruturação do Almoxarifado**, metodologia **Plano C**.
2. Resumo com **16 semanas**, **198 horas JGM4**, **5 fases** e **5 Gates**; cada fase compara horas estimadas e lançadas.
3. Fases 0 a 4 com duração `3 / 3 / 4 / 3 / 3` semanas e horas `36 / 39 / 47 / 39 / 37`.
4. Abra **Gates** no menu para consultar critérios, histórico, parecer técnico JGM4 e decisão Ollem.
5. C00 liberada; C05 bloqueada por SOL-006; confira dependências, checklist, evidências, saldo e histórico na página da atividade.
6. Datas **A definir**, pois o prompt não informou datas reais. Nenhum patrocinador ou usuário foi inventado.
7. Reduza a janela para verificar a apresentação no celular.

## Endpoints de leitura

Todos usam o prefixo `http://localhost:3000/api`:

| Método | Rota | Retorno |
| --- | --- | --- |
| GET | `/health` | Disponibilidade da API e conexão real com PostgreSQL |
| GET | `/companies` | Empresas ativas, sem dados de usuários |
| GET | `/projects` | Projetos; filtro opcional `?companyId=UUID` |
| GET | `/projects/:id` | Projeto, empresa, fases, Gates e totais |
| GET | `/projects/:id/phases` | Fases em ordem |
| GET | `/projects/:id/gates` | Gates em ordem de fase |
| GET | `/projects/:id/tasks` | Atividades do projeto com saldo, dependências e próxima ação |
| GET | `/projects/:id/tasks/:taskId` | Detalhe da atividade, checklist, evidências, horas e histórico |
| GET | `/projects/:id/activity-summary/phases` | Totais de esforço por fase |
| GET | `/projects/:id/activity-summary` | Totais de esforço do projeto |

Exemplo:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
Invoke-RestMethod http://localhost:3000/api/projects/9f1ead00-1c44-4000-8000-000000000002
```

UUIDs e filtros inválidos retornam 400; projetos inexistentes retornam 404. As rotas não expõem `passwordHash`. As ações de solicitações e atividades usam endpoints específicos, validação de pré-condições e auditoria sem edição ou exclusão de logs.

## Verificação

Com o banco iniciado e o setup concluído:

```powershell
npm run db:status
npm run test
npm run build
```

Os testes de integração usam PostgreSQL real em schemas temporários descartados ao terminar. Eles verificam leitura, solicitações, workflow de atividades, horas, decisões de Gate, bloqueios e auditoria. Use um banco de desenvolvimento exclusivo.

Para a verificação automatizada da interface, com `npm run dev` ativo em outro terminal:

```powershell
npx playwright install chromium
npm run test:browser
```

Alternativamente, use um navegador já instalado e compatível: `$env:BROWSER_CHANNEL = 'msedge'`. Os testes de navegador exercitam as páginas em desktop e mobile; os fluxos que gravam dados usam schema isolado. Capturas ficam em `.local/screenshots/`.

## Limites desta entrega

O modelo separa empresas e projetos, com integridade das relações no banco. **O filtro `companyId` não é autenticação nem autorização de tenant.** JWT, login e RBAC continuam pendentes, conforme a regra de acesso futura do prompt da Etapa 2. A API fica no loopback e as ações estão disponíveis ao operador local. A indicação JGM4/Ollem identifica a organização responsável pela ação no processo; não representa identidade autenticada. Antes de disponibilizar acesso externo ou multiusuário, será necessário implementar autenticação e autorização no backend.

O schema mantém os seis modelos originais e acrescenta `ProjectRequest`, `RequestRequirement` e `AuditLog`. O seed inclui uma empresa, um projeto, cinco fases, cinco Gates, duas atividades e dez solicitações. `User` permanece vazia. Campos sem informação real ficam nulos, incluindo criador quando a origem é o sistema. O código da atividade de zoneamento passou de `F0-002` para **C05**, preservando o ID e os demais dados existentes.

As solicitações SOL-001 a SOL-010, critérios estruturados de Gate, parecer técnico, decisão do patrocinador, liberação de fases, workflow de atividades e horas estão implementados. O seed e o gerador de solicitações preservam os registros existentes.

As decisões da base e das etapas anteriores estão em `docs/etapa-1.md`, `docs/etapa-2.md` e `docs/etapa-3.md`. O workflow de Gates está em [docs/etapa-4.md](docs/etapa-4.md).

Os registros estão em [validação da Etapa 1](docs/validacao-etapa-1.md) e [validação da Etapa 2](docs/validacao-etapa-2.md).

## Solicitações e alinhamento

- Fila: `/projects/:id/requests`, com filtros Todas, Disponíveis, Aguardando Ollem, Aguardando JGM4, Bloqueadas e Aceitas.
- Detalhe: `/projects/:id/requests/:requestId`, com requisitos, instruções, critério de aceite, próxima ação e histórico.
- Roteiro: `/projects/:id/alignment`, com 17 seções e 12 pontos de síntese. O rascunho é salvo apenas neste navegador, por projeto; não é aprovação de Gate.
- Documento independente: [alinhamento-plano-c-preenchivel.html](docs/alinhamento-plano-c-preenchivel.html). Abra no navegador, preencha e use **Salvar cópia preenchida** ou **Imprimir / PDF**. A tela também baixa o documento com as respostas já preenchidas.

Para regenerar o documento em branco: `npm run docs:alignment`.

## Atividades e horas

- Atividade: `/projects/:id/tasks/:taskId`; acompanhamento por fase no Plano C.
- Fluxo: bloqueada → liberada → em andamento → aguardando evidências → aguardando validação JGM4 → validada → concluída. Ajustes voltam à execução, sem remover evidências nem histórico.
- Horas: o backend soma os registros imutáveis de `TimeEntry`; lançamentos em decimal acima do plano geram alerta e não bloqueiam a atividade.
- Perfil local: `JGM4_LOCAL_ACTOR=JGM4` ou `CLIENT` no `.env`. A configuração define ações e organização dos lançamentos. Troque-a e reinicie a API para testar o outro lado; isso não é autenticação de usuários.
- A Etapa 3 não implementa aprovação de Gates, módulo financeiro, e-mail ou publicação.
- Referência: [Etapa 3](docs/etapa-3.md) e [validação da Etapa 3](docs/validacao-etapa-3.md).
- A Etapa 4 separa o parecer técnico JGM4 da decisão final Ollem; consulte [validação da Etapa 4](docs/validacao-etapa-4.md).

## Etapa 5 — Central de Aprovações

A Central (`/approvals`) reúne o que depende de decisão da JGM4 ou do patrocinador: solicitações, atividades, Gates e alterações (prazo, responsável, reabertura, cancelamento). As aprovações são criadas automaticamente pelos workflows e as decisões ficam no histórico e na auditoria, sem exclusão. O perfil simulado é escolhido no seletor do cabeçalho (cabeçalho HTTP `x-actor-role`); isso não é autenticação. O cenário de demonstração está nos projetos "Simulação — …" criados pelo seed. Detalhes, matriz de alçadas e endpoints: [validação da Etapa 5](docs/validacao-etapa-5.md).

## Etapa 5.1 — Autenticação e isolamento por projeto

- Login real (`/login`, `POST /api/auth/login`) com JWT em cookie HttpOnly; senhas com bcrypt. O perfil e a empresa vêm do banco a cada requisição, nunca do frontend.
- `ProjectMembership` limita consultores e usuários do cliente aos projetos vinculados; o cliente só vê projetos da própria empresa. `JGM4_ADMIN` vê todos.
- **Configuração:** defina `JWT_SECRET` (≥ 32 caracteres) no `.env` (o `npm run db:start` gera um). `ALLOW_DEV_ACTOR_HEADER` deve ficar `false`; ele só serve a testes automatizados e é ignorado em produção.
- **Usuários de desenvolvimento** (senha local `Jgm4-Dev-2026!`, só em desenvolvimento): `admin@jgm4.local`, `consultor@jgm4.local`, `sponsor@ollem.local`, `gestor@ollem.local`, `operacao@ollem.local` (e `sponsor@`/`gestor@demo.ollem.local` para as simulações). Criados por `npm run db:seed`.
- **Navegador:** os scripts `npm run test:browser*` respeitam `BROWSER_CHANNEL` (`msedge`, `chrome`); veja [validação da Etapa 5.1](docs/validacao-etapa-5-1.md).

## Etapa 6 — Dashboard executivo

- `/dashboard` (JGM4): carteira de projetos autorizados, com saúde, progresso, Gate, próxima ação e prazo. `/projects/:id/dashboard`: painel do projeto (progresso por atividades, horas JGM4 e cliente a partir dos apontamentos, atrasos, saúde com motivos, Gate atual, minha fila e últimas movimentações).
- Após o login, quem tem um único projeto vai direto ao painel dele; clientes não acessam a carteira JGM4.
- Endpoints agregados: `GET /api/projects/:id/dashboard` e `GET /api/dashboard` (respeitam vínculo e empresa). Regras de progresso, atraso e saúde: [validação da Etapa 6](docs/validacao-etapa-6.md).
- O seed cria o projeto de simulação "Simulação — Painel executivo" para demonstrar o dashboard.

## Etapa 7 — Relatórios, exportações e fechamento

- **Central de Relatórios** (`/projects/:id/reports`): Relatório Executivo, da Fase, de Encerramento da Fase (só com Gate aprovado), do Gate (registro formal), Final de Implantação (só com Gate final aprovado), Plano de Ação (XLSX), Horas (XLSX com filtros), Histórico de Solicitações e Auditoria. Visualização antes de exportar; PDFs gerados no backend; XLSX reais.
- **Auditoria** (`/projects/:id/audit`) com filtros e exportação; **Gestão** (`/projects/:id/manage`, JGM4): suspender/retomar/cancelar o projeto (administrador), plano de sustentação e pendências transferidas.
- Cada exportação registra usuário, tipo e data. Regras, endpoints e limitações: [validação da Etapa 7](docs/validacao-etapa-7.md).

## Etapa 8 — Produção externa, proteção de dados e segurança

- **Acesso:** sessão curta + refresh rotativo (cookies HttpOnly), CSRF, CORS restrito, HTTPS obrigatório em produção, política de senha, bloqueio por tentativas, MFA (TOTP) opcional e obrigatório para administradores, troca/esqueci/redefinição de senha, sessões revogáveis (`/account`).
- **Administração** (`/admin/security`, JGM4_ADMIN): usuários, vínculos com projetos, revisão de acessos (XLSX), eventos de segurança, incidentes. Ações críticas pedem reconfirmação de senha.
- **Dados:** anexos privados com validação e download autenticado, criptografia AES-256-GCM, retenção (`npm run retention:run`), anonimização, páginas `/privacy` e `/terms` (texto-base a revisar), backup cifrado e restore testado (`npm run db:backup` / `npm run db:restore`).
- **Produção:** configure o ambiente a partir de `.env.example`; a API recusa subir com configuração insegura. Siga [docs/checklist-producao.md](docs/checklist-producao.md); primeiro administrador com `npm run admin:bootstrap`.
- **Documentos:** [segurança da informação](docs/politica-seguranca-informacao.md), [proteção de dados](docs/politica-protecao-dados.md), [continuidade](docs/plano-continuidade.md), [resposta a incidentes](docs/plano-resposta-incidentes.md), [backup e restore](docs/backup-e-restore.md), [validação da Etapa 8](docs/validacao-etapa-8.md).
- **Aviso:** a implementação é técnica; **não** declara conformidade jurídica absoluta com a LGPD. Pendências de infraestrutura e revisão jurídica estão listadas na validação.

## Etapa 10A — Administração operacional

- Menu **Administração** (somente JGM4_ADMIN): **Empresas**, **Usuários**, **Projetos** (com vínculos e responsabilidades) e **Segurança**. Permite montar um cliente e um projeto do zero pela interface, sem seed: criar empresa, convidar usuários (link de uso único; nenhuma senha é definida pelo admin), criar projeto, **Usar estrutura Plano C** (clona fases, Gates, atividades e solicitações; nada de execução é copiado) e vincular pessoas com responsabilidades (consultor principal, patrocinador, gestor, membro).
- Toda alteração gera AuditLog e, quando sensível, SecurityEvent; ações críticas pedem senha. Regras, endpoints e limitações: [validação da Etapa 10A](docs/validacao-etapa-10a.md). O seed continua existindo apenas para desenvolvimento e testes.

## Etapa 11 — Templates reutilizáveis

- O Plano C agora é o template `PLAN_C` v1, administrado em **Administração → Templates** (somente JGM4_ADMIN): visualizar estrutura, validar, criar nova versão (rascunho editável), ativar, inativar e arquivar. Projetos novos escolhem **um template ativo** (ou começam sem template) e recebem uma cópia independente; mudar o template nunca altera projetos existentes.
- Detalhes, regras de versionamento, validação e limitações: [validação da Etapa 11](docs/validacao-etapa-11.md).

## Etapa 10.5 — UX/UI e Design System

- Identidade JGM4 consistente (azul-marinho, vermelho só para destaque), **tokens de design** centralizados, barra lateral por permissão, login/MFA profissional, páginas 403/404, diálogos próprios no lugar de confirm/prompt, status em badges semânticos e **nenhum enum técnico** exibido ao usuário. Painel do projeto com resumo executivo e linha do tempo com Gates; Gates e atividade reorganizados.
- Catálogo e regras: [design-system.md](docs/design-system.md) (página de referência `/dev/design-system`, somente fora de produção). Validação, telas, acessibilidade e screenshots: [validação da Etapa 10.5](docs/validacao-etapa-10-5.md). Nenhuma regra de negócio foi alterada.

## Revisão do projeto Ollem

A estrutura atual usa preparação gratuita, estruturação do CD de 04/11/2026 a 31/01/2027, inventário/processos/treinamentos em fevereiro e março de 2027 e estabilização e sustentação após a Fase 2. A Fase 1 detalha exercícios operacionais, a frente de Controle de Fios e Cabos e marcos internos M1 a M4 (carga por `npm run ollem:phase1`; ver [fase-1-ollem.md](docs/fase-1-ollem.md)). A proposta fica em `/projects/:projectId/proposal`. Horas comerciais são configuradas pela JGM4_ADMIN; nenhum quantitativo final foi presumido. Registros históricos e o template genérico Plano C foram preservados. As seções das etapas anteriores acima documentam suas entregas originais; para a estrutura atual da Ollem, consulte [revisao-projeto-ollem.md](docs/revisao-projeto-ollem.md).

Aplicar a revisão idempotente: `npm run db:generate`, `npm run db:migrate`, `npm run ollem:revise`. Validação específica no navegador: `npm run test:browser:ollem` (schema descartável).
