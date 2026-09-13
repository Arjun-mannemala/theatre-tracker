import * as DB from './db';

const BASE = 'https://api.themoviedb.org/3';
export const IMG = 'https://image.tmdb.org/t/p/w185';

export async function getKey() {
  return DB.getSetting('tmdb_key', '');
}

export async function setKey(k) {
  return DB.setSetting('tmdb_key', (k || '').trim());
}

/**
 * Search never blocks film entry. On any failure it returns an empty
 * list and the caller falls back to a plain typed title.
 */
export async function search(query) {
  const key = await getKey();
  if (!key || !query || query.trim().length < 2) return [];
  const url =
    `${BASE}/search/movie?api_key=${encodeURIComponent(key)}` +
    `&query=${encodeURIComponent(query.trim())}&include_adult=false`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return [];
    const json = await res.json();
    return (json.results || []).slice(0, 8).map((m) => ({
      tmdb_id: m.id,
      title: m.title || m.original_title,
      release_date: m.release_date || null,
      poster: m.poster_path ? IMG + m.poster_path : null,
      language: m.original_language === 'te' ? 'Telugu' : m.original_language,
      overview: m.overview,
    }));
  } catch (e) {
    return [];
  }
}

/** Genres and lead actor, fetched after the film is already saved. */
export async function details(tmdbId) {
  const key = await getKey();
  if (!key || !tmdbId) return null;
  try {
    const res = await fetch(
      `${BASE}/movie/${tmdbId}?api_key=${encodeURIComponent(key)}&append_to_response=credits`
    );
    if (!res.ok) return null;
    const m = await res.json();
    const genres = (m.genres || []).map((g) => g.name).join(', ');
    const cast = m.credits && m.credits.cast ? m.credits.cast : [];
    const lead = cast.length ? cast[0].name : null;
    return { genres, lead, release_date: m.release_date || null };
  } catch (e) {
    return null;
  }
}
