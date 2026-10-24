from typing import Literal
from pydantic import BaseModel, Field

class Finding(BaseModel):
    text: str; confidence: Literal['LOW','MEDIUM','HIGH'] = 'MEDIUM'; source_type: Literal['CLIENT_REPORT','CONSULTANT_NOTE','DOCUMENT','DATA','INFERENCE'] = 'CLIENT_REPORT'; reason: str = ''
class ComplementaryQuestion(BaseModel):
    id: str; categoria: str; pergunta: str; tipo_resposta: str = 'texto'; obrigatoria: bool = False; motivo_interno: str = ''; ordem: int = 1
class RequiredData(BaseModel):
    nome: str; descricao: str; campos_sugeridos: list[str] = []; obrigatorio: bool = True; periodo_recomendado: str = ''; formato_preferencial: str = ''; origem_sugerida: str = ''; motivo_interno: str = ''
class OpportunityAnalysis(BaseModel):
    primary_theme: str; secondary_themes: list[str] = []; central_problem: str = ''; recommended_diagnostic: str; executive_summary: str
    reported_facts: list[Finding] = []; consultant_observations: list[Finding] = []; identified_problems: list[Finding] = []; reported_impacts: list[Finding] = []
    hypotheses: list[Finding] = []; information_gaps: list[Finding] = []; complementary_questions: list[ComplementaryQuestion] = []; required_data: list[RequiredData] = []; suggested_documents: list[str] = []
    suggested_delivery_mode: Literal['REMOTO','PRESENCIAL','HIBRIDO','A_DEFINIR'] = 'A_DEFINIR'; delivery_mode_reason: str = ''; pricing_readiness: Literal['READY','PARTIAL','NOT_READY'] = 'NOT_READY'; implementation_pricing_readiness: Literal['READY','PARTIAL','NOT_READY'] = 'NOT_READY'; pricing_blockers: list[str] = []; confidence_notes: list[str] = []; warnings: list[str] = []
