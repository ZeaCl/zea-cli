import zeaFetch from '../lib/http.js';
import { getClient } from '../client.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { withLearning } from '../utils/learning.js';

const MEMORY_DIR = path.join(os.homedir(), '.zea', 'memory');

const DESIGN_CONTEXT_SYSTEM_PROMPT = `Eres **Senior Product Designer**. Tu tarea es tomar un Value Proposition Canvas validado como entrada y generar un **documento de contexto de diseño UX/UI** completo, estructurado y accionable, que servirá como input único para un agente de IA diseñador UX/UI. No diseñas pantallas — generas el briefing y las especificaciones para que otro agente lo haga.

Usa los IDs del canvas (J-xx, P-xx, G-xx, PS-xx, PR-xx, GC-xx) para trazar trazabilidad en tus decisiones. Todo lo que propongas debe estar anclado a un elemento del canvas.

Genera un documento con las siguientes secciones. Sé específico basado en el canvas de entrada, no genérico:

### 1. PRODUCT VISION & STRATEGY
- Propósito en una frase: "Ayudamos a [quién] a [qué] para que [resultado aspiracional]"
- Propuesta de valor diferencial
- Posicionamiento emocional
- MVP scope: qué entra en la primera versión y por qué

### 2. PERSONA SYSTEM
Describe cada perfil de usuario identificado en el Customer Profile:
- Perfil demográfico y contextual
- Contexto de uso (dónde, cuándo, cómo, nivel de energía)
- Estado emocional predominante
- Patrón de interacción
- Principio de diseño dominante
- Anti-patrón (lo que NO tolera en la interfaz)

### 3. CORE USER FLOWS (Journey Maps)
Define 4-5 flows con paso a paso, estados emocionales, fricción y deleite:
- Flow 1: Onboarding y primera experiencia
- Flow 2: Flow principal recurrente
- Flow 3: Consulta o monitoreo
- Flow 4: Acción programada o colaborativa
- Flow 5: Modo de urgencia o rescate (si aplica)

### 4. INFORMATION ARCHITECTURE
- Estructura de navegación principal con justificación
- Jerarquía de contenido
- Modelo mental del usuario

### 5. KEY SCREENS & STATES
4-7 pantallas. Para cada una: propósito, contenido/jerarquía, CTA primario, estados (empty/loading/success/error/partial), edge cases.

### 6. GAMIFICATION / ENGAGEMENT SYSTEM
Solo si el canvas lo justifica. Economía interna, mecánicas, feedback loops, progresión.

### 7. DESIGN PRINCIPLES (exactamente 5)
Específicos al producto. Formato: Nombre — qué significa + qué decisión informa + ID del canvas.

### 8. INTERACTION PATTERNS & COMPONENTS
- Patrones recurrentes
- Componentes compartidos
- Micro-interacciones clave
- Sistema de notificaciones

### 9. EMOTIONAL DESIGN MAP
Curva emocional: entrada, interacción principal, recompensa, fricción/fracaso.

### 10. CONSTRAINTS & GUARDRAILS
Plataforma, offline/online, accesibilidad, ética, privacidad.

### 11. SUCCESS METRICS (UX)
Activación, retención, hábito, outcome metrics.

Reglas:
1. Cada sección referencia IDs del canvas (J-xx, P-xx, G-xx, PS-xx, PR-xx, GC-xx)
2. Accionable para diseñador UX/UI
3. Lenguaje de diseño, no de negocio
4. Prioriza MUST-HAVE sobre SHOULD-HAVE
5. Anticipa edge cases
6. No diseñes visualmente (colores, tipografías)
7. Documenta decisiones con trazabilidad al canvas`;

const DESIGN_MD_SYSTEM_PROMPT = `Eres **Senior UI/Visual Designer** especializado en traducir contexto de diseño UX/UI en sistemas de diseño visual completos. Tu tarea es tomar un documento de Design Context como entrada y generar un archivo DESIGN.md siguiendo la especificación de Google Labs (github.com/google-labs-code/design.md).

El archivo DESIGN.md tiene dos partes:

### YAML Frontmatter (design tokens)
\`\`\`yaml
---
version: alpha
name: <nombre evocativo>
description: <descripcion breve>
colors:
  <token>: <color CSS>
typography:
  <nivel>:
    fontFamily: <string>
    fontSize: <Dimension>
    fontWeight: <number>
    lineHeight: <Dimension | number>
    letterSpacing: <Dimension>
rounded:
  <escala>: <Dimension>
spacing:
  <escala>: <Dimension>
components:
  <componente>:
    <propiedad>: <valor | {referencia}>
---
\`\`\`

Reglas de tokens:
- Colors: minimo primary, secondary, tertiary, neutral. Usa hex #RRGGBB. Nombres semanticos.
- Typography: 9-15 niveles con nombres semanticos (headline-lg, body-md, label-sm). Define fontFamily, fontSize, fontWeight, lineHeight, letterSpacing.
- Rounded: al menos sm, md, lg, full en px.
- Spacing: al menos xs, sm, md, lg, xl en px. Escala consistente (multiplos de 4px u 8px).
- Components: minimo botones (primary, secondary, tertiary con hover/active) e inputs. Usa referencias: {colors.primary}, {typography.label-md}, {rounded.md}.

### Markdown (8 secciones obligatorias en este orden)

1. **## Overview** — Personalidad de marca, target, respuesta emocional. Derivado del posicionamiento emocional y Persona System del Design Context.

2. **## Colors** — Cada paleta con nombre, hex, proposito y justificacion desde los Design Principles y Emotional Design Map.

3. **## Typography** — Niveles tipograficos con proposito semantico. Estrategia: cuantas familias, por que, que comunican. Relacion con Persona System (si hay dos audiencias distintas, como manejar ambas con un solo sistema).

4. **## Layout** — Estrategia de layout (mobile-first), escala de spacing, principios de agrupacion. Derivado de la Information Architecture y Key Screens del Design Context.

5. **## Elevation & Depth** — Como se transmite jerarquia visual. Sombras, capas tonales, o flat. Relacion con Design Principles. Como cambia entre modos si hay dos audiencias.

6. **## Shapes** — Lenguaje de formas. Corner radius para diferentes elementos. Organico vs estructurado. Relacion con Persona System.

7. **## Components** — Estilo visual de componentes clave:
   - Buttons (primary, secondary, tertiary, hover, active, disabled)
   - Input fields (labels, bordes, focus, error)
   - Cards (padding, border-radius, elevation)
   - Componentes especificos del producto mencionados en el Design Context

8. **## Do's and Don'ts** — 8-12 reglas practicas. Derivadas de Design Principles, anti-patrones del Persona System, y Constraints del Design Context. Formato: Do/Don't.

Reglas del output:
1. Coherencia bidireccional: cada token YAML tiene su explicacion en prosa, y viceversa
2. Justificacion desde el Design Context: cada decision visual referencia la seccion/principio del Design Context que la motiva
3. No inventar componentes: solo los que el Design Context menciona
4. Mobile-first como default
5. Accesibilidad: asegurar WCAG AA (4.5:1 texto normal, 3:1 texto grande)
6. Dos audiencias, un sistema: si hay dos personas distintas, definir como el sistema se adapta a ambas
7. Referencias entre tokens con {path.to.token}
8. Nombre del sistema evocativo, no generico`;

const STITCH_INIT_SYSTEM_PROMPT = `Eres un agente de diseno especializado en Stitch (stitch.withgoogle.com). Tu tarea es inicializar un proyecto en Stitch usando dos documentos como entrada: un DESIGN.md (sistema de diseno visual con tokens YAML) y un design-context.md (contexto UX/UI con personas, pantallas, flujos y principios).

Stitch se accede via MCP (JSON-RPC) en el endpoint https://stitch.googleapis.com/mcp.

IMPORTANTE: Para operaciones de LECTURA (list_screens, get_screen, list_design_systems, tools/list) se usa header X-Goog-Api-Key con la STITCH_KEY. Para operaciones de ESCRITURA (create_project, create_design_system, generate_screen_from_text) se requiere autenticacion OAuth 2. Si no tienes token OAuth, crea el proyecto manualmente en la UI de Stitch (https://stitch.withgoogle.com) y luego usa los tool calls de lectura con la API key.

## Herramientas MCP disponibles

- create_project(title) → projectId
- create_design_system_from_design_md(projectId, designMd) → designSystemId  
- generate_screen_from_text(projectId, prompt, deviceType:"MOBILE") → screen
- list_screens(projectId) → screens[]
- get_screen(projectId, screenId) → screen con HTML
- apply_design_system(projectId, selectedScreenInstances, assetId) → aplica design system a pantallas

## Paso a paso

### 1. Crear el proyecto
Usa create_project con titulo extraido del DESIGN.md frontmatter (campo "name"). Guarda el projectId.

### 2. Subir DESIGN.md y crear design system
Usa create_design_system_from_design_md con el projectId y el contenido COMPLETO del DESIGN.md (incluyendo el YAML frontmatter). Esto crea automaticamente el design system con todos los tokens.

### 3. Crear pantallas iniciales
Del design-context.md, extrae las Key Screens (seccion 5). Para cada pantalla marcada como MVP, usa generate_screen_from_text con:
- projectId del paso 1
- prompt: describe la pantalla usando el proposito, jerarquia y CTA del design context
- deviceType: "MOBILE"

Prioriza: Home Matutino, Sesion Activa, Panel de Progreso, Kit de Calma.

### 4. Verificar
Usa list_screens para confirmar que todas las pantallas se crearon correctamente.

## Output esperado
Al finalizar, muestra:
- Project ID de Stitch
- Design System ID
- Pantallas creadas con sus IDs
- Sugerencia: guarda el project ID con: zea memory init --app <app_id> --stitch-project <project_id>`;

async function readMemory(appId, file) {
  try {
    return JSON.parse(await fs.readFile(path.join(MEMORY_DIR, 'apps', appId, file), 'utf8'));
  } catch { return {}; }
}

async function writeMemory(appId, file, data) {
  const dir = path.join(MEMORY_DIR, 'apps', appId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, file), JSON.stringify(data, null, 2));
}

export function register(program) {
  const designCmd = program.command('design').description('Design management integration commands');

  designCmd.command('list-screens')
    .description('List Stitch screens for an app')
    .requiredOption('--app <id>', 'App ID')
    .option('--stitch-key <key>', 'Stitch API key (or use STITCH_KEY env)')
    .action(async (opts) => {
      try {
        const mem = await readMemory(opts.app, 'stitch.json');
        const projectId = mem?.project_id;
        if (!projectId) {
          console.error('No Stitch project configured. Run: zea memory init --app ' + opts.app + ' --stitch-project <id>');
          process.exit(1);
        }

        const apiKey = opts.stitchKey || process.env.STITCH_KEY;
        if (!apiKey) {
          console.error('Stitch API key required. Set STITCH_KEY env var or use --stitch-key.');
          process.exit(1);
        }

        const response = await zeaFetch('https://stitch.googleapis.com/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'list_screens', arguments: { projectId } }, id: 1 })
        });

        const result = await response.json();
        const content = result?.result?.content || [];
        for (const c of content) {
          const data = JSON.parse(c.text || '{}');
          const screens = data.screens || [];
          console.log(`Project: ${projectId}`);
          console.log(`Screens: ${screens.length}\n`);
          for (const s of screens) {
            const sid = s.name.split('/').pop();
            console.log(`  ${s.title || s.name || 'Untitled'}  (${sid})`);
          }
        }
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  // --- import-screen ---
  designCmd.command('import-screen')
    .description('Import a Stitch screen into ZEA app manifest')
    .requiredOption('--app <id>', 'ZEA App ID')
    .requiredOption('--screen-id <id>', 'Stitch screen ID')
    .requiredOption('--state <name>', 'SDUI state name')
    .requiredOption('--intent <name>', 'Intent name for routing')
    .option('--stitch-key <key>', 'Stitch API key (or use STITCH_KEY env)')
    .action(async (opts) => {
      try {
        const apiKey = opts.stitchKey || process.env.STITCH_KEY;
        if (!apiKey) {
          console.error('Stitch API key required. Set STITCH_KEY env var or use --stitch-key.');
          process.exit(1);
        }
        const client = await getClient();
        await withLearning(opts.app, 'design.import-screen', async () => {
        const mem = await readMemory(opts.app, 'stitch.json');
        const projectId = mem?.project_id;
        if (!projectId) {
          console.error('No Stitch project configured. Run: zea memory init --app ' + opts.app + ' --stitch-project <id>');
          process.exit(1);
        }

        // 1. Get screen metadata
        console.log(`1/5 Fetching screen metadata...`);
        const r1 = await zeaFetch('https://stitch.googleapis.com/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'get_screen', arguments: { projectId, screenId: opts.screenId } }, id: 2 })
        });
        const d1 = await r1.json();

        // Find HTML download URL
        const match = JSON.stringify(d1).match(/"downloadUrl":"(https:\/\/contribution[^"]+)"/);
        if (!match) {
          console.error('Could not find HTML download URL for this screen.');
          process.exit(1);
        }
        const htmlUrl = match[1];
        console.log(`2/5 Downloading HTML...`);
        const r2 = await zeaFetch(htmlUrl);
        const html = await r2.text();

        // 2. Extract <main> content
        console.log(`3/5 Extracting content (${html.length} bytes)...`);
        const mainMatch = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/);
        const contentHtml = mainMatch ? mainMatch[1].trim() : html;

        // 3. Update manifest
        console.log(`4/5 Updating manifest...`);
        const mResp = await zeaFetch(`${client.appsUrl}/api/apps/${opts.app}/manifest`, {
          headers: client.headers
        });
        if (!mResp.ok) throw new Error(`Manifest fetch failed: ${mResp.status}`);
        const manifest = await mResp.json();

        manifest.states = manifest.states || {};
        manifest.states[opts.state] = {
          type: 'StitchedScreen',
          html: contentHtml
        };

        manifest.intent_routing = manifest.intent_routing || {};
        manifest.intent_routing[opts.intent] = {
          type: 'state_transition',
          target_state: opts.state
        };

        const payload = {
          app_id: manifest.app_id,
          name: manifest.name,
          domain_auth: manifest.domain_auth || '',
          status: manifest.status || 'active',
          version: manifest.version || '1.0.0',
          manifest,
          states: manifest.states,
          intent_routing: manifest.intent_routing
        };

        const uResp = await zeaFetch(`${client.appsUrl}/api/apps`, {
          method: 'POST',
          headers: client.headers,
          body: JSON.stringify(payload)
        });
        if (!uResp.ok) throw new Error(`Manifest update failed: ${uResp.status}`);

        // 4. Update memory (non-blocking — best effort)
        try {
          mem.screen_mappings = mem.screen_mappings || {};
          mem.screen_mappings[opts.state] = {
            stitch_id: opts.screenId,
            state: opts.state,
            intent: opts.intent,
            html_bytes: contentHtml.length,
            imported_at: new Date().toISOString()
          };
          mem.last_sync = new Date().toISOString();
          await writeMemory(opts.app, 'stitch.json', mem);
          console.log(`   Memory:  updated`);
        } catch (e) {
          console.log(`   Memory:  skipped (no write access)`);
        }

        }, { screen_id: opts.screenId, state: opts.state, intent: opts.intent });

      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  // --- status ---
  designCmd.command('status')
    .description('Show import status for an app (reads from API)')
    .requiredOption('--app <id>', 'App ID')
    .action(async (opts) => {
      try {
        const client = await getClient();
        const resp = await zeaFetch(`${client.appsUrl}/api/apps/${opts.app}/manifest`, { headers: client.headers });
        if (!resp.ok) throw new Error(`API error: ${resp.status}`);
        const manifest = await resp.json();
        const states = manifest.states || {};
        const entries = Object.entries(states);

        if (entries.length === 0) {
          console.log('No screens imported yet.');
          return;
        }

        console.log(`App: ${opts.app}`);
        console.log(`States: ${entries.length}\n`);
        for (const [name, state] of entries) {
          const htmlSize = (state.html || '').length;
          console.log(`  ${name}`);
          console.log(`    Type: ${state.type || '?'}`);
          console.log(`    HTML: ${htmlSize} bytes`);
          if (state.type === 'StitchedScreen') {
            const binds = (state.html || '').match(/data-zea-bind="([^"]+)"/g) || [];
            console.log(`    Bindings: ${binds.length > 0 ? [...new Set(binds.map(b => b.match(/"([^"]+)"/)[1]))].join(', ') : 'none'}`);
          }
          console.log('');
        }
      } catch (e) {
        // Fallback: try local memory
        try {
          const mem = await readMemory(opts.app, 'stitch.json');
          const mappings = mem?.screen_mappings || {};
          const entries = Object.entries(mappings);
          if (entries.length === 0) {
            console.log('No screens imported yet.');
            return;
          }
          console.log(`App: ${opts.app} (from local memory)`);
          console.log(`Project: ${mem.project_id}\n`);
          for (const [state, info] of entries) {
            console.log(`  ${state}: ${info.stitch_id} → ${info.intent} (${info.html_bytes} bytes)`);
          }
        } catch {
          console.error('Error:', e.message);
        }
      }
    });

  // --- update-design ---
  designCmd.command('update-design')
    .description('Update design system tokens (colors, typography)')
    .requiredOption('--app <id>', 'ZEA App ID')
    .requiredOption('--token <path>', 'Token path (e.g. colors.primary, typography.h1_size)')
    .requiredOption('--value <val>', 'New value')
    .option('--experiment <name>', 'Experiment branch name (safe mode)')
    .action(async (opts) => {
      try {
        const client = await getClient();
        await withLearning(opts.app, 'design.update-design', async () => {

        // If experiment, use experiment URL
        const manifestUrl = opts.experiment
          ? `${client.appsUrl}/api/apps/${opts.app}/experiments/${opts.experiment}`
          : `${client.appsUrl}/api/apps/${opts.app}/manifest`;

        const mResp = await zeaFetch(manifestUrl, { headers: client.headers });
        if (!mResp.ok) throw new Error(`Manifest fetch failed: ${mResp.status}`);
        const manifest = await mResp.json();

        // Update at the flat level (API response format)
        const parts = opts.token.split('.');
        let node = manifest;
        for (let i = 0; i < parts.length - 1; i++) {
          node[parts[i]] = node[parts[i]] || {};
          node = node[parts[i]];
        }
        node[parts[parts.length - 1]] = opts.value;

        // Build payload with the manifest as both flat fields and nested manifest
        const payload = {
          app_id: manifest.app_id || opts.app,
          name: manifest.name || 'App',
          domain_auth: manifest.domain_auth || 'venture',
          status: manifest.status || 'active',
          version: manifest.version || '1.0.0',
          manifest: manifest,
          states: manifest.states || {},
          intent_routing: manifest.intent_routing || {},
          shell: manifest.shell || {},
          design_system: manifest.design_system || {}
        };

        const uploadUrl = opts.experiment
          ? `${client.appsUrl}/api/apps/${opts.app}/experiments/${opts.experiment}`
          : `${client.appsUrl}/api/apps`;

        const uResp = await zeaFetch(uploadUrl, {
          method: opts.experiment ? 'PUT' : 'POST',
          headers: client.headers,
          body: JSON.stringify(opts.experiment ? { manifest } : payload)
        });
        if (!uResp.ok) {
          const err = await uResp.text();
          throw new Error(`Update failed: ${uResp.status} - ${err.substring(0, 200)}`);
        }

        const target = opts.experiment ? `experiment '${opts.experiment}'` : `app ${opts.app}`;
        console.log(`✅ Design system updated: ${opts.token} = ${opts.value}`);
        console.log(`   Target: ${target}`);
        }, { token: opts.token, value: opts.value });
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  // --- context ---
  designCmd.command('context')
    .description('Generate UX/UI design context document from a Value Proposition Canvas')
    .requiredOption('--vpc <file>', 'Path to Value Proposition Canvas markdown file')
    .option('-o, --output <file>', 'Output file path (default: design-context.md in same dir as VPC)')
    .action(async (opts) => {
      try {
        const vpcPath = path.resolve(opts.vpc);
        const outputPath = opts.output || path.join(path.dirname(vpcPath), 'design-context.md');

        // Read VPC
        const vpcContent = await fs.readFile(vpcPath, 'utf8');

        console.log(`═══ Design Context Generator ═══`);
        console.log(`VPC: ${vpcPath} (${vpcContent.length} bytes)`);
        console.log(`Output: ${outputPath}`);
        console.log('');
        console.log(DESIGN_CONTEXT_SYSTEM_PROMPT);
        console.log('');
        console.log('─── VALUE PROPOSITION CANVAS ───');
        console.log('');
        console.log(vpcContent);
        console.log('');
        console.log('─── INSTRUCTIONS ───');
        console.log('');
        console.log('You are the AI agent executing this command. Your task:');
        console.log('');
        console.log('1. Read the System Prompt (Senior Product Designer role) above');
        console.log('2. Read the Value Proposition Canvas above');
        console.log('3. Generate the full design context document following all 11 sections');
        console.log(`4. Save the output to: ${outputPath}`);
        console.log('');
        console.log('The output must be a complete, standalone markdown document ready for a UX/UI designer agent to consume.');
      } catch (e) {
        console.error('❌ Error:', e.message);
        process.exit(1);
      }
    });

  // --- design-md ---
  designCmd.command('design-md')
    .description('Generate DESIGN.md visual design system from a Design Context document')
    .requiredOption('--context <file>', 'Path to Design Context markdown file')
    .option('-o, --output <file>', 'Output file path (default: DESIGN.md in same dir as context)')
    .action(async (opts) => {
      try {
        const contextPath = path.resolve(opts.context);
        const outputPath = opts.output || path.join(path.dirname(contextPath), 'DESIGN.md');

        // Read Design Context
        const contextContent = await fs.readFile(contextPath, 'utf8');

        console.log(`═══ DESIGN.md Generator ═══`);
        console.log(`Context: ${contextPath} (${contextContent.length} bytes)`);
        console.log(`Output: ${outputPath}`);
        console.log('');
        console.log(DESIGN_MD_SYSTEM_PROMPT);
        console.log('');
        console.log('─── DESIGN CONTEXT ───');
        console.log('');
        console.log(contextContent);
        console.log('');
        console.log('─── INSTRUCTIONS ───');
        console.log('');
        console.log('You are the AI agent executing this command. Your task:');
        console.log('');
        console.log('1. Read the System Prompt (Senior UI/Visual Designer role) above');
        console.log('2. Read the Design Context above — it contains personas, principles, screens, flows, and emotional design maps');
        console.log('3. Generate a complete DESIGN.md with YAML frontmatter + 8 markdown sections');
        console.log(`4. Save the output to: ${outputPath}`);
        console.log('');
        console.log('The output must follow the Google Labs DESIGN.md spec. Every visual decision must be justified from the Design Context.');
      } catch (e) {
        console.error('❌ Error:', e.message);
        process.exit(1);
      }
    });

  // --- stitch-init ---
  designCmd.command('stitch-init')
    .description('Initialize a Stitch project from DESIGN.md and design-context.md')
    .requiredOption('--design-md <file>', 'Path to DESIGN.md file (visual design system with YAML tokens)')
    .requiredOption('--design-context <file>', 'Path to design-context.md file (UX/UI context)')
    .option('--stitch-key <key>', 'Stitch API key (or use STITCH_KEY env var)')
    .option('--app <id>', 'ZEA App ID for saving project reference')
    .action(async (opts) => {
      try {
        const designMdPath = path.resolve(opts.designMd);
        const contextPath = path.resolve(opts.designContext);
        const apiKey = opts.stitchKey || process.env.STITCH_KEY;

        if (!apiKey) {
          console.error('❌ Stitch API key required. Set STITCH_KEY env var or use --stitch-key.');
          process.exit(1);
        }

        // Read both files
        const designMd = await fs.readFile(designMdPath, 'utf8');
        const designContext = await fs.readFile(contextPath, 'utf8');

        console.log('═══ Stitch Project Initializer ═══');
        console.log('DESIGN.md: ' + designMdPath + ' (' + designMd.length + ' bytes)');
        console.log('Design Context: ' + contextPath + ' (' + designContext.length + ' bytes)');
        if (opts.app) console.log('ZEA App: ' + opts.app);
        console.log('');
        console.log(STITCH_INIT_SYSTEM_PROMPT);
        console.log('');
        console.log('─── DESIGN.md ───');
        console.log('');
        console.log(designMd);
        console.log('');
        console.log('─── DESIGN CONTEXT ───');
        console.log('');
        console.log(designContext);
        console.log('');
        console.log('─── INSTRUCTIONS ───');
        console.log('');
        console.log('You are the AI agent executing this command. Your task:');
        console.log('');
        console.log('1. Read the System Prompt (Stitch Agent role) above');
        console.log('2. Read the DESIGN.md above — it contains the YAML frontmatter with all design tokens');
        console.log('3. Read the Design Context above — it contains personas, screens, flows, and component specs');
        console.log('4. Connect to Stitch MCP at https://stitch.googleapis.com/mcp with your API key');
        console.log('5. Create a project, apply the design system, and create initial screens');
        if (opts.app) {
          console.log('6. Save the Stitch project ID with: zea memory init --app ' + opts.app + ' --stitch-project <project_id>');
        }
        console.log('');
        console.log('Your STITCH_KEY is: ' + apiKey.substring(0, 8) + '...');
      } catch (e) {
        console.error('❌ Error:', e.message);
        process.exit(1);
      }
    });
}
