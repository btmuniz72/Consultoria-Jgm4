# JGM4 Diagnóstico Logístico — Fase 1

Aplicação local para organizar pré-diagnósticos, entrevistas, arquivos e direcionamento de oportunidades. A análise por regras funciona sem internet; a IA é opcional.

## Início rápido (Windows)

```powershell
cd jgm4_diagnostico
py -3.12 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
python main.py
```

O navegador padrão será aberto em `http://127.0.0.1:8080`. O banco fica em `data/jgm4_diagnostico.db` e arquivos importados em `data/uploads/`. O backup manual pode ser feito copiando o arquivo `.db` com a aplicação parada.

Configure `OPENAI_API_KEY` e `OPENAI_MODEL` no `.env` para habilitar a análise complementar por OpenAI. Sem chave, a aplicação usa somente as regras JGM4.

O modo híbrido (`ANALYSIS_MODE=hybrid`) executa primeiro as regras JGM4 e envia à OpenAI somente respostas do cliente, observações do consultor e o contexto logístico produzido pelas regras. CPF, custos internos, margens e parâmetros comerciais não são enviados. O botão **IA > Testar conexão** valida o modelo configurado sem exibir a chave.

Tarifas podem ser alteradas em **Parâmetros**; consultores em **Consultores**. As tarifas são persistidas e lidas do banco pelo `PricingService`, não ficam embutidas no cálculo.

## Escopo

Esta fase não inclui área pública, login online, pagamentos, WhatsApp, e-mail, agenda ou proposta PDF.
