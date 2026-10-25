# Plano de Rollback — JGM4 Projects

Objetivo: voltar a um estado conhecido e funcional após uma publicação com falha, sem perder dados e sem migrations destrutivas improvisadas.

## 1. Princípios
- **Todo deploy começa com backup** (`npm run db:backup`) enviado a armazenamento externo e com o arquivo conferido.
- **Artefatos versionados e imutáveis:** manter a versão anterior (imagem com etiqueta/*commit*, ou diretório de release) pronta para reativar.
- **Migrations compatíveis com a versão anterior** (padrão expandir → migrar → contrair). Nunca remover coluna/tabela na mesma release que deixa de usá-la; a remoção vai em release posterior, com plano e backup validado.
- Nunca usar `prisma db push` nem editar migrations já aplicadas.

## 2. Gatilhos de rollback
`/api/health/ready` falhando após o deploy · smoke test falhando · erro 5xx persistente · falha de login generalizada · vazamento/isolamento quebrado (tratar também como incidente — `docs/plano-resposta-incidentes.md`) · migration com erro.

## 3. Procedimentos
| Situação | Ação |
|---|---|
| Falha **antes** das migrations | Não aplicar nada; manter a versão atual rodando. |
| Falha **depois** das migrations, migration compatível | Reativar o artefato anterior (reiniciar com a versão anterior). O esquema expandido continua compatível. |
| Migration falhou no meio | `prisma migrate status`; se parcial e sem efeito colateral, corrigir e reaplicar; se houve efeito, **restaurar o backup em banco novo** (`db:restore`), validar contagens e repontar `DATABASE_URL`. |
| Migration destrutiva/incompatível aplicada | Restaurar backup do passo anterior em banco novo, repontar, reativar versão anterior. **Perda de dados entre o backup e agora** (RPO) — decidir com a diretoria. |
| Configuração/segredo errado | Corrigir a variável no cofre e reiniciar; se segredo comprometido, rotacionar (`JWT_SECRET` encerra todas as sessões). |
| Frontend com erro, API ok | Como API e frontend saem do mesmo artefato, reativar o artefato anterior inteiro. |

## 4. Passos (resumo)
1. Declarar o rollback e avisar a equipe; pausar novos deploys.
2. Colocar em manutenção, se necessário (proxy devolve 503 amigável).
3. Executar a ação da tabela acima.
4. Conferir `/api/health/ready`, `smoke:external` e login de teste.
5. Registrar em `docs/homologacao-etapa-9.md` (ou no registro de mudanças): horário, causa, ação, perda de dados (se houve), responsáveis.
6. Corrigir a causa em staging antes de nova tentativa.

## 5. Teste do plano
Ensaiar em staging: aplicar uma release com migration, reverter o artefato, e restaurar um backup em banco novo, medindo o tempo (RTO real). Registrar o resultado.

## 6. Responsáveis
Quem decide o rollback, quem executa e quem comunica clientes: **[DECISÃO JGM4]**.
