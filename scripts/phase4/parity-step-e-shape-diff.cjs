// parity-step-e-shape-diff.cjs — compare captured responses by SHAPE, not value.
// Two responses are shape-equivalent iff every object key path + JS type
// (string|number|boolean|null|array|object) matches. Array element shapes are
// reduced to a single representative (union of all element shapes).
//
// Reason: Mongo cluster and MySQL db hold different records (migrated from a
// different source), so value-level diff is noise. Shape parity is what
// guarantees the frontend can consume either backend unchanged.

const fs = require('fs');
const path = require('path');

const MONGO_DIR = path.resolve(__dirname, 'baseline-mongo');
const MYSQL_DIR = path.resolve(__dirname, 'baseline-mysql');

// Keys that exist only on the Mongo side (Mongoose metadata) — ignore
// these when inspecting the MySQL side is missing them.
const MONGO_ONLY_KEYS = new Set(['__v', '_id']);

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function shape(v) {
  const t = typeOf(v);
  if (t !== 'array' && t !== 'object') return t;
  if (t === 'array') {
    if (v.length === 0) return { __array: 'empty' };
    // Merge all element shapes into one representative
    const merged = {};
    for (const el of v) {
      const s = shape(el);
      deepMergeShape(merged, s);
    }
    return { __array: merged };
  }
  const out = {};
  for (const k of Object.keys(v)) out[k] = shape(v[k]);
  return out;
}

function deepMergeShape(target, src) {
  const st = typeOf(src);
  if (st === 'string' || st === 'number' || st === 'boolean' || st === 'null') {
    if (!target.__leaf) target.__leaf = new Set();
    target.__leaf.add(src);
    return;
  }
  if (st === 'array') {
    // src is a shape object like { __array: ... }
    if (!target.__array) target.__array = {};
    deepMergeShape(target.__array, src.__array || {});
    return;
  }
  // object of field → shape
  for (const [k, v] of Object.entries(src)) {
    if (!target[k]) {
      target[k] = typeOf(v) === 'object' && !Array.isArray(v) ? {} : v;
    }
    if (typeOf(target[k]) === 'object' && typeOf(v) === 'object') {
      deepMergeShape(target[k], v);
    }
  }
}

function shapeDiff(a, b, pathStr, acc, side) {
  const ta = typeOf(a);
  const tb = typeOf(b);

  // Leaf-type sets (from merged arrays)
  if (a instanceof Set || b instanceof Set) {
    const aa = a instanceof Set ? [...a].sort().join('|') : a;
    const bb = b instanceof Set ? [...b].sort().join('|') : b;
    if (aa !== bb) acc.push(`${pathStr}: leaf types ${side==='mongo-only'?aa:bb} vs ${side==='mongo-only'?bb:aa}`);
    return;
  }

  if (ta === 'string' && tb === 'string') {
    if (a !== b) acc.push(`${pathStr}: type mongo=${a} mysql=${b}`);
    return;
  }
  if (ta !== tb) {
    // handle {__array} objects that may have been materialized differently
    acc.push(`${pathStr}: shape-type mongo=${ta} mysql=${tb}`);
    return;
  }
  if (ta === 'object') {
    const ak = new Set(Object.keys(a));
    const bk = new Set(Object.keys(b));
    for (const k of ak) {
      if (!bk.has(k)) {
        if (MONGO_ONLY_KEYS.has(k)) continue; // known mongoose-only metadata
        acc.push(`${pathStr}.${k}: MISSING in mysql`);
      } else {
        shapeDiff(a[k], b[k], `${pathStr}.${k}`, acc);
      }
    }
    for (const k of bk) {
      if (!ak.has(k)) acc.push(`${pathStr}.${k}: EXTRA in mysql`);
    }
  }
}

function loadBody(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return raw.body;
}

function hydrateShape(s) {
  if (!s || typeof s !== 'object') return s;
  if (Array.isArray(s)) return s;
  const out = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === '__leaf' && v instanceof Set) { out[k] = v; continue; }
    out[k] = hydrateShape(v);
  }
  return out;
}

function main() {
  const files = fs.readdirSync(MONGO_DIR).filter(f => f.endsWith('.json')).sort();
  let totalDiffs = 0;
  let filesWithDiffs = 0;
  const report = [];

  for (const f of files) {
    const mongoPath = path.join(MONGO_DIR, f);
    const mysqlPath = path.join(MYSQL_DIR, f);
    if (!fs.existsSync(mysqlPath)) {
      report.push({ file: f, status: 'MYSQL FILE MISSING', issues: [] });
      totalDiffs++;
      filesWithDiffs++;
      continue;
    }
    const mongoShape = shape(loadBody(mongoPath));
    const mysqlShape = shape(loadBody(mysqlPath));
    const diffs = [];
    shapeDiff(mongoShape, mysqlShape, f, diffs);
    if (diffs.length > 0) {
      report.push({ file: f, status: 'DIFFERS', issues: diffs });
      totalDiffs += diffs.length;
      filesWithDiffs++;
    } else {
      report.push({ file: f, status: 'OK', issues: [] });
    }
  }

  console.log('─── Shape-parity report ───');
  for (const r of report) {
    const icon = r.status === 'OK' ? '✅' : '❌';
    console.log(`${icon} ${r.file}: ${r.status}`);
    for (const i of r.issues) console.log(`    ${i}`);
  }
  console.log('');
  console.log(`Total files checked: ${files.length}`);
  console.log(`Files identical (shape): ${files.length - filesWithDiffs}`);
  console.log(`Files with shape diffs:  ${filesWithDiffs}`);
  console.log(`Total shape diffs:       ${totalDiffs}`);
  if (filesWithDiffs > 0) process.exit(1);
}

main();
