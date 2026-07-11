// Paged reads for the admin analytics pages. Supabase/PostgREST silently
// clamps ANY response to the project's max-rows setting (default 1000) — a
// plain .limit(20000) still returns at most 1000 rows with no error, which
// would make aggregates confidently wrong. Fetching in .range() pages of 1000
// stays under the clamp; callers must pass an ORDERED query so that when the
// page budget runs out the drop is deterministic (oldest rows), not arbitrary.

const PAGE_SIZE = 1000;

export type PagedResult<T> = {
  rows: T[];
  error: { message: string } | null;
  // True when maxPages filled up and more rows likely exist — callers should
  // treat aggregates as lower bounds (or move them into a SQL view).
  truncated: boolean;
};

export async function fetchAllPages<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  maxPages = 20,
): Promise<PagedResult<T>> {
  const rows: T[] = [];
  for (let i = 0; i < maxPages; i++) {
    const { data, error } = await page(i * PAGE_SIZE, (i + 1) * PAGE_SIZE - 1);
    if (error) {
      // Errors on page 0 mean the source is unavailable (e.g. migration not
      // applied) — surface that. A mid-run error keeps what we have.
      return { rows, error: i === 0 ? error : null, truncated: true };
    }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return { rows, error: null, truncated: false };
  }
  return { rows, error: null, truncated: true };
}
