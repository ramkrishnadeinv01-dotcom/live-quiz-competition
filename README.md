# Live Quiz Competition — Firebase + GitHub Pages

This package is connected to the Firebase project shown during setup:
**Hindi Question-Answer Platform**

## Files
- `host.html` — host control panel
- `student.html` — student panel
- `host.js` / `student.js` — realtime quiz logic
- `firebase-config.js` — your Firebase web configuration
- `database.rules.json` — starter rules
- `styles.css` — responsive UI

## Before first use

### 1. Enable Firebase Authentication
Firebase Console → Build/Security → Authentication → Get started.
Enable:
- Email/Password (for host)
- Anonymous (for students)

### 2. Publish the rules
Realtime Database → Rules → replace the rules with the contents of `database.rules.json` → Publish.

IMPORTANT: These rules are a starting point. The host login is protected by Firebase Authentication, but for a high-stakes paid competition you should add stronger server-side winner adjudication (for example Cloud Functions/Admin SDK) before the event.

### 3. Host
Open `host.html` on your GitHub Pages site.
Create a host account or sign in.
Create a room, save all questions, then use:
SHOW QUESTION → CLOSE ANSWERS → SHOW ANSWER & WINNER → NEXT QUESTION.

### 4. Students
Give students the URL:
`student.html`
and the room code. They enter their name, unique student ID and city.

## Rules implemented
- Host controls question release.
- One answer per student per question.
- Only correct answers are eligible.
- Fastest recorded server receipt is considered first.
- Exact equal fastest server-receipt timestamps trigger random tie selection.
- Once a participant wins a prize, they are blocked for the rest of that quiz.
- Excel export is available from the host panel.

## Important timing note
The database records a Firebase server timestamp when the answer is written. The displayed elapsed time is also calculated in the browser from the question's opening timestamp. For a prize event where disputes must be impossible, use a server-side adjudicator/Cloud Function so the authoritative elapsed time and tie resolution cannot be altered by a browser.

## GitHub Pages
Upload all files to a repository. Settings → Pages → Deploy from branch → main / root. Then use:
`https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/host.html`
for the host and:
`https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/student.html`
for students.
