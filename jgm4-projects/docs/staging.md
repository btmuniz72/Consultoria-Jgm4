# Staging — JGM4 Projects

## Estado atual

Staging não está provisionado nem acessível. Em 2026-10-25, a consulta DNS para `staging-projetos.jgm4consultoria.com.br` retornou `NXDOMAIN`; não há host alternativo, servidor, banco, storage ou credenciais de staging disponíveis no workspace. Este documento é um roteiro de preparação, não evidência de ambiente publicado.

## Recursos e isolamento exigidos

- Host técnico com DNS e certificado TLS próprios, virtual host e `DocumentRoot` isolados da hospedagem institucional. Não herdar o canonical para `www.jgm4consultoria.com.br`.
- Serviço/container separado, porta do backend publicada somente em loopback ou rede privada, proxy restrito a `/projetos/` e `/api/`.
- PostgreSQL exclusivo de staging, TLS, rede de entrada restrita e credencial da aplicação com privilégios mínimos. Não reutilizar banco, usuário ou backups de produção.
- Aplicar somente migrations versionadas com `npm run db:migrate` (`prisma migrate deploy`). Conferir `npm run db:status`; não usar `prisma db push` em staging.
- Storage persistente e privado, sem servir arquivos diretamente como conteúdo público. Validar autorização por projeto, tamanho, tipo e varredura de arquivos conforme a política operacional.
- SMTP de teste/sink que capture mensagens ou limite destinatários a caixas controladas. Não enviar mensagens de homologação a clientes reais.
- Segredos em cofre ou mecanismo de secrets do host, nunca no Git, imagens, documentação ou logs. Usar credenciais independentes de produção.
- Backup e restore de staging independentes. Dados de teste exclusivamente fictícios; não importar dados de Ollem ou de clientes.

## Configuração esperada

Defina no ambiente do serviço os valores de acordo com o host que for aprovado; não copie segredos para `.env` versionado ou para este documento:

```text
NODE_ENV=production
APP_ENV=staging
PUBLIC_APP_URL=https://<host-staging>/projetos
PUBLIC_BASE_PATH=/projetos
API_BASE_PATH=/api
ALLOWED_ORIGINS=https://<host-staging>
TRUST_PROXY=1
DATABASE_URL=<secret-do-postgresql-de-staging>
STORAGE_PROVIDER=local
STORAGE_LOCAL_DIR=/data/storage
```

`TRUST_PROXY=1` só se aplica quando existe exatamente uma camada Apache confiável e o backend não pode ser acessado diretamente. Determine separadamente o provedor SMTP e suas credenciais conforme o `.env.example`; use endpoint de teste e remetente controlado. Monte `/data/storage` como volume privado persistente. Confirme os nomes de variáveis aceitos pela versão implantada antes de iniciar.

## Bootstrap e dados fictícios

Construa a aplicação pelo processo documentado e execute `npm run db:migrate`; confirme status limpo. Crie o primeiro administrador com `npm run admin:bootstrap` usando segredo temporário entregue pelo cofre, force troca de senha e configure MFA. Não habilite usuários ou projetos demo automáticos. Depois, pela interface administrativa, crie duas empresas fictícias independentes (Cliente A e Cliente B), um projeto fictício para cada, usuários com memberships separados e arquivos sem conteúdo pessoal. Registre apenas IDs de teste não sensíveis na evidência de homologação.

## Saída para homologação

Só considere staging disponível quando DNS, TLS, proxy, banco, migrations, storage, SMTP de teste, bootstrap administrativo, logs e backup estiverem verificados. Execute primeiro `npm run smoke:external` contra a origem aprovada e depois a matriz em [homologacao-etapa-9b-3.md](homologacao-etapa-9b-3.md). Não altere DNS ou publique em produção como parte da preparação desta etapa.
