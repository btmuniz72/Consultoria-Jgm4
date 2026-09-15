<?php
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: analise.html');
    exit;
}

// ================= CONFIGURAÇÕES =================
$email_principal = 'contato@jgm4consultoria.com.br';

$email_cliente = filter_input(INPUT_POST, 'Email', FILTER_VALIDATE_EMAIL);

$assunto = 'Resultado do Diagnóstico Logístico | JGM4';

// ================= DADOS =================
// ================= DADOS =================
$nome          = $_POST['Nome_Completo'] ?? '';
$empresa       = $_POST['Empresa'] ?? '';
$iml           = $_POST['Pontuacao_Total'] ?? '';
$nivel         = $_POST['Nivel_Maturidade'] ?? '';
$desc     = $_POST['Descricao'] ?? ''; // Chave corrigida para bater com o 'name' do HTML
$prox = $_POST['Proximo_passo'] ?? ''; // Chave corrigida para bater com o 'name' do HTML

function e($value) {
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

$nome_safe = e($nome);
$empresa_safe = e($empresa);
$iml_safe = e($iml);
$nivel_safe = nl2br(e($nivel));
$desc_safe = nl2br(e($desc));
$prox_safe = nl2br(e($prox));


// ================= EMAIL HTML =================
$mensagem = "
<html>
<head>
  <meta charset='UTF-8'>
</head>
<body style='font-family: Arial, sans-serif; background:#f4f6f8; padding:20px;'>

  <div style='max-width:600px; margin:auto; background:#ffffff; padding:30px; border-radius:8px;'>

    <img src='https://www.jgm4consultoria.com.br/assets/brand/logo-jgm4-horizontal-nova.png'
         alt='JGM4 Consultoria Logística'
         width='1536'
         height='1024'
         style='display:block; width:180px; max-width:100%; height:auto; margin-bottom:20px;'>

    <h2 style='color:#1e90ff;'>Diagnóstico Logístico – JGM4</h2>

    <p>Olá <strong>{$nome_safe}</strong>,</p>

    <p>
      Conforme suas respostas ao <strong>Questionário de Análise Logística</strong>,
      avaliamos o nível de maturidade da operação da empresa <strong>{$empresa_safe}</strong>.
    </p>

    <div style='background:#f1f7ff; padding:20px; border-left:5px solid #1e90ff; margin:25px 0;'>
      <p style='margin:0; font-size:18px;'><strong>Índice de Maturidade Logística (IML)</strong></p>
      <p style='font-size:32px; margin:10px 0; color:#1e90ff;'><strong>{$iml_safe}/100</strong></p>
      <p style='margin:0;'><strong>Enquadramento:</strong><br>{$nivel_safe}</p>
    </div>

    <p>
      Esse diagnóstico inicial indica oportunidades relevantes de melhoria em processos,
      gestão, tecnologia e integração logística.
    </p>

    <p>{$desc_safe}</p>

    <p>{$prox_safe}</p>

    <p>
      Nossa equipe pode apresentar um plano prático para elevar o desempenho logístico
      e reduzir custos operacionais.
    </p>

    <div style='text-align:center; margin-top:30px;'>
      <a href='https://www.jgm4consultoria.com.br/#contato'
         style='background:#ff3333; color:#fff; padding:14px 28px;
                text-decoration:none; border-radius:5px; font-weight:bold;'>
        Falar com um Consultor
      </a>
    </div>

    <p style='margin-top:40px; font-size:13px; color:#666;'>
      JGM4 Consultoria Logística<br>
      Diagnóstico estratégico para decisões inteligentes
    </p>

  </div>

</body>
</html>
";

// ================= CABEÇALHOS =================
$headers  = "From: JGM4 Diagnóstico <no-reply@jgm4consultoria.com.br>\r\n";
$headers .= "Reply-To: contato@jgm4consultoria.com.br\r\n";
$headers .= "MIME-Version: 1.0\r\n";
$headers .= "Content-Type: text/html; charset=UTF-8\r\n";

if ($email_cliente) {
    $headers .= "Bcc: " . $email_cliente . "\r\n";
}

// ================= ENVIO =================
$enviado = mail($email_principal, $assunto, $mensagem, $headers);

if ($enviado) {
    header('Location: obrigado.html');
} else {
    echo "Erro ao enviar o diagnóstico. Tente novamente mais tarde.";
}

exit;
