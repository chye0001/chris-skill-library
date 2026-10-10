# Integration tests

Integration tests run services against the real infrastructure they depend on, usually a database.

## Rules

- **Use the real database.** Never mock the database client or ORM in integration tests. Mock only third-party services across the network, such as payments or email.
- **Test the service,** not the route handler, server action, or controller in front of it.
- **Each test creates exactly the data it needs** through small `create…` helpers, or the project's factories if it has them. Never depend on rows another test created, or on the order tests run in.
- **Follow the project's isolation approach,** such as a transaction rolled back after each test, truncating tables between tests, or unique IDs per test. If the project has none, ask the user which to use.

## What to cover at this level

- **Transactions:** a failure halfway through leaves no partial writes.
- **Data scoping:** create rows in two scopes (tenant, venue, user) and assert that only the right scope's rows come back or change.
- **Concurrency guards:** for conditional updates such as `updateMany` with a status in the `where`, assert that a second attempt changes nothing. When it matters, run two attempts at once and assert that only one wins.
- **Constraints:** unique, foreign key, and check constraints reject what they should.
- **Emitted events:** notifications such as `pg_notify`, outbox rows, or queued jobs are produced with the right payload, and not produced when the operation fails.

## Test database and credentials

- Find out how the test database starts from the repository: a Docker Compose file, the test setup files, `.env.example` or `.env.test`, and the `package.json` scripts.
- Use only local test values. Never read `.env`, `.env.local`, `.env.production`, or any other file that may hold real credentials, and never point tests at a shared or production database.
- If the repository doesn't show how to start or reach the test database, ask the user. Don't guess connection details.

## Claude Code sandbox

The Claude Code sandbox can block connections to a local database, which shows up as `EPERM` or a refused connection. If that happens, tell the user and ask them to approve running that command outside the sandbox. Don't work around it.
