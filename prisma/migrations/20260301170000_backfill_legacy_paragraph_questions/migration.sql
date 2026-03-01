-- Backfill legacy paragraph questions that were historically saved as SHORT_ANSWER.
-- Heuristic: title/description explicitly mentions paragraph wording.
UPDATE "Question"
SET "type" = 'PARAGRAPH'
WHERE "type" = 'SHORT_ANSWER'
  AND (
    lower("title") LIKE '%paragraph%'
    OR lower("title") LIKE '%paragraf%'
    OR lower("title") LIKE '%paragprah%'
    OR lower(coalesce("description", '')) LIKE '%paragraph%'
    OR lower(coalesce("description", '')) LIKE '%paragraf%'
    OR lower(coalesce("description", '')) LIKE '%paragprah%'
  );