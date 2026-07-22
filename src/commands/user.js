import zeaFetch from '../lib/http.js';
import { getClient } from '../client.js';
import { getGlobalOpts } from '../lib/globals.js';
import { handleError } from '../lib/errors.js';

export function register(program) {
  const userCmd = program.command('user').description('User management');

  // ── list ───────────────────────────────────────────
  userCmd.command('list')
    .description('List users')
    .option('--status <status>', 'Filter: active, suspended, deactivated')
    .option('--org <id>', 'Filter by organization')
    .option('--verified <bool>', 'Filter by verification status')
    .option('--limit <n>', 'Max results', '50')
    .action(async (options) => {
      const opts = getGlobalOpts();
      try {
        const client = await getClient();
        const params = new URLSearchParams();
        if (options.status) params.set('status', options.status);
        if (options.org) params.set('organization_id', options.org);
        if (options.verified) params.set('verified', options.verified);
        if (options.limit) params.set('limit', options.limit);

        const resp = await zeaFetch(`${client.apiUrl}/api/users?${params}`, { headers: client.headers });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const result = await resp.json();
        const users = result.data || [];

        if (opts.output === 'json') { console.log(JSON.stringify(users, null, 2)); return; }
        if (users.length === 0) { console.log('No users found.'); return; }

        console.log('Users:');
        for (const u of users) {
          const verified = u.verified ? '✅' : '⚠️';
          console.log(`   ${u.email} — ${u.name || '(no name)'} [${u.status}] ${verified}`);
        }
      } catch (e) { handleError(e); process.exit(1); }
    });

  // ── show ───────────────────────────────────────────
  userCmd.command('show <id>')
    .description('Show user details')
    .action(async (id) => {
      const opts = getGlobalOpts();
      try {
        const client = await getClient();
        const resp = await zeaFetch(`${client.apiUrl}/api/users/${id}`, { headers: client.headers });
        if (!resp.ok) {
          if (resp.status === 404) { console.error('❌ User not found'); process.exit(1); }
          throw new Error(`HTTP ${resp.status}`);
        }

        const u = (await resp.json()).data;
        if (opts.output === 'json') { console.log(JSON.stringify(u, null, 2)); return; }

        console.log(`   Email:     ${u.email}`);
        console.log(`   Name:      ${u.name || '(none)'}`);
        console.log(`   ID:        ${u.id}`);
        console.log(`   Status:    ${u.status}`);
        console.log(`   Verified:  ${u.verified ? '✅' : '❌'}`);
        console.log(`   MFA:       ${u.mfa_enabled ? '✅ enabled' : '❌ disabled'}`);
        if (u.is_agent) {
          console.log('   Agent:     ✅');
          if (u.agent_config) console.log(`   Config:    ${JSON.stringify(u.agent_config)}`);
        }
      } catch (e) { handleError(e); process.exit(1); }
    });

  // ── create ─────────────────────────────────────────
  userCmd.command('create')
    .description('Create a new user')
    .requiredOption('--email <email>', 'User email')
    .requiredOption('--password <password>', 'User password')
    .option('--name <name>', 'Display name')
    .option('--agent', 'Create as agent user')
    .action(async (options) => {
      const opts = getGlobalOpts();
      try {
        const body = {
          email: options.email,
          password: options.password,
          name: options.name || options.email.split('@')[0],
          is_agent: options.agent || false,
        };

        if (opts.dryRun) {
          console.log('⚠️  DRY RUN — would execute:');
          console.log(`   POST /api/users`);
          console.log(`   Body: ${JSON.stringify({ ...body, password: '***' }, null, 2)}`);
          return;
        }

        const client = await getClient();
        const resp = await zeaFetch(`${client.apiUrl}/api/users`, {
          method: 'POST', headers: client.headers, body: JSON.stringify(body)
        });

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          if (resp.status === 409) { console.error(`❌ Email already registered`); process.exit(1); }
          throw new Error(err.error || err.details || `HTTP ${resp.status}`);
        }

        const result = await resp.json();
        console.log(`✅ User created: ${result.data.email} (${result.data.id})`);
      } catch (e) { handleError(e); process.exit(1); }
    });

  // ── update ─────────────────────────────────────────
  userCmd.command('update <id>')
    .description('Update user status')
    .option('--status <status>', 'active, suspended, deactivated')
    .option('--name <name>', 'New display name')
    .action(async (id, options) => {
      const opts = getGlobalOpts();
      try {
        const body = {};
        if (options.status) body.status = options.status;
        if (options.name) body.name = options.name;

        if (Object.keys(body).length === 0) {
          console.error('❌ Nothing to update. Use --status or --name.');
          process.exit(1);
        }

        if (opts.dryRun) {
          console.log('⚠️  DRY RUN — would execute:');
          console.log(`   PATCH /api/users/${id}`);
          console.log(`   Body: ${JSON.stringify(body, null, 2)}`);
          return;
        }

        const client = await getClient();
        const resp = await zeaFetch(`${client.apiUrl}/api/users/${id}`, {
          method: 'PATCH', headers: client.headers, body: JSON.stringify(body)
        });

        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        console.log('✅ User updated.');
      } catch (e) { handleError(e); process.exit(1); }
    });

  // ── delete ─────────────────────────────────────────
  userCmd.command('delete <id>')
    .description('Deactivate a user')
    .action(async (id) => {
      const opts = getGlobalOpts();
      try {
        if (opts.dryRun) { console.log(`⚠️  DRY RUN — would DELETE /api/users/${id}`); return; }
        const client = await getClient();
        const resp = await zeaFetch(`${client.apiUrl}/api/users/${id}`, {
          method: 'DELETE', headers: client.headers
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        console.log('✅ User deactivated.');
      } catch (e) { handleError(e); process.exit(1); }
    });

  // ── role subcommands ───────────────────────────────
  const roleCmd = userCmd.command('role').description('User-role assignments');

  roleCmd.command('list <user_id>')
    .description('List roles assigned to a user')
    .action(async (userId) => {
      const opts = getGlobalOpts();
      try {
        const client = await getClient();
        const resp = await zeaFetch(`${client.apiUrl}/api/users/${userId}/roles`, { headers: client.headers });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const result = await resp.json();
        const roles = result.data || [];

        if (opts.output === 'json') { console.log(JSON.stringify(roles, null, 2)); return; }
        if (roles.length === 0) { console.log('No roles assigned.'); return; }
        for (const r of roles) console.log(`   ${r.role || r.name} — scopes: ${(r.scopes || []).join(', ')}`);
      } catch (e) { handleError(e); process.exit(1); }
    });

  roleCmd.command('assign <user_id>')
    .description('Assign a role to a user')
    .requiredOption('--role-id <id>', 'Role ID to assign')
    .action(async (userId, options) => {
      const opts = getGlobalOpts();
      try {
        if (opts.dryRun) { console.log(`⚠️  DRY RUN — would assign role ${options.roleId} to user ${userId}`); return; }
        const client = await getClient();
        const resp = await zeaFetch(`${client.apiUrl}/api/users/${userId}/roles`, {
          method: 'POST', headers: client.headers,
          body: JSON.stringify({ role_id: options.roleId })
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        console.log('✅ Role assigned.');
      } catch (e) { handleError(e); process.exit(1); }
    });

  roleCmd.command('revoke <user_id>')
    .description('Revoke a role from a user')
    .requiredOption('--role-id <id>', 'Role ID to revoke')
    .action(async (userId, options) => {
      const opts = getGlobalOpts();
      try {
        if (opts.dryRun) { console.log(`⚠️  DRY RUN — would revoke role ${options.roleId} from user ${userId}`); return; }
        const client = await getClient();
        const resp = await zeaFetch(`${client.apiUrl}/api/users/${userId}/roles/${options.roleId}`, {
          method: 'DELETE', headers: client.headers
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        console.log('✅ Role revoked.');
      } catch (e) { handleError(e); process.exit(1); }
    });

  // ── scopes ─────────────────────────────────────────
  userCmd.command('scopes <user_id>')
    .description('Show effective scopes for a user')
    .action(async (userId) => {
      const opts = getGlobalOpts();
      try {
        const client = await getClient();
        const resp = await zeaFetch(`${client.apiUrl}/api/users/${userId}/effective-scopes`, { headers: client.headers });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const result = await resp.json();
        const scopes = result.data || result.scopes || [];

        if (opts.output === 'json') { console.log(JSON.stringify(scopes, null, 2)); return; }
        if (scopes.length === 0) { console.log('No scopes.'); return; }
        console.log('Effective Scopes:');
        for (const s of scopes) console.log(`   - ${s}`);
      } catch (e) { handleError(e); process.exit(1); }
    });
}
