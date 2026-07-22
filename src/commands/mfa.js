import zeaFetch from '../lib/http.js';
import { getClient } from '../client.js';
import { getGlobalOpts } from '../lib/globals.js';
import { handleError } from '../lib/errors.js';

export function register(program) {
  const mfaCmd = program.command('mfa').description('Multi-Factor Authentication');

  // ── setup ──────────────────────────────────────────
  mfaCmd.command('setup')
    .description('Set up TOTP MFA (returns QR code data)')
    .action(async () => {
      const opts = getGlobalOpts();
      try {
        const client = await getClient();
        const resp = await zeaFetch(`${client.apiUrl}/api/mfa/totp/setup`, {
          method: 'POST', headers: client.headers
        });

        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const data = await resp.json();

        if (opts.output === 'json') { console.log(JSON.stringify(data, null, 2)); return; }

        console.log('TOTP Setup:');
        console.log(`   Secret:  ${data.secret}`);
        console.log(`   URI:     ${data.otpauth_uri || data.uri || ''}`);
        console.log('');
        if (data.qr_code) {
          console.log('   QR Code data available. Scan with your authenticator app.');
        }
        console.log('   After scanning, verify with: zea thalamus mfa verify --code <code>');
      } catch (e) { handleError(e); process.exit(1); }
    });

  // ── verify ─────────────────────────────────────────
  mfaCmd.command('verify')
    .description('Verify TOTP code to enable MFA')
    .requiredOption('--code <code>', 'TOTP code from authenticator app')
    .action(async (options) => {
      const opts = getGlobalOpts();
      try {
        const client = await getClient();
        const resp = await zeaFetch(`${client.apiUrl}/api/mfa/totp/verify`, {
          method: 'POST', headers: client.headers,
          body: JSON.stringify({ code: options.code })
        });

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          console.error(`❌ ${err.error || 'Invalid TOTP code. Try again.'}`);
          process.exit(1);
        }

        const data = await resp.json();
        console.log('✅ MFA enabled successfully!');

        if (data.backup_codes && data.backup_codes.length > 0) {
          console.log('');
          console.log('⚠️  BACKUP CODES — save these securely:');
          for (const code of data.backup_codes) {
            console.log(`   ${code}`);
          }
          console.log('   These codes will not be shown again.');
        }
      } catch (e) { handleError(e); process.exit(1); }
    });

  // ── disable ────────────────────────────────────────
  mfaCmd.command('disable')
    .description('Disable MFA for current user')
    .action(async () => {
      try {
        const client = await getClient();
        const resp = await zeaFetch(`${client.apiUrl}/api/mfa/disable`, {
          method: 'DELETE', headers: client.headers
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        console.log('✅ MFA disabled.');
        console.log('⚠️  Your account is now less secure. Consider re-enabling MFA.');
      } catch (e) { handleError(e); process.exit(1); }
    });

  // ── backup-codes ───────────────────────────────────
  mfaCmd.command('backup-codes')
    .description('Regenerate backup codes')
    .action(async () => {
      try {
        const client = await getClient();
        const resp = await zeaFetch(`${client.apiUrl}/api/mfa/backup-codes/regenerate`, {
          method: 'POST', headers: client.headers
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const data = await resp.json();
        console.log('⚠️  NEW BACKUP CODES — previous codes are now invalid:');
        for (const code of (data.backup_codes || [])) {
          console.log(`   ${code}`);
        }
        console.log('   Save these securely.');
      } catch (e) { handleError(e); process.exit(1); }
    });
}
