# Validação da Etapa 10.5 — UX/UI, Design System e padronização visual

Etapa exclusivamente visual e de uso. **Nenhuma regra de negócio, permissão, enum, cálculo, auditoria ou autenticação foi alterada**; o backend não mudou nesta etapa. Etapa 12 não iniciada. Referência de uso: [design-system.md](design-system.md).

## 1. O que foi feito
| Tema | Entrega |
|---|---|
| Tokens | `frontend/src/styles/tokens.css`: cores (marca, semânticas, superfícies, texto com contraste AA), tipografia (mín. 12 px), escala de espaçamento de 4 px, bordas, sombras, foco, layout |
| CSS | `styles.css` agora só importa `tokens`, `base`, `pages` (legado migrado para tokens: 265 usos de variáveis, cores fixas eliminadas), `components`, `shell`, `print` |
| Layout | barra lateral por permissão (Principal · Gestão · Administração) + barra superior com contexto da página, usuário e **Sair**; menu recolhível no tablet/celular (☰ e botão fechar); rodapé com Privacidade/Termos; link "Ir para o conteúdo" |
| Login/MFA/recuperação | layout dividido com a logo JGM4, "Esqueci minha senha", MFA no mesmo cartão ("Digite o código do seu aplicativo autenticador"), fluxo solicitar → confirmação → redefinir → sucesso |
| 403 / 404 / indisponibilidade | páginas próprias (`/forbidden`, rota desconhecida); aviso global **sem deslogar** quando a API está indisponível |
| Painel do projeto | resumo executivo (cliente, projeto, status, saúde, progresso, fase, Gate, previsão, **próxima ação**), cartões com hierarquia (progresso, pendências e atrasados em destaque), saúde discreta com motivo, linha do tempo de fases **com Gate entre as fases**, horas separadas por JGM4/cliente (planejado, realizado, saldo, consumo) |
| Gates | visual de ponto de decisão (marcador e cor por situação: bloqueado, disponível, análise, correção, aprovado), critérios com ✓ / ○ / ! e texto (nunca só cor), cartões de parecer técnico × decisão do cliente |
| Atividade | ordem: título/status → próxima ação → **"Atividade bloqueada" + motivo** → responsáveis/datas/horas → dependências → execução e checklist → alterações → apontamentos → anexos → histórico (detalhes técnicos recolhidos) |
| Solicitações / Aprovações | status em badges semânticos; Central como caixa de entrada (tempo aguardando, prazo, prioridade, ação "Decidir"); estado vazio útil |
| Administração | abas Empresas · Usuários · Projetos · Templates · Segurança; tabelas com ações que quebram linha, vínculos recolhidos, diálogos de motivo/confirmação |
| Diálogos | `DialogService`/`<ui-dialog-host>` substituem **todos** os `confirm/prompt` nativos (administração, Gates, gestão do projeto): foco preso, `Esc`, `aria-modal`, campo obrigatório com mensagem; as mesmas confirmações de senha/MFA continuam exigidas e validadas pelo backend |
| Rótulos | `ui/labels.ts` centraliza perfis, status (projeto, fase, Gate, atividade, solicitação, aprovação, usuário, empresa, template, incidente), eventos de segurança, ações de auditoria, tipos de entidade/aprovação, menu por permissão e mensagens de erro amigáveis; valores desconhecidos são "humanizados" |
| Formatação | `ui/format.ts`: `25/10/2026`, `25/10/2026 14:30`, `36 h`, `78%` (pipes `fmtDate`, `fmtDateTime`, `fmtHours`, `fmtPercent`) |
| Erros | mensagens dizem o que houve e o que fazer; sem "API", "banco local" ou detalhes do servidor |
| Desempenho | rotas pesadas passaram a carregar sob demanda (bundle inicial **441 kB**, abaixo do orçamento de 500 kB) |
| Referência | `/dev/design-system` (somente fora de produção; no build de produção a rota não existe e cai na página 404 — verificado) |

## 2. Componentes criados (`frontend/src/ui/`)
Angular: `ui-page-header`, `ui-section-header`, `ui-breadcrumb`, `ui-card`, `ui-stat-card`, `ui-badge` (StatusBadge), `ui-progress`, `ui-empty`, `ui-loading`, `ui-skeleton`, `ui-alert`, `ui-field` (FormField), `ui-tabs`, `ui-user-badge` (Avatar), `ui-pagination`, `ui-drawer`, `ui-dialog-host` + `DialogService` (ConfirmDialog/Modal), `ui-auth-layout`, páginas 403/404, pipes de formatação e rótulos. Primitivos de CSS: Button (primário, secundário, terciário, perigo, ícone, carregando), Select/TextInput/TextArea/DateField/SearchField (estilo global dos controles), FilterBar (`.form-grid`/`.filter-tabs`) e DataTable (`.request-table` + `.stack-table`, que vira lista de cartões no celular). Ícones: sem biblioteca externa — símbolos de texto consistentes (✓ ▲ ◐ ○ ●) e o mesmo conjunto em todo o sistema. Componentes **disponíveis** mas ainda sem uso em tela: `ui-pagination`, `ui-drawer`, `ui-user-badge`, `ui-skeleton` (listados na página de referência).

## 3. Telas revisadas (lista prioritária)
Login ✔ · Dashboard JGM4 ✔ (tokens/tipografia/estados) · Dashboard do projeto ✔ (reestruturado) · Lista de projetos ✔ · Plano C ✔ (tokens/rótulos) · Fase ✔ · Atividade ✔ (reestruturada) · Solicitações ✔ · Gate ✔ (reescrito) · Central de Aprovações ✔ · Relatórios ✔ · Auditoria ✔ (rótulos) · Administração: Empresas, Usuários, Projetos, Templates, Segurança ✔ · Conta/MFA ✔.

## 4. Acessibilidade e contraste
Foco visível (contorno de 3 px com halo), navegação por teclado (diálogos com foco preso e `Esc`; menu móvel acionável por teclado), landmarks (`aside`, `nav`, `header`, `main`, `footer`), `aria-label` nos botões de ícone, `role=progressbar`/`alert`/`status`, `aria-modal`, rótulos associados aos campos, status com texto + símbolo (nunca só cor), áreas clicáveis de 34–40 px, `prefers-reduced-motion`. Contrastes dos tokens principais documentados em `design-system.md` (texto ≥ 5,2:1; marca 11:1). **Não foi executada auditoria automatizada com leitor de tela ou ferramenta de contraste**; os valores foram calculados na definição dos tokens.

## 5. Responsividade
Verificado por navegador (Edge) em **1920, 1440, 1366, tablet (820 px) e celular (390 px)** nas páginas principais (dashboards, plano, solicitações, Gates, aprovações e três telas de administração): **nenhuma rolagem horizontal**; tabelas do tipo `stack-table` viram cartões abaixo de 720 px; menu lateral vira gaveta com botão ☰/✕ e **Sair** sempre visível.

## 6. Regressões e alterações funcionais
- **Nenhuma alteração funcional.** Alterações de **texto/visual** que exigiram ajustar os scripts de teste (comportamento igual): perfil exibido como "Administrador JGM4" (antes "JGM4 Administrador", pedido pela especificação), "DECISÃO DO CLIENTE" no Gate (antes "DECISÃO OLLEM"), atalho de administração no menu lateral (`nav-admin-companies`), diálogos próprios no lugar de `confirm/prompt` (helper `answerDialog`), e a navegação do cliente.
- Defeitos de UX encontrados e corrigidos durante a validação: botão ☰ coberto pelo menu aberto (agora há ✕ dentro do menu), regra de impressão do alinhamento perdida na migração de CSS (restaurada), `id` duplicado (`conteudo`), aviso de indisponibilidade com `role=alert` duplicando o aviso da página (agora `status`), ações da tabela de usuários cortadas (quebra de linha e vínculos recolhidos).
- **Limitações conhecidas:** rótulos de solicitações ainda citam "Ollem" (texto histórico do projeto piloto; tornar dinâmico por cliente é evolução futura); Drawer/Pagination/Skeleton existem mas as telas atuais não precisam deles; sem dark mode e sem temas por cliente (fora de escopo).

## 7. Testes
- **Unitários de frontend** (`npm run test -w frontend`, 7 testes): rótulos de perfil e status sem enum técnico e com humanização, tons semânticos, **menu por permissão** (administração só para admin; relatórios/auditoria só com projeto aberto; cliente sem Dashboard), mensagens de erro amigáveis, formatação de datas/horas/percentuais. `npm test` na raiz agora roda backend e frontend.
- **Navegador** (`test:browser:stage10-5`): login, mensagem de login inválido, 404, 403, menu por perfil (consultor e cliente), atividade bloqueada com motivo, diálogo (campo obrigatório, `aria-modal`, `Esc`), estado vazio, menu móvel, **varredura de enums técnicos** (padrão `PALAVRA_PALAVRA`) em 16 telas, **ausência de rolagem horizontal** em 5 larguras × 9 páginas, imagens com texto alternativo, página de referência e screenshots.
- As suítes anteriores (etapas 1–8, 10A e 11) foram reexecutadas e passam; a 10.5 foi acrescentada à cadeia `npm run test:browser`.
- Revisão visual manual dos screenshots (texto cortado, overflow, sobreposição, tabelas): ajustes feitos nas tabelas de administração e no menu; demais telas sem achados.

## 8. Screenshots de validação
Pasta [`docs/validacao-etapa-10-5/`](validacao-etapa-10-5/): `login-desktop`, `login-mobile`, `404`, `403`, `dashboard-jgm4-desktop`, `dashboard-jgm4-mobile`, `projeto-dashboard-desktop`, `dashboard-projeto-mobile`/`-tablet`, `plano-desktop`, `atividade-desktop`, `atividade-liberada-desktop`, `solicitacoes-desktop`, `gates-desktop`, `gate-detalhe-desktop`, `aprovacoes-desktop`, `relatorios-desktop`, `auditoria-desktop`, `gestao-desktop`, `conta-desktop`, `admin-empresas|usuarios|projetos|templates|seguranca-desktop`, `dialogo-desktop`, `design-system`.
