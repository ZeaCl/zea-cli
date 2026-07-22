import zeaFetch from '../lib/http.js';
import { getClient } from '../client.js';
import { getGlobalOpts } from '../lib/globals.js';
import { handleError } from '../lib/errors.js';

export function register(program) {
  const adminCmd = program.command('admin').description('Admin operations (super_admin required)');
  const apiKeyCmd = adminCmd.command('api-key').description('Admin API Key management');

  // ── list ───────────────────────────────────────────
  apiKeyCmd.command('list')
    .description('List admin API keys')
    .action(async () => {
      const opts = getGlobalOpts();
      try {
        const client = await getClient();
        const resp = await zeaFetch(`${client.apiUrl}/api/admin/api-keys`, { headers: client.headers });

        if (resp.status === 403) { console.error('❌ Forbidden — super_admin role required'); process.exit(1); }
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const result = await resp.json();
        const keys = result.data || [];

        if (opts.output === 'json') { console.log(JSON.stringify(keys, null, 2)); return; }
        if (keys.length === 0) { console.log('No admin API keys.'); return; }

        console.log('Admin API Keys:');
        for (const k of keys) {
          const status = k.is_active ? 'active' : 'inactive';
          console.log(`   ${k.name} (${k.id?.slice(0, 8)}...) [${status}]`);
          console.log(`     Scopes: ${(k.scopes || []).join(', ') || '(none)'}`);
        }
      } catch (e) { handleError(e); process.exit(1); }
    });

  // ── create ─────────────────────────────────────────
  apiKeyCmd.command('create')
    .description('Create a new admin API key')
    .requiredOption('--name <name>', 'Key name')
    .option('--scopes <scopes>', 'Comma-separated scopes', 'clients:write')
    .action(async (options) => {
      const opts = getGlobalOpts();
      try {
        const body = {
          name: options.name,
          scopes: (options.scopes || '').split(',').map(s => s.trim()).filter(Boolean),
        };

        if (opts.dryRun) {
          console.log('⚠️  DRY RUN — would execute:');
          console.log(`   POST /api/admin/api-keys`);
          console.log(`   Body: ${JSON.stringify(body, null, 2)}`);
          return;
        }

        const client = await getClient();
        const resp = await zeaFetch(`${client.apiUrl}/api/admin/api-keys`, {
          method: 'POST', headers: client.headers, body: JSON.stringify(body)
        });

        if (resp.status === 403) { console.error('❌ Forbidden — super_admin role required'); process.exit(1); }
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const result = await resp.json();
        console.log('✅ Admin API Key created:');
        console.log(`   ⚠️  API KEY: ${result.data?.api_key || result.data?.key}`);
        console.log('   SAVE THIS — it will not be shown again.');
      } catch (e) { handleError(e); process.exit(1); }
    });

  // ── revoke ─────────────────────────────────────────
  apiKeyCmd.command('revoke <id>')
    .description('Revoke an admin API key')
    .action(async (id) => {
      const opts = getGlobalOpts();
      try {
        if (opts.dryRun) { console.log(`⚠️  DRY RUN — would DELETE /api/admin/api-keys/${id}`); return; }
        const client = await getClient();
        const resp = await zeaFetch(`${client.apiUrl}/api/admin/api-keys/${id}`, {
          method: 'DELETE', headers: client.headers
        });
        if (resp.status === 403) { console.error('❌ Forbidden — super_admin role required'); process.exit(1); }
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        console.log('✅ API Key revoked.');
      } catch (e) { handleError(e); process.exit(1); }
    });

  // ── rotate ─────────────────────────────────────────
  apiKeyCmd.command('rotate <id>')
    .description('Rotate an admin API key')
    .action(async (id) => {
      const opts = getGlobalOpts();
      try {
        if (opts.dryRun) { console.log(`⚠️  DRY RUN — would POST /api/admin/api-keys/${id}/rotate`); return; }
        const client = await getClient();
        const resp = await zeaFetch(`${client.apiUrl}/api/admin/api-keys/${id}/rotate`, {
          method: 'POST', headers: client.headers
        });
        if (resp.status === 403) { console.error('❌ Forbidden — super_admin role required'); process.exit(1); }
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const result = await resp.json();
        console.log('✅ API Key rotated:');
        console.log(`   ⚠️  NEW KEY: ${result.data?.api_key || result.data?.key}`);
        console.log('   Old key invalidated. SAVE THE NEW ONE.');
      } catch (e) { handleError(e); process.exit(1); }
    });
}
