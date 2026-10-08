v13 - registration button fallback and cache refresh

# Live Quiz Competition — Competition Close Update

This version adds a final **CLOSE COMPETITION** control.

## Competition closing behavior
- Host Panel has a **🔒 CLOSE COMPETITION** button.
- When the host closes the competition, the room is permanently marked `competitionClosed: true` for that quiz room.
- New participants entering the room code are shown: **“This competition is closed. You cannot join this room now.”**
- Participants already on the quiz screen immediately see: **“Competition Closed — This competition has been closed by the host. No further participation is allowed.”**
- The participant screen clears the current question, timer, answer options and previous winner display, so the last-question winner is no longer shown after closure.
- Question controls are locked after closure.
- Excel export remains available to the host.

All existing timer, Word upload, winner/blocking, disqualification/unblock and Excel features are retained.


## Competition Close / Freeze
After the host clicks CLOSE COMPETITION, the room enters competition_closed state. Participant anti-cheat events (leaving the page, tab switch, blur, fullscreen exit) are ignored after closure, so no participant can become newly disqualified after the competition has ended. Participant records, winners and disqualification lists remain frozen from client-side actions.


V44: Host Portal redesigned with an elegant home/control centre. Live Quiz Competition moved to host-live-quiz.html; MCQ and General Exam Setup remain on their existing pages. Core Live Quiz functionality remains unchanged.


Version 45: fixed Host Portal authentication persistence so Live Quiz Competition retains the signed-in host when navigating from Host Home.


## v51 — Other Exam Result Publication
- Added Host Portal → Other Exam Result Publication.
- Added Excel template: `Other_Exam_Result_Upload_Template.xlsx`.
- Approved hosts/Admin can upload one publication set at a time.
- Excel rows are imported into Firebase under hashed mobile-number keys; the Excel file is not the live database after upload.
- Participant Dashboard → Result → Result of Other Exam searches by mobile number only.
- Participants can download an individual result or all their published Other Exam results as PDF.
- Other Exam Results are separate from Quiz/MCQ/General Exam results.


V53 FIX: Other Exam Result Excel upload now accepts "Student Name" (as used by the official template) and correctly treats "Overall Rank"/"Overall Grade" as overall fields rather than subject fields.
