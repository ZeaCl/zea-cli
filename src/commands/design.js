import zeaFetch from '../lib/http.js';
import { getClient, loadConfig } from '../client.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { withLearning } from '../utils/learning.js';

const MEMORY_DIR = path.join(os.homedir(), '.zea', 'memory');

async function readMemory(appId, file) {
  try {
    return JSON.parse(await fs.readFile(path.join(MEMORY_DIR, 'apps', appId, file), 'utf8'));
  } catch { return {}; }
}

async function writeMemory(appId, file, data) {
  const dir = path.join(MEMORY_DIR, 'apps', appId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, file), JSON.stringify(data, null, 2));
}

export function register(program) {
  const designCmd = program.command('design').description('Design management integration commands');

  designCmd.command('list-screens')
    .description('List Stitch screens for an app')
    .requiredOption('--app <id>', 'App ID')
    .option('--stitch-key <key>', 'Stitch API key (or use STITCH_KEY env)')
    .action(async (opts) => {
      try {
        const mem = await readMemory(opts.app, 'stitch.json');
        const projectId = mem?.project_id;
        if (!projectId) {
          console.error('No Stitch project configured. Run: zea memory init --app ' + opts.app + ' --stitch-project <id>');
          process.exit(1);
        }

        const apiKey = opts.stitchKey || process.env.STITCH_KEY;
        if (!apiKey) {
          console.error('Stitch API key required. Set STITCH_KEY env var or use --stitch-key.');
          process.exit(1);
        }

        const response = await zeaFetch('https://stitch.googleapis.com/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'list_screens', arguments: { projectId } }, id: 1 })
        });

        const result = await response.json();
        const content = result?.result?.content || [];
        for (const c of content) {
          const data = JSON.parse(c.text || '{}');
          const screens = data.screens || [];
          console.log(`Project: ${projectId}`);
          console.log(`Screens: ${screens.length}\n`);
          for (const s of screens) {
            const sid = s.name.split('/').pop();
            console.log(`  ${s.title || s.name || 'Untitled'}  (${sid})`);
          }
        }
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  // --- import-screen ---
  designCmd.command('import-screen')
    .description('Import a Stitch screen into ZEA app manifest')
    .requiredOption('--app <id>', 'ZEA App ID')
    .requiredOption('--screen-id <id>', 'Stitch screen ID')
    .requiredOption('--state <name>', 'SDUI state name')
    .requiredOption('--intent <name>', 'Intent name for routing')
    .option('--stitch-key <key>', 'Stitch API key (or use STITCH_KEY env)')
    .action(async (opts) => {
      try {
        const apiKey = opts.stitchKey || process.env.STITCH_KEY;
        if (!apiKey) {
          console.error('Stitch API key required. Set STITCH_KEY env var or use --stitch-key.');
          process.exit(1);
        }
        const client = await getClient();
        await withLearning(opts.app, 'design.import-screen', async () => {
        const mem = await readMemory(opts.app, 'stitch.json');
        const projectId = mem?.project_id;
        if (!projectId) {
          console.error('No Stitch project configured. Run: zea memory init --app ' + opts.app + ' --stitch-project <id>');
          process.exit(1);
        }

        // 1. Get screen metadata
        console.log(`1/5 Fetching screen metadata...`);
        const r1 = await zeaFetch('https://stitch.googleapis.com/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'get_screen', arguments: { projectId, screenId: opts.screenId } }, id: 2 })
        });
        const d1 = await r1.json();

        // Find HTML download URL
        const match = JSON.stringify(d1).match(/"downloadUrl":"(https:\/\/contribution[^"]+)"/);
        if (!match) {
          console.error('Could not find HTML download URL for this screen.');
          process.exit(1);
        }
        const htmlUrl = match[1];
        console.log(`2/5 Downloading HTML...`);
        const r2 = await zeaFetch(htmlUrl);
        const html = await r2.text();

        // 2. Extract <main> content
        console.log(`3/5 Extracting content (${html.length} bytes)...`);
        const mainMatch = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/);
        const contentHtml = mainMatch ? mainMatch[1].trim() : html;

        // 3. Update manifest
        console.log(`4/5 Updating manifest...`);
        const mResp = await zeaFetch(`${client.appsUrl}/api/apps/${opts.app}/manifest`, {
          headers: client.headers
        });
        if (!mResp.ok) throw new Error(`Manifest fetch failed: ${mResp.status}`);
        const manifest = await mResp.json();

        manifest.states = manifest.states || {};
        manifest.states[opts.state] = {
          type: 'StitchedScreen',
          html: contentHtml
        };

        manifest.intent_routing = manifest.intent_routing || {};
        manifest.intent_routing[opts.intent] = {
          type: 'state_transition',
          target_state: opts.state
        };

        const payload = {
          app_id: manifest.app_id,
          name: manifest.name,
          domain_auth: manifest.domain_auth || '',
          status: manifest.status || 'active',
          version: manifest.version || '1.0.0',
          manifest,
          states: manifest.states,
          intent_routing: manifest.intent_routing
        };

        const uResp = await zeaFetch(`${client.appsUrl}/api/apps`, {
          method: 'POST',
          headers: client.headers,
          body: JSON.stringify(payload)
        });
        if (!uResp.ok) throw new Error(`Manifest update failed: ${uResp.status}`);

        // 4. Update memory (non-blocking — best effort)
        try {
          mem.screen_mappings = mem.screen_mappings || {};
          mem.screen_mappings[opts.state] = {
            stitch_id: opts.screenId,
            state: opts.state,
            intent: opts.intent,
            html_bytes: contentHtml.length,
            imported_at: new Date().toISOString()
          };
          mem.last_sync = new Date().toISOString();
          await writeMemory(opts.app, 'stitch.json', mem);
          console.log(`   Memory:  updated`);
        } catch (e) {
          console.log(`   Memory:  skipped (no write access)`);
        }

        }, { screen_id: opts.screenId, state: opts.state, intent: opts.intent });

      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  // --- status ---
  designCmd.command('status')
    .description('Show import status for an app (reads from API)')
    .requiredOption('--app <id>', 'App ID')
    .action(async (opts) => {
      try {
        const client = await getClient();
        const resp = await zeaFetch(`${client.appsUrl}/api/apps/${opts.app}/manifest`, { headers: client.headers });
        if (!resp.ok) throw new Error(`API error: ${resp.status}`);
        const manifest = await resp.json();
        const states = manifest.states || {};
        const entries = Object.entries(states);

        if (entries.length === 0) {
          console.log('No screens imported yet.');
          return;
        }

        console.log(`App: ${opts.app}`);
        console.log(`States: ${entries.length}\n`);
        for (const [name, state] of entries) {
          const htmlSize = (state.html || '').length;
          console.log(`  ${name}`);
          console.log(`    Type: ${state.type || '?'}`);
          console.log(`    HTML: ${htmlSize} bytes`);
          if (state.type === 'StitchedScreen') {
            const binds = (state.html || '').match(/data-zea-bind="([^"]+)"/g) || [];
            console.log(`    Bindings: ${binds.length > 0 ? [...new Set(binds.map(b => b.match(/"([^"]+)"/)[1]))].join(', ') : 'none'}`);
          }
          console.log('');
        }
      } catch (e) {
        // Fallback: try local memory
        try {
          const mem = await readMemory(opts.app, 'stitch.json');
          const mappings = mem?.screen_mappings || {};
          const entries = Object.entries(mappings);
          if (entries.length === 0) {
            console.log('No screens imported yet.');
            return;
          }
          console.log(`App: ${opts.app} (from local memory)`);
          console.log(`Project: ${mem.project_id}\n`);
          for (const [state, info] of entries) {
            console.log(`  ${state}: ${info.stitch_id} → ${info.intent} (${info.html_bytes} bytes)`);
          }
        } catch {
          console.error('Error:', e.message);
        }
      }
    });

  // --- update-design ---
  designCmd.command('update-design')
    .description('Update design system tokens (colors, typography)')
    .requiredOption('--app <id>', 'ZEA App ID')
    .requiredOption('--token <path>', 'Token path (e.g. colors.primary, typography.h1_size)')
    .requiredOption('--value <val>', 'New value')
    .option('--experiment <name>', 'Experiment branch name (safe mode)')
    .action(async (opts) => {
      try {
        const client = await getClient();
        await withLearning(opts.app, 'design.update-design', async () => {

        // If experiment, use experiment URL
        const manifestUrl = opts.experiment
          ? `${client.appsUrl}/api/apps/${opts.app}/experiments/${opts.experiment}`
          : `${client.appsUrl}/api/apps/${opts.app}/manifest`;

        const mResp = await zeaFetch(manifestUrl, { headers: client.headers });
        if (!mResp.ok) throw new Error(`Manifest fetch failed: ${mResp.status}`);
        const manifest = await mResp.json();

        // Update at the flat level (API response format)
        const parts = opts.token.split('.');
        let node = manifest;
        for (let i = 0; i < parts.length - 1; i++) {
          node[parts[i]] = node[parts[i]] || {};
          node = node[parts[i]];
        }
        node[parts[parts.length - 1]] = opts.value;

        // Build payload with the manifest as both flat fields and nested manifest
        const payload = {
          app_id: manifest.app_id || opts.app,
          name: manifest.name || 'App',
          domain_auth: manifest.domain_auth || 'venture',
          status: manifest.status || 'active',
          version: manifest.version || '1.0.0',
          manifest: manifest,
          states: manifest.states || {},
          intent_routing: manifest.intent_routing || {},
          shell: manifest.shell || {},
          design_system: manifest.design_system || {}
        };

        const uploadUrl = opts.experiment
          ? `${client.appsUrl}/api/apps/${opts.app}/experiments/${opts.experiment}`
          : `${client.appsUrl}/api/apps`;

        const uResp = await zeaFetch(uploadUrl, {
          method: opts.experiment ? 'PUT' : 'POST',
          headers: client.headers,
          body: JSON.stringify(opts.experiment ? { manifest } : payload)
        });
        if (!uResp.ok) {
          const err = await uResp.text();
          throw new Error(`Update failed: ${uResp.status} - ${err.substring(0, 200)}`);
        }

        const target = opts.experiment ? `experiment '${opts.experiment}'` : `app ${opts.app}`;
        console.log(`✅ Design system updated: ${opts.token} = ${opts.value}`);
        console.log(`   Target: ${target}`);
        }, { token: opts.token, value: opts.value });
      } catch (e) {
        console.error('Error:', e.message);
      }
    });
}
