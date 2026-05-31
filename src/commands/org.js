import zeaFetch from '../lib/http.js';
import { getClient, loadConfig, saveConfig } from '../client.js';

export function register(program) {
  const org = program.command('org').description('Organization management commands');

  org.command('list')
    .description('List organizations')
    .action(async () => {
      try {
        const client = await getClient();
        const response = await zeaFetch(`${client.apiUrl}/oauth/userinfo`, { headers: client.headers });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch user info: status ${response.status}`);
        }

        const info = await response.json();
        const orgs = info.organizations || [];

        if (orgs.length === 0) {
          console.log('No organizations found.');
          return;
        }

        console.log('Organizations:');
        orgs.forEach(o => {
          const activeMarker = o.id === client.activeOrgId ? '* ' : '  ';
          console.log(`${activeMarker}${o.name} (Slug: ${o.slug || 'N/A'}, ID: ${o.id})`);
        });
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  org.command('switch <org_id_or_slug>')
    .description('Switch default organization context')
    .action(async (target) => {
      try {
        const client = await getClient();
        const response = await zeaFetch(`${client.apiUrl}/oauth/userinfo`, { headers: client.headers });
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);

        const info = await response.json();
        const orgs = info.organizations || [];
        const match = orgs.find(o => o.id === target || o.slug === target);

        if (!match) {
          throw new Error(`Organization '${target}' not found in your membership list.`);
        }

        const config = await loadConfig();
        config.activeOrgId = match.id;
        await saveConfig(config);
        console.log(`Active organization context switched to: ${match.name} (${match.id})`);
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  org.command('create')
    .description('Create a new organization')
    .requiredOption('--name <name>', 'Name of the organization')
    .requiredOption('--email <email>', 'Owner email address')
    .option('--plan <plan>', 'Plan type (free, basic, standard, premium, enterprise)', 'free')
    .action(async (options) => {
      try {
        const client = await getClient();
        const response = await zeaFetch(`${client.apiUrl}/api/organizations`, {
          method: 'POST',
          headers: client.headers,
          body: JSON.stringify({
            name: options.name,
            owner_email: options.email,
            plan_type: options.plan
          })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || `HTTP error ${response.status}`);
        }

        const result = await response.json();
        const savedOrg = result.data;
        console.log(`Organization '${savedOrg.name}' created successfully!`);
        console.log(`ID: ${savedOrg.id}`);
        console.log(`Owner: ${savedOrg.owner_email}`);
        console.log(`Plan: ${savedOrg.plan_type}`);
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  const memberCmd = org.command('member').description('Organization member management');

  memberCmd.command('add <org_slug>')
    .description('Add a member to an organization by email')
    .requiredOption('--email <email>', 'Email of the user to add')
    .requiredOption('--role <role>', 'Role (admin, member, billing)')
    .action(async (orgSlug, options) => {
      try {
        const client = await getClient();
        const userinfoResponse = await zeaFetch(`${client.apiUrl}/oauth/userinfo`, { headers: client.headers });
        if (!userinfoResponse.ok) throw new Error(`HTTP error ${userinfoResponse.status}`);

        const info = await userinfoResponse.json();
        const orgs = info.organizations || [];
        const org = orgs.find(o => o.id === orgSlug || o.slug === orgSlug);

        if (!org) throw new Error(`Organization '${orgSlug}' not found in your memberships.`);

        const response = await zeaFetch(`${client.apiUrl}/api/organizations/${org.id}/members`, {
          method: 'POST',
          headers: client.headers,
          body: JSON.stringify({
            email: options.email,
            role: options.role
          })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || `HTTP error ${response.status}`);
        }

        const result = await response.json();
        console.log(`Member '${options.email}' added to '${org.name}' as ${options.role}.`);
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  memberCmd.command('remove <org_slug>')
    .description('Remove a member from an organization by user ID')
    .requiredOption('--user-id <user_id>', 'User ID to remove')
    .action(async (orgSlug, options) => {
      try {
        const client = await getClient();
        const userinfoResponse = await zeaFetch(`${client.apiUrl}/oauth/userinfo`, { headers: client.headers });
        if (!userinfoResponse.ok) throw new Error(`HTTP error ${userinfoResponse.status}`);

        const info = await userinfoResponse.json();
        const orgs = info.organizations || [];
        const org = orgs.find(o => o.id === orgSlug || o.slug === orgSlug);

        if (!org) throw new Error(`Organization '${orgSlug}' not found in your memberships.`);

        const response = await zeaFetch(`${client.apiUrl}/api/organizations/${org.id}/members/${options.userId}`, {
          method: 'DELETE',
          headers: client.headers
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || `HTTP error ${response.status}`);
        }

        const result = await response.json();
        console.log(`Member '${options.userId}' removed from '${org.name}'.`);
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  memberCmd.command('list <org_slug>')
    .description('List members of an organization')
    .action(async (orgSlug) => {
      try {
        const client = await getClient();
        const userinfoResponse = await zeaFetch(`${client.apiUrl}/oauth/userinfo`, { headers: client.headers });
        if (!userinfoResponse.ok) throw new Error(`HTTP error ${userinfoResponse.status}`);

        const info = await userinfoResponse.json();
        const orgs = info.organizations || [];
        const org = orgs.find(o => o.id === orgSlug || o.slug === orgSlug);

        if (!org) throw new Error(`Organization '${orgSlug}' not found in your memberships.`);

        const response = await zeaFetch(`${client.apiUrl}/api/organizations/${org.id}`, { headers: client.headers });
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);

        const result = await response.json();
        const members = result.data.members || [];

        if (members.length === 0) {
          console.log(`No members in '${org.name}'.`);
          return;
        }

        console.log(`Members of '${org.name}':`);
        members.forEach(m => {
          const userId = m.user_id || '(pending invite)';
          const email = m.email || '(email pending)';
          console.log(`  ${email} — ${m.role} (ID: ${userId})`);
        });
      } catch (e) {
        console.error('Error:', e.message);
      }
    });
}
