from html import escape
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def _p(value, style):
    return Paragraph(escape(str(value or ""), quote=False).replace("\n", "<br/>"), style)


def build_contract_content(analysis, stages, approved_orders=None):
    """Build a contract from the stages explicitly approved for this contract."""
    if approved_orders is None:
        included = [s for s in stages if not s.optional or s.final_price > 0]
    else:
        approved = {int(order) for order in approved_orders}
        included = [s for s in stages if s.order in approved]
    total = sum(s.final_price for s in included)
    return {
        "title": "Contrato de Prestação de Serviços de Diagnóstico Logístico",
        "company": analysis.company,
        "provider": "JGM4 Consultoria",
        "objective": (analysis.result or {}).get("recommended_diagnostic", "Diagnóstico logístico"),
        "duration": "A definir no aceite comercial, conforme cronograma aprovado.",
        "stages": [{
            "order": s.order, "name": s.name, "description": s.description,
            "home_hours": s.home_hours, "external_hours": s.external_hours,
            "price": s.final_price, "optional": s.optional,
        } for s in included],
        "total_price": total,
        "approved_orders": [s.order for s in included],
        "clauses": [
            "Objeto e escopo técnico", "Obrigações da JGM4 Consultoria",
            "Obrigações da contratante", "Confidencialidade e uso restrito das informações",
            "Proteção de informações e acesso mínimo necessário", "Prazo e duração do projeto",
            "Valores, condições e despesas", "Aprovação de alterações de escopo",
            "Rescisão e encerramento", "Assinaturas das partes",
        ],
    }


def create_contract_pdf(analysis, content, output_dir: Path):
    output_dir.mkdir(parents=True, exist_ok=True)
    safe = "".join(c if c.isalnum() else "_" for c in analysis.company)
    path = output_dir / f"JGM4_{safe}_Contrato_Diagnostico.pdf"
    doc = SimpleDocTemplate(
        str(path), pagesize=A4, rightMargin=1.35 * cm, leftMargin=1.35 * cm,
        topMargin=1.2 * cm, bottomMargin=1.25 * cm,
        title=f"Contrato JGM4 — {analysis.company}", author="JGM4 Consultoria",
    )
    styles = getSampleStyleSheet()
    body = styles["BodyText"].clone("contract_body")
    body.fontSize, body.leading, body.spaceAfter = 9, 12, 4
    small = body.clone("contract_small")
    small.fontSize, small.leading, small.spaceAfter = 7.5, 9.5, 0
    story = []
    logo = Path(__file__).resolve().parents[2] / "assets" / "logo-jgm4.png"
    if logo.exists():
        story.extend([Image(str(logo), width=2.0 * cm, height=2.0 * cm), Spacer(1, 4)])
    story.extend([
        Paragraph("CONTRATO DE PRESTAÇÃO DE SERVIÇOS", styles["Title"]),
        Paragraph("Diagnóstico Logístico", styles["Heading2"]), Spacer(1, 8),
        _p(f'Contratante: {content["company"]}', body),
        _p("Contratada: JGM4 Consultoria", body),
        _p(f'Objeto: {content["objective"]}', body),
        _p(f'Duração: {content["duration"]}', body), Spacer(1, 10),
        Paragraph("1. ESCOPO E VALORES", styles["Heading2"]),
    ])
    rows = [[_p(x, small) for x in ["Etapa", "Escopo", "Home", "Externo", "Valor"]]]
    for stage in content["stages"]:
        rows.append([
            _p(f'{stage["order"]}. {stage["name"]}', small), _p(stage["description"], small),
            _p(stage["home_hours"], small), _p(stage["external_hours"], small),
            _p(f'R$ {stage["price"]:,.2f}', small),
        ])
    table = Table(rows, colWidths=[3.3 * cm, 6.9 * cm, 1.35 * cm, 1.45 * cm, 2.0 * cm], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#12324a")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#9aa7b0")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.extend([
        table, Paragraph(f'<b>Valor total estimado:</b> R$ {content["total_price"]:,.2f}', styles["Heading3"]),
        Spacer(1, 10), Paragraph("2. CLÁUSULAS TÉCNICAS", styles["Heading2"]),
    ])
    for index, clause in enumerate(content["clauses"], 1):
        story.extend([_p(f"2.{index}. {clause}. Os detalhes serão executados conforme o escopo aprovado e os registros do projeto.", body), Spacer(1, 3)])
    signatures = Table([
        ["__________________________________", "__________________________________"],
        ["Representante da contratante", "JGM4 Consultoria"],
        ["Nome: ____________________________", "Nome: ____________________________"],
        ["Data: ____/____/________", "Data: ____/____/________"],
    ], colWidths=[8.1 * cm, 8.1 * cm])
    story.extend([
        Spacer(1, 12), Paragraph("3. ASSINATURAS ELETRÔNICAS", styles["Heading2"]),
        _p("As partes poderão assinar este documento por plataforma de assinatura eletrônica acordada entre elas. A assinatura deverá identificar o signatário, data e evidências de integridade do documento.", body),
        Spacer(1, 25), signatures,
    ])
    doc.build(story)
    return path
