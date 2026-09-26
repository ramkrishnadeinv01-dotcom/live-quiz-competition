# Live Quiz Competition — Word MCQ Upload Version

This package keeps the existing Firebase + GitHub Pages quiz and adds a Host Panel feature to import MCQs from a `.docx` Word document.

## Word document format

Use:
1. Numbered question, e.g. `1. Question text`
2. Four options:
   - `A. Option A`
   - `B. Option B`
   - `C. Option C`
   - `D. Option D`
3. An `Answer Key` section with entries such as `1 A`, `2 B`, etc.

The importer does NOT read or create prize amounts from the Word document.

## Import workflow

1. Host signs in.
2. Create or resume a quiz room.
3. Select the `.docx` file under **Upload MCQ Word Document**.
4. Click **Import Questions**.
5. Confirm the number of questions found.
6. The questions are saved to the current Firebase room.
7. The existing **Prize (₹)** field remains available for each question. The current prize field value is used as the initial prize for all imported questions, and the host can edit each question's prize before the quiz.

## Included features

- Participant Panel naming
- No OTP / no SMS requirement
- One mobile number per quiz
- Host-controlled live questions
- One prize per participant
- Anti-cheating disqualification
- Random tie handling
- Resume saved quiz rooms
- Excel export
- Word `.docx` MCQ import

## External libraries

The Host Panel loads:
- SheetJS for Excel export
- JSZip in the browser for reading the `.docx` ZIP/XML structure

Both are loaded from public CDNs when the Host Panel is opened.
