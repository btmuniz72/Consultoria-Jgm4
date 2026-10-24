import hashlib
import os
import time
from dataclasses import dataclass
from pydantic import BaseModel
from pathlib import Path
from app.services.rule_engine import analyze as rule_analyze
from app.schemas.ai_analysis import OpportunityAnalysis

BASE_DIR = Path(__file__).resolve().parents[2]
ENDPOINT = '/v1/responses'

@dataclass
class AIDiagnostic:
    success: bool; error_type: str | None = None; http_status: int | None = None; error_code: str | None = None; message: str | None = None; model: str = ''; endpoint: str = ENDPOINT; elapsed_ms: int = 0; total_tokens: int | None = None

class SmokeOutput(BaseModel):
    status: str
    message: str

def safe_error(exc, model, elapsed_ms=0):
    body=getattr(exc, 'body', None); payload=body.get('error', body) if isinstance(body, dict) else {}
    message=str(payload.get('message') or str(exc)).replace(os.getenv('OPENAI_API_KEY',''), '[REDACTED]')[:500]
    return AIDiagnostic(False, type(exc).__name__, getattr(exc, 'status_code', None), getattr(exc, 'code', None) or payload.get('code'), message, model, ENDPOINT, elapsed_ms)

def save_config(values):
    env_path=BASE_DIR/'.env'; current=env_path.read_text(encoding='utf-8').splitlines() if env_path.exists() else []
    updates={k:str(v) for k,v in values.items() if k in {'OPENAI_MODEL','AI_ENABLED','ANALYSIS_MODE','AI_TEMPERATURE','AI_TIMEOUT'}}; found=set(); lines=[]
    for line in current:
        key=line.split('=',1)[0].strip() if '=' in line else ''
        if key in updates: lines.append(f'{key}={updates[key]}'); found.add(key)
        else: lines.append(line)
    lines.extend(f'{key}={value}' for key,value in updates.items() if key not in found)
    env_path.write_text('\n'.join(lines)+'\n', encoding='utf-8'); os.environ.update(updates)

def config():
    return {'enabled': os.getenv('AI_ENABLED','true').lower() in ('1','true','yes','sim'), 'mode': os.getenv('ANALYSIS_MODE','hybrid').lower(), 'model': os.getenv('OPENAI_MODEL','gpt-4o-mini'), 'temperature': float(os.getenv('AI_TEMPERATURE','0.1')), 'timeout': float(os.getenv('AI_TIMEOUT','60'))}

class AnalysisProvider:
    name = 'base'
    def analyze(self, answers, notes='', context=''): raise NotImplementedError

class RuleBasedAnalysisProvider(AnalysisProvider):
    name = 'rules'
    def analyze(self, answers, notes='', context=''): return rule_analyze(answers, notes)

class OpenAIAnalysisProvider(AnalysisProvider):
    name = 'openai'
    def __init__(self):
        from openai import OpenAI
        self.settings = config(); self.client = OpenAI(api_key=os.environ['OPENAI_API_KEY'], timeout=self.settings['timeout'])
        self.last_tokens = None
    def analyze(self, answers, notes='', context=''):
        instructions = (BASE_DIR / 'app' / 'prompts' / 'opportunity_analysis.txt').read_text(encoding='utf-8')
        user_content = f'{instructions}\n\nCONTEXTO DAS REGRAS JGM4:\n{context}\n\nRESPOSTAS DO CLIENTE:\n{answers}\n\nOBSERVAÇÕES DO CONSULTOR:\n{notes}'
        response = self.client.responses.parse(model=self.settings['model'], input=user_content, text_format=OpportunityAnalysis)
        usage = getattr(response, 'usage', None); self.last_tokens = getattr(usage, 'total_tokens', None) if usage else None
        if not response.output_parsed: raise RuntimeError('A IA não retornou uma análise estruturada')
        return response.output_parsed

def _merge(rule_result: OpportunityAnalysis, ai_result: OpportunityAnalysis) -> OpportunityAnalysis:
    data = ai_result.model_dump()
    existing = {q.pergunta for q in ai_result.complementary_questions}
    data['complementary_questions'] = [q.model_dump() for q in ai_result.complementary_questions] + [q.model_dump() for q in rule_result.complementary_questions if q.pergunta not in existing]
    data['warnings'] = list(dict.fromkeys(rule_result.warnings + ai_result.warnings))
    return OpportunityAnalysis.model_validate(data)

def run_analysis(answers, notes='', internal=''):
    rules = RuleBasedAnalysisProvider().analyze(answers, notes)
    settings = config()
    if not settings['enabled'] or not os.getenv('OPENAI_API_KEY') or settings['mode'] == 'rules': return rules, rules, 'rules', 'regras', None
    try:
        ai = OpenAIAnalysisProvider().analyze(answers, notes, rules.model_dump_json())
        return rules, _merge(rules, ai), 'hybrid', settings['model'], None
    except Exception as exc:
        fallback = rules.model_copy(update={'warnings': rules.warnings + ['A análise por IA não foi concluída. O resultado por regras foi preservado.']})
        return rules, fallback, 'rules-fallback', 'regras', str(exc)

def run_ai_suggestion(answers, notes=''):
    """Executa a IA sob demanda, sem substituir silenciosamente a versão anterior."""
    if not os.getenv('OPENAI_API_KEY'):
        raise RuntimeError('IA não configurada')
    started = time.perf_counter(); rules = RuleBasedAnalysisProvider().analyze(answers, notes)
    provider = OpenAIAnalysisProvider(); ai = provider.analyze(answers, notes, rules.model_dump_json())
    return _merge(rules, ai), config()['model'], int((time.perf_counter() - started) * 1000), provider.last_tokens

def input_hash(answers, notes): return hashlib.sha256(f'{answers}\n{notes}'.encode('utf-8')).hexdigest()

def test_connection():
    settings = config()
    if not settings['enabled'] or not os.getenv('OPENAI_API_KEY'): return False, settings['model'], 'IA não configurada'
    try:
        client = OpenAIAnalysisProvider().client
        client.responses.create(model=settings['model'], input='Responda apenas OK.', max_output_tokens=5)
        return True, settings['model'], None
    except Exception as exc: return False, settings['model'], str(exc)

def test_connection_detailed():
    settings=config(); started=time.perf_counter()
    if not settings['enabled'] or not os.getenv('OPENAI_API_KEY'):
        return AIDiagnostic(False, 'ConfigurationError', None, 'missing_api_key', 'Chave da API não configurada', settings['model'], elapsed_ms=0)
    provider=OpenAIAnalysisProvider()
    try:
        response=provider.client.responses.create(model=settings['model'], input='Responda apenas OK.', max_output_tokens=16)
        usage=getattr(response,'usage',None)
        return AIDiagnostic(True, model=settings['model'], elapsed_ms=int((time.perf_counter()-started)*1000), total_tokens=getattr(usage,'total_tokens',None) if usage else None)
    except Exception as exc: return safe_error(exc, settings['model'], int((time.perf_counter()-started)*1000))

def test_structured_output():
    settings=config(); started=time.perf_counter()
    if not settings['enabled'] or not os.getenv('OPENAI_API_KEY'):
        return AIDiagnostic(False, 'ConfigurationError', None, 'missing_api_key', 'Chave da API não configurada', settings['model'], elapsed_ms=0), None
    provider=OpenAIAnalysisProvider()
    try:
        response=provider.client.responses.parse(model=settings['model'], input='Retorne status ok e message teste.', text_format=SmokeOutput)
        usage=getattr(response,'usage',None); parsed=response.output_parsed
        if not parsed or parsed.status != 'ok': raise RuntimeError('Structured Output retornou conteúdo inesperado')
        return AIDiagnostic(True, model=settings['model'], elapsed_ms=int((time.perf_counter()-started)*1000), total_tokens=getattr(usage,'total_tokens',None) if usage else None), parsed.model_dump()
    except Exception as exc: return safe_error(exc, settings['model'], int((time.perf_counter()-started)*1000)), None
