import { loadConfig, saveConfig, handleDirectLogin, handleLogin, getClient } from '../client.js';
import { zeaFetch } from '../lib/http.js';
import { handleError } from '../lib/errors.js';

export function register(program) {
  program.command('login')
    .description('Login interactively using browser')
    .option('--url <url>', 'ZEA API URL')
    .option('--email <email>', 'Email for direct login (requires --password)')
    .option('--password <password>', 'Password for direct login (requires --email)')
    .action(async (options) => {
      if (options.email && options.password) {
        await handleDirectLogin(options);
      } else {
        await handleLogin(options);
      }
    });

  program.command('set-token <token>')
    .description('Configure a Personal Access Token (PAT) manually')
    .option('--url <url>', 'ZEA API URL')
    .action(async (token, options) => {
      const config = await loadConfig();
      config.token = token;
      if (options.url) config.apiUrl = options.url;
      await saveConfig(config);
      console.log('Personal Access Token saved successfully.');
    });

  program.command('whoami')
    .description('Show current authenticated user identity')
    .action(async () => {
      try {
        const client = await getClient();
        const response = await zeaFetch(`${client.apiUrl}/oauth/userinfo`, {
          headers: client.headers
        });

        if (!response.ok) {
          if (response.status === 401) {
            console.error('🔒 Token expired or invalid. Run: zea thalamus auth login');
          } else {
            const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
            console.error(`❌ Failed: ${err.error || err.error_description || `HTTP ${response.status}`}`);
          }
          process.exit(1);
        }

        const info = await response.json();
        const orgs = info.organizations || [];
        const primaryOrg = info.organization || {};
        const activeOrgId = client.activeOrgId;

        const verifiedIcon = info.email_verified ? '✅' : '⚠️';
        console.log(`   User:      ${info.email} (${info.name || 'No name'}) ${verifiedIcon}`);

        if (primaryOrg.name) {
          console.log(`   Org:       ${primaryOrg.name} (${primaryOrg.slug || primaryOrg.id})`);
        }

        if (orgs.length > 0) {
          const orgList = orgs.map(o => {
            const marker = o.id === activeOrgId ? '*' : ' ';
            return `${marker} ${o.name} (${o.slug || o.id})`;
          }).join(', ');
          console.log(`   Orgs:      ${orgList}`);
        }

        if (info.updated_at) {
          console.log(`   Updated:   ${new Date(info.updated_at * 1000).toISOString()}`);
        }
      } catch (e) {
        if (e.message?.includes('Not authenticated')) {
          console.error('❌ Not authenticated. Run: zea thalamus auth login');
        } else if (e.code === 'ENOTFOUND' || e.code === 'ECONNREFUSED') {
          console.error('❌ Cannot reach Thalamus. Is it running? Run: zea thalamus health');
        } else {
          handleError(e);
        }
        process.exit(1);
      }
    });

  program.command('logout')
    .description('Revoke current token and clear local config')
    .action(async () => {
      try {
        const client = await getClient();

        // Try server-side revoke
        try {
          await zeaFetch(`${client.apiUrl}/oauth/revoke`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `token=${encodeURIComponent(client.token)}&token_type_hint=access_token`
          });
          console.log('✅ Logged out successfully.');
        } catch {
          console.log('⚠️  Token cleared locally (server unreachable).');
        }
      } catch (e) {
        if (e.message?.includes('Not authenticated')) {
          console.log('⚠️  Not currently authenticated.');
        } else {
          console.log('⚠️  Token cleared locally.');
        }
      }

      // Always clear local config
      const config = await loadConfig();
      delete config.token;
      delete config.refreshToken;
      delete config.activeOrgId;
      await saveConfig(config);
    });

  program.command('debug [token]')
    .description('Decode and inspect a JWT token (uses stored token if not provided)')
    .action(async (tokenArg) => {
      try {
        let token = tokenArg;
        if (!token) {
          const client = await getClient();
          token = client.token;
        }

        // Check if it looks like a JWT
        if (!token || !token.includes('.')) {
          if (token && token.startsWith('th_pat_')) {
            console.log('⚠️  This is a Personal Access Token (PAT), not a JWT.');
            console.log('   PATs are opaque tokens and cannot be decoded locally.');
            console.log('   Run: zea thalamus token list');
          } else {
            console.error('❌ Not a valid JWT token.');
            process.exit(1);
          }
          return;
        }

        const parts = token.split('.');
        if (parts.length !== 3) {
          console.error('❌ Not a valid JWT (expected 3 parts).');
          process.exit(1);
        }

        // Decode header and payload
        const b64decode = (str) => {
          const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
          const decoded = Buffer.from(base64, 'base64').toString('utf8');
          return JSON.parse(decoded);
        };

        let header, payload;
        try {
          header = b64decode(parts[0]);
          payload = b64decode(parts[1]);
        } catch {
          console.error('❌ Failed to decode JWT parts.');
          process.exit(1);
        }

        // Header
        console.log('── Header ──────────────────────────────────');
        console.log(`   alg: ${header.alg || 'unknown'}`);
        console.log(`   typ: ${header.typ || 'JWT'}`);
        if (header.kid) console.log(`   kid: ${header.kid}`);

        // Payload
        console.log('── Payload ─────────────────────────────────');
        const fields = [
          ['sub', 'Subject'],
          ['email', 'Email'],
          ['name', 'Name'],
          ['scope', 'Scope'],
          ['aud', 'Audience'],
          ['iss', 'Issuer'],
          ['client_id', 'Client ID'],
        ];

        for (const [key, label] of fields) {
          if (payload[key]) console.log(`   ${label.padEnd(12)} ${payload[key]}`);
        }

        // Expiry
        if (payload.exp) {
          const expDate = new Date(payload.exp * 1000);
          const now = new Date();
          const diffMin = Math.round((expDate - now) / 60000);
          const status = diffMin > 0
            ? `expires in ${diffMin}min (${expDate.toISOString()})`
            : `EXPIRED ${Math.abs(diffMin)}min ago`;
          console.log(`   Expires     ${status}`);
        }

        if (payload.iat) {
          console.log(`   Issued      ${new Date(payload.iat * 1000).toISOString()}`);
        }

        // Domain roles
        if (payload.domain_roles && payload.domain_roles.length > 0) {
          console.log('── Domain Roles ────────────────────────────');
          for (const role of payload.domain_roles) {
            const scopes = (role.scopes || []).join(', ');
            console.log(`   ${role.domain}/${role.role} @ ${role.org_id}  [${scopes}]`);
          }
        }

        // Introspect with server
        const config = await loadConfig();
        const apiUrl = config.apiUrl || 'http://auth.zea.localhost';

        console.log('── Server Status ───────────────────────────');
        try {
          const introResp = await zeaFetch(`${apiUrl}/oauth/introspect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `token=${encodeURIComponent(token)}`
          });

          if (introResp.ok) {
            const introData = await introResp.json();
            console.log(`   active:      ${introData.active}`);
            if (!introData.active && introData.reason) {
              console.log(`   reason:      ${introData.reason}`);
            }
          } else {
            console.log(`   ⚠️  Server introspection failed (HTTP ${introResp.status})`);
          }
        } catch {
          console.log('   ⚠️  Server unreachable for introspection');
        }
      } catch (e) {
        handleError(e);
        process.exit(1);
      }
    });
}
