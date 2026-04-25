const QUERIES = {
  all:       'fitness wellness men health shorts india',
  fitness:   'men workout gym training shorts india',
  nutrition: 'healthy eating protein nutrition shorts india',
  wellness:  'men wellness recovery health mental shorts',
};

function parseDuration(iso) {
  if (!iso) return 0;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1]||0)*3600) + (parseInt(m[2]||0)*60) + parseInt(m[3]||0);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const filter = req.query.filter || 'all';
  const q = QUERIES[filter] || QUERIES.all;
  const maxResults = Math.min(parseInt(req.query.max)||10, 20);
  const API_KEY = process.env.YT_API_KEY;

  if (!API_KEY) {
    res.status(500).json({ error: 'YT_API_KEY not configured' });
    return;
  }

  try {
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoDuration=short&q=${encodeURIComponent(q)}&maxResults=${maxResults}&relevanceLanguage=en&regionCode=IN&key=${API_KEY}`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    if (searchData.error) {
      res.status(400).json({ error: searchData.error.message });
      return;
    }

    if (!searchData.items || searchData.items.length === 0) {
      res.status(200).json([]);
      return;
    }

    const ids = searchData.items.map(i => i.id.videoId).filter(Boolean).join(',');

    const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet,statistics&id=${ids}&key=${API_KEY}`;
    const detailsRes = await fetch(detailsUrl);
    const detailsData = await detailsRes.json();

    if (!detailsData.items) {
      res.status(200).json([]);
      return;
    }

    const shorts = detailsData.items
      .filter(v => {
        const dur = parseDuration(v.contentDetails?.duration);
        return dur > 0 && dur <= 60;
      })
      .map(v => ({
        id:       v.id,
        title:    v.snippet.title,
        channel:  v.snippet.channelTitle,
        thumb:    v.snippet.thumbnails?.high?.url || v.snippet.thumbnails?.medium?.url || '',
        views:    parseInt(v.statistics?.viewCount || 0),
        duration: parseDuration(v.contentDetails.duration),
        url:      `https://www.youtube.com/shorts/${v.id}`,
        embedUrl: `https://www.youtube.com/embed/${v.id}?autoplay=1&mute=1&loop=1&playlist=${v.id}&controls=1&modestbranding=1&rel=0&playsinline=1`,
      }));

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');
    res.status(200).json(shorts);

  } catch (err) {
    console.error('Shorts error:', err);
    res.status(500).json({ error: err.message });
  }
}
