import JSZip from 'jszip';
import { basename } from 'node:path';

// Tipos permitidos (Etapa 8): PDF, XLSX, DOCX, JPG, PNG. Não confia na extensão nem no Content-Type enviado: confere a assinatura do arquivo
// (e, para XLSX/DOCX, a estrutura interna do pacote) e exige coerência entre os três.
const TYPES: Record<string, { mimes: string[]; family: 'pdf' | 'png' | 'jpeg' | 'xlsx' | 'docx' }> = {
  pdf: { mimes: ['application/pdf'], family: 'pdf' }, png: { mimes: ['image/png'], family: 'png' }, jpg: { mimes: ['image/jpeg'], family: 'jpeg' }, jpeg: { mimes: ['image/jpeg'], family: 'jpeg' },
  xlsx: { mimes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], family: 'xlsx' }, docx: { mimes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'], family: 'docx' },
};
const CANONICAL = { pdf: 'application/pdf', png: 'image/png', jpeg: 'image/jpeg', xlsx: TYPES['xlsx'].mimes[0], docx: TYPES['docx'].mimes[0] } as const;
export const ALLOWED_EXTENSIONS = Object.keys(TYPES);
const MAX_UNCOMPRESSED = 200 * 1024 * 1024; // proteção contra "zip bomb"

/** Nome seguro para exibir e para o cabeçalho de download (sem caminho, sem caracteres de controle). */
export function safeFileName(name: string) {
  const base = basename(name.replaceAll('\\', '/')).normalize('NFC').replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
  return base && base !== '.' && base !== '..' ? base : 'arquivo';
}
const startsWith = (buffer: Buffer, bytes: number[]) => bytes.every((byte, index) => buffer[index] === byte);

export type Inspection = { ok: true; extension: string; mime: string; family: keyof typeof CANONICAL } | { ok: false; reason: string };
export async function inspectFile(originalName: string, declaredMime: string | undefined, data: Buffer): Promise<Inspection> {
  const extension = (originalName.split('.').pop() ?? '').toLowerCase(); const type = TYPES[extension];
  if (!type) return { ok: false, reason: `Tipo de arquivo não permitido. Aceitos: ${ALLOWED_EXTENSIONS.join(', ')}.` };
  if (!data.length) return { ok: false, reason: 'Arquivo vazio.' };
  const declared = declaredMime?.toLowerCase();
  if (declared && declared !== 'application/octet-stream' && !type.mimes.includes(declared)) return { ok: false, reason: 'O tipo informado não corresponde à extensão do arquivo.' };
  const magicOk = type.family === 'pdf' ? startsWith(data, [0x25, 0x50, 0x44, 0x46, 0x2d]) : type.family === 'png' ? startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) : type.family === 'jpeg' ? startsWith(data, [0xff, 0xd8, 0xff]) : startsWith(data, [0x50, 0x4b, 0x03, 0x04]);
  if (!magicOk) return { ok: false, reason: 'O conteúdo do arquivo não corresponde à extensão informada.' };
  if (type.family === 'xlsx' || type.family === 'docx') {
    try {
      const zip = await JSZip.loadAsync(data); const names = Object.keys(zip.files);
      const total = names.reduce((sum, name) => sum + ((zip.files[name] as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0), 0);
      if (total > MAX_UNCOMPRESSED) return { ok: false, reason: 'Arquivo compactado excede o limite permitido.' };
      if (!names.includes('[Content_Types].xml') || !names.includes(type.family === 'xlsx' ? 'xl/workbook.xml' : 'word/document.xml')) return { ok: false, reason: 'O pacote não é um documento válido do tipo informado.' };
      if (names.some((name) => /vbaProject\.bin$/i.test(name))) return { ok: false, reason: 'Arquivos com macros não são permitidos.' };
    } catch { return { ok: false, reason: 'O pacote do documento está corrompido.' }; }
  }
  return { ok: true, extension, mime: CANONICAL[type.family], family: type.family };
}
