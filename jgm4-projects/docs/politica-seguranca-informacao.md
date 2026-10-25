# Política de Segurança da Informação — JGM4 Projects

Documento-base técnico-organizacional (Etapa 8). Os campos marcados com **[DECISÃO JGM4]** dependem de definição da diretoria; nada aqui substitui revisão jurídica.

## 1. Objetivo e escopo
Proteger a confidencialidade, a integridade e a disponibilidade das informações dos projetos conduzidos no JGM4 Projects (JGM4 e empresas clientes). Vale para a plataforma, seu banco de dados, anexos, backups, equipe JGM4 e usuários dos clientes.

## 2. Papéis
| Papel | Responsabilidade |
|---|---|
| Diretoria JGM4 | Aprova esta política, riscos aceitos, RPO/RTO e contratação de infraestrutura **[DECISÃO JGM4]** |
| JGM4_ADMIN | Administra usuários, vínculos, revisão de acessos, incidentes; MFA obrigatório em produção |
| Responsável de segurança / privacidade | Designado pela JGM4 **[DECISÃO JGM4]**; recebe alertas e conduz incidentes |
| Consultores | Acessam apenas projetos aos quais estão vinculados |
| Usuários do cliente | Acessam apenas projetos da própria empresa e vinculados a eles |

## 3. Classificação das informações
| Nível | Exemplos no sistema | Tratamento |
|---|---|---|
| PUBLIC | Páginas `/privacy`, `/terms`, `/api/health` | Sem restrição |
| INTERNAL | Metodologia, textos de roteiros, modelos de relatório | Somente usuários autenticados |
| CONFIDENTIAL | Dados de projetos, tarefas, horas, relatórios, anexos, aprovações | Acesso por vínculo ao projeto; transporte cifrado; auditoria |
| RESTRICTED | Senhas (hash), segredos MFA (cifrados), tokens, chaves, backups, eventos de segurança, dados pessoais de usuários | Acesso mínimo (admin), cifrado em repouso quando aplicável, nunca em logs |

## 4. Controles implementados (técnicos)
- **Autenticação:** senha com política (mín. 10 caracteres, maiúscula, minúscula, número, símbolo, lista de senhas comuns, sem nome/e-mail), hash bcrypt, bloqueio persistente (5 falhas → 15 min), resposta genérica para e-mail inexistente.
- **Sessões:** access token de 15 min + refresh rotativo em cookie HttpOnly; sessão revogável no servidor; reutilização de refresh revoga a sessão; logout encerra de fato; "encerrar todas as sessões"; troca de senha encerra as demais.
- **MFA (TOTP):** opcional para todos, obrigatório para administradores em produção (`REQUIRE_MFA_FOR_ADMIN`).
- **Autorização:** guards globais (autenticação → limite de taxa → vínculo ao projeto); o perfil é sempre relido do banco; isolamento entre empresas testado.
- **Navegador:** CSRF (token + `Origin` + `X-Requested-With`), CORS restrito a `ALLOWED_ORIGINS`, HSTS, CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`; HTTP recusado em produção.
- **Limite de taxa persistente** (tabela no banco; sobrevive a reinícios e várias instâncias).
- **Dados:** AES-256-GCM para segredos (`DATA_ENCRYPTION_KEY`); anexos privados (tipo, tamanho, MIME e *magic bytes* validados; nome interno aleatório; download autenticado; gancho de antimalware ClamAV); logs sanitizados (`redact`).
- **Trilhas:** `AuditLog` (negócio, imutável) separado de `SecurityEvent` (segurança, retenção própria).
- **Erros** sem *stack trace* ao cliente; correlação por identificador.
- **Ações críticas** (cancelar projeto, remover vínculo, mudar situação/perfil de usuário, anonimizar) exigem reconfirmação de senha (e MFA quando ativo).

## 5. Gestão de acessos
- Concessão: administrador cria usuário e vincula a projetos (tela `Segurança` → `/admin/security`); senha inicial por link de uso único.
- Revisão: relatório de acessos (`/api/admin/access-review`, exportável em XLSX) aponta sem login há 90 dias, administrador sem MFA, vínculo sem atividade, contas bloqueadas. **Frequência sugerida: trimestral [DECISÃO JGM4]**.
- Revogação: inativar/bloquear usuário encerra sessões; remover vínculo preserva histórico.
- Nenhum usuário compartilha conta. Contas de teste não existem em produção (seed bloqueado).

## 6. Segredos e chaves
Fora do repositório (`.env` ignorado; `.env.example` só com valores fictícios). Em produção, cofre do provedor. Rotação: `JWT_SECRET` (invalida sessões), `DATA_ENCRYPTION_KEY` (requer re-cifragem — ver plano de continuidade), `BACKUP_ENCRYPTION_KEY` (nova chave para novos backups; guardar a antiga enquanto houver backups). Vazamento suspeito = incidente (ver `docs/plano-resposta-incidentes.md`).

## 7. Ambientes
Desenvolvimento, teste, homologação e produção separados: bancos, segredos, armazenamento e `APP_ENV` distintos. Dados reais não vão para ambientes inferiores sem anonimização.

## 8. Backup e continuidade
Ver `docs/backup-e-restore.md` e `docs/plano-continuidade.md`.

## 9. Atualizações e vulnerabilidades
- `npm audit` a cada release e mensalmente; críticas/altas aplicáveis corrigidas em até 7 dias; demais no ciclo seguinte. Exceções documentadas em `docs/validacao-etapa-8.md`.
- Atualização de Node, PostgreSQL e dependências em janela planejada, com testes (`npm test`, `npm run test:browser`) e backup prévio.

## 10. Treinamento e conduta
Usuários recebem orientação sobre senha forte, MFA, não compartilhar credenciais e reportar suspeitas. Uso indevido pode levar à suspensão da conta e das medidas contratuais cabíveis.

## 11. Incidentes
Registro e acompanhamento na tela de administração (OPEN → INVESTIGATING → CONTAINED → RESOLVED → CLOSED), conforme `docs/plano-resposta-incidentes.md`.

## 12. Revisão
Revisar anualmente ou após incidente relevante. Versão 1.0 — gerada na Etapa 8; aprovação formal **[DECISÃO JGM4]**.
