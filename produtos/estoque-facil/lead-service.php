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
        status TEXT NOT NULL, consentText TEXT NOT NULL, createdAt TEXT NOT NULL
    )');
    $db->exec('CREATE INDEX IF NOT EXISTS lead_status_created ON LeadInterest(status, createdAt)');
    return $db;
}

function saveLead(array $data): string {
    $db = leadDatabase();
    $id = bin2hex(random_bytes(16));
    $record = array_merge($data, ['id' => $id, 'source' => 'site-jgm4/estoque-facil', 'status' => 'PENDING_EMAIL', 'consentText' => LEAD_CONSENT, 'createdAt' => gmdate('c')]);
    $keys = array_keys($record);
    $db->prepare('INSERT INTO LeadInterest (' . implode(', ', $keys) . ') VALUES (:' . implode(', :', $keys) . ')')->execute($record);
    // The lead is durable before SMTP. No checkout, user account or subscription is created.
    $password = getenv('SMTP_PASS') ?: getenv('SMTP_PASSWORD');
    if (!getenv('SMTP_HOST') || !getenv('SMTP_USER') || !$password || !getenv('SMTP_FROM')) return 'pending';
    try {
        $vendor = dirname(__DIR__, 2) . '/vendor/src/';
        require_once $vendor . 'Exception.php';
        require_once $vendor . 'PHPMailer.php';
        require_once $vendor . 'SMTP.php';
        $mail = new PHPMailer\PHPMailer\PHPMailer(true);
        $mail->isSMTP();
        $mail->Host = getenv('SMTP_HOST');
        $mail->Port = (int)(getenv('SMTP_PORT') ?: 587);
        $mail->SMTPAuth = true;
        $mail->Username = getenv('SMTP_USER');
        $mail->Password = $password;
        $mail->SMTPSecure = $mail->Port === 465 ? 'ssl' : 'tls';
        $mail->Timeout = 10;
        $mail->Timelimit = 15;
        $mail->CharSet = 'UTF-8';
        $from = getenv('SMTP_FROM');
        if (preg_match('/^(.+)\s*<([^>]+)>$/', $from, $parts)) $mail->setFrom(trim($parts[2]), trim($parts[1]));
        else $mail->setFrom($from, 'JGM4 Estoque Fácil');
        $mail->addAddress(getenv('LEADS_TO_EMAIL') ?: 'contato@jgm4consultoria.com.br');
        $mail->addReplyTo($data['email']);
        $mail->Subject = 'Novo interessado — JGM4 Estoque Fácil';
        $labels = ['name' => 'Nome', 'company' => 'Empresa', 'email' => 'E-mail', 'phone' => 'Telefone/WhatsApp', 'cityState' => 'Cidade/Estado', 'businessType' => 'Tipo de negócio', 'skuRange' => 'Quantidade aproximada de SKUs', 'currentControl' => 'Controle atual', 'message' => 'Mensagem'];
        $lines = [];
        foreach ($labels as $key => $label) $lines[] = $label . ': ' . $data[$key];
        $mail->Body = implode("\n", $lines) . "\n\n" . LEAD_CONSENT;
        $mail->isHTML(false);
        $mail->send();
        $db->prepare('UPDATE LeadInterest SET status = ? WHERE id = ?')->execute(['EMAIL_SENT', $id]);
        return 'sent';
    } catch (Throwable $error) {
        // Pending leads remain available to authorized staff; never expose SMTP details or PII.
        return 'pending';
    }
}
