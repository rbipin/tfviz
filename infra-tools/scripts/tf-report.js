#!/usr/bin/env node
// tf-report.js — Shim that delegates to the compiled TypeScript entry point.
// Source is in ../src/cli.ts; compiled output is at ../dist/cli.js.
// Run `npm run build` in the parent directory to (re)compile before using.
require('../dist/cli.js');
