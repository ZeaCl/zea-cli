import { loadConfig, getClient } from '../client.js';
import { zeaFetch } from '../lib/http.js';

let passes = 0;
let warnings = 0;
let failures = 0;

function pass(msg) { passes++; console.log(`   ✅ ${msg}`); }
function warn(msg) { warnings++; console.log(`   ⚠️  ${msg}`); }
function fail(msg) { failures++; console.log(`   ❌ ${msg}`); }

export function register(program) {
  program.command('doctor')
    .description('Full integration diagnostic: auth, token, database, organizations')
    .action(async () => {
      let apiUrl = 'http://auth.zea.localhost';
      try {
        const config = await loadConfig();
        apiUrl = config.apiUrl || apiUrl;
      } catch {}
      apiUrl = process.env.ZEA_API_URL || process.env.THALAMUS_API_URL || apiUrl;

      console.log('');
      console.log(`   🔍 ZEA Doctor — ${apiUrl}`);
      console.log('');

      // ── 1. Reachability ──────────────────────────
      console.log('── Connectivity ────────────────────────────');
      let healthData = null;
      try {
        const resp = await zeaFetch(`${apiUrl}/api/public/health`);
        if (resp.ok) {
          healthData = await resp.json();
          pass(`Thalamus reachable (v${healthData.version || '?.?.?'})`);

          if (healthData.checks) {
            for (const [name, result] of Object.entries(healthData.checks)) {
              if (result === 'ok') pass(`${name}: ok`);
              else fail(`${name}: ${result}`);
            }
          }
        } else {
          fail(`Thalamus returned HTTP ${resp.status}`);
        }
      } catch (e) {
        if (e.code === 'ENOTFOUND' || e.code === 'ECONNREFUSED') {
          fail(`Cannot reach ${apiUrl}`);
          console.log('');
          console.log('   💡 Try: docker compose -f docker-compose.test.yml up -d --wait');
        } else {
          fail(`Connection error: ${e.message}`);
        }
      }

      // If not reachable, skip the rest
      if (!healthData) {
        printSummary();
        return;
      }

      // ── 2. Authentication ────────────────────────
      console.log('── Authentication ──────────────────────────');
      let token = null;
      let userinfoData = null;
      try {
        const client = await getClient();
        token = client.token;
        pass('Token found in config');

        try {
          const userResp = await zeaFetch(`${apiUrl}/oauth/userinfo`, {
            headers: client.headers
          });

          if (userResp.ok) {
            userinfoData = await userResp.json();
            pass(`Authenticated as ${userinfoData.email} (${userinfoData.sub})`);

            // Check token expiry via introspection
            try {
              const introResp = await zeaFetch(`${apiUrl}/oauth/introspect`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `token=${encodeURIComponent(token)}`
              });

              if (introResp.ok) {
                const introData = await introResp.json();
                if (introData.active) {
                  // Calculate remaining time
                  if (introData.exp) {
                    const expDate = new Date(introData.exp * 1000);
                    const diffMin = Math.round((expDate - new Date()) / 60000);
                    if (diffMin < 5) {
                      warn(`Token expires in ${diffMin} minutes`);
                    } else {
                      pass(`Token valid (expires in ~${diffMin}min)`);
                    }
                  } else {
                    pass('Token active');
                  }
                } else {
                  warn(`Token inactive: ${introData.reason || 'unknown reason'}`);
                }
              }
            } catch {
              warn('Token introspection unavailable');
            }
          } else if (userResp.status === 401) {
            fail('Token expired or invalid');
            console.log('   💡 Run: zea thalamus auth login');
          } else {
            fail(`UserInfo failed: HTTP ${userResp.status}`);
          }
        } catch (e) {
          fail(`Auth check failed: ${e.message}`);
        }
      } catch (e) {
        if (e.message?.includes('Not authenticated')) {
          warn('No token found');
          console.log('   💡 Run: zea thalamus auth login');
        } else {
          fail(`Token error: ${e.message}`);
        }
      }

      // ── 3. Organizations ─────────────────────────
      if (userinfoData) {
        console.log('── Organizations ───────────────────────────');
        const orgs = userinfoData.organizations || [];
        const primaryOrg = userinfoData.organization || {};

        if (orgs.length > 0) {
          let activeOrgId = null;
          try {
            const config = await loadConfig();
            activeOrgId = config.activeOrgId;
          } catch {}

          for (const org of orgs) {
            const marker = org.id === activeOrgId ? '*' : ' ';
            pass(`${marker}${org.name} (${org.slug || org.id})`);
          }
        } else {
          warn('No organizations — user has no memberships');
          console.log('   💡 Run: zea thalamus org create');
        }

        if (primaryOrg.name) {
          pass(`Primary org: ${primaryOrg.name}`);
        }
      }

      // ── 4. Domain Roles (from JWT) ───────────────
      if (token && token.includes('.')) {
        console.log('── Domain Roles ────────────────────────────');
        try {
          const parts = token.split('.');
          const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
          const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf8'));

          if (payload.domain_roles && payload.domain_roles.length > 0) {
            for (const role of payload.domain_roles) {
              const scopes = (role.scopes || []).join(', ');
              pass(`${role.domain}/${role.role} @ ${role.org_id?.slice(0, 8)}... [${scopes}]`);
            }
          } else {
            warn('No domain roles in token');
            console.log('   💡 Run: zea thalamus domain grant');
          }
        } catch {
          warn('Could not decode JWT payload');
        }
      }

      // ── 5. Summary ───────────────────────────────
      printSummary();
    });
}

function printSummary() {
  console.log('');
  console.log('── Summary ──────────────────────────────────');
  const total = passes + warnings + failures;
  console.log(`   ✅ ${passes}  ⚠️  ${warnings}  ❌ ${failures}  (${total} checks)`);

  if (failures === 0 && warnings === 0) {
    console.log('');
    console.log('   🎉 All systems operational!');
    process.exit(0);
  } else if (failures > 0) {
    console.log('');
    console.log('   🔴 Some checks failed. Review the ❌ items above.');
    process.exit(1);
  } else {
    console.log('');
    console.log('   🟡 Minor warnings — system is functional.');
    process.exit(0);
  }
}
