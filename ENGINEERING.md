# Engineering decisions and verification

This document describes the current implementation. It does not imply production-scale usage or independent human authorship of generated code.

## Duplicate receipt confirmation

An application-level lookup can reject an already-saved photo before another Gemini request. It cannot prevent a race where two confirmations both observe no existing expense. A PostgreSQL unique index on `(owner_id, photo_sha256)` decides which write succeeds; the API returns a conflict for the other. The fingerprint is derived from exact image bytes, not the extracted purchase details.

The concurrent confirmation test sends two requests for the same scan/photo, asserts one `201` and one `409`, and verifies only one saved expense. It also checks a later duplicate is rejected before another Gemini call. Different photos of the same purchase are not detected as duplicates.

## Ownership at two boundaries

Express verifies the caller and checks membership. PostgreSQL row-level security and column privileges also enforce ownership, so callers cannot bypass the API and edit another user's expenses directly through Supabase. A protected membership role grants the finance reviewer read access to team expenses, without granting permission to edit another member's records.

Tests query the database as separate users, attempt cross-owner writes and self-promotion, and check access after demotion. PGlite executes the migrations and database rules; simulated authentication is not a live Supabase integration test.

## Money and extracted data

Amounts use integer satang. Detailed expenses must satisfy `sum(lineItems) + sum(adjustments) = totalPaidSatang`, enforced in both application validation and a database constraint. The extraction instructions prohibit inventing a balancing adjustment to make a receipt pass; the arithmetic check cannot establish whether an adjustment was actually printed. Users review incomplete or mismatched scans before saving.

Tests cover mismatches, invalid amounts, direct database writes and atomic rejection of invalid changes. Simulated Gemini responses exercise quota errors, truncation, malformed JSON and missing fields. These are checks of application behavior, not a benchmark of extraction quality on real receipts. Arithmetic agreement alone cannot establish that the extracted text or amounts match the original image.

## What CI establishes

The CI workflow runs on pushes and pull requests, with a manual trigger available. It installs locked dependencies, runs backend and frontend tests, checks types and builds the frontend and standalone prototype. No application credentials or live services are required.

The baseline is **45 test cases: 44 backend and 1 frontend**. This counts Vitest test cases, not assertions, receipt samples, coverage percentage or a measure of independent review. Both implementation and most test code were generated with Codex under the author's overall application design. Passing tests alone do not demonstrate independent verification of the design.

## Remaining checks

- Live Google OAuth and Supabase configuration.
- Extraction quality using a labeled set of Thai and English receipt images.
- Deployed routing, platform limits and end-to-end behavior.
- Load testing, operational monitoring and failure recovery under real traffic.

The repository has no production uptime, scale or extraction-accuracy claim. CI validates the code; it does not deploy it.
