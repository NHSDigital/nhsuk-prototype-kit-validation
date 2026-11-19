#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

// INIT_CWD is set by npm to the directory where `npm install` was run.
// process.cwd() in a postinstall script points to the package's own directory
// inside node_modules — NOT the consumer's project root.
const CWD = process.env.INIT_CWD || process.cwd();
const PKG_ROOT = path.join(__dirname, "..");

function log(msg) {
  process.stdout.write(msg + "\n");
}

function copyMacro() {
  const dest = path.join(CWD, "app", "views", "macros", "validation.njk");
  const src = path.join(PKG_ROOT, "macros", "validation.njk");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  log("✓ Macro copied to app/views/macros/validation.njk");
}

log("\nnhsuk-prototype-kit-validation\n");
copyMacro();
log(`
Next, wire it up manually:

  app/routes.js — add before module.exports:

    const { createValidationMiddleware } = require('nhsuk-prototype-kit-validation');
    router.use(createValidationMiddleware());

  app/views/layouts.html — add with your other macro imports:

    {% from "macros/validation.njk" import applyValidation, applyGroupValidation %}

To add example pages and docs, run:

  node node_modules/nhsuk-prototype-kit-validation/scripts/setup.js
`);

