# Checklist de Produção — JGM4 Projects

Classificação: **OK** (verificado, com evidência) · **PENDENTE** (falta executar/decidir) · **N/A** (não se aplica) · **BLOQUEANTE** (impede o go-live público enquanto não resolvido).
Estado em 2026-10-25, **antes de qualquer publicação**: o que depende de domínio, servidor, banco, SMTP e decisão jurídica está PENDENTE/BLOQUEANTE porque ainda não existe. Itens 🔒 são recusados pela própria API em produção (`assertProductionConfig`) — evidência: teste 22 de `security.spec.ts` e inicialização com configuração incompleta.

## Infraestrutura
| Item | Status | Observação |
|---|---|---|
| Domínios e DNS (`staging-app.…`, `app.…`) | BLOQUEANTE | decisão/contratação JGM4 |
| HTTPS válido + redirecionamento HTTP→HTTPS + renovação | BLOQUEANTE | exemplo em `deploy/Caddyfile.example` (não executado); `smoke:external` valida |
| Servidor/PaaS para o processo Node | BLOQUEANTE | `Dockerfile`/systemd de exemplo (não executados) |
| `TRUST_PROXY` conforme proxies | PENDENTE | depende do desenho |
| PostgreSQL de produção exclusivo, usuário só da aplicação, TLS, rede privada/allowlist | BLOQUEANTE | 🔒 TLS exigido na inicialização |
| Banco de produção separado de staging e dev; `APP_ENV` explícito | BLOQUEANTE | 🔒 `APP_ENV` obrigatório |
| Storage privado de anexos em volume persistente com backup | BLOQUEANTE | código: privado, download autenticado (OK em teste) |
| Antimalware (ClamAV) e `SCAN_REQUIRED=true` | PENDENTE | decisão: aceitar sem varredura? |
| SMTP real (SPF/DKIM/DMARC), remetente oficial | BLOQUEANTE | 🔒 `MAIL_PROVIDER=smtp`, `MAIL_FROM`, credenciais |

## Segredos e configuração
| Item | Status | Observação |
|---|---|---|
| `JWT_SECRET` forte, só no cofre | PENDENTE | 🔒 ≥ 32 e sem valor de exemplo |
| `DATA_ENCRYPTION_KEY` / `BACKUP_ENCRYPTION_KEY` distintas e em cofre | PENDENTE | 🔒 ambas validadas; backup key fora do servidor |
| `ALLOWED_ORIGINS` / `PUBLIC_URL` https oficiais | PENDENTE | 🔒 sem `*` |
| `ALLOW_DEV_ACTOR_HEADER` ausente | OK | 🔒 recusado em produção; smoke confirma 401 |
| `REQUIRE_MFA_FOR_ADMIN=true` | PENDENTE | 🔒 exigido na inicialização |
| `PRIVACY_CONTACT_EMAIL` definido | BLOQUEANTE | decisão JGM4 |
| Nenhum segredo no repositório | OK (a reconfirmar no release) | `.env*` ignorado; `deploy/*.example` só com marcadores |

## Dados e acesso
| Item | Status | Observação |
|---|---|---|
| `prisma migrate deploy` (nunca `db push`) | PENDENTE | 11 migrações; executar em staging primeiro |
| Sem usuários/projetos demo em produção | OK (código) / PENDENTE (verificar no banco real) | seed bloqueado em produção (teste 23) |
| Primeiro admin via `admin:bootstrap` (registra `USER_CREATED`) | PENDENTE | executar no ambiente |
| Empresa **Ollem do Brasil** e projeto **Plano C** criados deliberadamente; usuários autorizados | PENDENTE | só após isolamento validado em staging |
| Revisão inicial de acessos | PENDENTE | `/admin/security` |
| `retention:run` agendado | PENDENTE | `deploy/crontab.example` |

## Backup e continuidade
| Item | Status | Observação |
|---|---|---|
| Backup automático em produção (frequência, retenção, local, responsável) | BLOQUEANTE | parâmetros propostos em `docs/plano-continuidade.md`; agendar |
| Restore testado em ambiente separado, com evidência | BLOQUEANTE | local OK (Etapa 8); falta no ambiente real |
| RPO/RTO operacionais aprovados | PENDENTE | proposta 24 h / 8 h úteis, parâmetros internos |

## Aplicação e observabilidade
| Item | Status | Observação |
|---|---|---|
| Testes backend e navegador 1–8 locais | OK | |
| Suíte externa contra staging (`test:browser:external`) | PENDENTE | precisa de staging |
| `npm audit --omit=dev` revisado; exceções documentadas | OK (reexecutar a cada release) | multer, uuid/exceljs — `validacao-etapa-8.md` §6 |
| Health live/ready sem dados sensíveis | OK | verificado no `smoke:external` |
| Erros sem stack trace | OK | smoke + teste |
| Logs JSON estruturados e sanitizados em produção | OK (código) / PENDENTE (coletor e retenção) | `JsonLogger` |
| Monitoramento (disponibilidade, banco, erros, falhas de login, CPU/mem, backup) | PENDENTE | desenho em `docs/deploy.md` §5 |
| Cabeçalhos e cookies `Secure`/`HttpOnly` no domínio real | PENDENTE | `smoke:external` com usuário de smoke |
| Rate limit em ambiente distribuído | OK (persistente no banco) / PENDENTE (validar com 2 instâncias) | |

## Jurídico e organizacional
| Item | Status | Observação |
|---|---|---|
| `/privacy` e `/terms` sem `[PREENCHER]` | **BLOQUEANTE** | exige dados da JGM4 (razão social, CNPJ, foro, prazos, provedores) |
| Revisão jurídica registrada (revisado ou pendente) | **BLOQUEANTE** | hoje: **pendente** |
| Contratos controlador/operador, encarregado e canal de privacidade | BLOQUEANTE | |
| Políticas aprovadas pela diretoria | PENDENTE | |
| Responsável de segurança e contatos de incidente | PENDENTE | |
