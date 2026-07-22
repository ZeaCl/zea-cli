import { loadConfig } from '../client.js';
import { zeaFetch } from '../lib/http.js';
import { getGlobalOpts } from '../lib/globals.js';
import { handleError } from '../lib/errors.js';

export function register(program) {
  program.command('health')
    .description('Check Thalamus health status (no auth required)')
    .action(async () => {
      const opts = getGlobalOpts();
      try {
        // Read config for URL, but don't require auth
        let apiUrl = 'http://auth.zea.localhost';
        try {
          const config = await loadConfig();
          if (config.apiUrl) apiUrl = config.apiUrl;
        } catch {
          // No config, use default
        }

        // Override with env var
        apiUrl = process.env.ZEA_API_URL || process.env.THALAMUS_API_URL || apiUrl;

        const response = await zeaFetch(`${apiUrl}/api/public/health`);

        if (!response.ok) {
          console.error(`❌ Thalamus returned HTTP ${response.status}`);
          process.exit(1);
        }

        const data = await response.json();

        if (opts.output === 'json') {
          console.log(JSON.stringify(data, null, 2));
          process.exit(data.status === 'ok' ? 0 : 1);
        }

        const statusIcon = data.status === 'ok' ? '✅' : '⚠️';

        console.log(`   Thalamus ${data.version || '?.?.?'} — ${apiUrl}`);
        console.log(`   Status:   ${statusIcon} ${data.status.toUpperCase()}`);

        if (data.checks) {
          for (const [name, result] of Object.entries(data.checks)) {
            const icon = result === 'ok' ? '✅' : '❌';
            console.log(`   ${name.padEnd(12)} ${icon} ${result}`);
          }
        }

        if (data.errors && data.errors.length > 0) {
          console.log('   Errors:');
          for (const err of data.errors) {
            console.log(`     - ${err}`);
          }
        }

        if (data.timestamp) {
          console.log(`   Time:     ${data.timestamp}`);
        }

        if (data.status !== 'ok') {
          console.log('');
          console.log('   Run: zea thalamus doctor');
          process.exit(1);
        }
      } catch (e) {
        if (e.code === 'ENOTFOUND' || e.code === 'ECONNREFUSED') {
          let url = 'http://auth.zea.localhost';
          try {
            const config = await loadConfig();
            url = config.apiUrl || url;
          } catch {}
          url = process.env.ZEA_API_URL || process.env.THALAMUS_API_URL || url;
          console.error(`❌ Cannot reach Thalamus at ${url}`);
          console.error('   Is it running? Try: docker compose up -d');
        } else {
          handleError(e);
        }
        process.exit(1);
      }
    });
}
