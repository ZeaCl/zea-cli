import zeaFetch from '../lib/http.js';
import { getClient } from '../client.js';
import path from 'path';
import fs from 'fs/promises';
import { initDomain } from './domain-init.js';
import { scaffoldLayer, getLayers } from './domain-scaffold.js';

let domainCommand = null;

export function getDomainCommand() {
  return domainCommand;
}

export function register(program) {
  const domain = program.command('domain').description('Domain management commands');
  domainCommand = domain;

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

  // ── domain init ───────────────────────────────────────
  domain.command('init <name>')
    .description('Initialize a new ZEA domain (creates manifest + directory structure)')
    .option('--spec <path>', 'Path to Open Spec requirements.md')
    .option('--design-spec <path>', 'Path to design.md (for ERD entity detection)')
    .option('--label <label>', 'Human-readable domain label')
    .option('--api-prefix <prefix>', 'API URL prefix (e.g. nt, pp, sp)')
    .option('--api-port <port>', 'API port number', '4085')
    .option('--app-id <id>', 'ZEA app ID')
    .option('--entities <list>', 'Comma-separated entity names (e.g. profiles,meals,daily_records)')
    .option('--yes', 'Auto-accept all detected entities without prompting')
    .option('--dir <path>', 'API project directory (default: auto-detect)')
    .action(async (name, opts) => {
      try {
        let entitiesFromErd = [];
        let entitiesFromReq = [];

        // ── Source 1: Parse design.md ERD ──
        if (opts.designSpec || opts.spec) {
          const specPath = opts.designSpec || opts.spec.replace(/requirements\.md$/, 'design.md');
          try {
            const designContent = await fs.readFile(specPath, 'utf8');
            // Extract ERD table names from mermaid block
            const erdMatch = designContent.match(/```mermaid[\s\S]*?erDiagram[\s\S]*?```/);
            if (!erdMatch) {
              // Fallback: try any mermaid block with table definitions
              const allMermaid = designContent.match(/```mermaid[\s\S]*?```/g);
              if (allMermaid) {
                for (const block of allMermaid) {
                  if (block.match(/\s+\w+\s*\{[^}]*\}/)) {
                    const tableNames = block.match(/\s+(\w+)\s*\{/g);
                    if (tableNames) {
                      entitiesFromErd = tableNames
                        .map(t => t.trim().replace(/\s*\{/, '').toLowerCase())
                        .filter(n => n !== 'users' && n !== 'organizations');
                      break;
                    }
                  }
                }
              }
            } else {
              const tableNames = erdMatch[0].match(/\s+(\w+)\s*\{/g);
              if (tableNames) {
                entitiesFromErd = tableNames
                  .map(t => t.trim().replace(/\s*\{/, '').toLowerCase())
                  .filter(n => n !== 'users' && n !== 'organizations');
              }
            }
          } catch (e) {
            console.log(`⚠️  Could not parse design spec: ${e.message}`);
          }
        }

        // ── Source 2: Parse requirements.md for entity hints ──
        if (opts.spec) {
          try {
            const reqContent = await fs.readFile(opts.spec, 'utf8');
            // Look for patterns like "Pantalla de Perfil", "Objetivos / Tipo de Dieta", "Mi Suscripción"
            const screenPattern = /###\s+Requirement\s+\d+:\s*(.+)/gi;
            const entityMap = {
              'perfil': 'profiles',
              'objetivo': 'goals',
              'objetivos': 'goals',
              'dieta': 'goals',
              'suscripción': 'subscriptions',
              'suscripcion': 'subscriptions',
              'notificaci': 'notification_settings',
              'notificacion': 'notification_settings',
              'hidratación': 'hydration_records',
              'hidratacion': 'hydration_records',
              'progreso': 'progress_metrics',
              'preferencia': 'diet_preferences',
              'actividad física': 'activity_log',
              'actividad fisica': 'activity_log'
            };

            let match;
            while ((match = screenPattern.exec(reqContent)) !== null) {
              const title = match[1].toLowerCase();
              for (const [keyword, entity] of Object.entries(entityMap)) {
                if (title.includes(keyword) && !entitiesFromErd.includes(entity)) {
                  entitiesFromReq.push(entity);
                }
              }
            }
            // Deduplicate
            entitiesFromReq = [...new Set(entitiesFromReq)];
          } catch (e) {
            console.log(`⚠️  Could not parse requirements: ${e.message}`);
          }
        }

        // ── Merge all sources ──
        let entities = opts.entities ? opts.entities.split(',').map(e => e.trim()) : [];
        let allDetected = [...new Set([...entitiesFromErd, ...entitiesFromReq])];

        // Remove entities already in --entities
        const missing = allDetected.filter(e => !entities.includes(e));

        if (missing.length > 0) {
          console.log(`\n🔍 Detected ${entitiesFromErd.length} entities from design.md ERD`);
          if (entitiesFromReq.length > 0) {
            console.log(`🔍 Detected ${entitiesFromReq.length} additional entities from requirements.md`);
          }
          console.log('');

          if (entities.length > 0) {
            console.log(`   Already specified: ${entities.join(', ')}`);
          }

          console.log(`   Also found: ${missing.join(', ')}`);

          if (opts.yes) {
            entities = [...entities, ...missing];
            console.log('   ✅ Auto-added (--yes)\n');
          } else {
            // In non-interactive mode, just warn and proceed with what we have
            console.log('   ⚠️  Add --yes to include them, or pass --entities manually\n');
          }
        }

        // Parse app_id from spec if available
        if (opts.spec && !opts.appId) {
          try {
            const specContent = await fs.readFile(opts.spec, 'utf8');
            const appMatch = specContent.match(/app_id.*?["'](\w+)["']/);
            if (appMatch) opts.appId = appMatch[1];
          } catch {}
        }

        const result = await initDomain(name, {
          label: opts.label || name,
          apiPrefix: opts.apiPrefix || name.substring(0, 2),
          apiPort: parseInt(opts.apiPort) || 4085,
          appId: opts.appId || name,
          entities: entities.join(',') || opts.entities || '',
          dir: opts.dir
        });

        console.log(`✅ Domain '${name}' initialized:`);
        console.log(`   ${result.domainDir}/manifest.json`);
        console.log(`   ${result.domainDir}/api-catalog.json`);
        console.log(`   ${result.apiDir}/ (API project structure)`);
        console.log('');

        const finalEntities = entities.join(',') || opts.entities || entitiesFromErd.join(',');
        if (finalEntities) {
          console.log(`   Entities: ${finalEntities}`);
        } else {
          console.log(`   ⚠️  No entities. Add with --entities or --spec`);
        }
        console.log('');
        console.log('Next steps:');
        console.log(`   zea domain scaffold ${name} --layer tests    # Generate tests FIRST (TDD)`);
        console.log(`   zea domain scaffold ${name} --layer api      # Generate API code`);
        console.log(`   zea domain scaffold ${name} --layer db       # Generate DB schema + RLS`);
        console.log(`   zea domain pipeline ${name}                   # Validate everything`);
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  // ── domain scaffold ───────────────────────────────────
  domain.command('scaffold <name>')
    .description('Generate code for a domain layer (TDD-first: tests → api → db → cli → docker)')
    .requiredOption('--layer <layer>', `Layer to scaffold: ${getLayers().join(', ')}`)
    .option('--dir <path>', 'API project directory (default: auto-detect)')
    .action(async (name, opts) => {
      try {
        const ZEA_ROOT = path.resolve(import.meta.dirname, '../../..');
        const apiDir = opts.dir || path.join(ZEA_ROOT, `${name}-api`);
        const manifestPath = path.join(ZEA_ROOT, 'domains', name, 'manifest.json');

        let manifest = {};
        try {
          manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
        } catch {
          console.log(`⚠️  manifest.json not found at ${manifestPath} — using defaults`);
        }

        const catalog = { manifest };

        const result = await scaffoldLayer(name, opts.layer, apiDir, catalog);
        console.log(`✅ Scaffolded layer '${opts.layer}' for domain '${name}'`);

        if (opts.layer === 'tests' && result.entities) {
          console.log(`   Generated tests for ${result.entities.length} entities:`);
          console.log(`   - test/unit/plugs/ (jwt_auth, scoping)`);
          console.log(`   - test/unit/controllers/ (health)`);
          console.log(`   - test/integration/ (${result.entities.length} entity tests)`);
          console.log(`   - test/e2e/ (full flow)`);
        }

        if (opts.layer === 'api') {
          console.log(`   - mix.exs, config/config.exs`);
          console.log(`   - lib/ (application, repo, endpoint, router, controller, plugs)`);
        }

        if (opts.layer === 'db') {
          console.log(`   - init-nutrition.sql (schema + RLS)`);
        }
      } catch (e) {
        console.error('Error:', e.message);
      }
    });
}
