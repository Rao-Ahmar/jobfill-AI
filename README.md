# JobFill AI — Anti-Ghosting Job Application Assistant

JobFill AI is a cross-browser extension designed to supercharge your job search process. By safely storing your profile and resume locally, and leveraging the Anthropic Claude API, it allows you to automatically fill out job applications, parse modern ATS keywords, and easily generate cover letters.

## Features
- **Profile Matching:** Manage all your applicant data and use it across different platforms.
- **Easy Attach Resume:** Upload your PDF resume once, and the extension automates finding and uploading it on popular boards like LinkedIn, Lever, Greenhouse, etc.
- **Claude Cover Letters:** Generate contextual cover letters combining your resume and the actual job description.
- **ATS Keyword Analyzer:** Scan the job post against your resume and get immediate actionable feedback on missing keywords.
- **Local First & Secure:** Data is stored locally on your device (`browser.storage.local`). The Claude API is only invoked via your own key.

## Installation & Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start Dev Mode (Chrome)**
   ```bash
   npm run dev
   ```
   > This automatically builds the files for development. It creates the popup interface that you can preview.

3. **Load the Unpacked Extension in Chrome**
   - Open Chrome and navigate to `chrome://extensions`.
   - Toggle **Developer Mode** ON (top right corner).
   - Click **Load Unpacked**.
   - Select the newly generated `.output/chrome-mv3` directory.

4. **Add Claude API Key**
   - Click the extension icon to open JobFill AI.
   - Navigate to the **Settings** (⚙️) tab.
   - Enter your [Anthropic Console API Key](https://console.anthropic.com/).

5. **Build for Production**
   To create the production-ready build:
   - For Chrome: `npm run build`
   - For Firefox: `npm run build:firefox`

### Supported Platforms for Autofill
- LinkedIn
- Indeed
- Glassdoor
- Greenhouse
- Lever
- Workday
