// Política mínima de senha (Etapa 8): 10+ caracteres, maiúscula, minúscula, número e caractere especial; bloqueia senhas óbvias
// e senhas derivadas do nome/e-mail. Sem exigências excessivas (sem expiração periódica nem histórico).
const COMMON = ['password', 'senha', 'qwerty', 'abc123', '123456', '1234567890', 'admin', 'letmein', 'welcome', 'iloveyou', 'jgm4', 'ollem', 'almoxarifado', 'mudar', 'trocar', 'senha123', 'password1', 'qazwsx', 'passw0rd', 'brasil'];
export const MIN_PASSWORD_LENGTH = 10;

export function validatePassword(password: string, context: { email?: string | null; name?: string | null } = {}): string[] {
  const errors: string[] = [];
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) errors.push(`A senha deve ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  if (password.length > 128) errors.push('A senha deve ter no máximo 128 caracteres.');
  if (!/[a-zà-ÿ]/.test(password)) errors.push('Inclua uma letra minúscula.');
  if (!/[A-ZÀ-Þ]/.test(password)) errors.push('Inclua uma letra maiúscula.');
  if (!/\d/.test(password)) errors.push('Inclua um número.');
  if (!/[^A-Za-z0-9À-ÿ]/.test(password)) errors.push('Inclua um caractere especial.');
  const lower = password.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const squashed = lower.replace(/[^a-z0-9]/g, '');
  if (COMMON.some((word) => squashed === word || (word.length >= 5 && squashed.includes(word) && squashed.length <= word.length + 4))) errors.push('Essa senha é muito comum; escolha outra.');
  if (/^(.)\1+$/.test(password) || /(0123|1234|2345|3456|4567|5678|6789|abcd|qwer)/.test(squashed) && squashed.length <= 14) errors.push('Evite sequências óbvias.');
  const local = (context.email ?? '').split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  if (local.length >= 4 && squashed.includes(local)) errors.push('A senha não pode conter o seu e-mail.');
  const first = (context.name ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/)[0]?.replace(/[^a-z]/g, '') ?? '';
  if (first.length >= 4 && squashed.includes(first)) errors.push('A senha não pode conter o seu nome.');
  return errors;
}
