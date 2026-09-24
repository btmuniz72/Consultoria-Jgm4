<?php
declare(strict_types=1);
ini_set('display_errors', '0');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Content-Type: application/json; charset=utf-8');

const DI_TO = 'contato@jgm4consultoria.com.br';
const DI_ERROR = 'Não foi possível receber suas informações agora. Tente novamente em alguns instantes.';
const DI_CONSENT = 'Autorização para uso das informações exclusivamente para análise da solicitação, contato, preparação da reunião ou eventual proposta comercial, conforme a Política de Privacidade.';

function diRespond(int $status, string $message, array $extra = []): never {
    http_response_code($status);
    echo json_encode(array_merge(['message' => $message], $extra), JSON_UNESCAPED_UNICODE);
    exit;
}
function diText(mixed $value, int $max): string {
    if (!is_string($value) || preg_match('//u', $value) !== 1) throw new InvalidArgumentException();
    $value = trim($value);
    if (preg_match_all('/./us', $value) > $max || preg_match('/[<>\x00-\x08\x0b-\x1f\x7f]/', $value) || preg_match('/[\r\n]/', $value)) throw new InvalidArgumentException();
    return $value;
}
function diList(mixed $value, array $allowed): array {
    if (!is_array($value) || count($value) > 12) throw new InvalidArgumentException();
    $out = [];
    foreach ($value as $item) { $item = diText($item, 100); if (!in_array($item, $allowed, true)) throw new InvalidArgumentException(); $out[] = $item; }
    return array_values(array_unique($out));
}
function diConfig(string $name, string $default = ''): string {
    $value = getenv($name);
    if ($value !== false && $value !== '') return (string) $value;
    static $config = null;
    if ($config === null) {
        $root = realpath(dirname(__DIR__)) ?: dirname(__DIR__);
        $privateRoot = dirname($root) . '/jgm4-private';
        $path = $privateRoot . '/estoque-facil-mail.php';
        if (!is_file($path)) $path = $privateRoot . '/diagnostico-inicial-mail.php';
        $loaded = is_file($path) ? require $path : [];
        $config = is_array($loaded) ? $loaded : [];
    }
    return isset($config[$name]) ? (string) $config[$name] : $default;
}
function diData(array $input): array {
    $data = [];
    foreach (['name'=>120,'company'=>160,'role'=>100,'email'=>254,'phone'=>30,'reason_other'=>180,'company_moment'=>180,'challenge'=>700,'operation_people'=>20,'operation_units'=>20,'cost_focus'=>100,'cost_range'=>80,'sku_range'=>50,'stock_focus'=>100,'delivery_model'=>60,'transport_focus'=>100,'system_situation'=>100,'current_systems'=>180,'dc_focus'=>100,'dc_area'=>80,'management_focus'=>100,'urgency'=>80,'important_date'=>180,'expectation'=>600] as $key => $max) $data[$key] = diText($input[$key] ?? '', $max);
    $data['main_reason'] = diText($input['main_reason'] ?? '', 100);
    $data['impacts'] = diList($input['impacts'] ?? [], ['Aumento de custos','Atrasos','Retrabalho','Perdas ou avarias','Problemas de estoque','Reclamações de clientes','Baixa produtividade','Excesso de horas extras','Dificuldade de gestão','Problemas com sistemas','Ainda não conseguimos medir','Outro']);
    $data['general_areas'] = diList($input['general_areas'] ?? [], ['Pessoas','Processos','Sistemas','Estoque','Transportes','Custos','Infraestrutura','Gestão','Não sabemos identificar']);
    $data['consent'] = ($input['consent'] ?? '') === '1';
    if ($data['name']==='' || $data['company']==='' || !filter_var($data['email'], FILTER_VALIDATE_EMAIL) || $data['phone']==='' || $data['main_reason']==='' || $data['company_moment']==='' || $data['challenge']==='' || $data['urgency']==='' || $data['expectation']==='' || !$data['consent']) throw new InvalidArgumentException();
    $digits = preg_replace('/\D/', '', $data['phone']);
    if (!preg_match('/^[+()\d\s.-]+$/', $data['phone']) || strlen($digits)<10 || strlen($digits)>15) throw new InvalidArgumentException();
    $data['email'] = strtolower($data['email']);
    return $data;
}
function diDb(): PDO {
    $root = realpath(dirname(__DIR__)) ?: dirname(__DIR__);
    $path = getenv('LEADS_DB_PATH') ?: dirname($root) . '/jgm4-private/diagnostico-inicial.sqlite';
    if (!preg_match('~^(?:[A-Za-z]:[\\\\/]|/)~', $path)) throw new RuntimeException();
    $dir = dirname($path);
    if (!is_dir($dir) && !mkdir($dir,0700,true) && !is_dir($dir)) throw new RuntimeException();
    $resolved = realpath($dir);
    $public = strtolower(str_replace('\\','/',realpath($_SERVER['DOCUMENT_ROOT'] ?? '') ?: ''));
    $private = strtolower(str_replace('\\','/',$resolved ?: ''));
    if ($public!=='' && ($private===$public || str_starts_with($private.'/',rtrim($public,'/').'/'))) throw new RuntimeException();
    $db = new PDO('sqlite:'.$path,null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
    @chmod($path,0600);
    $db->exec('CREATE TABLE IF NOT EXISTS InitialDiagnosis (id TEXT PRIMARY KEY, payload TEXT NOT NULL, status TEXT NOT NULL, consent TEXT NOT NULL, createdAt TEXT NOT NULL, emailSentAt TEXT, emailError TEXT)');
    return $db;
}
function diMail(array $data, string $created): void {
    $host=trim(diConfig('SMTP_HOST')); $user=trim(diConfig('SMTP_USER')); $pass=diConfig('SMTP_PASS',diConfig('SMTP_PASSWORD')); $from=trim(diConfig('SMTP_FROM'));
    if($host===''||$user===''||$pass===''||$from==='') throw new RuntimeException('SMTP não configurado');
    $vendor=dirname(__DIR__).'/vendor/src/';
    require_once $vendor.'Exception.php'; require_once $vendor.'PHPMailer.php'; require_once $vendor.'SMTP.php';
    $mail=new PHPMailer\PHPMailer\PHPMailer(true); $mail->isSMTP(); $mail->Host=$host; $mail->Port=(int)diConfig('SMTP_PORT','587'); $mail->SMTPAuth=true; $mail->Username=$user; $mail->Password=$pass;
    $secure=strtolower(trim(diConfig('SMTP_SECURE','false')));
    $mail->SMTPSecure=($secure==='ssl'||$mail->Port===465)?PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS:(in_array($secure,['tls','starttls','true','1'],true)?PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS:false);
    $mail->Timeout=10; $mail->CharSet='UTF-8';
    if(preg_match('/^(.+)\s*<([^>]+)>$/',$from,$parts))$mail->setFrom(trim($parts[2]),trim($parts[1]));else$mail->setFrom($from,'JGM4 Consultoria');
    $mail->addAddress(diConfig('LEADS_TO_EMAIL',DI_TO)); $mail->addReplyTo($data['email'],$data['name']); $mail->Subject='Novo Pré-Diagnóstico JGM4 | '.$data['company'].' | '.$data['main_reason'];
    $labels=['company'=>'Empresa','name'=>'Nome','role'=>'Cargo/Função','email'=>'E-mail','phone'=>'WhatsApp','main_reason'=>'Tema principal','company_moment'=>'Momento da empresa','challenge'=>'Desafio relatado','impacts'=>'Impactos','operation_people'=>'Colaboradores na operação','operation_units'=>'Unidades/CDs','cost_focus'=>'Custo que preocupa','cost_range'=>'Faixa mensal estimada','sku_range'=>'Faixa de SKUs','stock_focus'=>'Dificuldade de estoque','delivery_model'=>'Modelo de entregas','transport_focus'=>'Desafio de transportes','system_situation'=>'Situação dos sistemas','current_systems'=>'Sistemas atuais','dc_focus'=>'Desafio do CD','dc_area'=>'Área aproximada do CD','management_focus'=>'Necessidade de gestão','general_areas'=>'Áreas com dificuldade','urgency'=>'Urgência','important_date'=>'Data/evento importante','expectation'=>'Objetivo esperado'];
    $lines=['NOVO PRÉ-DIAGNÓSTICO JGM4',''];
    foreach($labels as $key=>$label){$value=$data[$key]??'';if(is_array($value))$value=implode(', ',$value);if($value!=='')$lines[]=$label.': '.$value;}
    $lines[]=''; $lines[]='Data/hora do envio: '.$created; $mail->isHTML(false); $mail->Body=implode(PHP_EOL,$lines); $mail->send();
}
if(($_SERVER['REQUEST_METHOD']??'')!=='POST')diRespond(405,'Método não permitido.');
$origin=$_SERVER['HTTP_ORIGIN']??''; $host=preg_replace('/:\d+$/','',$_SERVER['HTTP_HOST']??'');
if($origin!==''&&strtolower((string)parse_url($origin,PHP_URL_HOST))!==strtolower((string)$host))diRespond(403,DI_ERROR);
$raw=file_get_contents('php://input',false,null,0,32769); if($raw===false||strlen($raw)>32768)diRespond(413,DI_ERROR);
$input=json_decode($raw,true); if(!is_array($input))diRespond(400,DI_ERROR);
if(isset($input['website'])&&is_string($input['website'])&&trim($input['website'])!=='')diRespond(201,'Recebemos suas informações.');
try{$data=diData($input);}catch(Throwable){diRespond(400,'Revise os campos obrigatórios antes de enviar.');}
$created=gmdate('c'); $id=bin2hex(random_bytes(16));
try{
    $db=diDb(); $db->prepare('INSERT INTO InitialDiagnosis (id,payload,status,consent,createdAt) VALUES (?,?,?,?,?)')->execute([$id,json_encode($data,JSON_UNESCAPED_UNICODE),'NEW',DI_CONSENT,$created]);
    try{diMail($data,$created);$db->prepare('UPDATE InitialDiagnosis SET status=?,emailSentAt=? WHERE id=?')->execute(['EMAIL_SENT',gmdate('c'),$id]);diRespond(201,'Informações recebidas.',['delivery'=>'sent']);}
    catch(Throwable $error){$db->prepare('UPDATE InitialDiagnosis SET status=?,emailError=? WHERE id=?')->execute(['EMAIL_FAILED','Falha no envio SMTP',$id]);error_log('[diagnostico-inicial] envio pendente; lead_id='.$id.' erro='.get_class($error));diRespond(201,'Informações recebidas.',['delivery'=>'pending']);}
}catch(Throwable $error){error_log('[diagnostico-inicial] falha ao salvar lead; erro='.get_class($error));diRespond(503,DI_ERROR);}
