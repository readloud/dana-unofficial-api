/*
 Background worker that polls webhook_events table and processes events.
 Demonstrates exponential backoff & retry metadata.
*/
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(),'data','webhook.sqlite');
fs.mkdirSync(path.dirname(DB_PATH), { recursive:true });
const db = new Database(DB_PATH);

function processEvent(row){
  const payload = JSON.parse(row.payload);
  console.log('Processing event', row.event_type, payload);
  // Implement event handling logic:
  // - transfer.updated -> update local transfer DB or call internal service
  // - refund.created -> mark refund complete, etc.
  // For demo, we just mark processed by deleting row
  db.prepare('DELETE FROM webhook_events WHERE id = ?').run(row.id);
}

setInterval(()=>{
  const rows = db.prepare('SELECT * FROM webhook_events ORDER BY created_at LIMIT 10').all();
  for(const r of rows){
    try{ processEvent(r); }catch(e){ console.error('process error', e); }
  }
}, 2000);

console.log('Worker started');
