#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const MIN_NODE = [22, 12];

const USAGE = `Usage: node setup-testing.mjs [project-dir] [--dry-run] [--migrate] [--browsers] [--print <template>]

Sets up Vitest with coverage, Playwright, ESLint with test-quality rules, commitlint
with a commit-msg hook, and Claude Code deny rules for .env files. An existing unit or
E2E test framework is kept and only gets its ESLint rules, unless --migrate is passed.
Existing configs are never overwritten.

  --dry-run           Show what would change, without changing anything.
  --migrate           Install Vitest and Playwright even when another framework exists,
                      so the existing tests can be ported to them.
  --browsers          Also download the Playwright browsers (several hundred MB).
  --print <template>  Print a config template and exit, for merging by hand:
                      eslint, vitest, playwright, commitlint, commit-msg, claude-settings.`;

const PACKAGE_MANAGERS = {
  npm: { add: "npm install --save-dev", exec: "npx --no --" },
  pnpm: { add: "pnpm add -D", exec: "pnpm exec" },
  yarn: { add: "yarn add -D", exec: "yarn" },
  bun: { add: "bun add -d", exec: "bunx" },
};
const LOCKFILES = [
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
  ["package-lock.json", "npm"],
];

const OTHER_UNIT_RUNNERS = ["mocha", "ava", "jasmine", "uvu", "tap"];
const OTHER_E2E_RUNNERS = ["webdriverio", "@wdio/cli", "testcafe", "nightwatch"];

const CONFIG_PATTERNS = {
  vitest: /^vitest\.config\.[cm]?[jt]s$/,
  vite: /^vite\.config\.[cm]?[jt]s$/,
  playwright: /^playwright\.config\.[cm]?[jt]s$/,
  eslint: /^eslint\.config\.[cm]?[jt]s$/,
  eslintLegacy: /^\.eslintrc(\.(js|cjs|json|ya?ml))?$/,
  commitlint: /^(commitlint\.config\.[cm]?[jt]s|\.commitlintrc(\..+)?)$/,
  otherHookManager: /^(\.?lefthook(-local)?\.(yml|yaml|json|toml)|\.simple-git-hooks\.(c?js|json))$/,
};

const ENV_DENY_RULES = [
  "Read(**/.env)",
  "Read(**/.env.local)",
  "Read(**/.env.*.local)",
  "Read(**/.env.development)",
  "Read(**/.env.staging)",
  "Read(**/.env.production)",
];
const CLAUDE_SETTINGS = join(".claude", "settings.json");

function claudeSettingsTemplate() {
  return `${JSON.stringify({ permissions: { deny: ENV_DENY_RULES } }, null, 2)}\n`;
}

const NPM_INIT_PLACEHOLDER =/^echo "Error: no test specified" && exit 1$/;

function scriptsFor({ unit, e2e }) {
  return {
    ...(unit.name === "vitest" && { test: "vitest run", "test:coverage": "vitest run --coverage" }),
    ...(unit.name === "jest" && { test: "jest", "test:coverage": "jest --coverage" }),
    ...(e2e.name === "playwright" && { "test:e2e": "playwright test" }),
    ...(e2e.name === "cypress" && { "test:e2e": "cypress run" }),
    lint: "eslint .",
    prepare: "husky",
  };
}

function eslintTemplate({ typescript, unit, e2e }) {
  const e2eFiles = { playwright: "e2e", cypress: "cypress" }[e2e.name];
  const usesMatchers = e2e.name === "playwright" || unit.name === "vitest" || unit.name === "jest";
  const extensions = "{js,mjs,cjs,jsx,ts,mts,cts,tsx}";

  const imports = [
    "import js from '@eslint/js';",
    typescript && "import tseslint from 'typescript-eslint';",
    "import globals from 'globals';",
    e2e.name === "playwright" && "import playwright from 'eslint-plugin-playwright';",
    e2e.name === "cypress" && "import cypress from 'eslint-plugin-cypress';",
    unit.name === "vitest" && "import vitest from '@vitest/eslint-plugin';",
    unit.name === "jest" && "import jest from 'eslint-plugin-jest';",
    "import { defineConfig, globalIgnores } from 'eslint/config';",
  ];

  const constants = [
    e2eFiles && `const E2E_FILES = ['${e2eFiles}/**/*.${extensions}'];`,
    `const UNIT_TEST_FILES = ['**/*.{test,spec}.${extensions}'];`,
    usesMatchers &&
      `
const WEAK_MATCHERS = {
  toBeTruthy: 'Assert the specific value the code should produce.',
  toBeFalsy: 'Assert the specific value the code should produce.',
  toBeDefined: 'Assert the specific value the code should produce.',
  toMatchSnapshot: 'Check that the snapshot baseline is correct, not just recorded.',
  toMatchInlineSnapshot: 'Check that the snapshot baseline is correct, not just recorded.',
};`,
    `
const TAUTOLOGIES = [
  'error',
  {
    selector: "CallExpression[callee.name='expect'][arguments.0.type='Literal']",
    message: 'expect() received a constant. Pass the value under test.',
  },
  {
    selector:
      "CallExpression[callee.property.name='catch'][arguments.0.body.type='BlockStatement'][arguments.0.body.body.length=0]",
    message: 'An empty .catch() swallows failures, so the test cannot fail.',
  },
];`,
  ];

  const ignores = ["dist", "build", "coverage", "playwright-report", "test-results", "cypress/videos", "cypress/screenshots"];
  const e2eBlock = {
    playwright: `  {
    files: E2E_FILES,
    extends: [playwright.configs['flat/recommended']],
    rules: {
      'playwright/expect-expect': 'error',
      'playwright/no-conditional-expect': 'error',
      'playwright/no-conditional-in-test': 'error',
      'playwright/no-wait-for-timeout': 'error',
      'playwright/no-raw-locators': 'warn',
      'playwright/no-restricted-matchers': ['warn', WEAK_MATCHERS],
      'no-restricted-syntax': TAUTOLOGIES,
    },
  },`,
    cypress: `  {
    files: E2E_FILES,
    extends: [cypress.configs.recommended],
    rules: {
      'cypress/no-pause': 'error',
      'cypress/no-force': 'warn',
      'cypress/no-xpath': 'warn',
      'cypress/require-data-selectors': 'warn',
      'cypress/assertion-before-screenshot': 'warn',
      'no-restricted-syntax': TAUTOLOGIES,
    },
  },`,
  }[e2e.name];
  const unitRules = {
    vitest: `    extends: [vitest.configs.recommended],
    rules: {
      'vitest/no-conditional-in-test': 'error',
      'vitest/no-restricted-matchers': ['warn', WEAK_MATCHERS],
      'no-restricted-syntax': TAUTOLOGIES,
    },`,
    jest: `    extends: [jest.configs['flat/recommended']],
    rules: {
      'jest/expect-expect': 'error',
      'jest/no-conditional-in-test': 'error',
      'jest/no-restricted-matchers': ['warn', WEAK_MATCHERS],
      'no-restricted-syntax': TAUTOLOGIES,
    },`,
  }[unit.name] ?? `    rules: {
      'no-restricted-syntax': TAUTOLOGIES,
    },`;

  return `${imports.filter(Boolean).join("\n")}

${constants.filter(Boolean).join("\n").trim()}

export default defineConfig([
  globalIgnores(${JSON.stringify(ignores).replace(/"/g, "'").replace(/,/g, ", ")}),
  js.configs.recommended,
${typescript ? "  tseslint.configs.recommended,\n" : ""}  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
${e2eBlock ? `${e2eBlock}\n` : ""}  {
    files: UNIT_TEST_FILES,
${e2eFiles ? "    ignores: E2E_FILES,\n" : ""}${unitRules}
  },
]);
`;
}

function templates(ctx) {
  return {
    ...(ctx.unit.name === "vitest" && {
      vitest: `import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
`,
    }),
    ...(ctx.e2e.name === "playwright" && {
      playwright: `import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: { trace: 'on-first-retry' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
`,
    }),
    eslint: eslintTemplate(ctx),
    commitlint: `export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 72],
    'body-empty': [2, 'never'],
    'body-max-line-length': [0],
  },
};
`,
    "commit-msg": `${PACKAGE_MANAGERS[ctx.packageManager].exec} commitlint --edit "$1"\n`,
    "claude-settings": claudeSettingsTemplate(),
  };
}

function parseArgs(argv) {
  const options = { dir: ".", dryRun: false, migrate: false, browsers: false, print: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--migrate") options.migrate = true;
    else if (arg === "--browsers") options.browsers = true;
    else if (arg === "--print") options.print = argv[++i];
    else if (arg === "--help" || arg === "-h") exit(USAGE, 0);
    else if (arg.startsWith("--")) exit(`Unknown option: ${arg}\n\n${USAGE}`, 2);
    else options.dir = arg;
  }
  return options;
}

function exit(message, code) {
  (code === 0 ? console.log : console.error)(message);
  process.exit(code);
}

function checkNode() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  const [needMajor, needMinor] = MIN_NODE;
  if (major < needMajor || (major === needMajor && minor < needMinor)) {
    exit(`Node ${needMajor}.${needMinor} or newer is required (found ${process.versions.node}).`, 2);
  }
}

function run(command, cwd, { quiet = false } = {}) {
  // Windows resolves npm, npx, and other .cmd shims only through a shell.
  const result = spawnSync(command, { cwd, shell: true, encoding: "utf8", stdio: quiet ? "pipe" : "inherit" });
  return { ok: result.status === 0, stdout: (result.stdout ?? "").trim() };
}

function detectPackageManager(dir, pkg) {
  const declared = pkg.packageManager?.split("@")[0];
  if (PACKAGE_MANAGERS[declared]) return declared;
  for (const [file, manager] of LOCKFILES) if (existsSync(join(dir, file))) return manager;
  return "npm";
}

function detectUnitRunner(pkg, deps, migrate) {
  const testScript = pkg.scripts?.test ?? "";
  if (deps.vitest) return { name: "vitest", label: "Vitest (existing)", existing: true };
  if (migrate) return { name: "vitest", label: "Vitest (migrating)", existing: false, migrating: true };
  if (deps.jest || /\bjest\b/.test(testScript)) return { name: "jest", label: "Jest (existing)", existing: true };
  const other = OTHER_UNIT_RUNNERS.find((name) => deps[name]) ?? (/\bnode\b.*--test\b/.test(testScript) ? "node:test" : null);
  if (other) return { name: "other", label: `${other} (existing, not automated)`, existing: true, other };
  return { name: "vitest", label: "Vitest (new)", existing: false };
}

function detectE2ERunner(deps, migrate) {
  if (deps["@playwright/test"] || deps.playwright) return { name: "playwright", label: "Playwright (existing)", existing: true };
  if (migrate) return { name: "playwright", label: "Playwright (migrating)", existing: false, migrating: true };
  if (deps.cypress) return { name: "cypress", label: "Cypress (existing)", existing: true };
  const other = OTHER_E2E_RUNNERS.find((name) => deps[name]);
  if (other) return { name: "other", label: `${other} (existing, not automated)`, existing: true, other };
  return { name: "playwright", label: "Playwright (new)", existing: false };
}

function findConfig(files, kind) {
  return files.find((file) => CONFIG_PATTERNS[kind].test(file)) ?? null;
}

function newSteps() {
  return { install: [], create: [], scripts: {}, hook: null, denyRules: [], skipped: [], attention: [] };
}

function planClaudeSettings(dir, steps) {
  const path = join(dir, CLAUDE_SETTINGS);
  if (!existsSync(path)) {
    steps.denyRules = ENV_DENY_RULES;
    return;
  }
  let settings;
  try {
    settings = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    steps.attention.push(`${CLAUDE_SETTINGS} isn't valid JSON. Add the deny rules from \`--print claude-settings\` by hand.`);
    return;
  }
  const existing = new Set(settings.permissions?.deny ?? []);
  steps.denyRules = ENV_DENY_RULES.filter((rule) => !existing.has(rule));
  if (steps.denyRules.length === 0) steps.skipped.push(`.env deny rules (already in ${CLAUDE_SETTINGS})`);
}

function planJavaScript(dir, pkg, options) {
  const files = readdirSync(dir);
  const typescript = existsSync(join(dir, "tsconfig.json"));
  const packageManager = detectPackageManager(dir, pkg);
  const extension = typescript ? "ts" : "mjs";
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const unit = detectUnitRunner(pkg, deps, options.migrate);
  const e2e = detectE2ERunner(deps, options.migrate);
  const ctx = { typescript, packageManager, unit, e2e };
  const steps = newSteps();
  const commitMsg = templates(ctx)["commit-msg"].trim();

  const wanted = [
    ...(unit.name === "vitest" ? ["vitest", "@vitest/coverage-v8", "@vitest/eslint-plugin"] : []),
    ...(unit.name === "jest" ? ["eslint-plugin-jest"] : []),
    ...(e2e.name === "playwright" ? ["@playwright/test", "eslint-plugin-playwright"] : []),
    ...(e2e.name === "cypress" ? ["eslint-plugin-cypress"] : []),
    "eslint", "@eslint/js", "globals",
    ...(typescript ? ["typescript-eslint"] : []),
    "@commitlint/cli", "@commitlint/config-conventional", "husky",
  ];
  steps.install = wanted.filter((name) => !deps[name]);
  steps.skipped.push(...wanted.filter((name) => deps[name]).map((name) => `${name} (already installed)`));

  const eslintMajor = Number(deps.eslint?.match(/\d+/)?.[0]);
  if (eslintMajor && eslintMajor < 9) {
    steps.attention.push(`ESLint ${deps.eslint} is installed, but the config uses \`eslint/config\`, which needs ESLint 9.22 or newer. Upgrade ESLint.`);
  }
  const oldUnit = ["jest", ...OTHER_UNIT_RUNNERS].find((name) => deps[name]);
  const oldE2E = ["cypress", ...OTHER_E2E_RUNNERS].find((name) => deps[name]);
  if (unit.migrating && oldUnit) {
    steps.attention.push(`Port the ${oldUnit} tests to Vitest, then point the "test" and "test:coverage" scripts at Vitest and remove ${oldUnit} after the user confirms.`);
  }
  if (e2e.migrating && oldE2E) {
    steps.attention.push(`Port the ${oldE2E} tests to Playwright in e2e/, then point the "test:e2e" script at Playwright and remove ${oldE2E} after the user confirms.`);
  }
  if (unit.name === "other") {
    steps.attention.push(`Unit tests use ${unit.other}, which the script keeps as it is. Add branch coverage and a \`test:coverage\` script for it by hand, or run again with --migrate to move to Vitest.`);
  }
  if (unit.name === "jest") {
    steps.attention.push("Check that Jest collects branch coverage for the source files (`collectCoverageFrom` in the Jest config).");
  }
  if (e2e.name === "other") {
    steps.attention.push(`E2E tests use ${e2e.other}, which the script keeps as it is. Add its ESLint plugin, if it has one, by hand, or run again with --migrate to move to Playwright.`);
  }

  if (unit.name === "vitest") {
    const existingVitest = findConfig(files, "vitest");
    const existingVite = findConfig(files, "vite");
    if (existingVitest) steps.skipped.push(`Vitest config (${existingVitest} exists)`);
    else if (existingVite) {
      steps.attention.push(
        `${existingVite} exists, and a new vitest.config would replace it for tests. Add the \`test\` block from \`--print vitest\` to ${existingVite} instead.`,
      );
    } else steps.create.push({ path: `vitest.config.${extension}`, template: "vitest" });
  }

  if (e2e.name === "playwright") {
    const existingPlaywright = findConfig(files, "playwright");
    if (existingPlaywright) {
      steps.attention.push(
        `${existingPlaywright} exists. Check that it has chromium, firefox, and webkit projects (compare with \`--print playwright\`), and that its testDir matches E2E_FILES in the ESLint config.`,
      );
    } else steps.create.push({ path: `playwright.config.${extension}`, template: "playwright" });
    steps.attention.push("Set `use.baseURL` and `webServer` in the Playwright config so tests can start and reach the app.");
    if (!options.browsers) steps.attention.push("Playwright browsers weren't downloaded. Run this script again with --browsers when you're ready (several hundred MB).");
  }

  const existingEslint = findConfig(files, "eslint");
  const legacyEslint = findConfig(files, "eslintLegacy") ?? (pkg.eslintConfig ? "package.json#eslintConfig" : null);
  if (existingEslint) {
    steps.attention.push(`${existingEslint} exists. Merge the test-file rules from \`--print eslint\` into it.`);
  } else if (legacyEslint) {
    steps.attention.push(
      `${legacyEslint} uses the legacy ESLint config format, which current ESLint versions don't read. Migrate it to eslint.config.mjs and include the rules from \`--print eslint\`.`,
    );
  } else steps.create.push({ path: "eslint.config.mjs", template: "eslint" });

  const existingCommitlint = findConfig(files, "commitlint") ?? (pkg.commitlint ? "package.json#commitlint" : null);
  if (existingCommitlint) {
    steps.attention.push(`${existingCommitlint} exists. Compare its rules with \`--print commitlint\`.`);
  } else steps.create.push({ path: "commitlint.config.mjs", template: "commitlint" });

  for (const [name, command] of Object.entries(scriptsFor(ctx))) {
    if (!pkg.scripts?.[name] || NPM_INIT_PLACEHOLDER.test(pkg.scripts[name])) steps.scripts[name] = command;
    else if (pkg.scripts[name] !== command) {
      steps.skipped.push(`script "${name}" (already "${pkg.scripts[name]}")`);
      if (name === "prepare") steps.attention.push('The "prepare" script exists. Add `husky` to it so the commit-msg hook installs for everyone who runs install.');
    }
  }

  const gitRoot = run("git rev-parse --show-toplevel", dir, { quiet: true });
  const hooksPath = run("git config core.hooksPath", dir, { quiet: true }).stdout;
  const otherHookManager = findConfig(files, "otherHookManager") ?? (pkg["simple-git-hooks"] ? "package.json#simple-git-hooks" : null);
  if (!gitRoot.ok) steps.attention.push("Not a git repository, so no commit-msg hook was installed. Run `git init`, then this script again.");
  else if (resolve(gitRoot.stdout) !== resolve(dir)) {
    steps.attention.push(`The git root is ${gitRoot.stdout}, not this directory. Install the commit-msg hook from the git root by hand.`);
  } else if (otherHookManager) {
    steps.attention.push(`${otherHookManager} manages git hooks here. Add a commit-msg hook that runs: ${commitMsg}`);
  } else if (hooksPath && !hooksPath.startsWith(".husky")) {
    steps.attention.push(`git core.hooksPath is "${hooksPath}". Add a commit-msg hook there that runs: ${commitMsg}`);
  } else if (existsSync(join(dir, ".husky", "commit-msg"))) steps.skipped.push("commit-msg hook (.husky/commit-msg exists)");
  else steps.hook = ".husky/commit-msg";

  planClaudeSettings(dir, steps);

  const label = `${typescript ? "TypeScript" : "JavaScript"}, package manager: ${packageManager}, unit tests: ${unit.label}, E2E: ${e2e.label}`;
  return { label, ctx, steps };
}

function printPlan({ label, steps }, dryRun) {
  const will = dryRun ? "Would" : "Will";
  console.log(`Project: ${label}\n`);
  const section = (title, items) => {
    if (items.length === 0) return;
    console.log(`${title}:`);
    for (const item of items) console.log(`  - ${item}`);
    console.log("");
  };
  section(`${will} install`, steps.install);
  section(`${will} create`, steps.create.map((file) => file.path));
  section(`${will} add package.json scripts`, Object.entries(steps.scripts).map(([name, cmd]) => `"${name}": "${cmd}"`));
  section(`${will} add git hook`, steps.hook ? [steps.hook] : []);
  section(`${will} add Claude Code deny rules to ${CLAUDE_SETTINGS}`, steps.denyRules);
  section("Skipped", steps.skipped);
}

function writePackageScripts(dir, scripts) {
  if (Object.keys(scripts).length === 0) return;
  const path = join(dir, "package.json");
  const raw = readFileSync(path, "utf8");
  const pkg = JSON.parse(raw);
  pkg.scripts = { ...pkg.scripts, ...scripts };
  const indent = raw.match(/^[ \t]+(?=")/m)?.[0] ?? 2;
  writeFileSync(path, `${JSON.stringify(pkg, null, indent)}\n`);
}

function writeDenyRules(dir, rules) {
  if (rules.length === 0) return;
  const path = join(dir, CLAUDE_SETTINGS);
  const raw = existsSync(path) ? readFileSync(path, "utf8") : "{}";
  const settings = JSON.parse(raw);
  settings.permissions ??= {};
  settings.permissions.deny = [...(settings.permissions.deny ?? []), ...rules];
  const indent = raw.match(/^[ \t]+(?=")/m)?.[0] ?? 2;
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(path, `${JSON.stringify(settings, null, indent)}\n`);
}

function applyJavaScript(dir, { ctx, steps }, options) {
  const manager = PACKAGE_MANAGERS[ctx.packageManager];
  const files = templates(ctx);

  if (steps.install.length > 0) {
    console.log(`> ${manager.add} ${steps.install.join(" ")}`);
    if (!run(`${manager.add} ${steps.install.join(" ")}`, dir).ok) exit("Installing packages failed. Nothing else was changed.", 1);
  }

  for (const { path, template } of steps.create) writeFileSync(join(dir, path), files[template]);
  writePackageScripts(dir, steps.scripts);

  if (steps.hook) {
    if (!run(`${manager.exec} husky`, dir).ok) steps.attention.push("Running husky failed, so the commit-msg hook isn't active. Run `npx husky` and check the error.");
    mkdirSync(join(dir, ".husky"), { recursive: true });
    writeFileSync(join(dir, steps.hook), files["commit-msg"]);
  }

  if (options.browsers && ctx.e2e.name === "playwright") {
    console.log(`> ${manager.exec} playwright install`);
    if (!run(`${manager.exec} playwright install`, dir).ok) {
      steps.attention.push("Downloading Playwright browsers failed. On Linux, `playwright install --with-deps` may be needed (it uses sudo).");
    }
  }
}

const options = parseArgs(process.argv.slice(2));
const dir = resolve(options.dir);
const packageJsonPath = join(dir, "package.json");
if (!existsSync(packageJsonPath)) exit(`No package.json in ${dir}. Run \`npm init -y\` first, or pass the project directory.`, 2);
checkNode();
const setup = planJavaScript(dir, JSON.parse(readFileSync(packageJsonPath, "utf8")), options);

if (options.print) {
  const available = templates(setup.ctx);
  const template = available[options.print];
  if (!template) exit(`Template "${options.print}" isn't available for this project. Available: ${Object.keys(available).join(", ")}.`, 2);
  exit(template.trimEnd(), 0);
}

printPlan(setup, options.dryRun);
if (!options.dryRun) {
  applyJavaScript(dir, setup, options);
  writeDenyRules(dir, setup.steps.denyRules);
}

if (setup.steps.attention.length > 0) {
  console.log(`${options.dryRun ? "" : "\n"}Needs attention:`);
  for (const item of setup.steps.attention) console.log(`  - ${item}`);
}
console.log(options.dryRun ? "\nDry run: nothing was changed." : "\nDone.");
