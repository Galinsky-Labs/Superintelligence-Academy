// Loads a learner's Academy records (shared by /api/me and /api/me/export).
export async function loadRecords(q,id){
 const [enrollments,progress,attempts]=await Promise.all([
  q.query('SELECT course_id,course_version,enrolled_at FROM enrollments WHERE identity_id=$1 ORDER BY enrolled_at',[id]),
  q.query('SELECT course_id,lesson_id,course_version,status,checkpoint,completed_at,updated_at FROM lesson_progress WHERE identity_id=$1 ORDER BY updated_at DESC',[id]),
  q.query('SELECT id,course_id,course_version,lesson_id,quiz_score,passed,practice_only,rubric,feedback,created_at FROM assessment_attempts WHERE identity_id=$1 ORDER BY created_at DESC LIMIT 200',[id])]);
 return {enrollments:enrollments.rows,progress:progress.rows,attempts:attempts.rows};
}
