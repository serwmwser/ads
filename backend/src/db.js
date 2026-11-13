import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { BACKEND_DIR, env } from './util.js';

const SQL_DIR = path.join(BACKEND_DIR, 'sql');
export const dbFile = path.resolve(BACKEND_DIR, env('SQLITE_FILE', './data/ads.db'));
fs.mkdirSync(path.dirname(dbFile), { recursive: true });

const db = new DatabaseSync(dbFile);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');

function normalize(values) {
  return values.map(v => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));
}

function compile(sql, params) {
  const args = [];
  const text = sql.replace(/\$(\d+)/g, (_, n) => { args.push(params[Number(n) - 1]); return '?'; });
  return { text, args: normalize(args) };
}

function exec(sql, params = []) {
  const { text, args } = compile(sql, params);
  const stmt = db.prepare(text);
  if (/^\s*(select|with|pragma)/i.test(text) || /\breturning\b/i.test(text)) {
    const rows = stmt.all(...args);
    return { rows, rowCount: rows.length };
  }
  const info = stmt.run(...args);
  return { rows: [], rowCount: Number(info.changes), lastInsertRowid: Number(info.lastInsertRowid) };
}

export const q = async (sql, params) => exec(sql, params);

export async function tx(fn) {
  db.exec('BEGIN');
  try {
    const result = await fn({ query: async (sql, params) => exec(sql, params) });
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export async function migrate() {
  await q("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))");
  const files = fs.readdirSync(SQL_DIR).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    const done = await q('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
    if (done.rowCount) { console.log('пропущен ' + file); continue; }
    const sql = fs.readFileSync(path.join(SQL_DIR, file), 'utf8');
    await tx(async (c) => {
      for (const statement of sql.split(/;\s*(?:\r?\n|$)/)) {
        const s = statement.trim();
        if (s) await c.query(s);
      }
      await c.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
    });
    console.log('применён ' + file);
  }
}

export function close() { db.close(); }
