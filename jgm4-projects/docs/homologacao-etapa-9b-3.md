# Homologação — Etapa 9B.3

## Registro de execução

Data da revalidação local: 2026-10-25. O ambiente de staging não está disponível: `staging-projetos.jgm4consultoria.com.br` retornou `NXDOMAIN` e não há infraestrutura externa configurada para esta revisão. Portanto, os cenários externos abaixo permanecem **PENDENTES**, sem inferir aprovação a partir dos testes locais.

| Verificação | Resultado | Evidência / próximo passo |
|---|---|---|
| Navegação Site-First a partir da homepage (etapa 9B.3A) | OK local | `BROWSER_CHANNEL=msedge npm run test:site-integration`, 2026-10-26: 7 grupos de verificação (build com base `/projetos/`, site institucional intacto, 404 institucional, `/projetos/*` com 42 arquivos de build e deep links, `/api/*`, navegação homepage → Área do Cliente → login → dashboard → atividade com refresh → documentos → logout, isolamento de rotas). Usa gateway local que imita o virtual host, **não** Apache real. |
| Browser da Área do Cliente sob `/projetos` | OK local | `npm run test:browser:area-cliente`, Edge; fluxo de cliente/admin, documentos, atividade, deep links, isolamento de autorização e larguras responsivas. |
| Testes unitários | OK local | `npm test`: 196 testes aprovados (189 backend + 7 frontend). |
| Build | OK local | `npm run build`: backend e frontend compilados. |
| Estado de migrations | OK local | `npm run db:status`: 15 migrations; schema atualizado. |
| DNS e TLS externos | PENDENTE | DNS NXDOMAIN; repetir após provisionamento e emitir certificado. |
| Apache/reverse proxy real | PENDENTE | Aplicar/revisar em vhost isolado; seguir [apache-area-cliente.md](apache-area-cliente.md). |
| Smoke HTTPS, cookies, CSRF e logout | PENDENTE | Executar `smoke:external` com conta fictícia controlada. |
| Browser externo, login e rotas profundas | PENDENTE | Requer contas Cliente A/Admin e fixture fictícia no staging. |
| Isolamento Cliente A × Cliente B em projeto, tarefa, solicitação, Gate, relatório, documento e aprovação | PENDENTE | Executar matriz abaixo e registrar status HTTP esperado (403/404) sem expor conteúdo de B. |
| SEO/robots sem afetar o site institucional | PENDENTE | Confirmar headers/meta da aplicação e os caminhos públicos após a regra do proxy. |

## Etapa 9B.3B — levantamento de infraestrutura (2026-10-26)

Status: **PREPARAÇÃO CONCLUÍDA / PROVISIONAMENTO PENDENTE**. Staging e produção continuam inexistentes; nenhum provedor foi escolhido.

| Item | Resultado | Referência |
|---|---|---|
| Site institucional | Estático HTML/CSS/JS + 4 scripts PHP; HostGator BR (nginx + Apache), publicação por FTPS | [infraestrutura-atual.md](infraestrutura-atual.md) |
| Frontend Angular em `/projetos/` | SUPORTADO (arquivos estáticos) | idem |
| Proxy `/api` para backend externo, Node persistente, PostgreSQL | NÃO IDENTIFICADO (sem evidência de suporte) | idem |
| Arquitetura recomendada | Cenário B (site e Angular atuais + backend externo + PostgreSQL), condicionada à prova do proxy | [arquitetura-producao.md](arquitetura-producao.md) |
| Contratação, acessos e ordem de execução | Definidos, nada contratado | [checklist-provisionamento.md](checklist-provisionamento.md) |
| Pendência para a Etapa 9B | Plano do HostGator, proxy, backend, banco, SMTP/DMARC, backup, staging e homologação real | idem |

## Roteiro Site-First no staging (obrigatório, parte da homepage)

Execute no navegador, nesta ordem, e registre cada passo: (1) abrir `https://<host-staging>/`; (2) localizar "Área do Cliente" no menu; (3) clicar; (4) confirmar `/projetos/` (sem sessão, tela de login); (5) login com a conta fictícia do Cliente A; (6) dashboard; (7) Atividades; (8) abrir uma atividade; (9) atualizar a página; (10) confirmar que a sessão persiste; (11) Documentos; (12) voltar à Visão Geral; (13) logout; (14) confirmar retorno ao login. Complementos: `/rota-publica-inexistente` exibe o 404 institucional com status 404 (nunca a SPA); `/projetos/rota-interna` é tratada pelo Angular; `/projetos/privacy` leva a `/pages/politica.html`; cabeçalhos de `/projetos/` e `/api/` não foram sobrescritos pelo `.htaccess` institucional. O script `npm run test:site-integration` automatiza a mesma sequência em ambiente local como referência.

## Matriz para execução no staging

Use duas contas e projetos fictícios independentes. Para cada tentativa de A sobre recurso de B, confirme 403 ou 404 e que nenhum dado/arquivo de B foi devolvido.

| Cenário | Resultado esperado |
|---|---|
| `https://<host-staging>/` | Site institucional correto ou página definida para o host técnico; nunca redirecionar implicitamente para produção. |
| `/projetos/`, refresh em `/projetos/login` e rota profunda de projeto/tarefa | SPA carrega, assets mantêm prefixo e sessão sobrevive ao refresh. |
| `/api/health/live` e `/api/health/ready` | Respostas coerentes com saúde da aplicação e do banco, sem detalhes internos. |
| Cliente A acessa seu projeto, atividade, solicitação, Gate, relatório e documentos | Somente dados fictícios de A; ações de leitura e upload/download conforme autorização. |
| Cliente A troca IDs por projeto/tarefa/solicitação/Gate/relatório/documento/aprovação de B | 403/404 sem metadados nem conteúdo de B. Repetir via API e URL direta. |
| Sessão, CSRF e cookies | Cookies de sessão `Secure`, `HttpOnly`, `SameSite` conforme política; CSRF válido para mutações; origem indevida rejeitada. |
| Login/logout de Cliente A e administrador JGM4 | Papéis e navegação corretos; logout invalida a sessão. |
| Viewports 1920, 1440, 1366, tablet e 390 px | Sem overflow horizontal ou controles inacessíveis nas páginas principais. |
| Busca/robots e caminhos institucionais | Regras da aplicação não indexam conteúdo privado nem alteram canonical/robots do site institucional. |

## Comandos e segurança dos testes

Após provisionar ambiente e contas:

```powershell
$env:BASE_URL = 'https://<host-staging>/projetos'
npm run smoke:external
```

O script atual `test:browser:external` encadeia cenários históricos de navegador ligados a fixtures/fluxos de desenvolvimento; não o trate como runner genérico de staging sem revisar as dependências e os efeitos de cada etapa. Em particular, não execute cenários que criem, alterem MFA ou removam dados em contas compartilhadas. Para a homologação externa, use contas descartáveis e scripts read-only ou prepare um runner dedicado com credenciais fornecidas por variáveis de ambiente, sem registrar senhas ou tokens.

Registre data, versão/commit, host, navegador, resultado e evidências sanitizadas. Não grave cookies, tokens, senhas, dados reais de clientes ou conteúdo de arquivos. A 9B.3 só pode ser marcada concluída depois que o staging real estiver provisionado e todos os cenários obrigatórios forem executados e aprovados. Esta etapa não autoriza publicação em produção.
