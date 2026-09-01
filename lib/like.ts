/**
 * SQLite `LIKE` metacharacter escaping.
 *
 * User-typed search terms reach `LIKE` patterns in several list queries
 * (promos, clients, prospects, smart-lists). SQLite treats `%`, `_` and (with
 * an ESCAPE clause) `\` as wildcards inside `LIKE`, so an unescaped term like
 * `100%` matches far more than a literal "100%" — a Phase 3 review finding.
 *
 * Drizzle's `like()` helper has **no escape parameter** — its signature is
 * `(column, value)` only (see `node_modules/drizzle-orm/.../conditions.d.ts`),
 * and it emits a bare `LIKE` with no way to add an `ESCAPE` clause. To pass SQLite
 * an explicit escape character we therefore build the predicate with `sql`
 * (rawSql) and a literal `ESCAPE '\'`, binding the pattern as a parameter so the
 * value itself stays a bound string.
 *
 * Every helper here escapes `\`, `%` and `_` by prefixing a backslash and sets
 * `ESCAPE '\'`, so a search term matches its metacharacters literally while an
 * all-alphanumeric term produces an identical query to the old unescaped one.
 */
import { sql as rawSql, type Column, type SQL } from "drizzle-orm";

/**
 * Prefix `\`, `%` and `_` with a backslash so they match literally under a
 * `LIKE … ESCAPE '\'` comparison. A pre-existing backslash is itself escaped
 * first, so a literal `\%` in the source term cannot be misread as an escape
 * for the percent sign.
 */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** Wrap a raw term in the partial-match pattern `%term%`, metachars escaped. */
export function likePattern(term: string): string {
  return `%${escapeLike(term)}%`;
}

/**
 * `column LIKE '%term%' ESCAPE '\'`.
 *
 * SQLite's `LIKE` is ASCII-case-insensitive by default, which is what the
 * callers that rely on it expect.
 */
export function containsLike(column: Column | SQL, term: string): SQL {
  return rawSql`${column} LIKE ${likePattern(term)} ESCAPE '\\'`;
}

/**
 * `lower(column) LIKE '%term%' ESCAPE '\'` — for callers that match
 * case-insensitively at the column level.
 */
export function containsLikeLower(column: Column | SQL, term: string): SQL {
  return rawSql`lower(${column}) LIKE ${likePattern(term)} ESCAPE '\\'`;
}