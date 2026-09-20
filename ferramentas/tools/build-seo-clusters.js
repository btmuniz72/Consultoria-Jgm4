const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "../..");
const updated = "2026-08-02";

const freightHub = "../pages/auditoria-de-fretes.html";
const wmsHub = "../pages/consultoria-wms-tms.html";

const articles = [
  {
    file: "como-reduzir-custo-frete-sem-trocar-transportadora.html",
    title: "Como Reduzir o Custo de Frete sem Trocar de Transportadora | JGM4",
    description: "Veja como reduzir custo de frete revisando pedidos, cubagem, taxas, ocorrências e regras comerciais antes de trocar de transportadora.",
    h1: "Como reduzir o custo de frete sem trocar de transportadora",
    kicker: "Gestão de fretes",
    summary: "Antes de abrir uma nova cotação, verifique como pedido, embalagem, cadastro, frequência e ocorrências formam o custo. Muitas oportunidades estão dentro da operação.",
    hub: freightHub,
    hubLabel: "Solicitar auditoria de fretes",
    sections: [
      ["Comece pela composição do custo", ["A tarifa é apenas uma parte do frete. Peso taxável, cubagem, frete mínimo, ad valorem, GRIS, pedágio, restrição de entrega, reentrega e devolução podem alterar o valor final. A empresa precisa reproduzir o cálculo antes de concluir que a tabela está cara.", "Organize uma amostra de CT-es, notas, pedidos e faturas. Compare a condição contratada com a cobrança e classifique as diferenças por motivo. Essa rotina revela erros, mas também decisões internas que tornam a operação mais cara."]],
      ["Revise o perfil dos pedidos", ["Pedidos pequenos e frequentes diluem menos o frete mínimo. Analise valor, peso, volume, região, canal e cliente para identificar onde a política comercial cria embarques deficitários.", "Consolidação, calendário de corte e pedido mínimo por região podem reduzir frequência sem prejudicar o serviço. Teste cenários na calculadora de pedido mínimo antes de alterar a regra comercial."], ["Segmente frete sobre venda por região e canal.", "Separe pedidos urgentes dos recorrentes.", "Meça custo por pedido e por quilograma expedido."]],
      ["Trate cubagem e embalagem", ["Produtos leves e volumosos podem ser cobrados pelo peso cubado. Meça as embalagens reais, confirme o fator do contrato e compare o peso taxável com o peso físico.", "Reduzir espaço vazio, padronizar caixas e desmontar itens quando tecnicamente possível pode baixar o peso taxável. A mudança precisa preservar integridade, produtividade e experiência do cliente."]],
      ["Elimine custos de ocorrência", ["Reentrega, devolução, espera, área de restrição e dificuldade de agendamento nem sempre são problemas da transportadora. Cadastro incompleto, promessa comercial e falta de confirmação com o cliente também geram custo.", "Crie causas padronizadas e acompanhe valor e reincidência. Corrigir uma causa recorrente pode ser mais sustentável que negociar alguns pontos percentuais na tarifa."]],
      ["Negocie com evidências", ["Leve para a transportadora volumes por faixa, regiões, frequência, cubagem, desempenho e oportunidades de consolidação. Dados melhores permitem discutir condição, operação e nível de serviço, não apenas desconto.", "Trocar de fornecedor faz sentido quando aderência, capacidade ou desempenho não atendem. Antes disso, uma auditoria mostra o que é cobrança, contrato e processo."]]
    ],
    related: [["Calculadora de pedido mínimo","../pages/calculadora-pedido-minimo.html"],["Frete alto: outras causas","frete-alto-principais-causas.html"],["Comparar tabelas","como-comparar-tabelas-transportadoras.html"]],
    faq: [["É possível reduzir frete sem renegociar a tarifa?","Sim. Consolidação, pedido mínimo, embalagem, cadastro e redução de ocorrências podem diminuir o custo total."],["Quando devo trocar de transportadora?","Quando custo, capacidade, cobertura, serviço ou aderência continuam inadequados após medir e tratar causas controláveis."]]
  },
  {
    file: "frete-alto-principais-causas.html",
    title: "Frete Alto: Principais Causas Além da Tabela | JGM4",
    description: "Entenda por que o frete fica alto mesmo com uma boa tarifa: pedido pequeno, cubagem, taxas, urgência, devolução, região e política comercial.",
    h1: "Frete alto: principais causas além da tabela da transportadora",
    kicker: "Custo total de transporte",
    summary: "Frete alto raramente tem uma única causa. A leitura correta conecta tabela, perfil dos pedidos, embalagem, região, serviço e falhas operacionais.",
    hub: freightHub, hubLabel: "Analisar meus fretes",
    sections: [
      ["Tarifa baixa não garante custo baixo", ["Uma tabela competitiva pode gerar custo elevado quando o pedido cai no frete mínimo, recebe adicionais ou utiliza um serviço incompatível com a necessidade. Compare valor final por pedido, não apenas tarifa por quilograma.", "Também verifique se faixas, praças e taxas estão sendo aplicadas como contratado. A auditoria precisa reproduzir a memória de cálculo do CT-e."]],
      ["Pedido e política comercial", ["Pedidos de baixo valor, urgentes ou dispersos por região aumentam frequência e reduzem ocupação. Quando a política comercial ignora custo de atendimento, a logística absorve a diferença.", "Meça frete sobre venda, custo por pedido e margem por região. O mesmo percentual não serve para todos os clientes e produtos."]],
      ["Peso cubado e embalagem", ["O peso real pode ser pequeno, mas o volume ocupar grande parte do veículo. Nessa situação, contratos podem usar peso cubado. Dimensão incorreta no cadastro também causa cobrança indevida ou decisão errada.", "Compare embalagem vendida, embalagem expedida e medida usada na cobrança. Revise espaços vazios sem comprometer proteção."]],
      ["Taxas e exceções", ["GRIS, ad valorem, pedágio, restrição, difícil acesso, agendamento, reentrega, devolução e permanência podem superar a tarifa principal. Classifique cada adicional e identifique se ele é contratual, evitável ou contestável.", "Uma taxa recorrente deve virar indicador e plano de ação. Tratar somente a fatura mantém a causa."]],
      ["Como montar o diagnóstico", ["Segmente ao menos por transportadora, cliente, destino, canal, peso, cubagem, valor do pedido e motivo de ocorrência. Compare períodos equivalentes e valide mudanças de mix.", "Depois, priorize ações por impacto financeiro e capacidade de implantação. A redução precisa preservar prazo, integridade e nível de serviço."]]
    ],
    related: [["Reduzir sem trocar transportadora","como-reduzir-custo-frete-sem-trocar-transportadora.html"],["Peso cubado","peso-cubado-como-calcular-reduzir-frete.html"],["Percentual de frete","como-calcular-percentual-frete-sobre-venda.html"]],
    faq: [["Por que o frete aumentou se a tabela não mudou?","Mix de pedidos, regiões, cubagem, taxas, urgências e ocorrências podem elevar o custo mesmo sem reajuste."],["Qual indicador usar primeiro?","Frete sobre venda e custo por pedido são pontos de partida, mas precisam ser segmentados por região, cliente e canal."]]
  },
  {
    file: "como-identificar-cobrancas-indevidas-cte.html",
    title: "Como Identificar Cobranças Indevidas no CT-e | JGM4",
    description: "Aprenda a conferir CT-e, tabela, peso, cubagem, taxas, duplicidades, CEP e ocorrências para identificar divergências de cobrança de frete.",
    h1: "Como identificar cobranças indevidas no CT-e",
    kicker: "Auditoria de fretes",
    summary: "Uma conferência confiável compara documento, contrato e operação. O objetivo não é procurar erro ao acaso, mas reproduzir a regra correta de cobrança.",
    hub: freightHub, hubLabel: "Solicitar auditoria de CT-es",
    sections: [
      ["Reúna a base de comparação", ["Separe CT-e, nota fiscal, pedido, fatura, tabela, contrato e registros de entrega. Sem a condição vigente e os dados do embarque, a análise fica limitada.", "Controle versões e datas das tabelas. Uma cobrança pode parecer errada quando foi aplicada uma condição nova ou uma praça diferente."]],
      ["Confira os dados do embarque", ["Valide CNPJ, origem, destino, CEP, valor da mercadoria, peso real, quantidade de volumes e dimensões. Erros cadastrais alteram faixa, risco, imposto e adicionais.", "Compare o CT-e com o que realmente saiu. Divergências de peso ou volume precisam de evidência de balança, romaneio ou cadastro validado."]],
      ["Reproduza a tarifa", ["Aplique faixa de peso, frete mínimo, excedente, pedágio, ad valorem, GRIS e taxas previstas. Documente a fórmula para que outra pessoa consiga repetir o cálculo.", "Observe arredondamentos, peso taxável e regras por fração. Pequenas diferenças podem se acumular em grande volume."]],
      ["Procure duplicidades e adicionais", ["Verifique documentos repetidos, complementares sem justificativa, reentrega, devolução, área de restrição e diárias. Relacione cada cobrança a uma ocorrência registrada.", "Não conteste automaticamente toda taxa. Separe o que está correto, o que depende de evidência e o que diverge do contrato."]],
      ["Crie rotina antes do pagamento", ["Defina tolerância, responsáveis e fluxo de contestação. A pré-auditoria deve ocorrer antes da aprovação financeira, com retorno para cadastro, expedição e negociação.", "Acompanhe valor divergente, causa, transportadora, prazo de resposta e recuperação. Assim a auditoria passa a prevenir, não apenas corrigir."]]
    ],
    related: [["Comparar tabelas","como-comparar-tabelas-transportadoras.html"],["Peso cubado","peso-cubado-como-calcular-reduzir-frete.html"],["Auditoria de fretes",freightHub]],
    faq: [["Quais documentos são necessários?","CT-es, notas, pedidos, faturas, tabelas, contratos e registros de ocorrência formam a base mínima."],["Toda diferença é cobrança indevida?","Não. Pode haver erro de cadastro, condição nova ou ocorrência legítima. A divergência precisa ser validada."]]
  },
  {
    file: "peso-cubado-como-calcular-reduzir-frete.html",
    title: "Peso Cubado: Como Calcular e Reduzir o Impacto no Frete | JGM4",
    description: "Entenda peso cubado, peso taxável, fator de cubagem e como embalagem, cadastro e consolidação podem reduzir o impacto no frete.",
    h1: "Peso cubado: como calcular e reduzir o impacto no frete",
    kicker: "Cubagem e transporte",
    summary: "O peso cubado converte volume em uma referência de peso. Muitos contratos cobram o maior entre peso real e cubado, mas fator e regras devem ser confirmados.",
    hub: freightHub, hubLabel: "Analisar cobranças por cubagem",
    sections: [
      ["O que é peso cubado", ["O veículo possui limite de peso e de espaço. Uma carga leve e volumosa pode ocupar capacidade antes de atingir o peso máximo. A cubagem cria uma equivalência para essa ocupação.", "A regra não é universal. Modal, transportadora, contrato, dimensão e arredondamento podem mudar o cálculo."]],
      ["Como calcular", ["Com medidas em metros, multiplique comprimento, largura e altura para obter metros cúbicos. Depois multiplique o volume pelo fator de cubagem do contrato.", "Exemplo ilustrativo: uma caixa de 0,60 × 0,40 × 0,30 m ocupa 0,072 m³. Com fator 300 kg/m³, o peso cubado é 21,6 kg. Se o peso real for 12 kg e o contrato usar o maior valor, a referência taxável será 21,6 kg."]],
      ["Erros frequentes", ["Usar medidas do produto em vez da embalagem, ignorar quantidade, manter cadastro antigo ou aplicar fator genérico são falhas comuns. Meça a unidade expedida e confirme a regra vigente.", "Também verifique se a transportadora arredonda dimensão, volume ou peso. Registre a memória de cálculo."]],
      ["Como reduzir o impacto", ["Revise caixas, espaços vazios, kits, desmontagem, empilhamento e consolidação. Uma embalagem menor pode reduzir peso taxável, mas precisa preservar proteção e produtividade.", "Segmente produtos com alta relação volume/peso e simule alternativas antes de mudar o padrão."]],
      ["Conecte cubagem à gestão", ["Inclua dimensão e peso confiáveis no cadastro, integre esses dados à cotação e confira CT-es. Compras, produto, comercial e logística precisam compartilhar a responsabilidade.", "Use a calculadora da JGM4 como estimativa e confirme sempre contrato e cotação."]]
    ],
    related: [["Calculadora de cubagem","../pages/calculadora-peso-cubado.html"],["Cobranças no CT-e","como-identificar-cobrancas-indevidas-cte.html"],["Frete alto","frete-alto-principais-causas.html"]],
    faq: [["Qual fator de cubagem devo usar?","Use o fator previsto no contrato ou informado na cotação. Não existe um único fator válido para todos os serviços."],["Peso cubado sempre é cobrado?","Não. A aplicação depende do contrato e da comparação com peso real e outras regras."]]
  },
  {
    file: "frete-minimo-pedido-deficitario.html",
    title: "Frete Mínimo: Quando um Pedido se Torna Deficitário | JGM4",
    description: "Entenda como frete mínimo, valor do pedido, margem, custo operacional e região podem transformar pedidos pequenos em operações deficitárias.",
    h1: "Frete mínimo: quando um pedido se torna deficitário",
    kicker: "Pedido mínimo e margem",
    summary: "A tarifa mínima protege a operação de transporte, mas pode consumir a margem de pedidos pequenos. A política comercial precisa enxergar esse custo antes da venda.",
    hub: freightHub, hubLabel: "Revisar política de fretes",
    sections: [
      ["Como funciona o frete mínimo", ["Mesmo quando peso e distância geram valor baixo, a transportadora pode aplicar uma cobrança mínima para cobrir coleta, documentação, terminal e entrega.", "Por isso o custo não cai proporcionalmente ao tamanho do pedido. Pequenas vendas podem carregar percentuais muito superiores à média."]],
      ["Calcule o peso no pedido", ["Divida o frete pelo valor da venda e multiplique por 100. Um frete de R$ 180 em pedido de R$ 1.500 representa 12%. Em pedido de R$ 4.500, representa 4%.", "O percentual precisa ser comparado com margem, custo operacional, impostos e estratégia. Não existe limite universal."]],
      ["Identifique o ponto deficitário", ["Analise margem bruta estimada menos frete e custos diretos de atendimento. Se o saldo não sustenta despesas e risco, o pedido precisa ser revisto.", "Use dados por região, canal e cliente. Misturar pedidos muito diferentes esconde perdas."]],
      ["Alternativas ao simples bloqueio", ["Consolide pedidos, estabeleça calendário, ofereça retirada, cobre parte do frete, altere condição CIF/FOB ou defina mínimo segmentado. A decisão deve considerar experiência e concorrência.", "Comunique a regra com antecedência e acompanhe impacto em conversão e recorrência."]],
      ["Monitore depois da mudança", ["Acompanhe ticket, frequência, frete sobre venda, margem, pedidos cancelados e nível de serviço. Uma política correta no papel pode gerar efeitos comerciais inesperados.", "Revise sempre que tabelas, mix, regiões ou margens mudarem."]]
    ],
    related: [["Calculadora de pedido mínimo","../pages/calculadora-pedido-minimo.html"],["Percentual de frete","../pages/calculadora-percentual-frete.html"],["Pedido mínimo inteligente","pedido-minimo-inteligente-logistica-frete-margem.html"]],
    faq: [["Frete mínimo é cobrança indevida?","Não necessariamente. Pode ser uma condição contratual. A cobrança deve ser comparada com a tabela vigente."],["Pedido mínimo deve ser nacional?","Não. Regiões, canais e margens diferentes podem exigir regras diferentes."]]
  },
  {
    file: "como-comparar-tabelas-transportadoras.html",
    title: "Como Comparar Tabelas de Transportadoras Corretamente | JGM4",
    description: "Compare tabelas de transportadoras considerando faixas, praças, frete mínimo, taxas, cubagem, prazo, ocorrências e perfil real dos embarques.",
    h1: "Como comparar tabelas de transportadoras corretamente",
    kicker: "Cotação e gestão",
    summary: "Comparar apenas tarifa por quilo produz decisões ruins. A tabela precisa ser aplicada aos embarques reais e combinada com serviço, cobertura e ocorrências.",
    hub: freightHub, hubLabel: "Solicitar análise de tabelas",
    sections: [
      ["Padronize antes de comparar", ["Organize faixas de peso, regiões, CEPs, frete mínimo, excedente, ad valorem, GRIS, pedágio e demais taxas em uma estrutura comum.", "Registre vigência, impostos e condições especiais. Nomes parecidos podem representar regras diferentes."]],
      ["Use sua base de embarques", ["Simule uma amostra representativa de pedidos por peso, volume, valor e destino. A melhor tabela depende do mix real, não de uma faixa isolada.", "Inclua sazonalidade e regiões menos frequentes quando forem relevantes para o negócio."]],
      ["Calcule o peso taxável", ["Confirme a regra de cubagem de cada proposta. Dois fornecedores com tarifa semelhante podem gerar resultados diferentes por fator, arredondamento ou dimensão mínima.", "Use as embalagens expedidas, não medidas aproximadas."]],
      ["Compare serviço e custo de falha", ["Prazo, cobertura, capacidade, rastreabilidade, avaria, reentrega e atendimento influenciam o custo total. Uma tarifa menor pode aumentar devolução e desgaste com clientes.", "Crie uma matriz com custo simulado e indicadores mínimos de serviço."]],
      ["Documente premissas", ["Guarde base, período, regras e exceções. Isso permite repetir a análise quando o mix ou a tabela mudar.", "Depois da contratação, compare simulado, cobrado e realizado para validar a decisão."]]
    ],
    related: [["Quando realizar BID","quando-realizar-bid-transportadoras.html"],["Cobranças no CT-e","como-identificar-cobrancas-indevidas-cte.html"],["Calculadora de cubagem","../pages/calculadora-peso-cubado.html"]],
    faq: [["Qual tabela é mais barata?","A resposta depende da aplicação ao seu perfil real de embarques, incluindo taxas, cubagem e frete mínimo."],["Preciso comparar prazo?","Sim. Custo sem aderência ao serviço pode aumentar atrasos, devoluções e perda de cliente."]]
  },
  {
    file: "como-calcular-percentual-frete-sobre-venda.html",
    title: "Como Calcular o Percentual de Frete sobre a Venda | JGM4",
    description: "Aprenda a calcular percentual de frete sobre a venda, segmentar o indicador e evitar conclusões erradas sobre margem, pedido e região.",
    h1: "Como calcular o percentual de frete sobre a venda",
    kicker: "Indicador de transporte",
    summary: "O indicador mostra quanto o transporte representa no valor vendido. Ele é simples, mas precisa ser segmentado para orientar decisões.",
    hub: freightHub, hubLabel: "Analisar custos de frete",
    sections: [
      ["Fórmula do percentual", ["Divida o valor do frete pelo valor da venda e multiplique por 100. Exemplo ilustrativo: R$ 450 de frete em pedido de R$ 5.000 representam 9%.", "Use a mesma base temporal e defina se o indicador considera frete contratado, cobrado, provisionado ou realizado."]],
      ["O que incluir no frete", ["Decida se entram tarifa, taxas, pedágio, ad valorem, GRIS, reentrega, devolução e impostos. A regra deve ser estável para permitir comparação.", "Quando a empresa paga frete de ida e retorno, separar componentes ajuda a encontrar a causa."]],
      ["Segmente o indicador", ["A média geral esconde clientes, regiões e canais deficitários. Analise por pedido, cliente, transportadora, região, produto e faixa de ticket.", "Compare percentuais com margem e nível de serviço. Um percentual maior pode ser aceitável em determinada estratégia, mas precisa ser consciente."]],
      ["Erros frequentes", ["Misturar faturamento bruto e líquido, excluir taxas, comparar meses com mix diferente ou usar frete estimado em um período e realizado em outro distorce a leitura.", "Documente fonte, data e tratamento de cancelamentos e devoluções."]],
      ["Transforme indicador em ação", ["Quando o percentual supera a meta, investigue pedido mínimo, cubagem, tabela, ocorrência, urgência e política comercial. Evite cobrar a equipe por uma média sem explicar sua composição.", "A calculadora gratuita ajuda a simular um pedido individual; a gestão precisa trabalhar com a base completa."]]
    ],
    related: [["Calculadora de percentual","../pages/calculadora-percentual-frete.html"],["Pedido mínimo","../pages/calculadora-pedido-minimo.html"],["Frete alto","frete-alto-principais-causas.html"]],
    faq: [["Existe percentual ideal de frete?","Não existe valor universal. Margem, região, produto, canal e serviço precisam ser considerados."],["Uso faturamento bruto ou líquido?","Escolha uma base coerente com a análise financeira da empresa e mantenha a regra documentada."]]
  },
  {
    file: "quando-realizar-bid-transportadoras.html",
    title: "Quando Realizar um BID de Transportadoras | JGM4",
    description: "Saiba quando realizar um BID de transportadoras, quais dados preparar e como comparar custo, cobertura, capacidade e nível de serviço.",
    h1: "Quando realizar um BID de transportadoras",
    kicker: "Estratégia de transportes",
    summary: "BID é um processo estruturado de seleção e negociação. Ele funciona melhor quando a empresa conhece sua demanda e está pronta para cumprir as premissas apresentadas.",
    hub: freightHub, hubLabel: "Preparar análise de transportadoras",
    sections: [
      ["Sinais de que o BID pode fazer sentido", ["Mudança relevante de volume, expansão regional, baixa capacidade, serviço instável, concentração excessiva ou tabela vencida justificam uma revisão de mercado.", "Frete alto isoladamente não basta. Primeiro confirme se o custo vem da tabela, do perfil dos pedidos ou de falhas internas."]],
      ["Quando ainda não é hora", ["Se dados de peso, dimensão, CEP, frequência e ocorrência não são confiáveis, as propostas serão construídas sobre premissas fracas.", "Também evite BID quando a empresa não consegue direcionar volume, cumprir janela ou fornecer previsão. A credibilidade influencia a condição."]],
      ["Base mínima de dados", ["Prepare embarques por origem, destino, peso real e cubado, valor, volumes, frequência, serviço e sazonalidade. Inclua ocorrências e requisitos de agendamento.", "Anonimize dados sensíveis quando possível e estabeleça um período representativo."]],
      ["Critérios de avaliação", ["Compare custo simulado, cobertura, prazo, capacidade, tecnologia, atendimento, risco, cobrança e plano de implantação. Defina pesos antes de receber as propostas.", "Valide referências e realize rodada de esclarecimentos. O menor preço não deve corrigir sozinho uma baixa aderência operacional."]],
      ["Implantação e acompanhamento", ["Planeje cadastro, integração, comunicação, transição, contingência e indicadores. Dividir volume entre fornecedores pode reduzir risco, mas aumenta governança.", "Após o início, compare proposta, cobrança e desempenho real. Registre aprendizados para a próxima negociação."]]
    ],
    related: [["Comparar tabelas","como-comparar-tabelas-transportadoras.html"],["Reduzir custo sem troca","como-reduzir-custo-frete-sem-trocar-transportadora.html"],["Auditoria de fretes",freightHub]],
    faq: [["BID é apenas cotação de preço?","Não. Deve avaliar capacidade, cobertura, serviço, tecnologia, risco e implantação além do custo."],["Com que frequência fazer BID?","Não há periodicidade universal. Mudanças de demanda, mercado, serviço ou contrato devem orientar a decisão."]]
  },
  {
    file: "o-que-organizar-antes-de-implantar-wms.html",
    title: "O que Organizar Antes de Implantar um WMS | JGM4",
    description: "Checklist de processos, cadastro, endereçamento, inventário, equipamentos, integração e equipe para organizar antes da implantação de WMS.",
    h1: "O que organizar antes de implantar um WMS",
    kicker: "Prontidão para WMS",
    summary: "A implantação começa antes da configuração. Processos, dados, endereços e responsabilidades precisam estar claros para que testes e treinamento representem a operação.",
    hub: wmsHub, hubLabel: "Avaliar prontidão para WMS",
    sections: [
      ["Mapeie o fluxo real", ["Descreva recebimento, armazenagem, abastecimento, picking, conferência, expedição, devolução e inventário. Inclua exceções e controles paralelos.", "Diferencie processo desejado de rotina atual. O WMS deve sustentar um desenho consciente, não automatizar acidentes históricos."]],
      ["Limpe e complete cadastros", ["Revise SKU, descrição, unidade, conversão, código de barras, peso, dimensão, embalagem, lote e validade. Defina responsáveis pela manutenção.", "Dados incompletos comprometem regras, integrações, etiquetas e produtividade."]],
      ["Estruture endereçamento", ["Crie hierarquia de rua, módulo, nível e posição, com capacidade e restrições. Separe picking, pulmão, bloqueio, devolução e stage quando necessário.", "Faça o mapa corresponder ao espaço físico e às etiquetas."]],
      ["Valide estoque e inventário", ["Planeje saneamento, contagem e corte de movimentações. A carga inicial precisa ter critério de reconciliação e aprovação.", "Defina como diferenças serão tratadas antes, durante e depois da virada."]],
      ["Prepare pessoas e governança", ["Nomeie donos de processo, dados, integração, testes e decisão. Reserve usuários-chave e tempo para testar exceções.", "Treine processo e contingência, não apenas telas."]]
    ],
    related: [["WMS sem endereçamento","wms-sem-enderecamento-funciona.html"],["Cadastros e códigos","preparar-cadastros-codigos-barras-wms.html"],["Consultoria WMS",wmsHub]],
    faq: [["Preciso fazer inventário antes do go-live?","Normalmente é necessário validar a posição inicial, mas o método depende do projeto e da estratégia de virada."],["Posso corrigir cadastro depois?","Pode haver evolução, mas dados essenciais precisam estar confiáveis para configurar e testar."]]
  },
  {
    file: "wms-sem-enderecamento-funciona.html",
    title: "WMS sem Endereçamento Funciona? | JGM4",
    description: "Entenda por que endereçamento, capacidade, zonas, picking e pulmão são essenciais para o WMS controlar o armazém com segurança.",
    h1: "WMS sem endereçamento funciona?",
    kicker: "Localização e armazenagem",
    summary: "O sistema pode registrar saldo sem uma estrutura madura de endereços, mas perde grande parte do valor operacional quando não sabe onde, quanto e sob quais regras armazenar.",
    hub: wmsHub, hubLabel: "Preparar endereçamento para WMS",
    sections: [
      ["Saldo não é localização", ["Saber que existem cem unidades não informa em qual posição estão, se estão liberadas ou como devem ser retiradas. Endereçamento conecta saldo à execução.", "Sem essa estrutura, operadores dependem de memória e o WMS vira um registro parcial."]],
      ["Como estruturar códigos", ["Use uma hierarquia consistente e legível, como área, rua, módulo, nível e posição. Evite códigos que exigem interpretação pessoal.", "Etiquetas precisam ser visíveis, duráveis e compatíveis com leitura."]],
      ["Capacidade e restrições", ["Cadastre limite de peso, volume, tipo de estrutura, produto incompatível, lote, temperatura ou outras regras necessárias.", "O endereço lógico precisa representar a capacidade física validada."]],
      ["Picking, pulmão e abastecimento", ["Separe onde o pedido é coletado de onde fica o estoque reserva quando o processo exigir. Defina mínimo, máximo e gatilho de reposição.", "Sem regra, o picking esvazia ou o pulmão invade a área de separação."]],
      ["Implante por etapas", ["Mapeie, identifique, valide e teste uma área antes de expandir. Corrija códigos e etiquetas com os operadores.", "Depois, acompanhe ocupação, movimentações, bloqueios e divergências por endereço."]]
    ],
    related: [["O que organizar antes","o-que-organizar-antes-de-implantar-wms.html"],["Dimensionar CD","como-dimensionar-centro-de-distribuicao.html"],["Consultoria WMS",wmsHub]],
    faq: [["Todo estoque precisa de porta-paletes?","Não. Endereçamento pode representar blocado, prateleira, flow rack, piso ou outras estruturas."],["Posso usar endereço livre?","Pode ser adequado em alguns cenários, mas regras e rastreabilidade precisam ser definidas e testadas."]]
  },
  {
    file: "preparar-cadastros-codigos-barras-wms.html",
    title: "Como Preparar Cadastros e Códigos de Barras para WMS | JGM4",
    description: "Prepare SKU, unidades, embalagens, dimensões, lote, validade e códigos de barras para implantação de WMS sem ampliar divergências.",
    h1: "Como preparar cadastros e códigos de barras para o WMS",
    kicker: "Dados mestres",
    summary: "O WMS executa regras a partir dos dados. Um cadastro ambíguo transforma recebimento, picking e integração em exceção permanente.",
    hub: wmsHub, hubLabel: "Avaliar dados para implantação",
    sections: [
      ["Defina a identidade do SKU", ["Cada item precisa de código único, descrição clara, status e responsabilidade de manutenção. Duplicidades e reutilização de código prejudicam rastreabilidade.", "Decida como variações, kits e produtos semelhantes serão diferenciados."]],
      ["Unidades e conversões", ["Cadastre unidade, caixa, fardo, palete e conversões exatas quando utilizadas. Teste recebimento em uma unidade e separação em outra.", "Conversão incorreta é uma causa comum de estoque físico diferente do sistema."]],
      ["Códigos de barras", ["Relacione cada código à unidade correta e trate códigos do fornecedor, internos e logísticos. Evite múltiplos itens respondendo ao mesmo identificador.", "Valide leitura, contraste, posição e qualidade da etiqueta no ambiente real."]],
      ["Dimensão, peso e embalagem", ["Dados físicos apoiam cubagem, capacidade, armazenagem e transporte. Meça a embalagem operacional, não apenas o produto.", "Defina quem atualiza os dados quando fornecedor ou embalagem mudar."]],
      ["Lote, validade e rastreabilidade", ["Estabeleça quando a informação é obrigatória, como é capturada e quais regras FEFO, bloqueio e vencimento serão aplicadas.", "Inclua exceções nos testes de integração e operação."]]
    ],
    related: [["Estoque não bate","estoque-nao-bate.html"],["O que organizar antes","o-que-organizar-antes-de-implantar-wms.html"],["Integração WMS e ERP","integracao-wms-erp-sem-desorganizar-operacao.html"]],
    faq: [["Todo item precisa de código de barras?","Depende do processo e da rastreabilidade necessária, mas a identificação precisa ser inequívoca."],["Quem deve manter o cadastro?","A empresa deve definir governança entre áreas, com responsável, aprovação e controle de mudanças."]]
  },
  {
    file: "por-que-projetos-wms-falham-pos-go-live.html",
    title: "Por que Projetos de WMS Falham Depois do Go-live | JGM4",
    description: "Veja por que WMS falha após o go-live e como tratar dados, testes, treinamento, suporte, integração, contingência e indicadores.",
    h1: "Por que projetos de WMS falham depois do go-live",
    kicker: "Estabilização de WMS",
    summary: "A entrada em produção não encerra o projeto. Ela revela exceções, volume, comportamento e integrações que precisam de uma rotina disciplinada de estabilização.",
    hub: wmsHub, hubLabel: "Planejar implantação e estabilização",
    sections: [
      ["Testes que não representam a rotina", ["Cenários simples passam, mas falta, cancelamento, devolução, bloqueio, lote, reprocessamento e pico ficam de fora. O problema aparece com o cliente esperando.", "Use volume e exceções reais, com critérios de aprovação claros."]],
      ["Dados iniciais inconsistentes", ["Saldo, endereço, unidade e código incorretos geram divergência desde o primeiro dia. A equipe perde confiança e cria planilhas paralelas.", "Planeje reconciliação, corte e responsáveis pela correção."]],
      ["Treinamento focado em telas", ["Memorizar cliques não prepara o operador para decidir em uma exceção. Explique o processo, o motivo do controle e a contingência.", "Supervisores precisam dominar indicadores e priorização, não apenas transações."]],
      ["Integração sem monitoramento", ["Mensagens podem falhar, duplicar ou chegar fora de ordem. Sem fila, alerta e responsabilidade, WMS e ERP divergem.", "Defina monitoramento e reprocessamento antes do go-live."]],
      ["Ausência de sala de controle", ["Nos primeiros dias, incidentes precisam de classificação por impacto, dono, prazo e causa. Corrigir tudo ao mesmo tempo aumenta risco.", "Acompanhe backlog, acuracidade, produtividade, erro e pedidos afetados até a operação estabilizar."]]
    ],
    related: [["Integração WMS e ERP","integracao-wms-erp-sem-desorganizar-operacao.html"],["O que organizar antes","o-que-organizar-antes-de-implantar-wms.html"],["Case Art Latex","case-art-latex-wms-integrado-sankhya.html"]],
    faq: [["Quanto dura a estabilização?","Depende de volume, complexidade, qualidade dos testes e capacidade da equipe. Não há prazo universal."],["Planilhas paralelas devem ser proibidas?","Contingências podem ser necessárias, mas precisam de controle e plano de retirada para não criar duas verdades."]]
  },
  {
    file: "integracao-wms-erp-sem-desorganizar-operacao.html",
    title: "Como Integrar WMS e ERP sem Desorganizar a Operação | JGM4",
    description: "Entenda responsabilidades, dados, interfaces, testes, contingência e conciliação para integrar WMS e ERP com controle operacional.",
    h1: "Como integrar WMS e ERP sem desorganizar a operação",
    kicker: "Sistemas e processos",
    summary: "Integração não é apenas conectar APIs. A empresa precisa definir qual sistema decide, qual executa e como recuperar falhas sem duplicar movimentos.",
    hub: wmsHub, hubLabel: "Avaliar integração WMS e ERP",
    sections: [
      ["Defina o papel de cada sistema", ["O ERP normalmente mantém pedidos, fiscal e visão corporativa; o WMS controla execução do armazém. O desenho exato depende da arquitetura.", "Documente sistema mestre para produto, saldo, endereço, pedido, lote e status."]],
      ["Mapeie mensagens e gatilhos", ["Liste cadastro, recebimento, pedido, cancelamento, separação, expedição, inventário e ajuste. Para cada fluxo, defina origem, destino, momento e confirmação.", "Inclua chave única para evitar duplicidade e rastrear ponta a ponta."]],
      ["Trate falhas e reprocessamento", ["Determine o que acontece quando a interface cai, a mensagem é rejeitada ou chega fora de sequência. Alertas sem responsável não resolvem.", "O reprocessamento deve ser auditável e impedir movimento duplicado."]],
      ["Teste o processo completo", ["Valide criação no ERP, execução no WMS e retorno ao ERP, incluindo exceções. Compare saldo e status em pontos de controle.", "Use dados próximos da realidade e envolva fiscal, comercial, logística e TI quando necessário."]],
      ["Concilie depois do go-live", ["Acompanhe filas, erros, pedidos presos e diferença de saldo diariamente no início. Classifique causa em dado, regra, interface ou execução.", "A integração estabiliza quando incidentes caem e a equipe deixa de depender de correções manuais recorrentes."]]
    ],
    related: [["Case WMS e Sankhya","case-art-latex-wms-integrado-sankhya.html"],["Falhas pós-go-live","por-que-projetos-wms-falham-pos-go-live.html"],["Cadastros e códigos","preparar-cadastros-codigos-barras-wms.html"]],
    faq: [["ERP e WMS devem ter o mesmo saldo?","As visões precisam ser conciliáveis conforme o desenho, considerando estados e tempos de processamento."],["Quem monitora a integração?","A responsabilidade deve ser definida entre negócio, TI e fornecedores, com alertas e procedimento de resposta."]]
  },
  {
    file: "como-dimensionar-centro-de-distribuicao.html",
    title: "Como Dimensionar um Centro de Distribuição | Guia Técnico | JGM4",
    description: "Guia para dimensionar centro de distribuição: estoque, SKUs, posições-palete, picking, pulmão, docas, stage, equipe e crescimento.",
    h1: "Como dimensionar um centro de distribuição: estoque, picking, docas e equipe",
    kicker: "Projeto de armazém",
    summary: "Dimensionar um CD é transformar demanda, estoque, produtos e fluxo em capacidade. A área total só faz sentido depois que posições, picking, docas, circulação e apoio são estudados juntos.",
    hub: "../pages/consultoria-centro-distribuicao.html",
    hubLabel: "Solicitar projeto de dimensionamento do CD",
    sections: [
      ["Defina o objetivo e o horizonte", ["Esclareça se o projeto atende crescimento, mudança, consolidação, novo canal ou correção de gargalos. Defina horizonte e cenários, sem usar uma única média.", "Considere picos, sazonalidade, expansão regional e mudanças de portfólio."]],
      ["Reúna os dados necessários", ["Use SKUs ativos, dimensões, pesos, unidades, estoque médio e máximo, cobertura, giro, pedidos, linhas, volumes, recebimentos e expedições.", "Qualidade de dados é parte do projeto. Amostras e medições físicas ajudam a validar cadastro."]],
      ["Dimensione armazenagem", ["Converta estoque em paletes, caixas, unidades ou posições compatíveis com a estrutura. Considere crescimento e ocupação de segurança.", "Paletização, empilhamento, níveis, corredores, pilares, restrições e equipamentos transformam posições em área."]],
      ["Separe picking e pulmão", ["SKUs de alto giro podem precisar de posições acessíveis e abastecimento frequente; baixo giro pode permanecer no pulmão. Curva ABC sozinha não define espaço.", "Calcule quantidade retirada, embalagem, ergonomia, rota, reposição e método de separação."]],
      ["Dimensione recebimento, expedição e stage", ["Volumes por janela, tempo de processo, conferência, espera e simultaneidade definem necessidade de docas e stage. Média diária esconde concentração por horário.", "Separe cargas bloqueadas, devoluções, cross-docking e pedidos prontos para evitar mistura."]],
      ["Equipamentos, sistemas e equipe", ["Empilhadeiras, paleteiras, esteiras, coletores e WMS alteram produtividade e espaço. A escolha precisa seguir o processo e o perfil dos produtos.", "Dimensione mão de obra por atividade, tempo padrão, volume, turno, absenteísmo e variabilidade, validando segurança e ergonomia."]],
      ["Segurança e crescimento futuro", ["Rotas de fuga, prevenção contra incêndio, estrutura, carga de piso e normas exigem profissionais habilitados. O estudo logístico não substitui engenharia.", "Reserve alternativas de expansão e gatilhos para revisar capacidade antes que ocupação e filas comprometam o serviço."]]
    ],
    related: [["Calculadora de capacidade","../pages/calculadora-capacidade-centro-distribuicao.html"],["Consultoria para CD","../pages/consultoria-centro-distribuicao.html"],["Preparação para WMS",wmsHub]],
    faq: [["Como calcular posições-palete?","Projete o estoque máximo em paletes, acrescente crescimento e divida pela ocupação máxima desejada. Depois valide restrições e estrutura."],["A quantidade de docas depende apenas dos caminhões por dia?","Não. Janelas, tempo de atendimento, simultaneidade, tipo de carga e stage também influenciam."],["O guia substitui projeto de engenharia?","Não. Estrutura, segurança, incêndio e instalações exigem avaliação técnica habilitada."]]
  }
];

function esc(value) {
  return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

function articleJson(article) {
  const canonical = `https://www.jgm4consultoria.com.br/blog/${article.file}`;
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: article.h1,
        description: article.description,
        datePublished: updated,
        dateModified: updated,
        author: {"@type":"Person",name:"Bruno Muniz",url:"https://www.jgm4consultoria.com.br/pages/sobre.html"},
        publisher: {"@type":"Organization",name:"JGM4 Consultoria Logística",logo:{"@type":"ImageObject",url:"https://www.jgm4consultoria.com.br/assets/brand/logo-jgm4-google-ads-1200x1200.png"}},
        mainEntityOfPage: canonical,
        inLanguage: "pt-BR"
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {"@type":"ListItem",position:1,name:"Início",item:"https://www.jgm4consultoria.com.br/"},
          {"@type":"ListItem",position:2,name:"Blog",item:"https://www.jgm4consultoria.com.br/pages/blog.html"},
          {"@type":"ListItem",position:3,name:article.h1,item:canonical}
        ]
      },
      {
        "@type": "FAQPage",
        mainEntity: article.faq.map(([name,text]) => ({"@type":"Question",name,acceptedAnswer:{"@type":"Answer",text}}))
      }
    ]
  });
}

function render(article) {
  const canonical = `https://www.jgm4consultoria.com.br/blog/${article.file}`;
  const sectionHtml = article.sections.map(([heading, paragraphs, bullets], index) => `
        <h2 id="sec-${index + 1}">${esc(heading)}</h2>
        ${paragraphs.map(p => `<p>${esc(p)}</p>`).join("")}
        ${bullets ? `<ul>${bullets.map(item => `<li>${esc(item)}</li>`).join("")}</ul>` : ""}`).join("");
  const toc = article.sections.map(([heading], index) => `<a href="#sec-${index + 1}">${esc(heading)}</a>`).join("");
  const related = article.related.map(([label,url]) => `<a href="${url}">${esc(label)}</a>`).join("");
  const faq = article.faq.map(([question,answer]) => `<details><summary>${esc(question)}</summary><p>${esc(answer)}</p></details>`).join("");
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("consent","default",{analytics_storage:"denied",ad_storage:"denied",ad_user_data:"denied",ad_personalization:"denied",functionality_storage:"granted",security_storage:"granted",wait_for_update:500});</script>
  <script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({"gtm.start":new Date().getTime(),event:"gtm.js"});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!="dataLayer"?"&l="+l:"";j.async=true;j.src="https://www.googletagmanager.com/gtm.js?id="+i+dl;f.parentNode.insertBefore(j,f)})(window,document,"script","dataLayer","GTM-NQGP74WJ");</script>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(article.title)}</title><meta name="description" content="${esc(article.description)}"><meta name="robots" content="index,follow,max-image-preview:large">
  <link rel="canonical" href="${canonical}"><meta property="og:type" content="article"><meta property="og:locale" content="pt_BR"><meta property="og:title" content="${esc(article.title)}"><meta property="og:description" content="${esc(article.description)}"><meta property="og:url" content="${canonical}"><meta property="og:image" content="https://www.jgm4consultoria.com.br/assets/brand/og-jgm4-1200x630.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="JGM4 Consultoria Logística"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="https://www.jgm4consultoria.com.br/assets/brand/og-jgm4-1200x630.jpg">
  <link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png"><link rel="icon" type="image/png" sizes="96x96" href="/favicon-96x96.png"><link rel="icon" type="image/png" sizes="180x180" href="/apple-touch-icon.png"><link rel="icon" type="image/png" sizes="512x512" href="/favicon-512x512.png"><link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png"><link rel="manifest" href="/site.webmanifest"><link rel="stylesheet" href="/css/brand.css"><link rel="stylesheet" href="../css/seo-growth.css"><script src="../js/lgpd-consent.min.js" defer></script><script type="application/ld+json">${articleJson(article)}</script>
</head>
<body>
  <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-NQGP74WJ" height="0" width="0" style="display:none;visibility:hidden" title="Google Tag Manager"></iframe></noscript><a class="sg-skip" href="#conteudo">Pular para o conteúdo</a>
  <header class="sg-header"><nav class="sg-wrap sg-nav"><a href="../"><picture class="brand-logo-picture brand-logo-picture-header"><source media="(max-width: 768px)" srcset="/assets/brand/logo-jgm4-compacta-nova.png" type="image/png"><img class="sg-logo brand-logo" src="/assets/brand/logo-jgm4-horizontal-nova.png" alt="JGM4 Consultoria Logística" width="1536" height="1024" decoding="async"></picture></a><button class="sg-menu-button" type="button" aria-expanded="false">Menu</button><ul><li><a href="../pages/blog.html">Blog</a></li><li><a href="../pages/ferramentas-logisticas.html">Ferramentas</a></li><li><a href="../consultor-logistico/">Consultor logístico</a></li><li><a class="sg-nav-cta" data-track="article_nav_cta" href="${article.hub}">${esc(article.hubLabel)}</a></li></ul></nav></header>
  <main id="conteudo"><nav class="sg-wrap sg-breadcrumb" aria-label="Breadcrumb"><ol><li><a href="../">Início</a></li><li>›</li><li><a href="../pages/blog.html">Blog</a></li><li>›</li><li>${esc(article.h1)}</li></ol></nav>
    <section class="sg-hero"><div class="sg-wrap"><span class="sg-kicker">${esc(article.kicker)}</span><h1>${esc(article.h1)}</h1><p>${esc(article.summary)}</p><div class="sg-actions"><a class="sg-button" data-track="article_hero_cta" href="${article.hub}">${esc(article.hubLabel)}</a></div></div></section>
    <section class="sg-band"><div class="sg-wrap sg-article-shell"><article class="sg-article"><div class="sg-summary"><strong>Resposta direta:</strong> ${esc(article.summary)}</div>${sectionHtml}
      <div class="sg-warning"><strong>Importante:</strong> exemplos e fórmulas deste conteúdo são referências gerenciais. Contratos, margens, impostos, engenharia, segurança e características da operação devem ser validados antes de uma decisão.</div>
      <h2 id="faq">Perguntas frequentes</h2><div class="sg-faq">${faq}</div>
      <h2>Conteúdos e ferramentas relacionados</h2><div class="sg-related">${related}</div>
      <div class="sg-author"><img src="../assets/sua-foto.png" alt="Bruno Muniz" width="1152" height="1440" loading="lazy"><p><strong>Bruno Muniz</strong><br>Consultor Sênior de Logística e fundador da JGM4, com mais de 20 anos de experiência operacional.</p></div>
    </article><aside class="sg-toc"><strong>Neste artigo</strong>${toc}<a href="#faq">Perguntas frequentes</a><a class="sg-button" data-track="article_side_cta" href="${article.hub}">${esc(article.hubLabel)}</a></aside></div></section>
    <section class="sg-band alt"><div class="sg-wrap"><div class="sg-cta"><div><h2>Leve a análise para os dados da sua operação</h2><p>A JGM4 ajuda a transformar sintomas em causas, prioridades e plano de ação.</p></div><a class="sg-button" data-track="article_final_cta" href="${article.hub}">${esc(article.hubLabel)}</a></div></div></section>
  </main><footer class="sg-footer"><div class="sg-wrap sg-footer-grid"><div><strong>JGM4 Consultoria Logística</strong><br>Conteúdo técnico e atendimento em todo o Brasil</div><div><a href="../">Início</a> · <a href="../pages/blog.html">Blog</a> · <a href="../pages/politica.html">Privacidade</a></div></div></footer><script src="../js/seo-growth.js"></script>
</body></html>
`;
}

for (const article of articles) {
  fs.writeFileSync(path.join(root, "blog", article.file), render(article), "utf8");
}
console.log(`Gerados ${articles.length} artigos SEO.`);
