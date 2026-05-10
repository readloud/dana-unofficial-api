// migrate-add-columns-and-indexes.js
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(),'data','mock.sqlite');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

function columnExists(table, column){
  const row = db.prepare("PRAGMA table_info(? )").get(table);
  // fallback check using a query on sqlite_master if PRAGMA with param fails
  const info = db.prepare(`PRAGMA table_info(${table})`).all();
  return info.some(c => c.name === column);
}

function run(){
  const tx = db.transaction(()=>{
    // transfers table
    db.prepare(`
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
    `).run();

    // add missing columns to transfers if table existed without them
    const transfersCols = db.prepare(`PRAGMA table_info(transfers)`).all().map(c => c.name);
    if(!transfersCols.includes('from_phone')) db.prepare(`ALTER TABLE transfers ADD COLUMN from_phone TEXT`).run();
    if(!transfersCols.includes('to_phone')) db.prepare(`ALTER TABLE transfers ADD COLUMN to_phone TEXT`).run();
    if(!transfersCols.includes('fee')) db.prepare(`ALTER TABLE transfers ADD COLUMN fee INTEGER DEFAULT 0`).run();
    if(!transfersCols.includes('meta')) db.prepare(`ALTER TABLE transfers ADD COLUMN meta TEXT`).run();
    if(!transfersCols.includes('created_at')) db.prepare(`ALTER TABLE transfers ADD COLUMN created_at TEXT DEFAULT (CURRENT_TIMESTAMP)`).run();

    // ensure index on status
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_transfers_status ON transfers(status)`).run();

    // mutations table
    db.prepare(`
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
    `).run();

    const mutationsCols = db.prepare(`PRAGMA table_info(mutations)`).all().map(c => c.name);
    if(!mutationsCols.includes('date')) db.prepare(`ALTER TABLE mutations ADD COLUMN date TEXT`).run();
    if(!mutationsCols.includes('raw')) db.prepare(`ALTER TABLE mutations ADD COLUMN raw TEXT`).run();
    if(!mutationsCols.includes('created_at')) db.prepare(`ALTER TABLE mutations ADD COLUMN created_at TEXT DEFAULT (CURRENT_TIMESTAMP)`).run();

    db.prepare(`CREATE INDEX IF NOT EXISTS idx_mutations_date ON mutations(date)`).run();

    // refunds table
    db.prepare(`
      CREATE TABLE IF NOT EXISTS refunds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        refund_id TEXT UNIQUE,
        original_transfer_id TEXT,
        amount INTEGER,
        status TEXT,
        meta TEXT,
        created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
      );
    `).run();

    // batch_payouts table
    db.prepare(`
      CREATE TABLE IF NOT EXISTS batch_payouts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id TEXT UNIQUE,
        items TEXT,
        total_amount INTEGER,
        status TEXT,
        meta TEXT,
        created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
      );
    `).run();
  });

  tx();
  console.log('Migration complete.');
}

try{
  run();
  db.close();
} catch(err){
  console.error('Migration failed:', err);
  try{ db.close(); }catch(e){}
  process.exit(1);
}
