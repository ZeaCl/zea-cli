import zeaFetch from '../lib/http.js';
import { getClient } from '../client.js';

export function register(program) {
  const domain = program.command('domain').description('Domain management commands');

  domain.command('list')
    .description('List available domains and their scopes')
    .action(async () => {
      try {
        const client = await getClient();
        const response = await zeaFetch(`${client.apiUrl}/api/domains`, { headers: client.headers });
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const result = await response.json();
        const domains = result.data || [];
        if (domains.length === 0) {
          console.log('No domains registered.');
          return;
        }
        console.log('Registered Domains:');
        domains.forEach(d => {
          console.log(`  ${d.domain}`);
          (d.scopes || []).forEach(s => console.log(`    - ${s.scope}: ${s.description}`));
          console.log('');
        });
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  domain.command('register <domain_name>')
    .description('Register a domain with its scopes')
    .requiredOption('--scopes <json>', 'JSON array of {scope, description} objects')
    .action(async (domainName, options) => {
      try {
        const client = await getClient();
        const scopes = JSON.parse(options.scopes);
        const response = await zeaFetch(`${client.apiUrl}/api/domains/register`, {
          method: 'POST',
          headers: client.headers,
          body: JSON.stringify({ domain: domainName, scopes: scopes })
        });
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || `HTTP error ${response.status}`);
        }
        const result = await response.json();
        console.log(`${result.message}`);
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  domain.command('grant <user_id> <domain> <role>')
    .description('Grant a domain role to a user in an organization')
    .requiredOption('--org <org_id>', 'Organization ID')
    .option('--scopes <json>', 'JSON array of scopes', '[]')
    .option('--entity-id <id>', 'Entity ID (e.g. lp_id for investor, team_id for coach)')
    .action(async (userId, domain, role, options) => {
      try {
        const client = await getClient();
        const scopes = JSON.parse(options.scopes);
        const body = {
          user_id: userId,
          organization_id: options.org,
          domain: domain,
          role: role,
          scopes: scopes
        };
        if (options.entityId) body.entity_id = options.entityId;
        const response = await zeaFetch(`${client.apiUrl}/api/domains/roles/grant`, {
          method: 'POST',
          headers: client.headers,
          body: JSON.stringify(body)
        });
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || `HTTP error ${response.status}`);
        }
        const result = await response.json();
        console.log(`${result.message}`);
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  domain.command('revoke <user_id> <domain> <role>')
    .description('Revoke a domain role from a user')
    .requiredOption('--org <org_id>', 'Organization ID')
    .action(async (userId, domain, role, options) => {
      try {
        const client = await getClient();
        const response = await zeaFetch(`${client.apiUrl}/api/domains/roles/revoke`, {
          method: 'DELETE',
          headers: client.headers,
          body: JSON.stringify({
            user_id: userId,
            organization_id: options.org,
            domain: domain,
            role: role
          })
        });
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || `HTTP error ${response.status}`);
        }
        const result = await response.json();
        console.log(`${result.message}`);
      } catch (e) {
        console.error('Error:', e.message);
      }
    });
}
