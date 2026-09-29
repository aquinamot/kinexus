ALTER TABLE exercises ADD COLUMN discipline TEXT NOT NULL DEFAULT '';
ALTER TABLE exercises ADD COLUMN category TEXT NOT NULL DEFAULT '';
ALTER TABLE exercises ADD COLUMN difficulty TEXT NOT NULL DEFAULT '';
ALTER TABLE exercises ADD COLUMN secondary_muscles TEXT NOT NULL DEFAULT '';
ALTER TABLE exercises ADD COLUMN description TEXT;
ALTER TABLE exercises ADD COLUMN steps TEXT;

-- Preserva o nome do exercício nas planilhas já importadas antes de apagar o
-- catálogo, senão workout_exercises fica sem exercise_id E sem custom_name.
UPDATE workout_exercises
   SET custom_name = (SELECT name FROM exercises WHERE exercises.id = workout_exercises.exercise_id)
 WHERE exercise_id IS NOT NULL;
UPDATE workout_exercises SET exercise_id = NULL;
DELETE FROM exercises;
