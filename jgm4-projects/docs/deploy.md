# Deploy — JGM4 Projects (staging e produção)

Arquitetura recomendada (simples, sem acoplamento a provedor): **um processo Node** (API NestJS que também serve o frontend Angular compilado) **atrás de um proxy HTTPS** (Caddy/nginx/balanceador do provedor), com **PostgreSQL gerenciado** e **volume privado** para anexos. Mesma origem: `https://app.<dominio>/` (frontend) e `https://app.<dominio>/api` (API). Sem CORS entre origens e cookies `SameSite=Lax`/`Strict` funcionam.

Arquivos de apoio (modelos, nada de segredos): `Dockerfile`, `deploy/Caddyfile.example`, `deploy/jgm4-projects.service.example`, `deploy/crontab.example`, `deploy/production.env.example`.

> **Estado:** estes artefatos foram escritos e revisados, mas **a imagem Docker, o Caddy e o systemd não foram executados** neste ambiente (sem Docker/servidor). Valide-os em staging antes de confiar neles.

## 1. Pré-requisitos (decisão e contratação da JGM4)
Domínio e DNS (`staging-app.…` e `app.…`), servidor/PaaS, PostgreSQL gerenciado com TLS e backup, volume privado, SMTP com SPF/DKIM/DMARC, cofre de segredos, (recomendado) ClamAV. Nada disso é criado pelo código.

## 2. Primeira publicação (staging)
1. Criar banco e **usuário exclusivo da aplicação** (privilégios apenas no schema da aplicação; sem superusuário). Usuário de migração separado, se possível. Liberar acesso somente da rede privada / IP do servidor.
2. Gerar segredos (ver `deploy/production.env.example`) e gravá-los **no cofre**; `APP_ENV=staging`.
3. Build: `npm ci && npm run db:generate && npm run build` (ou `docker build`).
4. **Migrations versionadas:** `npm run prisma:migrate -w backend` (`prisma migrate deploy`). **Nunca** `prisma db push` fora do desenvolvimento.
5. Subir o processo (`npm run start -w backend` / container / systemd). Se faltar variável crítica ou houver configuração insegura, a API **não inicia** e lista os motivos.
6. Proxy HTTPS com certificado válido e redirecionamento HTTP→HTTPS (Caddy obtém e renova sozinho).
7. Primeiro administrador: `ADMIN_EMAIL=… ADMIN_NAME="…" ADMIN_PASSWORD=… npm run admin:bootstrap -w backend` (senha só no ambiente do comando; troca obrigatória no 1º acesso; MFA obrigatório). Fica registrado em `SecurityEvent` (`USER_CREATED`).
8. Seed: **não rodar** usuários/demonstrações. O seed base (estrutura do Plano C) só com `ALLOW_PRODUCTION_SEED=true`, conscientemente.
9. `BASE_URL=https://staging-app… npm run smoke:external` (e, com `SMOKE_EMAIL/SMOKE_PASSWORD` de um usuário **sem MFA** de homologação, valida cookies/CSRF/logout).
10. Agendar backup, retenção e monitoramento (`deploy/crontab.example`).

## 3. Atualizações (cada release)
1. `npm test` + `npm run test:browser` locais verdes; `npm audit --omit=dev` revisado.
2. **Backup** (`npm run db:backup`) e confirmação de que o arquivo foi para o armazenamento externo.
3. Build da nova versão (imagem/etiqueta com versão ou *commit*).
4. Staging: migrations → publicar → `smoke:external` → `npm run test:browser:external` com `BASE_URL`.
5. Produção: repetir os mesmos passos, nesta ordem: **backup → migrations → backend+frontend (mesmo artefato) → health (`/api/health/ready`) → smoke → validação manual curta**.
6. Decisão de rollback conforme `docs/plano-rollback.md` se algum passo falhar.

Migrations devem ser **compatíveis com a versão anterior** (expandir → migrar dados → contrair em release posterior) para permitir rollback do código sem perda. Mudança destrutiva exige plano e backup validado.

## 4. Testes contra um ambiente externo
- `BASE_URL=https://staging-app… npm run test:browser:external` roda as suítes 5 a 8 (login real, perfis, isolamento, Central, relatórios, segurança). As suítes 1–4 usam APIs isoladas locais (ator de desenvolvimento) e **não se aplicam** a ambientes externos — continuam rodando em `localhost` com `npm run test:browser`.
- Essas suítes esperam os usuários/projetos de **homologação** (mesmos e-mails do seed de desenvolvimento). Em staging, crie-os de forma controlada (ambiente com `APP_ENV=staging`, nunca em produção) — ver `docs/homologacao-etapa-9.md`.

## 5. Monitoramento mínimo
| O quê | Como |
|---|---|
| API/frontend no ar | `/api/health/live`, `/` (monitor externo a cada 1–5 min) |
| Banco | `/api/health/ready` (503 quando indisponível) |
| Erros e exceções | logs estruturados (JSON) do processo + `SECURITY` logs; alerta em picos de 5xx |
| Falhas de login / acesso negado | `SecurityEvent` (`LOGIN_FAILED`, `ACCOUNT_LOCKED`, `ACCESS_DENIED`) — revisar em `/admin/security`; alerta em pico |
| CPU/memória/disco | métricas do provedor; alerta > 80% sustentado |
| Backup | verificar existência/horário/tamanho do arquivo diário; alerta se faltar |
| Certificado | `smoke:external` (alerta com < 14 dias) |

Logs: sanitizados (sem tokens/cookies/senhas). Retenção sugerida: aplicação 30 dias online (rotação por tamanho/tempo no proxy e no coletor), `SecurityEvent` 365 dias no banco (já automatizado). Evitar crescimento ilimitado de arquivo de log: configurar rotação (ex.: `roll_keep` no Caddy, `logrotate`).

## 6. Rate limit em ambiente distribuído
O limitador é **persistente no PostgreSQL** (`RateLimitBucket`), portanto vale entre várias instâncias e reinícios. Valide em staging com duas instâncias, se houver.
