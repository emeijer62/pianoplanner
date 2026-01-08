/**
 * Upload Routes
 * Bestandsuploads voor logo's en andere media
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { requireAuth } = require('../middleware/auth');
const { dbRun, dbGet } = require('../utils/database');

// Upload directory
const DATA_DIR = process.env.NODE_ENV === 'production' 
    ? '/app/data' 
    : path.join(__dirname, '..', 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const LOGOS_DIR = path.join(UPLOADS_DIR, 'logos');

// Zorg dat directories bestaan
[UPLOADS_DIR, LOGOS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Multer configuratie - memory storage voor verwerking met sharp
const storage = multer.memoryStorage();

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB max
        files: 1
    },
    fileFilter: (req, file, cb) => {
        // Alleen afbeeldingen toestaan
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Alleen afbeeldingen zijn toegestaan'), false);
        }
    }
});

// POST /api/uploads/logo - Upload bedrijfslogo
router.post('/logo', requireAuth, upload.single('logo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Geen bestand geüpload' });
        }

        const userId = req.session.user.id;
        const filename = `logo_${userId}_${Date.now()}.png`;
        const filepath = path.join(LOGOS_DIR, filename);

        // Verwerk afbeelding met sharp: resize en converteer naar PNG
        await sharp(req.file.buffer)
            .resize(400, 400, { 
                fit: 'inside', 
                withoutEnlargement: true 
            })
            .png({ quality: 90 })
            .toFile(filepath);

        // URL voor het logo
        const logoUrl = `/api/uploads/logos/${filename}`;

        // Verwijder oud logo indien aanwezig
        const existing = await dbGet(
            'SELECT logo_url FROM company_settings WHERE user_id = ?',
            [userId]
        );

        if (existing?.logo_url) {
            const oldFilename = existing.logo_url.split('/').pop();
            const oldPath = path.join(LOGOS_DIR, oldFilename);
            if (fs.existsSync(oldPath)) {
                fs.unlinkSync(oldPath);
            }
        }

        // Update database
        await dbRun(`
            UPDATE company_settings SET logo_url = ?, updated_at = ?
            WHERE user_id = ?
        `, [logoUrl, new Date().toISOString(), userId]);

        // Als er nog geen company_settings record is, maak er een
        const updated = await dbGet(
            'SELECT logo_url FROM company_settings WHERE user_id = ?',
            [userId]
        );

        if (!updated) {
            await dbRun(`
                INSERT INTO company_settings (user_id, logo_url, updated_at)
                VALUES (?, ?, ?)
            `, [userId, logoUrl, new Date().toISOString()]);
        }

        res.json({ 
            success: true, 
            logoUrl,
            message: 'Logo succesvol geüpload'
        });

    } catch (error) {
        console.error('Logo upload error:', error);
        res.status(500).json({ error: 'Upload mislukt: ' + error.message });
    }
});

// DELETE /api/uploads/logo - Verwijder bedrijfslogo
router.delete('/logo', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;

        // Haal huidige logo URL op
        const existing = await dbGet(
            'SELECT logo_url FROM company_settings WHERE user_id = ?',
            [userId]
        );

        if (existing?.logo_url) {
            // Verwijder bestand
            const filename = existing.logo_url.split('/').pop();
            const filepath = path.join(LOGOS_DIR, filename);
            if (fs.existsSync(filepath)) {
                fs.unlinkSync(filepath);
            }

            // Update database
            await dbRun(`
                UPDATE company_settings SET logo_url = NULL, updated_at = ?
                WHERE user_id = ?
            `, [new Date().toISOString(), userId]);
        }

        res.json({ success: true, message: 'Logo verwijderd' });

    } catch (error) {
        console.error('Logo delete error:', error);
        res.status(500).json({ error: 'Verwijderen mislukt' });
    }
});

// GET /api/uploads/logos/:filename - Serveer logo bestanden
router.get('/logos/:filename', (req, res) => {
    const filename = req.params.filename;
    
    // Beveilig tegen path traversal
    if (filename.includes('..') || filename.includes('/')) {
        return res.status(400).json({ error: 'Ongeldige bestandsnaam' });
    }

    const filepath = path.join(LOGOS_DIR, filename);
    
    if (fs.existsSync(filepath)) {
        res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 uur cache
        res.sendFile(filepath);
    } else {
        res.status(404).json({ error: 'Logo niet gevonden' });
    }
});

module.exports = router;
