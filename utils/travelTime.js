/**
 * Reistijd en route berekening
 * Gebruikt Google Maps Distance Matrix API
 */

const https = require('https');

// Je standaard locatie (vertrekpunt)
const DEFAULT_ORIGIN = {
    address: 'Tilburg, Nederland',
    // Je kunt dit ook als lat/lng opslaan
};

/**
 * Bereken reistijd tussen twee locaties via Google Maps API
 * @param {string} origin - Vertrekadres
 * @param {string} destination - Bestemmingsadres
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
                            distanceText: element.distance.text
                        });
                    } else {
                        // Fallback naar schatting
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
 * Schat reistijd op basis van bekende steden (fallback zonder API)
 */
const estimateTravelTime = (origin, destination) => {
    // Bekende reistijden vanuit Tilburg (in minuten)
    const travelTimesFromTilburg = {
        'tilburg': 0,
        'eindhoven': 25,
        'breda': 20,
        'den bosch': 25,
        "'s-hertogenbosch": 25,
        'rotterdam': 50,
        'amsterdam': 75,
        'utrecht': 50,
        'den haag': 60,
        'nijmegen': 45,
        'arnhem': 55,
        'maastricht': 70,
        'antwerpen': 45,
        'brussel': 75
    };
    
    // Zoek stad in destination
    const destLower = destination.toLowerCase();
    
    for (const [city, time] of Object.entries(travelTimesFromTilburg)) {
        if (destLower.includes(city)) {
            return {
                duration: time,
                distance: Math.round(time * 1.2), // Schatting km
                durationText: `~${time} min`,
                distanceText: `~${Math.round(time * 1.2)} km`,
                estimated: true
            };
        }
    }
    
    // Onbekende locatie - standaard 45 minuten
    return {
        duration: 45,
        distance: 50,
        durationText: '~45 min',
        distanceText: '~50 km',
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
    DEFAULT_ORIGIN
};
