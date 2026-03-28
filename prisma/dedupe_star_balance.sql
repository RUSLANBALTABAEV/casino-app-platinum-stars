-- Удаление дубликатов в таблице StarBalance
-- Оставляем запись с минимальным id для каждого userId

WITH ranked AS (
  SELECT id, userId,
         ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY id) AS rn
  FROM "StarBalance"
)
DELETE FROM "StarBalance"
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);







