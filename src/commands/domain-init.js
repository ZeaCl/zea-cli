import path from 'path';
import fs from 'fs/promises';

const ZEA_ROOT = path.resolve(import.meta.dirname, '../../..');

export function register() {
  // Este comando se registra como subcomando de 'domain' via domain.js
  // getDomainCommand() se usa en domain.js que ya fue registrado
}

export async function initDomain(domainName, opts = {}) {
  const domainDir = path.join(ZEA_ROOT, 'domains', domainName);
  const apiDir = opts.dir || path.join(ZEA_ROOT, `${domainName}-api`);

  // 1. Crear dominio: manifest.json
  await fs.mkdir(domainDir, { recursive: true });

  const manifest = {
    name: domainName,
    label: opts.label || domainName,
    api_prefix: opts.apiPrefix || domainName.substring(0, 2),
    api_port: opts.apiPort || 4085,
    app_id: opts.appId || domainName,
    app_url: `${domainName}.zea.localhost`,
    auth_required: true,
    entities: opts.entities || '',
    expert_types: ['db', 'api', 'screen', 'infra', 'builder', 'data-import']
  };

  await fs.writeFile(
    path.join(domainDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  );

  // 2. Generar api-catalog.json desde spec si existe
  const apiCatalog = {};
  if (opts.entities) {
    const entities = opts.entities.split(',').map(e => e.trim()).filter(Boolean);
    for (const entity of entities) {
      const entityPath = entity.replace(/_/g, '-');
      apiCatalog[`GET /${manifest.api_prefix}/${entityPath}`] = {
        description: `List ${entity}`,
        params: '?user_id=X',
        returns: `[{ id, ... }]`
      };
      apiCatalog[`POST /${manifest.api_prefix}/${entityPath}`] = {
        description: `Create ${entity}`,
        body: `{ ... }`,
        returns: `{ id, ... }`
      };
      apiCatalog[`GET /${manifest.api_prefix}/${entityPath}/:id`] = {
        description: `Get ${entity} by ID`,
        returns: `{ id, ... }`
      };
      apiCatalog[`PUT /${manifest.api_prefix}/${entityPath}/:id`] = {
        description: `Update ${entity}`,
        body: `{ ... }`,
        returns: `{ id, ... }`
      };
    }
  }

  apiCatalog[`GET /${manifest.api_prefix}/health`] = {
    description: 'Health check',
    returns: '{ status: "ok" }'
  };

  apiCatalog[`GET /${manifest.api_prefix}/dashboard`] = {
    description: 'Dashboard',
    params: '?user_id=X',
    returns: '{ ... }'
  };

  await fs.writeFile(
    path.join(domainDir, 'api-catalog.json'),
    JSON.stringify(apiCatalog, null, 2) + '\n'
  );

  // 3. Crear estructura de directorios de la API
  const dirs = [
    apiDir,
    path.join(apiDir, 'config'),
    path.join(apiDir, 'lib', `${domainName}_api`),
    path.join(apiDir, 'lib', domainName + '_api_web'),
    path.join(apiDir, 'lib', domainName + '_api_web', 'controllers'),
    path.join(apiDir, 'lib', domainName + '_api_web', 'plugs'),
    path.join(apiDir, 'test', 'unit', 'plugs'),
    path.join(apiDir, 'test', 'unit', 'controllers'),
    path.join(apiDir, 'test', 'integration'),
    path.join(apiDir, 'test', 'e2e'),
    path.join(apiDir, 'priv', 'repo', 'migrations')
  ];

  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true });
  }

  return {
    domainDir,
    apiDir,
    manifest
  };
}
