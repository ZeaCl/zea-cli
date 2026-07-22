import zeaFetch from '../lib/http.js';
import { getClient } from '../client.js';
import { getGlobalOpts } from '../lib/globals.js';
import { handleError } from '../lib/errors.js';

export function register(program) {
  const clientCmd = program.command('client').description('OAuth2 Client management');

  // ── list ───────────────────────────────────────────
  clientCmd.command('list')
    .description('List OAuth2 clients')
    .option('--org <slug>', 'Filter by organization')
    .action(async (options) => {
      const opts = getGlobalOpts();
      try {
        const client = await getClient();
        const params = new URLSearchParams();
        if (options.org) params.set('organization_id', options.org);

        const url = `${client.apiUrl}/api/clients?${params}`;
        const response = await zeaFetch(url, { headers: client.headers });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const result = await response.json();
        const clients = result.data || [];

        if (opts.output === 'json') {
          console.log(JSON.stringify(clients, null, 2));
          return;
        }

        if (clients.length === 0) {
          console.log('No OAuth2 clients found. Create one: zea thalamus client create');
          return;
        }

        console.log('OAuth2 Clients:');
        for (const c of clients) {
          const status = c.is_active ? 'active' : 'inactive';
          const uris = (c.redirect_uris || []).slice(0, 2).join(', ');
          if ((c.redirect_uris || []).length > 2) uris += ` +${c.redirect_uris.length - 2} more`;
          console.log(`   ${c.name} (${c.id?.slice(0, 8)}...) ${c.client_type} [${status}]`);
          console.log(`     Redirect URIs: ${uris || '(none)'}`);
          console.log(`     Grants: ${(c.grant_types || []).join(', ') || '(none)'}`);
        }
      } catch (e) {
        handleError(e);
        process.exit(1);
      }
    });

  // ── show ───────────────────────────────────────────
  clientCmd.command('show <id>')
    .description('Show OAuth2 client details')
    .action(async (id) => {
      const opts = getGlobalOpts();
      try {
        const client = await getClient();
        const response = await zeaFetch(`${client.apiUrl}/api/clients/${id}`, {
          headers: client.headers
        });

        if (!response.ok) {
          if (response.status === 404) { console.error('❌ Client not found'); process.exit(1); }
          throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();
        const c = result.data;

        if (opts.output === 'json') {
          console.log(JSON.stringify(c, null, 2));
          return;
        }

        console.log(`   Name:          ${c.name}`);
        console.log(`   ID:            ${c.id}`);
        console.log(`   Type:          ${c.client_type}`);
        console.log(`   Organization:  ${c.organization_id}`);
        console.log(`   Status:        ${c.is_active ? 'active' : 'inactive'}`);
        console.log(`   Redirect URIs: ${(c.redirect_uris || []).join(', ') || '(none)'}`);
        console.log(`   Grant Types:   ${(c.grant_types || []).join(', ') || '(none)'}`);
        console.log(`   Scopes:        ${(c.scopes || []).join(', ') || '(none)'}`);
        if (c.trusted) console.log('   Trusted:       ✅');
      } catch (e) {
        handleError(e);
        process.exit(1);
      }
    });

  // ── create ─────────────────────────────────────────
  clientCmd.command('create')
    .description('Create a new OAuth2 client')
    .option('--name <name>', 'Client name')
    .option('--type <type>', 'Client type: confidential, public, m2m', 'confidential')
    .option('--redirect-uris <uris>', 'Comma-separated redirect URIs')
    .option('--grants <grants>', 'Comma-separated grant types', 'authorization_code,refresh_token')
    .option('--scopes <scopes>', 'Comma-separated scopes', 'openid,profile,email')
    .action(async (options) => {
      const opts = getGlobalOpts();
      try {
        const client = await getClient();

        const body = {
          name: options.name || 'Unnamed Client',
          organization_id: client.activeOrgId,
          client_type: options.type,
          redirect_uris: (options.redirectUris || '').split(',').map(s => s.trim()).filter(Boolean),
          grant_types: (options.grants || '').split(',').map(s => s.trim()).filter(Boolean),
          scopes: (options.scopes || '').split(',').map(s => s.trim()).filter(Boolean),
        };

        if (opts.dryRun) {
          console.log('⚠️  DRY RUN — would execute:');
          console.log(`   POST ${client.apiUrl}/api/clients`);
          console.log(`   Body: ${JSON.stringify(body, null, 2)}`);
          return;
        }

        const response = await zeaFetch(`${client.apiUrl}/api/clients`, {
          method: 'POST',
          headers: client.headers,
          body: JSON.stringify(body)
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || err.details || `HTTP ${response.status}`);
        }

        const result = await response.json();
        const c = result.data;

        console.log(`✅ Client created: ${c.name} (${c.id})`);
        console.log(`   Type: ${c.client_type}`);

        if (c.client_secret) {
          console.log(`   ⚠️  CLIENT SECRET: ${c.client_secret}`);
          console.log('   SAVE THIS — it will not be shown again.');
        } else if (c.client_type === 'public') {
          console.log('   Public client — no client secret needed.');
        }

        if (opts.output === 'json') {
          console.log(JSON.stringify(result, null, 2));
        }
      } catch (e) {
        handleError(e);
        process.exit(1);
      }
    });

  // ── delete ─────────────────────────────────────────
  clientCmd.command('delete <id>')
    .description('Deactivate an OAuth2 client')
    .action(async (id) => {
      const opts = getGlobalOpts();
      try {
        if (opts.dryRun) {
          console.log(`⚠️  DRY RUN — would DELETE /api/clients/${id}`);
          return;
        }

        const client = await getClient();
        const response = await zeaFetch(`${client.apiUrl}/api/clients/${id}`, {
          method: 'DELETE',
          headers: client.headers
        });

        if (!response.ok) {
          if (response.status === 404) { console.error('❌ Client not found'); process.exit(1); }
          throw new Error(`HTTP ${response.status}`);
        }

        console.log('✅ Client deactivated.');
      } catch (e) {
        handleError(e);
        process.exit(1);
      }
    });

  // ── rotate-secret ──────────────────────────────────
  clientCmd.command('rotate-secret <id>')
    .description('Rotate OAuth2 client secret')
    .action(async (id) => {
      const opts = getGlobalOpts();
      try {
        if (opts.dryRun) {
          console.log(`⚠️  DRY RUN — would POST /api/clients/${id}/rotate-secret`);
          return;
        }

        const client = await getClient();
        const response = await zeaFetch(`${client.apiUrl}/api/clients/${id}/rotate-secret`, {
          method: 'POST',
          headers: client.headers
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${response.status}`);
        }

        const result = await response.json();

        if (opts.output === 'json') {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log('✅ Secret rotated.');
        console.log(`   ⚠️  NEW CLIENT SECRET: ${result.data?.client_secret}`);
        console.log('   Old secret is now invalid. SAVE THE NEW ONE.');
      } catch (e) {
        handleError(e);
        process.exit(1);
      }
    });

  // ── validate ───────────────────────────────────────
  clientCmd.command('validate <id>')
    .description('Validate OAuth2 client configuration')
    .action(async (id) => {
      const opts = getGlobalOpts();
      try {
        const client = await getClient();
        const response = await zeaFetch(`${client.apiUrl}/api/clients/${id}/validate`, {
          headers: client.headers
        });

        if (!response.ok) {
          if (response.status === 404) { console.error('❌ Client not found'); process.exit(1); }
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${response.status}`);
        }

        const result = await response.json();

        if (opts.output === 'json') {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log(`   Client:   ${result.client_name} (${result.client_id})`);
        console.log(`   Status:   ${result.status?.toUpperCase()}`);
        console.log(`   Summary:  ${result.summary?.pass || 0} ✅  ${result.summary?.warn || 0} ⚠️  ${result.summary?.fail || 0} ❌`);
        console.log('');

        if (result.checks) {
          for (const check of result.checks) {
            const icon = check.status === 'pass' ? '✅' : check.status === 'warn' ? '⚠️' : '❌';
            console.log(`   ${icon} ${check.name}: ${check.message || check.status}`);
          }
        }

        if (result.status !== 'pass') process.exit(1);
      } catch (e) {
        handleError(e);
        process.exit(1);
      }
    });
}
