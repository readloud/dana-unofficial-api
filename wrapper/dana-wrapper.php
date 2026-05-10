<?php
// dana-wrapper.php

require_once __DIR__ . '/vendor/autoload.php';

class DanaUnofficialAPI {
    private $baseURL;
    private $sessionId;
    private $accessToken;
    private $ch;
    
    public function __construct($config) {
        $this->baseURL = $config['baseURL'] ?? 'https://api.dana.id/v1';
        $this->sessionId = $config['sessionId'] ?? '';
        $this->initCurl();
    }
    
    private function initCurl() {
        $this->ch = curl_init();
        curl_setopt_array($this->ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_HTTPHEADER => [
                'User-Agent: DANA/4.0.0 (Android)',
                'Content-Type: application/json',
                'Cookie: ALIPAYJSESSIONID=' . $this->sessionId
            ]
        ]);
    }
    
    // TODO: Implementasi method berdasarkan reverse engineering
    private function encryptData($data) {
        // Sementara return as-is
        return $data;
    }
    
    private function generateSignature() {
        return md5(time() . $this->sessionId);
    }
    
    public function login($phoneNumber, $password) {
        try {
            $payload = [
                'phoneNumber' => $this->encryptData($phoneNumber),
                'password' => $this->encryptData($password),
                'deviceInfo' => [
                    'deviceId' => $this->generateDeviceId(),
                    'os' => 'Android',
                    'osVersion' => '13',
                    'appVersion' => '4.0.0'
                ],
                'timestamp' => round(microtime(true) * 1000)
            ];
            
            $response = $this->post('/auth/login', $payload);
            
            if ($response['code'] === 'SUCCESS') {
                $this->accessToken = $response['data']['accessToken'];
                return $response['data'];
            }
            throw new Exception($response['message'] ?? 'Login failed');
            
        } catch (Exception $e) {
            echo "[Login Error] " . $e->getMessage() . PHP_EOL;
            throw $e;
        }
    }
    
    public function getBalance() {
        try {
            $response = $this->get('/wallet/balance', [
                'Authorization: Bearer ' . $this->accessToken
            ]);
            
            return [
                'balance' => $response['data']['balance'] ?? 0,
                'currency' => 'IDR',
                'lastUpdated' => date('c')
            ];
        } catch (Exception $e) {
            echo "[Balance Error] " . $e->getMessage() . PHP_EOL;
            throw $e;
        }
    }
    
    private function post($endpoint, $data) {
        $url = $this->baseURL . $endpoint;
        $jsonData = json_encode($data);
        
        curl_setopt($this->ch, CURLOPT_URL, $url);
        curl_setopt($this->ch, CURLOPT_POST, true);
        curl_setopt($this->ch, CURLOPT_POSTFIELDS, $jsonData);
        
        $response = curl_exec($this->ch);
        $httpCode = curl_getinfo($this->ch, CURLINFO_HTTP_CODE);
        
        if ($response === false) {
            throw new Exception('CURL Error: ' . curl_error($this->ch));
        }
        
        $decoded = json_decode($response, true);
        
        if ($httpCode >= 400) {
            throw new Exception('HTTP ' . $httpCode . ': ' . ($decoded['message'] ?? $response));
        }
        
        return $decoded;
    }
    
    private function get($endpoint, $additionalHeaders = []) {
        $url = $this->baseURL . $endpoint;
        
        curl_setopt($this->ch, CURLOPT_URL, $url);
        curl_setopt($this->ch, CURLOPT_POST, false);
        curl_setopt($this->ch, CURLOPT_HTTPHEADER, array_merge([
            'User-Agent: DANA/4.0.0 (Android)',
            'Content-Type: application/json',
            'Cookie: ALIPAYJSESSIONID=' . $this->sessionId
        ], $additionalHeaders));
        
        $response = curl_exec($this->ch);
        
        if ($response === false) {
            throw new Exception('CURL Error: ' . curl_error($this->ch));
        }
        
        return json_decode($response, true);
    }
    
    private function generateDeviceId() {
        return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0, 0xffff), mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0x0fff) | 0x4000,
            mt_rand(0, 0x3fff) | 0x8000,
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
        );
    }
    
    public function __destruct() {
        if ($this->ch) {
            curl_close($this->ch);
        }
    }
}

// ============ RUNNING THE SCRIPT ============

echo "🚀 Starting DANA Unofficial API Wrapper (PHP)\n\n";

// Load config from environment or manual
$sessionId = getenv('DANA_SESSION_ID') ?: readline("Enter your ALIPAYJSESSIONID: ");
$phone = getenv('DANA_PHONE') ?: readline("Enter your phone number: ");
$password = getenv('DANA_PASSWORD') ?: readline("Enter your password: ");

if (!$sessionId || !$phone || !$password) {
    echo "❌ Error: Missing required credentials\n";
    exit(1);
}

try {
    $dana = new DanaUnofficialAPI([
        'sessionId' => $sessionId,
        'baseURL' => getenv('DANA_API_URL') ?: 'https://api.dana.id/v1'
    ]);
    
    // Login
    echo "📱 Step 1: Login...\n";
    $loginResult = $dana->login($phone, $password);
    echo "✅ Login successful!\n";
    echo "   Access Token: " . substr($loginResult['accessToken'], 0, 20) . "...\n\n";
    
    // Get Balance
    echo "💰 Step 2: Checking balance...\n";
    $balance = $dana->getBalance();
    echo "   Balance: Rp " . number_format($balance['balance'], 0, ',', '.') . "\n\n";
    
    echo "✨ All operations completed successfully!\n";
    
} catch (Exception $e) {
    echo "\n❌ Error: " . $e->getMessage() . "\n";
}
?>