import zeaFetch from '../lib/http.js';
import { getClient } from '../client.js';

export function register(program) {
  const experimentCmd = program.command('experiment')
    .description('Experiment branches — safe manifest changes (Git-style)');

  experimentCmd.command('create')
    .description('Create experiment branch from current app manifest')
    .requiredOption('--app <id>', 'App ID')
    .requiredOption('--name <name>', 'Experiment name')
    .action(async (opts) => {
      try {
        const client = await getClient();
        const response = await zeaFetch(`${client.appsUrl}/api/apps/${opts.app}/experiments`, {
          method: 'POST',
          headers: client.headers,
          body: JSON.stringify({ name: opts.name, app_id: opts.app })
        });
        const result = await response.json();
        if (response.ok) {
          console.log(`✅ Experiment '${opts.name}' created for ${opts.app}`);
          console.log(`   Status: ${result.status}`);
          console.log(`   Work on it: zea design update-design --app ${opts.app} --experiment ${opts.name} ...`);
          console.log(`   Merge:     zea experiment merge --app ${opts.app} --name ${opts.name}`);
        } else {
          console.error('Error:', result.error);
        }
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  experimentCmd.command('list')
    .description('List experiments for an app')
    .requiredOption('--app <id>', 'App ID')
    .action(async (opts) => {
      try {
        const client = await getClient();
        const response = await zeaFetch(`${client.appsUrl}/api/apps/${opts.app}/experiments`, {
          headers: client.headers
        });
        const data = await response.json();
        const experiments = data.experiments || [];
        if (experiments.length === 0) {
          console.log('No experiments found.');
          return;
        }
        console.log(`Experiments for ${opts.app}:`);
        for (const e of experiments) {
          const icon = e.status === 'active' ? '🟡' : e.status === 'merged' ? '🟢' : '⚫';
          const merged = e.merged_at ? ` (merged ${e.merged_at.substring(0,10)})` : '';
          console.log(`  ${icon} ${e.name}: ${e.status}${merged} — ${e.created_at?.substring(0,10)}`);
        }
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  experimentCmd.command('show')
    .description('Show experiment manifest')
    .requiredOption('--app <id>', 'App ID')
    .requiredOption('--name <name>', 'Experiment name')
    .action(async (opts) => {
      try {
        const client = await getClient();
        const response = await zeaFetch(`${client.appsUrl}/api/apps/${opts.app}/experiments/${opts.name}`, {
          headers: client.headers
        });
        const data = await response.json();
        if (response.ok) {
          console.log(`Experiment: ${data.name} [${data.status}]`);
          const m = data.manifest || {};
          const states = Object.keys(m.states || {}).length;
          const intents = Object.keys(m.intent_routing || {}).length;
          console.log(`  States: ${states}, Intents: ${intents}`);
          if (m.design_system?.colors) {
            console.log(`  Primary color: ${m.design_system.colors.primary}`);
          }
        } else {
          console.error('Error:', data.error);
        }
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  experimentCmd.command('merge')
    .description('Merge experiment to production')
    .requiredOption('--app <id>', 'App ID')
    .requiredOption('--name <name>', 'Experiment name')
    .action(async (opts) => {
      try {
        const client = await getClient();
        const response = await zeaFetch(`${client.appsUrl}/api/apps/${opts.app}/experiments/${opts.name}/merge`, {
          method: 'POST',
          headers: client.headers
        });
        const result = await response.json();
        if (response.ok) {
          console.log(`✅ Experiment '${opts.name}' merged to production!`);
        } else {
          console.error('Error:', result.error);
        }
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  experimentCmd.command('discard')
    .description('Discard experiment')
    .requiredOption('--app <id>', 'App ID')
    .requiredOption('--name <name>', 'Experiment name')
    .action(async (opts) => {
      try {
        const client = await getClient();
        const response = await zeaFetch(`${client.appsUrl}/api/apps/${opts.app}/experiments/${opts.name}`, {
          method: 'DELETE',
          headers: client.headers
        });
        const result = await response.json();
        if (response.ok) {
          console.log(`✅ Experiment '${opts.name}' discarded.`);
        } else {
          console.error('Error:', result.error);
        }
      } catch (e) {
        console.error('Error:', e.message);
      }
    });
}
