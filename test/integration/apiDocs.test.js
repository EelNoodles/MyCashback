'use strict';

/**
 * Guards the "every API has integration docs" rule: walks the real Express
 * router and fails if any route is missing from docs/openapi.js, or if a
 * documented operation lacks a summary, examples or error codes.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../support/harness');
const { buildSpec } = require('../../docs/openapi');

function mountPath(layer) {
  if (!layer.regexp || layer.regexp.fast_slash) return '';
  const src = layer.regexp.source
    .replace('^\\/', '/')
    .replace('\\/?(?=\\/|$)', '')
    .replace(/\\\//g, '/')
    .replace(/\$$/, '');
  return src === '^' ? '' : src;
}

function collectRoutes(stack, prefix = '', out = []) {
  for (const layer of stack) {
    if (layer.route) {
      const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
      for (const p of paths) {
        for (const m of Object.keys(layer.route.methods)) {
          if (m === '_all') continue;
          out.push({ method: m, path: (prefix + p).replace(/\/+$/, '') || '/' });
        }
      }
    } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
      collectRoutes(layer.handle.stack, prefix + mountPath(layer), out);
    }
  }
  return out;
}

const toOpenApi = (p) => p.replace(/:([A-Za-z]+)/g, '{$1}');

test('every Express route is documented in the OpenAPI spec', () => {
  const app = require('../../app').createApp({ auth: H.stubAuth, optionalAuth: (q, r, n) => n(), quiet: true });
  const routes = collectRoutes(app._router.stack)
    .filter((r) => r.path.startsWith('/api') || r.path.startsWith('/auth') || ['/healthz', '/manifest.webmanifest', '/firebase-messaging-sw.js', '/sw.js'].includes(r.path));
  assert.ok(routes.length > 60, `expected many routes, found ${routes.length}`);
  const spec = buildSpec();
  const missing = routes.filter((r) => !(spec.paths[toOpenApi(r.path)] && spec.paths[toOpenApi(r.path)][r.method]));
  assert.deepEqual(missing, [], 'undocumented routes:\n' + missing.map((r) => `${r.method.toUpperCase()} ${r.path}`).join('\n'));

  // and nothing documented that doesn't exist
  const real = new Set(routes.map((r) => `${r.method} ${toOpenApi(r.path)}`));
  const stale = [];
  for (const [p, methods] of Object.entries(spec.paths)) {
    for (const m of Object.keys(methods)) if (!real.has(`${m} ${p}`)) stale.push(`${m.toUpperCase()} ${p}`);
  }
  assert.deepEqual(stale, [], 'documented but not routed:\n' + stale.join('\n'));
});

test('every operation has a summary, success example and auth info; mutations document a body', () => {
  const spec = buildSpec();
  for (const [p, methods] of Object.entries(spec.paths)) {
    for (const [m, op] of Object.entries(methods)) {
      const where = `${m.toUpperCase()} ${p}`;
      assert.ok(op.summary, `${where}: summary`);
      assert.ok(op.tags && op.tags.length, `${where}: tag`);
      assert.ok(op['x-auth'], `${where}: auth`);
      const ok = Object.entries(op.responses).find(([s]) => s.startsWith('2'));
      assert.ok(ok, `${where}: success response`);
      assert.ok(ok[1].content['application/json'].example !== undefined, `${where}: success example`);
      if (op['x-auth'] !== 'none') assert.ok(op.responses['401'], `${where}: documents 401`);
      for (const prm of op.parameters || []) assert.ok(prm.description, `${where}: param ${prm.name} description`);
      if (['post', 'put'].includes(m) && !['/auth/logout'].includes(p)) {
        assert.ok(op.requestBody, `${where}: request body`);
        const media = op.requestBody.content['application/json'];
        assert.ok(media && media.example !== undefined, `${where}: request example`);
      }
    }
  }
});

test('spec $refs all resolve', () => {
  const spec = buildSpec();
  const refs = new Set();
  (function walk(o) {
    if (!o || typeof o !== 'object') return;
    if (o.$ref) refs.add(o.$ref);
    Object.values(o).forEach(walk);
  })(spec);
  for (const r of refs) {
    const name = r.replace('#/components/schemas/', '');
    assert.ok(spec.components.schemas[name], `unresolved ${r}`);
  }
});

test('the spec is served publicly and the docs page renders', async (t) => {
  if (!(await H.dbAvailable())) return t.skip('database not available');
  const srv = await H.start({ reset: false });
  try {
    const r = await srv.get('/api/docs/openapi.json', { user: null });
    assert.equal(r.status, 200);
    assert.equal(r.body.openapi, '3.0.3');
    assert.match(r.body.servers[0].url, /^http:\/\/127\.0\.0\.1:\d+/);
    const page = await srv.call('GET', '/developers', { headers: { Accept: 'text/html' }, raw: true });
    assert.equal(page.status, 200);
    assert.match(page.text, /POST/);
    assert.match(page.text, /\/api\/ingest\/card-transactions/);
    assert.match(page.text, /curl/);
  } finally {
    await srv.stop();
    await H.sequelize.close().catch(() => {});
  }
});
