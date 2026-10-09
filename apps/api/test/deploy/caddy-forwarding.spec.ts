import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('production proxy contract', () => {
  it('uses host Caddy and loopback-only upstreams', () => {
    const config = readFileSync(
      resolve(__dirname, '../../../../deploy/production/Caddyfile.example'),
      'utf8',
    );
    const compose = readFileSync(
      resolve(__dirname, '../../../../deploy/production/docker-compose.prod.yml'),
      'utf8',
    );

    expect(config).toContain('{$API_HOST:app.agrolens.rgw.app}');
    expect(config).toContain('@readiness path /api/health/ready /api/health/ready/');
    expect(config).toContain('respond @readiness 404');
    expect(config).toContain('{$S3_ADDRESS:s3.agrolens.rgw.app}');
    expect(config).toContain('reverse_proxy 127.0.0.1:3000');
    expect(config).toContain('reverse_proxy 127.0.0.1:3900');
    // Caddy preserves Host by default; overriding it can drop the signed S3 port.
    expect(config).not.toMatch(/^\s*header_up\s+[-+]?Host\b/im);
    expect(config).toContain('path_regexp ^/[^/]+/staging/uploads/');
    expect(config).toContain('max_size 104857600');
    expect(config).toContain('path_regexp ^/[^/]+/inference/');
    expect(config).toContain('max_size 26214400');
    expect(config).toContain('max_size 524288000');
    expect(compose).toContain('127.0.0.1:3000:3000');
    expect(compose).toContain('127.0.0.1:3900:3900');
    expect(compose).toContain('${API_PREFIX}/health/ready');
    expect(compose).not.toContain('nginx');
  });
});
