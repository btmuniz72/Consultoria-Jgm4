import { alignmentSections, alignmentSummary } from './alignment.data';

export interface AlignmentDraft { date: string; participants: string; answers: Record<string, string>; }
export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
}
export function alignmentDocument(company: string, project: string, draft: AlignmentDraft, logoDataUrl: string): string {
  const field = (key: string, label: string) => `<label>${escapeHtml(label)}<textarea data-key="${key}" rows="3">${escapeHtml(draft.answers[key] || '')}</textarea></label>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Alinhamento Plano C — ${escapeHtml(company)}</title><style>
  *{box-sizing:border-box}body{font:14px Arial,sans-serif;color:#172b45;max-width:900px;margin:35px auto;padding:0 24px;line-height:1.6}h1{font-size:26px}h2{font-size:19px}header{border-bottom:3px solid #173b60;padding-bottom:20px}section{border-bottom:1px solid #ddd;padding:20px 0}label{display:block;font-weight:bold;margin-top:16px}textarea,input{display:block;width:100%;padding:10px;border:1px solid #bfc9d4;border-radius:3px;font:14px Arial;line-height:1.6;margin-top:8px;color:inherit}textarea{min-height:95px;resize:vertical;overflow:hidden}button{background:#173b60;color:white;border:0;padding:12px 16px;margin:8px 8px 8px 0;cursor:pointer}.note{color:#5c6c7d;font-size:12px}@media print{body{max-width:none;margin:0;padding:0;font-size:11pt}.toolbar{display:none}textarea,input{border:0;border-bottom:1px solid #ddd;padding:5px 0;resize:none}label{break-inside:avoid}h2{break-after:avoid}section{break-inside:auto}}
  .document-brand{display:flex;align-items:center;gap:20px}.document-brand img{width:112px;height:112px;object-fit:contain;flex:0 0 auto}.document-brand p{letter-spacing:1px;font-size:12px}@media(max-width:550px){.document-brand{gap:14px}.document-brand img{width:88px;height:88px}.document-brand h1{font-size:21px}}@media print{.document-brand{break-inside:avoid}.document-brand img{width:96px;height:96px}}
  </style></head><body><header><div class="document-brand"><img src="${escapeHtml(logoDataUrl)}" alt="JGM4 Consultoria Logística" width="112" height="112"><div><p>JGM4 PROJECTS · PLANO C</p><h1>Reunião de alinhamento</h1></div></div><p><strong>${escapeHtml(company)}</strong> · ${escapeHtml(project)}</p><p>Confirmar papéis, Gates e disponibilidade interna para a implantação assistida.</p></header>
  <div class="toolbar"><p class="note">Documento preenchível independente. Abra no navegador, edite as respostas e use “Salvar cópia preenchida” para manter suas alterações. Para PDF, use “Imprimir / PDF”. Este registro não aprova Gates nem altera solicitações.</p><button id="save-copy">Salvar cópia preenchida</button><button id="print">Imprimir / PDF</button></div>
  <label>Data da reunião<input type="date" value="${escapeHtml(draft.date)}"></label><label>Participantes<textarea rows="2">${escapeHtml(draft.participants)}</textarea></label>
  ${alignmentSections.map((section, i) => `<section><h2>${i + 1}. ${escapeHtml(section.title)}</h2><p>${escapeHtml(section.explanation)}</p>${section.topics ? `<ul>${section.topics.map((topic) => `<li>${escapeHtml(topic)}</li>`).join('')}</ul>` : ''}${section.questions.map((q, j) => field(`s${i}q${j}`, q)).join('')}</section>`).join('')}
  <section><h2>Informações consolidadas da reunião</h2>${alignmentSummary.map((q, i) => field(`summary${i}`, q)).join('')}</section>
  <p class="note">Documento de alinhamento. A confirmação aqui registrada não substitui a análise técnica e a decisão formal dos Gates.</p>
  <script>
  function resizeFields(){document.querySelectorAll('textarea').forEach(function(el){el.style.height='auto';el.style.height=Math.max(95,el.scrollHeight+4)+'px'})}
  document.addEventListener('input',resizeFields);window.addEventListener('beforeprint',resizeFields);resizeFields();
  document.getElementById('print').onclick=function(){resizeFields();window.print()};
  document.getElementById('save-copy').onclick=function(){document.querySelectorAll('textarea').forEach(function(el){el.textContent=el.value});document.querySelectorAll('input').forEach(function(el){el.setAttribute('value',el.value)});var url=URL.createObjectURL(new Blob(['<!doctype html>'+document.documentElement.outerHTML],{type:'text/html;charset=utf-8'}));var a=document.createElement('a');a.href=url;a.download='alinhamento-plano-c-preenchido.html';a.click();setTimeout(function(){URL.revokeObjectURL(url)},1000)};
  </script></body></html>`;
}
