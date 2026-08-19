# Chair — a barber shop book

A small standalone app for running a one-chair shop: who you've cut, who's
next, what they paid, and who still owes you.

Open it at `/barber/`. No build step, no server, no account — it is plain
HTML/CSS/JS and every record lives in `localStorage` on the device that
entered it. It installs to a phone home screen as a PWA and works offline.

## What it does

- **Today** — the day's takings, who is still due in the chair, and one tap
  to log a walk-in.
- **Up next** — everything on the books, bookings you never closed out, and
  regulars who are past their usual gap and have nothing booked.
- **Clients** — searchable list with last cut, lifetime spend, and what they
  owe. Each profile keeps their phone, price, notes and full history.
- **Money** — week/month takings, last 7 days, who owes you (settle several
  cuts at once), and a breakdown of how people paid.
- **Settings** — shop name, currency, services and prices, payment methods,
  JSON backup/restore and CSV export.

## Data

| Key | What's in it |
| --- | --- |
| `barber_clients` | `{ id, name, phone, price, interval, notes, createdAt }` |
| `barber_cuts` | `{ id, clientId, date, time, service, price, done, paid, method, paidDate, notes }` |
| `barber_settings` | shop name, currency, default price and gap, services, payment methods |

A cut with `done: false` is a booking; `done: true, paid: false` is money
owed. Nothing is ever sent off the device, so take a backup from Settings
before switching phones.

The `interval` on a client is optional — left at 0, how often they come in is
worked out from the gaps in their own history.
