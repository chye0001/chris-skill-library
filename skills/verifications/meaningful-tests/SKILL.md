---
name: meaningful-tests
description: Make sure tests can actually fail, and catch tautological tests that pass whether or not the code works. Use when writing, adding, or reviewing tests of any kind (unit, integration, or E2E), including reviewing agent-written tests, even if the user never says "tautological".
---

# Meaningful tests

A test that cannot fail is worse than no test, because it creates false confidence. Every new test must be shown to fail when the behavior it protects is broken.

## Tautological tests

A tautological test checks the code against itself, so it passes whether or not the code is correct. Agents are especially prone to writing these, because they write the test after seeing the output.

### Forms to watch for

- **Mirroring the implementation:** the expected value is computed with the same logic as the code under test, for example `expect(total).toBe(items.reduce(...))` when the app does the same `reduce`.
- **Over-mocking:** mocking a dependency to return X, then asserting that X came back. This tests the mock. In E2E tests, the common version is stubbing the very API response the feature is supposed to produce.
- **Snapshotting current output:** generating the expected value (text, DOM, screenshot) by running the code, then asserting against it. Bugs get recorded as correct.
- **Assertion-free or trivially true tests:** no `expect`, `expect(true).toBe(true)`, or only checking that nothing threw.
- **Weak assertions:** `toBeTruthy()`, "element exists", or "page loaded" when the feature's real outcome is a specific value, state, or navigation.
- **Asserting on setup:** checking something the test itself just set up, such as filling an input and then asserting the input has that value, without involving the feature.
- **Swallowed failures:** `try`/`catch` around assertions, `.catch(() => {})`, or `if (await el.isVisible())` guarding an assertion so it silently skips.

### How to avoid them

- Take expected values from the spec, a hand calculation, or fixed known examples. Hard-code them.
- Assert the outcome the user or caller sees, not the internal steps that produce it.
- Mock only at real boundaries such as third-party services, payments, and email. Assert on what the code does with the mocked response, not on the mock itself.
- Accept a screenshot or snapshot baseline only after you or the user have checked that the baseline is actually correct.
- Make every assertion unconditional.

## Lint the tests

Run the project's linter on the test files you wrote or are reviewing, for example `npx eslint <files>`.

- Fix every error.
- Each warning (weak matchers, snapshot baselines, raw CSS or XPath locators, skipped tests) needs a judgment call. Fix it, or say in your report why it's fine.

If the project's ESLint config has no test rules (`eslint-plugin-playwright`, `@vitest/eslint-plugin`, or `eslint-plugin-jest`), say so in your report and suggest the `/sdlc:setup-testing` command. Don't install anything without asking.

Linters can't detect mirroring the implementation, over-mocking, or asserting on setup. Read each test for those yourself.

## Prove a test can fail

Before accepting any new test, show it going red for the right reason. Use the script, which breaks the code with one exact text replacement, runs the test, and restores the file byte for byte:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/prove-test-fails.mjs" \
  --file src/cart/total.ts \
  --find "return subtotal - discount;" \
  --replace "return subtotal;" \
  --expect "toHaveText" \
  -- npx playwright test tests/cart.spec.ts --project=chromium
```

- `--find` must match exactly once in `--file`. Use `--find-file` and `--replace-file` instead when the text spans several lines.
- `--expect` is text that must appear in the failing output, such as the assertion matcher or the expected value. Use it so a failure from something else doesn't count.
- The script first runs the test on the unbroken code, and stops if it doesn't pass.
- It exits with 0 only when the test passed before the break, failed after it, matched `--expect`, and the file was restored.

Choose a break that removes the behavior the test is meant to protect: revert the fix, or change the one line that produces the outcome. The failure must come from the assertion that expresses the behavior. A timeout, a missing selector, or a crash during setup doesn't count, because that only proves the test is broken in a different way.

Never stash, commit, reset, or check out the user's work to do this. If one replacement can't break the feature, make the break by hand, run the test, and then undo exactly the lines you changed and nothing else.

If a test stays green when the feature is broken, it is tautological. Fix the assertion or delete the test. If the project already uses mutation testing (Stryker, mutmut, PIT), also run it on the code you touched.

Record the result in your report, for example: "fails when the discount is dropped from the total, passes when restored."
