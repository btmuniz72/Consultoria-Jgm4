from datetime import datetime
from pathlib import Path
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

class Base(DeclarativeBase): pass

class Consultant(Base):
    __tablename__ = 'consultants'
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160)); cpf: Mapped[str | None] = mapped_column(String(30))
    email: Mapped[str] = mapped_column(String(160)); phone: Mapped[str | None] = mapped_column(String(40))
    professional_title: Mapped[str | None] = mapped_column(String(160)); specialties: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text); active: Mapped[bool] = mapped_column(Boolean, default=True)
    home_rate: Mapped[float] = mapped_column(Float, default=120); external_rate: Mapped[float] = mapped_column(Float, default=220)
    home_cost: Mapped[float] = mapped_column(Float, default=0); external_cost: Mapped[float] = mapped_column(Float, default=0)
    notifications: Mapped[dict] = mapped_column(JSON, default=dict)

class Parameter(Base):
    __tablename__ = 'parameters'
    key: Mapped[str] = mapped_column(String(80), primary_key=True); value: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow); updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Analysis(Base):
    __tablename__ = 'analyses'
    id: Mapped[int] = mapped_column(primary_key=True); company: Mapped[str] = mapped_column(String(160)); contact: Mapped[str | None] = mapped_column(String(160))
    email: Mapped[str | None] = mapped_column(String(160)); theme: Mapped[str | None] = mapped_column(String(240)); segment: Mapped[str | None] = mapped_column(String(160))
    answers: Mapped[str] = mapped_column(Text); consultant_notes: Mapped[str] = mapped_column(Text, default=''); internal_notes: Mapped[str] = mapped_column(Text, default='')
    include_internal: Mapped[bool] = mapped_column(Boolean, default=False); status: Mapped[str] = mapped_column(String(40), default='NEW')
    result: Mapped[dict | None] = mapped_column(JSON); created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow); updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class ImportedFile(Base):
    __tablename__ = 'imported_files'
    id: Mapped[int] = mapped_column(primary_key=True); analysis_id: Mapped[int] = mapped_column(ForeignKey('analyses.id')); original_name: Mapped[str] = mapped_column(String(255)); stored_path: Mapped[str] = mapped_column(String(500)); preview: Mapped[dict | None] = mapped_column(JSON)

class AnalysisVersion(Base):
    __tablename__ = 'analysis_versions'
    id: Mapped[int] = mapped_column(primary_key=True); analysis_id: Mapped[int] = mapped_column(ForeignKey('analyses.id')); version_number: Mapped[int] = mapped_column(Integer); provider: Mapped[str] = mapped_column(String(40)); model: Mapped[str | None] = mapped_column(String(120)); created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow); raw_input_hash: Mapped[str] = mapped_column(String(64)); structured_result: Mapped[dict] = mapped_column(JSON)

class AnalysisRunLog(Base):
    __tablename__ = 'analysis_run_logs'
    id: Mapped[int] = mapped_column(primary_key=True); analysis_id: Mapped[int] = mapped_column(ForeignKey('analyses.id')); success: Mapped[bool] = mapped_column(Boolean); provider: Mapped[str] = mapped_column(String(40)); model: Mapped[str | None] = mapped_column(String(120)); elapsed_ms: Mapped[int] = mapped_column(Integer, default=0); total_tokens: Mapped[int | None] = mapped_column(Integer); error_summary: Mapped[str | None] = mapped_column(String(500)); created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class AIDiagnosticLog(Base):
    __tablename__ = 'ai_diagnostic_logs'
    id: Mapped[int] = mapped_column(primary_key=True); test_name: Mapped[str] = mapped_column(String(40)); success: Mapped[bool] = mapped_column(Boolean); error_type: Mapped[str | None] = mapped_column(String(120)); http_status: Mapped[int | None] = mapped_column(Integer); error_code: Mapped[str | None] = mapped_column(String(120)); message: Mapped[str | None] = mapped_column(String(500)); model: Mapped[str | None] = mapped_column(String(120)); endpoint: Mapped[str] = mapped_column(String(120), default='/v1/responses'); elapsed_ms: Mapped[int] = mapped_column(Integer, default=0); total_tokens: Mapped[int | None] = mapped_column(Integer); created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class ManualChatGPTExchange(Base):
    __tablename__ = 'manual_chatgpt_exchanges'
    id: Mapped[int] = mapped_column(primary_key=True); analysis_id: Mapped[int] = mapped_column(ForeignKey('analyses.id')); prompt_text: Mapped[str] = mapped_column(Text); response_text: Mapped[str | None] = mapped_column(Text); status: Mapped[str] = mapped_column(String(40), default='PROMPT_GERADO'); created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class DiagnosticStage(Base):
    __tablename__ = 'diagnostic_stages'
    id: Mapped[int] = mapped_column(primary_key=True); analysis_id: Mapped[int] = mapped_column(ForeignKey('analyses.id')); name: Mapped[str] = mapped_column(String(160)); description: Mapped[str] = mapped_column(Text, default=''); questions: Mapped[dict] = mapped_column(JSON, default=dict); status: Mapped[str] = mapped_column(String(40), default='PREPARED'); created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class PricingStage(Base):
    __tablename__ = 'pricing_stages'
    id: Mapped[int] = mapped_column(primary_key=True); analysis_id: Mapped[int] = mapped_column(ForeignKey('analyses.id')); order: Mapped[int] = mapped_column(Integer); name: Mapped[str] = mapped_column(String(160)); description: Mapped[str] = mapped_column(Text, default=''); activities: Mapped[str] = mapped_column(Text, default=''); deliverables: Mapped[str] = mapped_column(Text, default=''); home_hours: Mapped[float] = mapped_column(Float, default=0); external_hours: Mapped[float] = mapped_column(Float, default=0); home_rate: Mapped[float] = mapped_column(Float, default=120); external_rate: Mapped[float] = mapped_column(Float, default=220); expenses: Mapped[float] = mapped_column(Float, default=0); discount_value: Mapped[float] = mapped_column(Float, default=0); manual_adjustment: Mapped[float] = mapped_column(Float, default=0); final_price: Mapped[float] = mapped_column(Float, default=0); optional: Mapped[bool] = mapped_column(Boolean, default=False); client_selectable: Mapped[bool] = mapped_column(Boolean, default=False); selected: Mapped[bool] = mapped_column(Boolean, default=True); updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class ExecutionPlan(Base):
    __tablename__ = 'execution_plans'
    id: Mapped[int] = mapped_column(primary_key=True); analysis_id: Mapped[int] = mapped_column(ForeignKey('analyses.id')); status: Mapped[str] = mapped_column(String(40), default='DRAFT'); content: Mapped[dict] = mapped_column(JSON, default=dict); created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow); updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class ContractDraft(Base):
    __tablename__ = 'contract_drafts'
    id: Mapped[int] = mapped_column(primary_key=True); analysis_id: Mapped[int] = mapped_column(ForeignKey('analyses.id')); version_number: Mapped[int] = mapped_column(Integer, default=1); status: Mapped[str] = mapped_column(String(40), default='DRAFT'); content: Mapped[dict] = mapped_column(JSON, default=dict); pdf_path: Mapped[str | None] = mapped_column(String(500)); created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class ProjectStage(Base):
    __tablename__ = 'project_stages'
    id: Mapped[int] = mapped_column(primary_key=True); analysis_id: Mapped[int] = mapped_column(ForeignKey('analyses.id')); name: Mapped[str] = mapped_column(String(160)); description: Mapped[str] = mapped_column(Text, default=''); order: Mapped[int] = mapped_column(Integer, default=1); status: Mapped[str] = mapped_column(String(40), default='DRAFT')
    estimated_home_hours: Mapped[float] = mapped_column(Float, default=0); estimated_external_hours: Mapped[float] = mapped_column(Float, default=0); home_hour_rate: Mapped[float] = mapped_column(Float, default=120); external_hour_rate: Mapped[float] = mapped_column(Float, default=220); subtotal: Mapped[float] = mapped_column(Float, default=0); final_price: Mapped[float] = mapped_column(Float, default=0); optional: Mapped[bool] = mapped_column(Boolean, default=False); client_selectable: Mapped[bool] = mapped_column(Boolean, default=False)

class ProjectTeamMember(Base):
    __tablename__ = 'project_team_members'
    id: Mapped[int] = mapped_column(primary_key=True); consultant_id: Mapped[int] = mapped_column(ForeignKey('consultants.id')); analysis_id: Mapped[int] = mapped_column(ForeignKey('analyses.id')); project_stage_id: Mapped[int | None] = mapped_column(ForeignKey('project_stages.id'))
    project_role: Mapped[str] = mapped_column(String(120)); home_hours: Mapped[float] = mapped_column(Float, default=0); external_hours: Mapped[float] = mapped_column(Float, default=0); home_rate_override: Mapped[float | None] = mapped_column(Float); external_rate_override: Mapped[float | None] = mapped_column(Float); notes: Mapped[str] = mapped_column(Text, default='')

class AuditLog(Base):
    __tablename__ = 'audit_logs'
    id: Mapped[int] = mapped_column(primary_key=True); entity_type: Mapped[str] = mapped_column(String(80)); entity_id: Mapped[int] = mapped_column(Integer); action: Mapped[str] = mapped_column(String(80)); field_name: Mapped[str | None] = mapped_column(String(80)); old_value: Mapped[str | None] = mapped_column(Text); new_value: Mapped[str | None] = mapped_column(Text); reason: Mapped[str | None] = mapped_column(Text); created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

def make_engine(base_dir: Path):
    data = base_dir / 'data'; data.mkdir(exist_ok=True); (data / 'uploads').mkdir(exist_ok=True)
    return create_engine(f'sqlite:///{data / "jgm4_diagnostico.db"}', future=True)

def make_session(base_dir: Path): return sessionmaker(bind=make_engine(base_dir), expire_on_commit=False)
