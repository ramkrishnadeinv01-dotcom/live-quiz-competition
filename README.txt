OLYMPIAD LIVE DETAILED RESULTS + REATTEMPT FIX

Replace these four files in the ROOT of the GitHub Pages repository:
academic-host.js
academic-host.html
academic-test.js
academic-test.html

Includes:
- Host participant table adds View Detail for each participant.
- Host detail view shows each question, participant answer, correct answer and status.
- Excel export has Summary and Question-wise Details sheets.
- Participant sees Reattempt This Test after submission.
- Reattempt overwrites the same participant's previous attempt record for that room.
- Existing private room name + mobile + class validation is retained.
- No Firebase rules changes are included.

IMPORTANT:
The screenshot shows "No room selected." The host must select an existing room in the room dropdown and click "Load Selected" before the live participant/results table can show that room's records.
Older submissions did not save selected answers, so question-wise detail is available only for attempts submitted after this update.
Reattempt replaces the previous result; it does not preserve attempt history.
This client-side practice test is not tamper-resistant for high-stakes exams.
