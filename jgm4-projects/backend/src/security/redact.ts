// Proteção de logs: nada de senha, token, cookie, segredo ou cabeçalho de autorização chega a um log.
const SENSITIVE_KEY = /pass(word)?|senha|token|secret|authorization|cookie|api[-_]?key|credential|csrf|mfa(secret|code)|refresh|jwt|private/i;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g;
const BEARER = /(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const URL_SECRET = /([?&](?:token|code|password|senha|secret|key)=)[^&\s]+/gi;
// "password=valor", "token: valor", "Authorization: valor" soltos em mensagens de erro.
const KEY_VALUE = /\b(password|passwd|senha|secret|token|api[-_]?key|authorization|cookie)\b(\s*[=:]\s*)(?!\[REDIGIDO\])[^\s,;&"']+/gi;
const CONNECTION_PASSWORD = /(postgres(?:ql)?:\/\/[^:\s/@]+:)[^@\s]+(@)/gi;
export const REDACTED = '[REDIGIDO]';

export function redactString(value: string): string {
  return value.replace(KEY_VALUE, `$1$2${REDACTED}`).replace(JWT, REDACTED).replace(BEARER, `$1 ${REDACTED}`).replace(URL_SECRET, `$1${REDACTED}`).replace(CONNECTION_PASSWORD, `$1${REDACTED}$2`);
}
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactString(value);
  if (typeof value !== 'object') return value;
  if (depth > 6) return '[...]';
  if (value instanceof Error) return { name: value.name, message: redactString(value.message) };
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, SENSITIVE_KEY.test(key) ? REDACTED : redact(item, depth + 1)]));
}
