---
name: setup-testing
description: Set up Vitest with coverage, Playwright, ESLint with test-quality rules, commitlint with a commit-msg hook, and Claude Code deny rules for .env files in a JavaScript or TypeScript project. Keeps an existing test setup unless asked to migrate.
disable-model-invocation: true
---

# Set up testing

Sets up the current project with this library's stack:

- **Vitest** for unit and integration tests, with V8 coverage (`test:coverage`).
- **Playwright** for E2E tests in `e2e/`, on Chromium, Firefox, and WebKit.
- **ESLint** with rules that catch tests that can't fail: no assertion, constant assertions, conditional assertions, swallowed failures, fixed sleeps, `.only`, weak matchers, and raw selectors.
- **commitlint** with a husky `commit-msg` hook that enforces the format from the `commit-message` skill.
- **Claude Code deny rules** in `.claude/settings.json` that block reading `.env` files with real values. `.env.test` and `.env.example` stay readable.

If the project already has a unit or E2E test framework (such as Jest or Cypress), the script keeps it and only adds the matching ESLint rules. It replaces the existing framework with Vitest or Playwright only when the user asks to migrate. It never overwrites an existing config. It needs Node 22.12 or newer.

## Steps

1. Run a dry run from the project root and show the user the plan. Add `--migrate` only if the user asked to move the project to Vitest and Playwright.

   ```bash
   node "${CLAUDE_SKILL_DIR}/scripts/setup-testing.mjs" --dry-run [--migrate]
   ```

2. Ask the user to confirm the plan. If it sets up Playwright, also ask whether to download the browsers now (`--browsers`, several hundred MB). Settle any decisions listed under "Needs attention" with the user first.
3. Run it with the same options:

   ```bash
   node "${CLAUDE_SKILL_DIR}/scripts/setup-testing.mjs" [--migrate] [--browsers]
   ```

4. Work through every item under "Needs attention":
   - **Existing configs:** print the template with `--print <name>` and merge the missing parts into the existing file. Don't replace the user's settings. The error message for an unknown name lists the available templates.
   - **Playwright `baseURL` and `webServer`:** take the command and port from the project's dev script. Ask the user if they aren't clear. If there's no app to start yet, leave both out of the config and list them as open in your report.
   - **Migration:** port the existing tests to Vitest or Playwright, keeping what each test checks. Run the ported tests, then switch the `package.json` scripts. Remove the old framework only after the user confirms.
5. Check that the setup works: run the `lint`, `test`, and `test:coverage` scripts. For Playwright, also run `playwright test --list`.
6. Report what was installed and created, what you merged or ported by hand, and anything still open.
