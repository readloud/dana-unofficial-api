<?php
require __DIR__.'/../lib/api.php';
$r = http_request('POST','/auth/login', null, ['phone'=>'081234000000']);
assert(isset($r['body']['otp']), 'otp present');
echo "PHP test OK\n";
