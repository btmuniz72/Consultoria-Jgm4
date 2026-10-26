# Arquitetura de produção — decisão técnica (Etapa 9B.3B)

Decisão técnica, **sem escolha comercial de provedor** e sem contratação. Parte das evidências de [infraestrutura-atual.md](infraestrutura-atual.md) e dos requisitos reais do código. Experiência pública obrigatória: `https://www.jgm4consultoria.com.br/projetos/` ([site-first-architecture.md](site-first-architecture.md)).

## 1. Requisitos mínimos do backend (medidos no projeto)

| Item | Requisito | Base |
|---|---|---|
| Node.js | **24.x** (`>=24 <25`); imagem `node:24-slim` | `package.json` (`engines`), `Dockerfile` |
| Processo | Um serviço persistente (`node backend/dist/main.js`), porta interna `3000`, escuta só em loopback ou rede privada atrás do proxy | `main.ts`, `Dockerfile` |
| Memória | Medido: ~200 MB de working set com o serviço ocioso e leve (Windows, Node 24). Recomendado **≥ 1 GB de RAM livre** para o serviço, pela geração de relatórios (PDF/Excel/ZIP) e picos de upload (10 MB) | Medição local em 2026-10-26; carga real não medida |
| CPU | **1 vCPU** é suficiente para o volume atual (nenhum volume de produção existe). Reavaliar com uso real | Não medido sob carga |
| Disco do serviço | Imagem/instalação com `node_modules` (661 MB em desenvolvimento; a imagem Docker tem tamanho próprio, não medido) + logs | Medição local |
| Storage de anexos | Volume **privado, persistente e com backup**, em `STORAGE_LOCAL_DIR` (`/data/storage` na imagem). Tamanho: depende do uso, não estimado | `storage.ts`, `Dockerfile` |
| Variáveis de ambiente | `NODE_ENV=production`, `APP_ENV`, `PORT`, `HOST`, `TRUST_PROXY=1`, `PUBLIC_APP_URL`, `PUBLIC_BASE_PATH=/projetos`, `API_BASE_PATH=/api`, `ALLOWED_ORIGINS`, `FRONTEND_DIST_DIR`, `DATABASE_URL` (TLS), `JWT_SECRET`, `DATA_ENCRYPTION_KEY`, `BACKUP_ENCRYPTION_KEY`, `REQUIRE_MFA_FOR_ADMIN=true`, `MAIL_*`/`SMTP_*`, `STORAGE_*`, `SCAN_REQUIRED`/`CLAMAV_*`, `PRIVACY_CONTACT_EMAIL`. A API **recusa iniciar** se faltar ou for inseguro | `config.ts`, `deploy/production.env.example` |
| HTTPS | Terminado no Apache/proxy; o backend redireciona HTTP→HTTPS quando `req.secure` é falso e exige `TRUST_PROXY` correto | `http-security.ts`, `config.ts` |
| PostgreSQL | Ver item 2 | |
| SMTP | Ver item 4 | |
| Antimalware | **ClamAV (clamd)** acessível por `CLAMAV_HOST:CLAMAV_PORT`. Em produção, `SCAN_REQUIRED=true` é o padrão e só arquivos `CLEAN` são baixáveis; sem ClamAV os anexos não são liberados | `scanner.ts` |
| Logs | JSON em stdout (`JsonLogger`, `REQUEST_LOG`), sem corpo, cookies nem query; precisam de rotação e retenção no host | `main.ts`, `json-logger.ts` |
| Reinício automático | Política `restart` do contêiner ou unidade systemd (`deploy/jgm4-projects.service.example`) + `HEALTHCHECK` em `/api/health/live` | `Dockerfile` |
| Rotinas agendadas | `db:backup` diário e `retention:run` (ver `deploy/crontab.example`); usam `tsx`, exigem as dependências de desenvolvimento ou a imagem completa | `package.json` |

## 2. PostgreSQL (inventário)

- Versão de desenvolvimento e testes: **18.6**. `pg_dump`/`pg_restore` precisam ser da mesma versão major do servidor.
- ORM: **Prisma 7** com `@prisma/adapter-pg`; **15 migrations** versionadas (`prisma migrate deploy`; nunca `db push`). Hoje, **40 tabelas** no schema local.
- Tamanho atual (banco local de desenvolvimento): **21 MB**. Não há dados de produção, e nenhum volume futuro foi estimado.
- TLS obrigatório (`sslmode=require|verify-full` ou `DATABASE_SSL=require`); a validação de produção recusa conexão sem TLS.
- Usuário exclusivo da aplicação, sem superusuário, `CREATEDB` ou `CREATEROLE`; usuário separado para migrations quando possível.
- Conexões: pool padrão do `pg`; não há tuning. Limite de conexões do plano precisa acomodar uma instância.
- Backup: `npm run db:backup` (dump `pg_dump` cifrado AES-256-GCM) e `npm run db:restore` (testado localmente; 14 tabelas conferidas no teste da Etapa 8, hoje há 40, então o teste deve ser repetido).

## 3. Storage (modelo atual)

Os anexos ficam no **filesystem local** (`LocalStorageProvider`), em diretório privado com permissões 0700/0600, nunca servido como estático; o banco guarda só os metadados. **Não existe adaptador de object storage**: qualquer `STORAGE_PROVIDER` diferente de `local` lança erro na inicialização.

Adequação: **adequado para produção apenas com uma instância e volume persistente** com backup na mesma janela do banco. Não é adequado para plataforma sem disco persistente nem para mais de uma instância. Se a arquitetura escolhida não oferecer volume persistente, é necessário desenvolver um adaptador de object storage (trabalho de código, não feito).

## 4. SMTP

- Em produção o envio por SMTP é obrigatório (`MAIL_PROVIDER` `memory`/`outbox` são recusados). Usos no código: convite/definição de senha, redefinição de senha e avisos de segurança.
- MFA (TOTP) **não usa e-mail**: o segundo fator é gerado no aplicativo autenticador.
- Notificações futuras reutilizariam o mesmo `MailService`.
- Existente: caixa Titan Email (MX `mx1/mx2.titan.email`), SPF só da Titan e um SMTP já usado pelo PHP do site. **DMARC não existe** e o seletor DKIM não foi identificado; `MAIL_FROM` deve ser um remetente real do domínio, com SPF/DKIM/DMARC alinhados, antes de qualquer envio real.
- Nada foi enviado nem configurado nesta etapa.

## 5. Backup (o que a produção deve proteger)

| Item | Proteger? | Observação |
|---|---|---|
| PostgreSQL | Sim | `db:backup` cifrado; teste de restore periódico (RTO real). |
| Storage de anexos | Sim, **na mesma janela** do banco | O banco guarda só metadados; restaurar um sem o outro quebra anexos. |
| Configuração (arquivo de env, virtual host, `.htaccess`) | Sim, **sem valores secretos** | Versionar modelos com placeholders. |
| Segredos e chaves (`JWT_SECRET`, `DATA_ENCRYPTION_KEY`, `BACKUP_ENCRYPTION_KEY`) | Cópia separada em cofre | Nunca no mesmo local que os backups; `BACKUP_ENCRYPTION_KEY` fora do servidor do banco. Perder `DATA_ENCRYPTION_KEY` torna dados cifrados irrecuperáveis. |
| Logs | Rotação e retenção definidas; backup só se exigido | Sem dados pessoais nem segredos. |

Retenção sugerida e rotina em [backup-e-restore.md](backup-e-restore.md) (30 diários + 12 mensais, **DECISÃO JGM4**). RPO de até 24 h com o dump lógico; menos exige arquivamento contínuo do provedor de banco. O envio dos backups para fora do servidor e a retenção **não são automatizados** pelo projeto.

## 6. Segurança externa (requisitos)

HTTPS com certificado válido (já existe para o domínio); cabeçalhos escopados por prefixo (CSP própria da SPA e da API); firewall que exponha ao público só 80/443 (backend e banco inacessíveis de fora: porta do app em loopback/rede privada, banco só da rede do app); SSH apenas por chave, usuário **não-root**, sem login por senha; segredos fora do Git (cofre ou variáveis do host); rate limit já presente na aplicação (login por IP e por conta) mais o limite do proxy; cookies `Secure`/`HttpOnly`/`SameSite=Strict` host-only; `TRUST_PROXY=1`; atualizações de sistema e de dependências com rotina definida; ClamAV atualizado; logs sanitizados.

## 7. Comparação dos três cenários

Critérios: 1 simplicidade de manutenção, 2 custo, 3 segurança, 4 integração com o site atual, 5 backup, 6 atualização, 7 risco operacional para a JGM4. Custos são **relativos**: nenhum preço foi consultado.

| | **A. Tudo no servidor atual** | **B. Site e Angular no servidor atual + backend externo** | **C. VPS dedicado para tudo** |
|---|---|---|---|
| Viabilidade com a evidência atual | **Improvável**: nada prova Node persistente nem PostgreSQL no plano (NÃO IDENTIFICADO). Só viável se o suporte confirmar ambos. | **Viável se o proxy `/api` para host externo for permitido** (NÃO IDENTIFICADO) ou se houver proxy na frente do domínio. O front estático é certo. | **Viável**, independente do plano atual. |
| Vantagens | Um único lugar; menor custo se existir. | Mantém o site institucional exatamente como está, sem migração; só o backend é novo; o backup do app é isolado do site. | Controle total, um servidor só, proxy sem restrição. |
| Riscos | Plano compartilhado pode derrubar um processo longo, limitar memória e CPU e não oferecer PostgreSQL; mistura o site SEO crítico com um sistema autenticado. | O proxy pode ser bloqueado; latência extra HostGator→backend; duas áreas para operar; cache do nginx da frente. | **Migrar o site institucional indexado** (SEO, redirects, e-mail, formulários PHP, Titan, certificado); você passa a administrar Linux, patches, firewall e backup do site todo. |
| Manutenção | Baixa se funcionar. | Média: apenas o backend e o banco são novos. | Alta: sistema operacional, web server, Node, PostgreSQL, TLS, e-mail dos formulários. |
| Segurança | Pior isolamento (mesmo ambiente do site; chaves e banco ao alcance do mesmo painel). | Boa: backend isolado, banco em rede privada, site intacto. | Boa se bem administrada; superfície única e maior. |
| Backup | Depende do plano; PostgreSQL provavelmente indisponível. | Banco e storage do backend com rotina própria (`db:backup`); site continua com o processo FTPS atual. | Tudo na sua responsabilidade (snapshots + `db:backup`). |
| Atualização | Presa às versões do plano (Node 24?). | Container versionado; deploy e rollback independentes do site. | Livre, porém manual. |
| Risco para a JGM4 | Médio-alto (incerteza). | **Baixo**, depois de provado o proxy. | Alto no início (migração do site), médio depois. |

## 8. Recomendação: Cenário B

**Arquitetura preferencial: Cenário B.** O site institucional e o build Angular permanecem no HostGator; o backend NestJS (contêiner único, usando o `Dockerfile` existente) e o PostgreSQL ficam externos; o Apache do HostGator faz o proxy de `/api/` para o backend.

Por quê, na ordem dos critérios: (1) é a menor mudança que faz o sistema existir — o site que gera os leads não é tocado; (2) custo mínimo: um serviço pequeno + banco, sem migrar nada; (3) o backend e o banco ficam em rede isolada do site; (4) mantém `www.jgm4consultoria.com.br/projetos/` exatamente como o site atual espera; (5) backup do app independente; (6) deploy/rollback do app por imagem, sem FTP; (7) menor risco operacional: o pior caso é a Área do Cliente ficar indisponível, nunca o site.

**Condição que precisa ser comprovada antes de qualquer contratação:** o plano atual do HostGator aceita `ProxyPass`/`[P]` para um host externo. Isso é verificável sem custo, pelo suporte ou pelo painel, e depois por uma prova em staging. Contingências, nesta ordem, se **não** aceitar:

1. **B′:** colocar um proxy reverso na frente do domínio (DNS do `www` aponta para esse proxy, que envia `/api/` e `/projetos/` ao backend e o restante ao HostGator). Mantém a URL final, mas altera DNS/TLS do domínio: decisão e janela próprias.
2. **A′:** subir o plano do HostGator para um que ofereça os recursos (VPS), caso o suporte confirme.
3. **C:** só se B′ e A′ forem inviáveis, por ser o de maior risco (migração do site inteiro).

Não recomendar nenhum provedor aqui: a escolha comercial vem depois da prova do proxy e dos requisitos do item 1.

## 9. Diagrama (Cenário B)

```text
Cliente (navegador)
   │  https://www.jgm4consultoria.com.br
   ▼
nginx (HostGator, cache/TLS) ─► Apache (HostGator) ── .htaccess existente
                                   │
                                   ├── /           Site institucional (HTML/PHP)  ← FTPS (publicação atual)
                                   │                 └─ SMTP/SQLite dos formulários (já existente)
                                   ├── /projetos/  Angular estático (index.html + chunks) ← FTPS
                                   │                 └─ fallback SPA só neste prefixo
                                   └── /api/       ProxyPass (HTTPS) ──────────┐
                                                                               ▼
                                              Backend externo (Linux, usuário não-root)
                                              ┌────────────────────────────────────────┐
                                              │ NestJS 24.x :3000 (loopback/rede priv.)│
                                              │ ClamAV (antimalware)                   │
                                              │ Volume privado: /data/storage          │──► backup (mesma janela)
                                              └───────┬───────────────┬────────────────┘
                                                      │               │
                                            PostgreSQL 18 (TLS)    SMTP (Titan/SPF/DKIM/DMARC)
                                            usuário mínimo,        remetente do domínio
                                            backup + restore testado
Segredos: cofre/variáveis do host (nunca no Git)   Monitoramento: /api/health/ready
```

Observação: com o Angular estático no HostGator, a variante deste diagrama é válida porque a API fica em `/api` na mesma origem; a imagem existente (`Dockerfile`) serve também o Angular, então é possível, como simplificação, proxiar `/projetos/` e `/api/` ao backend e não publicar o build por FTPS. Decidir isso na provisão (o proxy já é pré-requisito; servir tudo pelo backend reduz as publicações a uma só).

## 10. Matriz de contratação

| Recurso | Já existe? | Precisa contratar? | Observação |
|---|---|---|---|
| Domínio | Sim (`jgm4consultoria.com.br`; NS no HostGator) | Não | Titular/registrador: NÃO IDENTIFICADO. |
| DNS | Sim (gerenciado no HostGator) | Não, a princípio | Só altera se a contingência B′ for necessária. Acesso ao painel DNS: NÃO IDENTIFICADO. |
| Hosting do site | Sim (HostGator BR, FTPS) | Não | Plano exato NÃO IDENTIFICADO. |
| Proxy `/api` no hosting atual | **NÃO IDENTIFICADO** | A definir | Pré-requisito crítico; perguntar ao suporte/painel. |
| Backend (Node 24, persistente) | Não evidenciado | **Sim** (serviço externo pequeno) | Requisitos no item 1. Provedor **não escolhido**. |
| PostgreSQL | Não evidenciado | **Sim** | Versão 18 recomendada, TLS, usuário mínimo, backup. Pode ser gerenciado ou do próprio backend; decisão posterior. |
| Storage de anexos | Não | Parte do backend | Volume persistente privado; object storage só com novo adaptador. |
| Antimalware (ClamAV) | Não | Parte do backend | Em produção a liberação de anexos exige. |
| SMTP | Parcial (Titan Email + PHP) | A confirmar | Servidor/limites/DKIM NÃO IDENTIFICADOS; criar DMARC; remetente exclusivo para o sistema. |
| Backup | Parcial (só FTPS do site, local) | **Sim**, para banco e storage | Destino externo e retenção a definir. |
| Monitoramento | Não | **Sim**, simples | Disponibilidade de `/api/health/ready`, validade do TLS, falha de backup. |
| TLS do domínio | Sim (wildcard LE, vence 2026-12-07) | Não | Confirmar renovação. O backend não precisa de certificado público se só o Apache falar com ele por rede privada/HTTPS interno; conexão HostGator→backend deve ser HTTPS. |
| Cofre de segredos | Não | A definir | Mecanismo do provedor escolhido ou cofre próprio. |

## 11. Status

`ETAPA 9B.3B — PREPARAÇÃO CONCLUÍDA / PROVISIONAMENTO PENDENTE`. Nenhum ambiente foi provisionado, nenhum provedor foi escolhido e nada foi publicado. Próximos passos: [checklist-provisionamento.md](checklist-provisionamento.md).
