# Escopo e decisões da Etapa 1

## Entregáveis

- Monorepo npm com frontend Angular e backend NestJS.
- PostgreSQL local separado da instalação já utilizada na máquina.
- Prisma Client, migration SQL versionada e seed transacional reexecutável.
- Seis modelos básicos: Company, User, Project, Phase, Gate e Task.
- API somente de leitura com validação de UUID e filtros.
- Consulta do projeto, fases, Gates, horas previstas e duração-base.
- Testes de integração e teste de navegador.

## Decisões estruturais

1. `jgm4-projects/` é uma aplicação independente dentro do checkout atual. Essa estrutura evita misturar a aplicação com o site HTML existente.
2. O schema associa cada projeto a uma empresa. Fases pertencem ao projeto; Gates e atividades usam chaves estrangeiras compostas `(projectId, phaseId)` para impedir referências a fases de outro projeto. A autorização por empresa ainda depende da etapa de segurança.
3. `document`, datas, patrocinador, responsável e distribuição de horas por atividade aceitam nulo quando não foram informados. O seed não cria contas ou senhas de usuários.
4. O plano tem 16 semanas e 198 h JGM4. Esses totais são calculados pela API a partir das fases persistidas. Não há dados locais substituindo a API no frontend.
5. As duas atividades demonstrativas são kick-off e zoneamento, objetivos expressos da Fase 0. Elas ficam bloqueadas até a implementação e validação futura das dependências. Não há horas realizadas nem percentual de progresso inventados.
6. O seed usa identificadores estáveis e upsert com atualização vazia. Reexecutá-lo preenche registros faltantes e preserva dados já existentes. Não é um mecanismo de atualização de metodologia nem de correção de registros alterados.
7. O helper usa o PostgreSQL 18 instalado para criar um cluster próprio em `.local/`, sem Docker, sem instalação de serviço, sem alterar o cluster existente em 5432. Configuração e dados locais são ignorados pelo Git.
8. Aplicativos e banco escutam em loopback. Não há produção, repositório remoto, publicação ou commit automático.

## Próximos passos propostos, após validação

1. Validar a base e o conteúdo do Plano C com o usuário.
2. Definir o escopo da próxima etapa, começando por autenticação, perfis e isolamento autorizado por empresa/projeto.
3. Em etapas subsequentes, implementar solicitações, dependências, evidências, transições controladas, validações e Gates com auditoria.

Esses itens são apenas propostas. A execução para na Etapa 1.

## Referências técnicas consultadas

- [Compatibilidade de versões do Angular](https://angular.dev/reference/versions).
- [Primeiros passos do NestJS](https://docs.nestjs.com/first-steps).
- [Prisma 7 com PostgreSQL e driver adapter](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql).
- [Configuração e execução explícita do seed Prisma](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/seeding).
