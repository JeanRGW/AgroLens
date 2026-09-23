import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { envSchema, envSchemaShape, maskPlaceholderSecrets } from '../src/config/env.schema';

export const composeBackendServices = {
  development: ['api'],
  production: ['backend'],
} as const;

const schemaKeys = Object.keys(envSchemaShape.shape);
const externallyOwned = new Set(['INFERENCE_MODEL_DOWNLOAD_ORIGINS']);
const exampleOnly = new Set([
  'ADMIN_EMAIL',
  'ADMIN_PASSWORD',
  'ADMIN_FULL_NAME',
  'ADMIN_PHONE',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'POSTGRES_DB',
  'GARAGE_RPC_SECRET',
  'GARAGE_ADMIN_TOKEN',
  'GARAGE_METRICS_TOKEN',
  'S3_APP_ACCESS_KEY',
  'S3_APP_SECRET_KEY',
]);
const exampleAliases = new Map([
  ['S3_ACCESS_KEY', 'S3_APP_ACCESS_KEY'],
  ['S3_SECRET_KEY', 'S3_APP_SECRET_KEY'],
]);

function exampleKeys(path: string): Set<string> {
  return new Set(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.match(/^\s*([A-Z][A-Z0-9_]*)=/)?.[1])
      .filter((key): key is string => Boolean(key)),
  );
}

function composeConfig(file: string, example: string): Record<string, any> {
  const output = execFileSync(
    'docker',
    ['compose', '-f', file, '--env-file', example, 'config', '--format', 'json'],
    {
      encoding: 'utf8',
    },
  );
  return JSON.parse(output);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function validateExample(name: string, keys: Set<string>): void {
  for (const key of schemaKeys) {
    assert(
      keys.has(key) || (exampleAliases.get(key) && keys.has(exampleAliases.get(key)!)),
      `${name} is missing schema variable ${key}`,
    );
  }
  for (const key of keys) {
    assert(
      schemaKeys.includes(key) || exampleOnly.has(key) || externallyOwned.has(key),
      `${name} contains unknown variable ${key}`,
    );
  }
}

/**
 * .env.example files intentionally document secrets with placeholder values
 * (CHANGE_ME_* etc.); operators replace them when creating .env. The drift
 * check verifies key coverage and types, not secret strength, so substitute a
 * schema-valid stand-in before validating the resolved compose environment.
 * Shared with the inline CI validation (ci.yml) via env.schema.maskPlaceholderSecrets.
 */
function validateCompose(
  name: string,
  config: Record<string, any>,
  services: readonly string[],
): void {
  for (const service of services) {
    const environment = config.services?.[service]?.environment;
    assert(environment, `${name} is missing environment for ${service}`);
    const unknown = Object.keys(environment).filter((key) => !schemaKeys.includes(key));
    assert(
      unknown.length === 0,
      `${name} ${service} contains unknown variables: ${unknown.join(', ')}`,
    );
    const result = envSchema.safeParse(maskPlaceholderSecrets(environment));
    if (!result.success) {
      throw new Error(`${name} ${service} does not satisfy env.schema: ${result.error.message}`);
    }
  }
}

export function validateConfiguration(root = resolve(__dirname, '../../..')): void {
  const backend = resolve(root, 'apps/api');
  const production = resolve(root, 'deploy/production');
  const deploy = resolve(root, 'deploy');
  validateExample('apps/api/.env.example', exampleKeys(resolve(backend, '.env.example')));
  validateExample(
    'deploy/production/.env.example',
    exampleKeys(resolve(production, '.env.example')),
  );
  validateCompose(
    'deploy/docker-compose.dev.yml',
    composeConfig(
      resolve(deploy, 'docker-compose.dev.yml'),
      resolve(backend, '.env.example'),
    ),
    composeBackendServices.development,
  );
  validateCompose(
    'deploy/production/docker-compose.prod.yml',
    composeConfig(
      resolve(production, 'docker-compose.prod.yml'),
      resolve(production, '.env.example'),
    ),
    composeBackendServices.production,
  );
}

if (require.main === module) {
  try {
    validateConfiguration();
    console.log('Environment and Compose configuration are consistent.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
