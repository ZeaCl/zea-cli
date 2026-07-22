import zeaFetch from '../lib/http.js';
import { getClient, loadConfig } from '../client.js';
import { getGlobalOpts } from '../lib/globals.js';
import { handleError } from '../lib/errors.js';

export function register(program) {
  // ── audit ──────────────────────────────────────────
  const auditCmd = program.command('audit').description('Audit log operations');

  auditCmd.command('export')
    .description('Export audit logs')
    .option('--from <date>', 'Start date (ISO8601)')
    .option('--to <date>', 'End date (ISO8601)')
    .option('--event-type <type>', 'Filter by event type')
    .option('--format <format>', 'csv or json', 'json')
    .option('--limit <n>', 'Max records', '100')
    .action(async (options) => {
      const opts = getGlobalOpts();
      try {
        const client = await getClient();
        const params = new URLSearchParams();
        if (options.from) params.set('from', options.from);
        if (options.to) params.set('to', options.to);
        if (options.eventType) params.set('event_type', options.eventType);
        params.set('format', options.format);
        if (options.limit) params.set('limit', options.limit);

        const resp = await zeaFetch(`${client.apiUrl}/api/audit-logs/export?${params}`, {
          headers: client.headers
        });

        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        if (options.format === 'csv') {
          const csv = await resp.text();
          const filename = `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`;
          const fs = await import('fs/promises');
          await fs.writeFile(filename, csv);
          console.log(`✅ Exported to ${filename} (${csv.split('\\n').length - 1} rows)`);
        } else {
          const data = await resp.json();
          if (opts.output === 'json') {
            console.log(JSON.stringify(data, null, 2));
          } else {
            const logs = data.audit_logs || [];
            console.log(`Audit Logs (${data.total_records || logs.length} records):`);
            for (const log of logs.slice(0, 20)) {
              console.log(`   ${log.timestamp?.slice(0, 19)} | ${log.event_type} | ${log.user?.email || log.user_id || ''}`);
            }
            if (logs.length > 20) console.log(`   ... and ${logs.length - 20} more`);
          }
        }
      } catch (e) { handleError(e); process.exit(1); }
    });

  // ── oidc ───────────────────────────────────────────
  const oidcCmd = program.command('oidc').description('OpenID Connect Discovery');

  oidcCmd.command('discovery')
    .description('Show OIDC discovery document')
    .action(async () => {
      const opts = getGlobalOpts();
      try {
        let apiUrl = 'http://auth.zea.localhost';
        try { const c = await loadConfig(); apiUrl = c.apiUrl || apiUrl; } catch {}
        apiUrl = process.env.ZEA_API_URL || process.env.THALAMUS_API_URL || apiUrl;

        const resp = await zeaFetch(`${apiUrl}/.well-known/openid-configuration`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();

        if (opts.output === 'json') {
          console.log(JSON.stringify(data, null, 2));
          return;
        }

        console.log('OIDC Discovery:');
        console.log(`   issuer:                ${data.issuer}`);
        console.log(`   authorization_endpoint: ${data.authorization_endpoint}`);
        console.log(`   token_endpoint:         ${data.token_endpoint}`);
        console.log(`   userinfo_endpoint:      ${data.userinfo_endpoint}`);
        console.log(`   jwks_uri:              ${data.jwks_uri}`);
        console.log(`   scopes_supported:       ${(data.scopes_supported || []).join(', ')}`);
      } catch (e) { handleError(e); process.exit(1); }
    });

  oidcCmd.command('jwks')
    .description('Show JWKS public keys')
    .action(async () => {
      const opts = getGlobalOpts();
      try {
        let apiUrl = 'http://auth.zea.localhost';
        try { const c = await loadConfig(); apiUrl = c.apiUrl || apiUrl; } catch {}
        apiUrl = process.env.ZEA_API_URL || process.env.THALAMUS_API_URL || apiUrl;

        const resp = await zeaFetch(`${apiUrl}/.well-known/jwks.json`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();

        if (opts.output === 'json') { console.log(JSON.stringify(data, null, 2)); return; }

        console.log('JWKS:');
        for (const key of (data.keys || [])) {
          console.log(`   ${key.kid} — ${key.alg} (${key.kty})`);
        }
      } catch (e) { handleError(e); process.exit(1); }
    });
}
