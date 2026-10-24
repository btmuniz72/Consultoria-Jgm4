from app.models.database import Parameter, PricingStage

DEFAULT_STAGES=[('Etapa 1 — Levantamento e Entendimento','Entender operação, escopo e indicadores.','Entrevistas; análise preliminar; definição do plano.','Escopo validado e plano de coleta.',8,4,False),('Etapa 2 — Levantamento Complementar e Análise Técnica','Aplicar as perguntas aprovadas, receber dados e documentos, testar hipóteses e analisar causas.','Entrevistas complementares; coleta de documentos; tratamento de dados; cruzamentos; validação.','Base de dados organizada, hipóteses testadas e achados técnicos.',12,4,False),('Etapa 3 — Diagnóstico Final e Plano de Ação','Consolidar diagnóstico e recomendações.','Workshop; priorização; plano de ação.','Diagnóstico final e plano de ação.',8,2,False),('Etapa 4 — Presencial Opcional','Visita técnica opcional.','Observação em campo e entrevistas presenciais.','Relatório de visita.',0,16,True)]

def ensure_pricing_stages(session, analysis_id):
    existing=session.query(PricingStage).filter(PricingStage.analysis_id == analysis_id).order_by(PricingStage.order).all()
    if existing:
        for stage in existing:
            if stage.order == 2 and stage.name == 'Etapa 2 — Análise Técnica':
                stage.name='Etapa 2 — Levantamento Complementar e Análise Técnica'; stage.description='Aplicar as perguntas aprovadas, receber dados e documentos, testar hipóteses e analisar causas.'; stage.activities='Entrevistas complementares; coleta de documentos; tratamento de dados; cruzamentos; validação.'; stage.deliverables='Base de dados organizada, hipóteses testadas e achados técnicos.'
        return existing
    params={p.key:float(p.value) for p in session.query(Parameter).all() if p.key != 'currency'}; home=params.get('home_rate',120); external=params.get('external_rate',220); stages=[]
    for order,(name,description,activities,deliverables,hh,eh,optional) in enumerate(DEFAULT_STAGES,1):
        stage=PricingStage(analysis_id=analysis_id,order=order,name=name,description=description,activities=activities,deliverables=deliverables,home_hours=hh,external_hours=eh,home_rate=home,external_rate=external,optional=optional,client_selectable=optional,selected=not optional); session.add(stage); stages.append(stage)
    session.flush(); return stages

def calculate_stage(stage):
    subtotal=stage.home_hours*stage.home_rate + stage.external_hours*stage.external_rate + stage.expenses
    stage.final_price=max(0,subtotal-stage.discount_value+stage.manual_adjustment); return subtotal, stage.final_price
