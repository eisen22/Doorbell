# Doorbell

**Safe Arrival: A Barcode-Based Attendance Checking and SMS Notification System for Child Safety in Schools.**
Kindergarten first. Parents get an SMS when their child arrives, and when the child is late or absent 3 school days in a row.

## Status

| Step | Part | Status |
|---|---|---|
| 1 | Teacher web (mock data) | Done |
| 2 | Admin web (mock data) | Done |
| 3 | Cloud (Firebase + Node worker + SMS) | Next |
| 4 | Phone scanner (PWA) | Planned |
| 5 | Wrap-up (tests, docs, deploy) | Planned |

## Run

```powershell
cd web
npm install
npm run dev      # http://localhost:5173
npm test         # rules, calendar, auto-assign, import and repository tests
npm run build    # production build in web/dist
```

Demo data is in memory with fake names, and it resets when you reload the page.
Switch between the teacher and admin portals from the name menu (top right).

## School calendar

The template is **DepEd Order No. 009, s. 2026** (three-term SY 2026-2027, June 8, 2026 to April 8, 2027), plus **Baguio Charter Day** (Sept 1, RA 6710).
The two "half day" entries and the July 23 suspension are examples. Admins can edit any day.

| Color | Meaning | Class? |
|---|---|---|
| Green | Class day | Yes |
| Blue | Class day with a school event | Yes |
| Orange | Half day | Yes |
| Purple | Holiday (outlined = local Baguio holiday) | No |
| Red | Class suspension | No |
| Gray stripes | Break (wellness, INSET, year-end) | No |
| Green outlined | Make-up class | Yes |

DepEd counts 201 class days, including wellness-break and INSET days when learners do guided work at home.
Doorbell counts only days children are physically in school, because those are the days attendance is taken.

## Project layout

```
web/src/
  domain/types.ts        shared data model
  domain/rules.ts        attendance, streak and SMS rules (pure, tested)
  domain/calendar.ts     day types + DepEd SY 2026-2027 template
  domain/assign.ts       auto-assign students to sections
  data/repository.ts     THE CONTRACT the UI talks to
  data/mock/             in-memory adapter + fake demo data
  lib/excel.ts           attendance export (.xlsx)
  lib/studentImport.ts   student import template, parsing, validation
  pages/                 teacher pages
  pages/admin/           admin pages
  components/            shell, year calendar, SMS simulator, UI pieces
```

## Demo script

**Teacher:** Dashboard, Calendar, Scanner ("Simulate a child arriving", open the SMS Simulator), Attendance (Confirm), Notifications, Reports (Excel).

**Admin:** School Calendar (click a day to change it, or press Declare suspension), Sections (add, color, teacher, schedule), Teachers, Students (Import Excel with preview, Auto-assign with Undo, transfer/drop, reissue card), ID Cards (print QR or Code 128), Settings & SMS (templates, test SMS), Audit Log.
