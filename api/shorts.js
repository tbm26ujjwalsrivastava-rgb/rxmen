const API_KEY = process.env.YT_API_KEY;

// Fitness & Wellness category IDs
// 17 = Sports, 26 = Howto & Style, 28 = Science & Tech
// We use search queries for fitness/wellness since YouTube category IDs
// don't map cleanly to fitness content
const QUERIES = {
  all:       'fitness wellness men health shorts',
  fitness:   'men workout gym training shorts',
  nutrition: 'healthy eating protein nutrition shorts',
  wellness:  'men wellness recovery sleep health shorts',
};

function parseDuration(iso) {
  if (!iso) return 0;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] || 0) * 3600) +
         (parseInt(m[2] || 0) * 60) +
          parseInt(m[3] || 0);
}

export default async function handler(req, res) {
  // CORS headers so browser can call this from any domain
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const filter = req.query.filter || 'all';
  const q = QUERIES[filter] || QUERIES.all;
  const maxResults = parseInt(req.query.max) || 10;

  if (!API_KEY) {
    return res.status(500).json({ error: 'YT_API_KEY not configured' });
  }

  try {
    // Step 1: Search for short videos matching fitness/wellness
    const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
    searchUrl.searchParams.set('part', 'snippet');
    searchUrl.searchParams.set('type', 'video');
    searchUrl.searchParams.set('videoDuration', 'short');
    searchUrl.searchParams.set('q', q);
    searchUrl.searchParams.set('maxResults', String(maxResults));
    searchUrl.searchParams.set('relevanceLanguage', 'en');
    searchUrl.searchParams.set('regionCode', 'IN');
    searchUrl.searchParams.set('key', API_KEY);

    const searchRes = await fetch(searchUrl.toString());
    const searchData = await searchRes.json();

    if (searchData.error) {
      return res.status(400).json({ error: searchData.error.message });
    }

    if (!searchData.items || searchData.items.length === 0) {
      return res.status(200).json([]);
    }

    const ids = searchData.items.map(i => i.id.videoId).filter(Boolean).join(',');

    // Step 2: Get video details to verify duration ≤ 60s
    const detailsUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
    detailsUrl.searchParams.set('part', 'contentDetails,snippet,statistics');
    detailsUrl.searchParams.set('id', ids);
    detailsUrl.searchParams.set('key', API_KEY);

    const detailsRes = await fetch(detailsUrl.toString());
    const detailsData = await detailsRes.json();

    if (!detailsData.items) {
      return res.status(200).json([]);
    }

    // Filter to true Shorts (≤ 60 seconds)
    const shorts = detailsData.items
      .filter(v => {
        const dur = parseDuration(v.contentDetails?.duration);
        return dur > 0 && dur <= 60;
      })
      .map(v => ({
        id:        v.id,
        title:     v.snippet.title,
        channel:   v.snippet.channelTitle,
        thumb:     v.snippet.thumbnails?.high?.url || v.snippet.thumbnails?.medium?.url,
        views:     parseInt(v.statistics?.viewCount || 0),
        duration:  parseDuration(v.contentDetails.duration),
        url:       `https://www.youtube.com/shorts/${v.id}`,
        embedUrl:  `https://www.youtube.com/embed/${v.id}?autoplay=1&mute=1&loop=1&playlist=${v.id}&controls=0&modestbranding=1&rel=0&playsinline=1`,
      }));

    // Cache 1 hour to save quota
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');
    return res.status(200).json(shorts);

  } catch (err) {
    console.error('Shorts API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
