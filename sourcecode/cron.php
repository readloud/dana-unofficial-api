<?php
$host = 'localhost';
$db   = 'dana_api';
$user = 'root';
$pass = '';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db", $user, $pass);
    
    function getMutasi($accountId, $sessionId, $pdo) {
        $url = "https://m.dana.id/wallet/v1/transaction/history";
        
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            "Cookie: ALIPAYJSESSIONID=$sessionId",
            "User-Agent: DANA/1.45.0 (Android 10)"
        ]);
        
        $response = curl_exec($ch);
        curl_close($ch);
        
        $data = json_decode($response, true);
        
        if (isset($data['transactions'])) {
            $stmt = $pdo->prepare("INSERT IGNORE INTO transactions (transaction_id, account_id, amount, type, description, transaction_date) VALUES (?, ?, ?, ?, ?, ?)");
            
            foreach ($data['transactions'] as $tx) {
                $stmt->execute([
                    $tx['id'], 
                    $accountId, 
                    $tx['amount'], 
                    $tx['type'], 
                    $tx['note'], 
                    $tx['date']
                ]);
            }
            return "Success update mutasi";
        }
        return "Failed to fetch data";
    }

    // Contoh Pemanggilan
    echo getMutasi(1, 'SESSION_ID_DARI_DB', $pdo);

} catch (PDOException $e) {
    die("Koneksi Gagal: " . $e->getMessage());
}
?>