---
name: code-as-documentation
description: Keeps the codebase as the only documentation, so no explanatory comments and no notes in memory files. Use whenever writing, editing, or refactoring code, and before adding any code comment, docstring, or entry in a memory file such as CLAUDE.md, AGENTS.md, or MEMORY.md.
---

# Code as documentation

The code is the source of truth for how the system works. Comments and notes that restate it drift out of date and then mislead. Make the code explain itself instead.

## Comments

Don't add comments that say what the code does or how. That includes docstrings, doc blocks (JSDoc, XML docs, Javadoc), section dividers, and comments that narrate a change ("added X", "fixed Y").

If code seems to need one, change the code:

- Rename the variable, function, or type so the name carries the meaning.
- Extract a function or constant with a descriptive name.
- Replace a magic value with a named constant.
- Express the constraint in a type or a test.

A comment is justified only when the reason for the code lives outside the code. The code shows what happens but not why. These are the valid reasons:

- **Third-party behavior:** a library, API, or platform quirk the code works around.
- **An incident:** an outage or bug that explains why a guard exists.
- **A legal requirement:** a regulation, contract, or compliance rule.
- **A measured value:** a number chosen from a benchmark, load test, or other measurement.

Say why, and point to the source when there is one: an issue link, ticket, regulation, or benchmark.

```ts
// Stripe retries webhooks for up to 3 days; dedupe by event id or customers get charged twice.
if (await processedEvents.has(event.id)) return;
```

Not this:

```ts
// Check if the event has already been processed
if (await processedEvents.has(event.id)) return;
```

Leave existing comments alone unless your change touches them. If your change makes a comment wrong, fix it or delete it.

## Memory files

Don't write facts about the code into CLAUDE.md, AGENTS.md, MEMORY.md, or any other memory or notes file. That covers structure, conventions, file locations, and what functions do. All of it can be read from the code, and a second copy goes stale.

Only add to a memory file when the user explicitly asks.

## Before finishing

Read your diff. Remove any added comment that doesn't give an outside reason, and revert any memory-file change the user didn't ask for.
