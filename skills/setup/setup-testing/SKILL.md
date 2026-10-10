---
name: setup-testing
description: Set up Vitest, Playwright, ESLint with test-quality rules, and commitlint with a commit-msg hook in a JavaScript or TypeScript project.
disable-model-invocation: true
---

# Set up testing

Sets up the current project with:

- **Vitest** for unit and integration tests.
- **Playwright** for E2E tests in `e2e/`, on Chromium, Firefox, and WebKit.
- **ESLint** with rules that catch tests that can't fail: no assertion, constant assertions, conditional assertions, swallowed failures, fixed sleeps, `.only`, weak matchers, and raw CSS or XPath locators.
- **commitlint** with a husky `commit-msg` hook that enforces the format from the `commit-message` skill.

The script needs Node 22.12 or newer. It never overwrites an existing config.

## Steps

1. Run a dry run from the project root and show the user the plan:

   ```bash
   node "${CLAUDE_SKILL_DIR}/scripts/setup-testing.mjs" --dry-run
   ```

2. Ask the user to confirm the plan, and whether to download the Playwright browsers now (`--browsers`, several hundred MB). If the dry run lists decisions under "Needs attention", such as Jest versus Vitest, settle those with the user first.
3. Run it:

   ```bash
   node "${CLAUDE_SKILL_DIR}/scripts/setup-testing.mjs" [--browsers]
   ```

4. Work through every item under "Needs attention":
   - **Existing configs:** print the template with `--print <eslint|vitest|playwright|commitlint|commit-msg>` and merge the missing parts into the existing file. Don't replace the user's settings.
   - **Playwright `baseURL` and `webServer`:** take the command and port from the project's dev script. Ask the user if they aren't clear. If there's no app to start yet, leave both out of the config and list them as open in your report.
5. Check that the setup works: run the `lint` script, the `test` script, and `playwright test --list`.
6. Report what was installed and created, what you merged by hand, and anything still open.
