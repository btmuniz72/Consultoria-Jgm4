# Plano de Resposta a Incidentes de Segurança — JGM4 Projects

## 1. Definição
Incidente: evento que comprometa ou possa comprometer confidencialidade, integridade ou disponibilidade (acesso indevido, vazamento, malware, perda de dados, abuso de conta, indisponibilidade relevante).

## 2. Situações no sistema
`OPEN` → `INVESTIGATING` → `CONTAINED` → `RESOLVED` → `CLOSED`. Cada mudança exige uma nota e fica em histórico imutável (`IncidentEvent`). Gestão em `/admin/security` (JGM4_ADMIN).

## 3. Severidade (orientação)
| Nível | Critério | Meta de reação |
|---|---|---|
| Crítico | Dados de clientes expostos, conta administrativa comprometida | Imediata (≤ 1 h) |
| Alto | Acesso indevido a um projeto, malware em anexo | ≤ 4 h |
| Médio | Tentativas persistentes de ataque, falha de controle sem exposição | ≤ 1 dia útil |
| Baixo | Anomalia isolada | ≤ 3 dias úteis |

Metas são sugestões **[DECISÃO JGM4]**.

## 4. Fluxo
1. **Detectar** — alertas de `SecurityEvent` (picos de `LOGIN_FAILED`, `ACCOUNT_LOCKED`, `SESSION_REFRESH_REUSE`, `ACCESS_DENIED`, `CSRF_REJECTED`, `ATTACHMENT_REJECTED`), relato de usuário, revisão de logs.
2. **Registrar** — abrir incidente (título, descrição, impacto, dados afetados, empresas afetadas, responsável).
3. **Conter** — bloquear usuário (`BLOCKED`) e revogar sessões; rotacionar segredos se houver suspeita de vazamento; isolar o anexo/endpoint; se necessário, tirar o serviço do ar.
4. **Investigar** — `SecurityEvent` por usuário/período, `AuditLog`, logs de aplicação (sanitizados); preservar evidências (não apagar).
5. **Erradicar e recuperar** — corrigir causa, restaurar dados se preciso (`docs/backup-e-restore.md`), reativar contas após troca de senha obrigatória.
6. **Comunicar** — clientes afetados e, quando houver risco ou dano relevante a titulares, avaliar comunicação à ANPD e aos titulares (LGPD art. 48) — **decisão do controlador com apoio jurídico [REVISÃO JURÍDICA]**.
7. **Encerrar e aprender** — causa raiz, ações corretivas, atualização de política/testes; fechar como `CLOSED`.

## 5. Contatos
Responsável de segurança, jurídico, provedores e canal de privacidade **[DECISÃO JGM4]**.

## 6. Modelo de registro
Data/hora de detecção e de ocorrência · quem detectou · sistemas e dados afetados · empresas afetadas · ações tomadas (com horário) · comunicação realizada · causa raiz · ações preventivas e responsáveis/prazos.
