import express from 'express';
import bodyParser from 'body-parser';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import jwt from 'jsonwebtoken';

const PORT = process.env.WEBHOOK_PORT || 4000;
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(),'data','webhook.sqlite');
const SECRET = process.env.WEBHOOK_SECRET || 'whsec_test';
fs.mkdirSync(path.dirname(DB_PATH), { recursive:true });
const db = new Database(DB_PATH);
db.exec(`CREATE TABLE IF NOT EXISTS webhook_events (id INTEGER PRIMARY KEY, event_type TEXT, payload TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);

const app = express();
app.use(bodyParser.json({ verify: (req,res,buf)=>{ req.rawBody = buf; } }));

app.post('/webhook', (req,res)=>{
  const sig = req.header('X-Mock-Signature') || '';
  // verify signature: mock server signs with jwt using secret provided during register
  try{
    jwt.verify(sig, SECRET);
  }catch(e){
    return res.status(401).send('invalid signature');
  }
  const event = req.body;
  db.prepare('INSERT INTO webhook_events (event_type, payload) VALUES (?, ?)').run(event.type, JSON.stringify(event.data || {}));
  console.log('Webhook received:', event.type, event.data);
  res.json({ success:true });
});

app.get('/', (req, res) => res.send('OK'));
app.use(express.static(path.join(process.cwd(),'public')));
app.get('*', (req,res) => res.sendFile(path.join(process.cwd(),'public','index.html')));
app.listen(PORT, ()=> console.log(`Webhook receiver listening on ${PORT}`));
