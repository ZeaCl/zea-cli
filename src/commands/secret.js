import zeaFetch from '../lib/http.js';
import { getClient, loadConfig } from '../client.js';
import { getGlobalOpts } from '../lib/globals.js';
import { handleError } from '../lib/errors.js';

export function register(program) {
  const secretCmd = program.command('secret').description('Secrets management');

  // ── list ───────────────────────────────────────────
  secretCmd.command('list')
    .description('List secrets')
    .option('--owner-type <type>', 'user or organization')
    .option('--owner-id <id>', 'Owner ID')
    .action(async (options) => {
      const opts = getGlobalOpts();
      try {
        const client = await getClient();
        const params = new URLSearchParams();
        if (options.ownerType) params.set('owner_type', options.ownerType);
        if (options.ownerId) params.set('owner_id', options.ownerId);

        const resp = await zeaFetch(`${client.apiUrl}/api/secrets?${params}`, { headers: client.headers });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const result = await resp.json();
        const secrets = result.data || [];

        if (opts.output === 'json') { console.log(JSON.stringify(secrets, null, 2)); return; }
        if (secrets.length === 0) { console.log('No secrets found.'); return; }

        console.log('Secrets:');
        for (const s of secrets) {
          const valMasked = s.value ? '••••' + s.value.slice(-4) : '(empty)';
          console.log(`   ${s.name} — provider: ${s.provider} — value: ${valMasked}`);
        }
      } catch (e) { handleError(e); process.exit(1); }
    });

  // ── create ─────────────────────────────────────────
  secretCmd.command('create')
    .description('Create a new secret')
    .requiredOption('--name <name>', 'Secret name')
    .requiredOption('--provider <provider>', 'Provider (e.g. deepseek, openai, aws)')
    .requiredOption('--value <value>', 'Secret value')
    .option('--owner-type <type>', 'user or organization')
    .option('--owner-id <id>', 'Owner ID')
    .action(async (options) => {
      const opts = getGlobalOpts();
      try {
        const body = {
          secret: {
            name: options.name,
            provider: options.provider,
            value: options.value,
            owner_type: options.ownerType || 'user',
            owner_id: options.ownerId || '',
          }
        };

        if (opts.dryRun) {
          console.log('⚠️  DRY RUN — would execute:');
          console.log(`   POST /api/secrets`);
          console.log(`   Body: ${JSON.stringify({ ...body.secret, value: '***' }, null, 2)}`);
          return;
        }

        const client = await getClient();
        const resp = await zeaFetch(`${client.apiUrl}/api/secrets`, {
          method: 'POST', headers: client.headers, body: JSON.stringify(body)
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        console.log('✅ Secret created.');
      } catch (e) { handleError(e); process.exit(1); }
    });

  // ── delete ─────────────────────────────────────────
  secretCmd.command('delete <id>')
    .description('Delete a secret')
    .action(async (id) => {
      const opts = getGlobalOpts();
      try {
        if (opts.dryRun) { console.log(`⚠️  DRY RUN — would DELETE /api/secrets/${id}`); return; }
        const client = await getClient();
        const resp = await zeaFetch(`${client.apiUrl}/api/secrets/${id}`, {
          method: 'DELETE', headers: client.headers
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        console.log('✅ Secret deleted.');
      } catch (e) { handleError(e); process.exit(1); }
    });

  // ── resolve ────────────────────────────────────────
  secretCmd.command('resolve')
    .description('Resolve a secret value by provider')
    .requiredOption('--provider <provider>', 'Provider name')
    .action(async (options) => {
      const opts = getGlobalOpts();
      try {
        const client = await getClient();

        // Get user and org IDs from userinfo
        let userId = '', orgId = '';
        try {
          const uResp = await zeaFetch(`${client.apiUrl}/oauth/userinfo`, { headers: client.headers });
          if (uResp.ok) {
            const info = await uResp.json();
            userId = info.sub || '';
            orgId = client.activeOrgId || info.organization?.id || '';
          }
        } catch { /* continue without IDs */ }

        const params = new URLSearchParams({
          provider: options.provider,
          user_id: userId,
          org_id: orgId,
        });

        const resp = await zeaFetch(`${client.apiUrl}/api/internal/secrets/resolve?${params}`);
        if (!resp.ok) {
          if (resp.status === 404) {
            console.error(`❌ No secret found for provider '${options.provider}'`);
            console.error('   Create one: zea thalamus secret create');
            process.exit(1);
          }
          throw new Error(`HTTP ${resp.status}`);
        }

        const data = await resp.json();
        if (opts.output === 'json') { console.log(JSON.stringify(data, null, 2)); return; }
        console.log(`✅ Resolved '${options.provider}': ${data.value}`);
      } catch (e) { handleError(e); process.exit(1); }
    });
}
