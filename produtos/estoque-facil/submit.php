<?php
declare(strict_types=1);
ini_set('display_errors', '0');
require_once __DIR__ . '/lead-service.php';

function respondLead(int $status, string $message, string $delivery = ''): never {
    http_response_code($status);
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    if (str_contains($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json')) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['message' => $message, 'delivery' => $delivery], JSON_UNESCAPED_UNICODE);
    } else {
        header('Content-Type: text/html; charset=utf-8');
        $safe = htmlspecialchars($message, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $title = $status < 300 ? 'Cadastro recebido' : 'Confira seu cadastro';
        $pending = $delivery === 'pending' ? '<p>Seu interesse está salvo com segurança. A notificação por e-mail está pendente.</p>' : '';
        echo '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>' . $title . ' | JGM4</title><link rel="stylesheet" href="./landing.css?v=20260913-1"></head><body class="stock-landing"><main class="landing-container landing-section"><h1>' . $title . '</h1><p>' . $safe . '</p>' . $pending . '<a class="landing-cta" href="./#interesse">Voltar ao Estoque Fácil</a></main></body></html>';
    }
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { header('Allow: POST'); respondLead(405, LEAD_ERROR); }
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && strtolower((string)parse_url($origin, PHP_URL_HOST) . (parse_url($origin, PHP_URL_PORT) ? ':' . parse_url($origin, PHP_URL_PORT) : '')) !== strtolower($_SERVER['HTTP_HOST'] ?? '')) respondLead(403, LEAD_ERROR);
if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 16384) respondLead(413, LEAD_ERROR);
$raw = file_get_contents('php://input', false, null, 0, 16385);
if ($raw === false || strlen($raw) > 16384) respondLead(413, LEAD_ERROR);
$type = strtolower(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0]);
if ($type === 'application/json') $input = json_decode($raw, true);
elseif ($type === 'application/x-www-form-urlencoded') { parse_str($raw, $input); }
else respondLead(415, LEAD_ERROR);
if (!is_array($input) || array_is_list($input)) respondLead(400, LEAD_ERROR);
if (isset($input['website']) && is_string($input['website']) && trim($input['website']) !== '') respondLead(201, LEAD_SUCCESS, 'pending');
try { $data = validateLead($input); }
catch (InvalidArgumentException $error) { respondLead(400, 'Revise os campos obrigatórios antes de enviar.'); }
try { $delivery = saveLead($data); }
catch (Throwable $error) { respondLead(503, LEAD_ERROR); }
respondLead(201, LEAD_SUCCESS, $delivery);
