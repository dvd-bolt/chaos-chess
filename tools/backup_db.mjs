// Резервная копия базы онлайна: node --no-warnings tools/backup_db.mjs [база] [папка] [сколько хранить]
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
const [db = 'data/chaos.db', dir = 'data/backups', keep = '14'] = process.argv.slice(2);
fs.mkdirSync(dir, { recursive: true });
const name = path.join(dir, `chaos_${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}.db`);
new DatabaseSync(db).exec(`VACUUM INTO '${name.replace(/'/g, "''")}'`);
const check = new DatabaseSync(name, { readOnly: true }).prepare('SELECT COUNT(*) n FROM games').get();
const old = fs.readdirSync(dir).filter(f => /^chaos_\d+\.db$/.test(f)).sort().reverse().slice(Number(keep));
for (const f of old) fs.unlinkSync(path.join(dir, f));
console.log(`копия ${name}: партий ${check.n}, удалено старых ${old.length}`);
