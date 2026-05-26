import { getClient } from '../client.js';

export function register(program) {
  const sduiCmd = program.command('sdui').description('Server-Driven UI commands');

  sduiCmd.command('start <app_id>')
    .description('Start an SDUI session and get initial state')
    .option('--org-id <id>', 'Organization ID')
    .action(async (appId, options) => {
      try {
        const client = await getClient();
        const orgId = options.orgId || client.activeOrgId;
        const body = { app_id: appId, token: client.token };
        if (orgId) body.org_id = orgId;

        const response = await fetch(`${client.sduiUrl}/api/sessions`, {
          method: 'POST',
          headers: client.headers,
          body: JSON.stringify(body)
        });
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || `HTTP error ${response.status}`);
        }
        const state = await response.json();
        console.log(`Session started: ${state.session_id}`);
        console.log(`State: ${state.screen_id}`);
        console.log(`Layout: ${state.layout?.type} (${(state.layout?.children || []).length} children)`);
        if (state.data) {
          const keys = Object.keys(state.data).filter(k => !k.startsWith('_') && k !== 'jwt' && k !== 'messages');
          if (keys.length) console.log(`Data: ${keys.join(', ')}`);
        }
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  sduiCmd.command('dispatch <session_id> <action>')
    .description('Dispatch an intent to an SDUI session')
    .argument('[payload]', 'JSON payload', '{}')
    .action(async (sessionId, action, payloadStr) => {
      try {
        const client = await getClient();
        let payload = {};
        try { payload = JSON.parse(payloadStr); } catch {}
        
        const response = await fetch(`${client.sduiUrl}/api/sessions/${sessionId}/dispatch`, {
          method: 'POST',
          headers: client.headers,
          body: JSON.stringify({ action, payload })
        });
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || `HTTP error ${response.status}`);
        }
        const state = await response.json();
        console.log(`State: ${state.screen_id}`);
        console.log(`Layout: ${state.layout?.type}`);
        if (state.data) {
          const safeData = { ...state.data };
          delete safeData.jwt;
          console.log(`Data: ${JSON.stringify(safeData).substring(0, 200)}`);
        }
      } catch (e) {
        console.error('Error:', e.message);
      }
    });
}
