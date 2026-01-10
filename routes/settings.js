const express = require('express');
const router = express.Router();
const companyStore = require('../utils/companyStore');
const serviceStore = require('../utils/serviceStore');
const userStore = require('../utils/userStore');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// ==================== BEDRIJFSINSTELLINGEN ====================

// Haal bedrijfsinstellingen op
router.get('/company', requireAuth, async (req, res) => {
    try {
        console.log('📤 GET /company - User:', req.session.user.id, req.session.user.email);
        const settings = await companyStore.getSettings(req.session.user.id);
        console.log('📤 Returning settings:', JSON.stringify(settings, null, 2));
        res.json(settings);
    } catch (error) {
        console.error('Error getting company settings:', error);
        res.status(500).json({ error: 'Kon instellingen niet ophalen' });
    }
});

// Update bedrijfsinstellingen
router.put('/company', requireAuth, async (req, res) => {
    try {
        console.log('📥 PUT /company - User:', req.session.user.id, req.session.user.email);
        console.log('📥 Request body:', JSON.stringify(req.body, null, 2));
        
        const { 
            name, ownerName, owner, email, phone, 
            street, postalCode, city, country, 
            address, // Frontend stuurt dit als object
            formattedAddress, placeId, lat, lng,
            timezone,
            workHours, workDays,
            availability, workingHours, // Nieuwe veldnamen van frontend
            theaterHours, theaterHoursEnabled // Theater beschikbaarheid
        } = req.body;
        
        // Ondersteun beide formaten (direct fields of address object)
        const addressData = address || {
            street,
            postalCode,
            city,
            country,
            formattedAddress,
            placeId,
            lat,
            lng
        };
        
        // Converteer index-based availability naar dag-naam based workingHours
        const dayNameMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        
        function convertAvailabilityToWorkingHours(availability) {
            const workingHours = {};
            for (let i = 0; i < 7; i++) {
                const dayName = dayNameMap[i];
                const dayData = availability[i] || availability[String(i)];
                if (dayData) {
                    workingHours[dayName] = {
                        start: dayData.start || '09:00',
                        end: dayData.end || '17:00',
                        enabled: dayData.available === true || dayData.enabled === true
                    };
                } else {
                    // Default
                    workingHours[dayName] = {
                        start: '09:00',
                        end: '17:00',
                        enabled: i >= 1 && i <= 5 // Ma-Vr standaard enabled
                    };
                }
            }
            return workingHours;
        }
        
        // Werkuren: ondersteun oude en nieuwe formaten
        let finalWorkingHours;
        if (availability) {
            // Nieuw formaat van settings.js frontend (index-based)
            // Converteer naar dag-naam formaat
            finalWorkingHours = convertAvailabilityToWorkingHours(availability);
        } else if (workingHours) {
            // Check of het al in dag-naam formaat is
            if (workingHours.monday !== undefined) {
                finalWorkingHours = workingHours;
            } else {
                // Oud index-based formaat
                finalWorkingHours = convertAvailabilityToWorkingHours(workingHours);
            }
        } else {
            // Default werkuren
            finalWorkingHours = {
                sunday: { start: '09:00', end: '17:00', enabled: false },
                monday: { start: '09:00', end: '17:00', enabled: true },
                tuesday: { start: '09:00', end: '17:00', enabled: true },
                wednesday: { start: '09:00', end: '17:00', enabled: true },
                thursday: { start: '09:00', end: '17:00', enabled: true },
                friday: { start: '09:00', end: '17:00', enabled: true },
                saturday: { start: '09:00', end: '17:00', enabled: false }
            };
        }
        
        // Converteer theater availability ook als nodig
        let finalTheaterHours = null;
        if (theaterHours) {
            if (theaterHours.monday !== undefined) {
                finalTheaterHours = theaterHours;
            } else {
                finalTheaterHours = convertAvailabilityToWorkingHours(theaterHours);
            }
        }
        
        const settings = await companyStore.saveSettings(req.session.user.id, {
            name,
            ownerName: ownerName || owner,
            email,
            phone,
            address: addressData,
            timezone: timezone || 'Europe/Amsterdam',
            workingHours: finalWorkingHours,
            theaterHours: finalTheaterHours,
            theaterHoursEnabled: theaterHoursEnabled || false
        });
        
        console.log('💾 Saved settings result:', JSON.stringify(settings, null, 2));
        res.json(settings);
    } catch (error) {
        console.error('Error saving company settings:', error.message, error.stack);
        res.status(500).json({ error: `Kon instellingen niet opslaan: ${error.message}` });
    }
});

// ==================== DIENSTEN ====================

// Haal alle diensten op (inclusief inactieve voor beheer)
router.get('/services', requireAuth, async (req, res) => {
    try {
        const includeInactive = req.query.all === 'true';
        const services = includeInactive 
            ? await serviceStore.getAllServices(req.session.user.id)
            : await serviceStore.getActiveServices(req.session.user.id);
        res.json({ services });
    } catch (error) {
        console.error('Error getting services:', error);
        res.status(500).json({ error: 'Kon diensten niet ophalen' });
    }
});

// Haal specifieke dienst op
router.get('/services/:id', requireAuth, async (req, res) => {
    try {
        const service = await serviceStore.getService(req.session.user.id, req.params.id);
        
        if (!service) {
            return res.status(404).json({ error: 'Dienst niet gevonden' });
        }
        
        res.json(service);
    } catch (error) {
        console.error('Error getting service:', error);
        res.status(500).json({ error: 'Kon dienst niet ophalen' });
    }
});

// Maak nieuwe dienst aan
router.post('/services', requireAuth, async (req, res) => {
    try {
        const { name, duration, bufferBefore, bufferAfter, description, price, color } = req.body;
        
        if (!name) {
            return res.status(400).json({ error: 'Naam is verplicht' });
        }
        
        const service = await serviceStore.createService(req.session.user.id, {
            name,
            duration,
            bufferBefore,
            bufferAfter,
            description,
            price,
            color
        });
        
        res.status(201).json(service);
    } catch (error) {
        console.error('Error creating service:', error);
        res.status(500).json({ error: 'Kon dienst niet aanmaken' });
    }
});

// Update dienst
router.put('/services/:id', requireAuth, async (req, res) => {
    try {
        const existing = await serviceStore.getService(req.session.user.id, req.params.id);
        
        if (!existing) {
            return res.status(404).json({ error: 'Dienst niet gevonden' });
        }
        
        const { name, duration, bufferBefore, bufferAfter, description, price, color, active } = req.body;
        
        const service = await serviceStore.updateService(req.session.user.id, req.params.id, {
            name: name || existing.name,
            duration: duration !== undefined ? duration : existing.duration,
            bufferBefore: bufferBefore !== undefined ? bufferBefore : existing.bufferBefore,
            bufferAfter: bufferAfter !== undefined ? bufferAfter : existing.bufferAfter,
            description: description !== undefined ? description : existing.description,
            price: price !== undefined ? price : existing.price,
            color: color || existing.color,
            active: active !== undefined ? active : existing.active
        });
        
        res.json(service);
    } catch (error) {
        console.error('Error updating service:', error);
        res.status(500).json({ error: 'Kon dienst niet bijwerken' });
    }
});

// Verwijder dienst (hard delete)
router.delete('/services/:id', requireAuth, async (req, res) => {
    try {
        const deleted = await serviceStore.deleteService(req.session.user.id, req.params.id);
        
        if (!deleted) {
            return res.status(404).json({ error: 'Service not found' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting service:', error);
        res.status(500).json({ error: 'Could not delete service' });
    }
});

// Activeer dienst opnieuw
router.post('/services/:id/activate', requireAuth, async (req, res) => {
    try {
        const activated = await serviceStore.activateService(req.session.user.id, req.params.id);
        
        if (!activated) {
            return res.status(404).json({ error: 'Dienst niet gevonden' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error activating service:', error);
        res.status(500).json({ error: 'Kon dienst niet activeren' });
    }
});

// ==================== PUBLIEKE BOEKINGSLINK ====================

// Haal booking settings op
router.get('/booking', requireAuth, async (req, res) => {
    try {
        const settings = await userStore.getBookingSettings(req.session.user.id);
        
        // Genereer de volledige URL
        const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
        const bookingUrl = settings.slug ? `${baseUrl}/book/${settings.slug}` : null;
        
        res.json({ 
            settings,
            bookingUrl
        });
    } catch (error) {
        console.error('Error getting booking settings:', error);
        res.status(500).json({ error: 'Kon boekingsinstellingen niet ophalen' });
    }
});

// Update booking settings
router.put('/booking', requireAuth, async (req, res) => {
    try {
        // Haal bedrijfsnaam op voor slug generatie
        const company = await companyStore.getSettings(req.session.user.id);
        const companyName = company?.name || null;
        
        const settings = await userStore.updateBookingSettings(req.session.user.id, req.body, companyName);
        
        // Genereer de volledige URL
        const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
        const bookingUrl = settings.slug ? `${baseUrl}/book/${settings.slug}` : null;
        
        res.json({ 
            success: true,
            settings,
            bookingUrl
        });
    } catch (error) {
        console.error('Error updating booking settings:', error);
        res.status(500).json({ error: 'Kon boekingsinstellingen niet opslaan' });
    }
});

// ==================== TRAVEL SETTINGS ====================

// Haal travel settings op
router.get('/travel', requireAuth, async (req, res) => {
    try {
        const settings = await companyStore.getTravelSettings(req.session.user.id);
        res.json({ settings });
    } catch (error) {
        console.error('Error getting travel settings:', error);
        res.status(500).json({ error: 'Kon reisinstellingen niet ophalen' });
    }
});

// Update travel settings
router.put('/travel', requireAuth, async (req, res) => {
    try {
        const { enabled, maxBookingTravelMinutes, farLocationMessage, maxBetweenTravelMinutes } = req.body;
        
        const settings = await companyStore.saveTravelSettings(req.session.user.id, {
            enabled,
            maxBookingTravelMinutes: maxBookingTravelMinutes ? parseInt(maxBookingTravelMinutes) : null,
            farLocationMessage,
            maxBetweenTravelMinutes: maxBetweenTravelMinutes ? parseInt(maxBetweenTravelMinutes) : null
        });
        
        res.json({ 
            success: true,
            settings
        });
    } catch (error) {
        console.error('Error updating travel settings:', error);
        res.status(500).json({ error: 'Kon reisinstellingen niet opslaan' });
    }
});

// ==================== TAALINSTELLINGEN ====================

// Haal taalinstelling op
router.get('/language', requireAuth, async (req, res) => {
    try {
        const profile = await userStore.getUserProfile(req.session.user.id);
        res.json({ language: profile?.language || 'en' });
    } catch (error) {
        console.error('Error getting language:', error);
        res.status(500).json({ error: 'Kon taalinstelling niet ophalen' });
    }
});

// Update taalinstelling
router.put('/language', requireAuth, async (req, res) => {
    try {
        const { language } = req.body;
        const supportedLanguages = ['en', 'nl', 'de', 'fr'];
        
        if (!supportedLanguages.includes(language)) {
            return res.status(400).json({ error: 'Taal niet ondersteund' });
        }
        
        await userStore.updateUserLanguage(req.session.user.id, language);
        res.json({ success: true, language });
    } catch (error) {
        console.error('Error updating language:', error);
        res.status(500).json({ error: 'Kon taalinstelling niet opslaan' });
    }
});

// ==================== ACCOUNT VERWIJDEREN ====================

// Verwijder eigen account (alleen voor reguliere gebruikers, niet admin)
router.delete('/account', requireAuth, async (req, res) => {
    try {
        const { password } = req.body;
        const userId = req.session.user.id;
        
        if (!password) {
            return res.status(400).json({ error: 'Wachtwoord is verplicht' });
        }
        
        // Admins mogen hun eigen account niet verwijderen
        if (req.session.user.role === 'admin') {
            return res.status(403).json({ error: 'Admins kunnen hun account niet zelf verwijderen' });
        }
        
        const result = await userStore.deleteOwnAccount(userId, password);
        
        if (!result.success) {
            return res.status(400).json({ error: result.error });
        }
        
        // Session vernietigen na account verwijdering
        req.session.destroy((err) => {
            if (err) {
                console.error('Error destroying session:', err);
            }
            res.clearCookie('connect.sid');
            res.json({ success: true, message: 'Account succesvol verwijderd' });
        });
    } catch (error) {
        console.error('Error deleting account:', error);
        res.status(500).json({ error: 'Kon account niet verwijderen' });
    }
});

module.exports = router;
