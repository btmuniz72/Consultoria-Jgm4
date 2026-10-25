# JGM4 Projects — Etapa 5

Aplicação local do projeto **Estruturação do Almoxarifado**, da **Ollem do Brasil**. O sistema inclui plano, solicitações, workflow controlado das atividades, apontamento de horas, Gates com parecer técnico e decisão formal de avanço, e documento de alinhamento. O banco fica no PostgreSQL local da porta 5433; não há publicação, valores financeiros, cobrança ou e-mail.

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
