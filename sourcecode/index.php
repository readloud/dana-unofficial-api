<?php
// index.php
require __DIR__ . '/vendor/autoload.php';

use Slim\Factory\AppFactory;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use GuzzleHttp\Client;
use GuzzleHttp\Cookie\CookieJar;
use Monolog\Logger;
use Monolog\Handler\StreamHandler;
use Dotenv\Dotenv;

// Load environment variables
$dotenv = Dotenv::createImmutable(__DIR__);
$dotenv->load();

// Initialize logger
$logger = new Logger('dana-api');
$logger->pushHandler(new StreamHandler(__DIR__ . '/dana-api.log', Logger::INFO));

// Initialize Slim app
$app = AppFactory::create();
$app->addBodyParsingMiddleware();
$app->addErrorMiddleware(true, true, true);
$app->get('/', function ($request, $response) {
    $response->getBody()->write('API running');
    return $response;
});

// Configuration
class DanaConfig {
    public static $sessionId;
    public static $userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    public static $baseUrl = 'https://www.dana.id';
    public static $apiBaseUrl = 'https://api.dana.id';
    public static $timeout = 30;
    public static $retryAttempts = 3;
    public static $retryDelay = 5;
    
    public static function init() {
        self::$sessionId = $_ENV['DANA_SESSION_ID'] ?? '';
    }
}

DanaConfig::init();

// DANA Client Class
class DanaClient {
    private $client;
    private $cookieJar;
    private $csrfToken = null;
    private $tokenExpiry = null;
    private $logger;
    
    public function __construct($logger) {
        $this->logger = $logger;
        $this->cookieJar = new CookieJar();
        $this->client = new Client([
            'base_uri' => DanaConfig::$apiBaseUrl,
            'timeout' => DanaConfig::$timeout,
            'headers' => [
                'User-Agent' => DanaConfig::$userAgent,
                'Content-Type' => 'application/json',
                'Accept' => 'application/json'
            ]
        ]);
        
        // Set session cookie
        $this->cookieJar->setCookie(new \GuzzleHttp\Cookie\SetCookie([
            'Name' => 'ALIPAYJSESSIONID',
            'Value' => DanaConfig::$sessionId,
            'Domain' => 'api.dana.id'
        ]));
    }
    
    public function getCsrfToken() {
        try {
            $this->logger->info('Fetching CSRF token...');
            $response = $this->client->get(DanaConfig::$baseUrl, [
                'headers' => ['User-Agent' => DanaConfig::$userAgent]
            ]);
            
            $html = (string)$response->getBody();
            if (preg_match('/<meta name="csrf-token" content="([^"]+)"/', $html, $matches)) {
                $this->csrfToken = $matches[1];
            } elseif (preg_match('/<input name="_token" value="([^"]+)"/', $html, $matches)) {
                $this->csrfToken = $matches[1];
            }
            
            if ($this->csrfToken) {
                $this->tokenExpiry = time() + 3600;
                $this->logger->info('CSRF token obtained');
                return $this->csrfToken;
            }
            throw new \Exception('CSRF token not found');
        } catch (\Exception $e) {
            $this->logger->error("Failed to get CSRF token: " . $e->getMessage());
            throw $e;
        }
    }
    
    public function ensureToken() {
        if (!$this->csrfToken || time() >= $this->tokenExpiry) {
            return $this->getCsrfToken();
        }
        return $this->csrfToken;
    }
    
    public function requestWithRetry($method, $uri, $options = [], $context = '') {
        $lastError = null;
        for ($i = 0; $i < DanaConfig::$retryAttempts; $i++) {
            try {
                // Add CSRF token to query or body
                $token = $this->ensureToken();
                if ($method === 'GET') {
                    $options['query']['_csrf'] = $token;
                } else {
                    if (isset($options['json'])) {
                        $options['json']['_csrf'] = $token;
                    }
                }
                
                $options['cookies'] = $this->cookieJar;
                $response = $this->client->request($method, $uri, $options);
                $body = json_decode($response->getBody(), true);
                
                if (isset($body['code']) && ($body['code'] === '200' || $body['code'] === 'SUCCESS')) {
                    return $body;
                } elseif (isset($body['code']) && ($body['code'] === '401' || $body['code'] === '403')) {
                    // Token expired, force refresh
                    $this->getCsrfToken();
                    continue;
                }
                
                return $body;
            } catch (\Exception $e) {
                $lastError = $e;
                $this->logger->warning("Attempt " . ($i + 1) . " failed for {$context}: " . $e->getMessage());
                if ($i < DanaConfig::$retryAttempts - 1) {
                    sleep(DanaConfig::$retryDelay);
                }
            }
        }
        throw $lastError;
    }
    
    public function getTransactionHistory($page = 1, $limit = 20, $startDate = null, $endDate = null) {
        $params = [
            'pageNo' => $page,
            'pageSize' => $limit
        ];
        if ($startDate) $params['startTime'] = $startDate;
        if ($endDate) $params['endTime'] = $endDate;
        
        $response = $this->requestWithRetry('GET', '/mapi/my/transaction/list', [
            'query' => $params
        ], 'fetch_mutation');
        
        return [
            'success' => true,
            'data' => $response['data']['list'] ?? $response['data'] ?? [],
            'pagination' => [
                'page' => (int)$page,
                'limit' => (int)$limit,
                'total' => $response['data']['total'] ?? 0
            ]
        ];
    }
    
    public function getBalance() {
        $response = $this->requestWithRetry('GET', '/mapi/my/balance', [], 'fetch_balance');
        return [
            'success' => true,
            'balance' => $response['data']['balance'] ?? $response['data']['availableBalance'] ?? 0,
            'currency' => 'IDR'
        ];
    }
    
    public function transfer($phoneNumber, $amount, $note = '', $pin = null) {
        $payload = [
            'receiverPhoneNumber' => $phoneNumber,
            'amount' => (int)$amount,
            'note' => $note ?: 'Transfer via API',
            'payMethod' => 'BALANCE'
        ];
        
        if ($pin) {
            $payload['pin'] = $pin;
            $payload['encryptedPin'] = base64_encode($pin);
        }
        
        $response = $this->requestWithRetry('POST', '/mapi/my/transfer', [
            'json' => $payload
        ], 'transfer_funds');
        
        if (isset($response['code']) && $response['code'] === 'NEED_PIN') {
            return [
                'success' => false,
                'error' => 'PIN_REQUIRED',
                'message' => 'PIN required to complete transaction'
            ];
        }
        
        return [
            'success' => true,
            'transactionId' => $response['data']['orderId'] ?? $response['data']['transactionId'] ?? null,
            'amount' => $amount,
            'receiver' => $phoneNumber,
            'status' => 'completed',
            'timestamp' => date('c')
        ];
    }
    
    public function getTransactionDetail($transactionId) {
        $response = $this->requestWithRetry('GET', '/mapi/my/transaction/detail', [
            'query' => ['orderId' => $transactionId]
        ], 'fetch_transaction_detail');
        
        return [
            'success' => true,
            'transaction' => $response['data'] ?? null
        ];
    }
}

// Initialize DANA client
$danaClient = new DanaClient($logger);

// ============ ROUTES ============

// GET Mutasi
$app->get('/api/mutasi', function (Request $request, Response $response) use ($danaClient) {
    $queryParams = $request->getQueryParams();
    $page = $queryParams['page'] ?? 1;
    $limit = $queryParams['limit'] ?? 20;
    $startDate = $queryParams['startDate'] ?? null;
    $endDate = $queryParams['endDate'] ?? null;
    
    try {
        $result = $danaClient->getTransactionHistory($page, $limit, $startDate, $endDate);
        $response->getBody()->write(json_encode($result));
        return $response->withHeader('Content-Type', 'application/json');
    } catch (\Exception $e) {
        $response->getBody()->write(json_encode([
            'success' => false,
            'error' => 'Failed to fetch transactions',
            'message' => $e->getMessage()
        ]));
        return $response->withStatus(500)->withHeader('Content-Type', 'application/json');
    }
});

// GET Balance
$app->get('/api/balance', function (Request $request, Response $response) use ($danaClient) {
    try {
        $result = $danaClient->getBalance();
        $response->getBody()->write(json_encode($result));
        return $response->withHeader('Content-Type', 'application/json');
    } catch (\Exception $e) {
        $response->getBody()->write(json_encode([
            'success' => false,
            'error' => 'Failed to fetch balance',
            'message' => $e->getMessage()
        ]));
        return $response->withStatus(500)->withHeader('Content-Type', 'application/json');
    }
});

// POST Transfer
$app->post('/api/transfer', function (Request $request, Response $response) use ($danaClient) {
    $data = $request->getParsedBody();
    
    if (!isset($data['phoneNumber']) || !isset($data['amount']) || $data['amount'] <= 0) {
        $response->getBody()->write(json_encode([
            'success' => false,
            'error' => 'Invalid parameters',
            'message' => 'Phone number and valid amount are required'
        ]));
        return $response->withStatus(400)->withHeader('Content-Type', 'application/json');
    }
    
    try {
        $result = $danaClient->transfer(
            $data['phoneNumber'],
            $data['amount'],
            $data['note'] ?? '',
            $data['pin'] ?? null
        );
        $response->getBody()->write(json_encode($result));
        return $response->withHeader('Content-Type', 'application/json');
    } catch (\Exception $e) {
        $response->getBody()->write(json_encode([
            'success' => false,
            'error' => 'Transfer failed',
            'message' => $e->getMessage()
        ]));
        return $response->withStatus(500)->withHeader('Content-Type', 'application/json');
    }
});

// GET Transaction Detail
$app->get('/api/transaction/{id}', function (Request $request, Response $response, $args) use ($danaClient) {
    try {
        $result = $danaClient->getTransactionDetail($args['id']);
        $response->getBody()->write(json_encode($result));
        return $response->withHeader('Content-Type', 'application/json');
    } catch (\Exception $e) {
        $response->getBody()->write(json_encode([
            'success' => false,
            'error' => 'Failed to fetch transaction detail',
            'message' => $e->getMessage()
        ]));
        return $response->withStatus(500)->withHeader('Content-Type', 'application/json');
    }
});

// Run app
$app->run();
