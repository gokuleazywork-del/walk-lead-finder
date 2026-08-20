// Zero-Config 48-Hour Cloud Session Store (No Signup / No Env Vars Required)
const localFallbackSessions = new Map();

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // POST: Create a new 48-Hour Live Walking Radar Short Link
  if (req.method === 'POST') {
    try {
      const { data, expiryDays = 2 } = req.body;
      if (!data) {
        return res.status(400).json({ error: 'Data payload is required' });
      }

      const jsonContent = typeof data === 'string' ? data : JSON.stringify(data);
      let shortId = null;

      // 1. Save to Zero-Config 48-Hour Cloud Storage (auto-expires in 48 hours / 2 days)
      try {
        const formData = new URLSearchParams();
        formData.append('content', jsonContent);
        formData.append('expiry_days', String(expiryDays)); // 48 Hours
        formData.append('title', 'Walk Lead Radar');
        formData.append('syntax', 'json');

        const cloudRes = await fetch('https://dpaste.com/api/v2/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData.toString()
        });

        if (cloudRes.ok) {
          const rawUrl = (await cloudRes.text()).trim();
          shortId = rawUrl.split('/').filter(Boolean).pop();
        }
      } catch (cloudErr) {
        console.warn('Cloud store warning, falling back to local ID:', cloudErr.message);
      }

      // If cloud store returned no ID, generate a random short code
      if (!shortId) {
        shortId = Math.random().toString(36).substring(2, 8);
      }

      // Save in fallback in-memory map
      localFallbackSessions.set(shortId, {
        id: shortId,
        data,
        createdAt: Date.now()
      });

      if (localFallbackSessions.size > 2000) {
        const oldestKey = localFallbackSessions.keys().next().value;
        localFallbackSessions.delete(oldestKey);
      }

      return res.status(200).json({
        success: true,
        id: shortId,
        ttlHours: expiryDays * 24,
        shortUrl: `https://walk-lead-radar.vercel.app/?id=${shortId}`
      });

    } catch (e) {
      console.error('Session creation failed:', e);
      return res.status(500).json({ error: 'Failed to create 48-hour short link' });
    }
  }

  // GET: Retrieve 48-Hour Live Walking Radar Session Data
  if (req.method === 'GET') {
    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    // 1. Try Zero-Config Cloud Store
    try {
      const cloudFetch = await fetch(`https://dpaste.com/${id}.txt`, { timeout: 8000 });
      if (cloudFetch.ok) {
        const text = await cloudFetch.text();
        if (text && text.trim().length > 0 && !text.includes('404 Not Found')) {
          try {
            const parsed = JSON.parse(text);
            return res.status(200).json({
              id,
              data: parsed,
              source: 'cloud-48h'
            });
          } catch (parseErr) {
            return res.status(200).json({
              id,
              data: text,
              source: 'cloud-48h'
            });
          }
        }
      }
    } catch (err) {
      console.warn('Cloud fetch failed, checking local memory fallback:', err.message);
    }

    // 2. Fallback to Local In-Memory
    const fallback = localFallbackSessions.get(id);
    if (fallback) {
      return res.status(200).json(fallback);
    }

    return res.status(404).json({ error: 'Radar link not found or expired (48-hour lifetime)' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
