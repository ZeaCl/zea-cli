import zeaFetch from '../lib/http.js';
import { getClient } from '../client.js';
import chalk from 'chalk';

const DEEPSEEK_API = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEYS;

const API_CATALOG = {
  'GET /gp/dashboard': {
    description: 'Dashboard KPIs del General Partner',
    returns: { active_funds: 'int — cantidad de fondos activos', active_lps: 'int — cantidad de LPs activos', aum: 'string — Assets Under Management formateado', pending_capital_calls: 'int — capital calls pendientes', total_called: 'string — total llamado', total_paid: 'string — total pagado' }
  },
  'GET /gp/funds': {
    description: 'Lista de fondos del GP',
    returns: '[{ id: "uuid", name: "string", type: "VENTURE_CAPITAL|REAL_ESTATE|PRIVATE_EQUITY|HEDGE_FUND", status: "DRAFT|FUNDRAISING|ACTIVE|INVESTING|HARVESTING|LIQUIDATED|WIND_DOWN|CLOSED", total_size: "int (cents)", currency: "USD|CLP", created_at: "ISO date" }]'
  },
  'GET /gp/investors': {
    description: 'Lista de inversores (LPs)',
    returns: '[{ id: "uuid", name: "string", email: "string", investor_type: "INDIVIDUAL|INSTITUTIONAL|CORPORATE|FAMILY_OFFICE", is_active: "bool", created_at: "ISO date" }]'
  },
  'GET /gp/capital-calls': {
    description: 'Lista de capital calls',
    returns: '[{ id: "uuid", fund_name: "string", call_number: "int", total_amount: "int (cents)", currency: "string", status: "DRAFT|PENDING|SENT|PARTIALLY_PAID|PAID|OVERDUE|CANCELLED", issue_date: "ISO date", due_date: "ISO date" }]'
  },
  'POST /gp/funds': {
    description: 'Crear un fondo nuevo',
    body: '{ name: "string (required)", type: "VENTURE_CAPITAL|REAL_ESTATE|PRIVATE_EQUITY|HEDGE_FUND", total_size: "int (cents)", currency: "USD|CLP", status: "DRAFT|FUNDRAISING|ACTIVE" }'
  },
  'POST /gp/investors': {
    description: 'Registrar un nuevo inversor',
    body: '{ name: "string (required)", email: "string (required)", investor_type: "INDIVIDUAL|INSTITUTIONAL|CORPORATE|FAMILY_OFFICE", is_qualified_investor: "bool" }'
  },
  'POST /gp/capital-calls': {
    description: 'Crear un capital call',
    body: '{ fund_id: "uuid (required)", total_amount: "int (cents)", issue_date: "ISO date", due_date: "ISO date", call_number: "int" }'
  }
};

const SYSTEM_PROMPT = `Sos un analizador experto de pantallas Stitch para Venture Capital / Private Equity en ZEA Platform.

CONTEXTO DE LA PLATAFORMA:
- Las pantallas son HTML generado por Stitch (Google Design-to-Code) a partir de prompts de diseño
- Cada pantalla se almacena como un estado SDUI con type: "StitchedScreen" y el HTML crudo
- Para hacerlas funcionales, se inyectan atributos data-zea-bind="ruta.al.dato" en el HTML
- El cliente (browser) recibe los datos vía push del servidor y reemplaza el contenido de los elementos con data-zea-bind
- Los datos vienen de la Venture API de ZEA Platform vía intent_routing con type: "domain_api"

API CATALOG (endpoints disponibles para dar datos a las pantallas):
${JSON.stringify(API_CATALOG, null, 2)}

FORMATO DE INTENT ROUTING:
Un intent de tipo domain_api tiene esta estructura:
{
  "type": "domain_api",
  "domain": "venture",
  "endpoint": "GET /gp/dashboard",
  "target_state": "nombre_del_state",
  "data_mapping": {
    "key_en_html": "campo_en_api_response"
  }
}

PATRONES COMUNES DE STITCH:
- Métricas/KPIs: suelen estar en <span> con iconos de Material Symbols (class="material-symbols-outlined")
- Tablas: <table> con <thead> y <tbody>, datos estáticos de ejemplo
- Botones de acción: <button> con texto descriptivo
- Formularios: <input> o <textarea> con placeholders
- Gráficos: divs vacíos o placeholders SVG
- Navegación: sidebar con íconos y labels

Tu tarea: analizá la pantalla Stitch y devolvé SOLO este JSON (sin markdown, sin explicaciones fuera del JSON):
{
  "type": "dashboard" | "list" | "form" | "detail" | "wizard" | "unknown",
  "confidence": 0.0 a 1.0,
  "reasoning": "explicación breve en español de por qué clasificaste así",
  "components": [
    {
      "type": "kpi" | "table" | "button" | "chart" | "form" | "heading" | "navigation" | "card",
      "label": "texto visible o descripción del componente",
      "html_selector": "fragmento único del HTML para identificar este elemento",
      "data_bind": "nombre sugerido para el data-zea-bind (ej: aum, active_funds, funds)",
      "api_endpoint": "endpoint que provee este dato (ej: GET /gp/dashboard)",
      "api_field": "campo específico en la response de la API",
      "column_bindings": ["col1", "col2"] // solo para tablas: nombres de columnas sugeridos
    }
  ],
  "suggested_intents": [
    {
      "name": "load_dashboard" | "load_list" | "submit_form" | "navigate_to",
      "type": "domain_api" | "state_transition",
      "domain": "venture",
      "endpoint": "GET /gp/dashboard" | null,
      "target_state": "nombre_del_state",
      "data_mapping": { "html_key": "api_response_field" }
    }
  ],
  "injection_points": [
    {
      "html_selector": "fragmento exacto del HTML a modificar",
      "data_bind": "nombre del binding a inyectar",
      "action": "replace_text" | "wrap_span" | "add_to_tr",
      "description": "qué hacer con este elemento"
    }
  ]
}

REGLAS:
- Para tablas: data-zea-bind va en cada <tr> del <tbody> como iterador del array, y column_bindings en cada <td>
- Para KPIs: data-zea-bind va en el <span> que contiene el valor numérico
- Para formularios: los intents son type "domain_api" con endpoint POST
- Si un componente no matchea ninguna API, marcarlo como type "static" sin api_endpoint
- data_mapping usa los mismos keys que data-zea-bind
- Preferí data-zea-bind cortos y descriptivos en español o inglés estándar`;

async function callLLM(systemPrompt, userPrompt) {
  if (!DEEPSEEK_KEY) throw new Error('DEEPSEEK_API_KEY not set');

  const resp = await zeaFetch(DEEPSEEK_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_KEY}`
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.1,
      max_tokens: 4000,
      response_format: { type: 'json_object' }
    })
  });

  if (!resp.ok) throw new Error(`DeepSeek API error: ${resp.status} ${await resp.text()}`);
  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty LLM response');
  return JSON.parse(content);
}

function analyzeRegex(html) {
  const hasKPIs = (html.match(/metric|kpi|KPI|AUM|total|activo|active/gi) || []).length >= 2;
  const hasTable = html.includes('<table') || html.includes('<thead') || html.includes('<tbody');
  const hasForm = html.includes('<form') || html.includes('<input');
  const hasChart = html.includes('chart') || html.includes('canvas') || html.includes('recharts');
  const headings = html.match(/<h[1-6][^>]*>([^<]+)<\/h[1-6]>/gi) || [];

  let screenType = 'detail';
  if (hasKPIs && hasTable) screenType = 'dashboard';
  else if (hasTable && !hasKPIs) screenType = 'list';
  else if (hasForm) screenType = 'form';

  return { screenType, hasKPIs, hasTable, hasForm, hasChart, headings };
}

export function register(program) {
  const screenCmd = program.command('screen').description('Screen functionalization — analyze and add data bindings to Stitch screens');

  // ─── analyze ───────────────────────────────────────────
  screenCmd.command('analyze')
    .description('Analyze a StitchedScreen HTML (--llm for AI-powered, or regex by default)')
    .requiredOption('--app <id>', 'App ID')
    .requiredOption('--screen <name>', 'Screen state name')
    .option('--llm', 'Use DeepSeek LLM for semantic analysis')
    .action(async (opts) => {
      try {
        const client = await getClient();
        const resp = await zeaFetch(`${client.appsUrl}/api/apps/${opts.app}/manifest`, { headers: client.headers });
        if (!resp.ok) throw new Error(`API error: ${resp.status}`);
        const manifest = await resp.json();
        const state = (manifest.states || {})[opts.screen];
        if (!state) throw new Error(`State '${opts.screen}' not found`);
        if (state.type !== 'StitchedScreen') throw new Error(`State is type '${state.type}', not StitchedScreen`);

        const html = state.html || '';

        if (opts.llm) {
          console.log(`\n${chalk.bold('LLM Analysis:')} ${opts.screen} (${html.length} bytes)\n`);
          const userPrompt = `Analizá esta pantalla Stitch:\n\nTITLE: ${opts.screen}\nHTML (${html.length} bytes):\n${html.slice(0, 10000)}`;
          const analysis = await callLLM(SYSTEM_PROMPT, userPrompt);

          console.log(`${chalk.cyan('Type:')} ${analysis.type} (confidence: ${(analysis.confidence * 100).toFixed(0)}%)`);
          console.log(`${chalk.dim('Reasoning:')} ${analysis.reasoning}\n`);

          console.log(`${chalk.cyan('Components:')}`);
          for (const c of analysis.components || []) {
            const icon = c.type === 'kpi' ? '📊' : c.type === 'table' ? '📋' : c.type === 'button' ? '🔘' : c.type === 'chart' ? '📈' : c.type === 'form' ? '📝' : '📌';
            console.log(`  ${icon} ${c.label}`);
            console.log(`     data-zea-bind="${c.data_bind}"  ← ${c.api_endpoint}.${c.api_field}`);
            if (c.column_bindings?.length) console.log(`     columns: ${c.column_bindings.join(', ')}`);
          }

          console.log(`\n${chalk.cyan('Suggested Intents (${analysis.suggested_intents?.length || 0}):')}`);
          for (const i of analysis.suggested_intents || []) {
            console.log(`  → ${i.name}: ${i.type} ${i.endpoint || ''} → ${i.target_state}`);
            if (i.data_mapping) console.log(`     mapping: ${JSON.stringify(i.data_mapping)}`);
          }

          console.log(`\n${chalk.cyan('Injection Points (${analysis.injection_points?.length || 0}):')}`);
          for (const ip of analysis.injection_points || []) {
            console.log(`  • "${ip.html_selector?.slice(0, 60)}" → data-zea-bind="${ip.data_bind}" (${ip.action})`);
          }

          console.log(`\nRun: ${chalk.green(`zea screen functionalize --app ${opts.app} --screen ${opts.screen} --llm`)}`);

        } else {
          // Regex fallback
          console.log(`\n${chalk.bold('Regex Analysis:')} ${opts.screen} (${html.length} bytes)\n`);
          const a = analyzeRegex(html);
          console.log(`${chalk.cyan('Type:')} ${a.screenType}`);
          console.log(`  KPI: ${a.hasKPIs ? '✅' : '❌'} | Table: ${a.hasTable ? '✅' : '❌'} | Form: ${a.hasForm ? '✅' : '❌'} | Chart: ${a.hasChart ? '✅' : '❌'}`);
          const spans = (html.match(/<span[^>]*>([^<]+)<\/span>/gi) || []).map(s => s.replace(/<[^>]+>/g, '')).filter(v => v.trim() && v.length < 60);
          console.log(`\n${chalk.cyan('Static values:')}`);
          [...new Set(spans)].slice(0, 15).forEach(v => console.log(`  "${v.trim()}"`));
          console.log(`\nRun: ${chalk.green(`zea screen functionalize --app ${opts.app} --screen ${opts.screen}`)}`);
          console.log(`${chalk.dim('Tip: use --llm for AI-powered semantic analysis')}`);
        }

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
    .option('--llm', 'Use LLM for intelligent binding injection')
    .action(async (opts) => {
      try {
        const client = await getClient();
        console.log(`\n[1/5] Fetching manifest...`);
        const resp = await zeaFetch(`${client.appsUrl}/api/apps/${opts.app}/manifest`, { headers: client.headers });
        if (!resp.ok) throw new Error(`API error: ${resp.status}`);
        const manifest = await resp.json();
        const state = (manifest.states || {})[opts.screen];
        if (!state) throw new Error(`State '${opts.screen}' not found`);
        if (state.type !== 'StitchedScreen') throw new Error(`State is type '${state.type}', not StitchedScreen`);

        let html = state.html || '';
        let analysis;

        console.log(`[2/5] Analyzing HTML (${html.length} bytes)...`);

        if (opts.llm) {
          const userPrompt = `TOMÁ este HTML de una pantalla Stitch y DEVOLVÉ el HTML COMPLETO con data-zea-bind inyectado en cada valor dinámico.

REGLAS:
- NO modifiques la estructura del HTML. SOLO agregá atributos data-zea-bind.
- Cada KPI, métrica, fila de tabla y valor dinámico debe tener data-zea-bind.
- Usá nombres cortos en inglés/español para los bindings (ej: aum, active_funds, funds, lps).
- Para tablas: agregá data-zea-bind="nombre_array" en cada <tr> del <tbody>.
- NO cambies clases CSS, estilos ni estructura.
- Devolvé el HTML COMPLETO (no resumido, no truncado).

TITLE: ${opts.screen}
HTML (${html.length} bytes):
${html.slice(0, 12000)}

Devolvé SOLO este JSON:
{
  "type": "dashboard"|"list"|"form"|"detail",
  "injected_html": "EL HTML COMPLETO CON data-zea-bind YA INYECTADO",
  "bindings_added": ["aum", "active_funds", ...],
  "suggested_intents": [...]
}`;

          const funcPrompt = `Sos un experto en inyectar data-zea-bind en HTML de pantallas Stitch para ZEA Platform.

APIs disponibles:
- GET /gp/dashboard → {active_funds, active_lps, aum, pending_capital_calls, total_called, total_paid}
- GET /gp/funds → [{id, name, type, status, total_size, currency}]
- GET /gp/investors → [{id, name, email, investor_type}]
- GET /gp/capital-calls → [{id, fund_name, total_amount, status, issue_date, due_date}]

El data-zea-bind se pone como atributo HTML. El cliente JS busca [data-zea-bind] y reemplaza el contenido con datos de la API.
Para tablas: <tr data-zea-bind="funds"> itera sobre el array, y cada <td> puede tener data-zea-bind="name", data-zea-bind="status".

Devolvé el HTML COMPLETO con los bindings inyectados. NO resumas, NO truncues.`;
          
          analysis = await callLLM(funcPrompt, userPrompt);
        } else {
          analysis = { type: analyzeRegex(html).screenType, injection_points: [], suggested_intents: [] };
        }

        // 3. Inject bindings — LLM returns full modified HTML
        console.log(`[3/5] Injecting data-zea-bind...`);
        let bindings = 0;

        if (analysis.injected_html && opts.llm) {
          // LLM returned the full HTML with bindings already injected
          const newBinds = (analysis.injected_html.match(/data-zea-bind="([^"]+)"/g) || []);
          const oldBinds = (html.match(/data-zea-bind="([^"]+)"/g) || []);
          bindings = newBinds.length - oldBinds.length;
          if (bindings > 0) {
            html = analysis.injected_html;
            const bindNames = [...new Set(newBinds.map(b => b.match(/"([^"]+)"/)[1]))];
            console.log(`   ✅ LLM injected ${bindings} bindings: ${bindNames.join(', ')}`);
          } else {
            console.log(`   ⚠️  LLM returned same number of bindings — no changes`);
          }
        } else if (analysis.injection_points?.length > 0) {
          // Regex fallback: try exact selector matching
          for (const ip of analysis.injection_points) {
            if (html.includes(ip.html_selector) && !html.includes(`data-zea-bind="${ip.data_bind}"`)) {
              if (ip.action === 'wrap_span' || ip.action === 'replace_text') {
                html = html.replace(`>${ip.html_selector}<`, ` data-zea-bind="${ip.data_bind}">${ip.html_selector}<`);
              } else if (ip.action === 'add_to_tr') {
                html = html.replace(/<tr([^>]*)class="([^"]*)"/, (m, a, c) => `<tr${a}class="${c}" data-zea-bind="${ip.data_bind}"`);
              }
              if (html.includes(`data-zea-bind="${ip.data_bind}"`)) {
                bindings++;
                console.log(`   ✅ ${ip.data_bind} (${ip.description || ip.html_selector?.slice(0, 40)})`);
              }
            }
          }
        } else {
          // Fallback for old format analysis
          const a = analyzeRegex(html);
          if (a.screenType === 'dashboard') {
            for (const [text, bind] of [['AUM Total', 'aum'], ['Fondos Activos', 'active_funds']]) {
              if (html.includes(text) && !html.includes(`data-zea-bind="${bind}"`)) {
                html = html.replace(`>${text}<`, ` data-zea-bind="${bind}">${text}<`);
                bindings++;
              }
            }
            if (a.hasTable && !html.includes('data-zea-bind="funds"')) {
              html = html.replace(/<tr([^>]*)class="([^"]*)"/, (m, a, c) => `<tr${a}class="${c}" data-zea-bind="funds"`);
              if (html.includes('data-zea-bind="funds"')) bindings++;
            }
          }
        }

        console.log(`   Total bindings: ${bindings}`);

        // 4. Create intent_routing
        console.log(`[4/5] Creating intent_routing...`);
        manifest.intent_routing = manifest.intent_routing || {};

        if (analysis.suggested_intents?.length > 0) {
          for (const intent of analysis.suggested_intents) {
            if (!manifest.intent_routing[intent.name]) {
              manifest.intent_routing[intent.name] = {
                type: intent.type,
                domain: intent.domain || 'venture',
                endpoint: intent.endpoint,
                target_state: intent.target_state,
                data_mapping: intent.data_mapping || {}
              };
            }
          }
        } else if (analysis.type === 'dashboard' || analyzeRegex(html).screenType === 'dashboard') {
          if (!manifest.intent_routing[`load_${opts.screen}`]) {
            manifest.intent_routing[`load_${opts.screen}`] = {
              type: 'domain_api', domain: 'venture', endpoint: 'GET /gp/dashboard',
              target_state: opts.screen,
              data_mapping: { aum: 'aum', active_funds: 'active_funds_count', active_lps: 'active_lps', pending_calls: 'pending_capital_calls', total_called: 'total_called', total_paid: 'total_paid' }
            };
          }
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
          app_id: opts.app, name: manifest.name || 'App', domain_auth: manifest.domain_auth || 'venture',
          status: 'active', version: '1.0.0', manifest,
          states: manifest.states, intent_routing: manifest.intent_routing,
          shell: manifest.shell || {}, design_system: manifest.design_system || {}
        };

        const uResp = await zeaFetch(`${client.appsUrl}/api/apps`, {
          method: 'POST', headers: client.headers, body: JSON.stringify(payload)
        });
        if (!uResp.ok) throw new Error(`Update failed: ${uResp.status}`);
        console.log(`   ✅ Manifest updated`);

        console.log(`\n${chalk.green('✅ Screen functionalized!')}`);
        console.log(`   App:     ${opts.app} | Screen: ${opts.screen}`);
        console.log(`   Type:    ${analysis.type || '?'} | Bindings: ${bindings} | Intents: ${intents}`);

      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  // ─── gap-detect ─────────────────────────────────────────
  screenCmd.command('gap-detect')
    .description('Scan all screens for components without API bindings (uses LLM)')
    .requiredOption('--app <id>', 'App ID')
    .option('--llm', 'Use LLM for semantic gap detection')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      try {
        const client = await getClient();
        const resp = await zeaFetch(`${client.appsUrl}/api/apps/${opts.app}/manifest`, { headers: client.headers });
        if (!resp.ok) throw new Error(`API error: ${resp.status}`);
        const manifest = await resp.json();
        const states = manifest.states || {};

        if (Object.keys(states).length === 0) {
          console.log('No screens found.');
          return;
        }

        console.log(`Scanning ${Object.keys(states).length} screens...\n`);

        if (!opts.llm) {
          // Quick regex-based gap detection
          for (const [name, state] of Object.entries(states)) {
            if (state.type !== 'StitchedScreen') continue;
            const html = state.html || '';
            const existingBinds = (html.match(/data-zea-bind="([^"]+)"/g) || []).map(b => b.match(/"([^"]+)"/)[1]);
            const hasTable = html.includes('<table');
            const hasKPIs = (html.match(/metric|kpi|KPI|AUM|total/gi) || []).length >= 2;

            console.log(`${name}: ${existingBinds.length} bindings`);
            if (existingBinds.length === 0 && (hasTable || hasKPIs)) {
              console.log(`  ⚠️  No bindings — run: zea screen functionalize --llm`);
            }
          }
          return;
        }

        // LLM-powered gap detection
        const screensContext = Object.entries(states)
          .filter(([, s]) => s.type === 'StitchedScreen')
          .map(([name, s]) => ({
            name,
            html_size: (s.html || '').length,
            existing_bindings: (s.html || '').match(/data-zea-bind="([^"]+)"/g)?.map(b => b.match(/"([^"]+)"/)[1]) || [],
            html_preview: (s.html || '').slice(0, 3000)
          }));

        const gapPrompt = `Escaneá estas pantallas de ZEA Platform y detectá componentes sin API.

APIs disponibles:
- GET /gp/dashboard → {active_funds, active_lps, aum, pending_capital_calls, total_called, total_paid}
- GET /gp/funds → [{id, name, type, status, total_size, currency}]
- GET /gp/investors → [{id, name, email, investor_type}]
- GET /gp/capital-calls → [{id, fund_name, total_amount, status, issue_date, due_date}]
- POST /gp/funds, POST /gp/investors, POST /gp/capital-calls

Para cada pantalla, analizá si todos sus componentes visuales tienen data-zea-bind con API disponible.
Si un componente no tiene API, devolvé:
- qué componente es
- qué endpoint/tabla se necesita crear
- qué legos usar (venture data add-table, venture api add-endpoint)

Devolvé SOLO este JSON (sin markdown):
{
  "screens": [
    {
      "name": "...",
      "total_components": N,
      "mapped": N,
      "gaps": [
        {
          "component": "nombre del componente",
          "status": "missing_api",
          "suggested_table": "nombre_tabla",
          "suggested_endpoint": "GET /gp/nombre",
          "legos_needed": ["zea venture data add-table ...", "zea venture api add-endpoint ..."],
          "priority": "high" | "medium" | "low"
        }
      ],
      "ok": ["componente → endpoint.campo"]
    }
  ],
  "summary": {
    "total_screens": N,
    "total_gaps": N,
    "critical_gaps": N
  }
}`;

        const analysis = await callLLM(gapPrompt, JSON.stringify(screensContext, null, 2));

        if (opts.json) {
          console.log(JSON.stringify(analysis, null, 2));
          return;
        }

        console.log(chalk.bold(`Gap Analysis — ${analysis.screens?.length || 0} screens\n`));

        for (const screen of (analysis.screens || [])) {
          console.log(chalk.cyan(`${screen.name}: ${screen.mapped}/${screen.total_components} mapped`));
          for (const g of (screen.gaps || [])) {
            const icon = g.priority === 'high' ? '🔴' : g.priority === 'medium' ? '🟡' : '🟢';
            console.log(`  ${icon} ${g.component} → ${g.suggested_endpoint || g.suggested_table}`);
            console.log(`     Legos: ${(g.legos_needed || []).join(', ')}`);
          }
          for (const ok of (screen.ok || [])) {
            console.log(`  ✅ ${ok}`);
          }
          console.log('');
        }

        console.log(chalk.bold(`Total gaps: ${analysis.summary?.total_gaps || 0} (${analysis.summary?.critical_gaps || 0} critical)`));
        console.log(`\nFix with: zea branch plan --gap '...' --llm`);

      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  // ─── analyze --file (Excel) ──────────────────────────────
  screenCmd.command('analyze-file')
    .description('Analyze an Excel file and suggest DB mapping (uses LLM)')
    .requiredOption('--file <path>', 'Excel file path')
    .option('--llm', 'Use LLM for semantic column analysis')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      try {
        const pandas = await import('child_process').then(m => m.execSync(
          `python3 -c "
import pandas as pd, json
f = '${opts.file}'
sheets = pd.read_excel(f, sheet_name=None)
result = {'file': f, 'sheets': {}}
for name, df in sheets.items():
    result['sheets'][name] = {
        'row_count': len(df),
        'columns': [{'name': str(c), 'dtype': str(df[c].dtype), 'sample_values': [str(v) for v in df[c].head(3).tolist() if pd.notna(v)]} for c in df.columns]
    }
print(json.dumps(result, indent=2))
"`, { encoding: 'utf8', timeout: 15000 }
        ));

        const data = JSON.parse(pandas.toString());

        if (!opts.llm) {
          console.log(JSON.stringify(data, null, 2));
          return;
        }

        const importPrompt = `Analizá este Excel de Venture Capital y sugerí el mapeo a la base de datos ZEA.

Entidades disponibles:
- funds: {name, type, status, total_size, currency, hard_cap}
- lps (investors): {name, email, investor_type, is_qualified_investor}
- commitments: {fund_id, lp_id, amount}
- capital_calls: {fund_id, call_number, issue_date, due_date, total_amount, status}
- payments: {capital_call_item_id, paid_amount, payment_date, payment_method}

Reglas:
- Montos en Excel suelen estar en unidades (USD), en DB son centavos → multiplicar ×100
- Si una columna referencia otra entidad por nombre (ej: fund='Venture Fund I'), hay que hacer lookup
- Si faltan campos requeridos (ej: investor_type), sugerir default

Devolvé SOLO este JSON:
{
  "sheets_analysis": {
    "nombre_hoja": {
      "entity": "funds" | "lps" | "commitments" | "capital_calls" | "payments" | "unknown",
      "confidence": 0.0-1.0,
      "mapping": {"columna_excel": "campo_db"},
      "transformations": {"columna": "×100" | "lookup:funds.name" | "default:VENTURE_CAPITAL"},
      "warnings": ["faltan campos", "tipo ambiguo"],
      "import_order": 1
    }
  },
  "import_plan": ["funds", "investors", "commitments", "capital_calls", "payments"],
  "estimated_rows": N
}`;

        const analysis = await callLLM(importPrompt, JSON.stringify(data, null, 2));

        if (opts.json) {
          console.log(JSON.stringify(analysis, null, 2));
          return;
        }

        console.log(chalk.bold(`\nExcel Analysis — ${Object.keys(data.sheets).length} sheets\n`));
        for (const [sheet, info] of Object.entries(analysis.sheets_analysis || {})) {
          console.log(chalk.cyan(`${sheet} → ${info.entity} (${(info.confidence * 100).toFixed(0)}%)`));
          for (const [col, field] of Object.entries(info.mapping || {})) {
            const xform = info.transformations?.[col];
            console.log(`  ${col} → ${field}${xform ? ' (' + xform + ')' : ''}`);
          }
          if (info.warnings?.length) info.warnings.forEach(w => console.log(`  ⚠️  ${w}`));
          console.log('');
        }
        console.log(chalk.bold(`Import plan: ${(analysis.import_plan || []).join(' → ')}`));
        console.log(`\nRun: zea venture data import --file ${opts.file} --llm --yes`);

      } catch (e) {
        console.error('Error:', e.message);
      }
    });

}