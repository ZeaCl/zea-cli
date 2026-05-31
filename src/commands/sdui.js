import zeaFetch from '../lib/http.js';
import { getClient } from '../client.js';

export function register(program) {
  const sduiCmd = program.command('sdui').description('Server-Driven UI commands');

  sduiCmd.command('start <app_id>')
    .description('Start an SDUI session and get initial state')
    .option('--org-id <id>', 'Organization ID')
    .action(async (appId, options) => {
      try {
        const client = await getClient();
        const orgId = options.orgId || client.activeOrgId;
        const body = { app_id: appId, token: client.token };
        if (orgId) body.org_id = orgId;

        const response = await zeaFetch(`${client.sduiUrl}/api/sessions`, {
          method: 'POST',
          headers: client.headers,
          body: JSON.stringify(body)
        });
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || `HTTP error ${response.status}`);
        }
        const state = await response.json();
        console.log(`Session started: ${state.session_id}`);
        console.log(`State: ${state.screen_id}`);
        console.log(`Layout: ${state.layout?.type} (${(state.layout?.children || []).length} children)`);
        if (state.data) {
          const keys = Object.keys(state.data).filter(k => !k.startsWith('_') && k !== 'jwt' && k !== 'messages');
          if (keys.length) console.log(`Data: ${keys.join(', ')}`);
        }
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  sduiCmd.command('dispatch <session_id> <action>')
    .description('Dispatch an intent to an SDUI session')
    .argument('[payload]', 'JSON payload', '{}')
    .action(async (sessionId, action, payloadStr) => {
      try {
        const client = await getClient();
        let payload = {};
        try { payload = JSON.parse(payloadStr); } catch {}
        
        const response = await zeaFetch(`${client.sduiUrl}/api/sessions/${sessionId}/dispatch`, {
          method: 'POST',
          headers: client.headers,
          body: JSON.stringify({ action, payload })
        });
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || `HTTP error ${response.status}`);
        }
        const state = await response.json();
        console.log(`State: ${state.screen_id}`);
        console.log(`Layout: ${state.layout?.type}`);
        if (state.data) {
          const safeData = { ...state.data };
          delete safeData.jwt;
          console.log(`Data: ${JSON.stringify(safeData).substring(0, 200)}`);
        }
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  sduiCmd.command('manifest <app_id>')
    .description('Show app manifest summary (states, intents, shell)')
    .action(async (appId) => {
      try {
        const client = await getClient();
        const response = await zeaFetch(`${client.appsUrl}/api/apps/${appId}/manifest`, {
          headers: client.headers
        });
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const manifest = await response.json();

        console.log(`App: ${manifest.name || appId}`);
        console.log(`Status: ${manifest.status || 'active'} — Version: ${manifest.version || '1.0.0'}`);
        console.log('');

        const states = Object.keys(manifest.states || {});
        console.log(`States (${states.length}):`);
        for (const s of states) {
          const state = manifest.states[s];
          const type = state.type || state.custom_type || '?';
          const htmlSize = state.html ? ` (${state.html.length} bytes HTML)` : '';
          console.log(`  ${s}: ${type}${htmlSize}`);
        }

        console.log('');
        const intents = Object.keys(manifest.intent_routing || {});
        console.log(`Intents (${intents.length}):`);
        for (const i of intents) {
          const route = manifest.intent_routing[i];
          console.log(`  ${i} → ${route.target_state || route.type || '?'}`);
        }

        const shell = manifest.shell || {};
        if (shell.sidebar) {
          const items = shell.sidebar.items || [];
          const sepItems = shell.sidebar.separator_before || [];
          console.log(`\nShell — Sidebar: ${items.length} items + ${sepItems.length} separator items`);
        }
        if (shell.chat) {
          console.log(`Shell — Chat: ${shell.chat.header?.title || '?'}`);
        }
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  sduiCmd.command('screens <app_id>')
    .description('List all screens/states in the app manifest')
    .action(async (appId) => {
      try {
        const client = await getClient();
        const response = await zeaFetch(`${client.appsUrl}/api/apps/${appId}/manifest`, {
          headers: client.headers
        });
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const manifest = await response.json();
        const states = manifest.states || {};

        console.log(`App: ${manifest.name || appId}`);
        console.log(`Screens: ${Object.keys(states).length}\n`);

        for (const [name, state] of Object.entries(states)) {
          const type = state.type || state.custom_type || '?';
          const htmlSize = state.html ? ` (${state.html.length} bytes)` : '';
          const isStitch = type === 'StitchedScreen';
          console.log(`  ${isStitch ? '🎨' : '📄'} ${name}: ${type}${htmlSize}`);
        }
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  sduiCmd.command('screen <app_id> <state>')
    .description('Show the HTML content of a StitchedScreen state')
    .option('--save', 'Save HTML to file instead of printing')
    .action(async (appId, stateName, opts) => {
      try {
        const client = await getClient();
        const response = await zeaFetch(`${client.appsUrl}/api/apps/${appId}/manifest`, {
          headers: client.headers
        });
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const manifest = await response.json();
        const state = manifest.states?.[stateName];

        if (!state) {
          console.error(`State '${stateName}' not found. Available: ${Object.keys(manifest.states || {}).join(', ')}`);
          process.exit(1);
        }

        const html = state.html || '';
        if (!html) {
          console.error(`State '${stateName}' has no HTML content (type: ${state.type})`);
          process.exit(1);
        }

        if (opts.save) {
          const fs = await import('fs/promises');
          const path = await import('path');
          const filePath = path.join(process.cwd(), `${appId}_${stateName}.html`);
          await fs.writeFile(filePath, html);
          console.log(`Saved: ${filePath} (${html.length} bytes)`);
        } else {
          console.log(`State: ${stateName}`);
          console.log(`Type: ${state.type || '?'}`);
          console.log(`Size: ${html.length} bytes`);
          console.log('');
          console.log(html.substring(0, 2000));
          if (html.length > 2000) console.log(`\n... (${html.length - 2000} more bytes)`);
        }
      } catch (e) {
        console.error('Error:', e.message);
      }
    });
}
