import { LogLevel, LoggerService } from '@nestjs/common';
import { redact, redactString } from './redact';

/** Logger estruturado (uma linha JSON por evento) para staging/produção; mensagens e contexto passam pela sanitização. */
export class JsonLogger implements LoggerService {
  private write(level: string, message: unknown, optional: unknown[]) {
    const context = typeof optional[optional.length - 1] === 'string' ? (optional.pop() as string) : undefined;
    const text = typeof message === 'string' ? redactString(message) : JSON.stringify(redact(message));
    const extra = optional.length ? redact(optional.length === 1 ? optional[0] : optional) : undefined;
    const line = JSON.stringify({ time: new Date().toISOString(), level, context, message: text, ...(extra !== undefined ? { extra } : {}), env: process.env.APP_ENV });
    (level === 'error' || level === 'warn' ? process.stderr : process.stdout).write(`${line}\n`);
  }
  log(message: unknown, ...optional: unknown[]) { this.write('info', message, optional); }
  error(message: unknown, ...optional: unknown[]) { this.write('error', message, optional); }
  warn(message: unknown, ...optional: unknown[]) { this.write('warn', message, optional); }
  debug(message: unknown, ...optional: unknown[]) { this.write('debug', message, optional); }
  verbose(message: unknown, ...optional: unknown[]) { this.write('verbose', message, optional); }
  setLogLevels(_levels: LogLevel[]) { /* níveis fixos */ }
}
