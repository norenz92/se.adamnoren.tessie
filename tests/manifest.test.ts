import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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

  it('should have id "com.adamnoren.tessie"', () => {
    const raw = readFileSync(manifestPath, "utf-8");
    const m = JSON.parse(raw);
    assert.strictEqual(m.id, "com.adamnoren.tessie");
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

describe("Driver compose (drivers/car/driver.compose.json)", () => {
  const composePath = join(process.cwd(), "drivers", "car", "driver.compose.json");
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

describe("Capability icons", () => {
  const capabilitiesDir = join(process.cwd(), ".homeycompose", "capabilities");
  for (const file of readdirSync(capabilitiesDir).filter((f: string) => f.endsWith(".json"))) {
    it(`${file} has an existing SVG icon`, () => {
      const cap = JSON.parse(readFileSync(join(capabilitiesDir, file), "utf-8"));
      assert.ok(typeof cap.icon === "string" && cap.icon.endsWith(".svg"), `${file} has no icon`);
      assert.ok(existsSync(join(process.cwd(), cap.icon)), `${file} icon ${cap.icon} does not exist`);
    });
  }
});

describe("Icon SVGs", () => {
  // The Homey app renders icons as filled shapes and ignores strokes, so every icon must be outlined fills
  const dirs = ["assets", "assets/capabilities", "drivers/car/assets", "drivers/car/assets/icons"];
  for (const dir of dirs) {
    for (const file of readdirSync(join(process.cwd(), dir)).filter((f: string) => f.endsWith(".svg"))) {
      it(`${dir}/${file} uses fills only`, () => {
        const svg = readFileSync(join(process.cwd(), dir, file), "utf-8");
        assert.ok(!/stroke(-width)?=/.test(svg), `${dir}/${file} contains strokes; outline them`);
        assert.ok(!/fill="none"/.test(svg), `${dir}/${file} has unfilled shapes`);
      });
    }
  }
});
