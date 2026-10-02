# JobHunt OS — Chrome Extension (Manifest V3)

Automated Job Search Copilot, residential DOM scraper, and truth-constrained Easy Apply autofill.

## Overview

- **Residential Execution**: Runs directly inside your local Chrome/Brave/Edge browser profile on your residential IP, eliminating proxy flags or datacenter blocking from platforms like LinkedIn and Naukri.
- **Direct Fastify Gateway Connection**: Streams parsed job postings and candidate facts to your local JobHunt OS API (`http://127.0.0.1:4000`).
- **Zero-Fabrication Auto-Filler**: Automatically fills screening questions and application inputs against your verified candidate profile table (`packages/core/src/profile.ts`), never claiming gap skills or fabricating metrics.

## Installation (Unpacked)

1. Open your Chromium-based browser (Google Chrome, Brave, Arc, Edge).
2. Navigate to `chrome://extensions` in the address bar.
3. Enable **Developer mode** toggle in the top-right corner.
4. Click **Load unpacked** in the top-left toolbar.
5. Select the `apps/extension` directory from this repository.
6. The **JobHunt OS Copilot** icon will appear in your browser extension toolbar!

## Usage

1. **Start the JobHunt OS backend**:
   ```bash
   pnpm api
   ```
2. **Open LinkedIn or Naukri**:
   - Navigate to `https://www.linkedin.com/jobs` or search for roles.
   - The floating JobHunt OS Dock will dock in the bottom-right corner.
   - Click **⚡ Sync Page Jobs to OS** to batch-ingest visible postings straight into your database and scoring pipeline.
   - When an **Easy Apply** modal is open, click **🤖 Auto-Fill Easy Apply** to auto-fill your contact info, location, and verified experience with zero hallucinations.
3. **Cockpit Access**:
   - Click the extension icon in the Chrome toolbar to verify Fastify health status (`ONLINE (:4000)`), view LinkedIn application quota usage, or launch the web dashboard (:3000).
