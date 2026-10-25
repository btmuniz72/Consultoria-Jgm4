# Registro de Homologação — Etapa 9

> **Status: NÃO INICIADA em ambiente externo.** Nenhum domínio, servidor, banco, SMTP ou armazenamento externo foi fornecido/contratado até esta data; por isso nenhum teste externo foi executado e nenhum resultado abaixo foi presumido. A URL preferida de produção é `https://www.jgm4consultoria.com.br/projetos/`; staging pode usar host técnico isolado. Preencha este registro durante a homologação. **Não registre segredos.**

## 1. Identificação
| Campo | Staging | Produção |
|---|---|---|
| URL | _a definir (sugestão: `https://staging-projetos.jgm4consultoria.com.br/projetos/`)_ | _a definir (preferida: `https://www.jgm4consultoria.com.br/projetos/`)_ |
| API same-origin | `/api` no mesmo host, encaminhada sem remover prefixo | `/api` no mesmo host, encaminhada sem remover prefixo |
| Site institucional/proxy identificado pelo responsável | | |
| Versão publicada (commit/etiqueta) | | |
| Data / horário | | |
| Responsável técnico | | |
| Responsável pela aprovação | | |
| Provedor / região | | |

## 2. Preparação
| Passo | Resultado | Evidência |
|---|---|---|
| Banco exclusivo, usuário da aplicação, TLS, rede restrita | | |
| Migrations (`migrate deploy`) em staging, depois produção | | |
| Admin criado com `admin:bootstrap`; MFA ativo | | |
| `smoke:external` (sem login) | | |
| `smoke:external` (com usuário de smoke) | | |
| `test:browser:external` (suítes 5–8) | | |
| `test:browser:base-path` com build `/projetos/` | | |
| Refresh e deep links `/projetos/login`, `/projetos/dashboard`, `/projetos/projects/...` | | |

## 3. Cenários de homologação (item 38 da especificação)
Executar manualmente ou por script, no navegador real, com usuários de **homologação** (não importar usuários demo para produção):

| # | Cenário | Resultado | Obs. |
|---|---|---|---|
| 1 | Login JGM4 | | |
| 2 | Login cliente | | |
| 3 | MFA (ativar, login com código, código errado) | | |
| 4 | Projeto visível só ao cliente correto | | |
| 5 | Solicitação | | |
| 6 | Atividade (iniciar → concluir) | | |
| 7 | Checklist | | |
| 8 | Evidência | | |
| 9 | Upload e download de anexo | | |
| 10 | Horas | | |
| 11 | Aprovação | | |
| 12 | Gate | | |
| 13 | Relatório (PDF/XLSX) | | |
| 14 | Logout (sessão realmente invalidada) | | |
| 15 | Reset de senha por e-mail real | | |

## 4. Isolamento externo (item 39) — Cliente A × Cliente B
Tentativas deliberadas com o usuário do Cliente A contra recursos do Cliente B; esperado **403/404** em todas:

| Tentativa | HTTP obtido |
|---|---|
| Trocar o ID do projeto na URL do frontend | |
| `GET /api/projects/{B}/tasks`, `/requests`, `/gates` | |
| `GET /api/projects/{B}/attachments/{id}/download` | |
| `GET /api/projects/{B}/reports/executive` e exportações | |
| `GET /api/approvals/{id de B}` e decisão | |
| `GET /api/tasks/{id de B}` (atividade) | |
| `GET /api/projects/{B}/gates/{id}` | |
| `GET /api/projects/{B}/members` | |

(A cobertura equivalente já existe em testes automáticos locais — `security.spec.ts` e `browser-check-stage8` — mas **não substitui** a execução no ambiente real.)

## 5. Resiliência, desempenho e responsividade
| Verificação | Resultado |
|---|---|
| API indisponível: frontend informa, não apaga sessão, sem stack trace | |
| Banco indisponível em staging: `/api/health/ready` = 503 | |
| Tempo de login / dashboard / projeto / relatório (registrar ms; apontar gargalos, sem otimização prematura) | |
| Desktop, notebook, tablet, mobile | |

## 6. Problemas encontrados e correções
| # | Problema | Gravidade | Correção | Reteste |
|---|---|---|---|---|
| | | | | |

## 7. Decisão de go-live
- [ ] Staging aprovado (data/responsável): ______
- [ ] Pendências bloqueantes resolvidas (`docs/checklist-go-live.md`, itens 12 e 13 em especial): ______
- [ ] Produção liberada (data/responsável): ______
- Decisão: **PENDENTE**
