'use strict';

/**
 * Regenerates docs/API.md from docs/openapi.js (the same source the in-app
 * docs page and /api/docs/openapi.json use).
 *
 *   npm run docs:api           # write docs/API.md
 *   npm run docs:api -- --check # exit 1 if docs/API.md is out of date
 */
const fs = require('fs');
const path = require('path');
const { buildSpec } = require('../docs/openapi');
const { buildDocsModel } = require('../docs/viewModel');

const AUTH = { apiKey: 'API 金鑰', session: '登入 Session', none: '公開' };
const BASE = 'https://你的網域';

function table(rows, head) {
  if (!rows.length) return '';
  const esc = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  return [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`)].join('\n') + '\n';
}

function render() {
  const spec = buildSpec({ baseUrl: '' });
  const m = buildDocsModel(spec, BASE);
  const out = [];
  out.push(`# ${m.info.title}（v${m.info.version}）`, '');
  out.push('> 本文件由 `npm run docs:api` 依 `docs/openapi.js` 自動產生，請勿手動修改。App 內「設定 → API 串接文件」與 `GET /api/docs/openapi.json` 使用同一份來源。', '');
  out.push(m.info.description, '');
  out.push('## 目錄', '');
  for (const g of m.groups) out.push(`- [${g.name}](#${g.name.toLowerCase().replace(/[：]/g, '').replace(/\s+/g, '-')})（${g.ops.length}）`);
  out.push('');
  for (const g of m.groups) {
    out.push(`## ${g.name}`, '', g.description || '', '');
    for (const op of g.ops) {
      out.push(`### \`${op.method.toUpperCase()} ${op.path}\` — ${op.summary}`, '');
      out.push(`**認證**：${AUTH[op.auth]}`, '');
      if (op.description) out.push(op.description, '');
      if (op.params.length) {
        out.push('**參數**', '');
        out.push(table(op.params.map((p) => [`\`${p.name}\`${p.required ? ' *' : ''}`, p.in === 'path' ? 'path' : 'query', p.type, p.description + (p.enum ? `（${p.enum.join(' / ')}）` : '')]), ['名稱', '位置', '型別', '說明']));
      }
      if (op.bodyFields.length) {
        out.push(`**Request body**（${op.multipart ? 'JSON 或 multipart/form-data' : 'JSON'}）`, '');
        out.push(table(op.bodyFields.map((f) => [`\`${f.name}\`${f.required ? ' *' : ''}`, f.type, f.description + (f.enum ? `（${f.enum.join(' / ')}）` : '')]), ['欄位', '型別', '說明']));
        if (op.bodyExample) out.push('```json', op.bodyExample, '```', '');
      }
      out.push(`**回應 ${op.status}**`, '');
      if (op.responseFields.length) out.push(table(op.responseFields.map((f) => [`\`${f.name}\``, f.type, f.description + (f.enum ? `（${f.enum.join(' / ')}）` : '')]), ['欄位', '型別', '說明']));
      out.push('```json', op.responseExample, '```', '');
      if (op.errors.length) {
        out.push('**錯誤**', '');
        out.push(table(op.errors.map((e) => [e.status, `\`${e.code}\``, e.description]), ['HTTP', 'error', '說明']));
      }
      out.push('**範例**', '', '```bash', op.curl, '```', '');
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

const target = path.join(__dirname, '..', 'docs', 'API.md');
const content = render();
if (process.argv.includes('--check')) {
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  if (current !== content) {
    console.error('docs/API.md is out of date — run `npm run docs:api`');
    process.exit(1);
  }
  console.log('docs/API.md is up to date');
} else {
  fs.writeFileSync(target, content);
  console.log(`wrote ${target} (${content.length} bytes)`);
}
