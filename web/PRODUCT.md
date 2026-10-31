# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- **Teachers** (primary): use Doorbell every school day on a laptop or phone. They watch arrivals come in from the school-gate scanner, then confirm attendance (present, late, absent, excused) once the children are actually in the classroom. Some teach more than one class a day.
- **School admin** (registrar/principal): sets up the school year, calendar, sections, teachers and students, prints ID cards, watches long absences.
- **Parents/guardians**: never open the website. They only receive SMS messages (arrival, late, 3-day absence streak).

## Product Purpose
Safe Arrival: a barcode-based attendance checking and SMS notification system for child safety in schools. A child's ID card is scanned at the school gate; the parent gets a text that the child arrived; the teacher confirms classroom attendance; three absences in a row raise an alert. Success means every parent knows their child arrived, and no long absence goes unnoticed.

## Positioning
Built for a Philippine public elementary school: DepEd school calendar (SY 2026-2027) plus local holidays (Baguio Charter Day), Philippine mobile numbers, SMS instead of an app parents must install.

## Operating Context
- Scanner (USB barcode/QR reader) placed at the school gate; the teacher confirms only after students are in the classroom.
- Teachers check the dashboard between and during classes; the admin works at a desk.
- Firebase (Auth + Firestore), deployed on GitHub Pages.

## Capabilities and Constraints
- Name stays **Doorbell**. Every screen and feature stays; layouts may be rearranged if that helps.
- Teacher pages: Dashboard, Attendance, My Students, Calendar, Reports (Excel), Alerts, SMS Messages, Settings.
- Admin pages: Overview, Absence Watch, School Calendar, Sections, Teachers, Students, ID Cards, Settings & SMS, Audit Log.
- Status is always icon + word, never color alone.

## Brand Commitments
- Name: Doorbell. The look must not read as AI-generated (user's explicit concern).

## Evidence on Hand
- Sample school data (Sunnyside, 4 teachers, 89 children) for demos. No real testimonials or school logos.

## Product Principles
1. A teacher should know who has arrived within one glance.
2. Plain words over jargon; the people using it are teachers, not IT staff.
3. Nothing important is shown by color alone.

## Accessibility & Inclusion
Readable for older teachers: comfortable text size, strong contrast, 44px touch targets.
