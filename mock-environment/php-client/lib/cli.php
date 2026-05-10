<?php
require __DIR__.'/lib/api.php';

$base = include __DIR__.'/config.php';
echo "Using API: ".$base['base']."\n";

/* 1. request OTP */
$phone = $argv[1] ?? '081234000000';
$r = http_request('POST', '/auth/login', null, ['phone'=>$phone]);
echo "OTP sent (mock): ".($r['body']['otp'] ?? 'N/A')."\n";

/* 2. login with otp */
$otp = $argv[2] ?? ($r['body']['otp'] ?? '123456');
$login = http_request('POST', '/auth/login', null, ['phone'=>$phone, 'otp'=>$otp]);
if($login['code'] !== 200){ echo "Login failed\n"; exit(1); }
$token = $login['body']['access_token'];
echo "Token: ".$token."\n";

/* 3. check balance */
$bal = http_request('GET','/balance', $token);
print_r($bal);

/* 4. create transfer */
$to = '082199900000';
$amount = 50000;
$idempotency = bin2hex(random_bytes(8));
$t = http_request('POST', '/transfer', $token, ['to'=>$to, 'amount'=>$amount, 'note'=>'Test transfer', 'idempotency_key'=>$idempotency]);
print_r($t);

/* 5. poll status */
if(isset($t['body']['transfer_id'])){
  sleep(3);
  $s = http_request('GET', '/transfer/'.$t['body']['transfer_id'], $token);
  print_r($s);
}

/* 6. fetch mutations */
$m = http_request('GET', '/mutations', $token);
print_r($m);
