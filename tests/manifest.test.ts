import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Use process.cwd() since tests run from project root but compiled output is in dist-test/
const manifestPath = join(process.cwd(), '.homeycompose', 'app.json');

describe('App manifest (.homeycompose/app.json)', () => {
  let manifest: any;

  it('should exist and be valid JSON', () => {
    const raw = readFileSync(manifestPath, 'utf-8');
    manifest = JSON.parse(raw);
    assert.ok(manifest, 'Manifest should be a valid object');
  });

  it('should have id "se.adamnoren.tessie"', () => {
    const raw = readFileSync(manifestPath, 'utf-8');
    const m = JSON.parse(raw);
    assert.strictEqual(m.id, 'se.adamnoren.tessie');
  });

  it('should have compatibility ">=12.9.0"', () => {
    const raw = readFileSync(manifestPath, 'utf-8');
    const m = JSON.parse(raw);
    assert.strictEqual(m.compatibility, '>=12.9.0');
  });

  it('should have sdk 3', () => {
    const raw = readFileSync(manifestPath, 'utf-8');
    const m = JSON.parse(raw);
    assert.strictEqual(m.sdk, 3);
  });

  it('should have platforms ["local"]', () => {
    const raw = readFileSync(manifestPath, 'utf-8');
    const m = JSON.parse(raw);
    assert.deepStrictEqual(m.platforms, ['local']);
  });

  it('should have category array including "cars"', () => {
    const raw = readFileSync(manifestPath, 'utf-8');
    const m = JSON.parse(raw);
    assert.ok(Array.isArray(m.category), 'category should be an array');
    assert.ok(m.category.includes('cars'), 'category should include "cars"');
  });
});

describe('package.json', () => {
  it('should have a "test" script', () => {
    const pkgPath = join(process.cwd(), 'package.json');
    const raw = readFileSync(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw);
    assert.ok(pkg.scripts && pkg.scripts.test, 'package.json should have a test script');
  });
});
