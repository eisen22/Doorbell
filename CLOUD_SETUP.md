# Doorbell cloud setup (Firebase, free Spark plan)

Project: **doorbell-ph** · Firestore region: **asia-southeast1 (Singapore)**

The web config is already saved in `web/.env.local`. You only need the steps below once.

## A. In the Firebase console (browser)

1. **Authentication → Get started → Sign-in method → Email/Password → Enable → Save**
2. **Firestore Database → Create database** → Location **asia-southeast1 (Singapore)** → **Start in production mode**
3. **Authentication → Settings → Authorized domains → Add domain** → `eisen22.github.io`
4. **⚙ Project settings → Service accounts → Generate new private key**
   Save it as `cloud\serviceAccount.json`. **Secret: never share it or upload it** (it is in `.gitignore`).

## B. On your computer (VS Code terminal)

```powershell
# 1. Firebase command-line tool (once)
npm install -g firebase-tools
firebase login

# 2. Upload the security rules and indexes
cd C:\Users\diego\Documents\SafeArrival
firebase deploy --only firestore

# 3. Create the staff accounts and load the demo school (June 8, 2026 to today)
cd cloud
npm install
$env:SEED_PASSWORD="pick-a-strong-password-here"
npm run seed
```

The seed creates these sign-in accounts, all with your `SEED_PASSWORD`:

| Account | Role |
|---|---|
| admin@sunnyside.edu.ph | School admin |
| maria.santos@sunnyside.edu.ph | Teacher, Kindergarten I - Apple |
| jose.ramirez@sunnyside.edu.ph | Teacher, Kindergarten I - Mango |
| ana.villanueva@sunnyside.edu.ph | Teacher, Kindergarten II - Banana |
| liza.aquino@sunnyside.edu.ph | Teacher (no section yet) |

Running the seed again **replaces** all data with a fresh demo school.

## C. Switch the app to the cloud

In `web/.env.local` change the last line to:

```
VITE_DOORBELL_MODE=cloud
```

Restart the dev server (`npm run dev` in `web`). The sidebar footer should say **Connected to the cloud**.

## D. Use the cloud on the GitHub Pages link

GitHub repo → **Settings → Secrets and variables → Actions → Variables tab → New repository variable**. Add each one:

| Name | Value |
|---|---|
| VITE_FIREBASE_API_KEY | AIzaSyBn4fgAC94IJkwfWJcjKgRnwcL2rT5wQzA |
| VITE_FIREBASE_AUTH_DOMAIN | doorbell-ph.firebaseapp.com |
| VITE_FIREBASE_PROJECT_ID | doorbell-ph |
| VITE_FIREBASE_STORAGE_BUCKET | doorbell-ph.firebasestorage.app |
| VITE_FIREBASE_MESSAGING_SENDER_ID | 49179529885 |
| VITE_FIREBASE_APP_ID | 1:49179529885:web:64c28fce1f6fcb9a11ba74 |
| VITE_DOORBELL_MODE | cloud |

Then push any change (or Actions → Deploy → **Run workflow**). Your teammates sign in with the accounts above.

## How it works

- **Sign-in:** Firebase Authentication (email + password). Each account has a `users/{uid}` document with its role. Accounts without one cannot read anything.
- **Data:** Firestore. One document per section per school day holds that day's attendance.
- **Rules (`firestore.rules`):** admins manage everything; teachers write attendance only for their own section; the audit log cannot be edited.
- **Auto-confirm:** any signed-in teacher or admin browser auto-confirms past school days nobody confirmed, and today's after the section's auto-confirm time. This runs without paid Cloud Functions.
- **New teachers:** adding a teacher in the admin portal creates their sign-in account and shows a temporary password once.
- **SMS:** texts are recorded in the `sms` collection and shown on the SMS Messages page. Sending real texts needs an SMS provider (e.g. Semaphore) connected through a small sender service. This is the next step.

## Free plan limits (check the Usage tab in the Firebase console)

Firestore's free tier allows a limited number of reads and writes per day. Opening the app loads the school's data once (roughly 500 to 1,000 reads for an admin, fewer for a teacher), then only changes. That is plenty for testing and a defense demo. Avoid leaving many tabs open and reloading constantly.
