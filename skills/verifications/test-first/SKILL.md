---
name: test-first
description: Test-first workflow that designs test cases from the specification, writes failing tests, implements, then closes coverage gaps. Use whenever implementing a feature, fixing a bug, or changing behavior in application code, and when asked to add tests for existing code. Not for styling-only or config-only changes.
---

# Test-first

Run the phases in order, in one go. Stop for the user only where a phase says to.

**Analyse → Red → Green → Gap → Finish.**

## Before you start

- Find the existing tests closest to the code you're changing (same module, or the nearest sibling) and match their file location, layout, naming, and helpers. The codebase is the reference for conventions.
- Read the `package.json` scripts for the test, coverage, lint, and typecheck commands.
- Use the project's existing test framework, even if it isn't Vitest. Don't switch frameworks unless the user asks to migrate.
- If there's no test runner or coverage script, suggest the `/sdlc:setup-testing` command. Don't install anything without asking.

## Choosing the level

Use the lowest level that can show the behavior.

| Level | Use for | Guidance |
|---|---|---|
| Unit | Pure logic: calculations, parsing, validation, state machines | This skill |
| Integration | Code that talks to a real database, queue, or service: transactions, data scoping, concurrency guards, emitted events | This skill, plus [references/integration.md](references/integration.md) |
| E2E | User flows through the UI | Load the `e2e-verification` skill |

Test the service or domain function, never the framework entry point (route handler, server action, controller). If the change needs a level the project has no harness for, say so. Don't improvise one.

## Bug fixes

Every bug fix gets a regression test for that specific bug, written before the fix:

- Reproduce the reported bug with its exact input and state, not a nearby representative value.
- Put it in its own `it` inside the `describe` for the function it concerns, named `regression: <observed symptom>`. Add a one-line comment naming the incident or issue, since that reason lives outside the code. Keep it out of parametrised tests, where a later cleanup could drop it. It stays in the suite permanently and must be easy to find by searching.
- Run it and confirm it fails for the reported reason before changing the source.

Then ask whether the bug shows a missing partition, rule, or transition. If it does, add that case in Phase 1 as well. If the bug is local, the regression test alone is enough. Don't analyse the whole function for a one-line fix.

## Phase 1: Analyse (black box)

Derive the cases from the specification: the user's request, the ticket, the function's contract, its types, and validation schemas. Don't derive them from the implementation.

- **Existing code with no spec:** infer the contract from names, types, and schemas. If the code does something that looks wrong, report it to the user. Don't write a test that locks the behavior in.
- **Changes to existing behavior:** find the tests that assert the old behavior and update them in Red. Never update them in Green.

Design the cases with the techniques in [references/test-design.md](references/test-design.md): equivalence partitions with boundary values, decision tables, and state-transition tables. Use only the techniques that fit the input.

The tables are working notes. Don't write them into the test files as comments. The parametrised test cases, named after their table rows, carry the same information, and a second copy would drift out of date. Put the tables in your report so the user can review the test design.

## Phase 2: Red

- Write one parametrised test per table, with one case per EP value and per BV value. Name each case after its row, so a failure points at the row and the cases read as the table. See [references/test-design.md](references/test-design.md) for the format.
- Use a plain `it` for a single property no table models, and for regression tests.
- If the function doesn't exist yet, add a stub with its final signature that throws `new Error("not implemented")`. Each case then fails on its own and the file still loads.

Run the new tests and confirm they fail on an assertion about behavior, not on a syntax error or a failed import. Record how many failed.

## Phase 3: Green

Implement until the tests pass. Don't edit test files in this phase.

If a test turns out to be wrong (the spec was misread, or a case is impossible), stop and tell the user which case is wrong and why. Then fix the table and the test together, never the test alone.

## Phase 4: Gap

Run the `test:coverage` script. The terminal report shows branch coverage and uncovered lines for each file, and `coverage/index.html` shows which branch was missed. For every uncovered branch in the files this change touched:

- **Missing partition, rule, or transition:** add the row to its table, then the case to that table's parametrised test.
- **Dead code** that no input from the spec can reach: delete it if this change wrote it. Otherwise report it and leave it in place.
- **Defensive and unreachable by design,** such as an exhaustive `switch` default: leave it and name it in the report.

Never add a test that only executes a line without asserting an outcome.

## Finish

Run the typecheck, lint, and test scripts the project has. Report:

- the tables, with the number of cases in each,
- any regression tests, each with the bug it pins,
- the red run: how many tests failed, and confirmation that they failed on assertions,
- branch coverage of the touched files, and each gap with its classification,
- any existing behavior that looked wrong but was left alone.
