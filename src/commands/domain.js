import zeaFetch from '../lib/http.js';
import { getClient } from '../client.js';
import { getGlobalOpts } from '../lib/globals.js';
import { handleError } from '../lib/errors.js';

export function register(program) {
  const domainCmd = program.command('domain').description('Domain roles management');

  // ── list ───────────────────────────────────────────
  domainCmd.command('list')
    .description('List registered domains and scopes')
    .action(async () => {
      const opts = getGlobalOpts();
      try {
        const client = await getClient();
        const response = await zeaFetch(`${client.apiUrl}/api/domains`, {
          headers: client.headers
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const result = await response.json();
        const domains = result.data || [];

        if (opts.output === 'json') {
          console.log(JSON.stringify(domains, null, 2));
          return;
        }

        if (domains.length === 0) {
          console.log('No domains registered. Register one: zea thalamus domain register');
          return;
        }

        for (const d of domains) {
          console.log(`   ${d.domain} (${(d.scopes || []).length} scopes)`);
          for (const s of (d.scopes || [])) {
            console.log(`     - ${s.scope}: ${s.description || ''}`);
          }
        }
      } catch (e) {
        handleError(e);
        process.exit(1);
      }
    });

  // ── register ───────────────────────────────────────
  domainCmd.command('register')
    .description('Register a domain with its scopes')
    .requiredOption('--domain <domain>', 'Domain name (e.g. venture, fund_management)')
    .requiredOption('--scopes <scopes>', 'JSON array of {scope, description} objects')
    .action(async (options) => {
      const opts = getGlobalOpts();
      try {
        let scopes;
        try {
          scopes = JSON.parse(options.scopes);
        } catch {
          console.error('❌ Invalid JSON for --scopes. Example: \'[{"scope":"domain:read","description":"Read access"}]\'');
          process.exit(1);
        }

        const body = { domain: options.domain, scopes };

        if (opts.dryRun) {
          console.log('⚠️  DRY RUN — would execute:');
          console.log(`   POST /api/domains/register`);
          console.log(`   Body: ${JSON.stringify(body, null, 2)}`);
          return;
        }

        const client = await getClient();
        const response = await zeaFetch(`${client.apiUrl}/api/domains/register`, {
          method: 'POST',
          headers: client.headers,
          body: JSON.stringify(body)
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${response.status}`);
        }

        const result = await response.json();
        console.log(`✅ Domain '${result.domain}' registered with ${result.scope_count} scopes.`);
      } catch (e) {
        handleError(e);
        process.exit(1);
      }
    });

  // ── grant ──────────────────────────────────────────
  domainCmd.command('grant')
    .description('Grant a domain role to a user')
    .requiredOption('--user <id>', 'User ID')
    .requiredOption('--org <id>', 'Organization ID')
    .requiredOption('--domain <domain>', 'Domain name')
    .requiredOption('--role <role>', 'Role name')
    .option('--scopes <scopes>', 'Comma-separated scopes')
    .option('--entity-id <id>', 'Optional entity ID for scoped roles')
    .action(async (options) => {
      const opts = getGlobalOpts();
      try {
        const body = {
          user_id: options.user,
          organization_id: options.org,
          domain: options.domain,
          role: options.role,
          scopes: (options.scopes || '').split(',').map(s => s.trim()).filter(Boolean),
        };
        if (options.entityId) body.entity_id = options.entityId;

        if (opts.dryRun) {
          console.log('⚠️  DRY RUN — would execute:');
          console.log(`   POST /api/domains/roles/grant`);
          console.log(`   Body: ${JSON.stringify(body, null, 2)}`);
          return;
        }

        const client = await getClient();
        const response = await zeaFetch(`${client.apiUrl}/api/domains/roles/grant`, {
          method: 'POST',
          headers: client.headers,
          body: JSON.stringify(body)
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${response.status}`);
        }

        const result = await response.json();
        console.log(`✅ ${result.message}`);
        console.log(`   User: ${result.user_id} | Domain: ${result.domain} | Role: ${result.role}`);
      } catch (e) {
        handleError(e);
        process.exit(1);
      }
    });

  // ── revoke ─────────────────────────────────────────
  domainCmd.command('revoke')
    .description('Revoke a domain role from a user')
    .requiredOption('--user <id>', 'User ID')
    .requiredOption('--org <id>', 'Organization ID')
    .requiredOption('--domain <domain>', 'Domain name')
    .requiredOption('--role <role>', 'Role name')
    .action(async (options) => {
      const opts = getGlobalOpts();
      try {
        const body = {
          user_id: options.user,
          organization_id: options.org,
          domain: options.domain,
          role: options.role,
        };

        if (opts.dryRun) {
          console.log('⚠️  DRY RUN — would execute:');
          console.log(`   DELETE /api/domains/roles/revoke`);
          console.log(`   Body: ${JSON.stringify(body, null, 2)}`);
          return;
        }

        const client = await getClient();
        const response = await zeaFetch(`${client.apiUrl}/api/domains/roles/revoke`, {
          method: 'DELETE',
          headers: { ...client.headers, 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${response.status}`);
        }

        const result = await response.json();
        console.log(`✅ ${result.message}`);
      } catch (e) {
        handleError(e);
        process.exit(1);
      }
    });

  // ── roles ──────────────────────────────────────────
  domainCmd.command('roles')
    .description('List domain roles (with optional filters)')
    .option('--user <id>', 'Filter by user ID')
    .option('--org <id>', 'Filter by organization ID')
    .option('--domain <domain>', 'Filter by domain')
    .action(async (options) => {
      const opts = getGlobalOpts();
      try {
        const client = await getClient();
        const params = new URLSearchParams();
        if (options.user) params.set('user_id', options.user);
        if (options.org) params.set('organization_id', options.org);
        if (options.domain) params.set('domain', options.domain);

        const response = await zeaFetch(`${client.apiUrl}/api/domains/roles?${params}`, {
          headers: client.headers
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const result = await response.json();
        const roles = result.data || [];

        if (opts.output === 'json') {
          console.log(JSON.stringify(roles, null, 2));
          return;
        }

        if (roles.length === 0) {
          console.log('No domain roles found.');
          return;
        }

        console.log('Domain Roles:');
        for (const r of roles) {
          const scopes = (r.scopes || []).join(', ');
          console.log(`   ${r.domain}/${r.role} — user: ${r.user_id?.slice(0, 8)}... org: ${r.organization_id?.slice(0, 8)}... [${scopes}]`);
        }
      } catch (e) {
        handleError(e);
        process.exit(1);
      }
    });
}
