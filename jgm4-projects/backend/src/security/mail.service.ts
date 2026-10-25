import { Injectable, Logger } from '@nestjs/common';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import nodemailer from 'nodemailer';
import { publicUrl } from './config';
import { redactString } from './redact';

export interface MailMessage { to: string; subject: string; text: string }

// E-mail transacional (redefinição de senha, aviso de segurança). Provedores: `smtp` (produção), `outbox` (desenvolvimento: grava em
// arquivo local ignorado pelo Git — o link nunca vai para o log) e `memory` (testes). Sem notificações de workflow nesta etapa.
@Injectable()
export class MailService {
  static readonly memory: MailMessage[] = [];
  private readonly logger = new Logger('Mail');
  private provider() { return process.env.MAIL_PROVIDER ?? (process.env.NODE_ENV === 'production' ? 'smtp' : 'outbox'); }

  async send(message: MailMessage) {
    try {
      const provider = this.provider();
      if (provider === 'memory') { MailService.memory.push(message); return; }
      if (provider === 'outbox') {
        const dir = resolve(process.env.MAIL_OUTBOX_DIR ?? resolve(process.cwd(), '../.local/outbox')); mkdirSync(dir, { recursive: true });
        writeFileSync(resolve(dir, `${Date.now()}-${message.to.replace(/[^a-z0-9@.]/gi, '_')}.txt`), `Para: ${message.to}\nAssunto: ${message.subject}\n\n${message.text}\n`, { mode: 0o600 });
        return;
      }
      const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT ?? 587), secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined });
      await transport.sendMail({ from: process.env.MAIL_FROM ?? 'no-reply@invalid', to: message.to, subject: message.subject, text: message.text });
    } catch (error) { this.logger.error(`Falha ao enviar e-mail: ${redactString((error as Error).message)}`); }
  }
  resetLink(token: string) { return `${publicUrl().replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`; }
}
