# Safe Arrival

Barcode-based attendance checking and SMS notification system for child safety in schools (Kindergarten first).

## Status

| Step | Part | Status |
|---|---|---|
| 1 | Teacher web UI (mock data) | Done |
| 2 | Admin web UI (mock data) | Next |
| 3 | Cloud (Firebase + Node worker + SMS) | Planned |
| 4 | Phone scanner (PWA) | Planned |
| 5 | Wrap-up (tests, docs, deploy) | Planned |

## Run the teacher web app

```powershell
cd web
npm install
npm run dev      # http://localhost:5173
npm test         # rules + mock repository tests
npm run build    # production build in web/dist
```

The app runs on in-memory demo data (fake names). Data resets when you reload the page.
Outside 6:30 to 9:30 AM the demo simulates a school morning ("Demo clock" tag on the dashboard).

## Project layout

```
web/src/
  domain/types.ts        shared data model (web, worker, scanner)
  domain/rules.ts        attendance, streak and SMS rules (pure, unit tested)
  data/repository.ts     THE CONTRACT the UI talks to
  data/mock/             in-memory adapter + fake Filipino demo data
  lib/repo.tsx           provider + live-reloading hook (swap adapter here)
  lib/excel.ts           .xlsx export (Daily Grid, Summary, Raw Log)
  components/            shell, UI pieces, SMS simulator
  pages/                 Dashboard, Attendance, Students, Scanner, Reports, Notifications, Settings
  styles/tokens.css      colors, radii, shadows (change the look here)
```

## Demo script

1. Dashboard: today's section card, weekly chart, arrivals feed, attention list.
2. Scanner > "Simulate a child arriving", then open **SMS Simulator** (top bar) to see the parent text.
3. Paste the same token twice: duplicate protection.
4. Attendance > **Confirm attendance**: unscanned children become absent and the day locks; edits now need a reason.
5. Notifications: the seeded 3-day streak alert and a failed SMS with Resend.
6. Reports > Download .xlsx.
