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
