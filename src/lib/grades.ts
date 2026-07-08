// Single source for the grade catalog. Grades 5–6 join here when their
// content lands.
export const GRADES = [7, 8, 9, 10, 11] as const;

export type GradeId = (typeof GRADES)[number];
