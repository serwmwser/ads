import { migrate, close, dbFile } from './db.js';

try {
  await migrate();
  console.log('Миграции завершены. База: ' + dbFile);
} catch (e) {
  console.error('Ошибка миграции:', e && e.message ? e.message : e);
  console.error(e && e.stack ? e.stack : '');
  process.exitCode = 1;
} finally {
  close();
}
