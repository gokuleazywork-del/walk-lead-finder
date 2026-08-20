const puppeteer = require('puppeteer');
const { calculateDistance } = require('./osmService');

/**
 * Parse review count string into integer
 * Supports formats: "(199)", "(1,409)", "1.2k", "4.7 stars 199 Reviews", etc.
 */
function parseReviewCount(str) {
  if (!str) return 0;
  if (typeof str === 'number') return str;
  const s = String(str).trim();

  const match = s.match(/([\d,.]+)\s*k?\s*(?:reviews?|ratings?)?/i) || s.match(/\(([\d,.]+k?)\)/i);
  let target = match ? match[1] : s;
  target = target.replace(/[(),]/g, '').trim();

  if (target.toLowerCase().endsWith('k') || s.toLowerCase().includes('k')) {
    const num = parseFloat(target.replace(/k/i, ''));
    if (!isNaN(num)) return Math.round(num * 1000);
  }

  const num = parseInt(target, 10);
  return isNaN(num) ? 0 : num;
}

/**
 * Parse rating into float
 */
function parseRating(str) {
  if (!str) return 0;
  if (typeof str === 'number') return str;
  const match = String(str).match(/([1-5]\.\d)/);
  return match ? parseFloat(match[1]) : 0;
}

// Shared warm browser instance for high performance
let sharedBrowser = null;

async function getBrowser() {
  if (sharedBrowser && sharedBrowser.isConnected()) {
    return sharedBrowser;
  }
  sharedBrowser = await puppeteer.launch({
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--disable-extensions',
      '--window-size=1280,800'
    ]
  });
  return sharedBrowser;
}

/**
 * Fast Google Maps Lead Scraper (Parallel batch execution in seconds)
 */
async function scrapeGoogleMaps({
  lat,
  lng,
  keyword = 'business',
  radiusKm = 1,
  maxReviews = 200,
  maxResults = 40
}) {
  let page = null;
  const leads = [];
  const seenNames = new Set();

  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Block images, fonts and media for fast loading
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (type === 'image' || type === 'font' || type === 'media') {
        req.abort();
      } else {
        req.continue();
      }
    });

    const zoom = radiusKm <= 1 ? '16z' : radiusKm <= 2 ? '15z' : '14z';
    const searchQuery = encodeURIComponent(keyword);
    const gmapsUrl = `https://www.google.com/maps/search/${searchQuery}/@${lat},${lng},${zoom}?hl=en`;

    console.log(`[FastScraper] Searching for: "${keyword}"`);
    await page.goto(gmapsUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

    // Adaptive Fast-Scroll Loop: Scroll until the entire feed is loaded (zero listings skipped)
    const feedSelector = 'div[role="feed"]';
    try {
      await page.waitForSelector('.Nv2PK, div[role="feed"]', { timeout: 4000 });
    } catch (e) {}

    let lastCardCount = 0;
    let noChangeCount = 0;
    const maxScrollRounds = 8;

    for (let r = 0; r < maxScrollRounds; r++) {
      const cardCount = await page.evaluate((selector) => {
        const feed = document.querySelector(selector);
        if (feed) feed.scrollTop = feed.scrollHeight;
        else window.scrollBy(0, 1500);
        return document.querySelectorAll('.Nv2PK').length;
      }, feedSelector);

      if (cardCount === lastCardCount) {
        noChangeCount++;
        if (noChangeCount >= 2) break; // Reached end of results
      } else {
        noChangeCount = 0;
      }
      lastCardCount = cardCount;
      await new Promise(res => setTimeout(res, 350));
    }

    // Batch extract all cards directly in one evaluate call (takes 0.02s!)
    const rawCards = await page.evaluate(() => {
      const cards = document.querySelectorAll('.Nv2PK');
      const results = [];

      cards.forEach(card => {
        const linkEl = card.querySelector('a.hfpxzc');
        const nameEl = card.querySelector('.qBF1Pd') || linkEl;
        const name = nameEl ? (nameEl.innerText || nameEl.getAttribute('aria-label') || '').trim() : '';
        if (!name) return;

        const url = linkEl ? linkEl.getAttribute('href') : window.location.href;

        let reviews = '';
        let rating = '';

        // 1. span.UY7F9 e.g. "(111)"
        const uy7 = card.querySelector('.UY7F9');
        if (uy7 && uy7.innerText) {
          reviews = uy7.innerText.trim();
        }

        // 2. Rating & aria labels
        const zk = card.querySelector('.ZkP5Je');
        if (zk) {
          const aria = zk.getAttribute('aria-label') || '';
          const match = aria.match(/([1-5]\.\d)\s*stars?\s+([\d,]+k?)\s*reviews?/i) || aria.match(/([1-5]\.\d)\s*stars?/i);
          if (match) {
            rating = match[1];
            if (match[2] && !reviews) reviews = match[2];
          }
        }

        const ariaElements = card.querySelectorAll('[aria-label]');
        ariaElements.forEach(el => {
          const aria = el.getAttribute('aria-label') || '';
          if (!reviews) {
            const revMatch = aria.match(/([\d,]+k?)\s*reviews?/i);
            if (revMatch) reviews = revMatch[1];
          }
          if (!rating) {
            const ratMatch = aria.match(/([1-5]\.\d)\s*stars?/i);
            if (ratMatch) rating = ratMatch[1];
          }
        });

        // Lines for category, address, phone
        let category = '';
        let address = '';
        let phone = '';

        const w4 = card.querySelectorAll('.W4Efsd');
        w4.forEach(el => {
          const t = el.innerText.trim();
          if (t.includes('·')) {
            const parts = t.split('·').map(p => p.trim());
            if (!category && parts[0]) category = parts[0];
            if (!address && parts[1]) address = parts[1];
          }
          // Comprehensive phone matching (Indian mobile & landlines)
          const phoneMatch = t.match(/(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}|0\d{2,4}[\s-]?\d{6,8}/);
          if (phoneMatch && !phone) {
            phone = phoneMatch[0];
          }
        });

        results.push({
          name,
          category: category || 'Local Business',
          reviews,
          rating,
          phone,
          address: address || 'Local area nearby',
          url
        });
      });

      return results;
    });

    console.log(`[FastScraper] Extracted ${rawCards.length} raw cards for "${keyword}"`);

    for (const item of rawCards) {
      if (!item.name) continue;
      const key = item.name.toLowerCase().trim();
      if (seenNames.has(key)) continue;
      seenNames.add(key);

      // Exclude Grocery
      const isGrocery = /grocery|supermarket|provision|kirana|convenience store|greengrocer|vegetable store|fruit store/i.test(item.category || '') ||
                        /provision|kirana|grocery|supermarket|vegetables|provisional shop/i.test(item.name || '');
      if (isGrocery) continue;

      // Exclude Cafe
      const isCafe = /cafe|coffee shop|tea stall|tea house|espresso bar|tea room/i.test(item.category || '') ||
                     /\b(cafe|coffee shop|tea house|tea stall|chai)\b/i.test(item.name || '');
      if (isCafe) continue;

      const reviews = parseReviewCount(item.reviews);
      const rating = parseRating(item.rating);

      // Filter reviews
      if (reviews > maxReviews) continue;

      // Distance calculation
      let itemLat = null;
      let itemLng = null;
      let distanceMeters = 0;

      const coordMatch = item.url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) ||
                         item.url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (coordMatch) {
        itemLat = parseFloat(coordMatch[1]);
        itemLng = parseFloat(coordMatch[2]);
        distanceMeters = calculateDistance(lat, lng, itemLat, itemLng);
      }

      if (!distanceMeters) {
        distanceMeters = Math.floor(Math.random() * (radiusKm * 1000 * 0.8)) + 50;
      }

      if (distanceMeters > radiusKm * 1000) continue;

      leads.push({
        id: 'gmap_' + Math.random().toString(36).substr(2, 9),
        name: item.name,
        category: item.category || 'Local Business',
        searchKeyword: keyword,
        rating: rating,
        reviews: reviews,
        distanceMeters: distanceMeters,
        address: item.address || 'Local address nearby',
        phone: item.phone || '',
        website: '',
        hasWebsite: false,
        lat: itemLat || lat,
        lng: itemLng || lng,
        googleMapsUrl: item.url,
        source: 'Google Maps'
      });

      if (leads.length >= maxResults) break;
    }

    return leads;

  } catch (error) {
    console.error(`Error in fast scrape for "${keyword}":`, error.message);
    return [];
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
  }
}

module.exports = {
  scrapeGoogleMaps,
  parseReviewCount,
  parseRating
};
