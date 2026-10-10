# chris-skill-library

Personal Claude Code skill library for the software development lifecycle.

The skills share one idea: the codebase is the documentation. Code explains itself instead of relying on comments or memory files, the reasons behind changes live in structured commit messages, and tests must be shown to fail before they're trusted.

## Install

```
/plugin install sdlc --marketplace chye0001/chris-skill-library
```

To try it from a local clone instead:

```
/plugin marketplace add ./path/to/chris-skill-library
/plugin install sdlc@chris-skill-library
```

## Skills

| Skill | Loads when | What it does |
|---|---|---|
| `code-as-documentation` | Writing or editing code | No explanatory comments and no notes in memory files. A comment is allowed only when the reason lives outside the code: third-party behavior, an incident, a legal requirement, or a measured value. |
| `commit-message` | Committing | Conventional Commits header (`type(scope): subject`, max 72 characters) and a required body that says why. Asks for the reason instead of inventing one. |
| `meaningful-tests` | Writing or reviewing tests | Catches tautological tests, lints the tests, and proves each new test fails when the code it protects is broken. |
| `e2e-verification` | Verifying a feature end to end | Verifies a feature in a real browser, then turns it into a Playwright test that runs on Chromium, Firefox, and WebKit. |
| `setup-testing` | Only when you run `/sdlc:setup-testing` | Sets up Vitest, Playwright, ESLint with test-quality rules, and commitlint with a `commit-msg` hook. |

## Setting up a project

`setup-testing` needs Node 22.12 or newer. It never overwrites existing configs; anything it can't set up safely is listed under "Needs attention".

In Claude Code, run:

```
/sdlc:setup-testing
```

Or from a terminal in the project root:

```bash
node path/to/chris-skill-library/skills/setup/setup-testing/scripts/setup-testing.mjs --dry-run
```

| Option | Effect |
|---|---|
| `--dry-run` | Show what would change, without changing anything |
| `--browsers` | Also download the Playwright browsers (several hundred MB) |
| `--print <template>` | Print a config template for merging by hand: `eslint`, `vitest`, `playwright`, `commitlint`, or `commit-msg` |

## Adding a skill

1. Create `skills/<category>/<skill-name>/SKILL.md` with `name` and `description` frontmatter.
2. Add the skill's folder to the `skills` list in `.claude-plugin/plugin.json`. Skills in category folders aren't found otherwise.
3. Bump `version` in `.claude-plugin/plugin.json` so installed copies pick up the change.
