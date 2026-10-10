# Performance checks

Keep performance checks separate from functional E2E tests. Timing assertions inside functional tests make them flaky.

## Tools

Performance tooling is Chromium-only.

- **CDP from Playwright:** use it for what Playwright doesn't expose, such as CPU and heap profiling, tracing, and detailed network or console inspection. Open it from Playwright rather than leaving Playwright:

  ```ts
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  const { metrics } = await cdp.send('Performance.getMetrics');
  ```

- **Chrome DevTools MCP** (`chrome-devtools-mcp`, run with `npx`): suits live debugging and performance investigation, including console messages, network requests, DOM snapshots, screenshots, and performance traces. Check its README for the current tool list and setup, because it changes quickly.

## Method

1. Agree on explicit budgets with the user, or take them from the project, for example LCP under 2.5 s or heap growth under 10 MB over the flow.
2. Capture traces and metrics: Core Web Vitals, long tasks, heap growth.
3. Compare the numbers against the budgets.
4. Report the measured numbers, the budgets, and the conditions (machine, throttling, build mode). A number without its conditions can't be compared later.
