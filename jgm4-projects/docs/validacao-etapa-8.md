# Validação da Etapa 8 — Produção externa, proteção de dados e segurança

> Este documento separa o que foi **implementado e testado tecnicamente** do que **depende de infraestrutura, decisão organizacional ou revisão jurídica**. Ele **não declara conformidade jurídica absoluta** com a LGPD.

## 1. Resultado das verificações
| Verificação | Resultado |
|---|---|
| `npm test` (backend, PostgreSQL real) | **158 testes passando** (9 suítes), incluindo `security.spec.ts` |
| `npm run build` (API + Angular) | OK |
| `npm run db:status` | 11 migrações aplicadas, esquema atualizado |
| `npm run test:browser` (Etapas 1–8, Edge, desktop/tablet/mobile) | OK — ver §5 |
| Backup/restore | backup cifrado (131.569 bytes), restauração em banco novo, 14 tabelas idênticas, chave errada falha, destino=origem recusado |
| `npm audit --omit=dev` | 4 achados restantes, todos analisados (§6) |

## 2. Implementado e testado (técnico)
| # | Requisito | Onde / evidência |
|---|---|---|
| Autenticação | Login com sessão curta (15 min) + refresh rotativo HttpOnly; role sempre relida do banco | `auth.service.ts`, `security.spec.ts` |
| Status de usuário | `ACTIVE`/`INACTIVE`/`BLOCKED`; inativo/bloqueado não loga e perde sessões | `admin.service.ts`, testes |
| Política de senha | 10+ chars, complexidade, senhas comuns, nome/e-mail | `password-policy.ts`, testes |
| Troca / esqueci / redefinição | Token aleatório, só hash no banco, uso único, expira em 30 min, resposta genérica | `auth.service.ts`; UI `/forgot-password`, `/reset-password`, `/account` |
| Revogação real de sessão | Registro de sessões; logout, logout-all, revogar por admin, reuso de refresh derruba a sessão | testes + UI "Sessões ativas" |
| MFA TOTP | Setup, ativar, desativar (senha+código), login em duas etapas, obrigatório para admin via `REQUIRE_MFA_FOR_ADMIN` | testes + browser stage 8 |
| Bloqueio por tentativas | 5 falhas → 15 min, persistente | testes |
| Rate limit persistente | `RateLimitBucket` no banco | testes |
| CSRF / CORS / HTTPS | token duplo + Origin + `X-Requested-With`; CORS por lista; HTTP recusado em produção; HSTS | testes |
| Cabeçalhos de segurança | helmet + CSP, nosniff, frame deny, referrer, permissions | testes |
| Segredos | validação de produção recusa configuração insegura; `.env.example` fictício | `config.ts`, testes |
| Criptografia | AES-256-GCM (segredo MFA, backups) | `crypto.ts`, testes |
| Anexos privados | validação de extensão/MIME/*magic bytes*/tamanho, nome interno aleatório, download autenticado, escopo por projeto, gancho antimalware (Noop/ClamAV) | `attachments/*`, testes; UI no detalhe da atividade |
| Logs de segurança | `SecurityEvent` separado de `AuditLog`, log sanitizado (`redact`) | testes |
| Revisão de acessos | `/api/admin/access-review` (+XLSX) e tela `/admin/security` | UI testada |
| Memberships | Tela segura (somente JGM4_ADMIN), remoção exige senha (+MFA) | `members.service.ts`, UI |
| Troca de responsável | UI no detalhe da atividade, só usuários do projeto; backend valida vínculo | `approvals.service.ts`, testes |
| Ações críticas | Cancelar projeto, remover vínculo, alterar status/perfil, anonimizar: reconfirmação de senha | testes + campo no formulário de gestão |
| Retenção / anonimização | `retention:run`; AuditLog/Approval/relatórios nunca apagados; anonimização de usuário | `scripts/retention.ts`, testes |
| Incidentes | CRUD + histórico imutável; OPEN→…→CLOSED | UI + testes |
| Health | `/api/health/live`, `/ready` | `app.module.ts` |
| Erros | filtro global sem *stack trace* | testes |
| Seeds em produção | bloqueados sem `ALLOW_PRODUCTION_SEED`; usuários de teste nunca em produção; `admin:bootstrap` | `seed.ts`, `bootstrap-admin.ts` |
| E-mail transacional | `MailService` (smtp / outbox / memory); produção recusa outbox/memory | `mail.service.ts`, testes |
| Páginas legais | `/privacy` e `/terms` (texto-base editável em `legal.component.ts`); contato só se `PRIVACY_CONTACT_EMAIL` | UI testada |
| Isolamento multi-tenant | Cenário JGM4 / Ollem / Cliente B | `security.spec.ts` + browser |

## 3. Documentos entregues
`politica-seguranca-informacao.md`, `politica-protecao-dados.md`, `plano-continuidade.md`, `plano-resposta-incidentes.md`, `backup-e-restore.md`, `checklist-producao.md`, este arquivo, e README atualizado.

## 4. Depende de infraestrutura, decisão ou revisão jurídica (NÃO resolvido pelo código)
- **HTTPS real, DNS, proxy reverso, certificados e hospedagem** — o código exige HTTPS em produção, mas o ambiente precisa existir.
- **PostgreSQL de produção** com TLS, usuário de mínimo privilégio e backup do provedor; **armazenamento externo e agendamento** dos backups; **teste de restore no ambiente real**.
- **Serviço de e-mail real** (SMTP, SPF/DKIM/DMARC) e **ClamAV** em operação.
- **RPO/RTO**, retenção de backups, frequência de revisão de acessos, contatos de incidente: decisão da diretoria.
- **Textos finais** de `/privacy` e `/terms` (há placeholders `[PREENCHER]`), bases legais, encarregado/DPO, contratos controlador/operador, prazos legais de retenção, ROPA/RIPD, comunicação à ANPD — **revisão jurídica**.
- Atendimento de direitos do titular é **procedimento manual** (não há módulo dedicado).
- Pen test/revisão externa de segurança não foi realizado.
- MFA aceita ±1 janela de tempo e **não impede reutilização** do mesmo código dentro da janela (melhoria futura).
- Anexos em disco local: para várias instâncias/containers efêmeros, usar armazenamento de objetos (a interface `StorageProvider` permite).

## 5. Verificação no navegador (Edge)
`npm run test:browser:stage8` cobre: `/privacy` e `/terms` públicos; "esqueci minha senha" com resposta genérica; link de redefinição inválido; cookie de sessão HttpOnly e invisível ao JavaScript; política de senha rejeitando senha fraca; ativação de MFA, login que exige código (código errado rejeitado) e desativação; perfil consultor sem acesso à administração (UI e API 403); tela de administração de segurança; isolamento entre empresas; sem rolagem horizontal em tablet (820 px) e celular (390 px). As etapas 1–7 continuam passando com o novo login.

## 6. Auditoria de dependências (`npm audit`)
Corrigido com `npm audit fix`: vulnerabilidades em várias dependências (incluindo `path-to-regexp`). Restam, em dependências transitivas:
| Pacote | Severidade | Análise | Decisão |
|---|---|---|---|
| `multer` 2.4.0 (via `@nestjs/platform-express`) | alta — DoS com `fileFilter` **assíncrono** pendente após o fim da requisição | O projeto **não usa `fileFilter`**; tamanho/tipo são validados após o upload e o limite de tamanho é do próprio multer | Exceção aceita; reavaliar quando houver versão corrigida (a correção automática alterna com a do `path-to-regexp` no Nest atual) |
| `uuid` <11.1.1 (via `exceljs`) | moderada — checagem de limites em v3/v5/v6 **com `buf` fornecido** | Não usamos esses geradores com buffer; `npm audit fix --force` rebaixaria o `exceljs` para 3.x (quebra) | Exceção aceita; acompanhar atualização do `exceljs` |
Revisar mensalmente (`npm audit --omit=dev`).

## 7. Política de atualização
Dependências revisadas mensalmente e a cada release; críticas/altas aplicáveis em até 7 dias; atualização com `npm test` + `npm run test:browser` e backup prévio (ver `docs/politica-seguranca-informacao.md` §9).

## 8. Como repetir
```
npm run db:start && npm run db:status
npm test
npm run build
npm run dev                                   # em outro terminal
BROWSER_CHANNEL=msedge npm run test:browser   # inclui a Etapa 8
```
Observação: o "esqueci minha senha" é limitado a 10 solicitações por hora por IP; execuções repetidas podem exibir a mensagem de limite (o teste aceita as duas respostas).

## 9. Fora do escopo (conforme a especificação)
Nenhuma funcionalidade financeira. Etapa 9 não foi iniciada.
