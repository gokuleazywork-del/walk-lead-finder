// State Management
const state = {
  lat: 40.7128,
  lng: -74.0060,
  address: 'New York, NY',
  radiusKm: 1.0,
  maxReviews: 200,
  keyword: 'all',
  websiteFilter: 'all',
  engine: 'gmaps',
  groupBy: 'none', // 'none' | 'category' | 'keyword' | 'review_tier' | 'website'
  leads: [],
  filteredLeads: [],
  map: null,
  centerMarker: null,
  radiusCircle: null,
  leadMarkers: []
};

// Helper to get active API URL (supports local server and Render cloud backend)
function getApiUrl(endpoint) {
  const configuredBackend = localStorage.getItem('walk_lead_backend_url') || (window.BACKEND_API_URL || '');
  if (configuredBackend && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return `${configuredBackend.replace(/\/$/, '')}${endpoint}`;
  }
  return endpoint;
}

// DOM Elements
const elements = {
  inputAddress: document.getElementById('inputAddress'),
  btnGps: document.getElementById('btnGps'),
  latVal: document.getElementById('latVal'),
  lngVal: document.getElementById('lngVal'),
  geocodeSuggestions: document.getElementById('geocodeSuggestions'),
  sliderRadius: document.getElementById('sliderRadius'),
  radiusDisplay: document.getElementById('radiusDisplay'),
  categoryPills: document.querySelectorAll('.category-pills .pill'),
  inputKeyword: document.getElementById('inputKeyword'),
  sliderReviews: document.getElementById('sliderReviews'),
  reviewsDisplay: document.getElementById('reviewsDisplay'),
  quickReviewButtons: document.querySelectorAll('.quick-review-buttons .btn-micro'),
  selectWebsite: document.getElementById('selectWebsite'),
  selectEngine: document.getElementById('selectEngine'),
  selectGroupBy: document.getElementById('selectGroupBy'),
  btnToggleAllGroups: document.getElementById('btnToggleAllGroups'),
  toggleAllText: document.getElementById('toggleAllText'),
  btnSearch: document.getElementById('btnSearch'),
  searchProgress: document.getElementById('searchProgress'),
  progressText: document.getElementById('progressText'),
  kpiTotal: document.getElementById('kpiTotal'),
  kpiPrime: document.getElementById('kpiPrime'),
  kpiNoWebsite: document.getElementById('kpiNoWebsite'),
  kpiRadius: document.getElementById('kpiRadius'),
  resultsCount: document.getElementById('resultsCount'),
  leadsList: document.getElementById('leadsList'),
  filterInput: document.getElementById('filterInput'),
  btnExportCsv: document.getElementById('btnExportCsv'),
  btnCopyPhones: document.getElementById('btnCopyPhones'),
  btnLiveRadar: document.getElementById('btnLiveRadar'),
  radarModal: document.getElementById('radarModal'),
  btnCloseModal: document.getElementById('btnCloseModal'),
  qrCodeImg: document.getElementById('qrCodeImg'),
  inputShareUrl: document.getElementById('inputShareUrl'),
  btnCopyShareUrl: document.getElementById('btnCopyShareUrl'),
  btnOpenRadarDirect: document.getElementById('btnOpenRadarDirect'),
  btnBackendSettings: document.getElementById('btnBackendSettings'),
  backendModal: document.getElementById('backendModal'),
  btnCloseBackendModal: document.getElementById('btnCloseBackendModal'),
  inputBackendUrl: document.getElementById('inputBackendUrl'),
  backendStatus: document.getElementById('backendStatus'),
  btnTestBackend: document.getElementById('btnTestBackend'),
  btnSaveBackend: document.getElementById('btnSaveBackend')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  setupEventListeners();
  tryGeolocation();
});

// Setup Leaflet Map (100% Free OpenStreetMap)
function initMap() {
  state.map = L.map('map').setView([state.lat, state.lng], 15);

  // Free OpenStreetMap CartoDB Dark Matter tile layer
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(state.map);

  // Center Marker
  const centerIcon = L.divIcon({
    className: 'custom-center-marker',
    html: '<div style="background:#2563eb;color:#fff;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 0 10px rgba(0,0,0,0.5);"><i class="fa-solid fa-person-walking"></i></div>',
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });

  state.centerMarker = L.marker([state.lat, state.lng], {
    draggable: true,
    icon: centerIcon
  }).addTo(state.map);

  // Center Marker drag event
  state.centerMarker.on('dragend', (e) => {
    const { lat, lng } = e.target.getLatLng();
    setLocation(lat, lng, true);
  });

  // Map click to place center pin
  state.map.on('click', (e) => {
    const { lat, lng } = e.latlng;
    setLocation(lat, lng, true);
  });

  // Radius Circle (1km walking circle)
  updateRadiusCircle();
  updateCoordsDisplay();
}

function updateRadiusCircle() {
  if (state.radiusCircle) {
    state.map.removeLayer(state.radiusCircle);
  }

  state.radiusCircle = L.circle([state.lat, state.lng], {
    radius: state.radiusKm * 1000,
    color: '#10b981',
    fillColor: '#10b981',
    fillOpacity: 0.12,
    weight: 2,
    dashArray: '4, 6'
  }).addTo(state.map);
}

function setLocation(lat, lng, reverseGeocode = true) {
  state.lat = parseFloat(lat.toFixed(5));
  state.lng = parseFloat(lng.toFixed(5));

  state.centerMarker.setLatLng([state.lat, state.lng]);
  updateRadiusCircle();
  updateCoordsDisplay();

  if (reverseGeocode) {
    fetch(getApiUrl(`/api/reverse-geocode?lat=${state.lat}&lng=${state.lng}`))
      .then(res => res.json())
      .then(data => {
        if (data.address) {
          state.address = data.address;
          elements.inputAddress.value = data.address;
        }
      })
      .catch(() => {});
  }
}

function updateCoordsDisplay() {
  elements.latVal.textContent = state.lat.toFixed(4);
  elements.lngVal.textContent = state.lng.toFixed(4);
}

// Browser Geolocation
function tryGeolocation() {
  if ('geolocation' in navigator) {
    elements.progressText.textContent = 'Acquiring GPS location...';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setLocation(latitude, longitude, true);
        state.map.setView([latitude, longitude], 15);
      },
      (err) => {
        console.log('Geolocation note: using default location.');
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  }
}

// Setup UI Event Listeners
function setupEventListeners() {
  // GPS button
  elements.btnGps.addEventListener('click', () => {
    tryGeolocation();
  });

  // Radius slider
  elements.sliderRadius.addEventListener('input', (e) => {
    state.radiusKm = parseFloat(e.target.value);
    elements.radiusDisplay.textContent = `${state.radiusKm.toFixed(1)} km (${Math.round(state.radiusKm * 1000)}m)`;
    elements.kpiRadius.textContent = `${state.radiusKm.toFixed(1)} km`;
    updateRadiusCircle();
  });

  // Max reviews slider
  elements.sliderReviews.addEventListener('input', (e) => {
    state.maxReviews = parseInt(e.target.value, 10);
    elements.reviewsDisplay.textContent = `< ${state.maxReviews} reviews`;
    elements.quickReviewButtons.forEach(b => b.classList.remove('active'));
    applyFilters();
  });

  // Quick review buttons (< 50, < 100, < 200)
  elements.quickReviewButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      elements.quickReviewButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const val = parseInt(btn.dataset.reviews, 10);
      state.maxReviews = val;
      elements.sliderReviews.value = val;
      elements.reviewsDisplay.textContent = `< ${val} reviews`;
      applyFilters();
    });
  });

  // Category pills
  elements.categoryPills.forEach(pill => {
    pill.addEventListener('click', () => {
      elements.categoryPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      state.keyword = pill.dataset.keyword;
      elements.inputKeyword.value = '';
    });
  });

  // Custom keyword input
  elements.inputKeyword.addEventListener('input', (e) => {
    if (e.target.value.trim().length > 0) {
      elements.categoryPills.forEach(p => p.classList.remove('active'));
      state.keyword = e.target.value.trim();
    } else {
      state.keyword = 'all';
      elements.categoryPills[0].classList.add('active');
    }
  });

  // Website status filter
  elements.selectWebsite.addEventListener('change', (e) => {
    state.websiteFilter = e.target.value;
    applyFilters();
  });

  // Search Engine select
  elements.selectEngine.addEventListener('change', (e) => {
    state.engine = e.target.value;
  });

  // Group By select
  let allCollapsed = false;
  if (elements.selectGroupBy) {
    elements.selectGroupBy.addEventListener('change', (e) => {
      state.groupBy = e.target.value;
      allCollapsed = false;
      if (elements.toggleAllText) {
        elements.toggleAllText.textContent = 'Collapse All';
      }
      if (elements.btnToggleAllGroups) {
        if (state.groupBy !== 'none') {
          elements.btnToggleAllGroups.classList.remove('hidden');
        } else {
          elements.btnToggleAllGroups.classList.add('hidden');
        }
      }
      renderLeads(state.filteredLeads);
    });
  }

  // Toggle All Groups (Expand/Collapse)
  if (elements.btnToggleAllGroups) {
    elements.btnToggleAllGroups.addEventListener('click', () => {
      allCollapsed = !allCollapsed;
      const groups = document.querySelectorAll('.lead-group');
      groups.forEach(g => {
        if (allCollapsed) g.classList.add('collapsed');
        else g.classList.remove('collapsed');
      });
      if (elements.toggleAllText) {
        elements.toggleAllText.textContent = allCollapsed ? 'Expand All' : 'Collapse All';
      }
    });
  }

  // Address search autocomplete / geocoding
  let geocodeTimeout;
  elements.inputAddress.addEventListener('input', (e) => {
    clearTimeout(geocodeTimeout);
    const q = e.target.value.trim();
    if (q.length < 3) {
      elements.geocodeSuggestions.classList.add('hidden');
      return;
    }
    geocodeTimeout = setTimeout(() => {
      fetchGeocodeSuggestions(q);
    }, 400);
  });

  // Trigger search on button click
  elements.btnSearch.addEventListener('click', () => {
    performLeadSearch();
  });

  // Quick filter input
  elements.filterInput.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    
    // Check flat cards
    const cards = document.querySelectorAll('.lead-card');
    cards.forEach(card => {
      const text = card.innerText.toLowerCase();
      card.style.display = text.includes(q) ? 'flex' : 'none';
    });

    // If groups exist, update group visibility and badges
    const groups = document.querySelectorAll('.lead-group');
    groups.forEach(group => {
      const groupCards = group.querySelectorAll('.lead-card');
      let visibleCount = 0;
      groupCards.forEach(card => {
        if (card.style.display !== 'none') visibleCount++;
      });
      group.style.display = visibleCount > 0 ? 'flex' : 'none';
      const badge = group.querySelector('.group-badge');
      if (badge) {
        badge.textContent = q ? `${visibleCount} of ${groupCards.length} leads` : `${groupCards.length} leads`;
      }
    });
  });

  // Export CSV
  elements.btnExportCsv.addEventListener('click', exportToCsv);

  // Copy all phone numbers
  elements.btnCopyPhones.addEventListener('click', copyAllPhones);

    // Open Live Walking Radar Modal
    elements.btnLiveRadar.addEventListener('click', openLiveRadarModal);
    elements.btnCloseModal.addEventListener('click', () => {
      elements.radarModal.classList.add('hidden');
    });

    // Copy share URL
    elements.btnCopyShareUrl.addEventListener('click', () => {
      navigator.clipboard.writeText(elements.inputShareUrl.value)
        .then(() => alert('Live Radar Link copied to clipboard!'))
        .catch(() => alert('Failed to copy.'));
    });

    // Backend Cloud API Settings Modal
    if (elements.btnBackendSettings && elements.backendModal) {
      elements.btnBackendSettings.addEventListener('click', () => {
        const savedUrl = localStorage.getItem('walk_lead_backend_url') || '';
        elements.inputBackendUrl.value = savedUrl;
        elements.backendStatus.style.display = 'none';
        elements.backendModal.classList.remove('hidden');
      });

      elements.btnCloseBackendModal.addEventListener('click', () => {
        elements.backendModal.classList.add('hidden');
      });

      elements.btnTestBackend.addEventListener('click', async () => {
        const url = elements.inputBackendUrl.value.trim().replace(/\/$/, '');
        elements.backendStatus.style.display = 'block';
        if (!url) {
          elements.backendStatus.style.background = 'rgba(59, 130, 246, 0.2)';
          elements.backendStatus.style.color = '#93c5fd';
          elements.backendStatus.textContent = 'ℹ️ Defaulting to local relative API (/api)';
          return;
        }

        elements.backendStatus.style.background = 'rgba(234, 179, 8, 0.2)';
        elements.backendStatus.style.color = '#fde047';
        elements.backendStatus.textContent = '⏳ Testing connection to ' + url + '/health ...';

        try {
          const res = await fetch(`${url}/health`, { timeout: 8000 });
          if (res.ok) {
            const data = await res.json();
            elements.backendStatus.style.background = 'rgba(16, 185, 129, 0.2)';
            elements.backendStatus.style.color = '#6ee7b7';
            elements.backendStatus.textContent = '✅ Connected successfully! API is live and ready.';
          } else {
            throw new Error(`Server returned HTTP ${res.status}`);
          }
        } catch (err) {
          elements.backendStatus.style.background = 'rgba(239, 68, 68, 0.2)';
          elements.backendStatus.style.color = '#fca5a5';
          elements.backendStatus.textContent = `❌ Connection failed: ${err.message}. Ensure backend is awake.`;
        }
      });

      elements.btnSaveBackend.addEventListener('click', () => {
        const url = elements.inputBackendUrl.value.trim().replace(/\/$/, '');
        if (url) {
          localStorage.setItem('walk_lead_backend_url', url);
        } else {
          localStorage.removeItem('walk_lead_backend_url');
        }
        alert('Backend API URL saved! Ready to scan.');
        elements.backendModal.classList.add('hidden');
      });
    }
  }

  // Geocoding Suggestions
  async function fetchGeocodeSuggestions(query) {
    try {
      const res = await fetch(getApiUrl(`/api/geocode?query=${encodeURIComponent(query)}`));
      const data = await res.json();
      const list = data.results || [];
      if (list.length === 0) {
        elements.geocodeSuggestions.classList.add('hidden');
        return;
      }

      elements.geocodeSuggestions.innerHTML = '';
      list.forEach(item => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.textContent = item.name;
        div.addEventListener('click', () => {
          setLocation(item.lat, item.lng, false);
          elements.inputAddress.value = item.name;
          state.map.setView([item.lat, item.lng], 15);
          elements.geocodeSuggestions.classList.add('hidden');
        });
        elements.geocodeSuggestions.appendChild(div);
      });
      elements.geocodeSuggestions.classList.remove('hidden');
    } catch (err) {
      elements.geocodeSuggestions.classList.add('hidden');
    }
  }

  // Perform Lead Search
  async function performLeadSearch() {
    elements.btnSearch.disabled = true;
    elements.searchProgress.classList.remove('hidden');
    elements.progressText.textContent = `Scanning 1km area for "${state.keyword}" (< ${state.maxReviews} reviews)...`;

    try {
      const response = await fetch(getApiUrl('/api/search'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: state.lat,
          lng: state.lng,
          address: elements.inputAddress.value,
          keyword: state.keyword,
          radiusKm: state.radiusKm,
          maxReviews: state.maxReviews,
          maxResults: 100,
          engine: state.engine
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Search failed');

      state.leads = data.leads || [];
      applyFilters();

      elements.btnExportCsv.disabled = state.leads.length === 0;

    } catch (err) {
      alert('Error scanning leads: ' + err.message);
    } finally {
      elements.btnSearch.disabled = false;
      elements.searchProgress.classList.add('hidden');
    }
  }

// Apply Filters & Render
function applyFilters() {
  let list = state.leads.filter(lead => lead.reviews <= state.maxReviews);

  if (state.websiteFilter === 'no_website') {
    list = list.filter(l => !l.hasWebsite);
  } else if (state.websiteFilter === 'has_website') {
    list = list.filter(l => l.hasWebsite);
  }

  state.filteredLeads = list;
  renderLeads(list);
  updateKPIs(list);
  renderMapMarkers(list);
}

// Update KPI Counters
function updateKPIs(list) {
  elements.kpiTotal.textContent = list.length;
  elements.kpiPrime.textContent = list.filter(l => l.reviews < 50).length;
  elements.kpiNoWebsite.textContent = list.filter(l => !l.hasWebsite).length;
  elements.resultsCount.textContent = `${list.length} qualified leads`;
}

// Group Key Helper
function getGroupKey(lead, groupBy) {
  if (groupBy === 'category') {
    return lead.category && lead.category.trim().length > 0 ? lead.category.trim() : 'Other Businesses';
  }
  if (groupBy === 'keyword') {
    return lead.searchKeyword && lead.searchKeyword.trim().length > 0 ? lead.searchKeyword.trim() : (lead.category || 'General Discovery');
  }
  if (groupBy === 'review_tier') {
    if (lead.reviews < 50) return '🔥 Prime Leads (< 50 Reviews)';
    if (lead.reviews <= 100) return '⭐ High Opportunity (50 - 100 Reviews)';
    return '📈 Moderate Reviews (100 - 200 Reviews)';
  }
  if (groupBy === 'website') {
    return lead.hasWebsite ? '🟢 Has Website' : '🔴 Missing Website (High Value Lead)';
  }
  return 'All Leads';
}

// Group Icon Helper
function getGroupIcon(groupName, groupBy) {
  const s = (groupName || '').toLowerCase();
  if (s.includes('salon') || s.includes('beauty') || s.includes('spa') || s.includes('hair') || s.includes('parlour') || s.includes('makeup') || s.includes('nail')) return '💇';
  if (s.includes('clinic') || s.includes('dental') || s.includes('health') || s.includes('hospital') || s.includes('pharmacy') || s.includes('doctor') || s.includes('physio') || s.includes('optician') || s.includes('pet') || s.includes('vet')) return '🏥';
  if (s.includes('cloth') || s.includes('boutique') || s.includes('saree') || s.includes('tailor') || s.includes('jewel') || s.includes('footwear') || s.includes('fashion')) return '👗';
  if (s.includes('mobile') || s.includes('electronic') || s.includes('laptop') || s.includes('computer') || s.includes('appliance') || s.includes('repair') || s.includes('hardware')) return '📱';
  if (s.includes('car') || s.includes('bike') || s.includes('auto') || s.includes('tyre') || s.includes('service') || s.includes('wash') || s.includes('detailing')) return '🚗';
  if (s.includes('furniture') || s.includes('decor') || s.includes('paint') || s.includes('plumb') || s.includes('interior') || s.includes('electrical')) return '🏠';
  if (s.includes('coaching') || s.includes('school') || s.includes('tuition') || s.includes('courier') || s.includes('xerox') || s.includes('travel') || s.includes('real estate')) return '🎓';
  if (s.includes('prime') || s.includes('< 50')) return '🔥';
  if (s.includes('high opportunity') || s.includes('50 - 100')) return '⭐';
  if (s.includes('missing') || s.includes('no website')) return '🔴';
  if (s.includes('has website')) return '🟢';
  return groupBy === 'keyword' ? '🔍' : '📂';
}

// Create Lead Card DOM Element
function createLeadCard(lead, idx) {
  const card = document.createElement('div');
  const isPrime = lead.reviews < 50;
  card.className = `lead-card ${isPrime ? 'prime' : ''}`;
  card.id = `lead-card-${idx}`;

  let reviewBadgeClass = 'low';
  let reviewText = '';

  if (lead.reviews > 0) {
    reviewText = `⭐ ${lead.reviews} reviews`;
    reviewBadgeClass = lead.reviews < 50 ? 'ultra-low' : 'low';
  } else if (lead.rating > 0) {
    reviewText = `⭐ < 5 reviews (Hot Lead)`;
    reviewBadgeClass = 'ultra-low';
  } else {
    reviewText = `⭐ 0 Reviews (Untapped!)`;
    reviewBadgeClass = 'ultra-low';
  }

  card.innerHTML = `
    <div class="lead-top">
      <div class="lead-name">
        <span>${lead.name}</span>
      </div>
      <div class="lead-meta-badges">
        <span class="review-badge ${reviewBadgeClass}">${reviewText}</span>
        ${lead.rating > 0 ? `<span class="rating-badge"><i class="fa-solid fa-star"></i> ${lead.rating.toFixed(1)}</span>` : ''}
      </div>
    </div>

    <div class="lead-details">
      <div class="lead-detail-row">
        <i class="fa-solid fa-tag"></i>
        <span>${lead.category || 'Local Business'}</span>
        ${lead.searchKeyword ? `<span style="font-size:0.72rem; color:#a78bfa; margin-left:6px;" title="Discovered via keyword">(${lead.searchKeyword})</span>` : ''}
        <span style="margin-left: auto; color: #60a5fa; font-size: 0.75rem;">
          <i class="fa-solid fa-person-walking"></i> ${lead.distanceMeters}m away
        </span>
      </div>
      <div class="lead-detail-row">
        <i class="fa-solid fa-location-dot"></i>
        <span>${lead.address}</span>
      </div>
      ${lead.phone ? `
        <div class="lead-detail-row">
          <i class="fa-solid fa-phone"></i>
          <a href="tel:${lead.phone}" style="color: #34d399; text-decoration: none; font-weight:600;">${lead.phone}</a>
        </div>
      ` : ''}
    </div>

    <div class="lead-actions">
      ${lead.phone ? `
        <a href="tel:${lead.phone}" class="btn-action phone-btn">
          <i class="fa-solid fa-phone"></i> Call
        </a>
      ` : ''}
      ${lead.website ? `
        <a href="${lead.website}" target="_blank" rel="noopener" class="btn-action">
          <i class="fa-solid fa-globe"></i> Website
        </a>
      ` : '<span class="no-website-tag"><i class="fa-solid fa-triangle-exclamation"></i> No Website</span>'}
      <a href="${lead.googleMapsUrl}" target="_blank" rel="noopener" class="btn-action" style="margin-left:auto;">
        <i class="fa-brands fa-google"></i> Maps
      </a>
    </div>
  `;

  // Click card to center on map
  card.addEventListener('click', (e) => {
    if (e.target.tagName.toLowerCase() === 'a' || e.target.closest('a')) return;
    if (lead.lat && lead.lng) {
      state.map.setView([lead.lat, lead.lng], 17);
    }
  });

  return card;
}

// Render Leads Cards (Supports Flat List & Grouped Mode)
function renderLeads(list) {
  elements.leadsList.innerHTML = '';

  if (list.length === 0) {
    elements.leadsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><i class="fa-solid fa-filter-circle-xmark"></i></div>
        <h4>No Leads Matched Filters</h4>
        <p>Try increasing the review threshold slider or expanding the walking radius.</p>
      </div>
    `;
    return;
  }

  // 1. Flat List Mode (No Grouping)
  if (state.groupBy === 'none') {
    list.forEach((lead, idx) => {
      const card = createLeadCard(lead, idx);
      elements.leadsList.appendChild(card);
    });
    return;
  }

  // 2. Grouped Mode (By Category, Keyword, Review Tier, or Website)
  const groupsMap = new Map();
  list.forEach((lead, idx) => {
    const key = getGroupKey(lead, state.groupBy);
    if (!groupsMap.has(key)) {
      groupsMap.set(key, []);
    }
    groupsMap.get(key).push({ lead, originalIndex: idx });
  });

  // Sort groups by lead count descending
  const sortedGroups = Array.from(groupsMap.entries()).sort((a, b) => b[1].length - a[1].length);

  sortedGroups.forEach(([groupName, groupItems], groupIdx) => {
    const groupContainer = document.createElement('div');
    groupContainer.className = 'lead-group';
    groupContainer.dataset.groupId = groupIdx;

    const groupIcon = getGroupIcon(groupName, state.groupBy);
    const groupLeads = groupItems.map(item => item.lead);
    const phoneCount = groupLeads.filter(l => l.phone && l.phone.trim().length > 0).length;

    // Header
    const groupHeader = document.createElement('div');
    groupHeader.className = 'group-header';
    groupHeader.innerHTML = `
      <div class="group-header-left">
        <i class="fa-solid fa-chevron-down group-chevron"></i>
        <span class="group-icon">${groupIcon}</span>
        <span class="group-title">${groupName}</span>
        <span class="group-badge">${groupItems.length} leads</span>
      </div>
      <div class="group-header-actions" onclick="event.stopPropagation()">
        ${phoneCount > 0 ? `
          <button class="btn btn-micro btn-group-phones" title="Copy ${phoneCount} phone numbers in this group">
            <i class="fa-regular fa-copy"></i> Phones (${phoneCount})
          </button>
        ` : ''}
        <button class="btn btn-micro btn-group-export" title="Export this group to CSV">
          <i class="fa-solid fa-file-csv"></i> Export
        </button>
      </div>
    `;

    // Group Click: Toggle Collapse / Expand
    groupHeader.addEventListener('click', () => {
      groupContainer.classList.toggle('collapsed');
    });

    // Group Copy Phones
    const btnGroupPhones = groupHeader.querySelector('.btn-group-phones');
    if (btnGroupPhones) {
      btnGroupPhones.addEventListener('click', (e) => {
        e.stopPropagation();
        copyGroupPhones(groupLeads);
      });
    }

    // Group Export to CSV
    const btnGroupExport = groupHeader.querySelector('.btn-group-export');
    if (btnGroupExport) {
      btnGroupExport.addEventListener('click', (e) => {
        e.stopPropagation();
        exportGroupToCsv(groupName, groupLeads);
      });
    }

    // Content container
    const groupContent = document.createElement('div');
    groupContent.className = 'group-content';

    groupItems.forEach(({ lead, originalIndex }) => {
      const card = createLeadCard(lead, originalIndex);
      groupContent.appendChild(card);
    });

    groupContainer.appendChild(groupHeader);
    groupContainer.appendChild(groupContent);
    elements.leadsList.appendChild(groupContainer);
  });
}

// Render Lead Markers on Leaflet Map
function renderMapMarkers(list) {
  // Clear previous markers
  state.leadMarkers.forEach(m => state.map.removeLayer(m));
  state.leadMarkers = [];

  list.forEach((lead, idx) => {
    if (!lead.lat || !lead.lng) return;

    const isPrime = lead.reviews < 50;
    const markerColor = isPrime ? '#f59e0b' : '#10b981';

    const customIcon = L.divIcon({
      className: 'custom-lead-pin',
      html: `<div style="background:${markerColor};color:#111827;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;border:2px solid #ffffff;box-shadow:0 0 8px rgba(0,0,0,0.5);">${lead.reviews}</div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });

    const marker = L.marker([lead.lat, lead.lng], { icon: customIcon }).addTo(state.map);
    
    const popupContent = `
      <div style="font-size:13px; line-height: 1.4;">
        <h4 style="margin:0 0 4px 0; font-size:14px; font-weight:700; color:#10b981;">${lead.name}</h4>
        <div><b>Reviews:</b> ${lead.reviews} | <b>Rating:</b> ${lead.rating || 'N/A'}</div>
        <div><b>Category:</b> ${lead.category}</div>
        ${lead.searchKeyword ? `<div><b>Keyword:</b> ${lead.searchKeyword}</div>` : ''}
        <div><b>Distance:</b> ${lead.distanceMeters}m from center</div>
        ${lead.phone ? `<div><b>Phone:</b> <a href="tel:${lead.phone}" style="color:#34d399;">${lead.phone}</a></div>` : ''}
        <div style="margin-top:6px;">
          <a href="${lead.googleMapsUrl}" target="_blank" style="color:#60a5fa; text-decoration:none; font-weight:600;">Open in Google Maps &rarr;</a>
        </div>
      </div>
    `;

    marker.bindPopup(popupContent);
    marker.on('click', () => {
      const card = document.getElementById(`lead-card-${idx}`);
      if (card) {
        // If inside a collapsed group, open the group first
        const group = card.closest('.lead-group');
        if (group && group.classList.contains('collapsed')) {
          group.classList.remove('collapsed');
        }
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.style.borderColor = '#10b981';
        setTimeout(() => { card.style.borderColor = ''; }, 2000);
      }
    });

    state.leadMarkers.push(marker);
  });
}

// Copy Group Phone Numbers
function copyGroupPhones(groupLeads) {
  const phones = (groupLeads || [])
    .map(l => l.phone)
    .filter(p => p && p.trim().length > 0);

  if (phones.length === 0) {
    alert('No phone numbers available in this group.');
    return;
  }

  navigator.clipboard.writeText(phones.join('\n'))
    .then(() => alert(`Copied ${phones.length} phone numbers from this group to clipboard!`))
    .catch(() => alert('Failed to copy.'));
}

// Export Group to CSV
function exportGroupToCsv(groupName, groupLeads) {
  if (!groupLeads || groupLeads.length === 0) return;

  const headers = ['Name', 'Category', 'Search Keyword', 'Reviews', 'Rating', 'Distance (Meters)', 'Phone', 'Website', 'Address', 'Google Maps URL'];
  const rows = groupLeads.map(l => [
    `"${(l.name || '').replace(/"/g, '""')}"`,
    `"${(l.category || '').replace(/"/g, '""')}"`,
    `"${(l.searchKeyword || '').replace(/"/g, '""')}"`,
    l.reviews,
    l.rating || 0,
    l.distanceMeters,
    `"${(l.phone || '').replace(/"/g, '""')}"`,
    `"${(l.website || '').replace(/"/g, '""')}"`,
    `"${(l.address || '').replace(/"/g, '""')}"`,
    `"${(l.googleMapsUrl || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  const safeName = groupName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  link.setAttribute('download', `leads_${safeName}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Export All Filtered Leads to CSV
function exportToCsv() {
  if (state.filteredLeads.length === 0) return;

  const headers = ['Name', 'Category', 'Search Keyword', 'Reviews', 'Rating', 'Distance (Meters)', 'Phone', 'Website', 'Address', 'Google Maps URL'];
  const rows = state.filteredLeads.map(l => [
    `"${(l.name || '').replace(/"/g, '""')}"`,
    `"${(l.category || '').replace(/"/g, '""')}"`,
    `"${(l.searchKeyword || '').replace(/"/g, '""')}"`,
    l.reviews,
    l.rating || 0,
    l.distanceMeters,
    `"${(l.phone || '').replace(/"/g, '""')}"`,
    `"${(l.website || '').replace(/"/g, '""')}"`,
    `"${(l.address || '').replace(/"/g, '""')}"`,
    `"${(l.googleMapsUrl || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `leads_1km_under_${state.maxReviews}_reviews.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Copy All Phone Numbers
function copyAllPhones() {
  const phones = state.filteredLeads
    .map(l => l.phone)
    .filter(p => p && p.trim().length > 0);

  if (phones.length === 0) {
    alert('No phone numbers found in current results.');
    return;
  }

  navigator.clipboard.writeText(phones.join('\n'))
    .then(() => alert(`Copied ${phones.length} phone numbers to clipboard!`))
    .catch(() => alert('Failed to copy.'));
}

// Open Live Walking Radar Modal
async function openLiveRadarModal() {
  const leadsToShare = state.filteredLeads.length > 0 ? state.filteredLeads : state.leads;
  
  if (leadsToShare.length === 0) {
    alert('Please scan for leads first before opening the Live Walking Radar.');
    return;
  }

  // Build clean, compact payload for URL encoding
  const compactLeads = leadsToShare.map(l => ({
    name: l.name,
    category: l.category,
    searchKeyword: l.searchKeyword,
    reviews: l.reviews,
    rating: l.rating,
    phone: l.phone,
    address: l.address,
    lat: l.lat,
    lng: l.lng,
    googleMapsUrl: l.googleMapsUrl
  }));

  const payload = {
    leads: compactLeads,
    center: { lat: state.lat, lng: state.lng },
    radiusKm: state.radiusKm
  };

  const jsonStr = JSON.stringify(payload);

  // 1. Save locally for fallback
  localStorage.setItem('walk_leads_latest', jsonStr);

  // 2. Default fallback: compressed URL hash
  let cloudUrl = `https://walk-lead-radar.vercel.app/#data=${LZString.compressToEncodedURIComponent(jsonStr)}`;

  // 3. Try to generate clean 48-hour short link (e.g. https://walk-lead-radar.vercel.app/?id=a8f9c2)
  try {
    const res = await fetch('https://walk-lead-radar.vercel.app/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: payload })
    });

    if (res.ok) {
      const data = await res.json();
      if (data.shortUrl) {
        cloudUrl = data.shortUrl;
      }
    }
  } catch (err) {
    console.warn('Session short-link API offline or fallback to hash:', err);
  }

  // Update modal input, direct open button, and QR code
  elements.inputShareUrl.value = cloudUrl;
  elements.btnOpenRadarDirect.href = cloudUrl;
  elements.qrCodeImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(cloudUrl)}`;

  // Show modal
  elements.radarModal.classList.remove('hidden');
}
