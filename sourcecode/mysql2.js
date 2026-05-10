const axios = require('axios');
const mysql = require('mysql2/promise');

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'dana_api'
};

async function fetchAndSaveMutasi(accountId, sessionId) {
    const connection = await mysql.createConnection(dbConfig);
    
    try {
        const response = await axios.get('https://m.dana.id/wallet/v1/transaction/history', {
            headers: {
                'Cookie': `ALIPAYJSESSIONID=${sessionId}`,
                'User-Agent': 'DANA/1.45.0 (iPhone; iOS 15.0)',
                'Content-Type': 'application/json'
            }
        });

        const transactions = response.data.transactions; // Struktur ini tergantung hasil reverse engineering terbaru

        for (let tx of transactions) {
            await connection.execute(
                `INSERT IGNORE INTO transactions (transaction_id, account_id, amount, type, description, transaction_date) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [tx.id, accountId, tx.amount, tx.type, tx.note, tx.date]
            );
        }
        console.log("Mutasi berhasil diperbarui.");
    } catch (error) {
        console.error("Gagal ambil mutasi:", error.message);
    } finally {
        await connection.end();
    }
}