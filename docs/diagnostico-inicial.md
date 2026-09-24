# Pré-diagnóstico inicial JGM4

Rota: /diagnostico-inicial/

A página foi criada para leads que já fizeram uma primeira sondagem e têm reunião agendada. Ela não foi adicionada ao menu público, sitemap ou estrutura de SEO.

## Envio

O formulário envia JSON para diagnostico-inicial/submit.php, valida os dados no servidor, salva uma cópia em SQLite fora do document root e tenta enviar um e-mail legível para contato@jgm4consultoria.com.br. Se o SMTP falhar, o lead permanece salvo com status EMAIL_FAILED e o usuário ainda recebe uma confirmação neutra.

Usa as variáveis SMTP já adotadas pelo projeto:

| Variável | Finalidade |
| --- | --- |
| SMTP_HOST | Servidor SMTP |
| SMTP_PORT | Porta SMTP, normalmente 587 ou 465 |
| SMTP_SECURE | false, tls, starttls ou ssl |
| SMTP_USER | Usuário da conta de envio |
| SMTP_PASS | Senha da conta, nunca versionar |
| SMTP_FROM | Remetente, por exemplo JGM4 Consultoria <contato@jgm4consultoria.com.br> |
| LEADS_TO_EMAIL | Destinatário; padrão contato@jgm4consultoria.com.br |
| LEADS_DB_PATH | Opcional; caminho absoluto privado para o SQLite |

No cPanel, as mesmas variáveis podem ser fornecidas pelo arquivo privado ../jgm4-private/diagnostico-inicial-mail.php, fora de public_html, retornando um array PHP. A senha não deve ser colocada no repositório.

## Como testar

1. Publicar a pasta diagnostico-inicial/ com PHP habilitado.
2. Configurar SMTP no ambiente ou arquivo privado.
3. Abrir /diagnostico-inicial/, preencher o fluxo e enviar um teste.
4. Confirmar a mensagem em LEADS_TO_EMAIL e o retorno de sucesso na página.
5. Sem SMTP configurado, o teste ainda deve retornar sucesso controlado e registrar o lead como pendente no SQLite privado.
