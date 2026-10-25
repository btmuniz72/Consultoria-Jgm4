# Política de Proteção de Dados Pessoais — JGM4 Projects

> **Aviso:** este documento registra o que foi implementado **tecnicamente** e organiza o tratamento de dados pessoais. Ele **não declara conformidade jurídica absoluta** com a LGPD (Lei 13.709/2018). Bases legais, papéis (controlador/operador), contratos, encarregado (DPO) e prazos legais dependem de **revisão jurídica e organizacional**. Pontos assim estão marcados com **[REVISÃO JURÍDICA]**.

## 1. Mapa de dados pessoais
| Dado | Onde | Titular | Finalidade | Sensibilidade |
|---|---|---|---|---|
| Nome, e-mail | `User` | Usuários JGM4 e do cliente | Identificar e autenticar; atribuir responsabilidades | Pessoal comum |
| Hash da senha | `User.passwordHash` | Usuário | Autenticar | Restrito (nunca exibido/logado) |
| Segredo MFA | `User.mfaSecretEnc` | Usuário | Segundo fator | Restrito (cifrado AES-256-GCM) |
| Empresa, perfil, vínculos | `User`, `ProjectMembership` | Usuário | Controle de acesso | Pessoal comum |
| IP, navegador, datas de acesso | `UserSession`, `SecurityEvent` | Usuário | Segurança e investigação | Pessoal comum |
| Autoria de ações (quem fez o quê) | `AuditLog`, `Approval`, apontamentos | Usuário | Trilha de auditoria do projeto | Pessoal comum |
| Conteúdo de tarefas, evidências, anexos | tabelas do projeto, armazenamento | Terceiros eventualmente citados | Execução do projeto | Pode conter dados pessoais; **orientar usuários a não anexar dados sensíveis desnecessários** |
| Token de redefinição | `PasswordResetToken` | Usuário | Recuperar acesso | Restrito (somente hash, uso único, curta duração) |

O sistema **não** coleta dados sensíveis (art. 5º, II) por desenho, nem dados financeiros.

## 2. Princípios aplicados tecnicamente
- **Finalidade e necessidade:** apenas dados necessários à operação do projeto e à segurança.
- **Minimização:** sem CPF, telefone, endereço ou data de nascimento; logs sem senhas/tokens/cookies.
- **Livre acesso e transparência:** página `/privacy` (editável) e contato `PRIVACY_CONTACT_EMAIL`.
- **Segurança:** ver `docs/politica-seguranca-informacao.md`.
- **Prevenção e responsabilização:** `SecurityEvent` e `AuditLog`; revisão de acessos.
- **Não discriminação / não uso secundário:** dados não são usados para publicidade nem vendidos.

## 3. Retenção
| Dado | Prazo padrão | Variável | Observação |
|---|---|---|---|
| Eventos de segurança | 365 dias | `RETENTION_SECURITY_EVENT_DAYS` | depois removidos |
| IP/navegador em eventos | 90 dias | `RETENTION_IP_DAYS` | anonimizados, evento mantido |
| Sessões expiradas/revogadas | 30 dias | `RETENTION_SESSION_DAYS` | |
| Tokens de redefinição | 7 dias | `RETENTION_RESET_TOKEN_DAYS` | |
| Contadores de rate limit | 1 dia | `RETENTION_RATE_LIMIT_DAYS` | |
| Registros de geração de relatório | 5 anos | `RETENTION_REPORT_LOG_DAYS` | |
| `AuditLog`, aprovações, histórico de status | **não apagados** | — | prova do projeto; prazo legal/contratual **[REVISÃO JURÍDICA]** |

Execução: `npm run retention:run` (agendar diariamente). Prazos acima são *padrões técnicos*, a confirmar **[REVISÃO JURÍDICA]**.

## 4. Anonimização e eliminação
A administração pode **anonimizar** um usuário (`POST /api/admin/users/:id/anonymize`, com reconfirmação de senha e motivo): nome/e-mail substituídos por valores irreversíveis, sessões e tokens revogados, MFA removido, conta inativada. Registros de auditoria permanecem, apontando para o registro anonimizado, preservando a integridade histórica sem identificar a pessoa. Eliminação física de registros de auditoria não é feita por padrão.

## 5. Direitos do titular (art. 18) — fluxo operacional
1. Solicitação ao contato de privacidade (`/privacy`).
2. Confirmar identidade do solicitante.
3. Administrador consulta dados (tela de usuários; acesso aos eventos de segurança) e atende: confirmação/acesso, correção (edição de cadastro), anonimização, informação sobre compartilhamento.
4. Registrar a solicitação e a resposta (ata/ticket) — **hoje manual; não há módulo dedicado**. Prazo de resposta e portabilidade **[REVISÃO JURÍDICA]**.

## 6. Compartilhamento e operadores
Provedores de hospedagem, banco, armazenamento, e-mail e antimalware atuam como operadores; exigir contrato de proteção de dados e localização dos dados **[REVISÃO JURÍDICA]**. Dentro da plataforma, dados de um projeto só são visíveis a usuários vinculados a ele (isolamento testado entre JGM4, Ollem e Cliente B).

## 7. Incidentes envolvendo dados pessoais
Seguir `docs/plano-resposta-incidentes.md`. A avaliação de risco relevante e a comunicação à ANPD e aos titulares (art. 48) são decisões do controlador **[REVISÃO JURÍDICA]**.

## 8. Pendências para decisão organizacional/jurídica
- Definição de controlador/operador por contrato com cada cliente.
- Encarregado (DPO) e canal oficial.
- Bases legais por finalidade; prazos de retenção finais.
- Texto final de `/privacy` e `/terms` (placeholders `[PREENCHER]`).
- Registro das operações de tratamento (ROPA) oficial e RIPD, se exigidos.
- Transferência internacional (se o provedor hospedar fora do Brasil).
