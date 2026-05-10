<?php
function http_request($method, $path, $token=null, $body=null, $params=null){
  $cfg = include __DIR__.'/../config.php';
  $url = rtrim($cfg['base'],'/').$path;
  if($params) $url .= '?'.http_build_query($params);
  $ch = curl_init($url);
  $headers = ['Content-Type: application/json'];
  if($token) $headers[] = 'Authorization: Bearer '.$token;
  curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
  curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
  curl_setopt($ch, CURLOPT_TIMEOUT, 30);
  if($method === 'POST'){ curl_setopt($ch, CURLOPT_POST, true); curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body)); }
  $resp = curl_exec($ch);
  $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  if(curl_errno($ch)) throw new Exception('Network error: '.curl_error($ch));
  curl_close($ch);
  return ['code'=>$code, 'body'=>$resp?json_decode($resp,true):null];
}
