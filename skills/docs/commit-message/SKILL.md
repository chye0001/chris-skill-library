---
name: commit-message
description: Write structured git commit messages that record why a change was made, so the git history can be searched later. Use whenever committing changes or writing a commit message.
---

# Commit message

Comments and memory files don't explain the code, so the reasons behind a change live in its commit message. Write each message so a future reader can find it with `git log --grep` or `git blame` and understand why the change was made.

## Steps

1. Run `git diff --staged --stat`, then read the diff. For large diffs, read only the files you need.
2. Check that the staged changes are one logical change. If they mix unrelated changes, split them into separate commits, or ask the user how to split them.
3. Run `git log --oneline -20` and reuse the scopes already in the history.
4. Write the message in the format below.
5. Commit with `git commit -F <file>` or one `-m` per paragraph, so the blank lines are kept.

## Format

```
<type>(<scope>): <subject>

<body>

<trailers>
```

### Header

- **type:** one of the types below. Add `!` after the scope for a breaking change, for example `feat(api)!: ...`.

  | Type | Use when |
  |---|---|
  | `feat` | Users or callers can do something new |
  | `fix` | Wrong behavior becomes correct |
  | `refactor` | Structure changes, behavior doesn't |
  | `perf` | Faster or cheaper, same behavior |
  | `style` | Formatting only |
  | `test` | Tests only |
  | `docs` | Documentation only |
  | `build` | Build system, dependencies, packaging |
  | `ci` | CI pipeline configuration |
  | `chore` | Maintenance that fits nothing above |
  | `revert` | Undoes an earlier commit. The body names the reverted commit and says why |

- **scope:** the area of the codebase, named the way the code names it, for example `payments`, `auth`, or `cli`. Use the same scope every time for the same area.
- **subject:** imperative mood, lowercase, no trailing period. Keep the whole header within 72 characters. Name the thing that changed so the header can be found by searching: `dedupe Stripe webhooks by event id`, not `fix bug`.

### Body

The body is required and has no length limit. Cover:

- **Why** the change was made: the problem, request, or constraint behind it.
- **Alternatives** that were considered and why they were rejected, when there were any.
- **Consequences** a future reader needs to know, such as behavior that changed or a limit that now applies.

Don't describe what changed line by line or list the files. The diff already shows that.

Take the reason from the conversation, the issue, or the user. If you don't know why the change was made, ask the user. Never invent a reason.

### Trailers

Add trailers after a blank line, one per line:

- `Refs: <issue, ticket, or incident id>` for each related item.
- `BREAKING CHANGE: <what breaks and how to migrate>` for breaking changes.

Keep any trailers the user or tooling requires, such as `Co-Authored-By`.

## Example

```
fix(payments): dedupe Stripe webhooks by event id

Stripe retries webhooks for up to 3 days. Retried events were charged
twice because nothing checked whether an event had been processed.

Considered relying on Stripe's idempotency keys, but those only cover
requests we send, not webhooks we receive.

Refs: INC-142
```

## Squash merges

When a pull request is squash-merged, its description becomes the commit message. Write pull request titles and descriptions in this same format.
