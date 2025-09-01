// App State
const app = {
    stations: [],
    filteredStations: [],
    favorites: JSON.parse(localStorage.getItem('villoFavorites')) || [],
    userLocation: null,
    map: null,
    markers: [],
    currentView: 'table',
    language: localStorage.getItem('villoLanguage') || 'nl',
    theme: localStorage.getItem('villoTheme') || 'light',
    sortField: 'name',
    sortDirection: 'asc',
    isLoading: false,
    retryCount: 0,
    maxRetries: 3
};

// Translations
const translations = {
    nl: {
        loading: 'Data wordt geladen...',
        noResults: 'Geen resultaten gevonden',
        favoritesAdded: 'Toegevoegd aan favorieten',
        favoritesRemoved: 'Verwijderd uit favorieten',
        locationFound: 'Locatie gevonden',
        locationError: 'Kon locatie niet vinden',
        dataRefreshed: 'Data vernieuwd',
        apiError: 'Fout bij laden van data',
        networkError: 'Netwerkfout - controleer je internetverbinding',
        retrying: 'Opnieuw proberen...'
    },
    fr: {
        loading: 'Chargement des données...',
        noResults: 'Aucun résultat trouvé',
        favoritesAdded: 'Ajouté aux favoris',
        favoritesRemoved: 'Retiré des favoris',
        locationFound: 'Position trouvée',
        locationError: 'Impossible de trouver la position',
        dataRefreshed: 'Données actualisées',
        apiError: 'Erreur lors du chargement des données',
        networkError: 'Erreur réseau - vérifiez votre connexion internet',
        retrying: 'Nouvelle tentative...'
    },
    en: {
        loading: 'Loading data...',
        noResults: 'No results found',
        favoritesAdded: 'Added to favorites',
        favoritesRemoved: 'Removed from favorites',
        locationFound: 'Location found',
        locationError: 'Could not find location',
        dataRefreshed: 'Data refreshed',
        apiError: 'Error loading data',
        networkError: 'Network error - check your internet connection',
        retrying: 'Retrying...'
    }
};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    attachEventListeners();
    fetchStations();
    initializeMap();
    
    // Setup Intersection Observer for lazy loading
    setupIntersectionObserver();
});

// Initialize application settings
const initializeApp = () => {
    // Apply saved theme
    document.documentElement.setAttribute('data-theme', app.theme);
    updateThemeButton();
    
    // Apply saved language
    document.getElementById('languageSelect').value = app.language;
    
    // Update favorites count
    updateStats();
};

// Fetch stations data from API with correct structure
const fetchStations = async () => {
    if (app.isLoading) return;
    
    app.isLoading = true;
    const loading = document.getElementById('loading');
    const errorMessage = document.getElementById('errorMessage');
    
    loading.classList.add('active');
    errorMessage.style.display = 'none';
    
    try {
        // Correct API endpoint based on the provided structure
        const response = await fetch('https://opendata.brussels.be/api/explore/v2.1/catalog/datasets/disponibilite-en-temps-reel-des-velos-villo-rbc/records?limit=100&timezone=Europe%2FBrussels');
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('API Response:', data);
        
        // Use the correct field name from API response
        const records = data.results || [];
        
        if (records.length === 0) {
            throw new Error('Geen stations gevonden in API response');
        }
        
        app.stations = processStationData(records);
        app.filteredStations = [...app.stations];
        app.retryCount = 0; // Reset retry count on success
        
        updateDisplay();
        updateStats();
        showNotification(translations[app.language].dataRefreshed);
        
    } catch (error) {
        console.error('Error fetching data:', error);
        handleFetchError(error);
    } finally {
        app.isLoading = false;
        loading.classList.remove('active');
    }
};

// Handle fetch errors with retry logic
const handleFetchError = (error) => {
    const errorMessage = document.getElementById('errorMessage');
    const errorText = document.getElementById('errorText');
    
    let message = translations[app.language].apiError;
    
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        message = translations[app.language].networkError;
    } else {
        message += `: ${error.message}`;
    }
    
    errorText.textContent = message;
    errorMessage.style.display = 'block';
    
    // Auto-retry logic
    if (app.retryCount < app.maxRetries) {
        app.retryCount++;
        showNotification(`${translations[app.language].retrying} (${app.retryCount}/${app.maxRetries})`, 'warning');
        setTimeout(() => {
            fetchStations();
        }, 2000 * app.retryCount); // Exponential backoff
    }
};

// Process raw station data based on correct API structure
const processStationData = (records) => {
    console.log('Processing station data. Sample record:', records[0]);
    
    return records.map(record => {
        // Direct field access based on API structure shown
        const name = app.language === 'fr' ? 
            (record.name_fr || record.name_nl || 'Station sans nom') : 
            (record.name_nl || record.name_fr || 'Station zonder naam');
            
        const address = app.language === 'fr' ? 
            (record.address_fr || record.address_nl || 'Adresse inconnue') : 
            (record.address_nl || record.address_fr || 'Adres onbekend');
        
        // Map availability fields correctly
        const availableBikes = parseInt(record.available_bikes || 0);
        const availableSlots = parseInt(record.available_bike_stands || 0);
        const capacity = parseInt(record.bike_stands || 0);
        
        // Extract coordinates from geo_point_2d
        const lat = record.geo_point_2d ? parseFloat(record.geo_point_2d.lat) : 0;
        const lng = record.geo_point_2d ? parseFloat(record.geo_point_2d.lon) : 0;
        
        // Use number as ID
        const id = record.number || Math.random().toString(36);
        
        return {
            id: id,
            name: name,
            address: address,
            bikes: availableBikes,
            slots: availableSlots,
            capacity: capacity,
            lat: lat,
            lng: lng,
            status: 'OPEN', // Assume open if in API
            isFavorite: app.favorites.includes(id.toString()),
            distance: null,
            municipality: app.language === 'fr' ? record.mu_fr : record.mu_nl,
            postalCode: record.pccp,
            lastUpdate: record.last_update
        };
    }).filter(station => {
        // Filter out stations with invalid coordinates
        return station.lat !== 0 && station.lng !== 0 && 
               !isNaN(station.lat) && !isNaN(station.lng) &&
               Math.abs(station.lat - 50.8) < 0.3 && // Brussels area latitude check
               Math.abs(station.lng - 4.35) < 0.3;   // Brussels area longitude check
    });
};

// Calculate distance from user location
const calculateDistances = () => {
    if (!app.userLocation) return;
    
    app.stations.forEach(station => {
        station.distance = calculateDistance(
            app.userLocation.lat,
            app.userLocation.lng,
            station.lat,
            station.lng
        );
    });
    
    app.filteredStations = [...app.stations];
    updateDisplay();
};

// Haversine formula for distance calculation
const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Radius of Earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return (R * c).toFixed(2);
};

// Update display based on current view
const updateDisplay = () => {
    if (app.currentView === 'table') {
        updateTable();
    } else {
        updateMap();
    }
};

// Update table view
const updateTable = () => {
    const tbody = document.getElementById('tableBody');
    const noResults = document.getElementById('noResults');
    
    if (app.filteredStations.length === 0) {
        tbody.innerHTML = '';
        noResults.style.display = 'block';
        return;
    }
    
    noResults.style.display = 'none';
    
    tbody.innerHTML = app.filteredStations.map(station => `
        <tr class="fade-in">
            <td>
                <button class="favorite-btn ${station.isFavorite ? 'active' : ''}" 
                        onclick="toggleFavorite('${station.id}')"
                        aria-label="Toggle favorite">
                    ${station.isFavorite ? '⭐' : '☆'}
                </button>
            </td>
            <td><strong>${station.name}</strong></td>
            <td>${station.address}</td>
            <td><span class="${getBikeStatusClass(station.bikes)}">${station.bikes}</span></td>
            <td>${station.slots}</td>
            <td>${station.capacity}</td>
            <td>${getStatusBadge(station)}</td>
            <td>${station.distance ? station.distance + ' km' : '-'}</td>
        </tr>
    `).join('');
};

// Get CSS class based on bike availability
const getBikeStatusClass = (bikes) => {
    if (bikes > 10) return 'status-good';
    if (bikes > 5) return 'status-medium';
    if (bikes > 0) return 'status-low';
    return 'status-none';
};

// Get status badge HTML
const getStatusBadge = (station) => {
    const percentage = station.capacity > 0 ? (station.bikes / station.capacity) * 100 : 0;
    let statusClass = 'status-low';
    let statusText = 'Weinig';
    
    if (percentage > 60) {
        statusClass = 'status-good';
        statusText = 'Goed';
    } else if (percentage > 30) {
        statusClass = 'status-medium';
        statusText = 'Matig';
    } else if (station.bikes === 0) {
        statusClass = 'status-none';
        statusText = 'Leeg';
    }
    
    return `<span class="status-badge ${statusClass}">${statusText}</span>`;
};

// Initialize Leaflet map
const initializeMap = () => {
    app.map = L.map('map').setView([50.8503, 4.3517], 12);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(app.map);
};

// Update map markers
const updateMap = () => {
    // Clear existing markers
    app.markers.forEach(marker => app.map.removeLayer(marker));
    app.markers = [];
    
    // Add markers for filtered stations
    app.filteredStations.forEach(station => {
        const color = station.bikes > 10 ? 'green' : 
                     station.bikes > 5 ? 'orange' : 
                     station.bikes > 0 ? 'red' : 'gray';
        
        const marker = L.circleMarker([station.lat, station.lng], {
            radius: 8,
            fillColor: color,
            color: '#fff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8
        });
        
        marker.bindPopup(`
            <div style="padding: 10px;">
                <h3 style="margin: 0 0 10px 0;">${station.name}</h3>
                <p style="margin: 5px 0;">${station.address}</p>
                <p style="margin: 5px 0;">🚲 Beschikbaar: <strong>${station.bikes}</strong></p>
                <p style="margin: 5px 0;">🅿️ Vrije plekken: <strong>${station.slots}</strong></p>
                <p style="margin: 5px 0;">Capaciteit: <strong>${station.capacity}</strong></p>
                <button onclick="toggleFavorite('${station.id}')" 
                        style="margin-top: 10px; padding: 5px 10px; cursor: pointer;">
                    ${station.isFavorite ? '⭐ Verwijder favoriet' : '☆ Voeg toe aan favorieten'}
                </button>
            </div>
        `);
        
        marker.addTo(app.map);
        app.markers.push(marker);
    });
    
    // Add user location marker if available
    if (app.userLocation) {
        const userMarker = L.marker([app.userLocation.lat, app.userLocation.lng], {
            icon: L.divIcon({
                html: '📍',
                iconSize: [30, 30],
                className: 'user-location-marker'
            })
        });
        userMarker.bindPopup('Jouw locatie');
        userMarker.addTo(app.map);
        app.markers.push(userMarker);
    }
    
    // Fit map to show all markers if we have stations
    if (app.filteredStations.length > 0) {
        const group = new L.featureGroup(app.markers.filter(m => m._latlng));
        if (group.getLayers().length > 0) {
            app.map.fitBounds(group.getBounds().pad(0.1));
        }
    }
};

// Update statistics
const updateStats = () => {
    const totalBikes = app.stations.reduce((sum, s) => sum + s.bikes, 0);
    const totalSlots = app.stations.reduce((sum, s) => sum + s.slots, 0);
    
    document.getElementById('totalStations').textContent = app.stations.length;
    document.getElementById('totalBikes').textContent = totalBikes;
    document.getElementById('totalSlots').textContent = totalSlots;
    document.getElementById('totalFavorites').textContent = app.favorites.length;
};

// Toggle favorite status
const toggleFavorite = (stationId) => {
    const station = app.stations.find(s => s.id.toString() === stationId.toString());
    if (!station) return;
    
    station.isFavorite = !station.isFavorite;
    
    if (station.isFavorite) {
        app.favorites.push(stationId.toString());
        showNotification(translations[app.language].favoritesAdded);
    } else {
        app.favorites = app.favorites.filter(id => id.toString() !== stationId.toString());
        showNotification(translations[app.language].favoritesRemoved);
    }
    
    localStorage.setItem('villoFavorites', JSON.stringify(app.favorites));
    updateDisplay();
    updateStats();
};

// Filter stations
const filterStations = () => {
    let filtered = [...app.stations];
    
    // Search filter
    const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
    if (searchTerm) {
        filtered = filtered.filter(station => 
            station.name.toLowerCase().includes(searchTerm) ||
            station.address.toLowerCase().includes(searchTerm) ||
            (station.municipality && station.municipality.toLowerCase().includes(searchTerm))
        );
    }
    
    // Availability filter
    const availabilityFilter = document.getElementById('availabilityFilter').value;
    if (availabilityFilter) {
        filtered = filtered.filter(station => {
            switch(availabilityFilter) {
                case 'high': return station.bikes > 10;
                case 'medium': return station.bikes >= 5 && station.bikes <= 10;
                case 'low': return station.bikes > 0 && station.bikes < 5;
                case 'none': return station.bikes === 0;
                default: return true;
            }
        });
    }
    
    // Show favorites only
    const showFavoritesBtn = document.getElementById('showFavoritesBtn');
    if (showFavoritesBtn.classList.contains('active')) {
        filtered = filtered.filter(station => station.isFavorite);
    }
    
    app.filteredStations = filtered;
    sortStations();
};

// Sort stations
const sortStations = () => {
    const sortField = document.getElementById('sortSelect').value;
    
    app.filteredStations.sort((a, b) => {
        let aVal = a[sortField];
        let bVal = b[sortField];
        
        // Handle null/undefined values
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return 1;
        if (bVal == null) return -1;
        
        if (typeof aVal === 'string') {
            aVal = aVal.toLowerCase();
            bVal = bVal.toLowerCase();
        }
        
        if (aVal < bVal) return app.sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return app.sortDirection === 'asc' ? 1 : -1;
        return 0;
    });
    
    updateDisplay();
};

// Show notification
const showNotification = (message, type = 'success') => {
    const notification = document.getElementById('notification');
    const notificationText = document.getElementById('notificationText');
    
    notificationText.textContent = message;
    notification.className = 'notification show';
    
    // Apply appropriate styling based on type
    switch(type) {
        case 'error':
            notification.style.background = 'var(--accent-color)';
            break;
        case 'warning':
            notification.style.background = 'var(--warning-color)';
            break;
        default:
            notification.style.background = 'var(--success-color)';
    }
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
};

// Toggle theme
const toggleTheme = () => {
    app.theme = app.theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', app.theme);
    localStorage.setItem('villoTheme', app.theme);
    updateThemeButton();
};

// Update theme button
const updateThemeButton = () => {
    const themeBtn = document.getElementById('themeToggle');
    themeBtn.textContent = app.theme === 'light' ? '🌙' : '☀️';
};

// Get user location
const getUserLocation = () => {
    if (!navigator.geolocation) {
        showNotification('Geolocation is not supported', 'error');
        return;
    }
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            app.userLocation = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            };
            
            calculateDistances();
            
            if (app.map) {
                app.map.setView([app.userLocation.lat, app.userLocation.lng], 14);
                updateMap();
            }
            
            showNotification(translations[app.language].locationFound);
        },
        (error) => {
            console.error('Error getting location:', error);
            showNotification(translations[app.language].locationError, 'error');
        },
        {
            timeout: 10000,
            enableHighAccuracy: true
        }
    );
};

// Setup Intersection Observer for lazy loading
const setupIntersectionObserver = () => {
    const observerOptions = {
        root: null,
        rootMargin: '50px',
        threshold: 0.1
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('fade-in');
            }
        });
    }, observerOptions);
    
    // Observe stat cards
    document.querySelectorAll('.stat-card').forEach(card => {
        observer.observe(card);
    });
};

// Validate form inputs
const validateInput = (input) => {
    const value = input.value.trim();
    const isValid = value.length >= 2 || value.length === 0;
    
    if (!isValid) {
        input.style.borderColor = 'var(--accent-color)';
        return false;
    }
    
    input.style.borderColor = 'var(--secondary-color)';
    return true;
};

// Attach event listeners
const attachEventListeners = () => {
    // Search input with debouncing
    let searchTimeout;
    document.getElementById('searchInput').addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        if (validateInput(e.target)) {
            searchTimeout = setTimeout(() => {
                filterStations();
            }, 300);
        }
    });
    
    // Availability filter
    document.getElementById('availabilityFilter').addEventListener('change', filterStations);
    
    // Sort select
    document.getElementById('sortSelect').addEventListener('change', sortStations);
    
    // Show favorites button
    document.getElementById('showFavoritesBtn').addEventListener('click', (e) => {
        e.target.classList.toggle('active');
        filterStations();
    });
    
    // View toggle buttons
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            const view = e.target.dataset.view;
            app.currentView = view;
            
            if (view === 'table') {
                document.getElementById('tableView').style.display = 'block';
                document.getElementById('mapView').style.display = 'none';
            } else {
                document.getElementById('tableView').style.display = 'none';
                document.getElementById('mapView').style.display = 'block';
                setTimeout(() => {
                    app.map.invalidateSize();
                    updateMap();
                }, 100);
            }
        });
    });
    
    // Table header sorting
    document.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', (e) => {
            const field = e.target.dataset.sort;
            
            // Update sort direction
            if (app.sortField === field) {
                app.sortDirection = app.sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                app.sortField = field;
                app.sortDirection = 'asc';
            }
            
            // Update visual indicators
            document.querySelectorAll('th.sortable').forEach(header => {
                header.classList.remove('sorted-asc', 'sorted-desc');
            });
            
            e.target.classList.add(app.sortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');
            
            // Update sort select to match
            document.getElementById('sortSelect').value = field;
            
            sortStations();
        });
    });
    
    // Theme toggle
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
    
    // Geolocation button
    document.getElementById('geolocateBtn').addEventListener('click', getUserLocation);
    
    // Refresh button
    document.getElementById('refreshBtn').addEventListener('click', () => {
        app.retryCount = 0; // Reset retry count on manual refresh
        fetchStations();
    });
    
    // Retry button in error message
    document.getElementById('retryBtn') && document.getElementById('retryBtn').addEventListener('click', () => {
        app.retryCount = 0;
        fetchStations();
    });
    
    // Language select
    document.getElementById('languageSelect').addEventListener('change', (e) => {
        app.language = e.target.value;
        localStorage.setItem('villoLanguage', app.language);
        
        // Refresh data to get correct language fields
        fetchStations();
        showNotification('Language changed to ' + e.target.options[e.target.selectedIndex].text);
    });
    
    // Auto-refresh every 5 minutes
    setInterval(() => {
        if (!app.isLoading) {
            fetchStations();
        }
    }, 5 * 60 * 1000);
    
    // Handle online/offline status
    window.addEventListener('online', () => {
        showNotification('Connection restored');
        if (!app.isLoading) {
            fetchStations();
        }
    });
    
    window.addEventListener('offline', () => {
        showNotification('No internet connection', 'error');
    });
    
    // Save scroll position
    let scrollTimeout;
    window.addEventListener('scroll', () => {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            localStorage.setItem('villoScrollPosition', window.scrollY);
        }, 100);
    });
    
    // Restore scroll position
    const savedScrollPosition = localStorage.getItem('villoScrollPosition');
    if (savedScrollPosition) {
        setTimeout(() => {
            window.scrollTo(0, parseInt(savedScrollPosition));
        }, 100);
    }
    
    // Handle visibility change (tab switching)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && !app.isLoading) {
            // Refresh data when tab becomes visible
            const lastRefresh = localStorage.getItem('villoLastRefresh');
            const now = Date.now();
            
            if (!lastRefresh || now - parseInt(lastRefresh) > 60000) {
                fetchStations();
                localStorage.setItem('villoLastRefresh', now.toString());
            }
        }
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + K for search focus
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            document.getElementById('searchInput').focus();
        }
        
        // Ctrl/Cmd + R for refresh (prevent default browser refresh)
        if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
            e.preventDefault();
            if (!app.isLoading) {
                app.retryCount = 0;
                fetchStations();
            }
        }
        
        // Escape to clear search
        if (e.key === 'Escape') {
            document.getElementById('searchInput').value = '';
            filterStations();
            document.getElementById('searchInput').blur();
        }
    });
};

// Service Worker registration for offline support (optional enhancement)
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {
        // Service worker registration failed, app will work without offline support
        console.log('Service worker not available, app will work without offline support');
    });
}