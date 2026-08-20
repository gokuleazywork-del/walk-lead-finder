const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const { scrapeGoogleMaps } = require('./scraper');
const { searchOsmBusinesses } = require('./osmService');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health Check Endpoint for Render / Docker
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), service: 'Walk Lead Finder API' });
});

/**
 * Free Nominatim Geocoding (Address -> Lat/Lng) - Zero API Key
 */
app.get('/api/geocode', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q: query,
        format: 'json',
        limit: 5,
        addressdetails: 1
      },
      headers: {
        'User-Agent': 'WalkLeadFinder/1.0 (local-lead-finder-app)'
      },
      timeout: 10000
    });

    const results = (response.data || []).map(item => ({
      name: item.display_name,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      type: item.type,
      importance: item.importance
    }));

    res.json({ results });
  } catch (error) {
    console.error('Geocoding error:', error.message);
    res.status(500).json({ error: 'Failed to geocode address' });
  }
});

const sessions = new Map();

// Generate random short ID
function generateShareId() {
  return Math.random().toString(36).substring(2, 8);
}

/**
 * Save Live Map Session for mobile/sharing
 */
app.post('/api/sessions', (req, res) => {
  try {
    const { leads, center, radiusKm, keyword } = req.body;
    if (!leads || !Array.isArray(leads)) {
      return res.status(400).json({ error: 'Leads array is required' });
    }

    const shareId = generateShareId();
    sessions.set(shareId, {
      id: shareId,
      createdAt: new Date().toISOString(),
      center: center || { lat: 13.03, lng: 80.11 },
      radiusKm: radiusKm || 1.0,
      keyword: keyword || 'all',
      leads
    });

    // Cleanup sessions older than 7 days if map grows large
    if (sessions.size > 500) {
      const firstKey = sessions.keys().next().value;
      sessions.delete(firstKey);
    }

    res.json({
      success: true,
      shareId,
      shareUrl: `/live-map.html?id=${shareId}`
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create session' });
  }
});

/**
 * Get Live Map Session by ID
 */
app.get('/api/sessions/:id', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found or expired' });
  }
  res.json(session);
});
app.get('/api/reverse-geocode', async (req, res) => {
  const lat = req.query.lat;
  const lng = req.query.lng;
  if (!lat || !lng) {
    return res.status(400).json({ error: 'Lat and Lng are required' });
  }

  try {
    const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
      params: {
        lat,
        lon: lng,
        format: 'json'
      },
      headers: {
        'User-Agent': 'WalkLeadFinder/1.0'
      },
      timeout: 10000
    });

    res.json({
      address: response.data?.display_name || `${lat}, ${lng}`,
      details: response.data?.address || {}
    });
  } catch (error) {
    res.json({ address: `${lat}, ${lng}`, details: {} });
  }
});

/**
 * Main Search Endpoint - 100% Free Zero-API Lead Finder
 */
app.post('/api/search', async (req, res) => {
  try {
    let {
      lat,
      lng,
      address,
      keyword = 'all',
      radiusKm = 1,
      maxReviews = 200,
      maxResults = 100,
      engine = 'gmaps'
    } = req.body;

    radiusKm = parseFloat(radiusKm) || 1;
    maxReviews = parseInt(maxReviews, 10) || 200;
    maxResults = parseInt(maxResults, 10) || 100;

    // If coordinates are missing but address is provided, geocode it
    if ((!lat || !lng) && address) {
      try {
        const geoResp = await axios.get('https://nominatim.openstreetmap.org/search', {
          params: { q: address, format: 'json', limit: 1 },
          headers: { 'User-Agent': 'WalkLeadFinder/1.0' },
          timeout: 8000
        });
        if (geoResp.data && geoResp.data[0]) {
          lat = parseFloat(geoResp.data[0].lat);
          lng = parseFloat(geoResp.data[0].lon);
        }
      } catch (e) {
        console.warn('Auto-geocoding fallback failed');
      }
    }

    if (!lat || !lng) {
      return res.status(400).json({ error: 'Valid location coordinates or address are required.' });
    }

    console.log(`[Search] Starting lead search near (${lat}, ${lng}) with radius ${radiusKm}km, max reviews < ${maxReviews}, keyword: "${keyword}", target maxResults: ${maxResults}`);

    let combinedLeads = [];
    const seenNames = new Set();

    // Comprehensive Search Keywords across 7 Major Local Industries (Excluding grocery and cafes)
    const ALL_SEARCH_KEYWORDS = [
      // 1. Salons, Spas & Beauty
      "unisex salons",
      "men's salons and barber shops",
      "women's beauty parlours",
      "bridal makeup studios",
      "spa centres",
      "nail art studios",
      "skin clinics and dermatology",

      // 2. Healthcare & Wellness
      "clinics, general, dental, eye and ENT",
      "diagnostic centres and labs",
      "pharmacies and medical shops",
      "physiotherapy centres",
      "gyms and fitness centres",
      "yoga studios",
      "opticians and eyewear shops",
      "veterinary clinics and pet clinics",

      // 3. Retail — Clothing & Fashion
      "clothing stores and boutiques",
      "saree shops",
      "footwear shops",
      "jewellery shops",
      "watch shops",
      "optical stores",
      "tailoring shops",

      // 4. Retail — Electronics & Hardware
      "mobile phone shops",
      "electronics stores",
      "computer and laptop shops",
      "home appliance stores",
      "hardware stores",
      "mobile repair shops",

      // 5. Automotive
      "car service centres",
      "bike service centres",
      "car wash and detailing",
      "auto spare parts shops",
      "tyre shops",
      "two wheeler and car showrooms",

      // 6. Home & Lifestyle
      "furniture stores",
      "home decor shops",
      "paint shops",
      "electrical shops",
      "plumbing and hardware suppliers",
      "interior designers",

      // 7. Education & Services
      "coaching centres and tuition centres",
      "driving schools",
      "printing and Xerox shops",
      "courier and logistics offices",
      "travel agencies",
      "real estate agencies"
    ];

    let searchQueries = [];
    if (!keyword || keyword.trim() === '' || keyword.toLowerCase() === 'all') {
      searchQueries = ALL_SEARCH_KEYWORDS;
    } else if (keyword.includes(',')) {
      searchQueries = keyword.split(',').map(s => s.trim()).filter(Boolean);
    } else {
      searchQueries = [keyword];
    }

    // Safe Concurrency Batch Worker Pool (Method 1: Safe 8-tab concurrent batches)
    const BATCH_SIZE = 8;
    console.log(`[Search] Dispatching ${searchQueries.length} keywords in safe concurrent batches of ${BATCH_SIZE}...`);

    for (let i = 0; i < searchQueries.length; i += BATCH_SIZE) {
      const batch = searchQueries.slice(i, i + BATCH_SIZE);
      console.log(`[Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(searchQueries.length / BATCH_SIZE)}] Processing ${batch.length} keywords in parallel...`);

      const batchPromises = batch.map(query =>
        scrapeGoogleMaps({
          lat,
          lng,
          keyword: query,
          radiusKm,
          maxReviews,
          maxResults: searchQueries.length > 1 ? 25 : maxResults
        }).catch(err => {
          console.warn(`Error scraping "${query}":`, err.message);
          return [];
        })
      );

      const batchResults = await Promise.all(batchPromises);

      for (const gmapsLeads of batchResults) {
        for (const lead of gmapsLeads) {
          const key = (lead.name + '_' + (lead.address || '')).toLowerCase().replace(/[^a-z0-9]/g, '');
          if (!seenNames.has(key)) {
            seenNames.add(key);
            combinedLeads.push(lead);
          }
        }
      }
    }

    // Final filtering: maxReviews criteria + EXCLUDE Grocery and Cafe
    const filteredLeads = combinedLeads.filter(lead => {
      if (lead.reviews > maxReviews) return false;

      const isGrocery = /grocery|supermarket|provision|kirana|convenience store|greengrocer|vegetable store|fruit store/i.test(lead.category || '') ||
        /provision|kirana|grocery|supermarket|vegetables|provisional shop/i.test(lead.name || '');
      if (isGrocery) return false;

      const isCafe = /cafe|coffee shop|tea stall|tea house|espresso bar|tea room/i.test(lead.category || '') ||
        /\b(cafe|coffee shop|tea house|tea stall|chai)\b/i.test(lead.name || '');
      if (isCafe) return false;

      return true;
    });

    // Sort: Leads with lowest reviews and closest distance first
    filteredLeads.sort((a, b) => {
      if (a.reviews !== b.reviews) return a.reviews - b.reviews;
      return a.distanceMeters - b.distanceMeters;
    });

    console.log(`[Search Complete] Returning ${filteredLeads.length} qualified leads.`);

    res.json({
      success: true,
      meta: {
        center: { lat, lng },
        radiusKm,
        maxReviews,
        keyword,
        totalLeads: filteredLeads.length,
        noWebsiteCount: filteredLeads.filter(l => !l.hasWebsite).length,
        under50ReviewsCount: filteredLeads.filter(l => l.reviews < 50).length
      },
      leads: filteredLeads
    });

  } catch (error) {
    console.error('Search endpoint error:', error);
    res.status(500).json({ error: 'Search failed: ' + error.message });
  }
});

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Walk Lead Finder running at http://localhost:${PORT}`);
  console.log(`📍 Zero API Key Google Maps & 1km Radius Lead Scraper`);
  console.log(`=======================================================`);
});

process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process] Unhandled Rejection:', reason);
});
