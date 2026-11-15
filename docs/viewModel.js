'use strict';

/**
 * Turns the OpenAPI spec into a flat, render-ready structure shared by the
 * in-app docs page (views/developers.ejs) and docs/API.md generation.
 */

function resolve(spec, schema) {
  if (!schema) return null;
  if (schema.$ref) return resolve(spec, spec.components.schemas[schema.$ref.split('/').pop()]);
  if (schema.allOf) {
    const merged = { type: 'object', properties: {}, required: [] };
    for (const part of schema.allOf) {
      const r = resolve(spec, part);
      if (!r) continue;
      Object.assign(merged.properties, r.properties || {});
      merged.required.push(...(r.required || []));
      if (r.description && !merged.description) merged.description = r.description;
    }
    return merged;
  }
  return schema;
}

function typeLabel(spec, s) {
  if (!s) return '';
  if (s.$ref) return s.$ref.split('/').pop();
  if (s.allOf) return s.allOf.map((x) => typeLabel(spec, x)).join(' + ');
  if (s.type === 'array') return `${typeLabel(spec, s.items)}[]`;
  let t = s.type || 'object';
  if (s.format === 'date') t = 'date';
  if (s.format === 'date-time') t = 'datetime';
  if (s.format === 'binary') t = 'file';
  return s.nullable ? `${t} | null` : t;
}

/** Top-level fields of a body / response schema (one level, refs named). */
function fields(spec, schema) {
  let s = resolve(spec, schema);
  if (!s) return [];
  if (s.type === 'array') s = resolve(spec, s.items) || {};
  const req = new Set(s.required || []);
  return Object.entries(s.properties || {}).map(([name, p]) => {
    const r = p.$ref ? resolve(spec, p) : p;
    return {
      name,
      type: typeLabel(spec, p),
      required: req.has(name),
      description: (r && r.description) || p.description || '',
      enum: (r && r.enum) || (p.items && p.items.enum) || null
    };
  });
}

function curl(op, method, path, base) {
  const isApiKey = op['x-auth'] === 'apiKey';
  const isSession = op['x-auth'] === 'session';
  let url = base + path.replace(/\{(\w+)\}/g, (_, n) => (n === 'externalRef' ? 'ledger-8831' : '1'));
  const required = (op.parameters || []).filter((p) => p.in === 'query' && p.required);
  if (required.length) url += '?' + required.map((p) => `${p.name}=${p.name === 'amount' ? 1000 : 'value'}`).join('&');
  const lines = [`curl -X ${method.toUpperCase()} '${url}'`];
  if (isApiKey) lines.push("  -H 'Authorization: Bearer mcb_你的金鑰'");
  if (isSession) lines.push("  -H 'Cookie: session=<登入後的 session cookie>'");
  const body = op.requestBody && op.requestBody.content['application/json'];
  if (body && body.example !== undefined) {
    lines.push("  -H 'Content-Type: application/json'");
    lines.push(`  -d '${JSON.stringify(body.example)}'`);
  }
  return lines.join(' \\\n');
}

function buildDocsModel(spec, origin = '') {
  const base = origin + (spec.servers && spec.servers[0] && spec.servers[0].url !== '/' ? spec.servers[0].url : '');
  const groups = new Map(spec.tags.map((t) => [t.name, { name: t.name, description: t.description, ops: [] }]));
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(methods)) {
      const tag = op.tags[0];
      if (!groups.has(tag)) groups.set(tag, { name: tag, description: '', ops: [] });
      const success = Object.entries(op.responses).find(([s]) => s.startsWith('2'));
      const successMedia = success[1].content['application/json'];
      const errors = [];
      for (const [status, r] of Object.entries(op.responses)) {
        if (status.startsWith('2')) continue;
        const ex = (r.content && r.content['application/json'] && r.content['application/json'].examples) || {};
        for (const [code, e] of Object.entries(ex)) errors.push({ status, code, description: e.summary });
      }
      const bodyMedia = op.requestBody && (op.requestBody.content['application/json'] || Object.values(op.requestBody.content)[0]);
      groups.get(tag).ops.push({
        id: `${method}-${path}`.replace(/[^a-zA-Z0-9]+/g, '-'),
        method,
        path,
        summary: op.summary,
        description: op.description || '',
        auth: op['x-auth'],
        params: (op.parameters || []).map((p) => ({ name: p.name, in: p.in, required: !!p.required, type: typeLabel(spec, p.schema), description: p.description, enum: p.schema && p.schema.enum })),
        multipart: !!(op.requestBody && op.requestBody.content['multipart/form-data']),
        bodyFields: bodyMedia ? fields(spec, bodyMedia.schema) : [],
        bodyExample: bodyMedia && bodyMedia.example !== undefined ? JSON.stringify(bodyMedia.example, null, 2) : null,
        status: success[0],
        responseFields: fields(spec, successMedia.schema),
        responseExample: typeof successMedia.example === 'string' ? successMedia.example : JSON.stringify(successMedia.example, null, 2),
        errors,
        curl: curl(op, method, path, base)
      });
    }
  }
  return { info: spec.info, base, groups: Array.from(groups.values()).filter((g) => g.ops.length) };
}

module.exports = { buildDocsModel, resolve };
