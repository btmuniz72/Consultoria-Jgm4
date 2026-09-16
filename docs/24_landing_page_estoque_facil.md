# Landing page — JGM4 Estoque Fácil

Rota pública: `/produtos/estoque-facil/`

O formulário de interesse envia os dados para `produtos/estoque-facil/submit.php`.
O lead é validado e salvo primeiro no SQLite privado. Depois, o sistema tenta enviar o e-mail para a JGM4. Se o SMTP estiver indisponível ou falhar, o lead permanece salvo com status `EMAIL_FAILED`.

## Configuração de envio de e-mail

Copie `.env.example` para a configuração de ambiente do servidor e preencha:

| Variável | Uso |
| --- | --- |
| `SMTP_HOST` | Host do servidor SMTP. |
| `SMTP_PORT` | Porta SMTP; o exemplo usa `587`. |
| `SMTP_SECURE` | `false` para sem criptografia, `tls`/`starttls` para STARTTLS ou `ssl` para SMTPS. |
| `SMTP_USER` | Usuário da conta SMTP. |
| `SMTP_PASS` | Senha da conta SMTP; nunca deve ser versionada. |
| `SMTP_FROM` | Remetente, por exemplo `JGM4 Consultoria <contato@jgm4consultoria.com.br>`. |
| `LEADS_TO_EMAIL` | Destinatário dos interessados. Deve ser `contato@jgm4consultoria.com.br`. |
| `LEADS_DB_PATH` | Opcional; caminho absoluto para o SQLite, sempre fora do document root. |

O envio usa a biblioteca PHPMailer já presente em `vendor/`. Não há cobrança nem integração com Asaas neste fluxo.

## Estados do lead

- `NEW`: salvo, antes da tentativa de e-mail.
- `EMAIL_SENT`: e-mail enviado com sucesso; `emailSentAt` preenchido.
- `EMAIL_FAILED`: lead preservado, mas o e-mail não foi enviado; o motivo técnico fica apenas no log/status interno.

O honeypot `website` bloqueia submissões automatizadas sem criar lead.

## Teste local

1. Configure as variáveis no ambiente do PHP; não coloque senha no repositório.
2. Sirva a pasta do projeto com um servidor PHP configurado para executar `submit.php`.
3. Envie um cadastro válido pela seção `#interesse`.
4. Sem SMTP configurado, confira a resposta de sucesso e o log `SMTP não configurado. Lead salvo sem envio.`
5. Com SMTP configurado, confirme a mensagem recebida em `LEADS_TO_EMAIL` e o status `EMAIL_SENT` no SQLite privado.

O usuário nunca recebe credenciais SMTP, stack trace ou erro técnico.
