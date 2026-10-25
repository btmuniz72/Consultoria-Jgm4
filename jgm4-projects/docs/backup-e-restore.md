# Backup e Restore — JGM4 Projects

## 1. O que é copiado
- **Banco PostgreSQL:** `npm run db:backup` gera um dump (`pg_dump`, formato custom) **cifrado com AES-256-GCM** (`BACKUP_ENCRYPTION_KEY`), com verificação de integridade (SHA-256 registrado).
- **Anexos:** a pasta/bucket de `STORAGE_LOCAL_DIR` precisa ser copiada junto (mesma janela), pois o banco guarda apenas os metadados.
- **Fora do backup (por segurança):** `.env`, segredos e chaves — ficam no cofre.

## 2. Gerar backup
```
BACKUP_ENCRYPTION_KEY=<32 bytes em hex ou base64> npm run db:backup [-- --out <pasta>]
```
Saída: `*.dump.enc` em `.local/backups` (ou `--out`). Em produção, enviar para armazenamento **separado** do servidor do banco, com retenção definida (sugestão: 30 diários + 12 mensais **[DECISÃO JGM4]**). A chave de backup é distinta da chave de dados e guardada em local diferente do arquivo.

## 3. Restaurar (e testar)
```
BACKUP_ENCRYPTION_KEY=... npm run db:restore -- --file <backup.dump.enc> --target <banco-de-destino> [--keep]
```
O script: decifra, cria o banco de destino, restaura, **compara a contagem de linhas de todas as tabelas** com o banco de origem e, sem `--keep`, remove o banco de teste. Recusa restaurar sobre o banco de origem (salvo `--force-overwrite` explícito). Chave errada falha na autenticação do AES-GCM — nenhum dado é restaurado.

Restauração real em produção:
1. Colocar a aplicação em manutenção.
2. Restaurar em banco **novo**, validar contagens e `/api/health/ready`.
3. Apontar `DATABASE_URL` para o novo banco; `prisma migrate deploy` (confirma o esquema).
4. Restaurar os anexos do mesmo ponto no tempo.
5. Reabrir; revisar `SecurityEvent` e registrar o incidente/ocorrência.

## 4. Resultado do teste executado (Etapa 8, ambiente local)
| Item | Resultado |
|---|---|
| Backup gerado | arquivo cifrado de 131.569 bytes |
| Restauração em banco novo | concluída |
| Comparação de tabelas | **14 tabelas conferidas, contagens idênticas** |
| Restauração com chave errada | **falhou** (autenticação AES-GCM), como esperado |
| Destino = origem | **recusado** |
| Limpeza do banco de teste | automática |

Este teste foi local. Um teste no ambiente de produção real (volume, tempo, armazenamento remoto) deve ser executado e registrado antes do go-live — ver `docs/checklist-producao.md`.

## 5. Rotina recomendada
| Frequência | Ação |
|---|---|
| Diária | `db:backup` + cópia dos anexos + envio externo |
| Semanal | Conferir tamanho/horário dos backups e alertas de falha |
| Mensal | Teste de restauração completo com registro do tempo (RTO real) |
| Trimestral | Revisar retenção, chaves e acesso ao repositório de backups |

## 6. Limites conhecidos
- Backup lógico diário implica RPO de até 24 h; para menos, usar arquivamento contínuo (WAL/PITR) do provedor de banco.
- O script depende de `pg_dump`/`pg_restore` na mesma versão major do servidor (`PG_BIN`).
- Retenção e envio externo são responsabilidade da operação (não automatizados por esta entrega).
