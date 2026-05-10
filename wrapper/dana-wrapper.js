// dana-wrapper.js
require('dotenv').config();
const axios = require('axios');
const CryptoJS = require('crypto-js');
const proxyUrl = 'https://cors-anywhere.herokuapp.com/';
const targetUrl = 'https://api.dana.id/v1';

class DanaUnofficialAPI {
    constructor(config) {
        this.baseURL = config.baseURL || 'https://api.dana.id/v1';
        this.sessionId = config.sessionId;
        this.accessToken = config.accessToken || null;
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


    // ============ METHOD YANG PERLU DIIMPLEMENTASI ============
    // Anda harus mengisi method berikut berdasarkan hasil reverse engineering
    
    encryptData(data) {
        // TODO: Implementasi algoritma enkripsi asli dari DANA
        // Contoh sementara:
        return data;
    }
    
    generateSignature() {
        // TODO: Implementasi signature generation asli
        return CryptoJS.MD5(Date.now() + this.sessionId).toString();
    }
    
    getEncryptionKey() {
        // TODO: Ambil dari hasil analisis fungsi gsk()
        return process.env.DANA_ENCRYPTION_KEY || 'your-key-from-reverse-engineering';
    }
    
    getIV() {
        // TODO: Ambil dari hasil analisis
        return process.env.DANA_IV || 'your-iv-from-reverse-engineering';
    }
    // ==========================================================

    async login(phoneNumber, password) {
        try {
            const payload = {
                phoneNumber: this.encryptData(phoneNumber),
                password: this.encryptData(password),
                deviceInfo: this.getDeviceInfo(),
                timestamp: Date.now()
            };

            console.log('[Login Request]', JSON.stringify(payload, null, 2));
            
            const response = await this.client.post('/auth/login', payload);
            
            if (response.data.code === 'SUCCESS') {
                this.accessToken = response.data.data.accessToken;
                this.updateHeaders();
                return response.data.data;
            }
            throw new Error(response.data.message);
        } catch (error) {
            console.error('[Login Error]', error.response?.data || error.message);
            throw error;
        }
    }

    async getBalance() {
        try {
            if (!this.accessToken) throw new Error('Not authenticated');
            
            const response = await this.client.get('/wallet/balance', {
                headers: { 'Authorization': `Bearer ${this.accessToken}` }
            });
            
            return {
                balance: response.data.data?.balance || 0,
                currency: 'IDR',
                lastUpdated: new Date().toISOString()
            };
        } catch (error) {
            console.error('[Balance Error]', error.message);
            throw error;
        }
    }

    async getTransactionHistory(options = {}) {
        const { page = 1, limit = 20 } = options;
        
        try {
            const payload = {
                page,
                limit,
                signature: this.generateSignature()
            };
            
            const response = await this.client.post('/transaction/history', payload);
            
            if (response.data.code === 'SUCCESS') {
                return {
                    transactions: response.data.data?.list || [],
                    total: response.data.data?.total || 0,
                    page
                };
            }
            throw new Error(response.data.message);
        } catch (error) {
            console.error('[History Error]', error.message);
            throw error;
        }
    }

    async transfer(recipientPhone, amount, notes = '') {
        if (amount <= 0) throw new Error('Amount must be greater than 0');
        
        try {
            const payload = {
                recipient: this.encryptData(recipientPhone),
                amount: this.encryptData(amount.toString()),
                notes: this.encryptData(notes),
                transferId: this.generateTransferId(),
                timestamp: Date.now(),
                signature: this.generateSignature()
            };
            
            const response = await this.client.post('/transfer/create', payload);
            
            return {
                success: response.data.code === 'SUCCESS',
                transferId: response.data.data?.transferId,
                status: response.data.data?.status,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('[Transfer Error]', error.message);
            throw error;
        }
    }

    // Helper Methods
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

    updateHeaders() {
        this.client.defaults.headers['Authorization'] = `Bearer ${this.accessToken}`;
    }
}

// ============ MAIN FUNCTION UNTUK TESTING ============
async function main() {
    console.log('🚀 Starting DANA Unofficial API Wrapper\n');
    
    // Cek environment variables
    if (!process.env.DANA_SESSION_ID) {
        console.error('❌ Error: DANA_SESSION_ID not found in .env file');
        console.log('\n📝 Please create .env file with:');
        console.log('DANA_SESSION_ID=your_alipayjsessionid_here');
        console.log('DANA_ENCRYPTION_KEY=your_key_here');
        console.log('DANA_IV=your_iv_here');
        console.log('DANA_PHONE=your_phone_number');
        console.log('DANA_PASSWORD=your_password');
        process.exit(1);
    }
    
    // Inisialisasi API
    const dana = new DanaUnofficialAPI({
        sessionId: process.env.DANA_SESSION_ID,
        baseURL: process.env.DANA_API_URL || 'https://api.dana.id/v1'
    });
    
    try {
        // 1. Login
        console.log('📱 Step 1: Login...');
        const loginResult = await dana.login(
            process.env.DANA_PHONE,
            process.env.DANA_PASSWORD
        );
        console.log('✅ Login successful!');
        console.log('   Access Token:', loginResult.accessToken?.substring(0, 20) + '...\n');
        
        // 2. Cek Saldo
        console.log('💰 Step 2: Checking balance...');
        const balance = await dana.getBalance();
        console.log(`   Balance: Rp ${balance.balance.toLocaleString('id-ID')}\n`);
        
        // 3. Get Mutasi
        console.log('📊 Step 3: Fetching transaction history...');
        const history = await dana.getTransactionHistory({ page: 1, limit: 5 });
        console.log(`   Found ${history.transactions.length} transactions:`);
        history.transactions.forEach((tx, i) => {
            console.log(`   ${i+1}. ${tx.type || 'Transaction'} - Rp ${tx.amount?.toLocaleString('id-ID') || 0}`);
        });
        
        // 4. Transfer (COMMENTED OUT - HIGH RISK)
        // console.log('\n💸 Step 4: Transfer (DISABLED for safety)...');
        // const transfer = await dana.transfer('08123456789', 10000, 'Test');
        // console.log('   Transfer result:', transfer);
        
        console.log('\n✨ All operations completed successfully!');
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.response?.data) {
            console.error('   Details:', error.response.data);
        }
    }
}

// Run main function
if (require.main === module) {
    main();
}

module.exports = { DanaUnofficialAPI };
