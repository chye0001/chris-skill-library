# Cross-browser runs

Run every new or changed E2E test on Chromium, Firefox, and WebKit through Playwright projects.

## Config

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  retries: process.env.CI ? 1 : 0,
  use: { trace: 'on-first-retry' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
```

If the project already has a config, add the missing projects to it rather than replacing it.

The browsers must be installed with `npx playwright install` (or `npx playwright install firefox webkit` for only the missing ones). This downloads several hundred MB, so ask the user before running it.

## Running

- **Exploring:** `npx playwright test --project=chromium`
- **Final check:** `npx playwright test`, which runs all projects.
- **Flakiness check for a new test:** `npx playwright test <file> --repeat-each=5`

## Reading the results

- **Fails on only one browser:** treat it as a real finding and investigate. Don't retry it away.
- **Passes only on retry:** the CI retry exists so that `trace: 'on-first-retry'` records a trace. A test that passes on retry is flaky. Report it as flaky and use the trace to find out why. Don't count it as passing.

## Browser protocols

- Don't drive Firefox or WebKit through their native protocols. Playwright ships patched builds of both and its own protocol for them, and there is little agent tooling around the native ones. Use the Playwright API on all three.
- Playwright WebKit is not Safari. If Safari behavior matters, say so and recommend testing in real Safari or on a device.
