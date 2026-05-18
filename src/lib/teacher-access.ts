export type TeacherAccessRow = {
  granted_grades: unknown;
  access_expires_at: string | null;
};

export function teacherHasGradeAccess(
  teacher: TeacherAccessRow | null | undefined,
  gradeId: number,
  now = new Date(),
) {
  if (!teacher) return false;

  if (teacher.access_expires_at) {
    const expiresAt = Date.parse(teacher.access_expires_at);
    if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) {
      return false;
    }
  }

  if (!Array.isArray(teacher.granted_grades)) {
    return false;
  }

  return teacher.granted_grades.some((grade) => Number(grade) === gradeId);
}
