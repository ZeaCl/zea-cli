import zeaFetch from '../lib/http.js';
import { getClient } from '../client.js';
import { getGlobalOpts } from '../lib/globals.js';
import { handleError } from '../lib/errors.js';

export function register(program) {
  const tokenCmd = program.command('token').description('Personal Access Token (PAT) commands');

  tokenCmd.command('create')
    .description('Create a new Personal Access Token')
    .requiredOption('--name <name>', 'Token description / name')
    .action(async (options) => {
      const opts = getGlobalOpts();
      try {
        const client = await getClient();

        const body = {
          name: options.name,
          organization_id: client.activeOrgId
        };

        if (opts.dryRun) {
          console.log('⚠️  DRY RUN — would execute:');
          console.log(`   POST ${client.apiUrl}/api/personal-access-tokens`);
          console.log(`   Body: ${JSON.stringify(body, null, 2)}`);
          return;
        }

        const response = await zeaFetch(`${client.apiUrl}/api/personal-access-tokens`, {
          method: 'POST',
          headers: client.headers,
          body: JSON.stringify(body)
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Failed to generate token: ${errText}`);
        }

        const result = await response.json();
        console.log('Personal Access Token generated successfully!');
        console.log('--------------------------------------------------');
        console.log(`Token Value: ${result.token}`);
        console.log('--------------------------------------------------');
        console.log('WARNING: Store this token safely. It will not be shown again.');
      } catch (e) {
        handleError(e);
      }
    });

  tokenCmd.command('list')
    .description('List active Personal Access Tokens')
    .action(async () => {
      try {
        const client = await getClient();
        const response = await zeaFetch(`${client.apiUrl}/api/personal-access-tokens`, { headers: client.headers });
        if (!response.ok) throw new Error(`Failed to list tokens: status ${response.status}`);

        const result = await response.json();
        const pats = result.data || [];

        const filtered = pats.filter(p => !client.activeOrgId || p.organization_id === client.activeOrgId);

        if (filtered.length === 0) {
          console.log('No active tokens under the current organization.');
          return;
        }

        console.log('Active Tokens:');
        filtered.forEach(p => {
          console.log(`- ${p.name} (Prefix: ${p.token_prefix}..., ID: ${p.id}, Active: ${p.is_active})`);
        });
      } catch (e) {
        handleError(e);
      }
    });

  tokenCmd.command('revoke <token_id>')
    .description('Revoke an active Personal Access Token')
    .action(async (tokenId) => {
      try {
        const client = await getClient();
        const response = await zeaFetch(`${client.apiUrl}/api/personal-access-tokens/${tokenId}`, {
          method: 'DELETE',
          headers: client.headers
        });

        if (!response.ok) {
          throw new Error(`Failed to revoke token: status ${response.status}`);
        }

        console.log(`Token ${tokenId} revoked successfully.`);
      } catch (e) {
        handleError(e);
      }
    });
}
