import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Use process.cwd() since tests run from project root but compiled output is in dist-test/
const manifestPath = join(process.cwd(), ".homeycompose", "app.json");

describe("App manifest (.homeycompose/app.json)", () => {
  let manifest: any;

  it("should exist and be valid JSON", () => {
    const raw = readFileSync(manifestPath, "utf-8");
    manifest = JSON.parse(raw);
    assert.ok(manifest, "Manifest should be a valid object");
  });

  it('should have id "se.adamnoren.tessie"', () => {
    const raw = readFileSync(manifestPath, "utf-8");
    const m = JSON.parse(raw);
    assert.strictEqual(m.id, "se.adamnoren.tessie");
  });

  it('should have compatibility ">=12.9.0"', () => {
    const raw = readFileSync(manifestPath, "utf-8");
    const m = JSON.parse(raw);
    assert.strictEqual(m.compatibility, ">=12.9.0");
  });

  it("should have sdk 3", () => {
    const raw = readFileSync(manifestPath, "utf-8");
    const m = JSON.parse(raw);
    assert.strictEqual(m.sdk, 3);
  });

  it('should have platforms ["local"]', () => {
    const raw = readFileSync(manifestPath, "utf-8");
    const m = JSON.parse(raw);
    assert.deepStrictEqual(m.platforms, ["local"]);
  });

  it('should have category array including "tools"', () => {
    const raw = readFileSync(manifestPath, "utf-8");
    const m = JSON.parse(raw);
    assert.ok(Array.isArray(m.category), "category should be an array");
    assert.ok(m.category.includes("tools"), 'category should include "tools"');
  });
});

describe("Driver compose (drivers/vehicle/driver.compose.json)", () => {
  const composePath = join(process.cwd(), "drivers", "vehicle", "driver.compose.json");
  const capabilitiesDir = join(process.cwd(), ".homeycompose", "capabilities");

  it("should list all capability JSON files in capabilities array", () => {
    const raw = readFileSync(composePath, "utf-8");
    const compose = JSON.parse(raw);
    const capabilities: string[] = compose.capabilities;

    // Get all capability IDs from .homeycompose/capabilities/*.json
    const capFiles = readdirSync(capabilitiesDir)
      .filter((f: string) => f.endsWith(".json"))
      .map((f: string) => f.replace(".json", ""));

    for (const cap of capFiles) {
      // Capabilities with dots (e.g. measure_temperature.inside) won't match file names directly
      // but custom capabilities should match their file name exactly
      assert.ok(
        capabilities.includes(cap),
        `Capability "${cap}" has a JSON file but is not listed in driver.compose.json capabilities`,
      );
    }
  });

  it("should include all 9 control capabilities", () => {
    const raw = readFileSync(composePath, "utf-8");
    const compose = JSON.parse(raw);
    const capabilities: string[] = compose.capabilities;

    const controlCapabilities = [
      "charge_limit",
      "charging_amps",
      "target_temperature",
      "climate_onoff",
      "sentry_mode",
      "charge_port",
      "trunk",
      "frunk",
      "charging_control",
    ];

    for (const cap of controlCapabilities) {
      assert.ok(
        capabilities.includes(cap),
        `Control capability "${cap}" should be in driver.compose.json`,
      );
    }
  });
});

describe("package.json", () => {
  it('should have a "test" script', () => {
    const pkgPath = join(process.cwd(), "package.json");
    const raw = readFileSync(pkgPath, "utf-8");
    const pkg = JSON.parse(raw);
    assert.ok(
      pkg.scripts && pkg.scripts.test,
      "package.json should have a test script",
    );
  });
});
