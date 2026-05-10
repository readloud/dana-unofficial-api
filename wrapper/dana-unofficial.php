<?php
/**
 * DanaUnofficialAPI - Unofficial DANA Wallet API Client
 * WARNING: For educational purposes only. Use at your own risk.
 */

class DanaUnofficialAPI {
    private $baseURL;
    private $sessionId;
    private $accessToken;
    private $refreshToken;
    private $ch;
    
    /**
     * Constructor
     * @param array $config Configuration array with sessionId and optional baseURL
     */
    public function __construct($config) {
        $this->baseURL = $config['baseURL'] ?? 'https://api.dana.id/v1';
        $this->sessionId = $config['sessionId'] ?? '';
        $this->initCurl();
    }
    
    /**
     * Initialize cURL session
     */
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
    
    /**
     * Login to DANA account
     * @param string $phoneNumber User's phone number
     * @param string $password User's password
     * @return array User data
     * @throws Exception
     */
    public function login($phoneNumber, $password) {
        try {
            $payload = [
                'phoneNumber' => $this->encryptData($phoneNumber),
                'password' => $this->encryptData($password),
                'deviceInfo' => $this->getDeviceInfo(),
                'timestamp' => $this->getTimestamp()
            ];
            
            $response = $this->post('/auth/login', $payload);
            
            if ($response['code'] === 'SUCCESS') {
                $this->accessToken = $response['data']['accessToken'];
                $this->refreshToken = $response['data']['refreshToken'];
                return $response['data'];
            }
            throw new Exception($response['message'] ?? 'Login failed');
            
        } catch (Exception $e) {
            $this->logError('Login Error', $e->getMessage());
            throw $e;
        }
    }
    
    /**
     * Get transaction history
     * @param array $options Options including page, limit, startDate, endDate, interval
     * @return array Transaction history
     * @throws Exception
     */
    public function getTransactionHistory($options = []) {
        $defaults = [
            'page' => 1,
            'limit' => 20,
            'startDate' => null,
            'endDate' => null,
            'interval' => 0
        ];
        $options = array_merge($defaults, $options);
        
        $fetchData = function() use ($options) {
            try {
                $payload = [
                    'page' => $options['page'],
                    'limit' => $options['limit'],
                    'startDate' => $this->formatDate($options['startDate']),
                    'endDate' => $this->formatDate($options['endDate']),
                    'signature' => $this->generateSignature()
                ];
                
                $response = $this->post('/transaction/history', $payload);
                
                if ($response['code'] === 'SUCCESS') {
                    return $this->parseTransactions($response['data']);
                }
                throw new Exception($response['message'] ?? 'Failed to fetch transactions');
                
            } catch (Exception $e) {
                $this->logError('Get Mutasi Error', $e->getMessage());
                
                // Retry if token expired
                if (strpos($e->getMessage(), '401') !== false) {
                    $this->refreshAccessToken();
                    return $fetchData();
                }
                throw $e;
            }
        };
        
        if ($options['interval'] > 0) {
            // Polling mode - long-running process
            while (true) {
                try {
                    $data = $fetchData();
                    echo json_encode(['timestamp' => date('c'), 'data' => $data]) . PHP_EOL;
                    
                    if (isset($options['onData']) && is_callable($options['onData'])) {
                        call_user_func($options['onData'], $data);
                    }
                    
                    sleep($options['interval'] / 1000);
                    
                } catch (Exception $e) {
                    if (isset($options['onError']) && is_callable($options['onError'])) {
                        call_user_func($options['onError'], $e);
                    }
                    break;
                }
            }
        }
        
        return $fetchData();
    }
    
    /**
     * Transfer funds to another user
     * ⚠️ HIGH RISK - DEVELOPMENT ONLY
     * @param string $recipientPhone Recipient's phone number
     * @param float $amount Amount to transfer
     * @param string $notes Transfer notes
     * @return array Transfer result
     * @throws Exception
     */
    public function transfer($recipientPhone, $amount, $notes = '') {
        try {
            if ($amount <= 0) {
                throw new InvalidArgumentException('Amount must be greater than 0');
            }
            
            $payload = [
                'recipient' => $this->encryptData($recipientPhone),
                'amount' => $this->encryptData((string)$amount),
                'notes' => $this->encryptData($notes),
                'transferId' => $this->generateTransferId(),
                'timestamp' => $this->getTimestamp(),
                'signature' => $this->generateSignature()
            ];
            
            $response = $this->post('/transfer/create', $payload);
            
            if ($response['code'] === 'SUCCESS') {
                return [
                    'success' => true,
                    'transferId' => $response['data']['transferId'],
                    'status' => $response['data']['status'],
                    'timestamp' => date('c')
                ];
            }
            throw new Exception($response['message'] ?? 'Transfer failed');
            
        } catch (Exception $e) {
            $this->logError('Transfer Failed', [
                'recipient' => $recipientPhone,
                'amount' => $amount,
                'error' => $e->getMessage()
            ]);
            throw $e;
        }
    }
    
    /**
     * Check wallet balance
     * @return array Balance information
     * @throws Exception
     */
    public function getBalance() {
        try {
            $response = $this->get('/wallet/balance', [
                'Authorization: Bearer ' . $this->accessToken
            ]);
            
            if ($response['code'] === 'SUCCESS') {
                return [
                    'balance' => $response['data']['balance'],
                    'currency' => 'IDR',
                    'lastUpdated' => date('c')
                ];
            }
            throw new Exception($response['message'] ?? 'Failed to get balance');
            
        } catch (Exception $e) {
            $this->logError('Balance Error', $e->getMessage());
            throw $e;
        }
    }
    
    /**
     * Check if host is reachable
     * @param string $host Hostname to check
     * @return bool True if reachable, false otherwise
     */
    private function isHostReachable($host) {
        $ip = gethostbyname($host);
        return ($ip !== $host);
    }
    
    // ============ HTTP Methods ============
    
    /**
     * Perform POST request
     * @param string $endpoint API endpoint
     * @param array $data Request data
     * @return array Response data
     * @throws Exception
     */
    private function post($endpoint, $data) {
        $url = $this->baseURL . $endpoint;
        $jsonData = json_encode($data);
        
        // Check host reachability
        $host = parse_url($this->baseURL, PHP_URL_HOST);
        if (!$this->isHostReachable($host)) {
            throw new Exception("Cannot resolve host: {$host}");
        }
        
        curl_setopt($this->ch, CURLOPT_URL, $url);
        curl_setopt($this->ch, CURLOPT_POST, true);
        curl_setopt($this->ch, CURLOPT_POSTFIELDS, $jsonData);
        curl_setopt($this->ch, CURLOPT_HTTPHEADER, $this->getHeaders());
        
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
    
    /**
     * Perform GET request
     * @param string $endpoint API endpoint
     * @param array $additionalHeaders Additional headers
     * @return array Response data
     * @throws Exception
     */
    private function get($endpoint, $additionalHeaders = []) {
        $url = $this->baseURL . $endpoint;
        
        curl_setopt($this->ch, CURLOPT_URL, $url);
        curl_setopt($this->ch, CURLOPT_POST, false);
        curl_setopt($this->ch, CURLOPT_HTTPHEADER, array_merge($this->getHeaders(), $additionalHeaders));
        
        $response = curl_exec($this->ch);
        
        if ($response === false) {
            throw new Exception('CURL Error: ' . curl_error($this->ch));
        }
        
        return json_decode($response, true);
    }
    
    // ============ Helper Methods ============
    
    /**
     * Encrypt data using AES-256-CBC
     * @param string $data Data to encrypt
     * @return string Base64 encoded encrypted data
     */
    private function encryptData($data) {
        $key = $this->getEncryptionKey();
        $iv = $this->getIV();
        
        // Ensure IV is exactly 16 bytes for AES-256-CBC
        $iv = substr($iv, 0, 16);
        
        // If IV is shorter than 16 bytes, pad with zeros
        if (strlen($iv) < 16) {
            $iv = str_pad($iv, 16, "\0");
        }
        
        $encrypted = openssl_encrypt($data, 'AES-256-CBC', $key, 0, $iv);
        return base64_encode($encrypted);
    }
    
    /**
     * Get HTTP headers
     * @return array Headers array
     */
    private function getHeaders() {
        $headers = [
            'User-Agent: DANA/4.0.0 (Android)',
            'Content-Type: application/json',
            'Cookie: ALIPAYJSESSIONID=' . $this->sessionId
        ];
        
        if ($this->accessToken) {
            $headers[] = 'Authorization: Bearer ' . $this->accessToken;
        }
        
        return $headers;
    }
    
    /**
     * Get device information
     * @return array Device info
     */
    private function getDeviceInfo() {
        return [
            'deviceId' => $this->generateDeviceId(),
            'os' => 'Android',
            'osVersion' => '13',
            'appVersion' => '4.0.0',
            'timestamp' => $this->getTimestamp()
        ];
    }
    
    /**
     * Generate random device ID
     * @return string Device ID
     */
    private function generateDeviceId() {
        return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0, 0xffff), mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0x0fff) | 0x4000,
            mt_rand(0, 0x3fff) | 0x8000,
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
        );
    }
    
    /**
     * Generate unique transfer ID
     * @return string Transfer ID
     */
    private function generateTransferId() {
        return 'TXN_' . $this->getTimestamp() . '_' . bin2hex(random_bytes(5));
    }
    
    /**
     * Generate request signature
     * @return string MD5 signature
     */
    private function generateSignature() {
        return md5($this->getTimestamp() . $this->sessionId);
    }
    
    /**
     * Get encryption key from environment or use default
     * @return string Encryption key
     */
    private function getEncryptionKey() {
        $key = getenv('DANA_ENCRYPTION_KEY');
        if (!$key) {
            $key = 'default-key-change-me';
            trigger_error('Using default encryption key. Please set DANA_ENCRYPTION_KEY environment variable for security.', E_USER_WARNING);
        }
        return $key;
    }
    
    /**
     * Get initialization vector (IV) - always returns 16 bytes
     * @return string IV (16 bytes)
     */
    private function getIV() {
        $iv = getenv('DANA_IV');
        if (!$iv) {
            $iv = 'default-iv-16by'; // Exactly 16 bytes
        }
        // Ensure exactly 16 bytes
        return substr($iv, 0, 16);
    }
    
    /**
     * Get current timestamp in milliseconds
     * @return int Timestamp
     */
    private function getTimestamp() {
        return round(microtime(true) * 1000);
    }
    
    /**
     * Format date for API
     * @param string|null $date Date string
     * @return string|null Formatted date
     */
    private function formatDate($date) {
        if (!$date) return null;
        $d = new DateTime($date);
        return $d->format('Y-m-d');
    }
    
    /**
     * Parse transaction data
     * @param array $data Raw transaction data
     * @return array Parsed transactions
     */
    private function parseTransactions($data) {
        return [
            'transactions' => array_map(function($tx) {
                return [
                    'id' => $tx['transactionId'] ?? null,
                    'type' => $tx['type'] ?? null,
                    'amount' => $tx['amount'] ?? 0,
                    'counterparty' => $tx['counterpartyName'] ?? null,
                    'timestamp' => $tx['createTime'] ?? null,
                    'status' => $tx['status'] ?? null,
                    'notes' => $tx['notes'] ?? null
                ];
            }, $data['list'] ?? []),
            'total' => $data['total'] ?? 0,
            'page' => $data['page'] ?? 1
        ];
    }
    
    /**
     * Log errors to file
     * @param string $context Error context
     * @param string|array $error Error details
     */
    private function logError($context, $error) {
        $logEntry = [
            'timestamp' => date('c'),
            'context' => $context,
            'error' => is_array($error) ? json_encode($error) : $error
        ];
        
        error_log(json_encode($logEntry) . PHP_EOL, 3, 'dana_error.log');
    }
    
    /**
     * Refresh access token
     * @return string New access token
     * @throws Exception
     */
    private function refreshAccessToken() {
        try {
            $response = $this->post('/auth/refresh', [
                'refreshToken' => $this->refreshToken
            ]);
            $this->accessToken = $response['data']['accessToken'];
            return $this->accessToken;
        } catch (Exception $e) {
            throw new Exception('Failed to refresh token: ' . $e->getMessage());
        }
    }
    
    /**
     * Destructor - close cURL handle
     */
    public function __destruct() {
        if ($this->ch) {
            curl_close($this->ch);
        }
    }
}

// ============ Example Usage ============

// Check if script is run directly (not included)
if (basename($_SERVER['PHP_SELF']) === basename(__FILE__)) {
    try {
        // Configuration
        $config = [
            'sessionId' => getenv('DANA_SESSION_ID') ?: 'YOUR_ALIPAYJSESSIONID_HERE',
            'baseURL' => getenv('DANA_API_URL') ?: 'https://api.dana.id/v1'
        ];
        
        // Check if we're in test mode
        $testMode = getenv('DANA_TEST_MODE') === 'true';
        
        if ($testMode) {
            echo "Running in TEST MODE - No actual API calls will be made\n";
            echo "Set DANA_TEST_MODE=false to make real calls\n";
            exit(0);
        }
        
        // Initialize API
        $dana = new DanaUnofficialAPI($config);
        
        // Test host connectivity
        echo "Testing connectivity to " . parse_url($config['baseURL'], PHP_URL_HOST) . "...\n";
        
        // Login (uncomment when ready)
        // $userData = $dana->login('08123456789', 'your_password');
        // echo "Login successful: " . json_encode($userData) . PHP_EOL;
        
        // Check balance (uncomment when ready)
        // $balance = $dana->getBalance();
        // echo "Balance: " . json_encode($balance) . PHP_EOL;
        
        // Get transaction history (uncomment when ready)
        // $history = $dana->getTransactionHistory(['page' => 1, 'limit' => 10]);
        // echo "Transaction History: " . json_encode($history, JSON_PRETTY_PRINT) . PHP_EOL;
        
        echo "API client ready. Uncomment the API calls in the example section to use.\n";
        
    } catch (Exception $e) {
        echo "Error: " . $e->getMessage() . PHP_EOL;
        exit(1);
    }
}

?>
