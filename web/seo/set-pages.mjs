import fs from 'node:fs';
const file = new URL('./data/seo.json', import.meta.url);
const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
const owner = process.argv[2] || 'serwmwser';
const repo = process.argv[3] || 'ads';
cfg.site.pages = {
  enabled: true,
  repo: owner + '/' + repo,
  origin: 'https://' + owner + '.github.io',
  basePath: '/' + repo,
  indexable: false,
  customDomain: ''
};
fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
console.log('Pages:', cfg.site.pages);
