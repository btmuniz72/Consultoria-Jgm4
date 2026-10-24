import json
from pydantic import BaseModel, Field, ValidationError
from app.schemas.ai_analysis import OpportunityAnalysis

class ManualQuestion(BaseModel):
    category: str = ''; question: str; answer_type: str = 'texto'; required: bool = False; internal_reason: str = ''; order: int = 1
class ManualData(BaseModel):
    name: str; description: str = ''; required: bool = True; recommended_period: str = ''; preferred_format: str = ''; suggested_source: str = ''; suggested_fields: list[str] = []
class ManualPayload(BaseModel):
    primary_theme: str; secondary_themes: list[str] = []; recommended_diagnostic: str; executive_summary: str; central_problem: str = ''
    reported_facts: list = []; reported_impacts: list = []; identified_problems: list = []; hypotheses: list = []; information_gaps: list = []
    complementary_questions: list[ManualQuestion] = []; required_data: list[ManualData] = []; suggested_documents: list[str] = []
    suggested_delivery_mode: str = 'A_DEFINIR'; delivery_mode_reason: str = ''; diagnostic_pricing_readiness: str = 'NOT_READY'; implementation_pricing_readiness: str = 'NOT_READY'; pricing_blockers: list[str] = []

def clean_json_text(raw: str) -> str:
    text=raw.lstrip('\ufeff').strip()
    if text.startswith('```'):
        lines=text.splitlines(); text='\n'.join(line for line in lines if not line.strip().startswith('```')).strip()
    start=text.find('{'); end=text.rfind('}')
    return text[start:end+1] if start >= 0 and end > start else text

def decode_uploaded_text(raw: bytes) -> str:
    for encoding in ('utf-8-sig','utf-8','utf-16','cp1252','latin-1'):
        try: return clean_json_text(raw.decode(encoding))
        except UnicodeDecodeError: continue
    raise UnicodeError('Não foi possível decodificar o arquivo')

def build_prompt(analysis, result):
    schema='''{"primary_theme":"","secondary_themes":[],"recommended_diagnostic":"","executive_summary":"","central_problem":"","reported_facts":[],"reported_impacts":[],"identified_problems":[],"hypotheses":[],"information_gaps":[],"complementary_questions":[{"category":"","question":"","answer_type":"texto","required":true,"internal_reason":"","order":1}],"required_data":[{"name":"","description":"","required":true,"recommended_period":"","preferred_format":"XLSX ou CSV","suggested_source":"","suggested_fields":[]}],"suggested_documents":[],"suggested_delivery_mode":"A_DEFINIR","delivery_mode_reason":"","diagnostic_pricing_readiness":"NOT_READY","implementation_pricing_readiness":"NOT_READY","pricing_blockers":[]}'''
    return f'''Atue como consultor logístico sênior de apoio à JGM4 Consultoria. Aprofunde o direcionamento sem inventar informações, separando fatos de hipóteses. Não precifique projetos nem prometa economia. Gere perguntas específicas e dados necessários. Responda somente JSON válido.

Responda criando um único arquivo UTF-8 chamado resposta_chatgpt.json. O conteúdo deve ser somente JSON válido, sem comentários e sem blocos Markdown. Esse arquivo será importado diretamente no sistema JGM4.

Formato obrigatório resumido:
{schema}

EMPRESA: {analysis.company}
TEMA: {analysis.theme or result.get("primary_theme", "")}
RESPOSTAS ORIGINAIS:
{analysis.answers}

COMENTÁRIOS DO CONSULTOR:
{analysis.consultant_notes}

ANÁLISE PRELIMINAR JGM4:
{json.dumps(result, ensure_ascii=False, indent=2)}'''

def parse_response(raw: str) -> OpportunityAnalysis:
    payload=ManualPayload.model_validate_json(clean_json_text(raw))
    def finding_list(items, source='CLIENT_REPORT'):
        allowed={'CLIENT_REPORT','CONSULTANT_NOTE','DOCUMENT','DATA','INFERENCE'}
        normalized=[]
        for item in items:
            if not isinstance(item, dict): item={'text':str(item)}
            text=item.get('text') or item.get('description') or item.get('finding') or item.get('problem') or item.get('hypothesis') or str(item)
            confidence=str(item.get('confidence','MEDIUM')).upper(); confidence=confidence if confidence in {'LOW','MEDIUM','HIGH'} else 'MEDIUM'
            source_type=str(item.get('source_type',source)).upper(); source_type=source_type if source_type in allowed else ('INFERENCE' if source == 'INFERENCE' else source)
            normalized.append({'text':text,'confidence':confidence,'source_type':source_type})
        return normalized
    data=payload.model_dump(); data['reported_facts']=finding_list(payload.reported_facts); data['reported_impacts']=finding_list(payload.reported_impacts); data['identified_problems']=finding_list(payload.identified_problems); data['hypotheses']=finding_list(payload.hypotheses, 'INFERENCE'); data['information_gaps']=finding_list(payload.information_gaps)
    data['complementary_questions']=[{'id':f'manual-{q.order}', 'categoria':q.category, 'pergunta':q.question, 'tipo_resposta':q.answer_type, 'obrigatoria':q.required, 'motivo_interno':q.internal_reason, 'ordem':q.order} for q in payload.complementary_questions]
    data['required_data']=[{'nome':d.name, 'descricao':d.description, 'campos_sugeridos':d.suggested_fields, 'obrigatorio':d.required, 'periodo_recomendado':d.recommended_period, 'formato_preferencial':d.preferred_format, 'origem_sugerida':d.suggested_source, 'motivo_interno':''} for d in payload.required_data]
    data['pricing_readiness']=payload.diagnostic_pricing_readiness
    return OpportunityAnalysis.model_validate(data)
