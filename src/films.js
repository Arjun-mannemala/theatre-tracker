/**
 * Film lookup via Wikipedia and Wikidata.
 *
 * No API key, no signup, and not blocked by Indian ISPs the way TMDB is.
 * Wikipedia gives the poster and the article match; Wikidata confirms the
 * result is actually a film and supplies an exact release date.
 *
 * Every call fails soft. If the network is down or a film has no article,
 * search returns an empty list and the user just types the name.
 */

const WIKI = 'https://en.wikipedia.org/w/api.php';
const DATA = 'https://www.wikidata.org/w/api.php';
const UA = 'TheatreTracker/1.0 (personal single-screen theatre logbook)';

const FILM = 'Q11424'; // "film" in Wikidata
const P_INSTANCE = 'P31';
const P_RELEASE = 'P577';
const P_GENRE = 'P136';
const P_CAST = 'P161';
const P_LANG = 'P364';

async function getJSON(url, ms = 9000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'Api-User-Agent': UA, Accept: 'application/json' },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    clearTimeout(timer);
    return null;
  }
}

/** Wikidata times look like "+1995-01-26T00:00:00Z", sometimes with 00 parts. */
function normaliseDate(claim) {
  try {
    const v = claim.mainsnak.datavalue.value;
    let t = v.time.replace(/^\+/, '').slice(0, 10);
    t = t.replace(/-00-00$/, '-01-01').replace(/-00$/, '-01');
    return t;
  } catch (e) {
    return null;
  }
}

const idsOf = (claims, prop, limit) => {
  const list = (claims && claims[prop]) || [];
  return list
    .map((c) => {
      try {
        return c.mainsnak.datavalue.value.id;
      } catch (e) {
        return null;
      }
    })
    .filter(Boolean)
    .slice(0, limit || 99);
};

/**
 * Returns [{ tmdb_id, qid, title, release_date, poster, language }]
 * tmdb_id holds the numeric part of the Wikidata Q-id, so the existing
 * database column keeps working.
 */
export async function search(query) {
  const q = (query || '').trim();
  if (q.length < 2) return [];

  const wikiUrl =
    `${WIKI}?action=query&format=json&origin=*` +
    `&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrlimit=12&gsrnamespace=0` +
    `&prop=pageimages|pageprops&piprop=thumbnail&pithumbsize=250&ppprop=wikibase_item`;

  const wiki = await getJSON(wikiUrl);
  if (!wiki || !wiki.query || !wiki.query.pages) return [];

  const pages = Object.values(wiki.query.pages)
    .filter((p) => p.pageprops && p.pageprops.wikibase_item)
    .sort((a, b) => (a.index || 0) - (b.index || 0));

  if (!pages.length) return [];

  const qids = pages.map((p) => p.pageprops.wikibase_item);
  const dataUrl =
    `${DATA}?action=wbgetentities&format=json&origin=*` +
    `&ids=${qids.join('|')}&props=claims`;

  const data = await getJSON(dataUrl);
  const entities = data && data.entities ? data.entities : {};

  const out = [];
  for (const p of pages) {
    const qid = p.pageprops.wikibase_item;
    const ent = entities[qid];
    if (!ent || !ent.claims) continue;

    const isFilm = idsOf(ent.claims, P_INSTANCE).includes(FILM);
    if (!isFilm) continue;

    const rel = ent.claims[P_RELEASE];
    const dates = (rel || []).map(normaliseDate).filter(Boolean).sort();

    out.push({
      qid,
      tmdb_id: Number(qid.replace('Q', '')),
      title: p.title,
      release_date: dates.length ? dates[0] : null,
      poster: p.thumbnail ? p.thumbnail.source : null,
      language: 'Telugu',
    });
    if (out.length >= 8) break;
  }
  return out;
}

/** Genre and lead actor, resolved after the film is already saved. */
export async function details(qid) {
  if (!qid) return null;
  const ent = await getJSON(
    `${DATA}?action=wbgetentities&format=json&origin=*&ids=${qid}&props=claims`
  );
  if (!ent || !ent.entities || !ent.entities[qid]) return null;
  const claims = ent.entities[qid].claims;

  const genreIds = idsOf(claims, P_GENRE, 3);
  const castIds = idsOf(claims, P_CAST, 1);
  const langIds = idsOf(claims, P_LANG, 1);
  const all = [...genreIds, ...castIds, ...langIds];
  if (!all.length) return null;

  const labelRes = await getJSON(
    `${DATA}?action=wbgetentities&format=json&origin=*` +
      `&ids=${all.join('|')}&props=labels&languages=en`
  );
  const label = (id) => {
    try {
      return labelRes.entities[id].labels.en.value;
    } catch (e) {
      return null;
    }
  };

  const genres = genreIds.map(label).filter(Boolean).join(', ');
  const lead = castIds.length ? label(castIds[0]) : null;
  const langRaw = langIds.length ? label(langIds[0]) : null;
  const language = langRaw ? langRaw.replace(/ language$/i, '') : null;

  return {
    genres: genres || null,
    lead: lead || null,
    language: language || null,
  };
}
