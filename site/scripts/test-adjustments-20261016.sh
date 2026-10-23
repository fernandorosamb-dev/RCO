#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node --test \
 tests/preventive-roster.test.mjs \
 tests/imas-approve.test.mjs \
 tests/imas-timeout.test.mjs \
 tests/imas-schedule.test.mjs \
 tests/automation-feedback.test.mjs \
 tests/engineer-changes.test.mjs \
 tests/dashboard-correctives.test.mjs \
 tests/report-edit.test.mjs \
 tests/review-reports.test.mjs \
 tests/approval-review-transition.test.mjs \
 tests/engineer-access.test.mjs \
 tests/imas-flow.test.mjs \
 tests/photo-approval.test.mjs \
 tests/work-order-reschedule.test.mjs \
 tests/imas-photo-fields.test.mjs
