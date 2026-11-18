WORLD OF EXAM — V83.5 GITHUB UPLOAD

HOW TO UPLOAD
1. Download and extract this ZIP.
2. Keep a backup copy of your current GitHub repository first.
3. Upload/replace the website files in the GitHub repository with the contents of this extracted folder. Upload the contents, not the enclosing folder itself.
4. Commit the changes and allow GitHub Pages to publish.
5. Open the website and do a hard refresh (Ctrl+F5) to load the new script version.

IMPORTANT
- Do not run Firebase deploy for this GitHub Pages update.
- Do not replace or publish live Firebase Realtime Database Rules from the database.rules.json file in this ZIP.
- Firebase rules and live data are unchanged by a GitHub Pages upload.
- First test the host-request flow with one approved test host and one approved test participant. If an error appears, share the exact error text/screenshot before changing Firebase Rules.

WHAT CHANGED
V83.5 repairs a partial host-approval retry: if the participant's main host mapping was saved but the host participant index was not, retrying approval now attempts to rebuild the index and then closes the request as approved.

This package is not represented as live-Firebase-tested. Existing portal features are retained from the supplied V83.4 base.
