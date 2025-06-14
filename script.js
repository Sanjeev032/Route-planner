// API keys
const ORS_API_KEY = '5b3ce3597851110001cf6248934174877afb4ee5a4e19ee6949f5097';
const WEATHER_API_KEY = 'f5937f8b380bcd2f70f483a1e21eb07f';

let map;
let routeLayers = [];
let selectedLocations = {
    start: null,
    end: null
};

// Vehicle efficiency data (cost per km in USD)
const vehicleEfficiency = {
    'car': { 
        name: 'Car (Petrol)',
        fuelRate: 8.5,    // L/100km
        costPerLiter: 1.5,
        co2PerKm: 120     // g/km
    },
    'car-diesel': {
        name: 'Car (Diesel)',
        fuelRate: 6.5,    // L/100km
        costPerLiter: 1.3,
        co2PerKm: 140     // g/km
    },
    'car-hybrid': {
        name: 'Car (Hybrid)',
        fuelRate: 4.5,    // L/100km
        costPerLiter: 1.5,
        co2PerKm: 90      // g/km
    },
    'car-electric': {
        name: 'Car (Electric)',
        kwhPer100km: 15,  // kWh/100km
        costPerKwh: 0.15,
        co2PerKm: 50      // g/km (from power generation)
    },
    'suv': {
        name: 'SUV',
        fuelRate: 12.0,   // L/100km
        costPerLiter: 1.5,
        co2PerKm: 180     // g/km
    },
    'truck': {
        name: 'Truck',
        fuelRate: 35.0,   // L/100km
        costPerLiter: 1.3,
        co2PerKm: 250     // g/km
    },
    'motorcycle': {
        name: 'Motorcycle',
        fuelRate: 5.0,    // L/100km
        costPerLiter: 1.5,
        co2PerKm: 80      // g/km
    }
};

// Initialize the map
function initMap() {
    map = L.map('map').setView([20, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: ' OpenStreetMap contributors'
    }).addTo(map);
}

// Calculate trip cost and environmental impact
function calculateTripMetrics(distance, vehicleType) {
    const vehicle = vehicleEfficiency[vehicleType];
    const distanceInKm = distance;
    
    let cost, consumption, co2;
    
    if (vehicleType === 'car-electric') {
        consumption = (vehicle.kwhPer100km * distanceInKm / 100).toFixed(2) + ' kWh';
        cost = (vehicle.kwhPer100km * distanceInKm / 100 * vehicle.costPerKwh).toFixed(2);
    } else {
        consumption = (vehicle.fuelRate * distanceInKm / 100).toFixed(2) + ' L';
        cost = (vehicle.fuelRate * distanceInKm / 100 * vehicle.costPerLiter).toFixed(2);
    }
    
    co2 = (vehicle.co2PerKm * distanceInKm / 1000).toFixed(2); // kg of CO2
    
    return {
        consumption,
        cost: parseFloat(cost),
        co2,
        costPerKm: (cost / distanceInKm).toFixed(3)
    };
}

// Update efficiency comparison table
function updateEfficiencyComparison(distance) {
    const efficiencyData = document.getElementById('efficiencyData');
    efficiencyData.innerHTML = '';
    
    const metrics = [];
    
    // Calculate metrics for all vehicle types
    Object.keys(vehicleEfficiency).forEach(vehicleType => {
        const result = calculateTripMetrics(distance, vehicleType);
        metrics.push({
            type: vehicleType,
            name: vehicleEfficiency[vehicleType].name,
            ...result
        });
    });
    
    // Sort by cost
    metrics.sort((a, b) => a.cost - b.cost);
    
    // Calculate savings percentage compared to most expensive option
    const maxCost = Math.max(...metrics.map(m => m.cost));
    
    metrics.forEach(metric => {
        const savingsPercent = ((maxCost - metric.cost) / maxCost * 100).toFixed(1);
        const savingsClass = savingsPercent > 50 ? 'savings-high' : 
                           savingsPercent > 25 ? 'savings-medium' : 'savings-low';
        
        const row = document.createElement('div');
        row.className = 'efficiency-row';
        row.innerHTML = `
            <span>${metric.name}
                <span class="savings-badge ${savingsClass}">
                    ${savingsPercent}% savings
                </span>
            </span>
            <span>$${metric.costPerKm}/km</span>
            <span>$${metric.cost}</span>
        `;
        efficiencyData.appendChild(row);
    });
}

// Clear all routes from the map
function clearRoutes() {
    routeLayers.forEach(layer => map.removeLayer(layer));
    routeLayers = [];
    if (window.startMarker) map.removeLayer(window.startMarker);
    if (window.endMarker) map.removeLayer(window.endMarker);
}

// Display a route on the map
function displayRoute(coordinates, color = '#4CAF50', weight = 5) {
    const routeLayer = L.polyline(coordinates, { 
        color, 
        weight,
        opacity: 0.8,
        lineCap: 'round'
    }).addTo(map);
    
    routeLayers.push(routeLayer);
    return routeLayer;
}

// Update alternate routes display
function updateAlternateRoutes(routes, selectedIndex = 0) {
    const container = document.getElementById('alternateRoutes');
    container.innerHTML = '';
    
    routes.forEach((route, index) => {
        const metrics = calculateTripMetrics(route.distance / 1000, document.getElementById('vehicleType').value);
        
        const div = document.createElement('div');
        div.className = `alternate-route-item${index === selectedIndex ? ' selected' : ''}`;
        div.innerHTML = `
            <div>Route ${index + 1}${index === selectedIndex ? ' (Current)' : ''}</div>
            <div class="route-stats">
                <span>${(route.distance / 1000).toFixed(1)} km</span>
                <span>${Math.round(route.duration / 60)} min</span>
                <span>$${metrics.cost}</span>
            </div>
        `;
        
        div.onclick = () => {
            clearRoutes();
            displayRoute(route.coordinates);
            updateAlternateRoutes(routes, index);
            
            // Update main info section
            document.getElementById('distance').textContent = `${(route.distance / 1000).toFixed(1)} km`;
            document.getElementById('duration').textContent = `${Math.round(route.duration / 60)} minutes`;
            document.getElementById('fuel').textContent = metrics.consumption;
            
            // Add markers
            addRouteMarkers();
        };
        
        container.appendChild(div);
    });
}

// Show loading indicator
function showLoading() {
    document.getElementById('loadingIndicator').style.display = 'flex';
    document.getElementById('errorMessage').style.display = 'none';
}

// Hide loading indicator
function hideLoading() {
    document.getElementById('loadingIndicator').style.display = 'none';
}

// Show error message
function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

// Clear error message
function clearError() {
    document.getElementById('errorMessage').style.display = 'none';
}

// Get weather information for the destination
async function getWeather(lat, lon) {
    try {
        const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${WEATHER_API_KEY}&units=metric`);
        
        if (!response.ok) {
            throw new Error('Weather data not available');
        }

        const data = await response.json();
        
        // Update weather information
        document.getElementById('weather').textContent = `${Math.round(data.main.temp)}°C, ${data.weather[0].description}`;
        
    } catch (error) {
        console.error('Error fetching weather:', error);
        document.getElementById('weather').textContent = 'Weather data not available';
    }
}

// Handle location search and autocomplete
async function handleSearch(input, suggestionsList, locationType) {
    const query = input.value.trim();
    
    if (query.length < 3) {
        suggestionsList.innerHTML = '';
        return;
    }
    
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
        if (!response.ok) {
            throw new Error('Failed to fetch location suggestions');
        }
        
        const data = await response.json();
        
        // Clear previous suggestions
        suggestionsList.innerHTML = '';
        
        // Display up to 5 suggestions
        data.slice(0, 5).forEach(place => {
            const div = document.createElement('div');
            div.textContent = place.display_name;
            div.className = 'suggestion';
            div.addEventListener('click', () => {
                input.value = place.display_name;
                selectedLocations[locationType] = {
                    lat: parseFloat(place.lat),
                    lon: parseFloat(place.lon)
                };
                suggestionsList.innerHTML = '';
            });
            suggestionsList.appendChild(div);
        });
        
    } catch (error) {
        console.error('Error fetching suggestions:', error);
        showError('Failed to fetch location suggestions. Please try again.');
    }
}

// Calculate and display the route
async function calculateRoute() {
    if (!selectedLocations.start || !selectedLocations.end) {
        showError('Please select both start and end locations from the suggestions.');
        return;
    }

    const vehicleType = document.getElementById('vehicleType').value;
    showLoading();
    clearError();
    clearRoutes();

    try {
        const requestCoordinates = [
            [selectedLocations.start.lon, selectedLocations.start.lat],
            [selectedLocations.end.lon, selectedLocations.end.lat]
        ];
        
        // Try OpenRouteService first
        let routes = [];
        let errorMessage = '';
        
        try {
            const orsResponse = await fetch('https://api.openrouteservice.org/v2/directions/driving-car', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json, application/geo+json',
                    'Content-Type': 'application/json',
                    'Authorization': ORS_API_KEY
                },
                body: JSON.stringify({
                    coordinates: requestCoordinates,
                    instructions: true,
                    units: 'km',
                    alternatives: true,
                    alternative_routes: {
                        target_count: 3,
                        weight_factor: 1.4
                    }
                })
            });
            
            if (orsResponse.ok) {
                const data = await orsResponse.json();
                if (data.routes && data.routes.length > 0) {
                    routes = data.routes.map(route => ({
                        coordinates: route.geometry.coordinates.map(coord => [coord[1], coord[0]]),
                        distance: route.summary.distance,
                        duration: route.summary.duration
                    }));
                } else {
                    errorMessage = 'Invalid route data from OpenRouteService';
                }
            } else {
                errorMessage = await orsResponse.text();
            }
        } catch (orsError) {
            console.error('OpenRouteService error:', orsError);
            errorMessage = orsError.message;
        }
        
        // If OpenRouteService fails, try OSRM
        if (routes.length === 0) {
            console.log('OpenRouteService failed, trying OSRM...', errorMessage);
            const start = `${selectedLocations.start.lon},${selectedLocations.start.lat}`;
            const end = `${selectedLocations.end.lon},${selectedLocations.end.lat}`;
            
            const osrmResponse = await fetch(`https://router.project-osrm.org/route/v1/driving/${start};${end}?overview=full&geometries=geojson&alternatives=true`, {
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            if (!osrmResponse.ok) {
                throw new Error('All routing services failed to calculate a route');
            }
            
            const osrmData = await osrmResponse.json();
            if (!osrmData.routes || osrmData.routes.length === 0) {
                throw new Error('No route found between these locations');
            }
            
            routes = osrmData.routes.map(route => ({
                coordinates: route.geometry.coordinates.map(coord => [coord[1], coord[0]]),
                distance: route.distance,
                duration: route.duration
            }));
        }

        // Display the primary route
        const primaryRoute = routes[0];
        displayRoute(primaryRoute.coordinates);
        
        // Add markers
        window.startMarker = L.marker([selectedLocations.start.lat, selectedLocations.start.lon], {
            title: 'Start Location',
            icon: L.divIcon({
                className: 'custom-div-icon',
                html: "<div style='background-color:#4CAF50;padding:5px;border-radius:50%;border:2px solid white'></div>",
                iconSize: [15, 15],
                iconAnchor: [7, 7]
            })
        }).bindPopup('Start').addTo(map);
        
        window.endMarker = L.marker([selectedLocations.end.lat, selectedLocations.end.lon], {
            title: 'Destination',
            icon: L.divIcon({
                className: 'custom-div-icon',
                html: "<div style='background-color:#f44336;padding:5px;border-radius:50%;border:2px solid white'></div>",
                iconSize: [15, 15],
                iconAnchor: [7, 7]
            })
        }).bindPopup('Destination').addTo(map);

        // Fit map to show all routes
        const bounds = L.latLngBounds(routes[0].coordinates);
        map.fitBounds(bounds, { padding: [50, 50] });

        // Update route information
        const distance = primaryRoute.distance / 1000;
        const duration = Math.round(primaryRoute.duration / 60);
        const metrics = calculateTripMetrics(distance, vehicleType);

        document.getElementById('distance').textContent = `${distance.toFixed(1)} km`;
        document.getElementById('duration').textContent = `${duration} minutes`;
        document.getElementById('fuel').textContent = metrics.consumption;

        // Update alternate routes and efficiency comparison
        updateAlternateRoutes(routes);
        updateEfficiencyComparison(distance);

        // Get weather for destination
        await getWeather(selectedLocations.end.lat, selectedLocations.end.lon);

    } catch (error) {
        console.error('Error calculating route:', error);
        showError(`Error calculating route: ${error.message}. Please try different locations or try again later.`);
    } finally {
        hideLoading();
    }
}

// Initialize map and autocomplete when page loads
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    
    // Set up location search handlers
    const startInput = document.getElementById('startLocation');
    const endInput = document.getElementById('endLocation');
    const startSuggestions = document.getElementById('startSuggestions');
    const endSuggestions = document.getElementById('endSuggestions');
    
    startInput.addEventListener('input', () => handleSearch(startInput, startSuggestions, 'start'));
    endInput.addEventListener('input', () => handleSearch(endInput, endSuggestions, 'end'));
    
    // Close suggestions when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.location-input-wrapper')) {
            startSuggestions.innerHTML = '';
            endSuggestions.innerHTML = '';
        }
    });
});
