'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const manifestPath = join(__dirname, '..', '.homeycompose', 'app.json');

describe('App manifest (.homeycompose/app.json)', () => {
  let manifest;

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
    const pkgPath = join(__dirname, '..', 'package.json');
    const raw = readFileSync(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw);
    assert.ok(pkg.scripts && pkg.scripts.test, 'package.json should have a test script');
  });
});
