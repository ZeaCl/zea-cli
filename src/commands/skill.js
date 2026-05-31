import zeaFetch from '../lib/http.js';
import { getClient } from '../client.js';

export function register(program) {
  const skillCmd = program.command('skill').description('Skill management');

  skillCmd.command('list')
    .description('List installed skills')
    .action(async () => {
      try {
        const client = await getClient();
        const response = await zeaFetch(`${client.gliaUrl}/api/skills`, { headers: client.headers });
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || `HTTP error ${response.status}`);
        }
        const result = await response.json();
        const skills = result.skills || [];
        if (skills.length === 0) { console.log('No skills installed.'); return; }
        console.log('Installed Skills:');
        skills.forEach(s => console.log(`  ${s.name}: ${s.description || ''} (${s.tools_count || 0} tools)`));
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  skillCmd.command('reload')
    .description('Force reload all skills (hot-reload)')
    .action(async () => {
      try {
        const client = await getClient();
        const response = await zeaFetch(`${client.gliaUrl}/api/skills/reload`, {
          method: 'POST',
          headers: client.headers
        });
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || `HTTP error ${response.status}`);
        }
        const result = await response.json();
        console.log(`Skills reloaded: ${result.count} skills loaded`);
      } catch (e) {
        console.error('Error:', e.message);
      }
    });
}
