# Arquitetura da Área do Cliente JGM4

## Experiência e URLs

A URL pública planejada é `https://www.jgm4consultoria.com.br/projetos/`, sujeita ao canonical do site. O menu principal da homepage institucional recebe “Área do Cliente” com destino `/projetos/`. O site permanece HTML estático e o `.htaccess` existente devolve 404 real para caminhos desconhecidos; a hospedagem deve encaminhar `/projetos/*` ao serviço Angular antes desse 404, por configuração do virtual host/reverse proxy. Nenhuma regra de hospedagem nem DNS foi alterada.

Todos os clientes usam o mesmo caminho, sem nomes de empresa, usuários ou e-mails nas URLs. A identidade e os projetos autorizados vêm da sessão e dos vínculos verificados pelo backend. Com um projeto, o login direciona ao painel apropriado; com vários, à carteira. A navegação de projeto oferece Visão Geral, Projeto, Atividades, Documentos, Proposta, Solicitações, Gates, Relatórios e Minha Conta conforme permissões. Administração JGM4 permanece protegida por guards Angular e backend.

A proposta permite leitura, dúvidas e aceite auditado. O aceite não formaliza contrato nem libera automaticamente o início. Após formalização autorizada, o painel mostra progresso, Gate, próxima ação, pendências, dependências, horas e solicitações. A tela Documentos lista anexos autorizados do projeto e permite baixar arquivos liberados pela verificação.

## Componentes e integração

- **Site institucional:** HTML estático, canonical atual `www`. Só a homepage recebe o link de menu; metadados, rotas, sitemap e conteúdo público permanecem intactos.
- **Frontend:** Angular compilado com `<base href="/projetos/">`; rotas, assets e chunks usam a base. Fallback SPA do Nest serve apenas `/projetos/*` e deixa outros caminhos ao site institucional.
- **API:** NestJS sob `/api`; proxy preserva ambos os prefixos sem removê-los. O frontend recebe o caminho da API pelo build.
- **Dados e arquivos:** PostgreSQL com migrations versionadas. Anexos ficam em armazenamento privado e são servidos somente após autorização da sessão, vínculo ao projeto e verificação de segurança.
- **E-mail:** SMTP autenticado é necessário para recuperação de senha e avisos.

O proxy conceitual é:

```text
https://www.jgm4consultoria.com.br/projetos[/...] ─┐
                                                   ├─ reverse proxy → JGM4 Projects
https://www.jgm4consultoria.com.br/api[/...] ──────┘
demais rotas ───────────────────────────────────────→ site institucional
```

Preservar os caminhos completos e encaminhar `Host` e `X-Forwarded-Proto` de forma confiável. Como os arquivos não revelam a configuração do servidor, o proxy precisa ser ajustado no virtual host; não se deve inserir uma regra presumida no `.htaccess`. Uma URL técnica pode apontar diretamente ao serviço para staging. Os exemplos em `deploy.md`, `railway-setup.md` e `deploy/Caddyfile.example` precisam de adaptação à hospedagem real.

## Configuração, sessão e segurança

Definir `PUBLIC_APP_URL` com a URL HTTPS completa da aplicação (incluindo `/projetos`), `PUBLIC_BASE_PATH=/projetos` e `API_BASE_PATH=/api`. O build Angular configura seu base href e endpoint; o backend usa a mesma configuração para servir o fallback, classificar respostas da API e escopar cookies. Cookies de sessão e refresh são HttpOnly, Secure sob HTTPS, SameSite Strict, com caminhos `/api` e `/api/auth`; o cookie CSRF usa `/`. O Angular envia cabeçalho CSRF nas operações mutáveis. Same-origin elimina CORS adicional.

O backend valida autenticação, função e vínculo com o projeto em cada endpoint. A rota `/projetos/admin` é protegida no frontend e os endpoints administrativos continuam negando clientes com 403. Respostas da Área do Cliente enviam `X-Robots-Tag: noindex, nofollow, noarchive` e o HTML contém meta robots equivalente. Isso não exige alterar nem bloquear o site público no `robots.txt`.

## Privacidade e termos

A página institucional existente `/pages/politica.html` é a fonte única de Política de Privacidade; login e rodapé da Área do Cliente apontam para ela. Não foi localizada uma página institucional de Termos de Uso. O link continua para `/projetos/terms`, cujo texto atual é provisório e contém campos a preencher; obter aprovação jurídica e publicar texto aprovado antes do go-live. Não publicar os placeholders como texto oficial.

## Ambientes e publicação

Staging pode usar `staging-projetos.jgm4consultoria.com.br` ou endereço técnico, com banco, segredos, cookies e contas separados e base path `/projetos`. Produção pretendida: `https://www.jgm4consultoria.com.br/projetos` e `/api` na mesma origem, TLS válido, banco gerenciado, armazenamento persistente e SMTP. A publicação requer configuração de reverse proxy no virtual host e validação no servidor real. Nenhum deploy, alteração DNS ou contratação foi realizado nesta etapa.
