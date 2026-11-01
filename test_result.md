#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================
## Test run: web sign-in popup guard + unsupported recipients (draft send/schedule)
Context: Brevo uses the user's own OAuth (no test credentials; real sign-in NOT testable here).
Demo mode is ENABLED for this run (EXPO_PUBLIC_DEMO_MODE=1) so draft send/schedule UI is reachable via "Use sample data".

Frontend (demo) to verify:
- Campaign detail for a draft targeting individually-added contacts (DEMO draft id 16):
  shows info box text EXACTLY "This campaign includes individually added contacts. Schedule it on Brevo web."
  and NO "Schedule" button, NO bullet list.
- Ready draft (DEMO id 2): shows primary "Schedule" button; tapping opens the Schedule sheet
  ("When would you like to send the campaign?", Send now / Schedule for later).
- Draft missing subject (DEMO id 7): shows "Complete all required steps on Brevo web to send this campaign."
  with a bullet "Subject".
- No regressions on Campaigns list, Contacts list, Settings.

Backend (session-protected) sanity:
- GET /api/brevo/campaigns/{id}/readiness, POST .../send-now, POST .../schedule must reject
  unauthenticated requests (401/403). Real-Brevo readiness logic not testable without a live session.

NOT testable here (needs the user's real Brevo account on desktop web / Expo Go):
- Web popup sign-in no-false-error fix (oauth-complete popup guard).
- Real unsupported-recipients detection from a real campaign's recipients keys.

## Test run: /oauth-complete never stuck on spinner (web)
Demo mode ENABLED (EXPO_PUBLIC_DEMO_MODE=1). Real Brevo OAuth is NOT testable (user's own account).
Frontend web routing to verify at path /oauth-complete:
- Logged OUT, open /oauth-complete (no query params): must redirect to /login within a few seconds
  (NOT stay on the spinner).
- Logged IN via "Use sample data" first, then open /oauth-complete: must redirect to /campaigns.
- No regressions: login screen renders; Campaigns/Contacts/Settings load after sample login.
NOT testable here: real sign-in success/false-error, popup-opener path (needs real OAuth on desktop web/Expo Go).

## Re-test after fixes (iteration 3 follow-up)
Fixed:
- HIGH: tabs showed blank data / infinite Settings spinner on browser RELOAD while a session is stored.
  Fix: app/(tabs)/_layout.tsx now shows a spinner while BrevoContext.loading is true and mounts the tab
  screens only AFTER the session resolves, so each screen's first focus-load runs with a token.
- MEDIUM: oauth-complete 8s safety-net timer now reads isConnected via a ref (connectedRef) instead of
  the stale first-render value.
- LOW: tab bar background is now opaque (colors.surface) on web + android (transparent only on iOS).

Please verify (frontend web, demo mode ON, use "Use sample data"):
1. Reload regression: sign in via sample data -> open Campaigns (40 campaigns) -> RELOAD the browser:
   Campaigns must still show its campaigns (NOT the empty state). RELOAD on Settings: the Account card
   must populate (NOT spin forever). RELOAD on Contacts: contacts list still loads.
2. /oauth-complete still routes correctly: logged out -> /login; logged in -> /campaigns; never stuck on spinner.
3. No regressions switching between Campaigns/Contacts/Settings tabs.
