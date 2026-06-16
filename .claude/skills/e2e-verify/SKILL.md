# E2E Verification Skill (`/spartan-custom:e2e-verify`)

This skill automates the End-to-End browser verification flow for SpartanType Web using the built-in browser subagent.

## Purpose
Verifies that the Vite development server starts correctly, the UI page loads, mode transitions work, and the Dashboard parses session logs without console exceptions.

## Instructions

1. **Start the Dev Server**:
   - Run `npm run dev` in the background as a task using the `run_command` tool.
   - Wait for the Vite console output to show the server address (e.g. `http://localhost:5173` or `http://localhost:5174`). Note this address.

2. **Trigger Browser Subagent**:
   - Start the `browser_subagent` tool.
   - Provide the following task description:
     - "Navigate to the Vite dev server URL (e.g., http://localhost:5173)."
     - "Verify that the page title is 'SpartanType Web' and the navigation buttons are present."
     - "Click on the 'Calibration' navigation button and verify the CalibrationScreen UI renders."
     - "Click on the 'Dashboard' navigation button."
     - "Locate the file upload input (hidden behind the label 'Load Session JSON') and upload the test session file 'spartan-session-1781563797621.json' from the root of the workspace."
     - "Verify that the dashboard loads the score charts, the error heatmap, and the Plant classification canvas tree."
     - "Confirm that no Javascript errors or red error banners are displayed in the DOM."
     - "Take a screenshot of the dashboard page as verification."
   - Set the `RecordingName` to `dashboard_e2e_verification`.

3. **Check Results**:
   - Review the final report and screenshot returned by the subagent to ensure everything is correct.

4. **Tear Down**:
   - Stop the background Vite task using the `manage_task` tool with `Action="kill"`.
   - Report the E2E verification success to the developer.
