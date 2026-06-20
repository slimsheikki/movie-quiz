// Title normalization, similarity, and slug helpers used by matching.

function decodeEntities(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&eacute;/gi, 'é').replace(/&egrave;/gi, 'è').replace(/&agrave;/gi, 'à')
    .replace(/&ouml;/gi, 'ö').replace(/&uuml;/gi, 'ü').replace(/&auml;/gi, 'ä')
    .replace(/&ccedil;/gi, 'ç').replace(/&ntilde;/gi, 'ñ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}

function foldAccents(s) {
  return String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

const ARTICLES = /^(the|a|an|le|la|les|il|lo|el|los|las|der|die|das|l)\s+/i;

function norm(s) {
  return foldAccents(decodeEntities(s)).toLowerCase()
    .replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(ARTICLES, '').trim();
}

function unreverseArticle(s) {
  const m = String(s).match(/^(.*),\s*(The|A|An|Le|La|Les|Il|Lo|El)$/i);
  return m ? `${m[2]} ${m[1]}` : s;
}

function stripTrailingYear(s) {
  const m = String(s).match(/^(.*?)[\s(]+((?:19|20)\d{2})\)?\s*$/);
  return m ? [m[1].trim(), +m[2]] : [String(s), null];
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

function ratio(a, b) {
  if (!a && !b) return 1;
  const max = Math.max(a.length, b.length);
  return max ? 1 - levenshtein(a, b) / max : 1;
}

function tokenSort(s) { return s.split(' ').filter(Boolean).sort().join(' '); }

// title similarity in [0,1] — max of raw and token-sorted ratios (both on normalized strings)
function sim(a, b) {
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  return Math.max(ratio(na, nb), ratio(tokenSort(na), tokenSort(nb)));
}

function slugify(s) {
  return foldAccents(decodeEntities(s)).toLowerCase().replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '');
}

module.exports = { decodeEntities, foldAccents, norm, unreverseArticle, stripTrailingYear, sim, slugify };
