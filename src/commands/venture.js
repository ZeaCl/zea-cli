import { getClient } from '../client.js';
import zeaFetch from '../lib/http.js';
import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';

export function register(program) {
  const venture = program.command('venture').description('Venture domain commands (GP API)');

  const ventureFund = venture.command('fund').description('Fund management');

  ventureFund.command('list')
    .description('List funds for the active organization')
    .action(async () => {
      try {
        const client = await getClient();
        const orgId = client.activeOrgId;
        const headers = { ...client.headers };
        if (orgId) headers['X-Zea-Org-Id'] = orgId;
        const response = await zeaFetch(`${client.ventureUrl}/gp/funds`, { headers });
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || errData.detail || `HTTP error ${response.status}`);
        }
        const result = await response.json();
        const funds = result.items || result.data || [];
        if (funds.length === 0) {
          console.log('No funds found.');
          return;
        }
        console.log(`Funds for org ${orgId}:`);
        funds.forEach(f => console.log(`  ${f.id}: ${f.name} [${f.status}]`));
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  ventureFund.command('create')
    .description('Create a new fund (via Cerebelum workflow — validates, creates, configures fees, and transitions to FUNDRAISING)')
    .requiredOption('--name <name>', 'Fund name')
    .option('--type <type>', 'Fund type', 'VENTURE_CAPITAL')
    .option('--hard-cap <amount>', 'Hard cap amount')
    .option('--currency <currency>', 'Currency', 'USD')
    .option('--mgmt-fee <json>', 'Management fee config (JSON)')
    .option('--carry <json>', 'Carried interest config (JSON)')
    .action(async (options) => {
      try {
        const client = await getClient();
        const orgId = client.activeOrgId;
        const inputs = {
          name: options.name,
          type: options.type,
          hard_cap: options.hardCap ? parseInt(options.hardCap) : undefined,
          currency: options.currency,
          jwt: client.token,
          org_id: orgId,
          management_fee: options.mgmtFee ? JSON.parse(options.mgmtFee) : undefined,
          carried_interest: options.carry ? JSON.parse(options.carry) : undefined
        };

        const response = await zeaFetch(`${client.cerebelumUrl}/api/v1/executions`, {
          method: 'POST',
          headers: client.headers,
          body: JSON.stringify({
            workflow_module: 'Cerebelum.Examples.Venture.FundCreateWorkflow',
            inputs: inputs
          })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || errData.detail || `HTTP error ${response.status}`);
        }

        const result = await response.json();
        const execId = result.data.id;
        console.log(`Workflow started: ${execId}`);

        let status = 'running';
        let attempts = 0;
        while (status === 'running' && attempts < 10) {
          await new Promise(r => setTimeout(r, 1000));
          const statusResp = await zeaFetch(`${client.cerebelumUrl}/api/v1/executions/${execId}`, { headers: client.headers });
          if (statusResp.ok) {
            const statusResult = await statusResp.json();
            status = statusResult.data.status;
            if (status === 'completed') {
              const fundData = statusResult.data.results?.build_response?.value;
              if (fundData) {
                console.log(`Fund created: ${fundData.name} (${fundData.fund_id})`);
                console.log(`Status: ${fundData.status} | Type: ${fundData.type} | Currency: ${fundData.currency}`);
              }
            } else if (status === 'failed') {
              const err = statusResult.data.error;
              console.error(`Workflow failed: ${err?.message || JSON.stringify(err)}`);
            }
          }
          attempts++;
        }
        if (status === 'running') {
          console.log(`Check progress: zea workflow status ${execId}`);
        }
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  ventureFund.command('show <id>')
    .description('Show fund details')
    .action(async (fundId) => {
      try {
        const client = await getClient();
        const orgId = client.activeOrgId;
        const headers = { ...client.headers };
        if (orgId) headers['X-Zea-Org-Id'] = orgId;
        const response = await zeaFetch(`${client.ventureUrl}/gp/funds/${fundId}`, { headers });
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || errData.detail || `HTTP error ${response.status}`);
        }
        const fund = await response.json();
        console.log(`Fund: ${fund.name} (${fund.id})`);
        console.log(`Status: ${fund.status} | Type: ${fund.type} | Currency: ${fund.currency}`);
        console.log(`Total Size: ${fund.total_size}`);
        if (fund.hard_cap) console.log(`Hard Cap: ${fund.hard_cap}`);
        if (fund.vintage_year) console.log(`Vintage: ${fund.vintage_year}`);
        if (fund.close_date) console.log(`Close Date: ${fund.close_date}`);
        if (fund.management_fee) console.log(`Mgmt Fee: ${JSON.stringify(fund.management_fee)}`);
        if (fund.carried_interest) console.log(`Carry: ${JSON.stringify(fund.carried_interest)}`);
        if (fund.created_at) console.log(`Created: ${fund.created_at}`);
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  ventureFund.command('transition <id>')
    .description('Transition fund to a new status')
    .requiredOption('--status <status>', 'New status (FUNDRAISING, ACTIVE, HARVESTING, CLOSED)')
    .action(async (fundId, options) => {
      try {
        const client = await getClient();
        const orgId = client.activeOrgId;
        const headers = { ...client.headers, 'Content-Type': 'application/json' };
        if (orgId) headers['X-Zea-Org-Id'] = orgId;
        const response = await zeaFetch(`${client.ventureUrl}/gp/funds/${fundId}/transition`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ status: options.status })
        });
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || errData.detail || `HTTP error ${response.status}`);
        }
        const fund = await response.json();
        console.log(`Fund ${fund.name} transitioned to ${fund.status}`);
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  ventureFund.command('configure-fees <id>')
    .description('Configure management fee and carried interest')
    .option('--mgmt-fee <json>', 'Management fee config (JSON)')
    .option('--carry <json>', 'Carried interest config (JSON)')
    .action(async (fundId, options) => {
      try {
        const client = await getClient();
        const orgId = client.activeOrgId;
        const body = {};
        if (options.mgmtFee) body.management_fee = JSON.parse(options.mgmtFee);
        if (options.carry) body.carried_interest = JSON.parse(options.carry);
        if (Object.keys(body).length === 0) {
          console.log('No fee config provided. Use --mgmt-fee or --carry.');
          return;
        }
        const headers = { ...client.headers, 'Content-Type': 'application/json' };
        if (orgId) headers['X-Zea-Org-Id'] = orgId;
        const response = await zeaFetch(`${client.ventureUrl}/gp/funds/${fundId}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(body)
        });
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || errData.detail || `HTTP error ${response.status}`);
        }
        const fund = await response.json();
        console.log(`Fees configured for ${fund.name}`);
        if (fund.management_fee) console.log(`  Mgmt Fee: ${JSON.stringify(fund.management_fee)}`);
        if (fund.carried_interest) console.log(`  Carry: ${JSON.stringify(fund.carried_interest)}`);
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  venture.command('dashboard')
    .description('Show dashboard for the active organization')
    .action(async () => {
      try {
        const client = await getClient();
        const orgId = client.activeOrgId;
        const headers = { ...client.headers };
        if (orgId) headers['X-Zea-Org-Id'] = orgId;
        const response = await zeaFetch(`${client.ventureUrl}/gp/dashboard`, { headers });
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || errData.detail || `HTTP error ${response.status}`);
        }
        const result = await response.json();
        console.log(JSON.stringify(result.data || result, null, 2));
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  const ventureCC = venture.command('capital-call').description('Capital call management');

  ventureCC.command('list')
    .description('List capital calls')
    .action(async () => {
      try {
        const client = await getClient();
        const orgId = client.activeOrgId;
        const headers = { ...client.headers };
        if (orgId) headers['X-Zea-Org-Id'] = orgId;
        const response = await zeaFetch(`${client.ventureUrl}/gp/capital-calls`, { headers });
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || errData.detail || `HTTP error ${response.status}`);
        }
        const result = await response.json();
        const calls = result.items || result.data || [];
        if (calls.length === 0) { console.log('No capital calls found.'); return; }
        console.log('Capital Calls:');
        calls.forEach(c => console.log(`  ${c.id}: #${c.call_number} ${c.fund_name || c.fund_id} [${c.status}] ${c.total_amount} ${c.currency}`));
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  ventureCC.command('create')
    .description('Create a capital call')
    .requiredOption('--fund <id>', 'Fund ID')
    .requiredOption('--amount <amount>', 'Total amount')
    .requiredOption('--due-date <date>', 'Due date (YYYY-MM-DD)')
    .option('--purpose <text>', 'Purpose description')
    .option('--workflow', 'Use Cerebelum workflow (async: creates, sends, waits for payments, closes) instead of direct API call')
    .action(async (options) => {
      try {
        const client = await getClient();
        const orgId = client.activeOrgId;

        if (options.workflow) {
          const inputs = {
            fund_id: options.fund,
            total_amount: parseInt(options.amount),
            due_date: options.dueDate,
            purpose: options.purpose || 'Capital call',
            issue_date: new Date().toISOString().split('T')[0],
            jwt: client.token,
            org_id: orgId
          };

          const response = await zeaFetch(`${client.cerebelumUrl}/api/v1/executions`, {
            method: 'POST',
            headers: client.headers,
            body: JSON.stringify({
              workflow_module: 'Cerebelum.Examples.Venture.CapitalCallWorkflow',
              inputs: inputs
            })
          });

          if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || errData.detail || `HTTP error ${response.status}`);
          }

          const result = await response.json();
          const execId = result.data.id;
          console.log(`Workflow started: ${execId}`);
          console.log(`The capital call will be created, sent, and tracked until ${options.dueDate}.`);
          console.log(`Check progress: zea workflow status ${execId}`);
        } else {
          const headers = { ...client.headers, 'Content-Type': 'application/json' };
        if (orgId) headers['X-Zea-Org-Id'] = orgId;
          const response = await zeaFetch(`${client.ventureUrl}/gp/capital-calls`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              fund_id: options.fund,
              total_amount: parseInt(options.amount),
              due_date: options.dueDate,
              issue_date: new Date().toISOString().split('T')[0],
              purpose: options.purpose || 'Capital call',
              status: 'DRAFT'
            })
          });

          if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || errData.detail || `HTTP error ${response.status}`);
          }

          const result = await response.json();
          console.log(`Capital call created: ${result.id} [${result.status}]`);
        }
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  ventureCC.command('show <id>')
    .description('Show capital call details')
    .action(async (callId) => {
      try {
        const client = await getClient();
        const orgId = client.activeOrgId;
        const headers = { ...client.headers };
        if (orgId) headers['X-Zea-Org-Id'] = orgId;
        const response = await zeaFetch(`${client.ventureUrl}/gp/capital-calls/${callId}`, { headers });
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || errData.detail || `HTTP error ${response.status}`);
        }
        const call = await response.json();
        console.log(`Capital Call: ${call.id}`);
        console.log(`Fund: ${call.fund_id} | #${call.call_number}`);
        console.log(`Status: ${call.status} | Amount: ${call.total_amount} ${call.currency}`);
        if (call.issue_date) console.log(`Issued: ${call.issue_date}`);
        if (call.due_date) console.log(`Due: ${call.due_date}`);
        if (call.purpose) console.log(`Purpose: ${call.purpose}`);
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  ventureCC.command('send <id>')
    .description('Send capital call to investors')
    .action(async (callId) => {
      try {
        const client = await getClient();
        const orgId = client.activeOrgId;
        const headers = { ...client.headers };
        if (orgId) headers['X-Zea-Org-Id'] = orgId;
        const response = await zeaFetch(`${client.ventureUrl}/gp/capital-calls/${callId}/send`, {
          method: 'POST',
          headers
        });
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || errData.detail || `HTTP error ${response.status}`);
        }
        console.log(`Capital call ${callId} sent.`);
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  const ventureInv = venture.command('investor').description('Investor (LP) management');

  ventureInv.command('list')
    .description('List investors')
    .action(async () => {
      try {
        const client = await getClient();
        const orgId = client.activeOrgId;
        const headers = { ...client.headers };
        if (orgId) headers['X-Zea-Org-Id'] = orgId;
        const response = await zeaFetch(`${client.ventureUrl}/gp/investors`, { headers });
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || errData.detail || `HTTP error ${response.status}`);
        }
        const result = await response.json();
        const investors = result.items || result.data || [];
        if (investors.length === 0) { console.log('No investors found.'); return; }
        console.log('Investors:');
        investors.forEach(i => console.log(`  ${i.id}: ${i.name} (${i.email || 'no email'}) [${i.investor_type}]`));
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  ventureInv.command('create')
    .description('Create an investor (LP)')
    .requiredOption('--name <name>', 'Investor name')
    .requiredOption('--email <email>', 'Investor email')
    .option('--type <type>', 'Investor type (INDIVIDUAL, INSTITUTIONAL, CORPORATE, FAMILY_OFFICE)', 'INDIVIDUAL')
    .action(async (options) => {
      try {
        const client = await getClient();
        const orgId = client.activeOrgId;
        const headers = { ...client.headers, 'Content-Type': 'application/json' };
        if (orgId) headers['X-Zea-Org-Id'] = orgId;
        const response = await zeaFetch(`${client.ventureUrl}/gp/investors`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ name: options.name, email: options.email, investor_type: options.type })
        });
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || errData.detail || `HTTP error ${response.status}`);
        }
        const result = await response.json();
        console.log(`Investor created: ${result.name} (${result.id})`);
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  ventureInv.command('add-commitment')
    .description('Add investor commitment to a fund')
    .requiredOption('--investor <id>', 'Investor ID')
    .requiredOption('--fund <id>', 'Fund ID')
    .requiredOption('--amount <amount>', 'Commitment amount')
    .action(async (options) => {
      try {
        const client = await getClient();
        const orgId = client.activeOrgId;
        const headers = { ...client.headers, 'Content-Type': 'application/json' };
        if (orgId) headers['X-Zea-Org-Id'] = orgId;
        const response = await zeaFetch(`${client.ventureUrl}/gp/investors/${options.investor}/commitments`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ fund_id: options.fund, amount: parseInt(options.amount) })
        });
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || errData.detail || `HTTP error ${response.status}`);
        }
        const result = await response.json();
        console.log(`Commitment added: ${result.id}`);
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  // ─── data ─────────────────────────────────────────────
  const ventureData = venture.command('data').description('Database operations: add tables, seed data');

  ventureData.command('add-table')
    .description('Create a new table in the Venture database (edits init-venture.sql + runs migration)')
    .requiredOption('--name <name>', 'Table name (e.g. pending_tasks)')
    .requiredOption('--fields <json>', 'Fields as JSON array [{name, type, nullable, default, fk_table}]')
    .action(async (opts) => {
      try {
        const fields = JSON.parse(opts.fields);
        if (!Array.isArray(fields) || fields.length === 0) throw new Error('fields must be a non-empty JSON array');

        let cols = [];
        cols.push('  id UUID PRIMARY KEY DEFAULT gen_random_uuid()');
        cols.push('  organization_id UUID NOT NULL REFERENCES organizations(id)');
        for (const f of fields) {
          const ftype = f.type || 'VARCHAR(255)';
          let def = '  ' + f.name + ' ' + ftype;
          if (!f.nullable) def += ' NOT NULL';
          if (f.default) def += ' DEFAULT ' + f.default;
          if (f.fk_table) def += ' REFERENCES ' + f.fk_table + '(id)';
          cols.push(def);
        }
        cols.push('  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
        cols.push('  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');

        const sql = `CREATE TABLE IF NOT EXISTS ${opts.name} (\n${cols.join(',\n')}\n);`;
        const rls = `ALTER TABLE ${opts.name} ENABLE ROW LEVEL SECURITY;
CREATE POLICY ${opts.name}_org_isolation ON ${opts.name}
  USING (organization_id = current_setting('app.current_organization_id')::uuid);`;

        console.log(`\nGenerated SQL:\n${sql}\n\n${rls}\n`);

        try {
          const dbResult = execSync(
            `docker exec zea_postgres_venture_local psql -U app_user -d venture_prod -c "${sql} ${rls}"`,
            { encoding: 'utf8', timeout: 10000 }
          );
          console.log(`✅ Table '${opts.name}' created in venture_prod`);
        } catch (e) {
          console.log(`⚠️  Could not apply to DB: ${e.message}`);
        }

        const initPath = '/workspace/init-venture.sql';
        try {
          let existing = '';
          try { existing = await fs.readFile(initPath, 'utf8'); } catch {}
          if (!existing.includes(`CREATE TABLE ${opts.name}`)) {
            await fs.appendFile(initPath, `\n-- Auto-generated by zea venture data add-table\n${sql}\n\n${rls}\n\n`);
            console.log(`✅ Appended to ${initPath}`);
          }
        } catch (e) {
          console.log(`⚠️  Could not update init-venture.sql: ${e.message}`);
        }

        console.log(`\nNext: zea venture api add-endpoint GET /gp/${opts.name}`);

      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  // ─── api ──────────────────────────────────────────────
  const ventureApi = venture.command('api').description('API operations: add endpoints');

  ventureApi.command('add-endpoint')
    .description('Add a new API endpoint to venture-gp-api')
    .requiredOption('--method <method>', 'HTTP method (GET, POST, PUT, DELETE)')
    .requiredOption('--path <path>', 'Route path (e.g. /gp/tasks)')
    .requiredOption('--handler <name>', 'Handler function name (e.g. list_tasks)')
    .action(async (opts) => {
      try {
        const method = opts.method.toUpperCase();
        const route = opts.path.startsWith('/') ? opts.path : `/${opts.path}`;
        const handler = opts.handler;
        const entity = opts.path.split('/').pop();
        const entityCamel = entity.charAt(0).toUpperCase() + entity.slice(1);

        const isList = method === 'GET';
        const controllerFn = isList
          ? `  def ${handler}(conn, _opts) do\n    case GP.List${entityCamel}.execute(gp_ctx(conn)) do\n      {:ok, items} -> json(conn, 200, items)\n      {:error, _} -> json(conn, 500, %{error: "internal_error"})\n    end\n  end`
          : method === 'POST'
          ? `  def ${handler}(conn, _opts) do\n    case GP.Create${entityCamel}.execute(gp_ctx(conn), conn.body_params) do\n      {:ok, item} -> json(conn, 201, item)\n      {:error, _} -> json(conn, 500, %{error: "internal_error"})\n    end\n  end`
          : `  def ${handler}(conn, _opts) do\n    json(conn, 200, %{endpoint: "${route}"})\n  end`;

        console.log(`\n${method} ${route} → ${handler}\n`);
        console.log(`Controller:\n${controllerFn}\n`);

        // Write controller function to workspace
        const stubPath = '/workspace/' + handler + '.ex';
        await fs.writeFile(stubPath, controllerFn);
        console.log(`✅ Controller written to /workspace/${handler}.ex`);

        // Suggest router addition
        console.log(`\nAdd to router.ex:\n    ${method.toLowerCase()} "${route}", :${handler}`);
        console.log(`\nThen rebuild: docker compose build venture-api`);

      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  // ─── data import ────────────────────────────────────────
  ventureData.command('import')
    .description('Import data from Excel file into Venture DB')
    .requiredOption('--file <path>', 'Excel file path')
    .option('--llm', 'Use LLM for auto-mapping columns')
    .option('--yes', 'Skip confirmation')
    .action(async (opts) => {
      try {
        const client = await getClient();
        console.log(`Importing: ${opts.file}\n`);

        const sheets = JSON.parse(
          execSync(`python3 -c "
import pandas as pd, json
f = '${opts.file}'
sheets = pd.read_excel(f, sheet_name=None)
result = {}
for name, df in sheets.items():
    result[name] = [dict(zip(df.columns, [str(v) if pd.notna(v) else None for v in row])) for _, row in df.iterrows()]
print(json.dumps(result))
"`, { encoding: 'utf8', timeout: 15000 }).toString()
        );

        const entityMap = { funds: '/gp/funds', investors: '/gp/investors' };
        const headers = { ...client.headers, 'Content-Type': 'application/json' };
        if (client.activeOrgId) headers['X-Zea-Org-Id'] = client.activeOrgId;

        let created = {};

        for (const [sheet, rows] of Object.entries(sheets)) {
          const isFunds = /fund/i.test(sheet);
          const isLps = /investor|lp/i.test(sheet);
          const entity = isFunds ? 'funds' : isLps ? 'investors' : null;
          if (!entity) { console.log(`  ⚠️  Unknown: ${sheet}`); continue; }

          console.log(`${entity}: ${rows.length} rows`);

          for (const row of rows) {
            try {
              if (entity === 'funds') {
                const body = { name: row.name || row.Name, type: row.type || 'VENTURE_CAPITAL', total_size: parseInt(row.total_size || 0) * 100, currency: row.currency || 'USD', status: row.status || 'DRAFT' };
                const r = await zeaFetch(`${client.ventureUrl}${entityMap[entity]}`, { method: 'POST', headers, body: JSON.stringify(body) });
                if (r.ok) { created[entity] = (created[entity] || 0) + 1; }
              } else if (entity === 'investors') {
                const body = { name: row.name || row.Name, email: row.email || row.Email, investor_type: row.investor_type || row.investorType || 'INDIVIDUAL', is_qualified_investor: row.is_qualified === 'true' || row.is_qualified === true };
                const r = await zeaFetch(`${client.ventureUrl}${entityMap[entity]}`, { method: 'POST', headers, body: JSON.stringify(body) });
                if (r.ok) { created[entity] = (created[entity] || 0) + 1; }
              }
            } catch (e) { /* skip row errors */ }
          }
        }

        console.log(`\nImport complete:`);
        for (const [e, c] of Object.entries(created)) console.log(`  ✅ ${e}: ${c}`);

      } catch (e) {
        console.error('Error:', e.message);
      }
    });
}
