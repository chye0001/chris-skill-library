---
name: e2e-verification
description: Verify a web feature or bug fix end to end in a real browser, then turn that verification into a Playwright E2E regression test that can actually fail. Use when the user asks to verify a UI feature or bug fix end to end, to write or review E2E or Playwright tests, to run tests across Chromium, Firefox, and WebKit, or to profile a page with CDP or the Chrome DevTools MCP. Not for unit tests or small styling changes.
---

# E2E verification

Goal: confirm a feature really works in a browser, then leave behind a regression test that would fail if the feature broke.

## Before you start

Check `package.json` and the config files in the project root to see which E2E framework is set up.

- **Playwright is set up:** use it.
- **Another framework is set up** (Cypress, WebdriverIO, and so on): use that one. The rules below about locators, waiting, and test independence still apply, translated to that framework.
- **Nothing is set up:** suggest the `/sdlc:setup-testing` command to the user. Don't install anything without asking.

## The loop

1. **Write down the expected behavior** from the requirement, ticket, spec, or the user's description, before looking at the running app. Write the expectations as plain sentences. Expectations taken from what the app currently does will approve its bugs.
2. **Explore and verify on Chromium only.** Drive the app, observe, and debug (see "Exploring the app"). Running three browsers while iterating slows the loop for no gain.
3. **Write the verified behavior as a test** (see "Writing the test").
4. **Prove the test can fail.** Load the `meaningful-tests` skill and follow it: lint the test, then run its `prove-test-fails.mjs` script. Don't skip this step.
5. **Run across Chromium, Firefox, and WebKit.** Read [references/cross-browser.md](references/cross-browser.md) for the config, the commands, and how to read the results.
6. **Report** in the format at the end of this skill.

## Exploring the app

Use the first of these that is available:

1. A browser tool already connected to this session, such as the Playwright MCP, Claude in Chrome, or the Chrome DevTools MCP.
2. A short Playwright script or test run on Chromium. Use `page.screenshot()`, console output, and `page.content()` to observe what happens.

Use the same tool for the whole exploration so the results are comparable.

## Tooling

- **Playwright is the default for everything:** driving the app, assertions, and all three browsers. Its auto-waiting, locators, isolated browser contexts, tracing, and test runner are the reason to use it over raw CDP.
- **CDP and the Chrome DevTools MCP are Chromium-only.** Use them only for what Playwright doesn't expose, mainly performance work. Read [references/performance.md](references/performance.md) before any performance check.

## Writing the test

- **Locators:** prefer `getByRole`, `getByLabel`, `getByText`, and `getByTestId`. Avoid CSS classes and DOM structure, which break on harmless refactors and say nothing about what the user sees.
- **Web-first assertions:** `await expect(locator).toBeVisible()`, `toHaveText()`, `toHaveURL()`. They retry automatically.
- **No fixed sleeps:** never use `waitForTimeout`. Wait for a condition: a locator state, a URL, or a response.
- **Independent tests:** each test sets up its own state (fresh context, seeded data, login through the API with a saved `storageState`) and doesn't depend on what another test left behind.
- **Names describe behavior:** "user can reset password with a valid link", not "test reset page".
- **Scope:** E2E tests cover critical user flows. Push edge cases and branching logic down to unit and integration tests, because E2E tests are slow and get flaky at volume.

```ts
test('user can reset password with a valid link', async ({ page }) => {
  await page.goto(resetLinkFor('ada@example.com'));
  await page.getByLabel('New password').fill('correct horse battery staple');
  await page.getByRole('button', { name: 'Reset password' }).click();

  await expect(page).toHaveURL('/login');
  await expect(page.getByRole('status')).toHaveText('Your password has been reset.');
});
```

## Report

End with a short summary:

- **Verified:** the behaviors confirmed, and on which browsers.
- **Tests added:** the test files added, and what each protects against.
- **Fail check:** for each test, the break used and the `prove-test-fails.mjs` result.
- **Gaps:** anything not covered (real Safari, mobile, performance, edge cases left to unit tests), any tests that passed only on retry, and anything suspicious found along the way.
