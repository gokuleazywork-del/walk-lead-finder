# 📍 Walk Lead Finder (<1 km Radius, <200 Reviews)

A **100% Free**, **Zero-API-Key** local business lead generation application built for marketers, web agencies, cold callers, and local B2B lead hunters.

Find businesses within a **1 km walking radius** (or custom distance) that have **fewer than 200 reviews** on Google Maps.

---

## ✨ Features

- 💸 **100% Free Forever**: Zero Google Maps API fees, zero third-party subscription costs.
- 🎯 **Targeted Criteria**:
  - Distance: Within **1 km** walking radius (customizable from 200m to 5km).
  - Review Count: **< 200 reviews** (default filter, adjustable slider with `< 50` hot lead toggle).
  - Website Status: Identify businesses **missing a website** (high-ticket web design & SEO prospects).
- 📍 **Interactive Free Map**: Leaflet & OpenStreetMap with live 1km walking boundary circle and draggable search pin.
- 🚀 **One-Click GPS**: Locate yourself instantly using your device's GPS.
- ⚡ **Multi-Engine Search**:
  - **Hybrid**: Instant OpenStreetMap POIs + Deep Google Maps Scraper.
  - **Google Maps Web**: Direct headless scraper extracting ratings, reviews, phone, and addresses.
  - **OpenStreetMap (OSM)**: Lightning fast POI engine.
- 📥 **Export to CSV**: Download complete contact lists (Name, Category, Reviews, Rating, Distance, Phone, Website, Address, Google Maps URL).
- 📋 **Copy Phone Numbers**: Copy all discovered phone numbers in one click for cold outreach.

---

## 🚀 How to Run

1. Open your terminal in this folder:
   ```bash
   cd "e:\K\AAAA\Walk Lead Finder"
   ```

2. Start the application:
   ```bash
   npm start
   ```

3. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

---

## 🛠️ Tech Stack

- **Frontend**: HTML5, CSS3 (Modern Glassmorphic Dark UI), JavaScript, Leaflet.js, OpenStreetMap
- **Backend**: Node.js, Express.js, Puppeteer (Headless Google Maps Scraper), Axios, Overpass API
- **Cost**: **$0.00 / month**
