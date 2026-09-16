<?php
declare(strict_types=1);

const LEAD_SUCCESS = 'Recebemos seu cadastro. A equipe da JGM4 entrará em contato com informações sobre o lançamento do JGM4 Estoque Fácil.';
const LEAD_ERROR = 'Não foi possível enviar seu cadastro agora. Tente novamente em alguns instantes ou envie um e-mail para contato@jgm4consultoria.com.br.';
const LEAD_CONSENT = 'Ao enviar, você concorda que a JGM4 Consultoria utilize seus dados para entrar em contato sobre o JGM4 Estoque Fácil.';

function validateLead(array $input): array {
    $limits = ['name' => 120, 'company' => 160, 'email' => 254, 'phone' => 30, 'cityState' => 120, 'businessType' => 60, 'skuRange' => 40, 'currentControl' => 60, 'message' => 2000, 'website' => 0];
    $data = [];
    foreach ($limits as $key => $max) {
        $value = $input[$key] ?? '';
        if (!is_string($value) || preg_match('//u', $value) !== 1) throw new InvalidArgumentException('Invalid text');
        $value = trim($value);
        $length = preg_match_all('/./us', $value);
        if ($length === false || $length > $max || preg_match('/[<>\x00-\x08\x0b-\x1f\x7f]/', $value) || ($key !== 'message' && preg_match('/[\r\n]/', $value))) throw new InvalidArgumentException('Invalid text');
        $data[$key] = $value;
    }
    if ($data['website'] !== '') throw new InvalidArgumentException('Spam detected');
    if (preg_match_all('/./us', $data['name']) < 2 || preg_match_all('/./us', $data['company']) < 2 || !filter_var($data['email'], FILTER_VALIDATE_EMAIL)) throw new InvalidArgumentException('Required fields');
    $digits = preg_replace('/\D/', '', $data['phone']);
    if (!preg_match('/^[+()\d\s.-]+$/', $data['phone']) || strlen($digits) < 10 || strlen($digits) > 15) throw new InvalidArgumentException('Invalid phone');
    $options = [
        'businessType' => ['', 'Loja', 'Distribuidora', 'E-commerce', 'Almoxarifado', 'Pequeno CD', 'Indústria', 'Assistência técnica', 'Outro'],
        'skuRange' => ['', 'Até 100', '101 a 500', '501 a 1.000', '1.001 a 5.000', 'Acima de 5.000', 'Ainda não sei'],
        'currentControl' => ['', 'Planilha', 'Sistema simples', 'ERP', 'Caderno/manual', 'WhatsApp', 'Não tenho controle estruturado', 'Outro'],
    ];
    foreach ($options as $key => $allowed) if (!in_array($data[$key], $allowed, true)) throw new InvalidArgumentException('Invalid option');
    unset($data['website']);
    $data['email'] = strtolower($data['email']);
    return $data;
}

function leadDatabase(): PDO {
    $siteRoot = realpath(dirname(__DIR__, 2));
    $path = getenv('LEADS_DB_PATH') ?: dirname($siteRoot) . '/jgm4-private/estoque-facil.sqlite';
    if (!preg_match('~^(?:[A-Za-z]:[\\\\/]|/)~', $path)) throw new RuntimeException('Absolute private path required');
    $directory = dirname($path);
    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) throw new RuntimeException('Storage unavailable');
    $resolved = realpath($directory);
    if (!$resolved || is_link($path)) throw new RuntimeException('Invalid storage path');
    foreach ([$siteRoot, realpath($_SERVER['DOCUMENT_ROOT'] ?? '')] as $publicRoot) {
        if (!$publicRoot) continue;
        $public = strtolower(str_replace('\\', '/', $publicRoot));
        $private = strtolower(str_replace('\\', '/', $resolved));
        if ($private === $public || str_starts_with($private . '/', rtrim($public, '/') . '/')) throw new RuntimeException('Storage must be outside document root');
    }
    $db = new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    @chmod($path, 0600);
    $db->exec('PRAGMA busy_timeout = 5000');
    $db->exec('CREATE TABLE IF NOT EXISTS LeadInterest (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, company TEXT NOT NULL, email TEXT NOT NULL,
        phone TEXT NOT NULL, cityState TEXT NOT NULL, businessType TEXT NOT NULL, skuRange TEXT NOT NULL,
        currentControl TEXT NOT NULL, message TEXT NOT NULL, source TEXT NOT NULL,
        status TEXT NOT NULL, consentText TEXT NOT NULL, createdAt TEXT NOT NULL,
        emailSentAt TEXT, emailError TEXT
    )');
    $columns = $db->query('PRAGMA table_info(LeadInterest)')->fetchAll(PDO::FETCH_COLUMN, 1);
    if (!in_array('emailSentAt', $columns, true)) $db->exec('ALTER TABLE LeadInterest ADD COLUMN emailSentAt TEXT');
    if (!in_array('emailError', $columns, true)) $db->exec('ALTER TABLE LeadInterest ADD COLUMN emailError TEXT');
    $db->exec('CREATE INDEX IF NOT EXISTS lead_status_created ON LeadInterest(status, createdAt)');
    return $db;
}

function leadLog(string $message): void {
    error_log('[estoque-facil] ' . $message);
}

function smtpConfiguration(): array {
    $host = trim((string)(getenv('SMTP_HOST') ?: ''));
    $user = trim((string)(getenv('SMTP_USER') ?: ''));
    $password = (string)(getenv('SMTP_PASS') ?: getenv('SMTP_PASSWORD') ?: '');
    $from = trim((string)(getenv('SMTP_FROM') ?: ''));
    return [$host, $user, $password, $from];
}

function sendLeadInterestEmail(array $lead): void {
    [$host, $user, $password, $from] = smtpConfiguration();
    if ($host === '' || $user === '' || $password === '' || $from === '') {
        throw new RuntimeException('SMTP não configurado');
    }

    $vendor = dirname(__DIR__, 2) . '/vendor/src/';
    require_once $vendor . 'Exception.php';
    require_once $vendor . 'PHPMailer.php';
    require_once $vendor . 'SMTP.php';

    $mail = new PHPMailer\PHPMailer\PHPMailer(true);
    $mail->isSMTP();
    $mail->Host = $host;
    $mail->Port = (int)(getenv('SMTP_PORT') ?: 587);
    $mail->SMTPAuth = true;
    $mail->Username = $user;
    $mail->Password = $password;
    $secure = strtolower(trim((string)(getenv('SMTP_SECURE') ?: 'false')));
    $mail->SMTPSecure = ($secure === 'ssl' || $mail->Port === 465)
        ? PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS
        : (($secure === 'tls' || $secure === 'starttls' || $secure === 'true' || $secure === '1')
            ? PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS
            : false);
    $mail->Timeout = 10;
    $mail->Timelimit = 15;
    $mail->CharSet = 'UTF-8';
    if (preg_match('/^(.+)\s*<([^>]+)>$/', $from, $parts)) $mail->setFrom(trim($parts[2]), trim($parts[1]));
    else $mail->setFrom($from, 'JGM4 Estoque Fácil');
    $mail->addAddress(getenv('LEADS_TO_EMAIL') ?: 'contato@jgm4consultoria.com.br');
    $mail->addReplyTo($lead['email']);
    $mail->Subject = 'Novo interessado — JGM4 Estoque Fácil';
    $labels = [
        'name' => 'Nome', 'company' => 'Empresa', 'email' => 'E-mail',
        'phone' => 'Telefone/WhatsApp', 'cityState' => 'Cidade/Estado',
        'businessType' => 'Tipo de negócio', 'skuRange' => 'Quantidade aproximada de SKUs',
        'currentControl' => 'Controle atual', 'message' => 'Mensagem',
    ];
    $lines = ['Novo interessado no JGM4 Estoque Fácil', ''];
    foreach ($labels as $key => $label) $lines[] = $label . ': ' . ($lead[$key] ?? '');
    $lines[] = '';
    $lines[] = 'Origem: ' . ($lead['source'] ?? 'site-jgm4/estoque-facil');
    $lines[] = 'Data/hora: ' . ($lead['createdAt'] ?? gmdate('c'));
    $mail->Body = implode("\n", $lines);
    $mail->isHTML(false);
    $mail->send();
}

function saveLead(array $data): string {
    $db = leadDatabase();
    $id = bin2hex(random_bytes(16));
    $record = array_merge($data, ['id' => $id, 'source' => 'site-jgm4/estoque-facil', 'status' => 'NEW', 'consentText' => LEAD_CONSENT, 'createdAt' => gmdate('c')]);
    $keys = array_keys($record);
    $db->prepare('INSERT INTO LeadInterest (' . implode(', ', $keys) . ') VALUES (:' . implode(', :', $keys) . ')')->execute($record);
    // The lead is durable before SMTP. No checkout, user account or subscription is created.
    [$host, $user, $password, $from] = smtpConfiguration();
    if ($host === '' || $user === '' || $password === '' || $from === '') {
        $db->prepare('UPDATE LeadInterest SET status = ?, emailError = ? WHERE id = ?')->execute(['EMAIL_FAILED', 'SMTP não configurado', $id]);
        leadLog('SMTP não configurado. Lead salvo sem envio. lead_id=' . $id);
        return 'pending';
    }
    try {
        leadLog('Tentativa de envio de e-mail. lead_id=' . $id);
        sendLeadInterestEmail($record);
        $db->prepare('UPDATE LeadInterest SET status = ?, emailSentAt = ?, emailError = NULL WHERE id = ?')->execute(['EMAIL_SENT', gmdate('c'), $id]);
        leadLog('E-mail enviado. lead_id=' . $id);
        return 'sent';
    } catch (Throwable $error) {
        $db->prepare('UPDATE LeadInterest SET status = ?, emailError = ? WHERE id = ?')->execute(['EMAIL_FAILED', 'Falha no envio SMTP', $id]);
        leadLog('Falha no envio de e-mail; lead preservado. lead_id=' . $id . ' erro=' . get_class($error));
        return 'pending';
    }
}
