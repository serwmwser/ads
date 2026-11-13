import fs from 'node:fs';

const file = new URL('./data/seo.json', import.meta.url);
const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));

cfg.site.org = {
  name: 'Яковенко Сергей Владимирович (самозанятый)',
  inn: '263508859634',
  email: 'support@himeet.online'
};

function clean(node) {
  if (typeof node === 'string') {
    return node.replace(/ЗАМЕНИТЕ\s*:\s*/g, '').replace(/ЗАМЕНИТЕ/g, '').replace(/\s{2,}/g, ' ').trim();
  }
  if (Array.isArray(node)) return node.map(clean);
  if (node && typeof node === 'object') {
    for (const key of Object.keys(node)) node[key] = clean(node[key]);
    return node;
  }
  return node;
}
clean(cfg);
cfg.site.org.inn = cfg.site.org.inn.replace(/\D/g, '');

fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
console.log('Данные владельца:', cfg.site.org);
