# Lead workflow implementation plan

> **For agentic workers:** Implement the tasks below in order and verify each result.

**Goal:** Let the owner review business leads, exclude poor prospects, track contact work, and see the best opportunities first.

**Architecture:** Keep editorial decisions in a separate SQLite table keyed by source and place ID, so imports cannot overwrite them. Apply conservative automatic exclusions in SQL and calculate a transparent priority score from manual checks and source fields. Add one local API endpoint for edits and compact controls on each business card.

**Tech Stack:** Next.js 15, React, TypeScript, SQLite, Vitest.

**Spec:** User request on 2026-11-12 to implement four suggested radar improvements.

## Task 1: Qualification and persistence

- [x] Add a `lead_workflow` migration with place and website review, contact status, dates, notes, and timestamps.
- [x] Add a validated PATCH endpoint that updates a single business record in a transaction and never changes imported source rows.
- [x] Test invalid updates and persistence across a simulated reimport.

## Task 2: Cleanup and priority

- [x] Define conservative exclusion rules for public institutions, shopping malls, prominent chains, and non-local telephone numbers.
- [x] Join workflow to business searches, hide excluded or manually disqualified rows by default, and expose an include-excluded filter.
- [x] Score and sort manually confirmed local prospects first; show the reason for their priority.
- [x] Test representative eligible and excluded rows and filtering/pagination.

## Task 3: User interface

- [x] Add controls to verify Maps/business and site status, contact progress, last contact, next action, and notes.
- [x] Make updates visible immediately and preserve the current search/filter context.
- [x] Show priority and the difference between source absence and manual confirmation.
- [x] Verify desktop and mobile layouts in the browser.

## Task 4: Delivery

- [x] Run tests and production build.
- [x] Restart local production server with the updated build, then confirm both API modalities and UI.
- [x] Update README with workflow and filtering behavior.

## Review focus

- [x] A new import does not erase manual review.
- [x] A manually marked existing site disappears from the default queue but can be found with include-excluded.
- [x] Inputs cannot mutate another source or execute arbitrary SQL.
- [x] A business with a non-SP number is excluded by default.
- [x] Public requests keep their existing behavior.
