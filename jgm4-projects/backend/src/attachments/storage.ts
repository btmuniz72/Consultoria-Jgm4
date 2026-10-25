import { promises as fs } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';

/** Armazenamento de anexos desacoplado do fornecedor: `local` em desenvolvimento; em produção, um adaptador de object storage implementa a mesma interface. */
export interface StorageProvider { put(key: string, data: Buffer): Promise<void>; get(key: string): Promise<Buffer>; exists(key: string): Promise<boolean>; remove(key: string): Promise<void> }
export const STORAGE = Symbol('STORAGE_PROVIDER');

export class LocalStorageProvider implements StorageProvider {
  private readonly root: string;
  // Diretório privado (nunca servido como estático). O padrão fica na pasta .local, ignorada pelo Git.
  constructor(root = process.env.STORAGE_LOCAL_DIR ?? resolve(process.cwd(), '../.local/storage')) { this.root = resolve(root); }
  /** A chave é gerada pelo servidor; ainda assim, impede qualquer caminho fora da raiz. */
  private path(key: string) {
    const target = resolve(this.root, key);
    if (!target.startsWith(this.root + sep)) throw new Error('Chave de armazenamento inválida.');
    return target;
  }
  async put(key: string, data: Buffer) { const path = this.path(key); await fs.mkdir(dirname(path), { recursive: true, mode: 0o700 }); await fs.writeFile(path, data, { mode: 0o600, flag: 'wx' }); }
  get(key: string) { return fs.readFile(this.path(key)); }
  async exists(key: string) { try { await fs.access(this.path(key)); return true; } catch { return false; } }
  async remove(key: string) { await fs.rm(this.path(key), { force: true }); }
}

export function createStorage(): StorageProvider {
  const provider = process.env.STORAGE_PROVIDER ?? 'local';
  if (provider === 'local') return new LocalStorageProvider();
  throw new Error(`STORAGE_PROVIDER "${provider}" não implementado: adicione um adaptador que implemente StorageProvider.`);
}
