// Quick check before committing:   node tools/check.mjs
// - every js/*.js file is listed in PARTS in index.html (and every listed file exists)
// - the joined code parses as one ES module (catches syntax errors before they reach the live site)
// Needs Node.js 18+. It does not run the site; open it in a browser for that.
import { readFileSync, readdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const m = html.match(/const PARTS = \[([\s\S]*?)\];/);
if (!m) { console.error('✗ index.html: PARTS list not found'); process.exit(1); }
const parts = [...m[1].matchAll(/'([^']+\.js)'/g)].map((x) => x[1]);
const scanModule = html.match(/const SCAN_MODULE = "([^"]+)"/)?.[1];
// The scan loader has a hash-pinned production copy; its unbundled source mirror is not a second module.
const files = readdirSync(join(root, 'js')).filter((f) => f.endsWith('.js') &&
  !(f === '04d-va-hall-scan.js' && scanModule && parts.includes(scanModule))).sort();

let ok = true;
for (const f of files) if (!parts.includes(f)) { console.error(`✗ js/${f} is not listed in PARTS in index.html`); ok = false; }
for (const p of parts) if (!files.includes(p)) { console.error(`✗ PARTS lists js/${p}, but the file does not exist`); ok = false; }
if (!ok) process.exit(1);

// join exactly like the loader in index.html, then let Node parse it as a module
const code = parts.map((p) => `/* ===== js/${p} ===== */\n` + readFileSync(join(root, 'js', p), 'utf8')).join('\n');
const tmp = join(root, `.check-${process.pid}.tmp.mjs`);
writeFileSync(tmp, code);
try {
  execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
} catch (e) {
  const msg = String(e.stderr || e.message);
  // map the line number in the joined code back to the source file
  const ln = Number((msg.match(/\.tmp\.mjs:(\d+)/) || [])[1]);
  if (ln) {
    let line = 0;
    for (const p of parts) {
      const n = (`/* ===== js/${p} ===== */\n` + readFileSync(join(root, 'js', p), 'utf8')).split('\n').length;
      if (ln <= line + n) { console.error(`✗ syntax error in js/${p} near line ${ln - line - 1}`); break; }
      line += n;
    }
  }
  console.error(msg.replace(/^.*\.tmp\.mjs:\d+\n/, '').trim());
  ok = false;
} finally { unlinkSync(tmp); }
if (!ok) process.exit(1);
console.log(`✓ ${parts.length} js files listed and the code parses`);
