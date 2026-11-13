import { q, close, dbFile } from './db.js';

try {
  const tables = await q("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name");
  const tariffs = await q('SELECT code, price_kopeks FROM tariffs ORDER BY sort');
  console.log('OK. База: ' + dbFile);
  console.log('Таблиц: ' + tables.rowCount + ' -> ' + tables.rows.map(t => t.name).join(', '));
  console.log('Тарифы: ' + JSON.stringify(tariffs.rows));
} catch (e) {
  console.error('FAIL:', e.message);
  process.exitCode = 1;
} finally {
  close();
}
