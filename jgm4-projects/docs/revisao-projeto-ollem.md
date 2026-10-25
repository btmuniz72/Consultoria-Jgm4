# Revisão do projeto Ollem

Implementação local em 25/10/2026. Escopo: implantação assistida, proposta técnica/comercial, aceite versionado e preparação contratual. Etapa 9B e Etapa 10B não integram esta revisão.

## Estrutura e cronograma

| Fase | Conteúdo | Referência |
| --- | --- | --- |
| 0 — Preparação do projeto | Empresa/projeto, usuários/acessos, patrocinador, gestor e responsáveis, apresentação do Projects, solicitações, evidências, Gates, reuniões e informações iniciais | Sem cobrança, R$ 0,00 |
| 1 — Estruturação do CD | Planta/croqui, layout e melhorias físicas, zoneamento, movimentações aprovadas, endereçamento, cadastro e campos sistêmicos | Novembro/dezembro de 2026 |
| 2 — Inventário, validação e treinamentos | Inventário físico x sistema, divergências, treinamento presencial, separação, documentos, picking, abastecimento, mínimos/máximos | Janeiro de 2027 |
| 3 — Estabilização | Rotinas, auditoria, indicadores, POPs finais, inventário cíclico, correções, sustentação e encerramento | Após validação da Fase 2; datas a definir |

Datas exatas são configuráveis pelo administrador em **Proposta → Gestão JGM4 → Fase → Datas exatas**. Os meses acima são referências do acordo. Datas e condições incluídas em documentos já emitidos permanecem no retrato daquela versão; alterações exigem emissão de nova versão.

A Fase 1 contém orientações pontuais. O treinamento operacional formal está na Fase 2. Endereçamento: Depósito → Rua → Andar → Apartamento (exemplo `01-03-02-05`). Criticidade: CR1 alta, CR2 média e CR3 baixa. Ollem disponibiliza campos de endereço e criticidade; cria/valida EAN-13 quando aplicável ao produto e DUN-14 quando houver embalagem logística. A JGM4 orienta formato e uso. Desenvolvimento no ERP é responsabilidade da Ollem/fornecedor.

Separação: solicitação → liberação → separação → conferência → entrega/expedição → baixa. Áreas de separados, conferência e retirada não se confundem com o estoque disponível. Picking e reserva são distintos; o abastecimento repõe posições e atualiza registros. Mínimos consideram consumo, reposição e criticidade; máximos consideram espaço, lotes, consumo, excesso e obsolescência. O inventário cíclico usa maior frequência em CR1, intermediária em CR2 e menor em CR3.

## Responsabilidades e movimentações

JGM4: metodologia, análise, planejamento, layout, processos, orientação, documentação, reuniões, acompanhamento, validações, inventários assistidos, treinamento e Gates. Ollem: informações, execução física, movimentações, estruturas/equipamentos, compras, cadastro, alterações no sistema e participação nos inventários.

A atividade de movimentação estrutural exige aceite do patrocinador ou gestor autenticado antes de iniciar. A tela da atividade registra a referência analisada. O backend grava usuário, data, texto, versão e instruções da atividade no AuditLog. Depois da execução, continuam obrigatórias as evidências e a validação JGM4. O aceite estrutural não substitui o aceite da proposta nem o Gate.

## Preservação e aplicação

As migrations acrescentam os modelos comerciais, dependências e marcadores de histórico. O comando `npm run ollem:revise` aplica uma revisão transacional e idempotente ao projeto Ollem existente. O seed de desenvolvimento também a aplica e não reintroduz a estrutura antiga em projeto já revisado.

São preservados os IDs, usuários, vínculos, autenticação, permissões, apontamentos, evidências, solicitações, aprovações, decisões e auditoria. Os valores anteriores de fases, atividades e Gates são registrados na auditoria da revisão. Mudanças da fase da atividade propagam as relações compostas existentes por `ON UPDATE CASCADE`. A antiga Fase 4 e seu Gate ficam arquivados para consulta, fora das contagens do plano ativo. Critérios anteriores permanecem no banco com o marcador `archived`; as evidências originais não são apagadas. Detalhes e auditoria continuam consultáveis por ID. O Gate final passa a ser o da última fase ativa, sem depender do número 4.

O template genérico Plano C continua independente: mudar o projeto Ollem não altera templates ou projetos de outros clientes. O roteiro de alinhamento anterior é identificado na interface como histórico, com link para a proposta atual.

## Dependências externas e compras paralelas

`ExternalDependency` registra descrição, responsável, fornecedor opcional, prazo, impacto, situação, etapa, observação e bloqueios explícitos de projeto/atividade. A atividade vinculada deve pertencer ao mesmo projeto. Cadastro e atualização têm auditoria e respeitam os vínculos e perfis existentes.

Fluxo: definição técnica → orçamento → aprovação Ollem → compra/contratação → prazo fornecedor → recebimento → instalação → validação. Situações: PLANNED, IN_PROGRESS, WAITING_EXTERNAL, COMPLETED e CANCELLED, apresentadas em português na interface.

Bloqueios são desativados por padrão. Uma compra pendente pode coexistir com projeto ativo, sem suspender o contrato ou as tarefas independentes. O backend impede o início somente das tarefas abrangidas por bloqueios explícitos ativos. A atividade de acompanhamento de compras não é obrigatória para disponibilizar o Gate; os critérios técnicos continuam exigindo controle das compras críticas e estrutura física mínima. Os Gates continuam dependentes das entregas técnicas aplicáveis.

O dashboard mostra as dependências abertas separadamente. Estar aguardando fornecedor, por si só, não adiciona atraso ou penalidade à saúde. A saúde continua calculando prazos reais, horas operacionais, tarefas e Gates. Mensagem: **“Dependência física em andamento — projeto continua nas atividades independentes.”**

## Horas e valores

`PhaseCommercial` é separado das estimativas e apontamentos operacionais. Horas comerciais Home Office e In Company são configuradas exclusivamente pela JGM4_ADMIN. As estimativas históricas não são automaticamente convertidas em contratação.

* Fase 0: Home Office 0, In Company 0, total R$ 0,00; horas internas de preparação não integram a proposta.
* Home Office: R$ 120,00/h.
* In Company: R$ 220,00/h.
* Fases comerciais começam com horas nulas, apresentadas como **A configurar**. Nulo não é zero contratado.
* Home Office em novembro/dezembro: análise, layout, desenho, reuniões, documentação, acompanhamento, cadastro, orientação e validação.
* In Company em janeiro: inventário, auditoria física, treinamento e validação prática.
* Home Office em janeiro/fechamento: inventário analisado, relatórios, correções, POPs, sustentação e encerramento.
* Valores são calculados somente sobre horas JGM4 configuradas, com arredondamento monetário em centavos. Horas da Ollem não geram valor.

Não se utiliza automaticamente o dimensionamento comercial anterior de 84 horas. Nenhuma quantidade comercial final foi presumida.

## Proposta e aceite

Página: `/projects/:projectId/proposal`. Contém apresentação, objetivo, funcionamento, fases e Gates, cronograma, trilhas paralelas, responsabilidades, horas, valores, pagamento, condições e aceite. Configurações administrativas ficam separadas ao final. É possível consultar versões anteriores e imprimir a apresentação pelo navegador.

`Proposal` contém projeto, versão sequencial, status, emissão, validade opcional, aprovação, usuário aprovador, notas e datas de criação/atualização. Também mantém um snapshot completo do documento e hash SHA-256. Situações: DRAFT, SENT, UNDER_REVIEW, APPROVED, REJECTED e SUPERSEDED.

1. Administrador configura horas/condições e cria versão para leitura. Versões não são editadas em lugar: alterações geram nova versão.
2. Envio exige horas comerciais configuradas em todas as fases e a versão mais recente. O envio substitui as versões anteriores em circulação, preservando conteúdo, comentários e aceites.
3. Patrocinador/gestor podem registrar revisão; usuários vinculados podem registrar dúvidas. Rejeição pelo patrocinador exige justificativa.
4. Patrocinador autenticado confirma os cinco itens: escopo, responsabilidades, fases, horas/valores e premissas/interrupção.
5. **VALIDAR PROPOSTA** verifica estado, versão, hash, validade e todas as confirmações. Grava usuário, data, versão, IP tecnicamente disponível, cópia exata do conteúdo/declarações e AuditLog na mesma transação.
6. O bloqueio transacional por projeto serializa versões e decisões concorrentes; versões substituídas ou já decididas não podem receber novo aceite.

Após o aceite: **“Proposta validada — aguardando formalização contratual.”** Não é assinatura contratual e não inicia automaticamente o projeto. As quantidades e textos de uma versão aceita permanecem intactos quando o planejamento atual é alterado.

## Contrato e início

Contrato é documento separado, sem integração de assinatura eletrônica nesta revisão. `Project.contractStatus`: NOT_CREATED, DRAFT, SENT_FOR_SIGNATURE, SIGNED ou CANCELLED. O administrador registra a situação e referência do documento, com auditoria.

O início comercial é uma ação explícita da JGM4_ADMIN. Exige proposta APPROVED vigente em circulação e contrato SIGNED, ou exceção formal autorizada com administrador autenticado, data e justificativa. O evento de início é gravado em ProjectStatusEvent e AuditLog. O aceite isolado não altera Project.status. A mesma condição é verificada ao iniciar atividades comerciais e retomar um projeto. A preparação gratuita pode ocorrer antes da formalização.

Para projetos sob esse controle, o dashboard usa o status oficial do projeto; uma atividade administrativa de preparação ou apontamento histórico não inicia a execução comercial por inferência.

## Pagamento por fase e Gates

Cada fase comercial tem valor calculado pelas horas contratadas, percentual de entrada, saldo, vencimento opcional, condição de pagamento, bloqueio opcional, atendimento e evidência/observação. Não há faturamento contábil ou processamento de pagamento.

**“Cada fase poderá possuir entrada própria antes do início.”** O administrador pode ativar condição comercial bloqueante. A decisão técnica do Gate permanece independente: aprovar o Gate não marca pagamento como atendido e registrar pagamento não aprova Gate. Se a condição bloqueante estiver pendente, o Gate pode ser aprovado e a fase seguinte permanece bloqueada. Quando a condição é atendida, o sistema libera somente a fase cujo Gate anterior já foi aprovado. A execução verifica a condição novamente no backend.

## Interrupção e retomada

“O projeto poderá ser interrompido por qualquer uma das partes mediante comunicação formal. Permanecem devidos os serviços efetivamente executados até a data da interrupção e despesas previamente aprovadas.”

“Em eventual retomada, cronograma, pendências e dimensionamento poderão ser revistos.”

Esperar fornecedor/compra não suspende o projeto automaticamente. Permanecem os controles existentes de suspensão, retomada e cancelamento, seus perfis, auditoria e requisitos de segurança.

## Operação e validação

```powershell
npm run db:generate
npm run db:migrate
npm run ollem:revise
npm run test
npm run build
npm run test:browser:ollem
```

A suíte `backend/test/ollem-revision.spec.ts` usa PostgreSQL real em schema descartável e autenticação real. Verifica fases, meses, preparação gratuita, modalidades/tarifas, preservação de dados e idempotência, tenant/perfil, movimentação com aceite, dependência paralela, versão e confirmações, contrato e retomada, independência comercial/técnica e Gate final.

Os testes anteriores de leitura foram isolados com sua própria fixture legada do Plano C, preservando suas expectativas e verificações de regressão. As verificações antigas de navegador das Etapas 2/3 também usam a fixture legada em seus schemas temporários; o teste do plano principal verifica a estrutura atual. Isso evita usar o estado histórico da Ollem como fixture fixa de um template genérico.

O navegador da revisão cria schema temporário, aplica migrations/seed e serve o build em porta própria. Exercita configuração pela interface, emissão/envio, dúvidas, cinco confirmações, persistência do aceite, contrato separado, bloqueio de início, dashboard de dependências, ausência de erros JavaScript e responsividade em 1440, 820 e 390 px. As horas e o aceite fictícios ficam somente nesse schema. Capturas em `.local/screenshots/ollem/`.

Resultados, estado real confirmado e capturas: [validação da revisão Ollem](validacao-revisao-ollem.md).
