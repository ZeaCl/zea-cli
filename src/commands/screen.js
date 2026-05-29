import { getClient } from '../client.js';
import chalk from 'chalk';
import fs from 'fs/promises';

export function register(program) {
  const screenCmd = program.command('screen').description('Screen functionalization — analyze and add data bindings to Stitch screens');

  // ─── analyze ───────────────────────────────────────────
  screenCmd.command('analyze')
    .description('Analyze a StitchedScreen HTML and identify components + data needs')
    .requiredOption('--app <id>', 'App ID')
    .requiredOption('--screen <name>', 'Screen state name')
    .action(async (opts) => {
      try {
        const client = await getClient();
        const resp = await fetch(`${client.appsUrl}/api/apps/${opts.app}/manifest`, { headers: client.headers });
        if (!resp.ok) throw new Error(`API error: ${resp.status}`);
        const manifest = await resp.json();
        const state = (manifest.states || {})[opts.screen];
        if (!state) throw new Error(`State '${opts.screen}' not found`);
        if (state.type !== 'StitchedScreen') throw new Error(`State is type '${state.type}', not StitchedScreen`);

        const html = state.html || '';
        console.log(`\n${chalk.bold('Analyzing:')} ${opts.screen} (${html.length} bytes)\n`);

        // Detect type
        const hasKPIs = (html.match(/metric|kpi|KPI|AUM|total|activo|active/gi) || []).length >= 2;
        const hasTable = html.includes('<table') || html.includes('<thead') || html.includes('<tbody');
        const hasForm = html.includes('<form') || html.includes('<input');
        const hasChart = html.includes('chart') || html.includes('canvas') || html.includes('recharts');
        const headings = html.match(/<h[1-6][^>]*>([^<]+)<\/h[1-6]>/gi) || [];

        let screenType = 'detail';
        if (hasKPIs && hasTable) screenType = 'dashboard';
        else if (hasTable && !hasKPIs) screenType = 'list';
        else if (hasForm) screenType = 'form';

        console.log(`${chalk.cyan('Type:')} ${screenType}`);

        // Components
        console.log(`\n${chalk.cyan('Components:')}`);
        console.log(`  KPI cards: ${hasKPIs ? '✅' : '❌'} (detected ${hasKPIs ? 'metric values' : 'no metrics'})`);
        console.log(`  Data table: ${hasTable ? '✅' : '❌'}`);
        console.log(`  Form inputs: ${hasForm ? '✅' : '❌'}`);
        console.log(`  Chart: ${hasChart ? '✅' : '❌'}`);
        console.log(`  Headings: ${headings.length} (${headings.map(h => h.replace(/<[^>]+>/g,'')).join(', ')})`);

        // Extract static values
        const spans = html.match(/<span[^>]*>([^<]+)<\/span>/gi) || [];
        const values = spans.map(s => s.replace(/<[^>]+>/g, '')).filter(v => v.trim().length > 0 && v.trim().length < 60);
        console.log(`\n${chalk.cyan('Static values (candidates for data-zea-bind):')}`);
        const unique = [...new Set(values)].slice(0, 15);
        unique.forEach(v => console.log(`  "${v.trim()}"`));

        // Data needs
        console.log(`\n${chalk.cyan('Data needs:')}`);
        const needs = [];
        if (screenType === 'dashboard') {
          needs.push('GET /gp/dashboard → {active_funds, active_lps, aum, pending_capital_calls}');
          needs.push('GET /gp/funds → [{name, status, type, total_size, currency}]');
        } else if (screenType === 'list') {
          needs.push('GET /gp/{entity} → [{...}]');
        } else if (screenType === 'form') {
          needs.push('POST /gp/{entity} ← {field1, field2, ...}');
        }
        needs.forEach(n => console.log(`  → ${n}`));

        // Suggested bindings
        console.log(`\n${chalk.cyan('Suggested data-zea-bind:')}`);
        if (screenType === 'dashboard') {
          console.log('  data-zea-bind="aum" → AUM Total value');
          console.log('  data-zea-bind="active_funds" → Fondos Activos count');
          console.log('  data-zea-bind="active_lps" → LP count');
          console.log('  data-zea-bind="pending_calls" → Pending capital calls');
          console.log('  data-zea-bind="funds" → table row (array)');
          console.log('  data-zea-bind="name", "status", "total_size" → table columns');
        }
        console.log(`\nRun: ${chalk.green(`zea screen functionalize --app ${opts.app} --screen ${opts.screen}`)}`);

      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  // ─── functionalize ─────────────────────────────────────
  screenCmd.command('functionalize')
    .description('Add data-zea-bind + intent_routing to a StitchedScreen')
    .requiredOption('--app <id>', 'App ID')
    .requiredOption('--screen <name>', 'Screen state name')
    .option('--dry-run', 'Preview changes without updating manifest')
    .action(async (opts) => {
      try {
        const client = await getClient();

        // 1. Fetch manifest
        console.log(`\n[1/5] Fetching manifest...`);
        const resp = await fetch(`${client.appsUrl}/api/apps/${opts.app}/manifest`, { headers: client.headers });
        if (!resp.ok) throw new Error(`API error: ${resp.status}`);
        const manifest = await resp.json();
        const state = (manifest.states || {})[opts.screen];
        if (!state) throw new Error(`State '${opts.screen}' not found`);
        if (state.type !== 'StitchedScreen') throw new Error(`State is type '${state.type}', not StitchedScreen`);

        let html = state.html || '';

        // 2. Analyze
        console.log(`[2/5] Analyzing HTML (${html.length} bytes)...`);
        const hasKPIs = (html.match(/metric|kpi|KPI|AUM|total|activo|active/gi) || []).length >= 2;
        const hasTable = html.includes('<table');

        let screenType = hasKPIs && hasTable ? 'dashboard' : hasTable ? 'list' : 'detail';
        console.log(`   Type: ${screenType}`);

        // 3. Inject data-zea-bind
        console.log(`[3/5] Injecting data-zea-bind...`);
        let bindings = 0;

        if (screenType === 'dashboard') {
          // KPI bindings — find spans with metric-like content and inject
          const kpiPatterns = [
            { match: />(\$?[\d,\.]+[KMB]?%?\s?(YoY)?)<\/span>/, bind: 'aum', label: 'AUM/monetary value' },
            { match: />(\d+)\s*(Activo|active|fondos|funds)/i, bind: 'active_funds', label: 'Active funds count' },
            { match: />(\d+)\s*(LP|lp|investor|inversor)/i, bind: 'active_lps', label: 'LP count' },
            { match: />(\d+)\s*(pend|pendiente|call)/i, bind: 'pending_calls', label: 'Pending calls' },
          ];

          for (const p of kpiPatterns) {
            const re = new RegExp(p.match.source, 'gi');
            const newHtml = html.replace(re, (match) => {
              return match.includes('data-zea-bind') ? match : match.replace(/^>/, ` data-zea-bind="${p.bind}">`);
            });
            if (newHtml !== html) {
              html = newHtml;
              bindings++;
              console.log(`   ✅ ${p.bind} (${p.label})`);
            }
          }

          // Also try explicit text matches
          const textBinds = [
            { text: 'AUM Total', bind: 'aum' },
            { text: 'Fondos Activos', bind: 'active_funds' },
          ];
          for (const tb of textBinds) {
            if (html.includes(tb.text) && !html.includes(`data-zea-bind="${tb.bind}"`)) {
              html = html.replace(`>${tb.text}<`, ` data-zea-bind="${tb.bind}">${tb.text}<`);
              bindings++;
              console.log(`   ✅ ${tb.bind} (explicit "${tb.text}")`);
            }
          }
        }

        // Table bindings
        if (hasTable && !html.includes('data-zea-bind="funds"')) {
          // Add binding to tbody row
          html = html.replace(/<tr([^>]*)class="([^"]*)"/, (match, attrs, cls) => {
            return `<tr${attrs}class="${cls}" data-zea-bind="funds"`;
          });
          if (html.includes('data-zea-bind="funds"')) {
            bindings++;
            console.log(`   ✅ funds (table row array)`);
          } else {
            // Try alternative: add to each tr in tbody
            html = html.replace(/<tbody[^>]*>/g, (match) => `${match}\n<tr data-zea-bind="funds">`);
            if (html.includes('data-zea-bind="funds"')) bindings++;
          }
        }

        console.log(`   Total bindings: ${bindings}`);

        // 4. Create intent_routing
        console.log(`[4/5] Creating intent_routing...`);
        manifest.intent_routing = manifest.intent_routing || {};

        if (screenType === 'dashboard') {
          manifest.intent_routing[`load_${opts.screen}`] = {
            type: 'domain_api',
            domain: 'venture',
            endpoint: 'GET /gp/dashboard',
            target_state: opts.screen,
            data_mapping: {
              aum: 'aum',
              active_funds: 'active_funds_count',
              active_lps: 'active_lps',
              pending_calls: 'pending_capital_calls',
              total_called: 'total_called',
              total_paid: 'total_paid'
            }
          };
        }

        const intents = Object.keys(manifest.intent_routing).length;
        console.log(`   Intents: ${intents}`);

        // 5. Update manifest
        manifest.states[opts.screen].html = html;

        if (opts.dryRun) {
          console.log(`\n${chalk.yellow('[DRY RUN]')} Manifest not updated.`);
          const binds = html.match(/data-zea-bind="([^"]+)"/g) || [];
          console.log(`Bindings: ${[...new Set(binds.map(b => b.match(/"([^"]+)"/)[1]))].join(', ')}`);
          return;
        }

        console.log(`[5/5] Updating manifest...`);
        const payload = {
          app_id: opts.app,
          name: manifest.name || 'App',
          domain_auth: manifest.domain_auth || 'venture',
          status: 'active',
          version: '1.0.0',
          manifest,
          states: manifest.states,
          intent_routing: manifest.intent_routing,
          shell: manifest.shell || {},
          design_system: manifest.design_system || {}
        };

        const uResp = await fetch(`${client.appsUrl}/api/apps`, {
          method: 'POST',
          headers: client.headers,
          body: JSON.stringify(payload)
        });
        if (!uResp.ok) throw new Error(`Update failed: ${uResp.status}`);
        console.log(`   ✅ Manifest updated`);

        console.log(`\n${chalk.green('✅ Screen functionalized!')}`);
        console.log(`   App:     ${opts.app}`);
        console.log(`   Screen:  ${opts.screen}`);
        console.log(`   Type:    ${screenType}`);
        console.log(`   Bindings: ${bindings}`);
        console.log(`   Intents: ${intents}`);

      } catch (e) {
        console.error('Error:', e.message);
      }
    });
}
