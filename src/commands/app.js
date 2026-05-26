import { getClient } from '../client.js';

export function register(program) {
  const appCmd = program.command('app').description('App manifest management (zea_apps)');

  appCmd.command('list')
    .description('List registered apps')
    .action(async () => {
      try {
        const client = await getClient();
        const response = await fetch(`${client.appsUrl}/api/apps`, { headers: client.headers });
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || `HTTP error ${response.status}`);
        }
        const result = await response.json();
        const apps = result.apps || [];
        if (apps.length === 0) { console.log('No apps registered.'); return; }
        console.log('Registered Apps:');
        apps.forEach(a => console.log(`  ${a.app_id}: ${a.name} [${a.status}] v${a.version} — ${a.states_count} states, ${a.intents_count} intents`));
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  appCmd.command('show <app_id>')
    .description('Show app manifest')
    .action(async (appId) => {
      try {
        const client = await getClient();
        const response = await fetch(`${client.appsUrl}/api/apps/${appId}/manifest`, { headers: client.headers });
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || `HTTP error ${response.status}`);
        }
        const manifest = await response.json();
        console.log(`App: ${manifest.name} v${manifest.version}`);
        console.log(`Domain: ${manifest.domain_auth} | Status: ${manifest.status}`);
        console.log(`\nStates:`);
        Object.keys(manifest.states || {}).forEach(s => console.log(`  ${s}`));
        console.log(`\nIntents:`);
        Object.entries(manifest.intent_routing || {}).forEach(([k, v]) => console.log(`  ${k} → ${v.type} ${v.target_state || v.workflow_module || ''}`));
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  appCmd.command('register <file>')
    .description('Register an app from a YAML or JSON manifest file')
    .action(async (filePath) => {
      try {
        const client = await getClient();
        const fs = await import('fs/promises');
        const content = await fs.readFile(filePath, 'utf8');
        let manifest;
        if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
          const yaml = await import('yaml');
          manifest = yaml.parse(content);
        } else {
          manifest = JSON.parse(content);
        }

        const payload = {
          app_id: manifest.app_id,
          name: manifest.name,
          domain_auth: manifest.domain_auth,
          status: manifest.status || 'active',
          version: manifest.version || '1.0.0',
          manifest: manifest,
          states: manifest.states || {},
          intent_routing: manifest.intent_routing || {}
        };

        const response = await fetch(`${client.appsUrl}/api/apps`, {
          method: 'POST',
          headers: client.headers,
          body: JSON.stringify(payload)
        });
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || errData.details || `HTTP error ${response.status}`);
        }
        const result = await response.json();
        console.log(`App registered: ${result.name} (${result.app_id}) [${result.status}]`);
      } catch (e) {
        console.error('Error:', e.message);
      }
    });
}
