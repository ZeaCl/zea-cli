import { getClient } from '../client.js';
import { withLearning } from '../utils/learning.js';

export function register(program) {
  const shellCmd = program.command('shell')
    .description('App shell management (sidebar, chat)');

  shellCmd.command('update-sidebar')
    .description('Update sidebar configuration')
    .requiredOption('--app <id>', 'App ID')
    .requiredOption('--items <json>', 'JSON array of sidebar items')
    .action(async (opts) => {
      try {
        const client = await getClient();
        await withLearning(opts.app, 'shell.update-sidebar', async () => {
        const items = JSON.parse(opts.items);

        const mResp = await fetch(`${client.appsUrl}/api/apps/${opts.app}/manifest`, {
          headers: client.headers

(Showing lines 12-19 of 121. Use offset=20 to continue.)

        });
        if (!mResp.ok) throw new Error(`Manifest fetch failed: ${mResp.status}`);
        const manifest = await mResp.json();

        manifest.shell = manifest.shell || {};
        manifest.shell.sidebar = manifest.shell.sidebar || {};
        manifest.shell.sidebar.items = items;

        const payload = {
          app_id: manifest.app_id,
          name: manifest.name,
          domain_auth: manifest.domain_auth || 'venture',
          status: manifest.status || 'active',
          version: manifest.version || '1.0.0',
          manifest,
          states: manifest.states || {},
          intent_routing: manifest.intent_routing || {}
        };

        const uResp = await fetch(`${client.appsUrl}/api/apps`, {
          method: 'POST',
          headers: client.headers,
          body: JSON.stringify(payload)
        });
        if (!uResp.ok) throw new Error(`Update failed: ${uResp.status}`);

        console.log(`✅ Sidebar updated: ${items.length} items`);
        for (const item of items) {
          console.log(`   ${item.icon} ${item.label} → ${item.action?.value || item.action?.type || '?'}`);
        }
        }, { items_count: items.length });
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  shellCmd.command('update-chat')
    .description('Update chat drawer configuration')
    .requiredOption('--app <id>', 'App ID')
    .requiredOption('--key <path>', 'Config key (e.g. header.title, suggestions)')
    .requiredOption('--value <json>', 'New value as JSON')
    .action(async (opts) => {
      try {
        const client = await getClient();
        await withLearning(opts.app, 'shell.update-chat', async () => {
        const value = JSON.parse(opts.value);

        const mResp = await fetch(`${client.appsUrl}/api/apps/${opts.app}/manifest`, {
          headers: client.headers
        });
        if (!mResp.ok) throw new Error(`Manifest fetch failed: ${mResp.status}`);
        const manifest = await mResp.json();

        manifest.shell = manifest.shell || {};
        manifest.shell.chat = manifest.shell.chat || {};
        const parts = opts.key.split('.');
        let node = manifest.shell.chat;
        for (let i = 0; i < parts.length - 1; i++) {
          node[parts[i]] = node[parts[i]] || {};
          node = node[parts[i]];
        }
        node[parts[parts.length - 1]] = value;

        const payload = {
          app_id: manifest.app_id,
          name: manifest.name,
          domain_auth: manifest.domain_auth || 'venture',
          status: manifest.status || 'active',
          version: manifest.version || '1.0.0',
          manifest,
          states: manifest.states || {},
          intent_routing: manifest.intent_routing || {}
        };

        const uResp = await fetch(`${client.appsUrl}/api/apps`, {
          method: 'POST',
          headers: client.headers,
          body: JSON.stringify(payload)
        });
        if (!uResp.ok) throw new Error(`Update failed: ${uResp.status}`);

        console.log(`✅ Chat updated: ${opts.key} = ${JSON.stringify(value)}`);
        }, { key: opts.key, value: opts.value });
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  shellCmd.command('show')
    .description('Show current shell config for an app')
    .requiredOption('--app <id>', 'App ID')
    .action(async (opts) => {
      try {
        const client = await getClient();
        const response = await fetch(`${client.appsUrl}/api/apps/${opts.app}/manifest`, {
          headers: client.headers
        });
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const manifest = await response.json();
        const shell = manifest.shell || {};
        console.log(JSON.stringify(shell, null, 2));
      } catch (e) {
        console.error('Error:', e.message);
      }
    });
}
