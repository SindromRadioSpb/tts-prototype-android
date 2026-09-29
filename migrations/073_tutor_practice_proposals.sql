-- M4 continuation: a practice suggestion is advisory until the owner starts it.
-- Existing M2 rows represent an already accepted exercise.
ALTER TABLE tutor_practice ADD COLUMN proposal_state TEXT NOT NULL DEFAULT 'accepted'
  CHECK(proposal_state IN ('proposed','accepted','completed','dismissed'));
UPDATE tutor_practice SET proposal_state='completed' WHERE receipt_json IS NOT NULL;
