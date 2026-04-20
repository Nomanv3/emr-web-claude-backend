#!/usr/bin/env node
// strip-mongo.cjs — Phase 4 Step F.2 helper.
// Handles both dual-mode patterns in this codebase:
//   A) `if (config.useMysql) { <mysql> } <mongo fallback> } catch (`
//   B) `if (config.useMysql) { <mysql> } else { <mongo fallback> }`
//
// Line-based — relies on the codebase's consistent 2-space indent.

const fs = require('fs');
const path = require('path');

function findCloseBrace(lines, openLine, indent) {
  const re = new RegExp(`^${indent}\\}\\s*$`);
  const reElse = new RegExp(`^${indent}\\}\\s*else\\s*\\{\\s*$`);
  for (let j = openLine + 1; j < lines.length; j++) {
    if (re.test(lines[j]) || reElse.test(lines[j])) return j;
  }
  return -1;
}
function findMatch(lines, fromLine, re) {
  for (let j = fromLine; j < lines.length; j++) {
    if (re.test(lines[j])) return j;
  }
  return -1;
}

function transform(src) {
  src = src.replace(/^import\s+\w+\s+from\s+['"]\.\.\/models\/[^'"]+['"];?\s*\n/gm, '');
  src = src.replace(/^import\s+\{[^}]+\}\s+from\s+['"]\.\.\/models\/[^'"]+['"];?\s*\n/gm, '');
  src = src.replace(/^import\s+config\s+from\s+['"]\.\.\/config\/env\.js['"];?\s*\n/gm, '');

  const lines = src.split('\n');
  const out = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^(\s*)if\s*\(\s*config\.useMysql\s*\)\s*\{\s*$/);
    if (!m) {
      out.push(line);
      continue;
    }
    const indent = m[1];
    const parentIndent = indent.slice(0, -2);

    // Find the close at SAME indent — could be `}` (fallback pattern) OR
    // `} else {` (if/else pattern).
    const closeIdx = findCloseBrace(lines, i, indent);
    if (closeIdx < 0) throw new Error(`No matching close at line ${i + 1}`);

    const closeLine = lines[closeIdx];
    const isElseForm = /^\s*\}\s*else\s*\{\s*$/.test(closeLine);

    let skipTo;
    if (isElseForm) {
      // Pattern B: skip everything from `} else {` through the next `}` at same indent.
      const elseCloseIdx = findMatch(lines, closeIdx + 1, new RegExp(`^${indent}\\}\\s*$`));
      if (elseCloseIdx < 0) throw new Error(`No matching else-close at line ${closeIdx + 1}`);
      skipTo = elseCloseIdx;
    } else {
      // Pattern A: skip fallback lines up to (but not including) the next
      // `} catch (` at parentIndent.
      const catchIdx = findMatch(lines, closeIdx + 1, new RegExp(`^${parentIndent}\\} catch \\(`));
      if (catchIdx < 0) throw new Error(`No } catch ( after line ${closeIdx + 1}`);
      skipTo = catchIdx - 1; // last line of fallback body; catch stays
    }

    // Un-indent body [i+1 .. closeIdx-1] by 2 spaces.
    for (let k = i + 1; k < closeIdx; k++) {
      const body = lines[k];
      if (body.length === 0 || !body.startsWith('  ')) out.push(body);
      else out.push(body.slice(2));
    }
    // Jump past fallback.
    i = skipTo;
  }

  let result = out.join('\n');
  if (/\bconfig\.\w+/.test(result) && !/^import\s+config\s+from\s+['"]\.\.\/config\/env\.js['"]/m.test(result)) {
    result = `import config from '../config/env.js';\n` + result;
  }
  return result;
}

const files = process.argv.slice(2);
if (files.length === 0) { console.error('Usage: strip-mongo.cjs <file>...'); process.exit(2); }
let fail = 0;
for (const f of files) {
  const abs = path.resolve(f);
  const src = fs.readFileSync(abs, 'utf8');
  try {
    const out = transform(src);
    fs.writeFileSync(abs, out);
    console.log(`[stripped] ${f}  (${src.length} → ${out.length} bytes, ${src.split('\n').length} → ${out.split('\n').length} lines)`);
  } catch (e) {
    console.error(`[FAILED] ${f}: ${e.message}`);
    fail++;
  }
}
if (fail > 0) process.exit(3);
