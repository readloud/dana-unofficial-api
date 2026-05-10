// dana-unofficial.js
const axios = require('axios');
const CryptoJS = require('crypto-js');

class DanaUnofficialAPI {
    constructor(config) {
        this.baseURL = config.baseURL || 'https://api.dana.id/v1';
        this.sessionId = config.sessionId; // ALIPAYJSESSIONID dari login manual
        this.privateKey = config.privateKey;
        this.client = axios.create({
            baseURL: this.baseURL,
            timeout: 30000,
            headers: {
                'User-Agent': 'DANA/4.0.0 (Android)',
                'Content-Type': 'application/json',
                'Cookie': `ALIPAYJSESSIONID=${this.sessionId}`
            }
        });
    }

    /**
     * Autentikasi - Mendapatkan token akses
     * Proses ini membutuhkan reverse engineering dari endpoint login DANA
     */
    async login(phoneNumber, password) {
        try {
            // Endpoint login perlu dianalisis dari network traffic
            // Contoh struktur request (perlu disesuaikan)
            const payload = {
                phoneNumber: this.encryptData(phoneNumber),
                password: this.encryptData(password),
                deviceInfo: this.getDeviceInfo(),
                timestamp: Date.now()
            };

            const response = await this.client.post('/auth/login', payload);
            
            if (response.data.code === 'SUCCESS') {
                this.accessToken = response.data.data.accessToken;
                this.refreshToken = response.data.data.refreshToken;
                this.updateHeaders();
                return response.data.data;
            }
            throw new Error(response.data.message);
        } catch (error) {
            console.error('[Login Error]', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Encrypt Data - Algoritma perlu dianalisis dari JS DANA
     * Contoh menggunakan AES (biasanya dengan key dari gsk() function)
     */
    encryptData(data) {
        // Ini adalah contoh - algoritma asli perlu dianalisis dari aplikasi
        // Berdasarkan pengalaman reverse engineering DANA, mereka menggunakan
        // AES dengan key yang di-generate dari client-id [citation:3]
        const key = CryptoJS.enc.Utf8.parse(this.getEncryptionKey());
        const iv = CryptoJS.enc.Utf8.parse(this.getIV());
        const encrypted = CryptoJS.AES.encrypt(data, key, {
            iv: iv,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        });
        return encrypted.toString();
    }

    /**
     * Get Mutasi / Riwayat Transaksi
     * Melakukan polling setiap interval tertentu [citation:1]
     */
    async getTransactionHistory(options = {}) {
        const {
            page = 1,
            limit = 20,
            startDate = null,
            endDate = null,
            interval = 5000 // default 5 detik
        } = options;

        const fetchData = async () => {
            try {
                const payload = {
                    page,
                    limit,
                    startDate: this.formatDate(startDate),
                    endDate: this.formatDate(endDate),
                    signature: this.generateSignature()
                };

                const response = await this.client.post('/transaction/history', payload);
                
                if (response.data.code === 'SUCCESS') {
                    return this.parseTransactions(response.data.data);
                }
                throw new Error(response.data.message);
            } catch (error) {
                this.logError('Get Mutasi Error', error);
                // Retry logic jika token gagal [citation:1]
                if (error.response?.status === 401) {
                    await this.refreshAccessToken();
                    return fetchData();
                }
                throw error;
            }
        };

        if (interval > 0) {
            // Mode polling
            const pollInterval = setInterval(async () => {
                try {
                    const data = await fetchData();
                    console.log('[Polling]', new Date().toISOString(), data);
                    if (options.onData) options.onData(data);
                } catch (error) {
                    if (options.onError) options.onError(error);
                    clearInterval(pollInterval);
                }
            }, interval);
            
            return { stop: () => clearInterval(pollInterval) };
        }
        
        return fetchData();
    }

    /**
     * Transfer Dana ke user lain
     * ⚠️ HIGHLY RISKY - JANGAN GUNAKAN UNTUK UANG NYATA
     */
    async transfer(recipientPhone, amount, notes = '') {
        try {
            // Validasi dasar
            if (amount <= 0) throw new Error('Amount must be greater than 0');
            
            const payload = {
                recipient: this.encryptData(recipientPhone),
                amount: this.encryptData(amount.toString()),
                notes: this.encryptData(notes),
                transferId: this.generateTransferId(),
                timestamp: Date.now(),
                signature: this.generateSignature()
            };

            // Endpoint transfer perlu dianalisis dari network traffic
            const response = await this.client.post('/transfer/create', payload);
            
            if (response.data.code === 'SUCCESS') {
                return {
                    success: true,
                    transferId: response.data.data.transferId,
                    status: response.data.data.status,
                    timestamp: new Date().toISOString()
                };
            }
            throw new Error(response.data.message);
            
        } catch (error) {
            console.error('[Transfer Error]', error.response?.data || error.message);
            this.logError('Transfer Failed', {
                recipient: recipientPhone,
                amount,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Cek Saldo Wallet
     */
    async getBalance() {
        try {
            const response = await this.client.get('/wallet/balance', {
                headers: { 'Authorization': `Bearer ${this.accessToken}` }
            });
            
            if (response.data.code === 'SUCCESS') {
                return {
                    balance: response.data.data.balance,
                    currency: 'IDR',
                    lastUpdated: new Date().toISOString()
                };
            }
            throw new Error(response.data.message);
        } catch (error) {
            console.error('[Balance Error]', error.message);
            throw error;
        }
    }

    // ============ Helper Methods ============
    
    getDeviceInfo() {
        return {
            deviceId: this.generateDeviceId(),
            os: 'Android',
            osVersion: '13',
            appVersion: '4.0.0',
            timestamp: Date.now()
        };
    }

    generateDeviceId() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    generateTransferId() {
        return `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    generateSignature() {
        // Signature generation perlu dianalisis dari aplikasi
        return CryptoJS.MD5(Date.now() + this.sessionId).toString();
    }

    getEncryptionKey() {
        // Key perlu dianalisis dari fungsi gsk() di JS DANA [citation:3]
        return process.env.DANA_ENCRYPTION_KEY || 'default-key-change-me';
    }

    getIV() {
        return process.env.DANA_IV || 'default-iv-16byte';
    }

    formatDate(date) {
        if (!date) return null;
        const d = new Date(date);
        return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
    }

    parseTransactions(data) {
        return {
            transactions: data.list?.map(tx => ({
                id: tx.transactionId,
                type: tx.type,
                amount: tx.amount,
                counterparty: tx.counterpartyName,
                timestamp: tx.createTime,
                status: tx.status,
                notes: tx.notes
            })) || [],
            total: data.total || 0,
            page: data.page || 1
        };
    }

    logError(context, error) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            context,
            error: error.message || error,
            stack: error.stack
        };
        console.error(JSON.stringify(logEntry, null, 2));
        // Bisa ditambahkan file logging
    }

    updateHeaders() {
        this.client.defaults.headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    async refreshAccessToken() {
        try {
            const response = await this.client.post('/auth/refresh', {
                refreshToken: this.refreshToken
            });
            this.accessToken = response.data.data.accessToken;
            this.updateHeaders();
            return this.accessToken;
        } catch (error) {
            throw new Error('Failed to refresh token');
        }
    }
}

// ============ Contoh Penggunaan ============
async function main() {
    // Inisialisasi dengan sessionId dari login manual via browser/aplikasi
    const dana = new DanaUnofficialAPI({
        sessionId: 'YOUR_ALIPAYJSESSIONID_HERE', // Dapatkan dari cookie setelah login
        baseURL: 'https://api.dana.id/v1' // Contoh, sesuaikan dengan endpoint asli
    });

    try {
        // 1. Login
        const loginResult = await dana.login('08123456789', 'your_password');
        console.log('Login success:', loginResult);

        // 2. Cek saldo
        const balance = await dana.getBalance();
        console.log('Balance:', balance);

        // 3. Get mutasi (single fetch)
        const history = await dana.getTransactionHistory({
            page: 1,
            limit: 10,
            interval: 0 // non-polling
        });
        console.log('Transaction History:', history);

        // 4. Get mutasi dengan polling setiap 5 detik [citation:1]
        const polling = await dana.getTransactionHistory({
            interval: 5000,
            onData: (data) => {
                console.log('New transactions:', data);
            },
            onError: (error) => {
                console.error('Polling error:', error);
            }
        });
        
        // Hentikan polling setelah 30 detik
        setTimeout(() => {
            polling.stop();
            console.log('Polling stopped');
        }, 30000);

        // 5. Transfer (⚠️ JANGAN GUNAKAN DENGAN UANG NYATA)
        // const transfer = await dana.transfer('08123456789', 10000, 'Test transfer');
        // console.log('Transfer result:', transfer);

    } catch (error) {
        console.error('Error:', error.message);
    }
}

// Ekspor module
module.exports = { DanaUnofficialAPI };

// Jalankan jika file dieksekusi langsung
if (require.main === module) {
    main();
}
