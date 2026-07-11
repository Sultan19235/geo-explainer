// Single source for the grade catalog.
export const GRADES = [5, 6, 7, 8, 9, 10, 11] as const;

export type GradeId = (typeof GRADES)[number];
