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
| `deletion` | worker authorisation boundary, deletion ordering, both abort paths, the confirm gate |
| `gamification` | XP curve, levels, achievement idempotence, quest payout, daily score |
| `diet` | meal editing per section, macro re-estimation on rename, imported weight units |
| `habits` | completion history, rollover backfill, streak breaks, local date keys, weekly schedules |
| `integrations` | imported weight units, sync paths run, local date attribution |
| `onboarding` | onboarding answers persist; invite links reach new users |
| `premium` | free habit limit, trial window, grandfathering, paywall gating |
| `push` | VAPID signing verified against the public key, slot windows, dedupe, pruning |
| `storage` | routine ticks keyed by id, positional-log migration, quota failures surfacing |
| `telemetry` | error reporting and capping, no user content, failure events, native reminders |
| `tracking` | warmup handling in volume figures, imported activity names, meal deletion by id |
| `workout` | mid-session data loss, trained-day detection, estimated 1RM, relative strength, body map |

Add a suite by dropping in `<name>.test.js` that exports a function (sync or
async) returning the number of failed checks. `harness.js` provides
`createSandbox`, `run` and `createReporter`.
