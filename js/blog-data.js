const blogPosts = [
  {
    title: "Inventário cíclico: como fazer e aumentar a acuracidade",
    description: "Como definir frequência, aplicar curva ABC, executar contagem cega e investigar divergências sem parar toda a operação.",
    image: "../assets/inventario-ciclico-acuracidade-estoque.webp",
    url: "/blog/inventario-ciclico.html",
    datePublished: "2026-08-31",
    category: "estoques",
    keywords: "inventário cíclico inventário rotativo contagem cíclica acuracidade de estoque curva ABC divergência de estoque"
  },
  {
    title: "Planilha de Agendamento de Docas: Modelo Gratuito",
    description: "Baixe a planilha para organizar fornecedores, horários, cargas, atrasos, no-show e indicadores de recebimento.",
    image: "../assets/doca-certa-agendamento-entregas-optimized.jpg",
    url: "/blog/planilha-agendamento-docas.html",
    datePublished: "2026-08-25",
    category: "gestao",
    keywords: "planilha de agendamento de docas Excel recebimento fornecedores caminhões controle de docas download gratuito"
  },
  {
    title: "Matriz de Transportes da América do Sul: Modais e Tendências",
    description: "Análise estratégica de rodovias, ferrovias, hidrovias, portos e multimodalidade na América do Sul até 2035.",
    image: "../assets/matriz-transportes-america-do-sul.webp",
    url: "/blog/matriz-transportes-america-do-sul.html",
    datePublished: "2026-08-16",
    category: "gestao",
    keywords: "matriz de transportes América do Sul modal rodoviário ferroviário hidroviário marítimo multimodalidade corredores logísticos"
  },
  {
    title: "Como Reduzir o Custo de Frete sem Trocar de Transportadora",
    description: "Ações práticas para reduzir frete com embalagem, cubagem, consolidação, regras comerciais e auditoria.",
    image: "../assets/engenharia-do-frete-optimized.jpg",
    url: "/blog/como-reduzir-custo-frete-sem-trocar-transportadora.html",
    datePublished: "2026-08-02",
    category: "custos",
    keywords: "reduzir custo de frete cubagem consolidação auditoria de fretes transportadora"
  },
  {
    title: "Frete Alto: Principais Causas",
    description: "Diagnóstico das causas de frete alto em tabelas, cubagem, taxas, pedidos, ocorrências e malha.",
    image: "../assets/engenharia-do-frete-optimized.jpg",
    url: "/blog/frete-alto-principais-causas.html",
    datePublished: "2026-08-02",
    category: "custos",
    keywords: "frete alto causas custo de transporte tabela de frete taxas cubagem"
  },
  {
    title: "Como Identificar Cobranças Indevidas no CT-e",
    description: "Método para conferir tabela, peso, cubagem, taxas, impostos e ocorrências cobradas no CT-e.",
    image: "../assets/engenharia-do-frete-optimized.jpg",
    url: "/blog/como-identificar-cobrancas-indevidas-cte.html",
    datePublished: "2026-08-02",
    category: "custos",
    keywords: "cobrança indevida CT-e auditoria de frete conferência de fatura transportadora"
  },
  {
    title: "Peso Cubado: Como Calcular e Reduzir o Frete",
    description: "Entenda peso taxável, fator de cubagem e como embalagem e cadastro afetam o custo do frete.",
    image: "../assets/engenharia-do-frete-optimized.jpg",
    url: "/blog/peso-cubado-como-calcular-reduzir-frete.html",
    datePublished: "2026-08-02",
    category: "custos",
    keywords: "peso cubado cálculo cubagem peso taxável reduzir frete embalagem"
  },
  {
    title: "Frete Mínimo: Quando o Pedido se Torna Deficitário",
    description: "Como frete mínimo, margem, custo operacional e região afetam pedidos de baixo valor.",
    image: "../assets/engenharia-do-frete-optimized.jpg",
    url: "/blog/frete-minimo-pedido-deficitario.html",
    datePublished: "2026-08-02",
    category: "custos",
    keywords: "frete mínimo pedido deficitário pedido mínimo margem custo logístico"
  },
  {
    title: "Como Comparar Tabelas de Transportadoras",
    description: "Compare propostas usando embarques reais, faixas, taxas, cubagem, prazo e nível de serviço.",
    image: "../assets/freteiro-optimized.jpg",
    url: "/blog/como-comparar-tabelas-transportadoras.html",
    datePublished: "2026-08-02",
    category: "custos",
    keywords: "comparar tabelas transportadoras cotação de frete tarifas nível de serviço"
  },
  {
    title: "Como Calcular o Percentual de Frete sobre a Venda",
    description: "Fórmula, segmentação e cuidados para analisar o peso do frete no faturamento e na margem.",
    image: "../assets/engenharia-do-frete-optimized.jpg",
    url: "/blog/como-calcular-percentual-frete-sobre-venda.html",
    datePublished: "2026-08-02",
    category: "custos",
    keywords: "percentual de frete sobre venda cálculo frete faturamento margem"
  },
  {
    title: "Quando Realizar um BID de Transportadoras",
    description: "Sinais, preparação de dados, critérios e governança para conduzir uma concorrência de fretes.",
    image: "../assets/freteiro-optimized.jpg",
    url: "/blog/quando-realizar-bid-transportadoras.html",
    datePublished: "2026-08-02",
    category: "custos",
    keywords: "BID transportadoras concorrência de frete cotação contratação transportadora"
  },
  {
    title: "O que Organizar Antes de Implantar um WMS",
    description: "Checklist de processos, cadastros, endereçamento, inventário, integração, testes e equipe.",
    image: "../assets/wms.jpg",
    url: "/blog/o-que-organizar-antes-de-implantar-wms.html",
    datePublished: "2026-08-02",
    category: "wms",
    keywords: "implantar WMS checklist processos cadastro endereçamento inventário integração"
  },
  {
    title: "WMS sem Endereçamento Funciona?",
    description: "Como estruturar endereços, capacidade, picking, pulmão e abastecimento antes do WMS.",
    image: "../assets/wms.jpg",
    url: "/blog/wms-sem-enderecamento-funciona.html",
    datePublished: "2026-08-02",
    category: "wms",
    keywords: "WMS endereçamento estoque picking pulmão armazenagem"
  },
  {
    title: "Como Preparar Cadastros e Códigos de Barras para WMS",
    description: "Dados essenciais de SKU, embalagem, unidade, código de barras, lote, peso e dimensão.",
    image: "../assets/wms.jpg",
    url: "/blog/preparar-cadastros-codigos-barras-wms.html",
    datePublished: "2026-08-02",
    category: "wms",
    keywords: "cadastro WMS código de barras SKU embalagem unidade lote"
  },
  {
    title: "Por que Projetos WMS Falham Após o Go-live",
    description: "Causas de instabilidade depois da virada e como organizar suporte, indicadores e correções.",
    image: "../assets/wms.jpg",
    url: "/blog/por-que-projetos-wms-falham-pos-go-live.html",
    datePublished: "2026-08-02",
    category: "wms",
    keywords: "projeto WMS falha go-live estabilização suporte indicadores"
  },
  {
    title: "Integração WMS e ERP sem Desorganizar a Operação",
    description: "Defina dados mestres, eventos, exceções, conciliação e testes para integrar os sistemas.",
    image: "../assets/wms.jpg",
    url: "/blog/integracao-wms-erp-sem-desorganizar-operacao.html",
    datePublished: "2026-08-02",
    category: "wms",
    keywords: "integração WMS ERP dados mestres testes estoque pedidos"
  },
  {
    title: "Como Dimensionar um Centro de Distribuição",
    description: "Premissas de estoque, crescimento, ocupação, picking, docas, fluxos e segurança para dimensionar um CD.",
    image: "../assets/capacentrodedistribuicao.png",
    url: "/blog/como-dimensionar-centro-de-distribuicao.html",
    datePublished: "2026-08-02",
    category: "gestao",
    keywords: "dimensionar centro de distribuição capacidade CD posições palete picking docas"
  },
  {
    title: "Quanto Custa uma Consultoria Logística?",
    description: "Entenda os fatores de preço, modelos de contratação e como comparar propostas de consultoria logística.",
    image: "../assets/quanto-custa-consultoria-logistica.jpg",
    url: "/blog/quanto-custa-consultoria-logistica.html",
    datePublished: "2026-07-28",
    category: "consultoria",
    keywords: "quanto custa uma consultoria logística preço de consultoria logística valor de diagnóstico logístico contratar consultor logístico gestão logística sob demanda"
  },
  {
    title: "Planilha de Controle de Recebimento e Gestão de Docas",
    description: "Como organizar entrada, carga e descarga em planilhas, reduzir filas no CD e saber quando migrar para um sistema.",
    image: "../assets/doca-certa-agendamento-entregas-optimized.jpg",
    url: "/blog/planilha-controle-recebimento-gestao-docas.html",
    datePublished: "2026-07-26",
    category: "gestao",
    keywords: "planilha de controle de recebimento gestão de docas sistema de logística carga e descarga recebimento de veículos controle de entrada e saída de caminhões agendamento de docas Doca Certa"
  },
  {
    title: "Absenteísmo nas Empresas: Causas e Como Reduzir",
    description: "Entenda como faltas afetam capacidade, produtividade e custos e veja como liderança, dados e gestão de conflitos ajudam a agir.",
    image: "../assets/absenteismo-nas-empresas-lideranca-gestao-pessoas.jpg",
    url: "/blog/absenteismo-nas-empresas.html",
    datePublished: "2026-07-19",
    category: "gestao",
    keywords: "absenteísmo nas empresas causas do absenteísmo como reduzir o absenteísmo liderança e absenteísmo gestão de pessoas gestão de conflitos presenteísmo turnover clima organizacional produtividade na logística indicadores de RH"
  },
  {
    title: "Gestão de Docas e Fornecedores na Reforma Tributária",
    description: "Como alinhar fornecedores, documentos, horários e capacidade de recebimento na transição do IBS e da CBS.",
    image: "../assets/gestao-docas-fornecedores-reforma-tributaria-2026.jpg",
    url: "/blog/gestao-docas-fornecedores-reforma-tributaria.html",
    datePublished: "2026-07-19",
    category: "gestao",
    keywords: "gestão de docas gestão de fornecedores reforma tributária logística IBS CBS documentos fiscais NF-e CT-e recebimento de mercadorias agendamento de fornecedores controle de docas Doca Certa"
  },
  {
    title: "Supera WMS Integrado ao Sankhya: Case Art Latex",
    description: "Conheça o Supera WMS, solução da JGM4 com rastreabilidade, picking, conferência por bipagem, expedição e indicadores.",
    image: "../assets/wms.jpg",
    url: "/blog/case-art-latex-wms-integrado-sankhya.html",
    datePublished: "2026-07-14",
    category: "wms",
    keywords: "Supera WMS implantação WMS WMS integrado ao Sankhya integração WMS ERP rastreabilidade logística picking conferência expedição gestão de armazém indicadores de produtividade logística Art Latex"
  },
  {
    title: "Agendamento de Entregas: Como Organizar o Recebimento",
    description: "Passo a passo para reduzir filas, organizar horários, controlar docas e melhorar o recebimento de mercadorias.",
    image: "../assets/doca-certa-agendamento-entregas-optimized.jpg",
    url: "/blog/agendamento-entregas-controle-docas.html",
    datePublished: "2026-07-06",
    category: "gestao",
    keywords: "agendamento de entregas sistema de agendamento de entregas software de agendamento controle de docas controle de recebimento gestão de entregas Doca Certa"
  },
  {
    title: "Logística de Distribuição do Sul e Sudeste para o Norte e Nordeste",
    description: "Malha rodoviária, transportadoras, custos, segurança, hubs e cabotagem para distribuir pelo Brasil com mais eficiência.",
    image: "../assets/linkedin-logistica-distribuicao-brasil-sem-logo-1920x1080.png",
    url: "/blog/logistica-distribuicao-sul-sudeste-norte-nordeste.html",
    datePublished: "2026-07-04",
    category: "custos",
    keywords: "logística de distribuição transporte rodoviário Norte Nordeste Sul Sudeste custos logísticos hub logístico cabotagem malha rodoviária transportadoras"
  },
  {
    title: "Como Sair do Caos na Logística em 5 Passos",
    description: "Gestão de processos e metodologia ágil para priorizar ações, estabilizar a operação e gerar resultados práticos.",
    image: "../assets/gestao-agil-caos-logistica.png",
    url: "/blog/como-sair-do-caos-gestao-processos-metodologia-agil.html",
    datePublished: "2026-07-04",
    category: "gestao",
    keywords: "como sair do caos operacional gestão de processos logísticos metodologia ágil na logística Kanban logística eficiência operacional indicadores logísticos produtividade logística"
  },
  {
    title: "Gestão de Pessoas e Processos na Logística",
    description: "Veja como grandes empresas melhoram logística focando em pessoas, processos, liderança, rotina e indicadores.",
    image: "../assets/gestao-pessoas-optimized.jpg",
    url: "/blog/gestao-pessoas-processos-logistica.html",
    datePublished: "2026-06-16",
    category: "gestao",
    keywords: "gestão de pessoas na logística gestão de processos logísticos liderança logística logística para grandes empresas processos logísticos produtividade logística indicadores logísticos melhoria contínua logística gestão de equipes logísticas"
  },
  {
    title: "Como Padronizar Processos Logísticos",
    description: "Aprenda a padronizar processos logísticos com POPs, checklists, treinamento, indicadores e melhoria contínua.",
    image: "../assets/eficiencia.png",
    url: "/blog/padronizacao-processos-logisticos.html",
    datePublished: "2026-06-20",
    category: "gestao",
    keywords: "padronização de processos logísticos processos logísticos POP logística checklist logístico melhoria contínua logística gestão de processos"
  },
  {
    title: "Gestão de Equipes Logísticas",
    description: "Veja como liderar equipes logísticas com rotina, indicadores, treinamento, feedback, metas e produtividade.",
    image: "../assets/ebook-lider.png",
    url: "/blog/gestao-equipes-logisticas.html",
    datePublished: "2026-06-20",
    category: "gestao",
    keywords: "gestão de equipes logísticas liderança logística gestão de pessoas na logística indicadores logísticos produtividade logística líder de logística"
  },
  {
    title: "O que é Estoque? Tipos, Controle e Diferença para Almoxarifado",
    description: "Entenda o que é estoque, conheça os principais tipos, veja como controlar materiais e saiba a diferença entre estoque e almoxarifado.",
    image: "../assets/gestao-e-controle-de-estoque.jpg",
    url: "/blog/o-que-e-estoque-tipos-controle-almoxarifado.html",
    datePublished: "2026-06-07",
    category: "estoques",
    keywords: "o que é estoque tipos de estoque controle de estoque almoxarifado inventário acuracidade estoque mínimo estoque de segurança"
  },
  {
    title: "Pedido Mínimo: Frete, Margem e Logística",
    description: "Aprenda a definir pedido mínimo considerando frete, margem, região, operação e nível de serviço sem destruir o lucro.",
    image: "../assets/imagem_blog_loginteligente.png",
    url: "/blog/pedido-minimo-inteligente-logistica-frete-margem.html",
    datePublished: "2026-06-06",
    category: "custos",
    keywords: "pedido mínimo logística frete margem custo logístico política comercial nível de serviço"
  },
  {
    title: "Currículo para Logística: Guia com LinkedIn",
    description: "Veja como montar currículo e LinkedIn para logística com palavras-chave, exemplos e estrutura profissional.",
    image: "../assets/consultorialinkedin.jpg",
    url: "/blog/curriculo-logistica.html",
    datePublished: "2026-05-17",
    category: "carreira",
    keywords: "currículo logística linkedin logística carreira em logística analista de logística vagas logística"
  },
  {
    title: "Carreira em Logística: Analista, Líder e Gestor",
    description: "Entenda competências, tendências e caminhos para crescer como analista, líder ou gestor de logística.",
    image: "../assets/ebook-lider.png",
    url: "/blog/lideres-analistas-logistica-carreira.html",
    datePublished: "2026-05-11",
    category: "carreira",
    keywords: "carreira em logística analista de logística líder de logística gestor de logística competências logística"
  },
  {
    title: "O que é Logística? Carreira, Salário e Cursos",
    description: "Entenda o que é logística, o que faz o profissional, áreas de atuação, salários e como começar na carreira.",
    image: "../assets/logistica-inicantes-optimized.jpg",
    url: "/blog/o-que-e-logistica-carreira.html",
    datePublished: "2026-05-11",
    category: "carreira",
    keywords: "o que é logística carreira em logística salário logística curso de logística profissional de logística"
  },
  {
    title: "Estoque Não Bate? Causas e Como Resolver",
    description: "Veja por que o estoque diverge do sistema e como corrigir falhas com inventário, acuracidade e controle.",
    image: "../assets/gestao-e-controle-de-estoque.jpg",
    url: "/blog/estoque-nao-bate.html",
    datePublished: "2026-05-02",
    category: "estoques",
    keywords: "estoque não bate divergência de estoque acuracidade inventário controle de estoque gestão de estoque"
  },
  {
    title: "Gestão de Conflitos: Como Resolver na Empresa",
    image: "../assets/gestao-de-conflitos.png",
    description: "Aprenda técnicas para reduzir desgastes, melhorar comunicação e fortalecer equipes com gestão de conflitos.",
    url: "/blog/gestao-de-conflitos.html",
    datePublished: "2026-03-19",
    category: "gestao",
    keywords: "gestão de conflitos liderança logística equipe comunicação produtividade operacional"
  },
  {
    title: "Custos Logísticos: Como Reduzir Gargalos",
    image: "../assets/custos.png",
    description: "Entenda frete, armazenagem, estoque e tecnologia na formação dos custos logísticos e veja como reduzi-los.",
    url: "/blog/custos-logisticos.html",
    datePublished: "2026-01-20",
    category: "custos",
    keywords: "custos logísticos redução de custos frete armazenagem estoque tecnologia logística consultoria logística"
  },
  {
    title: "Eficiência Logística: Como Reduzir Custos",
    description: "Veja como aumentar eficiência logística com estoque, roteirização, processos, WMS, TMS e indicadores.",
    image: "../assets/eficiencia.png",
    url: "/blog/eficiencia-logistica.html",
    datePublished: "2026-01-18",
    category: "custos",
    keywords: "eficiência logística produtividade operacional redução de custos WMS TMS KPIs roteirização processos"
  },
  {
    title: "WMS: O que é, Como Funciona e Quando Implantar",
    image: "../assets/wms.jpg",
    description: "Entenda o que é WMS, diferença para ERP, sinais de necessidade e como implantar na operação.",
    url: "/blog/wms-importancia.html",
    datePublished: "2026-01-17",
    category: "wms",
    keywords: "WMS sistema de gestão de armazém implantação WMS ERP estoque picking armazenagem"
  },
  {
    title: "Consultoria Logística para Empresas",
    image: "../assets/consultoria.png",
    description: "Saiba quando contratar consultoria logística, como funciona o diagnóstico e quais ganhos esperar.",
    url: "/blog/consultoria.html",
    datePublished: "2026-01-15",
    category: "consultoria",
    keywords: "consultoria logística consultoria logística para empresas diagnóstico logístico melhoria operacional redução de custos"
  },
  {
    title: "5 Sinais de Perda de Dinheiro na Logística",
    image: "../assets/perdas-invisiveis.png",
    description: "Veja sinais ocultos de perda: retrabalho, estoque parado, frete mal calculado, falta de KPIs e baixa eficiência.",
    url: "/blog/sinais_invisiveis.html",
    datePublished: "2026-01-17",
    category: "custos",
    keywords: "perda de dinheiro logística retrabalho estoque parado frete mal calculado KPIs eficiência logística"
  },
  {
    title: "Gestão de Estoque: Indicadores e Fluxo de Caixa",
    image: "../assets/estoques.jpg",
    description: "Aprenda como giro, cobertura, estoque mínimo e acuracidade impactam caixa e decisões da empresa.",
    url: "/blog/gestao_estoques.html",
    datePublished: "2026-01-17",
    category: "estoques",
    keywords: "gestão de estoque fluxo de caixa giro de estoque cobertura estoque mínimo acuracidade"
  },
  {
    title: "Como Controlar Estoque com Planilha Simples",
    image: "../assets/estoque-planilha.png",
    description: "Aprenda a controlar entradas, saídas, saldo, estoque mínimo e indicadores usando uma planilha simples.",
    url: "/blog/como_controlar_estoques.html",
    datePublished: "2026-01-17",
    category: "estoques",
    keywords: "como controlar estoque planilha de estoque controle de entradas e saídas estoque mínimo indicadores"
  },
  {
    title: "Logistics Consulting in Brazil",
    description: "Logistics consulting for foreign companies in Brazil: operational diagnosis, inventory, warehousing, transportation, WMS and cost reduction.",
    image: "../assets/consultoria.png",
    url: "/blog/logistics-consulting-brazil.html",
    datePublished: "2026-07-04",
    category: "consultoria",
    keywords: "logistics consulting Brazil operational diagnosis inventory warehousing transportation WMS cost reduction"
  },
  {
    title: "Consultoría Logística en Brasil",
    description: "Consultoría logística para empresas extranjeras en Brasil: diagnóstico, inventarios, almacenes, transporte, WMS y reducción de costos.",
    image: "../assets/consultoria.png",
    url: "/blog/consultoria-logistica-brasil-es.html",
    datePublished: "2026-07-04",
    category: "consultoria",
    keywords: "consultoría logística Brasil diagnóstico inventarios almacenes transporte WMS reducción de costos"
  },
  {
    title: "WMS Implementation in Brazil",
    description: "How to select and implement a WMS in Brazil with process readiness, local requirements, testing and operational stabilization.",
    image: "../assets/wms.jpg",
    url: "/blog/wms-implementation-brazil.html",
    datePublished: "2026-07-04",
    category: "wms",
    keywords: "WMS implementation Brazil warehouse management system process readiness testing stabilization"
  },
  {
    title: "Implementación de WMS en Brasil",
    description: "Cómo seleccionar e implementar un WMS en Brasil con procesos preparados, requisitos locales, pruebas y estabilización operativa.",
    image: "../assets/wms.jpg",
    url: "/blog/implementacion-wms-brasil.html",
    datePublished: "2026-07-04",
    category: "wms",
    keywords: "implementación WMS Brasil sistema gestión almacenes procesos pruebas estabilización"
  },
  {
    title: "Logistics Costs in Brazil",
    description: "Understand freight, warehousing, inventory, taxes and service drivers behind logistics costs in Brazil and how to reduce them.",
    image: "../assets/custos.png",
    url: "/blog/logistics-costs-brazil.html",
    datePublished: "2026-07-04",
    category: "custos",
    keywords: "logistics costs Brazil freight warehousing inventory taxes cost reduction"
  },
  {
    title: "Costos Logísticos en Brasil",
    description: "Comprenda transporte, inventario, almacenamiento, riesgo y servicio en los costos logísticos de Brasil y cómo reducirlos.",
    image: "../assets/custos.png",
    url: "/blog/costos-logisticos-brasil.html",
    datePublished: "2026-07-04",
    category: "custos",
    keywords: "costos logísticos Brasil transporte inventario almacenamiento reducción de costos"
  },
  {
    title: "Logistics Distribution Across Brazil",
    description: "Road infrastructure, carriers, costs, security, regional hubs and coastal shipping for distribution across Brazil.",
    image: "../assets/linkedin-logistica-distribuicao-brasil-sem-logo-1920x1080.png",
    url: "/blog/logistics-distribution-south-southeast-north-northeast-brazil.html",
    datePublished: "2026-07-04",
    category: "custos",
    keywords: "logistics distribution Brazil carriers freight costs regional hubs coastal shipping"
  },
  {
    title: "Distribución Logística en Brasil",
    description: "Carreteras, transportistas, costos, seguridad, hubs regionales y cabotaje para la distribución en Brasil.",
    image: "../assets/linkedin-logistica-distribuicao-brasil-sem-logo-1920x1080.png",
    url: "/blog/logistica-distribucion-sur-sudeste-norte-nordeste-brasil.html",
    datePublished: "2026-07-04",
    category: "custos",
    keywords: "distribución logística Brasil transportistas costos hubs regionales cabotaje"
  },
];
