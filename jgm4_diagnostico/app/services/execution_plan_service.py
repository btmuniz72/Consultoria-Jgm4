def build_execution_plan(analysis, result, stages):
    freight='frete' in (result.get('primary_theme','')+' '+result.get('central_problem','')).lower() or 'transport' in (result.get('primary_theme','')).lower()
    documents=result.get('suggested_documents',[]) or []
    if freight: documents += ['Histórico de embarques de 6 a 12 meses','Tabelas e contratos de frete','Faturas de transportadoras','Relatório de devoluções e reentregas','Indicadores de prazo e ocorrências']
    blocked_terms=('lgpd','privacidade','dados pessoais','consentimento','política de privacidade','compliance de dados')
    documents=list(dict.fromkeys(d for d in documents if not any(term in d.lower() for term in blocked_terms)))
    plan=[]
    for stage in stages:
        if stage.order == 1: interviews=[{'number':1,'title':'Entendimento executivo','participants':'Direção, logística e financeiro','topics':['objetivo do projeto','impactos percebidos','restrições e urgência']},{'number':2,'title':'Entendimento operacional','participants':'Gestor de transportes/CD e equipe-chave','topics':['fluxo operacional','pedidos e embarques','sistemas e controles']}]
        elif stage.order == 2: interviews=[{'number':3,'title':'Validação técnica','participants':'Responsáveis por transporte, faturamento e dados','topics':['custos e tarifas','transportadoras','geografia','peso, cubagem e volumes','SLA e ocorrências']}]
        elif stage.order == 3: interviews=[{'number':4,'title':'Devolutiva e priorização','participants':'Patrocinador e gestores envolvidos','topics':['achados','hipóteses confirmadas','riscos','plano de ação e indicadores']}]
        else: interviews=[{'number':5,'title':'Visita técnica presencial','participants':'Equipe operacional local','topics':['observação em campo','layout e fluxo','reprocessos','evidências documentais']}]
        plan.append({'order':stage.order,'name':stage.name,'scope':stage.description,'activities':stage.activities,'deliverables':stage.deliverables,'home_hours':stage.home_hours,'external_hours':stage.external_hours,'interviews':interviews,'topics':sorted(set(sum((x['topics'] for x in interviews),[]))), 'required_documents':documents})
    return {'company':analysis.company,'objective':result.get('recommended_diagnostic','Diagnóstico logístico'),'phases':plan,'data_to_collect':result.get('required_data',[]),'questions':result.get('complementary_questions',[]),'documents':documents}
