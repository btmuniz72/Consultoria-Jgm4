// Ambiente dos testes. As suítes das Etapas 1–5 exercitam workflows com o ator de desenvolvimento
// (JGM4_LOCAL_ACTOR / x-actor-role), que agora precisa ser habilitado explicitamente. A suíte de
// autenticação (auth.spec.ts) desliga o modo dev e usa tokens reais.
process.env.ALLOW_DEV_ACTOR_HEADER = 'true';
process.env.BCRYPT_COST = '4';
process.env.JWT_SECRET ??= 'segredo-de-teste-somente-local-0123456789abcdef';
process.env.PDF_COMPRESS = 'false';
process.env.TRUST_PROXY = '1';
process.env.RATE_LIMIT_LOGIN_PER_IP = '5000'; // a suíte faz muitos logins; o teste de limite define um valor baixo explicitamente
process.env.MAIL_PROVIDER = 'memory';
process.env.UPLOAD_MAX_MB = '2';
process.env.STORAGE_LOCAL_DIR ??= require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'jgm4-storage-test-'));
