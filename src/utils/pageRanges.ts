/**
 * Utility functions for converting between page number sets and range strings (e.g. "1-3, 5, 7").
 */

/**
 * Converts a list of 1-based page numbers into a clean, canonical range string.
 * e.g. [2, 3, 5] -> "2-3, 5"
 * e.g. [1, 2, 3, 4] -> "1-4"
 * e.g. [1, 3, 5] -> "1, 3, 5"
 */
export function formatPageRanges(pageNumbers: number[]): string {
  if (pageNumbers.length === 0) return '';
  const sorted = Array.from(new Set(pageNumbers)).sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const curr = sorted[i];
    if (curr === prev + 1) {
      prev = curr;
    } else {
      ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
      start = curr;
      prev = curr;
    }
  }
  ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
  return ranges.join(', ');
}

/**
 * Parses a comma-separated range string (e.g. "2 - 3, 5") into a Set of 1-based page numbers.
 * Clamps indices to maxPages if provided.
 */
export function parseRangeStringToSet(rangeStr: string, maxPages: number = 99999): Set<number> {
  const result = new Set<number>();
  if (!rangeStr || !rangeStr.trim()) return result;

  const tokens = rangeStr.split(',').map((t) => t.trim()).filter(Boolean);
  for (const token of tokens) {
    if (token.includes('-')) {
      const parts = token.split('-').map((s) => s.trim());
      if (parts.length >= 2) {
        const start = parseInt(parts[0], 10);
        const end = parseInt(parts[1], 10);
        if (!isNaN(start) && !isNaN(end)) {
          const s = Math.max(1, Math.min(start, end));
          const e = Math.min(maxPages, Math.max(start, end));
          for (let p = s; p <= e; p++) {
            result.add(p);
          }
        }
      }
    } else {
      const p = parseInt(token, 10);
      if (!isNaN(p) && p >= 1 && p <= maxPages) {
        result.add(p);
      }
    }
  }
  return result;
}
