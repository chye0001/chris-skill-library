#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const MIN_NODE = [22, 12];

const USAGE = `Usage: node setup-testing.mjs [project-dir] [--dry-run] [--browsers] [--print <template>]

Sets up Vitest, Playwright, ESLint with test-quality rules, and commitlint with a
commit-msg hook. Existing configs are never overwritten.

  --dry-run           Show what would change, without changing anything.
  --browsers          Also download the Playwright browsers (several hundred MB).
  --print <template>  Print a config template and exit, for merging by hand:
                      eslint, vitest, playwright, commitlint, commit-msg.`;

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

const CONFIG_PATTERNS = {
  vitest: /^vitest\.config\.[cm]?[jt]s$/,
  vite: /^vite\.config\.[cm]?[jt]s$/,
  playwright: /^playwright\.config\.[cm]?[jt]s$/,
  eslint: /^eslint\.config\.[cm]?[jt]s$/,
  eslintLegacy: /^\.eslintrc(\.(js|cjs|json|ya?ml))?$/,
  commitlint: /^(commitlint\.config\.[cm]?[jt]s|\.commitlintrc(\..+)?)$/,
  otherHookManager: /^(\.?lefthook(-local)?\.(yml|yaml|json|toml)|\.simple-git-hooks\.(c?js|json))$/,
};

const SCRIPTS = {
  test: "vitest run",
  "test:e2e": "playwright test",
  lint: "eslint .",
  prepare: "husky",
};
const NPM_INIT_PLACEHOLDER = /^echo "Error: no test specified" && exit 1$/;

function templates(typescript, packageManager) {
  return {
    vitest: `import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
`,
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
    eslint: `import js from '@eslint/js';
${typescript ? "import tseslint from 'typescript-eslint';\n" : ""}import globals from 'globals';
import playwright from 'eslint-plugin-playwright';
import vitest from '@vitest/eslint-plugin';
import { defineConfig, globalIgnores } from 'eslint/config';

const E2E_FILES = ['e2e/**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}'];
const UNIT_TEST_FILES = ['**/*.{test,spec}.{js,mjs,cjs,jsx,ts,mts,cts,tsx}'];

const WEAK_MATCHERS = {
  toBeTruthy: 'Assert the specific value the code should produce.',
  toBeFalsy: 'Assert the specific value the code should produce.',
  toBeDefined: 'Assert the specific value the code should produce.',
  toMatchSnapshot: 'Check that the snapshot baseline is correct, not just recorded.',
  toMatchInlineSnapshot: 'Check that the snapshot baseline is correct, not just recorded.',
};

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
];

export default defineConfig([
  globalIgnores(['dist', 'build', 'coverage', 'playwright-report', 'test-results']),
  js.configs.recommended,
${typescript ? "  tseslint.configs.recommended,\n" : ""}  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
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
  },
  {
    files: UNIT_TEST_FILES,
    ignores: E2E_FILES,
    extends: [vitest.configs.recommended],
    rules: {
      'vitest/no-conditional-in-test': 'error',
      'vitest/no-restricted-matchers': ['warn', WEAK_MATCHERS],
      'no-restricted-syntax': TAUTOLOGIES,
    },
  },
]);
`,
    commitlint: `export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 72],
    'body-empty': [2, 'never'],
    'body-max-line-length': [0],
  },
};
`,
    "commit-msg": `${PACKAGE_MANAGERS[packageManager].exec} commitlint --edit "$1"\n`,
  };
}

function parseArgs(argv) {
  const options = { dir: ".", dryRun: false, browsers: false, print: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") options.dryRun = true;
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

function findConfig(files, kind) {
  return files.find((file) => CONFIG_PATTERNS[kind].test(file)) ?? null;
}

function plan(dir, pkg, options) {
  const files = readdirSync(dir);
  const typescript = existsSync(join(dir, "tsconfig.json"));
  const packageManager = detectPackageManager(dir, pkg);
  const extension = typescript ? "ts" : "mjs";
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  const steps = { install: [], create: [], scripts: {}, hook: null, skipped: [], attention: [] };

  const wanted = [
    "vitest", "@playwright/test", "eslint", "@eslint/js", "globals",
    "eslint-plugin-playwright", "@vitest/eslint-plugin",
    "@commitlint/cli", "@commitlint/config-conventional", "husky",
    ...(typescript ? ["typescript-eslint"] : []),
  ];
  steps.install = wanted.filter((name) => !allDeps[name]);
  steps.skipped.push(...wanted.filter((name) => allDeps[name]).map((name) => `${name} (already installed)`));

  const eslintMajor = Number(allDeps.eslint?.match(/\d+/)?.[0]);
  if (eslintMajor && eslintMajor < 9) {
    steps.attention.push(`ESLint ${allDeps.eslint} is installed, but the config uses \`eslint/config\`, which needs ESLint 9.22 or newer. Upgrade ESLint.`);
  }
  if (allDeps.jest || /\bjest\b/.test(pkg.scripts?.test ?? "")) {
    steps.attention.push("This project uses Jest. Decide with the user whether to move to Vitest or keep Jest (eslint-plugin-jest has matching rules) before installing.");
  }

  const existingVitest = findConfig(files, "vitest");
  const existingVite = findConfig(files, "vite");
  if (existingVitest) steps.skipped.push(`Vitest config (${existingVitest} exists)`);
  else if (existingVite) {
    steps.attention.push(
      `${existingVite} exists, and a new vitest.config would replace it for tests. Add the \`test\` block from \`--print vitest\` to ${existingVite} instead.`,
    );
  } else steps.create.push({ path: `vitest.config.${extension}`, template: "vitest" });

  const existingPlaywright = findConfig(files, "playwright");
  if (existingPlaywright) {
    steps.attention.push(
      `${existingPlaywright} exists. Check that it has chromium, firefox, and webkit projects; compare with \`--print playwright\`.`,
    );
  } else steps.create.push({ path: `playwright.config.${extension}`, template: "playwright" });
  steps.attention.push(
    "Set `use.baseURL` and `webServer` in the Playwright config so tests can start and reach the app.",
  );

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

  for (const [name, command] of Object.entries(SCRIPTS)) {
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
    steps.attention.push(`${otherHookManager} manages git hooks here. Add a commit-msg hook that runs: ${templates(typescript, packageManager)["commit-msg"].trim()}`);
  } else if (hooksPath && !hooksPath.startsWith(".husky")) {
    steps.attention.push(`git core.hooksPath is "${hooksPath}". Add a commit-msg hook there that runs: ${templates(typescript, packageManager)["commit-msg"].trim()}`);
  } else if (existsSync(join(dir, ".husky", "commit-msg"))) steps.skipped.push("commit-msg hook (.husky/commit-msg exists)");
  else steps.hook = ".husky/commit-msg";

  if (!options.browsers) steps.attention.push("Playwright browsers weren't downloaded. Run this script again with --browsers when you're ready (several hundred MB).");

  return { typescript, packageManager, steps };
}

function printPlan({ typescript, packageManager, steps }, dryRun) {
  const will = dryRun ? "Would" : "Will";
  console.log(`Project: ${typescript ? "TypeScript" : "JavaScript"}, package manager: ${packageManager}\n`);
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

function apply(dir, { typescript, packageManager, steps }, options) {
  const manager = PACKAGE_MANAGERS[packageManager];
  const files = templates(typescript, packageManager);

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

  if (options.browsers) {
    console.log(`> ${manager.exec} playwright install`);
    if (!run(`${manager.exec} playwright install`, dir).ok) {
      steps.attention.push("Downloading Playwright browsers failed. On Linux, `playwright install --with-deps` may be needed (it uses sudo).");
    }
  }
}

checkNode();
const options = parseArgs(process.argv.slice(2));
const dir = resolve(options.dir);
const packageJsonPath = join(dir, "package.json");
if (!existsSync(packageJsonPath)) exit(`No package.json in ${dir}. Run \`npm init -y\` first, or pass the project directory.`, 2);
const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const setup = plan(dir, pkg, options);

if (options.print) {
  const template = templates(setup.typescript, setup.packageManager)[options.print];
  if (!template) exit(`Unknown template "${options.print}".\n\n${USAGE}`, 2);
  exit(template.trimEnd(), 0);
}

printPlan(setup, options.dryRun);
if (!options.dryRun) apply(dir, setup, options);

if (setup.steps.attention.length > 0) {
  console.log(`${options.dryRun ? "" : "\n"}Needs attention:`);
  for (const item of setup.steps.attention) console.log(`  - ${item}`);
}
console.log(options.dryRun ? "\nDry run: nothing was changed." : "\nDone.");
