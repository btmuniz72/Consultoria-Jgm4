# Validação da Etapa 9 — Homologação externa e publicação controlada

## Status por parte

### ETAPA 9A — PREPARAÇÃO LOCAL PARA PRODUÇÃO
**Status: CONCLUÍDA** (fechamento técnico em 2026-10-25)

| Verificação | Resultado |
|---|---|
| `npm run build` (raiz) | OK, sem erros |
| Build backend (`nest build`) | OK |
| Build frontend (`ng build`) | OK |
| `npm test` | 9 suítes, **158 testes passando** |
| `npm run db:status` | **11 migrações** encontradas, esquema atualizado |
| `npm audit --omit=dev` | 4 achados (2 altos, 2 moderados), todos nas exceções conhecidas abaixo |
| Secrets versionados | nenhum: busca por URLs de banco com senha, chaves privadas e chaves de nuvem só encontrou valores fictícios em `.env.example` e o gerador de `.env` local de `scripts/local-postgres.ts` (senha aleatória gerada em tempo de execução) |
| `.env`, backups e credenciais no Git | **não rastreados**: `.env` e `.env.*` (exceto `.env.example`) e `.local/` (backups) estão no `.gitignore`; `git ls-files` não lista `.env`, `*.dump`, `*.enc`, `*.pem`, `*.key` nem credenciais |
| Exceções de dependências documentadas | **sim**, em `docs/validacao-etapa-8.md` §6: `multer` (DoS apenas com `fileFilter` assíncrono, que o projeto não usa) e `uuid` via `exceljs` (afeta apenas uso com `buf`; `--force` rebaixaria o exceljs para 3.x) |

### ETAPA 9B — INFRAESTRUTURA, STAGING, HOMOLOGAÇÃO E GO-LIVE
**Status: BLOQUEADA POR DEPENDÊNCIAS EXTERNAS.** Staging e produção **não** foram criados, publicados nem homologados; nenhum resultado externo foi presumido.

Bloqueadores:
1. Domínio / DNS
2. Servidor / plataforma de execução
3. PostgreSQL de produção (exclusivo, TLS, usuário mínimo, rede restrita)
4. Storage privado de anexos
5. SMTP (remetente oficial, SPF/DKIM/DMARC)
6. Secrets de produção (cofre)
7. HTTPS / certificado
8. `PRIVACY_CONTACT_EMAIL`
9. Preenchimento de `/privacy` (`[PREENCHER]`)
10. Preenchimento de `/terms` (`[PREENCHER]`)
11. Revisão jurídica (**pendente**)
12. Aprovação de RPO/RTO e das retenções (backups, logs, dados)

Produção pública não deve ser liberada enquanto os itens 8 a 12 estiverem abertos. Os critérios do item 61 da especificação **não estão atendidos**. Etapa 10 não iniciada.

## 1. Entregue e verificado localmente
| Item | O que foi feito | Evidência |
|---|---|---|
| Falha de inicialização em produção (itens 11–12) | `assertProductionConfig` agora também exige `APP_ENV` (staging/production), `MAIL_FROM` oficial, `SMTP_USER/PASSWORD`, `REQUIRE_MFA_FOR_ADMIN=true`, `BACKUP_ENCRYPTION_KEY` válida e distinta da de dados | teste 22 ampliado; API em `NODE_ENV=production` sem variáveis lista 9 erros e não sobe |
| Logs estruturados (item 28) | `JsonLogger` (uma linha JSON, sanitizada) ativo em `NODE_ENV=production` | saída verificada ao iniciar a API compilada |
| Bootstrap administrativo registrado (item 9) | `admin:bootstrap` grava `SecurityEvent USER_CREATED` | código; exige variáveis explícitas, sem senha no código |
| Testes parametrizados por URL (itens 40–41) | `BASE_URL` em `browser-helpers`; `test:browser:external` roda suítes 5–8; suítes locais inalteradas | suíte local completa continua passando |
| Smoke externo (itens 27, 35, 57) | `npm run smoke:external` (TLS, redirecionamento, health, cabeçalhos, 401, dev-actor recusado, CORS, stack trace, cookies, CSRF, logout) | executado contra o ambiente local: 24/26 — as 2 falhas esperadas são o CORS permissivo do *dev server* do Angular (a API em si não envia `Access-Control-Allow-Origin` para origem desconhecida) e `PRIVACY_CONTACT_EMAIL` ausente |
| Artefatos de deploy (itens 4–5, 13, 46) | `Dockerfile`, `.dockerignore`, `deploy/Caddyfile.example`, `jgm4-projects.service.example`, `crontab.example`, `production.env.example`, `docs/deploy.md` | **não executados** (sem Docker/servidor) — validar em staging |
| Documentos (itens 47–51, 60) | `plano-rollback.md`, `checklist-go-live.md`, `checklist-producao.md` reclassificado (OK/PENDENTE/N/A/BLOQUEANTE), `homologacao-etapa-9.md` (modelo a preencher), este arquivo | |
| Auditoria de dependências (item 34) | `npm audit --omit=dev` reexecutado: mesmas exceções documentadas (multer sem `fileFilter`; uuid via exceljs) | ver `validacao-etapa-8.md` §6 |

## 2. Parâmetros operacionais propostos (item 25) — a aprovar pela JGM4
Parâmetros internos, **não** SLA comercial: RPO 24 h (backup diário); RTO 8 h úteis; retenção de backups 30 diários + 12 mensais; logs de aplicação 30 dias; `SecurityEvent` 365 dias. Responsável pelo backup: a definir.

## 3. Pendências por item da especificação
| Itens | Situação | O que falta / quem |
|---|---|---|
| 3, 4, 13, 35 — staging/produção, domínio, HTTPS, DNS | PENDENTE | JGM4 contratar/configurar domínio, servidor e proxy; executar `docs/deploy.md` |
| 6, 32, 33 — PostgreSQL exclusivo, TLS, usuário mínimo, rede privada | PENDENTE | provedor de banco |
| 7 — migrations em staging, depois produção | PENDENTE | executar `migrate deploy` (11 migrações) |
| 17, 18 — storage privado e URLs | PENDENTE (código OK: privado, download autenticado) | volume/bucket e backup |
| 19, 20 — SMTP real e remetente oficial | PENDENTE | contratar SMTP, SPF/DKIM/DMARC |
| 21, 22 — privacidade/termos e revisão jurídica | **BLOQUEANTE** | JGM4 fornecer dados e jurídico revisar; **revisão jurídica: pendente** |
| 23, 24 — backup automático e restore em produção | PENDENTE (restore local OK na Etapa 8) | agendar e testar no ambiente real |
| 26, 29, 30 — monitoramento, retenção de logs, `SecurityEvent` em produção | PENDENTE (eventos e logs implementados) | ligar monitoramento e coletor |
| 31 — rate limit distribuído | PENDENTE (implementado no banco) | validar com 2 instâncias |
| 36–39, 53–57 — homologação Ollem, usuários, isolamento externo, estrutura real | PENDENTE | executar `docs/homologacao-etapa-9.md` |
| 42–45 — responsividade/performance/falhas externas | PENDENTE (responsividade local OK em 820 e 390 px) | medir em staging |
| 52 — critérios de go-live | **NÃO ATENDIDOS** | ver `checklist-go-live.md` |
| 58 — observabilidade pós-go-live | PENDENTE | |

## 4. Próximos passos (para a JGM4)
1. Decidir provedor/hospedagem e domínios; criar DNS.
2. Fornecer os dados jurídicos de `/privacy` e `/terms` e o canal de privacidade; encaminhar à revisão jurídica.
3. Provisionar banco, storage, SMTP; gerar segredos e guardá-los no cofre.
4. Executar `docs/deploy.md` em staging, depois `docs/homologacao-etapa-9.md` e `docs/checklist-go-live.md`.
5. Só então publicar produção e criar a estrutura real da Ollem.

Etapa 10 não iniciada.
