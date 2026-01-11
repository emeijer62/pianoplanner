/**
 * Reistijd en route berekening - Wereldwijd
 * Gebruikt Google Maps Distance Matrix API & Places API
 */

const https = require('https');

/**
 * Bereken reistijd tussen twee locaties via Google Maps API
 * Werkt wereldwijd met elk adres of coördinaten
 * @param {string} origin - Vertrekadres of "lat,lng"
 * @param {string} destination - Bestemmingsadres of "lat,lng"
 * @returns {Promise<{duration: number, distance: number, durationText: string, distanceText: string}>}
 */
const calculateTravelTime = async (origin, destination) => {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    
    // Als geen API key, gebruik schatting
    if (!apiKey) {
        console.log('⚠️ Geen Google Maps API key - gebruik geschatte reistijd');
        return estimateTravelTime(origin, destination);
    }
    
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&mode=driving&language=nl&key=${apiKey}`;
    
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    
                    if (result.status === 'OK' && result.rows[0].elements[0].status === 'OK') {
                        const element = result.rows[0].elements[0];
                        resolve({
                            duration: Math.ceil(element.duration.value / 60), // minuten
                            distance: Math.round(element.distance.value / 1000), // km
                            durationText: element.duration.text,
                            distanceText: element.distance.text,
                            origin: result.origin_addresses[0],
                            destination: result.destination_addresses[0]
                        });
                    } else {
                        // Fallback naar schatting
                        console.log('⚠️ Google Maps API kon route niet vinden, fallback naar schatting');
                        resolve(estimateTravelTime(origin, destination));
                    }
                } catch (err) {
                    reject(err);
                }
            });
        }).on('error', reject);
    });
};

/**
 * Geocode een adres naar coördinaten
 * @param {string} address - Het adres om te geocoden
 * @returns {Promise<{lat: number, lng: number, formattedAddress: string}>}
 */
const geocodeAddress = async (address) => {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    
    if (!apiKey) {
        throw new Error('Geen Google Maps API key geconfigureerd');
    }
    
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
    
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    
                    if (result.status === 'OK' && result.results.length > 0) {
                        const location = result.results[0].geometry.location;
                        resolve({
                            lat: location.lat,
                            lng: location.lng,
                            formattedAddress: result.results[0].formatted_address,
                            placeId: result.results[0].place_id,
                            components: parseAddressComponents(result.results[0].address_components)
                        });
                    } else {
                        reject(new Error('Adres niet gevonden'));
                    }
                } catch (err) {
                    reject(err);
                }
            });
        }).on('error', reject);
    });
};

/**
 * Parse address components van Google Geocode response
 */
const parseAddressComponents = (components) => {
    const result = {};
    
    if (!components || !Array.isArray(components)) {
        console.log('📍 No address components to parse');
        return result;
    }
    
    for (const component of components) {
        if (component.types.includes('street_number')) {
            result.streetNumber = component.long_name;
        }
        if (component.types.includes('route')) {
            result.street = component.long_name;
        }
        // City can be in locality, postal_town, or sublocality
        if (component.types.includes('locality')) {
            result.city = component.long_name;
        }
        // postal_town is used in some countries like UK
        if (component.types.includes('postal_town') && !result.city) {
            result.city = component.long_name;
        }
        // sublocality as fallback for city
        if (component.types.includes('sublocality_level_1') && !result.city) {
            result.city = component.long_name;
        }
        if (component.types.includes('administrative_area_level_1')) {
            result.state = component.long_name;
        }
        // administrative_area_level_2 can also be the city/region
        if (component.types.includes('administrative_area_level_2') && !result.city) {
            result.city = component.long_name;
        }
        if (component.types.includes('country')) {
            result.country = component.long_name;
            result.countryCode = component.short_name;
        }
        if (component.types.includes('postal_code')) {
            result.postalCode = component.long_name;
        }
        // postal_code_prefix for areas without full postal code
        if (component.types.includes('postal_code_prefix') && !result.postalCode) {
            result.postalCode = component.long_name;
        }
    }
    
    return result;
};

/**
 * Autocomplete voor adressen (voor frontend)
 * @param {string} input - Zoekterm
 * @param {string} sessionToken - Session token voor billing optimization
 * @returns {Promise<Array>}
 */
// Mapping van landen naar aangrenzende landen voor adres autocomplete
const neighboringCountries = {
    'NL': ['BE', 'DE'],           // Nederland: België, Duitsland
    'BE': ['NL', 'DE', 'FR', 'LU'], // België: Nederland, Duitsland, Frankrijk, Luxemburg
    'DE': ['NL', 'BE', 'FR', 'LU', 'AT', 'CH', 'PL', 'CZ', 'DK'], // Duitsland
    'FR': ['BE', 'DE', 'LU', 'CH', 'IT', 'ES', 'MC', 'AD'], // Frankrijk
    'LU': ['BE', 'DE', 'FR'],     // Luxemburg
    'AT': ['DE', 'CH', 'IT', 'SI', 'HU', 'SK', 'CZ', 'LI'], // Oostenrijk
    'CH': ['DE', 'FR', 'IT', 'AT', 'LI'], // Zwitserland
    'GB': ['IE'],                  // Groot-Brittannië: Ierland
    'IE': ['GB'],                  // Ierland: Groot-Brittannië
    'ES': ['FR', 'PT', 'AD'],     // Spanje
    'PT': ['ES'],                  // Portugal
    'IT': ['FR', 'CH', 'AT', 'SI', 'SM', 'VA'], // Italië
    'PL': ['DE', 'CZ', 'SK', 'UA', 'BY', 'LT', 'RU'], // Polen
    'DK': ['DE'],                  // Denemarken
    'SE': ['NO', 'FI'],           // Zweden
    'NO': ['SE', 'FI', 'RU'],     // Noorwegen
    'FI': ['SE', 'NO', 'RU'],     // Finland
};

/**
 * Get countries to search in based on user's country
 * @param {string} userCountry - ISO country code (e.g., 'NL')
 * @param {boolean} includeNeighbors - Include neighboring countries
 * @returns {string[]} Array of country codes
 */
const getSearchCountries = (userCountry, includeNeighbors = true) => {
    const countries = [userCountry];
    if (includeNeighbors && neighboringCountries[userCountry]) {
        countries.push(...neighboringCountries[userCountry]);
    }
    return countries;
};

const getPlaceAutocomplete = async (input, sessionToken = null, userCountry = null, includeNeighbors = true) => {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    
    if (!apiKey) {
        return [];
    }
    
    // Google Places Autocomplete ondersteunt slechts 1 land per request
    // Voor meerdere landen doen we parallel requests
    const countries = userCountry ? getSearchCountries(userCountry.toUpperCase(), includeNeighbors) : [null];
    
    const fetchPredictions = async (country) => {
        let url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&types=address&key=${apiKey}`;
        
        if (sessionToken) {
            url += `&sessiontoken=${sessionToken}`;
        }
        
        if (country) {
            url += `&components=country:${country.toLowerCase()}`;
        }
        
        return new Promise((resolve) => {
            https.get(url, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        if (result.status === 'OK') {
                            resolve(result.predictions.map(p => ({
                                description: p.description,
                                placeId: p.place_id,
                                mainText: p.structured_formatting?.main_text,
                                secondaryText: p.structured_formatting?.secondary_text
                            })));
                        } else {
                            resolve([]);
                        }
                    } catch (err) {
                        resolve([]);
                    }
                });
            }).on('error', () => resolve([]));
        });
    };
    
    try {
        // Parallel requests voor alle landen
        const results = await Promise.all(countries.map(c => fetchPredictions(c)));
        
        // Combineer en deduplicate op placeId
        const seen = new Set();
        const combined = [];
        for (const predictions of results) {
            for (const p of predictions) {
                if (!seen.has(p.placeId)) {
                    seen.add(p.placeId);
                    combined.push(p);
                }
            }
        }
        
        // Sorteer zodat resultaten van eigen land eerst komen
        if (userCountry) {
            combined.sort((a, b) => {
                const aIsHome = a.description.toLowerCase().includes(userCountry.toLowerCase()) ? 0 : 1;
                const bIsHome = b.description.toLowerCase().includes(userCountry.toLowerCase()) ? 0 : 1;
                return aIsHome - bIsHome;
            });
        }
        
        return combined.slice(0, 5); // Max 5 resultaten
    } catch (err) {
        console.error('Autocomplete error:', err);
        return [];
    }
};

/**
 * Haal place details op via place_id
 * @param {string} placeId - Google Place ID
 * @returns {Promise<Object>}
 */
const getPlaceDetails = async (placeId) => {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    
    if (!apiKey) {
        throw new Error('Geen Google Maps API key geconfigureerd');
    }
    
    // Request more fields to ensure we get postal_code
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=formatted_address,geometry,address_components,name&key=${apiKey}`;
    
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    
                    console.log('📍 Place Details API response status:', result.status);
                    
                    if (result.status === 'OK') {
                        const place = result.result;
                        
                        console.log('📍 Address components:', JSON.stringify(place.address_components, null, 2));
                        
                        const components = parseAddressComponents(place.address_components);
                        
                        console.log('📍 Parsed components:', components);
                        
                        resolve({
                            formattedAddress: place.formatted_address,
                            lat: place.geometry.location.lat,
                            lng: place.geometry.location.lng,
                            components: components
                        });
                    } else {
                        console.error('📍 Place Details API error:', result.status, result.error_message);
                        reject(new Error('Place niet gevonden: ' + result.status));
                    }
                } catch (err) {
                    reject(err);
                }
            });
        }).on('error', reject);
    });
};

/**
 * Schat reistijd zonder API (wereldwijde fallback)
 * Gebaseerd op gemiddelde snelheid van 50 km/u
 */
const estimateTravelTime = (origin, destination) => {
    // Standaard schatting: 30 minuten / 25 km
    // In toekomst: gebruik coördinaten voor betere schatting
    return {
        duration: 30,
        distance: 25,
        durationText: '~30 min (geschat)',
        distanceText: '~25 km (geschat)',
        estimated: true
    };
};

/**
 * Bereken het eerste beschikbare tijdslot rekening houdend met reistijd en buffertijden
 * @param {Array} existingEvents - Bestaande events van de dag
 * @param {number} travelTime - Reistijd in minuten
 * @param {number} serviceDuration - Duur van de dienst in minuten
 * @param {Date} date - De gewenste datum
 * @param {Object} workHours - Werktijden {start: '09:00', end: '18:00'}
 * @param {number} bufferBefore - Buffer voor afspraak in minuten (bijv. opzetten)
 * @param {number} bufferAfter - Buffer na afspraak in minuten (bijv. opruimen)
 */
// Round time to nearest 15-minute interval (forward)
const roundToQuarter = (date) => {
    const d = new Date(date);
    const minutes = d.getMinutes();
    const remainder = minutes % 15;
    if (remainder > 0) {
        d.setMinutes(minutes + (15 - remainder));
    }
    d.setSeconds(0, 0);
    return d;
};

const findFirstAvailableSlot = (existingEvents, travelTime, serviceDuration, date, workHours = { start: '09:00', end: '18:00' }, bufferBefore = 0, bufferAfter = 0) => {
    const dayStart = new Date(date);
    const [startHour, startMin] = workHours.start.split(':').map(Number);
    dayStart.setHours(startHour, startMin, 0, 0);
    
    const dayEnd = new Date(date);
    const [endHour, endMin] = workHours.end.split(':').map(Number);
    dayEnd.setHours(endHour, endMin, 0, 0);
    
    // Totale benodigde tijd = reistijd + buffer voor + dienst + buffer na
    const totalNeeded = travelTime + bufferBefore + serviceDuration + bufferAfter;
    
    // Sorteer events op starttijd en filter alleen events die BINNEN werkuren vallen
    // Events buiten werkuren (avond/weekend) moeten niet verhinderen dat we een slot vinden
    const sortedEvents = existingEvents
        .filter(e => e.start.dateTime) // Alleen events met tijd
        .map(e => ({
            start: new Date(e.start.dateTime),
            end: new Date(e.end.dateTime)
        }))
        .filter(e => {
            // Alleen events die (deels) binnen werkuren vallen
            // Een event valt buiten werkuren als het geheel voor dayStart begint EN eindigt
            // OF geheel na dayEnd begint
            const eventEndsBeforeWorkday = e.end <= dayStart;
            const eventStartsAfterWorkday = e.start >= dayEnd;
            return !eventEndsBeforeWorkday && !eventStartsAfterWorkday;
        })
        .map(e => ({
            // Clip events aan werkuren zodat avond-events niet de hele dag blokkeren
            start: e.start < dayStart ? dayStart : e.start,
            end: e.end > dayEnd ? dayEnd : e.end
        }))
        .sort((a, b) => a.start - b.start);
    
    // Check of er ruimte is aan het begin van de dag
    let currentTime = new Date(dayStart);
    
    for (const event of sortedEvents) {
        // Tijd beschikbaar voor dit event
        const availableMinutes = (event.start - currentTime) / (1000 * 60);
        
        if (availableMinutes >= totalNeeded) {
            // Er is ruimte! Bereken tijden met buffers
            // Round appointment start to nearest quarter hour for professional appearance
            const rawAppointmentStart = new Date(currentTime.getTime() + (travelTime + bufferBefore) * 60 * 1000);
            const appointmentStart = roundToQuarter(rawAppointmentStart);
            
            // Recalculate other times based on rounded appointment start
            const bufferBeforeStart = new Date(appointmentStart.getTime() - bufferBefore * 60 * 1000);
            const travelStart = new Date(bufferBeforeStart.getTime() - travelTime * 60 * 1000);
            const appointmentEnd = new Date(appointmentStart.getTime() + serviceDuration * 60 * 1000);
            const slotEnd = new Date(appointmentEnd.getTime() + bufferAfter * 60 * 1000);
            
            return {
                travelStart,
                bufferBeforeStart,
                appointmentStart,
                appointmentEnd,
                slotEnd,
                travelTime,
                serviceDuration,
                bufferBefore,
                bufferAfter,
                totalDuration: totalNeeded
            };
        }
        
        // Spring naar einde van dit event
        currentTime = new Date(event.end);
    }
    
    // Check of er nog ruimte is na het laatste event
    const remainingMinutes = (dayEnd - currentTime) / (1000 * 60);
    
    if (remainingMinutes >= totalNeeded) {
        // Round appointment start to nearest quarter hour for professional appearance
        const rawAppointmentStart = new Date(currentTime.getTime() + (travelTime + bufferBefore) * 60 * 1000);
        const appointmentStart = roundToQuarter(rawAppointmentStart);
        
        // Recalculate other times based on rounded appointment start
        const bufferBeforeStart = new Date(appointmentStart.getTime() - bufferBefore * 60 * 1000);
        const travelStart = new Date(bufferBeforeStart.getTime() - travelTime * 60 * 1000);
        const appointmentEnd = new Date(appointmentStart.getTime() + serviceDuration * 60 * 1000);
        const slotEnd = new Date(appointmentEnd.getTime() + bufferAfter * 60 * 1000);
        
        return {
            travelStart,
            bufferBeforeStart,
            appointmentStart,
            appointmentEnd,
            slotEnd,
            travelTime,
            serviceDuration,
            bufferBefore,
            bufferAfter,
            totalDuration: totalNeeded
        };
    }
    
    // Geen ruimte gevonden op deze dag
    return null;
};

/**
 * Vind ALLE beschikbare slots op een dag (voor Smart Pick met meerdere opties)
 * @param {Array} existingEvents - Bestaande afspraken
 * @param {number} travelTime - Reistijd in minuten
 * @param {number} serviceDuration - Duur van de dienst in minuten
 * @param {Date} date - De datum
 * @param {Object} workHours - Werkuren {start: '09:00', end: '18:00'}
 * @param {number} bufferBefore - Buffer voor afspraak in minuten
 * @param {number} bufferAfter - Buffer na afspraak in minuten
 * @param {number} maxSlots - Maximum aantal slots om te retourneren
 * @param {number} skipSlots - Aantal slots om over te slaan (voor "meer opties")
 * @returns {Array} Array van beschikbare slots
 */
const findAllAvailableSlots = (existingEvents, travelTime, serviceDuration, date, workHours = { start: '09:00', end: '18:00' }, bufferBefore = 0, bufferAfter = 0, maxSlots = 6, skipSlots = 0) => {
    const dayStart = new Date(date);
    const [startHour, startMin] = workHours.start.split(':').map(Number);
    dayStart.setHours(startHour, startMin, 0, 0);
    
    const dayEnd = new Date(date);
    const [endHour, endMin] = workHours.end.split(':').map(Number);
    dayEnd.setHours(endHour, endMin, 0, 0);
    
    // Totale benodigde tijd = reistijd + buffer voor + dienst + buffer na
    const totalNeeded = travelTime + bufferBefore + serviceDuration + bufferAfter;
    
    // Helper: haal datetime uit event (ondersteunt beide formaten)
    const getEventDateTime = (event, field) => {
        const value = event[field];
        if (!value) return null;
        // Support: { dateTime: "..." } of direct "..."
        const dateStr = value.dateTime || value;
        return dateStr ? new Date(dateStr) : null;
    };
    
    // Sorteer events op starttijd en filter alleen events binnen werkuren
    const sortedEvents = existingEvents
        .map(e => ({
            start: getEventDateTime(e, 'start'),
            end: getEventDateTime(e, 'end'),
            summary: e.summary || e.title || 'Event'
        }))
        .filter(e => e.start && e.end) // Filter events zonder geldige tijden
        .filter(e => {
            const eventEndsBeforeWorkday = e.end <= dayStart;
            const eventStartsAfterWorkday = e.start >= dayEnd;
            return !eventEndsBeforeWorkday && !eventStartsAfterWorkday;
        })
        .map(e => ({
            start: e.start < dayStart ? dayStart : e.start,
            end: e.end > dayEnd ? dayEnd : e.end,
            summary: e.summary
        }))
        .sort((a, b) => a.start - b.start);
    
    console.log(`[findAllAvailableSlots] Processing ${sortedEvents.length} events on ${date.toISOString().split('T')[0]}`);
    sortedEvents.forEach(e => console.log(`  - ${e.summary}: ${e.start.toTimeString().slice(0,5)} - ${e.end.toTimeString().slice(0,5)}`));
    
    const slots = [];
    let currentTime = new Date(dayStart);
    let slotsFound = 0;
    let slotsSkipped = 0;
    
    // Helper function to try to find a slot at currentTime
    const tryFindSlot = (availableUntil) => {
        // Genereer slots in intervallen van 30 minuten binnen beschikbare ruimte
        while (currentTime < availableUntil && slotsFound < maxSlots) {
            const potentialEnd = new Date(currentTime.getTime() + totalNeeded * 60 * 1000);
            
            if (potentialEnd <= availableUntil) {
                // Er past een slot hier
                const rawAppointmentStart = new Date(currentTime.getTime() + (travelTime + bufferBefore) * 60 * 1000);
                const appointmentStart = roundToQuarter(rawAppointmentStart);
                
                // Check of deze tijd niet te vroeg is (voor werkdag start)
                if (appointmentStart >= dayStart) {
                    const bufferBeforeStart = new Date(appointmentStart.getTime() - bufferBefore * 60 * 1000);
                    const travelStart = new Date(bufferBeforeStart.getTime() - travelTime * 60 * 1000);
                    const appointmentEnd = new Date(appointmentStart.getTime() + serviceDuration * 60 * 1000);
                    const slotEnd = new Date(appointmentEnd.getTime() + bufferAfter * 60 * 1000);
                    
                    // Check dat slot niet voorbij werkdag einde gaat
                    if (slotEnd <= dayEnd) {
                        if (slotsSkipped < skipSlots) {
                            slotsSkipped++;
                        } else {
                            slots.push({
                                travelStart,
                                bufferBeforeStart,
                                appointmentStart,
                                appointmentEnd,
                                slotEnd,
                                travelTime,
                                serviceDuration,
                                bufferBefore,
                                bufferAfter,
                                totalDuration: totalNeeded
                            });
                            slotsFound++;
                        }
                    }
                }
            }
            
            // Spring 30 minuten vooruit voor volgende potentiële slot
            currentTime = new Date(currentTime.getTime() + 30 * 60 * 1000);
        }
    };
    
    // Loop door events en vind slots in de gaten
    for (const event of sortedEvents) {
        // Zoek slots voor dit event
        tryFindSlot(event.start);
        
        if (slotsFound >= maxSlots) break;
        
        // Spring naar einde van dit event
        currentTime = new Date(Math.max(currentTime.getTime(), event.end.getTime()));
    }
    
    // Zoek slots na het laatste event
    if (slotsFound < maxSlots) {
        tryFindSlot(dayEnd);
    }
    
    return slots;
};

/**
 * Bereken distance matrix tussen locaties
 * @param {string[]} locations - Array van adressen
 * @returns {Promise<number[][]>} Matrix van reistijden in minuten
 */
const calculateDistanceMatrix = async (locations) => {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    const n = locations.length;
    
    // Initialiseer matrix met nullen
    const matrix = Array(n).fill(null).map(() => Array(n).fill(0));
    
    if (!apiKey || n < 2) {
        // Geen API key: gebruik geschatte afstanden (30 min tussen elke locatie)
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                if (i !== j) matrix[i][j] = 30;
            }
        }
        return matrix;
    }
    
    // Google Maps Distance Matrix ondersteunt max 25 origins/destinations
    const originsParam = locations.map(l => encodeURIComponent(l)).join('|');
    const destinationsParam = originsParam;
    
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originsParam}&destinations=${destinationsParam}&mode=driving&language=nl&key=${apiKey}`;
    
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    
                    if (result.status === 'OK') {
                        for (let i = 0; i < n; i++) {
                            for (let j = 0; j < n; j++) {
                                const element = result.rows[i].elements[j];
                                if (element.status === 'OK') {
                                    matrix[i][j] = Math.ceil(element.duration.value / 60);
                                } else {
                                    matrix[i][j] = 30; // Fallback
                                }
                            }
                        }
                        resolve(matrix);
                    } else {
                        // Fallback
                        for (let i = 0; i < n; i++) {
                            for (let j = 0; j < n; j++) {
                                if (i !== j) matrix[i][j] = 30;
                            }
                        }
                        resolve(matrix);
                    }
                } catch (err) {
                    reject(err);
                }
            });
        }).on('error', reject);
    });
};

/**
 * Optimaliseer de volgorde van afspraken voor minimale reistijd (TSP)
 * Gebruikt nearest neighbor heuristic + 2-opt verbetering
 * @param {Object[]} appointments - Array van afspraken met location
 * @param {string} startLocation - Vertrekpunt (bedrijfsadres)
 * @param {boolean} returnToStart - Moet terug naar start?
 * @returns {Promise<{optimizedOrder: Object[], totalDistance: number, totalTime: number, savings: {time: number, distance: number}}>}
 */
const optimizeRoute = async (appointments, startLocation, returnToStart = false) => {
    if (!appointments || appointments.length === 0) {
        return { optimizedOrder: [], totalDistance: 0, totalTime: 0, savings: { time: 0, distance: 0 } };
    }
    
    if (appointments.length === 1) {
        const travelInfo = await calculateTravelTime(startLocation, appointments[0].location);
        return {
            optimizedOrder: appointments,
            totalDistance: travelInfo.distance,
            totalTime: travelInfo.duration,
            savings: { time: 0, distance: 0 }
        };
    }
    
    // Verzamel alle locaties: [start, apt1, apt2, ..., (start)]
    const locations = [startLocation, ...appointments.map(a => a.location)];
    if (returnToStart) {
        locations.push(startLocation);
    }
    
    // Bereken afstandsmatrix
    const distanceMatrix = await calculateDistanceMatrix(locations);
    
    // Bereken huidige totale reistijd (originele volgorde)
    let originalTotalTime = 0;
    for (let i = 0; i < appointments.length; i++) {
        const fromIdx = i === 0 ? 0 : i; // Start of vorige afspraak
        const toIdx = i + 1;
        originalTotalTime += distanceMatrix[fromIdx][toIdx];
    }
    if (returnToStart) {
        originalTotalTime += distanceMatrix[appointments.length][0];
    }
    
    // Nearest neighbor algoritme voor initiële route
    const n = appointments.length;
    const visited = new Array(n).fill(false);
    const route = [];
    let currentIdx = 0; // Start bij index 0 (startLocation)
    
    for (let i = 0; i < n; i++) {
        let nearestIdx = -1;
        let nearestDist = Infinity;
        
        for (let j = 0; j < n; j++) {
            if (!visited[j]) {
                // afspraak j is op index j+1 in de matrix (want index 0 is startLocation)
                const dist = distanceMatrix[currentIdx][j + 1];
                if (dist < nearestDist) {
                    nearestDist = dist;
                    nearestIdx = j;
                }
            }
        }
        
        if (nearestIdx !== -1) {
            visited[nearestIdx] = true;
            route.push(nearestIdx);
            currentIdx = nearestIdx + 1; // +1 omdat matrix index 0 = startLocation
        }
    }
    
    // 2-opt verbetering
    let improved = true;
    while (improved) {
        improved = false;
        for (let i = 0; i < route.length - 1; i++) {
            for (let j = i + 1; j < route.length; j++) {
                const newRoute = twoOptSwap(route, i, j);
                if (calculateRouteCost(newRoute, distanceMatrix) < calculateRouteCost(route, distanceMatrix)) {
                    route.splice(0, route.length, ...newRoute);
                    improved = true;
                }
            }
        }
    }
    
    // Bereken geoptimaliseerde totale reistijd
    let optimizedTotalTime = distanceMatrix[0][route[0] + 1]; // Start naar eerste
    for (let i = 0; i < route.length - 1; i++) {
        optimizedTotalTime += distanceMatrix[route[i] + 1][route[i + 1] + 1];
    }
    if (returnToStart) {
        optimizedTotalTime += distanceMatrix[route[route.length - 1] + 1][0];
    }
    
    // Bouw geoptimaliseerde afspraken array
    const optimizedAppointments = route.map(idx => appointments[idx]);
    
    // Bereken afstanden
    let totalDistance = 0;
    let prevLocation = startLocation;
    for (const apt of optimizedAppointments) {
        const info = await calculateTravelTime(prevLocation, apt.location);
        totalDistance += info.distance || 0;
        prevLocation = apt.location;
    }
    
    return {
        optimizedOrder: optimizedAppointments,
        totalTime: optimizedTotalTime,
        totalDistance: totalDistance,
        originalTime: originalTotalTime,
        savings: {
            time: originalTotalTime - optimizedTotalTime,
            distance: 0 // Wordt later berekend als nodig
        }
    };
};

/**
 * 2-opt swap voor route optimalisatie
 */
function twoOptSwap(route, i, j) {
    const newRoute = route.slice(0, i);
    for (let k = j; k >= i; k--) {
        newRoute.push(route[k]);
    }
    for (let k = j + 1; k < route.length; k++) {
        newRoute.push(route[k]);
    }
    return newRoute;
}

/**
 * Bereken totale kosten van een route
 */
function calculateRouteCost(route, distanceMatrix) {
    if (route.length === 0) return 0;
    
    let cost = distanceMatrix[0][route[0] + 1]; // Van start naar eerste
    for (let i = 0; i < route.length - 1; i++) {
        cost += distanceMatrix[route[i] + 1][route[i + 1] + 1];
    }
    return cost;
}

/**
 * Plan een hele dag met optimale route
 * @param {Object[]} appointments - Afspraken met location en duration
 * @param {string} startLocation - Vertrekpunt
 * @param {Object} workHours - {start: '09:00', end: '18:00'}
 * @param {Date} date - De datum
 * @returns {Promise<Object[]>} Afspraken met berekende start/eindtijden en reistijden
 */
const planDayRoute = async (appointments, startLocation, workHours, date) => {
    if (!appointments || appointments.length === 0) {
        return [];
    }
    
    // Optimaliseer de volgorde
    const { optimizedOrder, totalTime, savings } = await optimizeRoute(appointments, startLocation);
    
    // Plan de tijden
    const [startH, startM] = workHours.start.split(':').map(Number);
    let currentTime = new Date(date);
    currentTime.setHours(startH, startM, 0, 0);
    
    const plannedAppointments = [];
    let prevLocation = startLocation;
    
    for (const apt of optimizedOrder) {
        // Bereken reistijd naar deze afspraak
        const travelInfo = await calculateTravelTime(prevLocation, apt.location);
        
        // Reistijd start
        const travelStartTime = new Date(currentTime);
        
        // Aankomsttijd = huidige tijd + reistijd
        currentTime = new Date(currentTime.getTime() + (travelInfo.duration * 60 * 1000));
        const arrivalTime = new Date(currentTime);
        
        // Eindtijd = aankomst + duur dienst
        const duration = apt.duration || apt.serviceDuration || 60;
        currentTime = new Date(currentTime.getTime() + (duration * 60 * 1000));
        const endTime = new Date(currentTime);
        
        plannedAppointments.push({
            ...apt,
            travelStartTime: travelStartTime.toISOString(),
            travelTimeMinutes: travelInfo.duration,
            travelDistanceKm: travelInfo.distance,
            plannedStart: arrivalTime.toISOString(),
            plannedEnd: endTime.toISOString(),
            originAddress: prevLocation
        });
        
        prevLocation = apt.location;
    }
    
    return {
        appointments: plannedAppointments,
        totalTravelTime: totalTime,
        savings: savings,
        startLocation: startLocation
    };
};

module.exports = {
    calculateTravelTime,
    estimateTravelTime,
    findFirstAvailableSlot,
    findAllAvailableSlots,
    geocodeAddress,
    getPlaceAutocomplete,
    getPlaceDetails,
    parseAddressComponents,
    // Route optimalisatie
    calculateDistanceMatrix,
    optimizeRoute,
    planDayRoute
};
