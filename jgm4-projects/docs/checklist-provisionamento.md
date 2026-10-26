# Checklist de provisionamento e acessos (Etapa 9B.3B)

Roteiro do que falta antes de existir staging. Nada aqui foi executado. **Nunca** registre senhas, tokens, chaves ou conteúdo de `.env` neste repositório: acessos são concedidos no próprio provedor e os segredos vão para o cofre. Decisão arquitetural em [arquitetura-producao.md](arquitetura-producao.md); levantamento em [infraestrutura-atual.md](infraestrutura-atual.md).

## 1. Acessos e informações a obter (antes do deploy)

| Item | Para quê | Quem fornece | Obtido? |
|---|---|---|---|
| Plano exato do HostGator e acesso ao painel | Confirmar o tipo de hospedagem, versão do PHP e módulos do Apache | Titular da conta | Não |
| Resposta do suporte: `mod_proxy`/`[P]` para host externo em `.htaccess`? Node persistente? PostgreSQL? | Define se o Cenário B funciona sem alterar DNS | Suporte HostGator | Não |
| Acesso de leitura ao `.htaccess` e ao `DocumentRoot` (já há FTPS) | Aplicar proxy e fallback; conferir pastas não públicas | Titular (FTPS existente) | Parcial (FTPS) |
| Acesso ao DNS (painel HostGator ou registrador) | Só se for necessário criar um host técnico de staging ou aplicar a contingência B′ | Titular | Não |
| Titular do registro do domínio e e-mail de contato | Continuidade e renovação | Titular | Não |
| SSH ao servidor atual, se existir | Verificar módulos e logs; não é pré-requisito | Titular | NÃO IDENTIFICADO |
| Conta no provedor do backend (a escolher) | Contêiner, volume e rede | Titular, **após** a escolha comercial | Não |
| Instância PostgreSQL de **staging** e outra de **produção** | Bancos separados, TLS | Idem | Não |
| Dados SMTP do sistema (host, porta, usuário de **caixa exclusiva**, limites) | Convites e redefinição de senha | Titular (Titan) | Não |
| Seletor DKIM e criação de DMARC | Entregabilidade e anti-falsificação | Titular (DNS) | Não |
| Cofre de segredos | `JWT_SECRET`, `DATA_ENCRYPTION_KEY`, `BACKUP_ENCRYPTION_KEY`, `DATABASE_URL`, `SMTP_PASSWORD` | Responsável pelo provedor | Não |
| Destino externo dos backups e política de retenção | `db:backup` + storage | Decisão JGM4 | Não |
| Contato oficial de privacidade (`PRIVACY_CONTACT_EMAIL`) e texto jurídico dos Termos | Pendência de go-live | JGM4/jurídico | Não |

Forma de entrega: acesso nominal e revogável no painel do provedor (ou usuário com privilégio mínimo), ou configuração feita por quem detém o acesso. Os segredos nunca passam por chat, e-mail, issue ou commit.

## 2. Ordem recomendada

1. **Perguntas ao suporte do HostGator** (sem custo): proxy externo, Node, PostgreSQL, renovação do certificado wildcard, o que explica HEAD 200 × GET 404 em URLs inexistentes.
2. **Publicar o `.htaccess` já commitado** (redirects de `/web/cursos.html` e `/produtos/doca-certa/`, correção do Search Console), pelo processo FTPS atual. Independente da Área do Cliente.
3. **Prova do proxy** (só com autorização): em staging, uma rota de teste que encaminhe para um endpoint inofensivo e confirme `X-Forwarded-Proto`, TLS HostGator→backend e ausência de cache do nginx. Se falhar, decidir entre B′, A′ ou C.
4. **Escolher o provedor do backend** com base nos requisitos de [arquitetura-producao.md](arquitetura-producao.md) (item 1), não antes.
5. **Provisionar staging**: serviço (Node 24 / imagem do `Dockerfile`), volume privado persistente, PostgreSQL próprio com TLS, ClamAV, SMTP de teste, segredos no cofre, host técnico com o mesmo roteamento `/`, `/projetos/`, `/api/`.
6. `npm run db:migrate`, `npm run db:status` e `admin:bootstrap` (senha temporária do cofre, MFA obrigatório).
7. `npm run smoke:external` e o roteiro Site-First de [homologacao-etapa-9b-3.md](homologacao-etapa-9b-3.md), partindo da homepage.
8. Backup e restore **testados no staging**, com o tempo medido.
9. Só então repetir para produção, com banco, segredos, storage e SMTP próprios; DNS ou proxy de produção apenas com autorização e janela definidas.

## 3. Critérios de pronto do staging

DNS e TLS válidos · proxy `/api` e `/projetos/` confirmado, sem sobrescrever os cabeçalhos da aplicação nem armazenar respostas autenticadas · banco com TLS e usuário mínimo · migrations sem pendências · storage persistente e privado · antimalware ativo · SMTP de teste · administrador criado com MFA · logs sem dado pessoal · backup e restore testados · cookies `Secure`/`HttpOnly`/`SameSite=Strict` host-only · rota pública inexistente com 404 institucional.

## 4. Segurança operacional (resumo)

Firewall expondo só 80/443; backend e banco em rede privada ou loopback · SSH somente por chave, sem root e sem senha · usuário Linux sem privilégios para o processo · segredos fora do Git e fora das imagens · rotação documentada de chaves · atualizações periódicas do sistema, da imagem Node e das dependências (`npm audit --omit=dev`) · monitoramento de `/api/health/ready`, do vencimento do certificado (2026-12-07 para o atual) e de falhas de backup.

## 5. Não fazer nesta etapa

Contratar serviços, alterar DNS, criar usuários reais, enviar e-mail real, habilitar cobrança, publicar produção, cadastrar a Ollem real, iniciar as Etapas 10B ou 12.
