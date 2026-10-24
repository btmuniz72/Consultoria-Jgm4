from html import escape
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def _paragraph(value, style):
    raw = str(value or "").replace("<br/>", "\n").replace("<br>", "\n")
    text = escape(raw, quote=False).replace("\n", "<br/>")
    return Paragraph(text, style)


def _bullet_lines(values):
    return "\n".join(f"• {str(value).replace('<br/>', ' ').replace('<br>', ' ').strip()}" for value in values if value)


def create_action_plan_pdf(analysis, plan, selected_orders, output_dir: Path):
    output_dir.mkdir(parents=True, exist_ok=True)
    safe = "".join(c if c.isalnum() else "_" for c in analysis.company)
    path = output_dir / f"JGM4_{safe}_Plano_Acao_Etapas.pdf"
    doc = SimpleDocTemplate(
        str(path), pagesize=A4, rightMargin=1.35 * cm, leftMargin=1.35 * cm,
        topMargin=1.2 * cm, bottomMargin=1.25 * cm,
        title=f"Plano de Ação por Etapas — {analysis.company}", author="JGM4 Consultoria",
    )
    styles = getSampleStyleSheet()
    body = styles["BodyText"].clone("plan_body")
    body.fontSize, body.leading, body.spaceAfter = 9, 12, 4
    small = body.clone("plan_small")
    small.fontSize, small.leading, small.spaceAfter = 7.5, 9.5, 0
    heading = styles["Heading2"].clone("plan_heading")
    heading.fontSize, heading.leading, heading.spaceAfter = 13, 16, 6

    story = []
    logo = Path(__file__).resolve().parents[2] / "assets" / "logo-jgm4.png"
    if logo.exists():
        story.extend([Image(str(logo), width=2.0 * cm, height=2.0 * cm), Spacer(1, 4)])
    title = styles["Title"].clone("plan_title")
    title.fontSize, title.leading = 18, 22
    story.extend([
        Paragraph("JGM4 Consultoria — Plano de Ação por Etapas", title),
        _paragraph(f"Cliente: {analysis.company}", body), Spacer(1, 8),
    ])

    selected = set(selected_orders or [])
    for phase in plan.get("phases", []):
        if phase.get("order") not in selected:
            continue
        story.extend([
            _paragraph(f'{phase.get("order", "")}. {phase.get("name", "")}', heading),
            Paragraph("<b>Escopo</b>", body),
            _paragraph(f'• {phase.get("scope", "")}', body),
            Paragraph("<b>Atividades</b>", body),
            _paragraph("• " + str(phase.get("activities", "")).replace(";", "\n• "), body),
            Paragraph("<b>Entregáveis</b>", body),
            _paragraph(f'• {phase.get("deliverables", "")}', body),
            Paragraph(
                f'<b>Horas previstas:</b> Home {phase.get("home_hours", 0)} · '
                f'Externas {phase.get("external_hours", 0)}', body,
            ), Spacer(1, 5),
        ])
        rows = [[_paragraph("Entrevista", small), _paragraph("Participantes", small), _paragraph("Assuntos", small)]]
        for interview in phase.get("interviews", []):
            rows.append([
                _paragraph(f'• {interview.get("number", "")}', small),
                _paragraph(interview.get("participants", ""), small),
                _paragraph(_bullet_lines(interview.get("topics", [])), small),
            ])
        if len(rows) > 1:
            table = Table(rows, colWidths=[2.0 * cm, 5.1 * cm, 8.55 * cm], repeatRows=1, hAlign="LEFT")
            table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#12324a")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#9aa7b0")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]))
            story.extend([table, Spacer(1, 7)])
        documents = list(dict.fromkeys(phase.get("required_documents", [])))
        story.extend([
            Paragraph("<b>Documentos operacionais necessários:</b>", body),
            _paragraph(_bullet_lines(documents), body), Spacer(1, 10),
        ])
    doc.build(story)
    return path
