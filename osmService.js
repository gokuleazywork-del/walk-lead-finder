const axios = require('axios');

/**
 * Calculate distance between two coordinates using Haversine formula (in meters)
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // metres
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/**
 * Query OpenStreetMap Overpass API for all businesses/POIs within radius (100% Free, No API Key)
 */
async function searchOsmBusinesses(lat, lng, radiusMeters = 1000, keyword = '') {
  try {
    const radius = Math.min(Math.max(radiusMeters, 200), 5000);
    
    // Clean and fast Overpass QL Query for shops and amenities
    const overpassQuery = `[out:json][timeout:15];(node["name"]["amenity"](around:${radius},${lat},${lng});node["name"]["shop"](around:${radius},${lat},${lng});node["name"]["office"](around:${radius},${lat},${lng});node["name"]["healthcare"](around:${radius},${lat},${lng}););out center 80;`;

    const mirrors = [
      'https://overpass-api.de/api/interpreter',
      'https://lz4.overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter'
    ];

    let elements = [];
    for (const mirror of mirrors) {
      try {
        const response = await axios.get(mirror, {
          params: { data: overpassQuery },
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          },
          timeout: 8000
        });
        if (response.data && response.data.elements) {
          elements = response.data.elements;
          break;
        }
      } catch (err) {
        // continue to next mirror
      }
    }
    const leads = [];
    const seenNames = new Set();

    for (const el of elements) {
      const tags = el.tags || {};
      const name = tags.name;
      if (!name || seenNames.has(name.toLowerCase())) continue;
      seenNames.add(name.toLowerCase());

      const itemLat = el.lat || el.center?.lat;
      const itemLng = el.lon || el.center?.lon;
      if (!itemLat || !itemLng) continue;

      const distance = calculateDistance(lat, lng, itemLat, itemLng);
      if (distance > radius) continue;

      const category = tags.shop || tags.amenity || tags.office || tags.craft || tags.healthcare || tags.tourism || 'Local Business';
      
      // Check keyword match if provided
      if (keyword && keyword.trim().length > 0) {
        const kw = keyword.toLowerCase();
        const matchesName = name.toLowerCase().includes(kw);
        const matchesCategory = category.toLowerCase().includes(kw);
        const matchesCuisine = (tags.cuisine || '').toLowerCase().includes(kw);
        if (!matchesName && !matchesCategory && !matchesCuisine) continue;
      }

      const phone = tags['contact:phone'] || tags.phone || tags['contact:mobile'] || tags.mobile || '';
      const website = tags['contact:website'] || tags.website || tags.url || '';
      const street = tags['addr:street'] ? `${tags['addr:housenumber'] || ''} ${tags['addr:street']}`.trim() : '';
      const city = tags['addr:city'] || '';
      const fullAddress = [street, city].filter(Boolean).join(', ') || tags['addr:full'] || 'Address near search point';

      // Generate Google Maps Search URL for easy inspection
      const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + ' ' + (city || lat + ',' + lng))}`;

      leads.push({
        id: 'osm_' + el.id,
        name: name,
        category: formatCategory(category),
        searchKeyword: keyword || formatCategory(category),
        rating: 0, // Unrated on OSM, qualifies as low review/under-promoted
        reviews: 0,
        distanceMeters: distance,
        address: fullAddress,
        phone: phone,
        website: website,
        hasWebsite: !!website,
        lat: itemLat,
        lng: itemLng,
        googleMapsUrl: googleMapsUrl,
        source: 'OpenStreetMap'
      });
    }

    // Sort by nearest distance
    leads.sort((a, b) => a.distanceMeters - b.distanceMeters);
    return leads;
  } catch (error) {
    console.error('OSM Query error:', error.message);
    return [];
  }
}

function formatCategory(cat) {
  return cat
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

module.exports = {
  searchOsmBusinesses,
  calculateDistance
};
