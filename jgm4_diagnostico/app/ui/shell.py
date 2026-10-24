import os
import json
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv
from nicegui import ui
from sqlalchemy import select
from app.models.database import AIDiagnosticLog, Analysis, AnalysisRunLog, AnalysisVersion, Consultant, ContractDraft, DiagnosticStage, ExecutionPlan, ImportedFile, ManualChatGPTExchange, Parameter, PricingStage, make_session
from app.services.analysis_service import config as ai_config, input_hash, run_analysis, run_ai_suggestion, save_config, test_connection_detailed, test_structured_output
from app.services.import_service import import_file
from app.services.manual_chatgpt_service import build_prompt, decode_uploaded_text, parse_response
from app.services.spreadsheet_service import create_collection_workbook
from app.services.pricing_stage_service import calculate_stage, ensure_pricing_stages
from app.services.execution_plan_service import build_execution_plan
from app.services.pdf_service import create_action_plan_pdf
from app.services.contract_service import build_contract_content, create_contract_pdf

STATUS = {'NEW':'Novo','ANALYZING':'Analisando','AI_REVIEW':'Revisão da análise','CONSULTANT_REVIEW':'Revisão do consultor','APPROVED':'Aprovada','WAITING_CLIENT':'Aguardando cliente','CLOSED':'Encerrada'}
def render_shell(base: Path):
    load_dotenv(base/'.env'); session_factory = make_session(base)
    state = {'page':'dashboard', 'analysis_id':None}
    ui.add_head_html('''<style>body{background:#f5f7fa}.brand{color:#12324a}.main-title{text-align:center;color:#12324a}.card{border:1px solid #e6ebf0;box-shadow:0 2px 10px #12324a10;border-radius:14px}.justified{text-align:justify}.q-card{border-left:4px solid #e89a32}.review-expansion{background:white!important}.review-expansion .q-item{min-height:44px}.review-actions{display:none}.stage-nav{background:white;border:1px solid #e6ebf0;border-radius:12px;padding:6px;box-shadow:0 2px 8px #12324a0d}.step-done{text-decoration:line-through;color:#94a3b8!important}.step-next{color:#16a34a!important;font-weight:700}</style>''')
    with ui.header().classes('items-center justify-between bg-white text-slate-700 px-6'):
        with ui.row().classes('items-center gap-3'):
            ui.image('/assets/logo-jgm4.png').classes('w-12 h-12 object-contain rounded')
            ui.label('JGM4 CONSULTORIA').classes('text-xl font-bold brand')
        ui.label().bind_text_from(state,'page',backward=lambda x: {'dashboard':'Dashboard','new':'Nova Análise','analyses':'Análises','consultants':'Consultores','parameters':'Parâmetros','ai':'IA','review':'Direcionamento da Oportunidade'}.get(x,''))
        ui.badge('IA configurada' if os.getenv('OPENAI_API_KEY') else 'IA por regras', color='positive' if os.getenv('OPENAI_API_KEY') else 'grey')
    with ui.left_drawer(value=True).classes('bg-[#12324a] text-white'):
        ui.label('Diagnóstico Logístico').classes('text-lg font-semibold q-pb-lg')
        for key, label, icon in [('dashboard','Dashboard','dashboard'),('new','Nova Análise','add_circle'),('analyses','Análises','analytics'),('consultants','Consultores','group'),('parameters','Parâmetros','settings'),('ai','IA','psychology')]:
            ui.button(label, icon=icon, on_click=lambda k=key: navigate(k)).props('flat align=left').classes('w-full text-white')
        ui.space(); ui.label('Uso interno · JGM4').classes('text-xs opacity-70')
    content = ui.column().classes('w-full max-w-7xl mx-auto p-8')
    def navigate(page, clear_analysis=True):
        state['page']=page
        if clear_analysis: state['analysis_id']=None; state['selected_version']=None
        content.clear(); pages[page]()
    def card(title, icon='description'):
        c=ui.card().classes('card w-full p-5');
        with c: ui.label(title).classes('text-lg font-semibold text-[#12324a]').props(f'icon={icon}')
        return c
    def dashboard():
        with content:
            ui.label('JGM4 Diagnóstico Logístico').classes('text-3xl main-title w-full'); ui.label('Análise, estruturação e direcionamento de projetos de consultoria.').classes('text-center w-full text-slate-500')
            with ui.row().classes('w-full gap-4'):
                with session_factory() as s:
                    analyses = s.scalars(select(Analysis)).all()
                statuses = [item.status for item in analyses]
                metrics = [
                    ('Análises em andamento', sum(status not in {'APPROVED', 'CLOSED'} for status in statuses), 'analytics'),
                    ('Aguardando informações', statuses.count('WAITING_CLIENT'), 'help_outline'),
                    ('Prontas para revisão', sum(status in {'AI_REVIEW', 'CONSULTANT_REVIEW'} for status in statuses), 'check_circle'),
                    ('Projetos ativos', statuses.count('APPROVED'), 'business'),
                ]
                for label, value, icon in metrics:
                    with ui.card().classes('card flex-1 p-5'): ui.icon(icon).classes('text-3xl text-[#e89a32]'); ui.label(label).classes('text-sm text-slate-500'); ui.label(str(value)).classes('text-2xl font-bold text-[#12324a]')
            with ui.row().classes('w-full justify-center q-my-md'): ui.button('Nova análise', icon='add_circle', on_click=lambda: navigate('new')).props('unelevated color=primary')
            with card('Últimas análises','assignment'):
                with session_factory() as s: rows=s.scalars(select(Analysis).order_by(Analysis.created_at.desc()).limit(10)).all()
                ui.table(columns=[{'name':'company','label':'Empresa','field':'company'},{'name':'theme','label':'Tema','field':'theme'},{'name':'status','label':'Etapa','field':'status'}], rows=[{'company':a.company,'theme':a.theme or '—','status':STATUS.get(a.status,a.status)} for a in rows]).classes('w-full')
    def new_analysis():
        with content:
            ui.label('Nova Análise').classes('text-3xl main-title w-full'); ui.label('Insira as informações recebidas do cliente para iniciar o direcionamento do diagnóstico.').classes('text-center w-full text-slate-500')
            fields={}
            imported_files=[]
            with card('Identificação','business'):
                with ui.grid(columns=2).classes('w-full'):
                    for key,label in [('company','Empresa *'),('contact','Contato'),('email','E-mail'),('theme','Tema informado pelo cliente'),('segment','Segmento')]: fields[key]=ui.input(label).classes('w-full')
            with card('Respostas recebidas','content_paste'):
                fields['answers']=ui.textarea('Respostas do pré-diagnóstico', placeholder='Cole aqui as respostas recebidas do cliente.').classes('w-full').props('outlined autogrow')
                ui.label('O conteúdo original é preservado no banco.').classes('text-xs text-slate-500')
                with ui.row():
                    imported_name=ui.label('Nenhum arquivo importado').classes('text-xs text-slate-500')
                    picker=ui.upload(on_upload=lambda e: handle_upload(e, fields['answers'], imported_name, imported_files)).props('accept=.txt,.csv,.xlsx').classes('max-w-md'); ui.button('Importar TXT / CSV / Excel', icon='upload_file', on_click=lambda: picker.run_method('pickFiles'))
            with card('Comentários da entrevista','record_voice_over'): fields['notes']=ui.textarea('Comentários e percepções do consultor').classes('w-full').props('outlined autogrow')
            with card('Observações internas','lock'):
                fields['internal']=ui.textarea('Observações internas').classes('w-full').props('outlined autogrow'); fields['include']=ui.checkbox('Incluir estas observações na análise da IA')
            async def submit():
                if not fields['company'].value or not fields['answers'].value: ui.notify('Informe empresa e respostas.', type='warning'); return
                with session_factory() as s:
                    a=Analysis(company=fields['company'].value,contact=fields['contact'].value,email=fields['email'].value,theme=fields['theme'].value,segment=fields['segment'].value,answers=fields['answers'].value,consultant_notes=fields['notes'].value or '',internal_notes=fields['internal'].value or '',include_internal=fields['include'].value,status='ANALYZING'); s.add(a); s.commit(); s.refresh(a)
                    try:
                        rules_result, final_result, provider_name, model_name, ai_error = run_analysis(a.answers, a.consultant_notes, '')
                        a.result=final_result.model_dump(); a.status='AI_REVIEW'; s.commit()
                        next_version=(s.query(AnalysisVersion).filter(AnalysisVersion.analysis_id == a.id).count() + 1)
                        if provider_name == 'hybrid':
                            s.add(AnalysisVersion(analysis_id=a.id, version_number=next_version, provider='rules', model='regras', raw_input_hash=input_hash(a.answers, a.consultant_notes), structured_result=rules_result.model_dump()))
                            s.add(AnalysisVersion(analysis_id=a.id, version_number=next_version + 1, provider='openai', model=model_name, raw_input_hash=input_hash(a.answers, a.consultant_notes), structured_result=a.result))
                        else:
                            s.add(AnalysisVersion(analysis_id=a.id, version_number=next_version, provider='rules', model='regras', raw_input_hash=input_hash(a.answers, a.consultant_notes), structured_result=a.result))
                        s.add(AnalysisRunLog(analysis_id=a.id, success=not bool(ai_error), provider=provider_name, model=model_name, elapsed_ms=0, error_summary=ai_error[:450] if ai_error else None))
                        s.commit()
                        for original_name, stored_path, preview in imported_files: s.add(ImportedFile(analysis_id=a.id, original_name=original_name, stored_path=stored_path, preview=preview))
                        s.commit(); state['analysis_id']=a.id; navigate('review', clear_analysis=False)
                        if ai_error: ui.notify('A análise por IA não foi concluída. O resultado por regras foi preservado.', type='warning')
                    except Exception: a.status='NEW'; s.commit(); ui.notify('Não foi possível realizar a análise. Os dados foram preservados.', type='negative')
            ui.button('Analisar oportunidade', icon='psychology', on_click=submit).props('unelevated color=secondary').classes('q-mt-md')
    async def handle_upload(event, target, imported_name, imported_files):
        try:
            filename=event.file.name; temp=base/'data'/'uploads'/filename; temp.write_bytes(await event.file.read()); stored, info=import_file(str(temp),base/'data'/'uploads'); target.value=info.get('text',''); imported_name.text=f'Arquivo importado: {filename}'; imported_files.append((filename, str(stored), info))
            if filename.lower().endswith('.txt'):
                if not target.value: ui.notify('Este arquivo não contém conteúdo.', type='warning')
                else: ui.notify('Arquivo importado com sucesso')
            else: ui.notify(f'{filename} importado.')
        except Exception: ui.notify('Não foi possível ler este arquivo TXT.', type='negative')
    def review():
        with session_factory() as s:
            a=s.get(Analysis,state['analysis_id'])
            versions=s.scalars(select(AnalysisVersion).where(AnalysisVersion.analysis_id == a.id).order_by(AnalysisVersion.version_number)).all()
        selected_version=state.get('selected_version')
        current_version=next((v for v in versions if v.id == selected_version), None) if selected_version else None
        current_version=current_version or next((v for v in reversed(versions) if v.structured_result == (a.result or {})), None) or (versions[-1] if versions else None)
        if current_version: state['selected_version']=current_version.id; result=current_version.structured_result
        else: result=a.result or {}
        with content:
            ui.label('Direcionamento da Oportunidade').classes('text-3xl main-title w-full'); ui.label(f'{a.company} · {result.get("primary_theme", "—")}').classes('text-center w-full text-slate-500')
            with ui.card().classes('card w-full p-4'):
                provider_label={'rules':'Regras JGM4','openai':'OpenAI','hybrid':'Regras JGM4 + OpenAI','chatgpt_manual':'ChatGPT manual'}.get(current_version.provider if current_version else 'rules', current_version.provider if current_version else 'Regras JGM4')
                mode_label='ChatGPT — copiar e colar' if current_version and current_version.provider == 'chatgpt_manual' else 'Regras JGM4 + IA' if current_version and current_version.provider in ('openai','hybrid') else 'Regras JGM4'
                ui.label(f'Modo: {mode_label} · Provider: {provider_label} · Modelo: {current_version.model if current_version else "regras"} · Versão: {current_version.version_number if current_version else "atual"} · Analisado em: {current_version.created_at.strftime("%d/%m/%Y %H:%M") if current_version else "—"}').classes('text-sm text-slate-600')
                if versions:
                    options={v.id:f'V{v.version_number} - {"ChatGPT manual" if v.provider == "chatgpt_manual" else "Regras JGM4 + IA" if v.provider in ("openai", "hybrid") else "Regras JGM4"}' for v in versions}
                    ui.select(options, value=current_version.id if current_version else None, label='Versão da análise', on_change=lambda e: (state.update(selected_version=e.value), navigate('review', clear_analysis=False))).classes('w-full max-w-md')
                with ui.row().classes('items-center'):
                    def compare_versions(): ui.notify('Comparação lado a lado será disponibilizada na próxima etapa.', type='info')
                    ui.button('COMPARAR VERSÕES', icon='compare_arrows', on_click=compare_versions).props('outline').tooltip('Comparar versão por regras e versão por IA')
            with session_factory() as s:
                has_stage=any(stage.final_price > 0 for stage in s.query(PricingStage).filter(PricingStage.analysis_id == a.id).all())
                has_plan=s.scalars(select(ExecutionPlan).where(ExecutionPlan.analysis_id == a.id)).first() is not None
                has_contract=s.scalars(select(ContractDraft).where(ContractDraft.analysis_id == a.id)).first() is not None
            has_chatgpt=any(v.provider == 'chatgpt_manual' for v in versions)
            with ui.row().classes('w-full justify-end items-center stage-nav gap-1'):
                ui.label('Fluxo:').classes('text-xs text-slate-500 q-mr-sm')
                ui.button('1 Análise ✓', icon='analytics').props('flat disable').classes('step-done')
                ui.button('2 ChatGPT', icon='content_copy', on_click=lambda: ui.notify('Abra a seção ChatGPT manual abaixo.')).props('flat').classes('step-done' if has_chatgpt else 'step-next')
                ui.button('3 Aprovar', icon='check_circle', on_click=lambda: approve()).props(f'flat {"disable" if a.status == "APPROVED" else ""}').classes('step-done' if a.status == 'APPROVED' else ('step-next' if has_chatgpt else ''))
                ui.button('4 Precificação', icon='payments', on_click=lambda: navigate('pricing', clear_analysis=False)).props(f'flat {"" if a.status == "APPROVED" else "disable"}').classes('step-done' if has_stage else ('step-next' if a.status == 'APPROVED' else ''))
                ui.button('5 Contrato', icon='description', on_click=lambda: navigate('contract', clear_analysis=False)).props(f'flat {"" if has_contract else "disable"}').classes('step-done' if has_contract else ('step-next' if has_stage else ''))
                ui.button('6 Plano e Dados', icon='account_tree', on_click=lambda: navigate('execution_plan', clear_analysis=False)).props(f'flat {"" if has_plan else "disable"}').classes('step-done' if has_plan else ('step-next' if has_contract else ''))
                ui.button('7 Histórico', icon='history', on_click=lambda: ui.notify('Use o seletor de versões acima.')).props('flat')
            def save_manual_prompt(prompt_text):
                with session_factory() as s: s.add(ManualChatGPTExchange(analysis_id=a.id,prompt_text=prompt_text,status='PROMPT_GERADO')); s.commit()
                ui.notify('Prompt salvo no histórico.')
            def process_manual_response(raw):
                try:
                    parsed=parse_response(raw or '')
                    with session_factory() as s:
                        x=s.get(Analysis,a.id); x.result=parsed.model_dump(); x.status='AI_REVIEW'; version=s.query(AnalysisVersion).filter(AnalysisVersion.analysis_id == a.id).count()+1; new_version=AnalysisVersion(analysis_id=a.id,version_number=version,provider='chatgpt_manual',model='ChatGPT manual',raw_input_hash=input_hash(a.answers,a.consultant_notes),structured_result=x.result); s.add(new_version); s.add(ManualChatGPTExchange(analysis_id=a.id,prompt_text=prompt_text,response_text=raw,status='RESPOSTA_PROCESSADA')); s.commit(); state['selected_version']=new_version.id
                    ui.notify('Resposta JSON processada e salva como nova versão.'); navigate('review', clear_analysis=False)
                except Exception as exc: ui.notify(f'JSON inválido ou incompatível: {str(exc)[:160]}', type='warning')
            def generate_workbook():
                path=create_collection_workbook(a,result,base/'data'/'uploads'); ui.download(str(path), path.name, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); ui.notify('Download da planilha iniciado.')
            with ui.expansion('ChatGPT manual — copiar e colar', icon='content_copy', value=False).classes('w-full card review-expansion'):
                prompt_text=build_prompt(a, result); prompt_area=ui.textarea('Prompt para ChatGPT', value=prompt_text).classes('w-full').props('outlined autogrow readonly')
                response_area=ui.textarea('Resposta do ChatGPT — cole o JSON aqui').classes('w-full').props('outlined autogrow')
                async def import_chatgpt_file(event):
                    try: response_area.value=decode_uploaded_text(await event.file.read()); ui.notify(f'{event.file.name} carregado. Agora clique em PROCESSAR RESPOSTA.')
                    except Exception: ui.notify('Não foi possível ler o arquivo JSON/TXT. Verifique se ele contém JSON válido.', type='warning')
                with ui.row():
                    ui.button('COPIAR PROMPT', icon='content_copy', on_click=lambda: ui.run_javascript(f'navigator.clipboard.writeText({json.dumps(prompt_text)});')).props('outline')
                    ui.button('BAIXAR PROMPT TXT', icon='download', on_click=lambda: ui.download(prompt_text.encode('utf-8'), 'prompt_jgm4_chatgpt.txt', 'text/plain; charset=utf-8')).props('outline')
                    ui.button('SALVAR PROMPT', icon='save', on_click=lambda: save_manual_prompt(prompt_text)).props('outline')
                    response_picker=ui.upload(on_upload=import_chatgpt_file).props('accept=.json,.txt').classes('max-w-xs'); ui.button('IMPORTAR JSON/TXT', icon='upload_file', on_click=lambda: response_picker.run_method('pickFiles')).props('outline')
                    ui.button('PROCESSAR RESPOSTA', icon='play_arrow', on_click=lambda: process_manual_response(response_area.value)).props('unelevated color=primary')
                    ui.button('GERAR PLANILHA', icon='table_view', on_click=lambda: generate_workbook()).props('outline')
            with ui.row().classes('w-full gap-3 flex-wrap'):
                cards=[('Empresa', a.company), ('Tema principal', result.get('primary_theme','—')), ('Diagnóstico recomendado', result.get('recommended_diagnostic','—')), ('Modalidade preliminar', result.get('suggested_delivery_mode','—'))]
                for label,value in cards:
                    with ui.card().classes('card p-3 flex-1 min-w-[180px]'):
                        ui.label(label).classes('text-xs text-slate-500'); ui.label(str(value)).classes('font-semibold text-[#12324a]')
            editable=[]; removable=[]
            for title,key in [('Resumo Executivo','executive_summary'),('Problema Central','central_problem'),('Fatos Informados','reported_facts'),('Impactos','reported_impacts'),('Problemas Identificados','identified_problems'),('Hipóteses a Validar','hypotheses'),('Lacunas de Informação','information_gaps'),('Perguntas Complementares','complementary_questions'),('Dados Necessários','required_data'),('Documentos Sugeridos','suggested_documents'),('Modelo de Atuação','suggested_delivery_mode')]:
                with ui.expansion(title, value=key in ('executive_summary','central_problem')).classes('w-full card review-expansion'):
                    val=result.get(key,'—');
                    if isinstance(val,list):
                        for item in val:
                            field = 'pergunta' if isinstance(item,dict) and 'pergunta' in item else 'text' if isinstance(item,dict) and 'text' in item else 'nome' if isinstance(item,dict) and 'nome' in item else None
                            text=item.get(field) if field else item
                            with ui.row().classes('items-center w-full q-my-xs'):
                                editor=ui.input(value=str(text)).classes('flex-1');
                                if field:
                                    editable.append((item,field,editor)); removable.append((val,item))
                                    ui.button(icon='delete', on_click=lambda items=val, target=item: remove_item(items,target)).props('flat round color=negative')
                    else: ui.label(str(val)).classes('justified')
            with ui.row().classes('justify-center w-full flex-wrap review-actions'):
                def add_item(kind):
                    if kind == 'complementary_questions':
                        result[kind].append({'id':f'manual-{len(result[kind])+1}','categoria':'Manual','pergunta':'Nova pergunta','tipo_resposta':'texto','obrigatoria':False,'motivo_interno':'Adicionada pelo consultor.','ordem':len(result[kind])+1})
                    elif kind == 'hypotheses': result[kind].append({'text':'Nova hipótese a validar','confidence':'LOW','source_type':'INFERENCE'})
                    elif kind == 'required_data': result[kind].append({'nome':'Novo dado necessário','descricao':'Descrever o dado necessário.','campos_sugeridos':[],'obrigatorio':False,'periodo_recomendado':'','formato_preferencial':'','origem_sugerida':'','motivo_interno':'Adicionado pelo consultor.'})
                    save_result(result, 'CONSULTANT_REVIEW'); navigate('review', clear_analysis=False)
                def remove_item(items, target):
                    if target in items: items.remove(target)
                    save_result(result, 'CONSULTANT_REVIEW'); navigate('review', clear_analysis=False)
                def save_result(data, status='CONSULTANT_REVIEW'):
                    with session_factory() as s: x=s.get(Analysis,a.id); x.result=data; x.status=status; s.commit()
                def save_review():
                    for item, field, editor in editable: item[field]=editor.value
                    save_result(result)
                    ui.notify('Revisão salva.')
                def approve():
                    with session_factory() as s:
                        x=s.get(Analysis,a.id); x.status='APPROVED'; ensure_pricing_stages(s,a.id); s.commit()
                    ui.notify('Análise aprovada e precificação por etapas preparada.'); navigate('pricing', clear_analysis=False)
                ui.button('Salvar revisão',icon='save',on_click=save_review).props('outline color=primary')
                ui.button('Adicionar pergunta',icon='add',on_click=lambda: add_item('complementary_questions')).props('outline')
                ui.button('Adicionar hipótese',icon='add',on_click=lambda: add_item('hypotheses')).props('outline')
                ui.button('Adicionar dado',icon='add',on_click=lambda: add_item('required_data')).props('outline')
                def suggest_ai():
                    started=datetime.now()
                    try:
                        new_result, model, elapsed_ms, total_tokens = run_ai_suggestion(a.answers, a.consultant_notes)
                        with session_factory() as s:
                            x=s.get(Analysis,a.id); x.result=new_result.model_dump(); x.status='AI_REVIEW'; version=(s.query(AnalysisVersion).filter(AnalysisVersion.analysis_id == a.id).count() + 1); new_version=AnalysisVersion(analysis_id=a.id, version_number=version, provider='openai', model=model, raw_input_hash=input_hash(a.answers, a.consultant_notes), structured_result=x.result); s.add(new_version); s.add(AnalysisRunLog(analysis_id=a.id, success=True, provider='openai', model=model, elapsed_ms=elapsed_ms, total_tokens=total_tokens)); s.commit(); state['selected_version']=new_version.id
                        ui.notify('Análise por IA concluída e salva como nova versão.'); navigate('review', clear_analysis=False)
                    except Exception as exc:
                        with session_factory() as s: s.add(AnalysisRunLog(analysis_id=a.id, success=False, provider='openai', model=ai_config()['model'], elapsed_ms=0, error_summary=str(exc)[:450])); s.commit()
                        ui.notify('A análise por IA falhou. O resultado atual continua sendo o produzido pelas regras JGM4.', type='warning')
                ui.button('REANALISAR COM IA',icon='psychology',on_click=suggest_ai).props('unelevated color=secondary').tooltip('Preserva a versão atual e cria uma nova versão pela OpenAI.')
                ui.button('Aprovar análise',icon='check_circle',on_click=approve).props('unelevated color=positive')
                def generate_stage2():
                    questions=result.get('complementary_questions',[])
                    with session_factory() as s:
                        stage=s.scalars(select(DiagnosticStage).where(DiagnosticStage.analysis_id == a.id).order_by(DiagnosticStage.created_at.desc())).first()
                        if not stage: s.add(DiagnosticStage(analysis_id=a.id,name='Etapa 2 — Levantamento Complementar',description='Perguntas aprovadas para aprofundar o diagnóstico.',questions={'items':questions})); s.commit()
                    state['analysis_id']=a.id; navigate('stage2', clear_analysis=False)
                ui.button('GERAR ETAPA 2',icon='arrow_forward',on_click=generate_stage2).props('outline').tooltip('Gera uma estrutura interna com as perguntas aprovadas.')
    def stage2():
        with session_factory() as s:
            a=s.get(Analysis,state['analysis_id']); stage=s.scalars(select(DiagnosticStage).where(DiagnosticStage.analysis_id == a.id).order_by(DiagnosticStage.created_at.desc())).first()
        questions=(stage.questions or {}).get('items',[]) if stage else []
        with content:
            ui.button('Voltar para análise',icon='arrow_back',on_click=lambda: navigate('review', clear_analysis=False)).props('flat')
            ui.label('Etapa 2 — Levantamento Complementar').classes('text-3xl main-title w-full'); ui.label(f'{a.company} · {a.theme or "Diagnóstico logístico"}').classes('text-center w-full text-slate-500')
            with ui.row().classes('w-full gap-3 flex-wrap'):
                with ui.card().classes('card p-4 flex-1 min-w-[220px]'): ui.label('Objetivo').classes('text-xs text-slate-500'); ui.label('Aprofundar as hipóteses e coletar evidências para o diagnóstico.').classes('justified')
                with ui.card().classes('card p-4 flex-1 min-w-[160px]'): ui.label('Perguntas aprovadas').classes('text-xs text-slate-500'); ui.label(str(len(questions))).classes('text-2xl font-bold text-[#12324a]')
                with ui.card().classes('card p-4 flex-1 min-w-[160px]'): ui.label('Status').classes('text-xs text-slate-500'); ui.label('Preparada').classes('font-semibold text-[#12324a]')
            with ui.expansion('Perguntas da Etapa 2', icon='help_outline', value=True).classes('w-full card review-expansion'):
                for index,q in enumerate(questions,1):
                    with ui.row().classes('w-full items-center q-py-sm'):
                        ui.label(f'{index}.').classes('text-slate-500 w-8'); ui.label(q.get('pergunta','')).classes('flex-1 justified'); ui.badge(q.get('categoria','Geral'))
            result=a.result or {}
            with ui.expansion('Dados necessários', icon='table_view').classes('w-full card review-expansion'):
                for item in result.get('required_data',[]): ui.label(f'{item.get("nome","")}: {item.get("descricao","")}').classes('q-my-xs justified')
            with ui.expansion('Documentos solicitados', icon='description').classes('w-full card review-expansion'):
                for item in result.get('suggested_documents',[]): ui.label(item).classes('q-my-xs')
            questions_text='\n'.join(f"{i+1}. {q.get('pergunta','')}" for i,q in enumerate(questions))
            def download_workbook():
                path=create_collection_workbook(a,result,base/'data'/'uploads'); ui.download(str(path), path.name, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); ui.notify('Download da planilha iniciado.')
            with ui.row().classes('justify-center w-full q-my-lg'):
                ui.button('Gerar e baixar planilha',icon='download',on_click=download_workbook).props('unelevated color=primary')
                ui.button('Copiar perguntas',icon='content_copy',on_click=lambda: ui.run_javascript(f'navigator.clipboard.writeText({json.dumps(questions_text)});')).props('outline')
    def pricing():
        with session_factory() as s:
            a=s.get(Analysis,state['analysis_id']); stages=ensure_pricing_stages(s,a.id); s.commit()
        with content:
            ui.button('Voltar para análise',icon='arrow_back',on_click=lambda: navigate('review', clear_analysis=False)).props('flat')
            ui.label('Precificação por etapas').classes('text-3xl main-title w-full'); ui.label(f'{a.company} · escopo: {a.result.get("recommended_diagnostic", "Diagnóstico logístico")}').classes('text-center w-full text-slate-500')
            ui.label('As tarifas são carregadas dos Parâmetros comerciais e não ficam hardcoded no cálculo.').classes('text-center w-full text-slate-500')
            editors=[]
            for stage in stages:
                with ui.expansion(f'{stage.order}. {stage.name}'+(' — opcional' if stage.optional else ''), icon='payments', value=True).classes('w-full card review-expansion'):
                    ui.label(stage.description).classes('justified text-slate-600')
                    ui.label(f'Atividades: {stage.activities}').classes('text-sm justified'); ui.label(f'Entregáveis: {stage.deliverables}').classes('text-sm justified')
                    with ui.row().classes('w-full gap-3 flex-wrap'):
                        selected=ui.checkbox('Selecionar etapa para plano e contrato',value=stage.selected); h=ui.number('Horas Home',value=stage.home_hours,min=0); e=ui.number('Horas Externas',value=stage.external_hours,min=0); exp=ui.number('Despesas',value=stage.expenses,min=0); disc=ui.number('Desconto',value=stage.discount_value,min=0); adj=ui.number('Ajuste manual',value=stage.manual_adjustment)
                        editors.append((stage,selected,h,e,exp,disc,adj))
                    subtotal=stage.home_hours*stage.home_rate+stage.external_hours*stage.external_rate+stage.expenses; total_label=ui.label(f'Tarifas: Home R$ {stage.home_rate:.2f}/h · Externo R$ {stage.external_rate:.2f}/h · Subtotal atual: R$ {subtotal:,.2f} · Preço final: R$ {stage.final_price:,.2f}').classes('font-semibold text-[#12324a]'); validation=ui.label('')
                    def refresh(stage=stage,h=h,e=e,exp=exp,disc=disc,adj=adj,total_label=total_label,validation=validation):
                        values=[float(x.value or 0) for x in (h,e,exp,disc)]; adjustment=float(adj.value or 0)
                        if any(x < 0 for x in values): validation.text='Valores não podem ser negativos.'; validation.classes('text-red-600'); return
                        subtotal=values[0]*stage.home_rate+values[1]*stage.external_rate+values[2]; final=max(0,subtotal-values[3]+adjustment); total_label.text=f'Tarifas: Home R$ {stage.home_rate:.2f}/h · Externo R$ {stage.external_rate:.2f}/h · Subtotal: R$ {subtotal:,.2f} · Preço final: R$ {final:,.2f}'; validation.text='Escopo precificável.' if values[0]+values[1] > 0 else 'Adicione horas para precificar esta etapa.'; validation.classes('text-green-600' if values[0]+values[1] > 0 else 'text-amber-600')
                    for field in (h,e,exp,disc,adj): field.on_value_change(lambda _=None, callback=refresh: callback())
            def save_pricing():
                with session_factory() as s:
                    for stage,selected,h,e,exp,disc,adj in editors:
                        x=s.get(type(stage),stage.id); x.selected=bool(selected.value); x.home_hours=float(h.value or 0); x.external_hours=float(e.value or 0); x.expenses=float(exp.value or 0); x.discount_value=float(disc.value or 0); x.manual_adjustment=float(adj.value or 0); calculate_stage(x)
                    s.commit()
                ui.notify('Precificação por etapas salva.')
            def generate_pdf_plan():
                selected_orders={stage.order for stage,selected,*_ in editors if selected.value}
                if not selected_orders: ui.notify('Selecione pelo menos uma etapa.',type='warning'); return
                with session_factory() as s: x=s.get(Analysis,a.id); saved=s.query(PricingStage).filter(PricingStage.analysis_id == a.id).order_by(PricingStage.order).all(); plan=build_execution_plan(x,x.result or {},saved)
                path=create_action_plan_pdf(a,plan,selected_orders,base/'data'/'uploads'); ui.download(str(path),path.name,'application/pdf'); ui.notify('PDF do plano de ação gerado.')
            def generate_plan():
                with session_factory() as s:
                    x=s.get(Analysis,a.id); saved=s.query(PricingStage).filter(PricingStage.analysis_id == a.id).order_by(PricingStage.order).all(); plan=build_execution_plan(x,x.result or {},saved); record=s.query(ExecutionPlan).filter(ExecutionPlan.analysis_id == a.id).first()
                    if record: record.content=plan; record.status='PREPARED'
                    else: s.add(ExecutionPlan(analysis_id=a.id,status='PREPARED',content=plan))
                    s.commit()
                navigate('execution_plan', clear_analysis=False)
            with ui.row().classes('justify-center w-full q-my-lg'):
                def generate_contract():
                    approved_orders = {stage.order for stage, selected, *_ in editors if selected.value}
                    if not approved_orders:
                        ui.notify('Selecione pelo menos uma etapa aprovada para o contrato.', type='warning')
                        return
                    with session_factory() as s:
                        x=s.get(Analysis,a.id)
                        for stage, selected, h, e, exp, disc, adj in editors:
                            saved_stage=s.get(PricingStage, stage.id)
                            saved_stage.selected=bool(selected.value)
                            saved_stage.home_hours=float(h.value or 0)
                            saved_stage.external_hours=float(e.value or 0)
                            saved_stage.expenses=float(exp.value or 0)
                            saved_stage.discount_value=float(disc.value or 0)
                            saved_stage.manual_adjustment=float(adj.value or 0)
                            calculate_stage(saved_stage)
                        s.flush()
                        saved=s.query(PricingStage).filter(PricingStage.analysis_id == a.id).order_by(PricingStage.order).all()
                        contract=build_contract_content(x,saved,approved_orders)
                        path=create_contract_pdf(x,contract,base/'data'/'uploads')
                        s.add(ContractDraft(analysis_id=a.id,version_number=s.query(ContractDraft).filter(ContractDraft.analysis_id == a.id).count()+1,status='DRAFT',content=contract,pdf_path=str(path)))
                        s.commit()
                    ui.download(str(path),path.name,'application/pdf'); ui.notify('Minuta de contrato gerada e baixada.')
                ui.button('SALVAR PRECIFICAÇÃO',icon='save',on_click=save_pricing).props('unelevated color=primary'); ui.button('GERAR PLANO DAS ETAPAS',icon='account_tree',on_click=generate_plan).props('unelevated color=secondary'); ui.button('GERAR PDF DO PLANO',icon='picture_as_pdf',on_click=generate_pdf_plan).props('unelevated color=secondary'); ui.button('GERAR CONTRATO',icon='description',on_click=generate_contract).props('unelevated color=secondary'); ui.button('Voltar ao direcionamento',icon='arrow_back',on_click=lambda: navigate('review', clear_analysis=False)).props('outline')
    def contract():
        with session_factory() as s:
            a=s.get(Analysis,state['analysis_id']); draft=s.query(ContractDraft).filter(ContractDraft.analysis_id == a.id).order_by(ContractDraft.version_number.desc()).first()
        with content:
            ui.button('Voltar à precificação',icon='arrow_back',on_click=lambda: navigate('pricing', clear_analysis=False)).props('flat')
            ui.label('Impressão do Contrato').classes('text-3xl main-title w-full'); ui.label(f'{a.company} · JGM4 Consultoria').classes('text-center w-full text-slate-500')
            ui.label('Minuta técnica para revisão jurídica/comercial antes da assinatura eletrônica.').classes('text-center w-full text-amber-700')
            if draft:
                contract_data=draft.content; ui.label(f'Versão {draft.version_number} · Status: {draft.status} · Valor total: R$ {contract_data.get("total_price",0):,.2f}').classes('font-semibold text-[#12324a]')
                ui.label('Etapas aprovadas e valores acertados').classes('text-lg font-semibold text-[#12324a] q-mt-md')
                for stage in contract_data.get('stages',[]): ui.label(f'{stage["order"]}. {stage["name"]} — R$ {stage["price"]:,.2f}').classes('q-my-xs')
                ui.label(f'Valor total do contrato: R$ {contract_data.get("total_price",0):,.2f}').classes('text-lg font-bold text-[#12324a] q-mt-md')
                for clause in contract_data.get('clauses',[]): ui.label('• '+clause).classes('q-my-xs')
                with ui.row().classes('justify-center q-my-lg'):
                    ui.button('BAIXAR CONTRATO PDF',icon='download',on_click=lambda: ui.download(draft.pdf_path,Path(draft.pdf_path).name,'application/pdf')).props('unelevated color=primary')
            else:
                ui.label('Nenhum contrato foi gerado. Gere a minuta na tela de Precificação.').classes('text-slate-600')
            ui.label('A assinatura eletrônica será realizada por plataforma acordada entre as partes; esta fase apenas prepara a minuta e os campos de assinatura.').classes('text-sm text-slate-500 justified')
    def execution_plan():
        with session_factory() as s:
            a=s.get(Analysis,state['analysis_id']); record=s.query(ExecutionPlan).filter(ExecutionPlan.analysis_id == a.id).first()
        plan=record.content if record else {'phases':[]}
        with content:
            ui.button('Voltar à precificação',icon='arrow_back',on_click=lambda: navigate('pricing', clear_analysis=False)).props('flat')
            ui.label('Plano das Etapas e Dados do Diagnóstico').classes('text-3xl main-title w-full'); ui.label(f'{a.company} · {plan.get("objective", "Diagnóstico logístico")}').classes('text-center w-full text-slate-500')
            ui.label('O plano orienta entrevistas, coleta de dados e documentos que fazem parte do escopo do projeto e retornarão para análise.').classes('text-center w-full text-slate-500 justified')
            for phase in plan.get('phases',[]):
                with ui.expansion(f'{phase["order"]}. {phase["name"]}',icon='account_tree',value=True).classes('w-full card review-expansion'):
                    ui.label(phase.get('scope','')).classes('justified'); ui.label(f'Atividades: {phase.get("activities","")}').classes('text-sm justified'); ui.label(f'Entregáveis: {phase.get("deliverables","")}').classes('text-sm justified'); ui.label(f'Horas previstas: {phase.get("home_hours",0)} Home · {phase.get("external_hours",0)} Externas').classes('font-semibold text-[#12324a]')
                    with ui.expansion('Entrevistas e assuntos',icon='groups').classes('w-full'):
                        for interview in phase.get('interviews',[]):
                            ui.label(f'Entrevista {interview["number"]} — {interview["title"]} ({interview["participants"]})').classes('font-semibold'); ui.label('Assuntos: '+', '.join(interview.get('topics',[]))).classes('text-sm justified q-mb-sm')
                    with ui.expansion('Documentos necessários',icon='description').classes('w-full'):
                        for document in phase.get('required_documents',[]): ui.label(document).classes('q-my-xs')
            with ui.expansion('Dados que retornarão para análise',icon='table_view').classes('w-full card review-expansion'):
                for data in plan.get('data_to_collect',[]): ui.label(f'{data.get("nome","")}: {data.get("descricao","")}').classes('q-my-xs justified')
            ui.button('Voltar ao direcionamento',icon='analytics',on_click=lambda: navigate('review', clear_analysis=False)).props('outline')
    def list_analyses():
        with content:
            ui.label('Análises').classes('text-3xl main-title w-full')
            with session_factory() as s: rows=s.scalars(select(Analysis).order_by(Analysis.created_at.desc())).all()
            for a in rows:
                with ui.card().classes('card w-full p-4'):
                    ui.label(a.company).classes('text-lg font-bold text-[#12324a]'); ui.label(f'{a.theme or "Sem tema"} · {STATUS.get(a.status,a.status)}'); ui.button('Abrir direcionamento',icon='analytics',on_click=lambda ident=a.id: (state.update(analysis_id=ident, selected_version=None),navigate('review', clear_analysis=False))).props('flat')
    def consultants():
        with content:
            ui.label('Consultores').classes('text-3xl main-title w-full'); fields={}
            with card('Novo consultor','group'):
                for key,label in [('name','Nome completo *'),('email','E-mail *'),('title','Cargo profissional'),('specialties','Especialidades')]: fields[key]=ui.input(label).classes('w-full')
                def save():
                    if not fields['name'].value or not fields['email'].value: ui.notify('Nome e e-mail são obrigatórios.',type='warning'); return
                    with session_factory() as s: s.add(Consultant(name=fields['name'].value,email=fields['email'].value,professional_title=fields['title'].value,specialties=fields['specialties'].value)); s.commit()
                    ui.notify('Consultor salvo.'); navigate('consultants')
                ui.button('Salvar consultor',icon='save',on_click=save).props('unelevated color=primary')
            with session_factory() as s: rows=s.scalars(select(Consultant)).all()
            ui.table(columns=[{'name':'name','label':'Nome','field':'name'},{'name':'email','label':'E-mail','field':'email'},{'name':'home_rate','label':'Hora home','field':'home_rate'}], rows=[{'name':x.name,'email':x.email,'home_rate':f'R$ {x.home_rate:.2f}'} for x in rows]).classes('w-full')
    def parameters():
        with content:
            ui.label('Parâmetros comerciais').classes('text-3xl main-title w-full'); inputs={}
            with card('Tarifas e padrões','payments'):
                with session_factory() as s: current={p.key:p.value for p in s.scalars(select(Parameter)).all()}
                for key,label in [('home_rate','Valor hora Home'),('external_rate','Valor hora Externo'),('daily_rate','Valor diária padrão'),('km_rate','KM rodado'),('lodging','Hospedagem padrão'),('food','Alimentação padrão'),('contingency','Contingência %'),('discount','Desconto padrão %'),('minimum_margin','Margem mínima desejada %'),('proposal_validity_days','Validade da proposta em dias')]: inputs[key]=ui.number(label,value=float(current.get(key,0))).classes('w-full')
                def save():
                    with session_factory() as s:
                        for k,v in inputs.items(): p=s.get(Parameter,k); p.value=str(v.value)
                        s.commit()
                    ui.notify('Parâmetros salvos.')
                ui.button('Salvar parâmetros',icon='save',on_click=save).props('unelevated color=primary')
    def ai():
        with content:
            settings=ai_config(); ui.label('IA').classes('text-3xl main-title w-full'); ui.label('A chave nunca é exibida na interface.').classes('text-center w-full text-slate-500')
            with card('Configuração da análise','settings'):
                enabled=ui.switch('IA habilitada',value=settings['enabled']); mode=ui.select({'manual':'ChatGPT — copiar e colar','hybrid':'Regras JGM4 + IA','rules':'Somente regras JGM4'},value=settings['mode'],label='Modo'); model=ui.input('Modelo solicitado',value=settings['model']).classes('w-full'); temperature=ui.number('Temperatura',value=settings['temperature'],min=0,max=1,step=0.1); timeout=ui.number('Timeout (segundos)',value=settings['timeout'],min=10,max=300)
                def save_ai_config():
                    save_config({'AI_ENABLED':'true' if enabled.value else 'false','ANALYSIS_MODE':mode.value,'OPENAI_MODEL':model.value,'AI_TEMPERATURE':temperature.value,'AI_TIMEOUT':timeout.value}); ui.notify('Configuração da IA salva.')
                ui.button('Salvar configuração',icon='save',on_click=save_ai_config).props('unelevated color=primary')
            with card('Diagnóstico seguro','psychology'):
                ui.label(f'Chave encontrada: {"Sim" if os.getenv("OPENAI_API_KEY") else "Não"}'); ui.label(f'IA habilitada: {"Sim" if settings["enabled"] else "Não"}'); ui.label(f'Modo atual: {settings["mode"]}'); ui.label(f'Modelo solicitado: {settings["model"]}');
                auth_label=ui.label('Autenticação: não testada'); model_label=ui.label('Modelo: não testado'); api_label=ui.label('Responses API: não testada'); structured_label=ui.label('Structured Output: não testado'); detail_label=ui.label('')
                def log_diagnostic(name, diagnostic):
                    with session_factory() as s: s.add(AIDiagnosticLog(test_name=name,success=diagnostic.success,error_type=diagnostic.error_type,http_status=diagnostic.http_status,error_code=diagnostic.error_code,message=diagnostic.message,model=diagnostic.model,endpoint=diagnostic.endpoint,elapsed_ms=diagnostic.elapsed_ms,total_tokens=diagnostic.total_tokens)); s.commit()
                def show_error(diagnostic):
                    if diagnostic.success: detail_label.text=f'Sucesso · Modelo: {diagnostic.model} · Tempo: {diagnostic.elapsed_ms} ms · Tokens: {diagnostic.total_tokens or "não informado"}'
                    else: detail_label.text=f'Status: Falhou | Código HTTP: {diagnostic.http_status or "—"} | Erro: {diagnostic.error_code or diagnostic.error_type or "—"} | Mensagem: {diagnostic.message or "—"} | Modelo: {diagnostic.model}'
                def check():
                    d=test_connection_detailed(); log_diagnostic('connection',d); auth_label.text=f'Autenticação: {"OK" if d.success or d.http_status not in (401,403) and d.error_code != "missing_api_key" else "ERRO"}'; model_label.text=f'Modelo: {"OK" if d.success else "ERRO" if d.error_code in ("model_not_found","invalid_model") else "não confirmado"}'; api_label.text=f'Responses API: {"OK" if d.success else "ERRO"}'; show_error(d); ui.notify('IA conectada com sucesso.' if d.success else 'Não foi possível conectar à IA',type='positive' if d.success else 'negative')
                def structured():
                    d,payload=test_structured_output(); log_diagnostic('structured_output',d); structured_label.text=f'Structured Output: {"OK" if d.success else "ERRO"}'; show_error(d); ui.notify('Structured Output funcionando.' if d.success else 'Teste de Structured Output falhou.',type='positive' if d.success else 'negative')
                ui.button('TESTAR CONEXÃO',icon='wifi',on_click=check).props('outline'); ui.button('TESTAR RESPOSTA ESTRUTURADA',icon='data_object',on_click=structured).props('outline')
            with card('Último teste / último erro','warning'):
                with session_factory() as s: last=s.scalars(select(AIDiagnosticLog).order_by(AIDiagnosticLog.created_at.desc()).limit(1)).first()
                if last: ui.label(f'Status: {"Sucesso" if last.success else "Falhou"} · Teste: {last.test_name} · Código HTTP: {last.http_status or "—"} · Erro: {last.error_code or "—"} · Mensagem: {last.message or "—"} · Modelo: {last.model or "—"}').classes('text-sm')
                else: ui.label('Nenhum teste realizado.').classes('text-slate-500')
    pages={'dashboard':dashboard,'new':new_analysis,'review':review,'stage2':stage2,'pricing':pricing,'contract':contract,'execution_plan':execution_plan,'analyses':list_analyses,'consultants':consultants,'parameters':parameters,'ai':ai}; dashboard()
