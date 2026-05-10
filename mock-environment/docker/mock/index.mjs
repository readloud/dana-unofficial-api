import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const PORT = process.env.MOCK_PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'changeme123';
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(),'data','mock.sqlite');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
initDb();

const app = express();
app.use(cors());
app.use(bodyParser.json());

/* Simple in-memory OTP store for mock */
const otpStore = new Map();

/* Utils */
function initDb(){
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT UNIQUE, created_at TEXT DEFAULT (CURRENT_TIMESTAMP));
    CREATE TABLE IF NOT EXISTS transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transfer_id TEXT UNIQUE,
      idempotency_key TEXT,
      from_phone TEXT,
      to_phone TEXT,
      amount INTEGER,
      fee INTEGER DEFAULT 0,
      status TEXT,
      meta TEXT,
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    );
    CREATE INDEX IF NOT EXISTS idx_transfers_status ON transfers(status);

    CREATE TABLE IF NOT EXISTS mutations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tx_id TEXT UNIQUE,
      date TEXT,
      type TEXT,
      amount INTEGER,
      balance INTEGER,
      description TEXT,
      counterparty TEXT,
      raw TEXT,
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    );
    CREATE INDEX IF NOT EXISTS idx_mutations_date ON mutations(date);

    CREATE TABLE IF NOT EXISTS refunds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      refund_id TEXT UNIQUE,
      original_transfer_id TEXT,
      amount INTEGER,
      status TEXT,
      meta TEXT,
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    );

    CREATE TABLE IF NOT EXISTS batch_payouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id TEXT UNIQUE,
      items TEXT,
      total_amount INTEGER,
      status TEXT,
      meta TEXT,
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    );
  `);
}

/* Helpers */
function signToken(payload){ return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' }); }
function verifyAuth(req,res,next){
  const h = req.header('Authorization') || '';
  if(!h.startsWith('Bearer ')) return res.status(401).json({ success:false, error:{ code:'auth_error', message:'missing token' }});
  const token = h.slice(7);
  try{
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  }catch(e){ return res.status(401).json({ success:false, error:{ code:'auth_error', message:'invalid token' } }); }
}

/* Routes */

/* POST /auth/login
  - Step 1: { phone } => send OTP (mock: store OTP)
  - Step 2: { phone, otp } => return access_token
*/
app.post('/auth/login', (req,res)=>{
  const { phone, otp } = req.body || {};
  if(!phone) return res.status(400).json({ success:false, error:{ code:'invalid_request', message:'phone required' }});
  if(!otp){
    const generated = Math.floor(100000 + Math.random()*900000).toString();
    otpStore.set(phone, generated);
    // In mock, we also ensure user exists
    const st = db.prepare('INSERT OR IGNORE INTO users (phone) VALUES (?)');
    st.run(phone);
    return res.json({ success:true, message:'otp_sent', otp: generated }); // otp returned for dev convenience
  }
  const expected = otpStore.get(phone);
  if(!expected || expected !== String(otp)) return res.status(400).json({ success:false, error:{ code:'invalid_otp', message:'otp invalid' }});
  otpStore.delete(phone);
  const token = signToken({ phone });
  return res.json({ success:true, access_token: token, expires_in:3600 });
});

/* GET /balance
  - mock: return fixed balance derived from database mutations sum
*/
app.get('/balance', verifyAuth, (req,res)=>{
  const phone = req.user.phone;
  const row = db.prepare('SELECT SUM(amount) as total FROM mutations WHERE counterparty = ? OR 1=1').get(phone);
  // For simplicity, mock starting balance 1_000_000
  const starting = 1000000;
  const total = row && row.total ? row.total : 0;
  const balance = starting + total;
  return res.json({ success:true, balance, currency:'IDR', available:balance, hold:0 });
});

/* POST /transfer
  - body: { to, amount, note, idempotency_key }
  - checks idempotency_key -> if exists return existing transfer
  - returns transfer_id and status pending or success
*/
app.post('/transfer', verifyAuth, (req,res)=>{
  const phone = req.user.phone;
  const { to, amount, note, idempotency_key } = req.body || {};
  if(!to || !amount || !idempotency_key) return res.status(400).json({ success:false, error:{ code:'invalid_request', message:'to, amount, idempotency_key required' }});
  // idempotency check
  const exists = db.prepare('SELECT * FROM transfers WHERE idempotency_key = ?').get(idempotency_key);
  if(exists) return res.json({ success:true, transfer_id: exists.transfer_id, status: exists.status, meta: JSON.parse(exists.meta||'null') });
  // simple balance check
  const balRow = db.prepare('SELECT SUM(amount) as total FROM mutations WHERE counterparty = ? OR 1=1').get(phone);
  const starting = 1000000;
  const current = starting + (balRow && balRow.total ? balRow.total : 0);
  if(current < amount) return res.status(402).json({ success:false, error:{ code:'insufficient_funds', message:'not enough balance' }});
  const transfer_id = uuidv4();
  const fee = Math.round(amount * 0.005); // 0.5% mock fee
  const status = 'pending';
  const meta = { note, initiated_by: phone };
  db.prepare('INSERT INTO transfers (transfer_id, idempotency_key, from_phone, to_phone, amount, fee, status, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(transfer_id, idempotency_key, phone, to, amount, fee, status, JSON.stringify(meta));
  // also create mutation record for debit (mock will finalize later)
  const tx_id = uuidv4();
  db.prepare('INSERT INTO mutations (tx_id, date, type, amount, balance, description, counterparty, raw) VALUES (?, datetime("now"), ?, ?, ?, ?, ?, ?)').run(tx_id, new Date().toISOString(), -amount - fee, null, `Transfer to ${to}`, to, JSON.stringify({ transfer_id, status }));
  // emit webhook (simulate async finalization)
  setTimeout(()=> finalizeTransfer(transfer_id), 2000);
  return res.json({ success:true, transfer_id, status, timestamp: new Date().toISOString(), fee });
});

/* GET /transfer/:id */
app.get('/transfer/:id', verifyAuth, (req,res)=>{
  const t = db.prepare('SELECT * FROM transfers WHERE transfer_id = ?').get(req.params.id);
  if(!t) return res.status(404).json({ success:false, error:{ code:'not_found', message:'transfer not found' }});
  return res.json({ success:true, transfer_id: t.transfer_id, status: t.status, amount: t.amount, to: t.to_phone, fee: t.fee, meta: JSON.parse(t.meta || 'null'), timestamp: t.created_at });
});

/* GET /mutations */
app.get('/mutations', verifyAuth, (req,res)=>{
  const { start_date, end_date, limit=50, page=1 } = req.query;
  const offset = (page-1)*limit;
  // simple query; in mock we ignore dates for now
  const rows = db.prepare('SELECT tx_id as id, date, type, amount, balance, description, counterparty FROM mutations ORDER BY date DESC LIMIT ? OFFSET ?').all(Number(limit), Number(offset));
  return res.json({ success:true, transactions: rows, pagination:{ page: Number(page), limit: Number(limit), total: rows.length }});
});

/* POST /refund */
app.post('/refund', verifyAuth, (req,res)=>{
  const { original_transfer_id, amount, idempotency_key } = req.body || {};
  if(!original_transfer_id || !amount || !idempotency_key) return res.status(400).json({ success:false, error:{ code:'invalid_request' }});
  // idempotency simple: if refund exists for same original and idempotency -> return it
  const exists = db.prepare('SELECT * FROM refunds WHERE meta = ?').get(idempotency_key);
  if(exists) return res.json({ success:true, refund_id: exists.refund_id, status: exists.status });
  const refId = uuidv4();
  const status = 'processing';
  db.prepare('INSERT INTO refunds (refund_id, original_transfer_id, amount, status, meta) VALUES (?, ?, ?, ?, ?)').run(refId, original_transfer_id, amount, status, idempotency_key);
  // simulate async completion
  setTimeout(()=>{
    db.prepare('UPDATE refunds SET status = ? WHERE refund_id = ?').run('success', refId);
    // emit webhook event
    emitWebhook({ type:'refund.created', data: { refund_id: refId, original_transfer_id, amount, status:'success' } });
  }, 1500);
  return res.json({ success:true, refund_id: refId, status });
});

/* POST /batch_payout */
app.post('/batch_payout', verifyAuth, (req,res)=>{
  const { items, idempotency_key } = req.body || {};
  if(!Array.isArray(items) || !idempotency_key) return res.status(400).json({ success:false, error:{ code:'invalid_request' }});
  const batch_id = uuidv4();
  const total = items.reduce((s,it)=> s + (it.amount||0), 0);
  db.prepare('INSERT INTO batch_payouts (batch_id, items, total_amount, status, meta) VALUES (?, ?, ?, ?, ?)').run(batch_id, JSON.stringify(items), total, 'processing', idempotency_key);
  // simulate processing each item
  setTimeout(()=>{
    db.prepare('UPDATE batch_payouts SET status = ? WHERE batch_id = ?').run('completed', batch_id);
    emitWebhook({ type:'batch_payout.completed', data: { batch_id, total, status:'completed' } });
  }, 3000);
  return res.json({ success:true, batch_id, total_amount: total, status:'processing' });
});

/* Webhook simulator endpoint to register receiver URL (optional) */
const webhookReceivers = []; // array of { url, secret }
app.post('/webhook/register', (req,res)=>{
  const { url, secret } = req.body || {};
  if(!url || !secret) return res.status(400).json({ success:false });
  webhookReceivers.push({ url, secret });
  return res.json({ success:true });
});

function emitWebhook(event){
  // POST to all registered receivers
  import('node-fetch').then(({default: fetch})=>{
    const payload = JSON.stringify(event);
    for(const r of webhookReceivers){
      const sig = jwt.sign({ iat: Math.floor(Date.now()/1000) }, r.secret);
      fetch(r.url, { method:'POST', body: payload, headers: { 'Content-Type':'application/json', 'X-Mock-Signature': sig } }).catch(()=>{});
    }
  });
}

/* finalizeTransfer simulates confirmation and webhook */
function finalizeTransfer(transfer_id){
  const t = db.prepare('SELECT * FROM transfers WHERE transfer_id = ?').get(transfer_id);
  if(!t) return;
  // mark success
  db.prepare('UPDATE transfers SET status = ? WHERE transfer_id = ?').run('success', transfer_id);
  // update mutation record raw to indicate success
  db.prepare('UPDATE mutations SET raw = ? WHERE raw LIKE ?').run(JSON.stringify({ transfer_id, status:'success' }), `%${transfer_id}%`);
  // emit webhook
  emitWebhook({ type:'transfer.updated', data: { transfer_id, status:'success', amount: t.amount, to: t.to_phone } });
}

app.get('/', (req, res) => res.send('OK'));
app.use(express.static(path.join(process.cwd(),'public')));
app.get('*', (req,res) => res.sendFile(path.join(process.cwd(),'public','index.html')));

app.listen(PORT, ()=> console.log(`Mock server running on ${PORT}`));
