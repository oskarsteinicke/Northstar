# Tests

Plain Node, no dependencies. The app is classic scripts, so each suite loads the
real files into a sandbox with a small DOM shim and asserts on what they do.

```bash
node tests/run.js            # everything
node tests/run.js auth       # one suite, by filename prefix
```

Exit code is non-zero if any check fails, so this works in CI as-is.

| Suite | Covers |
|---|---|
| `smoke` | every script loads; cross-file functions exist; auth screens render |
| `auth` | signup/sign-in error handling, duplicate accounts, one-shot notices |
| `onboarding` | onboarding answers persist; invite links reach new users |

Add a suite by dropping in `<name>.test.js` that exports a function (sync or
async) returning the number of failed checks. `harness.js` provides
`createSandbox`, `run` and `createReporter`.
