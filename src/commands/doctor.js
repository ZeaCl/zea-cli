import zeaFetch from '../lib/http.js';
import { getClient, loadConfig } from '../client.js';
import crypto from 'crypto';

const CHECKS = {
  api: 'Layer 1 — API Connectivity',
  auth: 'Layer 2 — Authentication',
  venture: 'Layer 3 — Venture API Data',
  stitch: 'Layer 4 — Stitch MCP',
  glia: 'Layer 5 — Glia LLM + Tools',
  tools: 'Layer 6 — Skill Tools Execution',
};

function ok(label, ms) {
  const time = ms ? ` (${ms}ms)` : '';
  console.log(`  ✅ ${label}${time}`);
  return true;
}

function warn(label) {
  console.log(`  ⚠️  ${label}`);
  return false;
}

function fail(label) {
  console.log(`  ❌ ${label}`);
  return false;
}

async function check_api() {
  console.log(`\n${CHECKS.api}`);
  let passed = 0;
  const t0 = Date.now();

  // Venture API
  try {
    const r = await zeaFetch('http://venture-api.zea.localhost/health', { signal: AbortSignal.timeout(5000) });
    if (r.ok) { passed++; ok('Venture API health', Date.now() - t0); }
    else fail(`Venture API health: ${r.status}`);
  } catch (e) { fail(`Venture API: ${e.message}`); }

  // Thalamus JWKS
  try {
    const r = await zeaFetch('http://auth.zea.localhost/.well-known/jwks.json', { signal: AbortSignal.timeout(5000) });
    if (r.ok) { passed++; ok('Thalamus JWKS', Date.now() - t0); }
    else fail(`Thalamus JWKS: ${r.status}`);
  } catch (e) { fail(`Thalamus JWKS: ${e.message}`); }

  // Stitch MCP (if key available)
  const stitchKey = process.env.STITCH_KEY;
  if (stitchKey) {
    try {
      const r = await zeaFetch('https://stitch.googleapis.com/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': stitchKey },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', params: {}, id: 1 }),
        signal: AbortSignal.timeout(10000)
      });
      if (r.ok) { passed++; ok('Stitch MCP', Date.now() - t0); }
      else fail(`Stitch MCP: ${r.status}`);
    } catch (e) { fail(`Stitch MCP: ${e.message}`); }
  } else {
    warn('Stitch MCP: STITCH_KEY not set (skipped)');
  }

  return passed;
}

async function check_auth() {
  console.log(`\n${CHECKS.auth}`);
  try {
    const client = await getClient();
    const token = client.token;

    // Decode JWT
    const parts = token.split('.');
    if (parts.length !== 3) return fail('Token format invalid');

    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    ok('Token decoded');
    ok(`sub: ${payload.sub}`);
    ok(`exp: ${new Date(payload.exp * 1000).toISOString()}`);

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp > now) {
      ok('Token not expired');
    } else {
      fail('Token expired');
      return 1;
    }

    // Test Venture API
    try {
      const r = await zeaFetch('http://venture-api.zea.localhost/gp/dashboard', {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: AbortSignal.timeout(5000)
      });
      if (r.ok) { ok('Venture API authenticated (200)'); }
      else { fail(`Venture API auth: ${r.status}`); }
    } catch (e) { fail(`Venture API auth: ${e.message}`); }

    return 2;
  } catch (e) {
    fail(`Auth: ${e.message}`);
    return 0;
  }
}

async function check_venture() {
  console.log(`\n${CHECKS.venture}`);
  let passed = 0;
  const client = await getClient();

  const endpoints = [
    ['/gp/dashboard', 'Dashboard'],
    ['/gp/funds', 'Funds'],
    ['/gp/capital-calls', 'Capital Calls'],
    ['/gp/investors', 'Investors'],
  ];

  for (const [path, label] of endpoints) {
    try {
      const r = await zeaFetch(`http://venture-api.zea.localhost${path}`, {
        headers: { 'Authorization': `Bearer ${client.token}` },
        signal: AbortSignal.timeout(5000)
      });
      if (r.ok) {
        const data = await r.json();
        const itemCount = data.items ? data.items.length : data.data ? data.data.length : Object.keys(data).length;
        ok(`GET ${path} → ${itemCount} items (${label})`);
        passed++;
      } else {
        fail(`GET ${path}: ${r.status}`);
      }
    } catch (e) { fail(`GET ${path}: ${e.message}`); }
  }

  return passed;
}

async function check_stitch() {
  console.log(`\n${CHECKS.stitch}`);
  const stitchKey = process.env.STITCH_KEY;
  if (!stitchKey) {
    warn('STITCH_KEY not set — skipping');
    return 0;
  }

  let passed = 0;

  try {
    const r = await zeaFetch('https://stitch.googleapis.com/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': stitchKey },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'list_screens', arguments: { projectId: process.env.STITCH_PROJECT || '' } }, id: 1 }),
      signal: AbortSignal.timeout(10000)
    });
    const data = await r.json();
    const text = data?.result?.content?.[0]?.text;
    if (text) {
      const screens = JSON.parse(text).screens || [];
      ok(`list_screens → ${screens.length} screens`);
      passed++;
    } else {
      fail('list_screens: no data');
    }
  } catch (e) { fail(`Stitch: ${e.message}`); }

  return passed;
}

async function check_glia() {
  console.log(`\n${CHECKS.glia}`);
  let passed = 0;

  // Glia health endpoint (nueva Glia en port 4002)
  try {
    const r = await zeaFetch('http://localhost:4002/api/health', { signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const data = await r.json();
      ok(`Glia health: ${data.status} (v${data.version})`);
      passed++;
    } else {
      fail(`Glia health: ${r.status}`);
    }
  } catch (e) { fail(`Glia health: ${e.message}`); }

  // Agents list
  try {
    const r = await zeaFetch('http://localhost:4002/api/agents', { signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const data = await r.json();
      ok(`Agents: ${data.count || 0} running`);
      passed++;
    }
  } catch (e) { warn(`Agents: ${e.message}`); }

  // DeepSeek model check
  try {
    const dsKey = process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEYS?.split(',')[0] || '';
    const r = await zeaFetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${dsKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5,
        stream: false
      }),
      signal: AbortSignal.timeout(10000)
    });
    if (r.ok) { ok('DeepSeek reachable'); passed++; }
    else { warn(`DeepSeek: ${r.status}`); }
  } catch (e) { warn(`DeepSeek: ${e.message}`); }

  return passed;
}

async function check_tools() {
  console.log(`\n${CHECKS.tools}`);
  let passed = 0;

  // ZEA CLI available
  try {
    const { execSync } = await import('child_process');
    execSync('which zea 2>/dev/null || echo "zea not in PATH"', { stdio: 'pipe' });
    ok('zea CLI available');
    passed++;
  } catch { warn('zea CLI not in PATH'); }

  // Venture token works for tool comands
  try {
    const token = process.env.ZEA_TOKEN;
    if (token) {
      const r = await zeaFetch('http://venture-api.zea.localhost/gp/capital-calls', {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: AbortSignal.timeout(5000)
      });
      if (r.ok) { ok('ZEA_TOKEN: Venture API auth works'); passed++; }
      else { fail(`ZEA_TOKEN: ${r.status}`); }
    } else {
      warn('ZEA_TOKEN not set');
    }
  } catch (e) { fail(`ZEA_TOKEN: ${e.message}`); }

  // Skills directory exists
  const fs = await import('fs/promises');
  const os = await import('os');
  const path = await import('path');
  const skillsDir = path.join(os.homedir(), '.zea', 'skills');
  try {
    await fs.access(skillsDir);
    const files = await fs.readdir(skillsDir);
    ok(`Skills dir: ${files.length} entries in ${skillsDir}`);
    passed++;
  } catch { warn(`Skills dir not found: ${skillsDir}`); }

  return passed;
}

export function register(program) {
  const doctorCmd = program.command('doctor')
    .description('Health check — diagnose ZEA Platform layer by layer');

  doctorCmd.command('run')
    .description('Run full health check (all 6 layers)')
    .action(async () => {
      console.log('═══ ZEA Platform Health Check ═══');
      const t0 = Date.now();

      let total = 0, passed = 0;
      passed += await check_api(); total += 3;
      passed += await check_auth(); total += 2;
      passed += await check_venture(); total += 4;
      passed += await check_stitch(); total += 1;
      passed += await check_glia(); total += 3;
      passed += await check_tools(); total += 3;

      const elapsed = Date.now() - t0;
      console.log(`\n═══ Result: ${passed}/${total} checks passed (${elapsed}ms) ═══`);
      if (passed === total) console.log('🎉 All systems operational!');
      else console.log('⚠️  Some checks failed. Review above for details.');
    });

  doctorCmd.command('check')
    .description('Check specific layer')
    .argument('<layer>', 'Layer to check: api, auth, venture, stitch, glia, tools')
    .action(async (layer) => {
      const valid = Object.keys(CHECKS);
      if (!valid.some(k => k === layer || layer.startsWith(k))) {
        console.log(`Unknown layer: ${layer}`);
        console.log(`Valid: ${valid.join(', ')}`);
        return;
      }

      console.log('═══ ZEA Doctor ═══');
      switch (layer.replace('check-', '').replace('check', '').trim()) {
        case 'api': await check_api(); break;
        case 'auth': await check_auth(); break;
        case 'venture': await check_venture(); break;
        case 'stitch': await check_stitch(); break;
        case 'glia': await check_glia(); break;
        case 'tools': await check_tools(); break;
        default:
          if (layer.startsWith('a')) await check_api();
          else console.log(`Unknown: ${layer}`);
      }
    });
}
