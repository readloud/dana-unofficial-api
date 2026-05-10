import express from 'express';
import axios from 'axios';
import { load } from 'cheerio';
import dotenv from 'dotenv';
import winston from 'winston';

dotenv.config();

const app = express();
app.use(express.json());

// Logger configuration
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'dana-api.log' }),
    new winston.transports.Console({ format: winston.format.simple() })
  ]
});

// Configuration
const config = {
  sessionId: process.env.DANA_SESSION_ID || '',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  baseUrl: 'https://www.dana.id',
  apiBaseUrl: 'https://api.dana.id',
  timeout: 30000,
  retryAttempts: 3,
  retryDelay: 5000
};

// Axios instance with session
const danaClient = axios.create({
  baseURL: config.apiBaseUrl,
  timeout: config.timeout,
  headers: {
    'User-Agent': config.userAgent,
    'Cookie': `ALIPAYJSESSIONID=${config.sessionId}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

// Token storage
let csrfToken = null;
let tokenExpiry = null;

// Function to get CSRF token from main page
async function getCsrfToken() {
  try {
    logger.info('Fetching CSRF token from DANA...');
    const response = await axios.get(config.baseUrl, {
      headers: { 'User-Agent': config.userAgent }
    });
    
	const $ = load(response.data);
	const token = $('meta[name="csrf-token"]').attr('content') ||
              $('input[name="_token"]').attr('value');

    
    if (token) {
      csrfToken = token;
      tokenExpiry = Date.now() + 3600000; // 1 hour expiry
      logger.info('CSRF token obtained successfully');
      return token;
    }
    throw new Error('CSRF token not found');
  } catch (error) {
    logger.error(`Failed to get CSRF token: ${error.message}`);
    throw error;
  }
}

// Middleware to ensure valid token
async function ensureToken(req, res, next) {
  if (!csrfToken || Date.now() >= tokenExpiry) {
    try {
      await getCsrfToken();
    } catch (error) {
      return res.status(401).json({
        success: false,
        error: 'Authentication failed',
        message: 'Unable to obtain CSRF token'
      });
    }
  }
  next();
}

// Retry wrapper
async function withRetry(fn, context) {
  let lastError;
  for (let i = 0; i < config.retryAttempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      logger.warn(`Attempt ${i + 1} failed for ${context}: ${error.message}`);
      
      if (error.response?.status === 401 || error.response?.status === 403) {
        // Token might be expired, refresh
        await getCsrfToken();
      }
      
      if (i < config.retryAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, config.retryDelay));
      }
    }
  }
  throw lastError;
}

app.get('/', (req, res) => {
  res.send('DANA Unofficial API is running. See /api/* endpoints.');
});
app.get('/', (req, res) => {
  res.json({ ok: true, service: 'dana-unofficial-api', date: '2026-05-09' });
});

// ============ API ENDPOINTS ============

// 1. GET TRANSACTION HISTORY (MUTASI)
app.get('/api/mutasi', ensureToken, async (req, res) => {
  const { page = 1, limit = 20, startDate, endDate } = req.query;
  
  try {
    const result = await withRetry(async () => {
      // Note: These endpoints are based on observation and may change
      const response = await danaClient.get('/mapi/my/transaction/list', {
        params: {
          pageNo: page,
          pageSize: limit,
          startTime: startDate,
          endTime: endDate,
          _csrf: csrfToken
        }
      });
      
      if (response.data.code === '200' || response.data.code === 'SUCCESS') {
        return {
          success: true,
          data: response.data.data?.list || response.data.data || [],
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: response.data.data?.total || response.data.data?.list?.length || 0
          }
        };
      } else {
        throw new Error(response.data.message || 'Failed to fetch transactions');
      }
    }, 'fetch_mutation');
    
    res.json(result);
  } catch (error) {
    logger.error(`Mutation fetch error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch transaction history',
      message: error.message
    });
  }
});

// 2. GET BALANCE
app.get('/api/balance', ensureToken, async (req, res) => {
  try {
    const result = await withRetry(async () => {
      const response = await danaClient.get('/mapi/my/balance', {
        params: { _csrf: csrfToken }
      });
      
      if (response.data.code === '200' || response.data.code === 'SUCCESS') {
        return {
          success: true,
          balance: response.data.data?.balance || response.data.data?.availableBalance || 0,
          currency: 'IDR'
        };
      } else {
        throw new Error(response.data.message || 'Failed to fetch balance');
      }
    }, 'fetch_balance');
    
    res.json(result);
  } catch (error) {
    logger.error(`Balance fetch error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch balance',
      message: error.message
    });
  }
});

// 3. TRANSFER FUNDS
app.post('/api/transfer', ensureToken, async (req, res) => {
  const { phoneNumber, amount, note, pin } = req.body;
  
  // Validation
  if (!phoneNumber || !amount || amount <= 0) {
    return res.status(400).json({
      success: false,
      error: 'Invalid parameters',
      message: 'Phone number and valid amount are required'
    });
  }
  
  try {
    const result = await withRetry(async () => {
      // Prepare transfer payload (simplified - actual implementation may vary)
      const payload = {
        receiverPhoneNumber: phoneNumber,
        amount: parseInt(amount),
        note: note || 'Transfer via API',
        payMethod: 'BALANCE',
        _csrf: csrfToken
      };
      
      // Add PIN if required
      if (pin) {
        payload.pin = pin;
        payload.encryptedPin = Buffer.from(pin).toString('base64'); // Simplified
      }
      
      const response = await danaClient.post('/mapi/my/transfer', payload);
      
      if (response.data.code === '200' || response.data.code === 'SUCCESS') {
        return {
          success: true,
          transactionId: response.data.data?.orderId || response.data.data?.transactionId,
          amount: amount,
          receiver: phoneNumber,
          status: 'completed',
          timestamp: new Date().toISOString()
        };
      } else if (response.data.code === 'NEED_PIN') {
        return {
          success: false,
          error: 'PIN_REQUIRED',
          message: 'PIN is required to complete this transaction'
        };
      } else {
        throw new Error(response.data.message || 'Transfer failed');
      }
    }, 'transfer_funds');
    
    res.json(result);
  } catch (error) {
    logger.error(`Transfer error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Transfer failed',
      message: error.message
    });
  }
});

// 4. GET TRANSACTION DETAIL
app.get('/api/transaction/:id', ensureToken, async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await withRetry(async () => {
      const response = await danaClient.get(`/mapi/my/transaction/detail`, {
        params: { orderId: id, _csrf: csrfToken }
      });
      
      if (response.data.code === '200' || response.data.code === 'SUCCESS') {
        return {
          success: true,
          transaction: response.data.data
        };
      } else {
        throw new Error(response.data.message || 'Transaction not found');
      }
    }, 'fetch_transaction_detail');
    
    res.json(result);
  } catch (error) {
    logger.error(`Transaction detail error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch transaction details',
      message: error.message
    });
  }
});

// 5. POLLING MUTASI (Real-time monitoring)
let pollingInterval = null;
let activePollers = new Map();

app.post('/api/mutasi/poll/start', ensureToken, (req, res) => {
  const { callbackUrl, interval = 5000, userId } = req.body;
  
  if (!callbackUrl || !userId) {
    return res.status(400).json({
      success: false,
      error: 'callbackUrl and userId are required'
    });
  }
  
  // Stop existing poller for this user
  if (activePollers.has(userId)) {
    clearInterval(activePollers.get(userId));
  }
  
  // Start new poller
  const poller = setInterval(async () => {
    try {
      const response = await danaClient.get('/mapi/my/transaction/list', {
        params: { pageNo: 1, pageSize: 10, _csrf: csrfToken }
      });
      
      if (response.data.code === '200') {
        // Send webhook notification
        await axios.post(callbackUrl, {
          userId: userId,
          timestamp: new Date().toISOString(),
          transactions: response.data.data?.list || []
        }, { timeout: 5000 });
      }
    } catch (error) {
      logger.error(`Polling error for user ${userId}: ${error.message}`);
    }
  }, interval);
  
  activePollers.set(userId, poller);
  
  res.json({
    success: true,
    message: 'Polling started',
    interval: `${interval}ms`,
    userId: userId
  });
});

app.post('/api/mutasi/poll/stop', (req, res) => {
  const { userId } = req.body;
  
  if (activePollers.has(userId)) {
    clearInterval(activePollers.get(userId));
    activePollers.delete(userId);
    res.json({ success: true, message: 'Polling stopped' });
  } else {
    res.status(404).json({ success: false, error: 'No active poller found for this user' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.stack}`);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`DANA Unofficial API running on port ${PORT}`);
  console.log(`   Server started at http://localhost:${PORT}`);
  console.log(` Available endpoints:`);
  console.log(`   GET  /api/mutasi - Get transaction history`);
  console.log(`   GET  /api/balance - Check balance`);
  console.log(`   POST /api/transfer - Send money`);
  console.log(`   GET  /api/transaction/:id - Get transaction detail`);
  console.log(`   POST /api/mutasi/poll/start - Start real-time monitoring`);
  console.log(`   POST /api/mutasi/poll/stop - Stop monitoring`);
});
