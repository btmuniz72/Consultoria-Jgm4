import { connect } from 'node:net';

// Gancho de antimalware desacoplado. Padrão: sem verificação (SKIPPED). Com CLAMAV_HOST, usa o ClamAV (protocolo INSTREAM do clamd).
// Com SCAN_REQUIRED=true (padrão em produção) somente arquivos CLEAN podem ser baixados; suspeito/erro nunca é liberado automaticamente.
export type ScanResult = { status: 'CLEAN' | 'INFECTED' | 'ERROR' | 'SKIPPED'; detail?: string };
export interface MalwareScanner { scan(data: Buffer, fileName: string): Promise<ScanResult> }
export const MALWARE_SCANNER = Symbol('MALWARE_SCANNER');
export const scanRequired = () => (process.env.SCAN_REQUIRED ?? (process.env.NODE_ENV === 'production' ? 'true' : 'false')) === 'true';

export class NoopScanner implements MalwareScanner { async scan(): Promise<ScanResult> { return { status: 'SKIPPED', detail: 'Sem scanner configurado.' }; } }

export class ClamAvScanner implements MalwareScanner {
  constructor(private readonly host = process.env.CLAMAV_HOST!, private readonly port = Number(process.env.CLAMAV_PORT ?? 3310), private readonly timeoutMs = 15000) {}
  scan(data: Buffer): Promise<ScanResult> {
    return new Promise((resolve) => {
      const socket = connect({ host: this.host, port: this.port }); let response = ''; let settled = false;
      const done = (result: ScanResult) => { if (!settled) { settled = true; socket.destroy(); resolve(result); } };
      socket.setTimeout(this.timeoutMs, () => done({ status: 'ERROR', detail: 'Tempo esgotado no scanner.' }));
      socket.on('error', () => done({ status: 'ERROR', detail: 'Scanner indisponível.' }));
      socket.on('data', (chunk) => { response += chunk.toString(); });
      socket.on('end', () => done(/FOUND/.test(response) ? { status: 'INFECTED', detail: response.replace(/^stream:\s*/, '').replace(/\s*FOUND.*/s, '').slice(0, 120) } : /OK/.test(response) ? { status: 'CLEAN' } : { status: 'ERROR', detail: 'Resposta inesperada do scanner.' }));
      socket.on('connect', () => {
        socket.write('zINSTREAM\0');
        for (let offset = 0; offset < data.length; offset += 65536) { const part = data.subarray(offset, offset + 65536); const size = Buffer.alloc(4); size.writeUInt32BE(part.length); socket.write(size); socket.write(part); }
        socket.write(Buffer.alloc(4));
      });
    });
  }
}
export const createScanner = (): MalwareScanner => (process.env.CLAMAV_HOST ? new ClamAvScanner() : new NoopScanner());
