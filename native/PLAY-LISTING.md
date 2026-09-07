# Play Store listing

Copy each block straight into Play Console. Character limits noted; all are
inside them.

> **Read the blocker at the bottom before submitting.** The copy below describes
> Arete with everything unlocked, which is both what Play policy requires here
> and what the app currently is for existing users.

---

## App name (30 max, using 25)

```
Arete: Habits, Gym & Diet
```

## Short description (80 max, using 76)

```
Habits, training, nutrition and an AI coach. Free, works offline, no account.
```

## Full description (4000 max, using ~2100)

```
Most self-improvement apps do one thing and charge you every month for it. Arete does the whole picture instead.

Habits, training, nutrition, sleep and an AI coach in one place. The parts talk to each other. Log a workout and your recovery updates. Sleep badly and today's training advice changes with it.

HABITS
Build streaks across five areas: body, mind, spirit, craft and connection. Daily, weekly, or specific days of the week. Weekly habits are judged on the week, not on whether you opened the app.

TRAINING
Push/Pull/Legs, Upper/Lower and Full Body programs are built in. Or build your own. Every set is logged, personal records are tracked, and estimated 1RM comes from the weight and reps you actually did.

A body map shows which muscles you have trained recently and where you are strongest. Strength is scored against what an average lifter your bodyweight and sex can do, so your arms are not compared to your legs. Ranks run from Untrained to Demigod.

NUTRITION
Photograph a meal and Arete estimates the calories and macros. Or just describe it. Edit anything it gets wrong and the numbers recalculate.

Targets come from your own height, weight, age and activity level. Log your weight and it tells you when your targets have drifted.

SLEEP
Set when you went to bed and when you woke up. Arete works out the rest. It asks once a day, because sleep is the easiest thing to forget and the hardest to reconstruct later.

AI COACH
It can see your real data. Ask why you are tired, what to train today, or why progress stalled. It answers from your logs, not from generic advice.

COMPETE
Create a group, share the code, and see where you stand against friends. Good for teams and training partners.

CONNECT WHAT YOU ALREADY USE
Apple Health, Google Fit, Strava, Fitbit and Whoop.

NO ACCOUNT REQUIRED
Open it and start. Everything works offline and stays on your device. Create an account only if you want it synced across devices or want to use a leaderboard.

Arete is Greek for excellence. Living up to your potential, daily, in the things that matter. That is the whole idea.
```

---

## Store settings

| Field | Value |
|---|---|
| Category | Health & Fitness |
| Tags | habit tracker, fitness, nutrition, workout log, self improvement |
| Contact email | oskarsteinicke@gmail.com |
| Website | https://get-arete.com |
| Privacy policy | https://get-arete.com/privacy |
| Content rating | Everyone (complete the questionnaire) |
| Ads | No |
| In-app purchases | **No** — see the blocker below |

## Graphics still needed

| Asset | Size | Notes |
|---|---|---|
| App icon | 512x512 PNG | `icon-512.png` exists |
| Feature graphic | 1024x500 PNG | Required. Does not exist yet. |
| Phone screenshots | min 2, up to 8 | 1080x1920 or similar 16:9 |

## Data safety questionnaire

Play asks separately from the privacy policy. Based on what the app does:

- Collects: email and name (accounts only), health and fitness data, photos
  (meal and progress photos), app activity
- Meal photos are sent to a third party for analysis (Gemini, via the Worker)
- Data is encrypted in transit
- Users can request deletion in app: Profile, then Delete account
- No data is sold

---

## Blocker: the Stripe paywall

`premium.js` gates Workout and Diet behind a $7.99/month subscription after a
7 day trial, taken through Stripe Checkout.

Google Play's Payments policy requires Google Play Billing for digital purchases
inside apps distributed on Play. Sending users to Stripe for a subscription is
grounds for rejection, and for removal if it is noticed later.

Three ways out:

1. **Ship Android with everything unlocked.** `window.Capacitor` is already
   truthy in the native build, so the gates can be skipped there. No billing
   code, no policy exposure. This also matches reality: every existing account
   was given free access, Stripe is not live, and taking money is on hold
   pending the DSO conversation anyway.
2. Implement Google Play Billing. Real work, and it cannot be used yet.
3. Submit as is. Expect rejection.

Option 1 is the only one that makes sense today. The listing above assumes it.
Do not tick "In-app purchases" in Play Console until billing actually exists.
