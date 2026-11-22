// SPDX-License-Identifier: MIT

// The independence acceptance test. It runs in a fresh container with the network switched off,
// after the published packages and the Python validator were installed in it, and checks that
// Wirelith works with no account, no service and no network:
//
//   1. one CLI command turns a markdown file containing wirelith fences into PNGs;
//   2. the MCP server starts over stdio, and a scripted client validates and renders through it;
//   3. the Python validator validates the same source, with the same diagnostics as core;
//   4. the built packages contain no network-capable import in core, no reference to a host
//      application's globals, and no URL other than the SVG namespace;
//   5. every package, npm and Python, carries LICENSE and NOTICE.
//
// It also renders the README's picture and checks it matches the committed file byte for byte,
// so the picture in the README is what the CLI draws.
//
//   node acceptance/run.mjs <folder with node_modules> [<folder with acceptance/ and docs/>]

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const work = process.argv[2] ?? process.cwd();
const repo = process.argv[3] ?? join(work, 'repo');
const bin = (name) => join(work, 'node_modules', '.bin', name);
const results = [];

/** Runs one named check, recording whether it passed. */
async function check(name, f) {
  try {
    await f();
    results.push([name, true]);
    console.log(`PASS ${name}`);
  } catch (e) {
    results.push([name, false]);
    console.log(`FAIL ${name}: ${e.message}`);
  }
}

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

const SOURCE_A = `wirelith 0.1

screen "Sign in" phone #signin
  h1 "Welcome back"
  input "Email" type=email placeholder="you@example.com"
  input "Password" type=password
  button "Sign in" primary -> #home

screen "Home" phone #home
  h1 "Hello, Sam"
  text "You have 3 new messages."
`;
const SOURCE_B = `wirelith 0.1
theme ink

screen "Fernway: Orders" desktop
  header
    h2 "Orders"
    spacer
    button "New order" primary
  table [Order, Customer, Total]
    row ["#1042", Ada Park, "$128.00"]
    row ["#1041", Luis Ortega, "$64.50"]
`;
const BROKEN = 'screen "A"\n  textfield "x"\n  button "Go" -> #nowhere\n';

await check('the network is unreachable', async () => {
  let reached = false;
  try {
    await fetch('https://example.com/', { signal: AbortSignal.timeout(3000) });
    reached = true;
  } catch {}
  assert(!reached, 'a request to the internet succeeded; this test must run offline');
});

await check('1. one CLI command turns a markdown file into PNGs', async () => {
  const dir = join(work, 'cli-run');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'designs.md'),
    `# Designs\n\n\`\`\`wirelith\n${SOURCE_A}\`\`\`\n\nSome text.\n\n\`\`\`wirelith\n${SOURCE_B}\`\`\`\n`,
  );
  execFileSync(bin('wirelith'), ['render', 'designs.md', '--format', 'png', '-o', 'out'], {
    cwd: dir,
    stdio: 'pipe',
  });
  const pngs = readdirSync(join(dir, 'out')).sort();
  assert(
    JSON.stringify(pngs) === JSON.stringify(['designs-1.png', 'designs-2.png']),
    `expected two PNGs, got ${pngs.join(', ')}`,
  );
  for (const [file, source] of [
    ['designs-1.png', SOURCE_A],
    ['designs-2.png', SOURCE_B],
  ]) {
    const png = readFileSync(join(dir, 'out', file));
    assert(png.subarray(1, 4).toString() === 'PNG' && png.length > 1000, `${file} is not a PNG`);
    const back = execFileSync(bin('wirelith'), ['extract', join('out', file)], {
      cwd: dir,
      encoding: 'utf8',
    });
    assert(back === source, `${file} does not carry its source`);
  }
});

await check('2. the MCP server validates and renders over stdio', async () => {
  const server = spawn(bin('wirelith-mcp'), [], { stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map();
  let buffer = '';
  server.stdout.on('data', (d) => {
    buffer += d;
    for (let i = buffer.indexOf('\n'); i >= 0; i = buffer.indexOf('\n')) {
      const msg = JSON.parse(buffer.slice(0, i));
      buffer = buffer.slice(i + 1);
      pending.get(msg.id)?.(msg);
    }
  });
  let next = 1;
  const request = (method, params) =>
    new Promise((resolve, reject) => {
      const id = next++;
      const timer = setTimeout(() => reject(new Error(`no answer to ${method}`)), 15000);
      pending.set(id, (m) => {
        clearTimeout(timer);
        resolve(m);
      });
      server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  try {
    const init = await request('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'acceptance', version: '1' },
    });
    assert(init.result?.serverInfo?.name === 'wirelith', 'initialize failed');
    server.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
    const resource = await request('resources/read', { uri: 'wirelith://spec/ai-spec' });
    assert(
      resource.result?.contents?.[0]?.text?.startsWith('# Wirelith in one page'),
      'the AI spec resource is missing',
    );
    const bad = await request('tools/call', { name: 'validate', arguments: { source: BROKEN } });
    assert(bad.result?.structuredContent?.valid === false, 'validate did not report the errors');
    const good = await request('tools/call', { name: 'validate', arguments: { source: SOURCE_A } });
    assert(good.result?.structuredContent?.valid === true, 'validate rejected a valid source');
    const svg = await request('tools/call', { name: 'render', arguments: { source: SOURCE_A } });
    assert(svg.result?.content?.[0]?.text?.startsWith('<svg '), 'render did not return SVG');
    const png = await request('tools/call', {
      name: 'render',
      arguments: { source: SOURCE_B, format: 'png' },
    });
    assert(png.result?.content?.[0]?.mimeType === 'image/png', 'render did not return a PNG');
  } finally {
    server.stdin.end();
    server.kill();
  }
});

await check('3. the Python validator agrees with core', async () => {
  const { validate } = await import(join(work, 'node_modules', '@wirelith', 'core', 'dist', 'index.js'));
  const essential = (ds) => JSON.stringify(ds.map((d) => [d.code, d.severity, d.line, d.column]));
  for (const source of [SOURCE_A, SOURCE_B, BROKEN]) {
    const py = execFileSync('python3', ['-m', 'wirelith', 'diagnostics'], {
      input: source,
      encoding: 'utf8',
    });
    assert(essential(JSON.parse(py)) === essential(validate(source)), `diagnostics differ for:\n${source}`);
  }
  assert(
    JSON.parse(
      execFileSync('python3', ['-m', 'wirelith', 'diagnostics'], { input: BROKEN, encoding: 'utf8' }),
    ).length === 2,
    'expected two diagnostics',
  );
});

await check('4. the built packages are independent', async () => {
  const files = [];
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.js')) files.push(p);
    }
  };
  for (const pkg of ['core', 'png', 'cli', 'mcp']) walk(join(work, 'node_modules', '@wirelith', pkg, 'dist'));
  assert(files.length > 10, 'built files are missing');
  const problems = [];
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    const name = f.slice(f.indexOf('@wirelith'));
    // No URL other than the SVG namespace.
    for (const m of text.matchAll(/\b(?:https?|wss?|ftp):\/\/[^\s'"`)]+/g)) {
      if (m[0] !== 'http://www.w3.org/2000/svg') problems.push(`${name} names ${m[0]}`);
    }
    // No host application's globals.
    if (/\b(?:window|document|navigator|localStorage|sessionStorage|chrome)\.[A-Za-z_$]/.test(text))
      problems.push(`${name} refers to a host's globals`);
    if (name.startsWith('@wirelith/core/')) {
      for (const m of text.matchAll(/\b(?:import|export)\b[^;]*?\bfrom\s+['"]([^'"]+)['"]/g)) {
        if (!m[1].startsWith('./')) problems.push(`${name} imports ${m[1]}`);
      }
      if (/\bimport\s*\(|\brequire\s*\(|\bfetch\s*\(|XMLHttpRequest|WebSocket/.test(text))
        problems.push(`${name} can reach the network or load code`);
    } else if (/from\s+['"](?:node:)?(?:net|http|https|http2|dgram|tls|dns)['"]/.test(text)) {
      problems.push(`${name} imports a networking module`);
    }
  }
  assert(problems.length === 0, problems.join('; '));
});

await check('5. every package carries the license and the third-party notices', async () => {
  const missing = [];
  const places = [
    ...['core', 'png', 'cli', 'mcp'].map((p) => join(work, 'node_modules', '@wirelith', p)),
    join(work, 'pylib', 'wirelith'),
  ];
  for (const dir of places) {
    for (const name of ['LICENSE', 'NOTICE']) {
      const file = join(dir, name);
      if (!existsSync(file) || statSync(file).size === 0) missing.push(file.slice(work.length + 1));
    }
  }
  // NOTICE is what credits the icon shapes core embeds, under the ISC license they come with.
  const notice = readFileSync(join(work, 'node_modules', '@wirelith', 'core', 'NOTICE'), 'utf8');
  assert(/Lucide/.test(notice), 'core NOTICE does not credit the icons');
  assert(missing.length === 0, `missing: ${missing.join(', ')}`);
});

await check('the README picture is what the CLI renders', async () => {
  const example = join(repo, 'docs', 'readme-example');
  const out = join(work, 'readme-example.png');
  execFileSync(
    bin('wirelith'),
    ['render', `${example}.wirelith`, '--format', 'png', '--scale', '2', '-o', out],
    { stdio: 'pipe' },
  );
  const committed = readFileSync(`${example}.png`);
  assert(
    readFileSync(out).equals(committed),
    'docs/readme-example.png is not what the CLI renders here: render docs/readme-example.wirelith again with --format png --scale 2',
  );
});

const failed = results.filter(([, ok]) => !ok).length;
console.log(`\nacceptance: ${results.length - failed}/${results.length} checks passed.`);
process.exit(failed > 0 ? 1 : 0);
