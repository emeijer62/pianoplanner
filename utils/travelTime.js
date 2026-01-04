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
    
    for (const component of components) {
        if (component.types.includes('street_number')) {
            result.streetNumber = component.long_name;
        }
        if (component.types.includes('route')) {
            result.street = component.long_name;
        }
        if (component.types.includes('locality')) {
            result.city = component.long_name;
        }
        if (component.types.includes('administrative_area_level_1')) {
            result.state = component.long_name;
        }
        if (component.types.includes('country')) {
            result.country = component.long_name;
            result.countryCode = component.short_name;
        }
        if (component.types.includes('postal_code')) {
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
const getPlaceAutocomplete = async (input, sessionToken = null) => {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    
    if (!apiKey) {
        return [];
    }
    
    let url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&types=address&key=${apiKey}`;
    
    if (sessionToken) {
        url += `&sessiontoken=${sessionToken}`;
    }
    
    return new Promise((resolve, reject) => {
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
                    reject(err);
                }
            });
        }).on('error', reject);
    });
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
    
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=formatted_address,geometry,address_components&key=${apiKey}`;
    
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    
                    if (result.status === 'OK') {
                        const place = result.result;
                        resolve({
                            formattedAddress: place.formatted_address,
                            lat: place.geometry.location.lat,
                            lng: place.geometry.location.lng,
                            components: parseAddressComponents(place.address_components)
                        });
                    } else {
                        reject(new Error('Place niet gevonden'));
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
const findFirstAvailableSlot = (existingEvents, travelTime, serviceDuration, date, workHours = { start: '09:00', end: '18:00' }, bufferBefore = 0, bufferAfter = 0) => {
    const dayStart = new Date(date);
    const [startHour, startMin] = workHours.start.split(':').map(Number);
    dayStart.setHours(startHour, startMin, 0, 0);
    
    const dayEnd = new Date(date);
    const [endHour, endMin] = workHours.end.split(':').map(Number);
    dayEnd.setHours(endHour, endMin, 0, 0);
    
    // Totale benodigde tijd = reistijd + buffer voor + dienst + buffer na
    const totalNeeded = travelTime + bufferBefore + serviceDuration + bufferAfter;
    
    // Sorteer events op starttijd
    const sortedEvents = existingEvents
        .filter(e => e.start.dateTime) // Alleen events met tijd
        .map(e => ({
            start: new Date(e.start.dateTime),
            end: new Date(e.end.dateTime)
        }))
        .sort((a, b) => a.start - b.start);
    
    // Check of er ruimte is aan het begin van de dag
    let currentTime = new Date(dayStart);
    
    for (const event of sortedEvents) {
        // Tijd beschikbaar voor dit event
        const availableMinutes = (event.start - currentTime) / (1000 * 60);
        
        if (availableMinutes >= totalNeeded) {
            // Er is ruimte! Bereken tijden met buffers
            const travelStart = new Date(currentTime);
            const bufferBeforeStart = new Date(travelStart.getTime() + travelTime * 60 * 1000);
            const appointmentStart = new Date(bufferBeforeStart.getTime() + bufferBefore * 60 * 1000);
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
        const travelStart = new Date(currentTime);
        const bufferBeforeStart = new Date(travelStart.getTime() + travelTime * 60 * 1000);
        const appointmentStart = new Date(bufferBeforeStart.getTime() + bufferBefore * 60 * 1000);
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

module.exports = {
    calculateTravelTime,
    estimateTravelTime,
    findFirstAvailableSlot,
    geocodeAddress,
    getPlaceAutocomplete,
    getPlaceDetails,
    parseAddressComponents
};
