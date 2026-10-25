# Plano de Continuidade e Recuperação — JGM4 Projects

## 1. Objetivos de recuperação
RPO (perda máxima de dados) e RTO (tempo máximo de indisponibilidade) são **decisão administrativa [DECISÃO JGM4]**; o sistema apenas permite cumprir o que for definido. Valores de partida sugeridos para um serviço de consultoria (a confirmar):

| Parâmetro | Sugestão | Como atender |
|---|---|---|
| RPO | 24 h | backup lógico diário (`npm run db:backup`); para RPO menor, ativar arquivamento contínuo (WAL/PITR) do provedor |
| RTO | 8 h úteis | restauração documentada e testada (`docs/backup-e-restore.md`) |

## 2. Ativos críticos
Banco PostgreSQL (dados de projetos, auditoria), armazenamento de anexos (`STORAGE_LOCAL_DIR` ou objeto), segredos (`JWT_SECRET`, `DATA_ENCRYPTION_KEY`, `BACKUP_ENCRYPTION_KEY`), código/build.

## 3. Cenários e resposta
| Cenário | Ação |
|---|---|
| API indisponível | `/api/health/live` e `/ready`; reiniciar processo; verificar logs e banco |
| Banco indisponível | Verificar provedor; restaurar o último backup válido em instância nova (`db:restore`), repontar `DATABASE_URL`, executar `prisma migrate deploy` |
| Corrupção/erro humano | Restaurar backup para banco **separado**, extrair o necessário, comparar e só então promover |
| Perda do armazenamento de anexos | Restaurar cópia do armazenamento (backup deve cobrir banco **e** anexos juntos) |
| Chave `DATA_ENCRYPTION_KEY` perdida | Segredos MFA ficam ilegíveis: reiniciar MFA dos usuários afetados; guardar a chave em cofre com cópia segura |
| Comprometimento de credenciais/segredos | Incidente: rotacionar `JWT_SECRET` (encerra todas as sessões), senhas, chaves; revisar `SecurityEvent` |
| Indisponibilidade do provedor | Reimplantar a partir do repositório + backup em outro provedor (ver §5) |

## 4. Backups
Diário, cifrado (AES-256-GCM), armazenado **fora** do servidor do banco, retenção sugerida 30 diários + 12 mensais **[DECISÃO JGM4]**, teste de restauração mensal. Detalhes em `docs/backup-e-restore.md`.

## 5. Reimplantação do zero
1. Provisionar PostgreSQL (TLS, usuário de mínimo privilégio) e servidor com HTTPS.
2. Configurar variáveis de ambiente (ver `.env.example`) a partir do cofre.
3. `npm ci && npm run build`; `prisma migrate deploy`.
4. Restaurar o backup (`db:restore`) ou, em ambiente novo, `npm run admin:bootstrap`.
5. Validar com `docs/checklist-producao.md` e `/api/health/ready`.

## 6. Papéis e contatos
Responsável técnico, responsável de segurança e contato de cada provedor **[DECISÃO JGM4]** — preencher na operação.

## 7. Testes
Teste de restauração mensal e simulação anual de incidente. Registrar data, resultado e tempo medido (RTO real). Último teste executado na Etapa 8: ver `docs/validacao-etapa-8.md`.
