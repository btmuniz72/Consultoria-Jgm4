# Checklist de Go-Live — JGM4 Projects

Preencha na data do go-live (staging primeiro; produção só depois). Estados: OK · PENDENTE · N/A · BLOQUEANTE. Registre responsável e data; **não registre segredos**.
Estado da preparação local (2026-10-25): nenhum ambiente externo foi homologado — tudo que exige infraestrutura está **PENDENTE**. Arquitetura preferida: Área do Cliente em `https://www.jgm4consultoria.com.br/projetos/`, com `/api` no mesmo host. Link adicionado ao menu da homepage; ainda falta regra de proxy no virtual host Apache antes do 404 do `.htaccess`.

| # | Item | Staging | Produção | Evidência / responsável |
|---|---|---|---|---|
| 1 | DNS apontando para o ambiente | PENDENTE | PENDENTE | |
| 2 | HTTPS válido, cadeia correta, HTTP→HTTPS, renovação | PENDENTE | PENDENTE | `npm run smoke:external` |
| 3 | Banco exclusivo, usuário da aplicação sem superusuário, TLS, rede restrita | PENDENTE | PENDENTE | |
| 4 | Migrations versionadas aplicadas (`migrate deploy`), `db:status` limpo | PENDENTE | PENDENTE | |
| 5 | Secrets no cofre (nada no repositório); API inicia sem avisos de configuração | PENDENTE | PENDENTE | |
| 6 | Storage privado: upload/download autenticados, isolamento por projeto, limites | PENDENTE | PENDENTE | |
| 7 | SMTP real: reset de senha e aviso de segurança entregues; remetente oficial | PENDENTE | PENDENTE | |
| 8 | Backup automático ativo (frequência/retenção/local/responsável definidos) | PENDENTE | PENDENTE | |
| 9 | Restore testado em ambiente separado, com evidência | PENDENTE | PENDENTE | |
| 10 | Monitoramento e alertas (API, frontend, banco, erros, login, backup) | PENDENTE | PENDENTE | |
| 11 | Logs JSON sem segredos e com rotação/retenção | PENDENTE | PENDENTE | |
| 12 | Política institucional única vinculada; Termos de Uso aprovado e sem `[PREENCHER]`; revisão jurídica registrada | BLOQUEANTE | **BLOQUEANTE** | Política `/pages/politica.html`; Termos ainda provisórios |
| 13 | `PRIVACY_CONTACT_EMAIL` definido | PENDENTE | BLOQUEANTE | |
| 14 | Admin criado por `admin:bootstrap`; MFA ativado; senha trocada | PENDENTE | PENDENTE | |
| 15 | Nenhum usuário demo (`@jgm4.local`, `@ollem.local`) nem projeto "Simulação" em produção | N/A | PENDENTE | consulta ao banco |
| 16 | Usuários e memberships reais criados de forma controlada e auditados | N/A | PENDENTE | |
| 17 | Teste externo (navegador real): login JGM4/cliente, MFA, reset, logout, fluxo completo | PENDENTE | PENDENTE | `docs/homologacao-etapa-9.md` |
| 18 | Isolamento Cliente A × Cliente B (URL/ID/arquivo/relatório/aprovação/atividade/Gate → 403/404) | PENDENTE | PENDENTE | |
| 19 | CSRF/CORS/cookies (`Secure`, `HttpOnly`, `SameSite`) no domínio real | PENDENTE | PENDENTE | `smoke:external` |
| 20 | Responsividade desktop/notebook/tablet/mobile no ambiente | PENDENTE | PENDENTE | |
| 21 | Falha simulada de API/banco: frontend informa, não apaga sessão, readiness 503 | PENDENTE | N/A | |
| 22 | Plano de rollback lido pela equipe; backup imediatamente anterior ao deploy | PENDENTE | PENDENTE | `docs/plano-rollback.md` |
| 23 | `npm audit --omit=dev` revisado no release | OK (2026-10-25) | PENDENTE | exceções em `validacao-etapa-8.md` |
| 24 | Smoke pós-publicação (login, dashboard, projeto, solicitação, atividade, logout) | PENDENTE | PENDENTE | |
| 25 | Observação pós-go-live (erros, login, banco, CPU/mem, storage, backup) por 24–48 h | PENDENTE | PENDENTE | |
| 26 | Proxy do site identificado e encaminhando apenas `/projetos` e `/api`, preservando todos os caminhos públicos atuais | PENDENTE | PENDENTE | responsável pelo site + `docs/arquitetura-area-cliente.md` |
| 27 | Angular publicado com base `/projetos/`; refresh, assets e lazy routes validados | PENDENTE | PENDENTE | `npm run test:browser:base-path` |
| 28 | `X-Robots-Tag`/meta robots na aplicação e recomendação robots aplicada sem bloquear páginas institucionais | PENDENTE | PENDENTE | smoke externo + robots institucional |

## Decisão
- **Go-live de staging:** liberado quando os itens 1–11, 14, 17–22, 24 estiverem OK.
- **Go-live de produção pública:** liberado somente com **todos** os itens OK/N/A e sem BLOQUEANTE (especialmente 12 e 13), aprovação de: __________ em __/__/____.
