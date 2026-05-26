import { getClient, loadConfig } from '../client.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

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
  const stitchCmd = program.command('stitch').description('Stitch design integration commands');

  // --- list-screens ---
  stitchCmd.command('list-screens')
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

        const response = await fetch('https://stitch.googleapis.com/mcp', {
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
  stitchCmd.command('import-screen')
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
        const mem = await readMemory(opts.app, 'stitch.json');
        const projectId = mem?.project_id;
        if (!projectId) {
          console.error('No Stitch project configured. Run: zea memory init --app ' + opts.app + ' --stitch-project <id>');
          process.exit(1);
        }

        // 1. Get screen metadata
        console.log(`1/5 Fetching screen metadata...`);
        const r1 = await fetch('https://stitch.googleapis.com/mcp', {
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
        const r2 = await fetch(htmlUrl);
        const html = await r2.text();

        // 2. Extract <main> content
        console.log(`3/5 Extracting content (${html.length} bytes)...`);
        const mainMatch = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/);
        const contentHtml = mainMatch ? mainMatch[1].trim() : html;

        // 3. Update manifest
        console.log(`4/5 Updating manifest...`);
        const mResp = await fetch(`${client.appsUrl}/api/apps/${opts.app}/manifest`, {
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

        const uResp = await fetch(`${client.appsUrl}/api/apps`, {
          method: 'POST',
          headers: client.headers,
          body: JSON.stringify(payload)
        });
        if (!uResp.ok) throw new Error(`Manifest update failed: ${uResp.status}`);

        // 4. Update memory
        console.log(`5/5 Updating memory...`);
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

        console.log(`\n✅ Screen imported:`);
        console.log(`   App:     ${opts.app}`);
        console.log(`   State:   ${opts.state}`);
        console.log(`   Intent:  ${opts.intent}`);
        console.log(`   HTML:    ${contentHtml.length} bytes`);
        console.log(`   Memory:  updated`);

      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  // --- status ---
  stitchCmd.command('status')
    .description('Show import status for an app')
    .requiredOption('--app <id>', 'App ID')
    .action(async (opts) => {
      try {
        const mem = await readMemory(opts.app, 'stitch.json');
        const mappings = mem?.screen_mappings || {};
        const entries = Object.entries(mappings);

        if (entries.length === 0) {
          console.log('No screens imported yet.');
          return;
        }

        console.log(`App: ${opts.app}`);
        console.log(`Project: ${mem.project_id}\n`);
        for (const [state, info] of entries) {
          console.log(`  ${state}`);
          console.log(`    Stitch: ${info.stitch_id}`);
          console.log(`    Intent: ${info.intent}`);
          console.log(`    HTML:   ${info.html_bytes} bytes`);
          console.log(`    Date:   ${info.imported_at}`);
          console.log('');
        }
      } catch (e) {
        console.error('Error:', e.message);
      }
    });
}
