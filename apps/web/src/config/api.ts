/**
 * Single source of truth for backend URLs.
 *
 * Previously 16 files hardcoded `http://localhost:8001` as a fallback and
 * env.example advertised port 8000, so dev and prod disagreed depending on the
 * file. Import from here instead of reading process.env directly.
 */

/** Origin of the API server, without trailing slash and without /api. */
export const API_ORIGIN = (process.env.REACT_APP_API_ORIGIN || 'http://localhost:8001').replace(/\/$/, '');

/** Base URL for REST calls (what axios is configured with). */
export const API_URL = process.env.REACT_APP_API_URL || `${API_ORIGIN}/api`;

/**
 * Absolute URL for a file served by the API under /uploads.
 * Accepts the relative `fileUrl` values stored in the database
 * (e.g. "/uploads/properties/<id>/photo.jpg").
 */
export function fileUrl(relativePath: string | null | undefined): string {
  if (!relativePath) return '';
  if (/^https?:\/\//i.test(relativePath)) return relativePath;
  return `${API_ORIGIN}${relativePath.startsWith('/') ? '' : '/'}${relativePath}`;
}
