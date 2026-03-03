---
phase: quick
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - tsconfig.json
  - package.json
  - .gitignore
  - .homeyignore
  - app.ts
  - lib/tessie-client.ts
  - tests/manifest.test.ts
  - tests/tessie-client.test.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "All source files are TypeScript (.ts)"
    - "TypeScript compiles to JavaScript without errors"
    - "All existing tests pass after conversion"
    - "Homey runtime can still load the compiled app.js entry point"
  artifacts:
    - path: "tsconfig.json"
      provides: "TypeScript compiler configuration"
      contains: "compilerOptions"
    - path: "app.ts"
      provides: "Main app entry point in TypeScript"
      contains: "class TessieApp"
    - path: "lib/tessie-client.ts"
      provides: "Tessie API client in TypeScript"
      contains: "class TessieClient"
  key_links:
    - from: "tsconfig.json"
      to: "app.ts, lib/tessie-client.ts"
      via: "TypeScript compilation"
      pattern: "outDir"
    - from: "package.json"
      to: "tsconfig.json"
      via: "build and test scripts"
      pattern: "tsc"
---

<objective>
Convert the project from JavaScript to TypeScript. The project currently has 4 JS files: app.js, lib/tessie-client.js, tests/manifest.test.js, and tests/tessie-client.test.js. All should be converted to TypeScript with proper type annotations, a tsconfig.json, and a build step that compiles TS to JS for the Homey runtime.

Purpose: TypeScript provides type safety, better IDE support, and catches errors at compile time -- critical for a project that will grow to include device drivers, flow cards, and WebSocket streaming.
Output: Fully TypeScript project with working build and test pipeline.
</objective>

<execution_context>
@/Users/adamnoren/.claude/get-shit-done/workflows/execute-plan.md
@/Users/adamnoren/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md

Source files to convert:
- app.js (13 lines - Homey.App subclass)
- lib/tessie-client.js (66 lines - HTTPS client class)
- tests/manifest.test.js (59 lines - manifest validation tests)
- tests/tessie-client.test.js (245 lines - client unit tests with mocks)

<interfaces>
<!-- Homey SDK types already installed as homey-apps-sdk-v3-types -->

From node_modules/homey-apps-sdk-v3-types/lib/App.d.ts:
```typescript
declare class App extends SimpleClass {
    homey: Homey;
    manifest: any;
    id: string;
    sdk: number;
    onInit(): Promise<void>;
    onUninit(): Promise<void>;
}
```

From node_modules/homey-apps-sdk-v3-types/homey.d.ts:
```typescript
export const env: any;
export const manifest: any;
export { App, Device, Driver, /* ... many more */ };
```

Note: The SDK types use `import X = require()` pattern (CommonJS-compatible declarations).
The Homey runtime expects `app.js` as the entry point (configured in package.json "main" field).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Set up TypeScript infrastructure</name>
  <files>tsconfig.json, package.json, .gitignore, .homeyignore</files>
  <action>
1. Install typescript as a devDependency: `npm install --save-dev typescript`

2. Create tsconfig.json at project root:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "types": ["node", "homey-apps-sdk-v3-types"]
  },
  "include": ["app.ts", "lib/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

Key choices:
- `outDir: "./dist"` -- compiled JS goes to dist/, keeping source tree clean
- `module: "commonjs"` -- Homey runtime requires CommonJS
- `target: "ES2020"` -- matches Homey Pro's Node.js version
- `strict: true` -- full type safety from the start
- Tests excluded from tsconfig (they run directly via tsx/ts-node or a separate config)

3. Create tsconfig.test.json for test compilation:
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist-test",
    "rootDir": "."
  },
  "include": ["app.ts", "lib/**/*.ts", "tests/**/*.ts"]
}
```

4. Update package.json:
- Change `"main"` from `"app.js"` to `"dist/app.js"`
- Add scripts:
  - `"build": "tsc"`
  - `"test": "tsc -p tsconfig.test.json && node --test 'dist-test/tests/*.test.js'"`
  - `"pretest": "npm run build"`
- Keep existing devDependencies, add typescript

5. Update .gitignore -- add:
```
dist/
dist-test/
```

6. Update .homeyignore -- add:
```
*.ts
tsconfig.json
tsconfig.test.json
dist-test/
```
This ensures Homey only packages the compiled dist/ output, not source .ts files.
  </action>
  <verify>
    <automated>cd /Users/adamnoren/se.adamnoren.tessie && npx tsc --version && cat tsconfig.json | node -e "JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log('tsconfig.json is valid JSON')"</automated>
  </verify>
  <done>tsconfig.json exists with correct settings, package.json has build/test scripts pointing at dist/, typescript is installed, .gitignore and .homeyignore updated</done>
</task>

<task type="auto">
  <name>Task 2: Convert source and test files to TypeScript</name>
  <files>app.ts, lib/tessie-client.ts, tests/manifest.test.ts, tests/tessie-client.test.ts</files>
  <action>
1. Convert lib/tessie-client.js to lib/tessie-client.ts:
- Replace `const https = require('node:https')` with `import https from 'node:https'`
- Remove `'use strict'` (TypeScript modules are strict by default)
- Add proper types to constructor (`token: string`), class properties (`token: string`, `baseUrl: string`), method params (`path: string, method: string = 'GET'`), and return types (`Promise<any>` for request, `Promise<any[]>` for getVehicles, etc.)
- Type the https.request callback: `res` as `http.IncomingMessage`
- Add `export default TessieClient` instead of `module.exports = TessieClient`
- Remove the `module.exports` line
- The `node:https` import works because `esModuleInterop` is enabled

2. Convert app.js to app.ts:
- Replace `const Homey = require('homey')` with `import Homey from 'homey'`
- Remove `'use strict'`
- Class already extends `Homey.App` which is typed
- Add return type to `onInit(): Promise<void>`
- Replace `module.exports = TessieApp` with `export default TessieApp`
- NOTE: The Homey types use `export =` pattern. With `esModuleInterop`, `import Homey from 'homey'` works. If the compiler complains, use `import Homey = require('homey')` instead.

3. Convert tests/manifest.test.ts:
- Replace `require` with ESM-style imports: `import { describe, it } from 'node:test'`, `import assert from 'node:assert/strict'`, `import { readFileSync } from 'node:fs'`, `import { join } from 'node:path'`
- Add `import { fileURLToPath } from 'node:url'` if needed for __dirname, OR since we compile to CommonJS, __dirname is available
- Since tsconfig targets CommonJS output, `__dirname` will work in the compiled output
- Type the manifest variable: `let manifest: any`
- No other type changes needed -- test code is mostly assertions

4. Convert tests/tessie-client.test.ts:
- Replace all `require` with `import` statements
- Import TessieClient: `import TessieClient from '../lib/tessie-client'`
- Type the mock helpers:
  - `createMockResponse(statusCode: number, body: string | object): EventEmitter & { statusCode: number }`
  - `createMockRequest(): EventEmitter & { end: () => void }`
- Type `capturedOptions` as `https.RequestOptions | null`
- The `originalRequest` variable should be typed as the original https.request type
- For the monkey-patching of `https.request`: cast as needed with `(https as any).request = ...` since TypeScript will not allow direct reassignment of a module export. This is test-only code for mocking.
- Type `let TessieClient: any` in the describe block since it's dynamically required -- actually, since we're converting to TS imports, restructure: import TessieClient at the top level instead of dynamic require in beforeEach. Remove the `delete require.cache` pattern; it's not needed when importing statically.

5. Delete the original .js source files: app.js, lib/tessie-client.js, tests/manifest.test.js, tests/tessie-client.test.js

IMPORTANT: After conversion, run `npm run build` to verify compilation succeeds, then `npm test` to verify all tests pass. Fix any type errors that arise.
  </action>
  <verify>
    <automated>cd /Users/adamnoren/se.adamnoren.tessie && npm run build && npm test</automated>
  </verify>
  <done>All .js source files replaced with .ts equivalents, `npm run build` compiles without errors, `npm test` passes all existing tests, no .js source files remain in app.ts/lib/tests directories (only compiled output in dist/)</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` -- type checking passes with zero errors
2. `npm run build` -- compiles all source to dist/
3. `npm test` -- all existing tests pass
4. `ls app.js lib/tessie-client.js tests/*.test.js 2>/dev/null` -- no JS source files remain (only .ts)
5. `ls dist/app.js dist/lib/tessie-client.js` -- compiled output exists
6. `cat package.json | grep '"main"'` -- points to dist/app.js
</verification>

<success_criteria>
- Zero TypeScript compilation errors
- All 12+ existing test cases pass
- No JavaScript source files remain (only TypeScript source + compiled JS in dist/)
- package.json main points to dist/app.js for Homey runtime compatibility
- Type annotations on all public APIs (TessieClient constructor, methods, return types)
</success_criteria>

<output>
After completion, create `.planning/quick/1-project-should-be-typescript/1-SUMMARY.md`
</output>
