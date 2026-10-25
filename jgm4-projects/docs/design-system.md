# Design System — JGM4 Projects

Referência da Etapa 10.5. Fonte única dos estilos: `frontend/src/styles/` (importada por `styles.css`). Em desenvolvimento, a página `/dev/design-system` mostra todos os componentes e estados (a rota não existe no build de produção).

## 1. Princípios
Organização, confiabilidade, clareza e controle. Azul-marinho como cor principal; vermelho só para destaque, ação crítica, erro e atenção; superfícies brancas e cinzas claros; pouca informação com o mesmo peso. Cor nunca é o único sinal: todo status tem texto e ícone (✓ ▲ ◐ ○ ●).

## 2. Arquivos de estilo
| Arquivo | Conteúdo |
|---|---|
| `tokens.css` | cores, tipografia, espaçamento, bordas, sombras, foco e layout (variáveis CSS) |
| `base.css` | reset leve, tipografia, foco visível, utilitários (`.sr-only`, `.skip-link`) |
| `pages.css` | estilos de página legados (Etapas 1–9) já migrados para tokens |
| `components.css` | botões, badges, cartões, formulários, tabelas, abas, diálogos, estados |
| `shell.css` | barra lateral, barra superior, conteúdo, rodapé, telas de login, páginas 403/404 |
| `print.css` | impressão sem navegação |

## 3. Tokens
**Marca:** `--primary` #173a61 (azul-marinho), `--primary-hover`, `--primary-dark` #0f2a47 (barra lateral), `--primary-light`, `--accent` #b8323a (vermelho JGM4).
**Semânticas:** `--success`, `--warning`, `--danger`, `--info` (+ `-bg` e `-border`), `--neutral`.
**Superfícies:** `--bg` #f4f6f9, `--surface` branco, `--surface-2/3`, `--border`, `--border-subtle`, `--border-strong`.
**Texto:** `--text` #172b45, `--text-2` #3f5268, `--text-muted` #5b6d82.
**Contraste (WCAG AA ≥ 4,5:1 para texto):** `--text` sobre branco 14,6:1; `--text-2` 8,2:1; `--text-muted` 5,2:1; branco sobre `--primary` 11:1; `--danger`/`--warning`/`--success` sobre seus fundos claros ≥ 5:1. O foco usa contorno de 3 px em `--primary` com halo branco.

## 4. Tipografia
Fonte do sistema (`Segoe UI`, `system-ui`, Roboto, Arial) — sem fonte externa, sem dependência de rede. Escala: H1 26 px · H2 20 px · H3 16 px · corpo 14 px · small/label/tabela 13 px · helper/legenda 12 px (mínimo) · número de destaque 28 px. Linha 1,55.

## 5. Espaçamento, bordas e sombras
Escala de 4 px: `--sp-1…7` = 4, 8, 12, 16, 24, 32, 40. Raio 8 px em cartões, 6 px em controles, pílula só em badges. Sombra mínima (`--shadow-sm`); sombra média apenas em diálogos e gaveta. Altura de controle 40 px.

## 6. Componentes
Componentes Angular (em `frontend/src/ui/`, standalone) e primitivos de CSS:
| Item | Como usar |
|---|---|
| PageHeader / SectionHeader / Breadcrumb | `<ui-page-header title eyebrow subtitle [breadcrumb]>` · `<ui-section-header>` · `<ui-breadcrumb [items]>` |
| Card / StatCard | `<ui-card title>` · `<ui-stat-card label value hint tone [link]>` |
| StatusBadge | `<ui-badge [status] domain="task">` — rótulo e tom vêm do mapa central |
| ProgressBar | `<ui-progress [value] caption>` (`role=progressbar`) |
| EmptyState / LoadingState / Skeleton | `<ui-empty title message>` · `<ui-loading message>` · `<ui-skeleton [lines]>` |
| Alert | `<ui-alert tone="info\|success\|warning\|danger" title>` |
| FormField | `<ui-field label for help error [required]>` envolvendo `input/select/textarea` (Select, TextInput, TextArea, DateField e SearchField usam o estilo global de controles) |
| Tabs | `<ui-tabs [tabs]>` (e `.project-nav` / `.admin-nav` na navegação de projeto e administração) |
| Drawer / Modal / ConfirmDialog | `<ui-drawer>`; `DialogService` (`confirm`, `prompt`, `ask`) com `<ui-dialog-host>` na raiz: foco preso, `Esc` cancela, `aria-modal` |
| Avatar / UserBadge | `<ui-user-badge name subtitle>` |
| Pagination | `<ui-pagination [page] [pages] (pageChange)>` |
| DataTable | primitivo CSS `.request-table` (+ `.stack-table`, que vira lista de cartões abaixo de 720 px usando `data-label`) |
| Button / IconButton | primitivos CSS (abaixo); `.icon-button` para botão só com ícone |
| Pipes | `fmtDate`, `fmtDateTime`, `fmtHours`, `fmtPercent`, `roleLabel`, `statusLabel` |

## 7. Botões
Primário (padrão, `button`), Secundário (`.secondary`), Terciário (`.tertiary` / `.quiet-button`), Perigo (`.danger`, e `.danger.solid` para confirmação final). Altura 40 px (34 px no terciário), foco visível, `:disabled` com 50% de opacidade, `.is-loading` mostra um indicador. Uma única ação primária por área; ações críticas (cancelar, bloquear, inativar, alterar segurança) usam Perigo e continuam exigindo as confirmações já definidas — o backend é quem valida.

## 8. Status (agrupamento semântico)
| Cor | Significado | Exemplos |
|---|---|---|
| Cinza | não iniciado / bloqueado / inativo | Não iniciada, Bloqueada, Rascunho, Cancelado |
| Azul | disponível / em andamento | Liberada, Em andamento, Disponível |
| Amarelo | aguardando / análise | Aguardando validação JGM4, Em análise, Pendente |
| Vermelho | correção / erro / atraso | Ajuste solicitado, Correção necessária, Crítico |
| Verde | aceito / validado / concluído | Aceita, Aprovado, Concluída |

Nenhum enum técnico aparece ao usuário: `frontend/src/ui/labels.ts` concentra rótulos (perfis, status, eventos de segurança, ações de auditoria), tons, menu por permissão e mensagens de erro amigáveis; valores desconhecidos são "humanizados" (`SOME_STATUS` → "Some status").

## 9. Formatação
Datas `25/10/2026`; com hora `25/10/2026 14:30`; horas `36 h` (decimal só quando necessário, `7,5 h`); percentuais `78%`. Funções em `frontend/src/ui/format.ts`.

## 10. Layout e navegação
Desktop (≥ 1024 px): barra lateral fixa (Principal · Gestão · Administração, por permissão) + barra superior (contexto da página, usuário, **Sair**) + conteúdo de até 1280 px. Abaixo disso, a barra lateral vira menu recolhível (botão ☰); **Sair** continua sempre visível. Item ativo destacado com fundo suave e marcador lateral. Telas de autenticação usam layout dividido (marca + formulário). Páginas 403, 404 e indisponibilidade têm tratamento próprio; a indisponibilidade da API mostra aviso sem encerrar a sessão.

## 11. Formulários e diálogos
Label sempre visível (placeholder não substitui label), ajuda (`.field-help`) e erro (`.field-error`) associados ao campo, campos obrigatórios marcados com `*`. Ações que pediam `window.prompt/confirm` usam `DialogService` (motivo, confirmação, perfil, inativação), preservando os mesmos dados enviados ao backend.

## 12. Acessibilidade
Link "Ir para o conteúdo"; foco visível em todos os controles; navegação por teclado (diálogos com foco preso e `Esc`); landmarks (`aside`, `nav`, `header`, `main`, `footer`); `aria-label` nos botões de ícone; `role=progressbar`, `role=alert/status` nas mensagens; status nunca só por cor; alvo de clique mínimo de 34–40 px; `prefers-reduced-motion` respeitado.

## 13. Estados
Vazio: mensagem útil ("Nenhuma aprovação pendente."), nunca "0 registros". Carregando: `ui-loading`/skeleton. Erro: o que aconteceu + o que fazer ("Não foi possível carregar o projeto. Verifique sua conexão e tente novamente."), sem detalhe técnico.
