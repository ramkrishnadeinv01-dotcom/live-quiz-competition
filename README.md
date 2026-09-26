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

### 1. Enable Firebase Authentication for the host
Firebase Console → Build/Security → Authentication → Get started.
Enable:
- Email/Password (for host)

Student SMS/OTP authentication is **not used** in this version, so Firebase phone-auth billing is not required for students.

### 2. Publish the rules
Realtime Database → Rules → replace the rules with the contents of `database.rules.json` → Publish.

IMPORTANT: These rules are a starting point. The host login is protected by Firebase Authentication, but for a high-stakes paid competition you should add stronger server-side winner adjudication (for example Cloud Functions/Admin SDK) before the event.

### 3. Host
Open `host.html` on your GitHub Pages site.
Create a host account or sign in.
Create a room, save all questions, then use:
SHOW QUESTION → CLOSE ANSWERS → SHOW ANSWER & WINNER → NEXT QUESTION.

### 4. Participants
Give students the URL:
`student.html`
and the room code. They enter their **Name, Designation, Place of Posting and Mobile Number**. No OTP is sent. The same normalized mobile number can participate only once in a quiz room.

## Rules implemented
- Host controls question release.
- One answer per participant per question.
- Participant identity is based on the normalized mobile number for that quiz room.
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


## Host-controlled timer

When creating a new quiz room, the Host can set **Time per Question (seconds)**. The default is 30 seconds. Before the first question is shown, the Host can also change the timer in the room settings and click **Update Timer**.

When the Host clicks **SHOW QUESTION**, the timer starts. Participants see a countdown. When the time expires, the Host panel automatically closes the question and late submissions are rejected.


The Host Panel now displays the configured timer prominently and changes it to the live countdown when a question is shown.


The Host Panel separates two groups:
- **Blocked Winners** — legitimate prize winners who are blocked from all remaining questions and are not treated as disqualified.
- **Disqualified Participants** — participants blocked because of anti-cheating violations. The Host can use **UNBLOCK** when necessary; the previous violation history is retained.

Excel export creates separate sheets for **Prize Winners**, **All Participants**, **Answer Log**, **Question Results**, **Blocked Winners**, and **Disqualified Participants**.
