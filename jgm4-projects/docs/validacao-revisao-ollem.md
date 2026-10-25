# Validação da revisão Ollem

Executada localmente em 25/10/2026, com PostgreSQL real e Microsoft Edge via Playwright. Nenhum aceite, contrato ou quantitativo comercial fictício foi gravado no projeto real.

| Verificação | Resultado |
| --- | --- |
| Regressão completa (`npm run test`) | 12 suítes / 187 testes backend e 1 suíte / 7 testes frontend aprovados |
| Suíte final da revisão (`test/ollem-revision.spec.ts`) | 13 testes aprovados, incluindo exceção formal e versões concorrentes adicionados após a regressão |
| Revisão + regressão de relatórios | 2 suítes / 31 testes aprovados na execução final |
| Build backend + frontend (`npm run build`) | Aprovado; bundle inicial abaixo do orçamento de 500 kB |
| Navegador (`BROWSER_CHANNEL=msedge`, `npm run test:browser:ollem`) | Aprovado em 1440, 820 e 390 px |

## Cenários verificados

* Fase 0 sem cobrança; preparação interna não convertida em valor.
* Fase 1 em novembro/dezembro de 2026 e Fase 2 em janeiro de 2027, com treinamentos na Fase 2.
* Cadastro/endereço/criticidade/EAN/DUN, compras paralelas, picking, abastecimento e mínimos/máximos nas fases aplicáveis.
* IDs, solicitações, evidências, apontamentos e critérios anteriores preservados; revisão idempotente.
* Home Office a R$ 120/h, In Company a R$ 220/h e horas cliente sem valor comercial.
* Horas comerciais pendentes apresentadas como **A configurar**, sem presumir quantidade final.
* Isolamento por projeto, perfis, validação de corpo e bloqueio de valores negativos.
* Compra em espera coexistindo com projeto ativo e atividade independente em execução.
* Movimentação estrutural bloqueada até aceite autenticado e auditado da Ollem.
* Dúvida registrada, cinco confirmações obrigatórias, versão/hash, cópia exata do conteúdo aceito e auditoria.
* Aceite sem assinatura de contrato nem início automático; início/retomada exigindo formalização ou exceção autorizada.
* Exceção formal restrita a administrador autenticado, com usuário, motivo e auditoria.
* Duas emissões concorrentes com versões únicas e sequenciais.
* Pagamento sem aprovação de Gate e Gate técnico aprovado sem liberar fase comercialmente bloqueada.
* Alterações no planejamento sem mudar o conteúdo aceito; versões substituídas preservando o aceite anterior.
* Gate final reconhecendo a última fase ativa; antiga Fase 4 fora do plano de ação e relatório final, preservada para consulta histórica.
* Configuração de horas pela interface, emissão/envio, dúvida, aceite persistente após recarregar e dashboard de dependências.
* Ausência de erros JavaScript, erros de CSP ou rolagem horizontal nas três resoluções verificadas.

## Inspeção visual do build

A hospedagem do build já aplica CSP sem execução de scripts inline. A otimização padrão do Angular gerava um `onload` inline para ativar o CSS principal, bloqueado por essa política. A configuração de produção agora desativa apenas `inlineCritical`: o CSS é carregado por link de stylesheet normal, mantendo minificação e otimização de scripts. A segurança existente foi preservada.

O teste de navegador verifica também `position: fixed` da barra lateral e `display: flex` da estrutura da aplicação, além de detectar erros de CSP no console. As capturas finais foram inspecionadas visualmente:

* `.local/screenshots/ollem/proposta-previa-desktop.png`
* `.local/screenshots/ollem/proposta-aceita-desktop.png`
* `.local/screenshots/ollem/proposta-820.png`
* `.local/screenshots/ollem/proposta-390.png`

Os valores e o aceite exibidos nessas capturas pertencem exclusivamente ao schema temporário do teste, removido ao final.

## Estado confirmado da base real

* Revisão Ollem aplicada; quatro fases ativas e a antiga Fase 4 arquivada.
* Projeto em `PLANNING`; contrato em `NOT_CREATED`.
* Preparação com 0 h Home Office e 0 h In Company.
* Fases comerciais com horas nulas, aguardando configuração da JGM4_ADMIN.
* Nenhuma proposta emitida ou aprovada artificialmente: a página apresenta a prévia atual, e o administrador pode criar a primeira versão para leitura.
* Informações anteriores e alterações locais preexistentes preservadas.
* Etapa 9B não alterada e Etapa 10B não iniciada.

Os schemas temporários dos testes são removidos ao final. Não houve publicação ou execução de assinatura eletrônica.
