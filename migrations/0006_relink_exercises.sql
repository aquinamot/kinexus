UPDATE workout_exercises
   SET exercise_id = (SELECT e.id FROM exercises e WHERE e.name = workout_exercises.custom_name ORDER BY e.id LIMIT 1)
 WHERE exercise_id IS NULL
   AND custom_name IS NOT NULL
   AND EXISTS (SELECT 1 FROM exercises e WHERE e.name = workout_exercises.custom_name);
UPDATE workout_exercises SET custom_name = NULL WHERE exercise_id IS NOT NULL;
