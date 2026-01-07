/**
 * Database module voor PianoPlanner
 * SQLite database voor alle data opslag
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Data directory bepalen
const DATA_DIR = process.env.NODE_ENV === 'production' 
    ? '/app/data' 
    : path.join(__dirname, '..', 'data');

// Zorg dat data directory bestaat
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DATABASE_PATH = path.join(DATA_DIR, 'pianoplanner.db');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

// Maak backups directory
if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

console.log(`📂 Database path: ${DATABASE_PATH}`);

// Database connectie
const db = new sqlite3.Database(DATABASE_PATH, (err) => {
    if (err) {
        console.error('❌ Database connectie fout:', err);
    } else {
        console.log('✅ Database verbonden');
        initDatabase();
    }
});

// Database initialisatie
function initDatabase() {
    db.serialize(() => {
        // Users tabel
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                name TEXT,
                picture TEXT,
                google_id TEXT UNIQUE,
                tokens TEXT,
                password_hash TEXT,
                auth_type TEXT DEFAULT 'google',
                approval_status TEXT DEFAULT 'approved',
                stripe_customer_id TEXT,
                subscription_status TEXT DEFAULT 'trial',
                subscription_id TEXT,
                subscription_ends_at DATETIME,
                calendar_sync TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, logTableCreation('users'));
        
        // Migratie: voeg calendar_sync kolom toe als die nog niet bestaat
        db.run(`ALTER TABLE users ADD COLUMN calendar_sync TEXT`, (err) => {
            // Negeer error als kolom al bestaat
            if (err && !err.message.includes('duplicate column')) {
                console.error('Migration error:', err);
            }
        });
        
        // Migratie: voeg booking_slug en booking_settings kolommen toe
        db.run(`ALTER TABLE users ADD COLUMN booking_slug TEXT`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
                // Alleen loggen als het niet "already exists" is
                if (!err.message.includes('duplicate')) {
                    console.error('Migration error booking_slug:', err.message);
                }
            } else if (!err) {
                // Maak een unieke index als de kolom nieuw toegevoegd is
                db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_booking_slug ON users(booking_slug)`, (idxErr) => {
                    if (idxErr) console.error('Index error booking_slug:', idxErr.message);
                });
            }
        });
        db.run(`ALTER TABLE users ADD COLUMN booking_settings TEXT`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
                if (!err.message.includes('duplicate')) {
                    console.error('Migration error booking_settings:', err.message);
                }
            }
        });
        
        // Migratie: voeg travel_time kolommen toe aan appointments
        db.run(`ALTER TABLE appointments ADD COLUMN travel_time_minutes INTEGER`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
                console.error('Migration error travel_time_minutes:', err);
            }
        });
        db.run(`ALTER TABLE appointments ADD COLUMN travel_distance_km INTEGER`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
                console.error('Migration error travel_distance_km:', err);
            }
        });
        db.run(`ALTER TABLE appointments ADD COLUMN travel_start_time DATETIME`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
                console.error('Migration error travel_start_time:', err);
            }
        });
        db.run(`ALTER TABLE appointments ADD COLUMN origin_address TEXT`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
                console.error('Migration error origin_address:', err);
            }
        });
        
        // Migratie: voeg Apple Calendar kolommen toe aan users
        db.run(`ALTER TABLE users ADD COLUMN apple_calendar TEXT`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
                console.error('Migration error apple_calendar:', err);
            }
        });
        db.run(`ALTER TABLE users ADD COLUMN apple_calendar_sync TEXT`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
                console.error('Migration error apple_calendar_sync:', err);
            }
        });
        
        // Migratie: voeg Apple event tracking toe aan appointments
        db.run(`ALTER TABLE appointments ADD COLUMN apple_event_id TEXT`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
                console.error('Migration error apple_event_id:', err);
            }
        });
        db.run(`ALTER TABLE appointments ADD COLUMN apple_event_url TEXT`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
                console.error('Migration error apple_event_url:', err);
            }
        });
        
        // Migratie: voeg calendar_feed_token toe voor iCal feed abonnementen
        db.run(`ALTER TABLE users ADD COLUMN calendar_feed_token TEXT`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
                console.error('Migration error calendar_feed_token:', err);
            } else if (!err) {
                // Maak unieke index voor snelle lookup
                db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_calendar_feed_token ON users(calendar_feed_token)`, (idxErr) => {
                    if (idxErr) console.error('Index error calendar_feed_token:', idxErr.message);
                });
            }
        });
        
        // Migratie: voeg timezone kolom toe voor internationale ondersteuning
        db.run(`ALTER TABLE users ADD COLUMN timezone TEXT DEFAULT 'Europe/Amsterdam'`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
                console.error('Migration error timezone:', err);
            }
        });
        
        // Migratie: voeg last_login kolom toe voor actieve gebruiker tracking
        db.run(`ALTER TABLE users ADD COLUMN last_login DATETIME`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
                console.error('Migration error last_login:', err);
            }
        });
        
        // Index voor snelle booking slug lookup
        db.run('CREATE INDEX IF NOT EXISTS idx_users_booking_slug ON users(booking_slug)');

        // Customers tabel (per user)
        db.run(`
            CREATE TABLE IF NOT EXISTS customers (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                name TEXT NOT NULL,
                email TEXT,
                phone TEXT,
                street TEXT,
                postal_code TEXT,
                city TEXT,
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `, logTableCreation('customers'));

        // Pianos tabel (per user, gekoppeld aan customer)
        db.run(`
            CREATE TABLE IF NOT EXISTS pianos (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                customer_id TEXT,
                brand TEXT NOT NULL,
                model TEXT,
                serial_number TEXT,
                year INTEGER,
                type TEXT DEFAULT 'upright',
                finish TEXT,
                location TEXT,
                floor INTEGER,
                condition TEXT DEFAULT 'good',
                notes TEXT,
                service_interval INTEGER DEFAULT 6,
                last_tuning_date DATE,
                last_tuning_pitch TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
            )
        `, logTableCreation('pianos'));

        // Service records tabel
        db.run(`
            CREATE TABLE IF NOT EXISTS service_records (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                piano_id TEXT NOT NULL,
                type TEXT NOT NULL,
                date DATE NOT NULL,
                pitch TEXT,
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (piano_id) REFERENCES pianos(id) ON DELETE CASCADE
            )
        `, logTableCreation('service_records'));

        // Appointments tabel
        db.run(`
            CREATE TABLE IF NOT EXISTS appointments (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                location TEXT,
                start_time DATETIME NOT NULL,
                end_time DATETIME NOT NULL,
                all_day INTEGER DEFAULT 0,
                customer_id TEXT,
                customer_name TEXT,
                service_id TEXT,
                service_name TEXT,
                piano_id TEXT,
                piano_brand TEXT,
                piano_model TEXT,
                status TEXT DEFAULT 'scheduled',
                color TEXT DEFAULT '#4CAF50',
                google_event_id TEXT,
                last_synced DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
                FOREIGN KEY (piano_id) REFERENCES pianos(id) ON DELETE SET NULL
            )
        `, logTableCreation('appointments'));

        // Services tabel (diensten configuratie)
        db.run(`
            CREATE TABLE IF NOT EXISTS services (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                name TEXT NOT NULL,
                duration INTEGER NOT NULL,
                buffer_before INTEGER DEFAULT 0,
                buffer_after INTEGER DEFAULT 0,
                description TEXT,
                price REAL,
                active INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `, logTableCreation('services'));

        // Service visibility (verbergt globale diensten per gebruiker)
        db.run(`
            CREATE TABLE IF NOT EXISTS service_visibility (
                user_id TEXT NOT NULL,
                service_id TEXT NOT NULL,
                hidden INTEGER DEFAULT 1,
                PRIMARY KEY (user_id, service_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `, logTableCreation('service_visibility'));

        // Company settings tabel - user_id is UNIQUE zodat elke gebruiker 1 record heeft
        db.run(`
            CREATE TABLE IF NOT EXISTS company_settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL UNIQUE,
                name TEXT,
                owner_name TEXT,
                email TEXT,
                phone TEXT,
                street TEXT,
                postal_code TEXT,
                city TEXT,
                country TEXT DEFAULT 'NL',
                kvk_number TEXT,
                btw_number TEXT,
                iban TEXT,
                website TEXT,
                logo_url TEXT,
                travel_origin TEXT,
                working_hours TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `, logTableCreation('company_settings'));

        // MIGRATIE: Fix company_settings tabel als deze de oude CHECK (id = 1) constraint heeft
        // Dit zorgt ervoor dat elke gebruiker zijn eigen company settings kan hebben
        migrateCompanySettingsTable();

        // Email settings tabel (per user)
        db.run(`
            CREATE TABLE IF NOT EXISTS email_settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL UNIQUE,
                send_confirmations INTEGER DEFAULT 1,
                send_reminders INTEGER DEFAULT 1,
                reminder_hours INTEGER DEFAULT 24,
                send_cancellations INTEGER DEFAULT 1,
                notify_new_bookings INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `, logTableCreation('email_settings'));

        // User SMTP settings tabel (voor eigen email verzending)
        db.run(`
            CREATE TABLE IF NOT EXISTS user_smtp_settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL UNIQUE,
                enabled INTEGER DEFAULT 0,
                provider TEXT DEFAULT 'custom',
                smtp_host TEXT,
                smtp_port INTEGER DEFAULT 587,
                smtp_secure INTEGER DEFAULT 0,
                smtp_user TEXT,
                smtp_pass_encrypted TEXT,
                from_name TEXT,
                from_email TEXT,
                verified INTEGER DEFAULT 0,
                last_test_at DATETIME,
                last_test_result TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `, logTableCreation('user_smtp_settings'));

        // Migratie: voeg email tracking kolommen toe aan appointments
        db.run(`ALTER TABLE appointments ADD COLUMN confirmation_sent INTEGER DEFAULT 0`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
                console.error('Migration error confirmation_sent:', err);
            }
        });
        db.run(`ALTER TABLE appointments ADD COLUMN reminder_sent INTEGER DEFAULT 0`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
                console.error('Migration error reminder_sent:', err);
            }
        });

        // Maak indexen voor betere performance
        db.run('CREATE INDEX IF NOT EXISTS idx_customers_user ON customers(user_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_pianos_user ON pianos(user_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_pianos_customer ON pianos(customer_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_appointments_user ON appointments(user_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(start_time)');
        db.run('CREATE INDEX IF NOT EXISTS idx_service_records_piano ON service_records(piano_id)');
        db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_company_settings_user ON company_settings(user_id)');

        console.log('✅ Database tabellen en indexen aangemaakt');
        
        // Insert default services als ze niet bestaan
        insertDefaultServices();
    });
}

function logTableCreation(tableName) {
    return (err) => {
        if (err) {
            console.error(`❌ Fout bij aanmaken ${tableName}:`, err);
        }
    };
}

// Migratie functie voor company_settings - fix CHECK(id=1) constraint
function migrateCompanySettingsTable() {
    try {
        // Check of de oude constraint bestaat
        db.get(`SELECT sql FROM sqlite_master WHERE type='table' AND name='company_settings'`, [], (err, row) => {
            if (err) {
                console.log('⚠️ Migratie check error (negeren):', err.message);
                return;
            }
            if (!row || !row.sql) {
                console.log('ℹ️ company_settings tabel nog niet aangemaakt, skip migratie');
                return;
            }
            
            // Check of de oude CHECK (id = 1) constraint aanwezig is
            if (row.sql.includes('CHECK (id = 1)')) {
                console.log('🔄 Migratie company_settings: oude CHECK constraint gevonden, fix wordt toegepast...');
                
                // Stap 1: Haal bestaande data op
                db.all('SELECT * FROM company_settings', [], (err, existingData) => {
                    if (err) {
                        console.error('❌ Migratie: kon data niet ophalen:', err.message);
                        return;
                    }
                    
                    existingData = existingData || [];
                    console.log(`📋 ${existingData.length} bestaande company_settings gevonden`);
                    
                    // Stap 2: Drop oude tabel
                    db.run('DROP TABLE IF EXISTS company_settings', (err) => {
                        if (err) {
                            console.error('❌ Migratie: kon oude tabel niet verwijderen:', err.message);
                            return;
                        }
                        
                        // Stap 3: Maak nieuwe tabel
                        db.run(`
                            CREATE TABLE company_settings (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                user_id TEXT NOT NULL UNIQUE,
                                name TEXT,
                                owner_name TEXT,
                                email TEXT,
                                phone TEXT,
                                street TEXT,
                                postal_code TEXT,
                                city TEXT,
                                country TEXT DEFAULT 'NL',
                                kvk_number TEXT,
                                btw_number TEXT,
                                iban TEXT,
                                website TEXT,
                                logo_url TEXT,
                                travel_origin TEXT,
                                working_hours TEXT,
                                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                            )
                        `, (err) => {
                            if (err) {
                                console.error('❌ Migratie: kon nieuwe tabel niet maken:', err.message);
                                return;
                            }
                            
                            // Stap 4: Zet data terug
                            if (existingData.length > 0) {
                                existingData.forEach(row => {
                                    db.run(`
                                        INSERT INTO company_settings (
                                            user_id, name, owner_name, email, phone,
                                            street, postal_code, city, country,
                                            kvk_number, btw_number, iban,
                                            website, logo_url, travel_origin, working_hours, updated_at
                                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                    `, [
                                        row.user_id, row.name, row.owner_name, row.email, row.phone,
                                        row.street, row.postal_code, row.city, row.country,
                                        row.kvk_number, row.btw_number, row.iban,
                                        row.website, row.logo_url, row.travel_origin, row.working_hours, row.updated_at
                                    ], (err) => {
                                        if (err) {
                                            console.error('⚠️ Migratie: kon row niet inserten:', err.message);
                                        }
                                    });
                                });
                            }
                            
                            console.log('✅ Migratie company_settings voltooid! Elke gebruiker kan nu eigen settings hebben.');
                        });
                    });
                });
            } else {
                console.log('ℹ️ company_settings tabel heeft al correcte structuur');
            }
        });
    } catch (error) {
        console.error('❌ Migratie onverwachte fout:', error.message);
    }
}

// Default diensten
function insertDefaultServices() {
    const defaultServices = [
        { id: 'stemmen', name: 'Piano stemmen', duration: 60, description: 'Standaard stembeurt voor piano of vleugel', price: 95 },
        { id: 'stemmen-concert', name: 'Concert stembeurt', duration: 90, description: 'Uitgebreide stembeurt op 440Hz of custom', price: 125 },
        { id: 'regulatie', name: 'Regulatie', duration: 180, description: 'Mechaniek afstellen en optimaliseren', price: 250 },
        { id: 'intonatie', name: 'Intonatie', duration: 120, description: 'Klankkleur aanpassen door hamerkoppen te bewerken', price: 175 },
        { id: 'reparatie', name: 'Reparatie', duration: 120, description: 'Reparatie aan mechaniek, snaren of kast', price: 0 },
        { id: 'taxatie', name: 'Taxatie', duration: 60, description: 'Waardebepaling met officieel taxatierapport', price: 150 }
    ];

    const stmt = db.prepare(`
        INSERT OR IGNORE INTO services (id, user_id, name, duration, description, price, buffer_before, buffer_after)
        VALUES (?, NULL, ?, ?, ?, ?, 15, 15)
    `);

    defaultServices.forEach(service => {
        stmt.run(service.id, service.name, service.duration, service.description, service.price);
    });

    stmt.finalize();
}

// ==================== HELPER FUNCTIES ====================

// Promise wrapper voor db.run
const dbRun = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
};

// Promise wrapper voor db.get
const dbGet = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

// Promise wrapper voor db.all
const dbAll = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
};

// ==================== BACKUP SYSTEEM ====================

function createBackup(type = 'manual') {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const backupFile = path.join(BACKUPS_DIR, `pianoplanner-${type}-${timestamp}.db`);
        
        fs.copyFileSync(DATABASE_PATH, backupFile);
        
        const stats = fs.statSync(backupFile);
        console.log(`💾 Backup aangemaakt: ${backupFile} (${(stats.size / 1024).toFixed(2)} KB)`);
        
        cleanOldBackups();
        return backupFile;
    } catch (error) {
        console.error('❌ Backup fout:', error.message);
    }
}

function cleanOldBackups() {
    try {
        const files = fs.readdirSync(BACKUPS_DIR)
            .filter(file => file.startsWith('pianoplanner-') && file.endsWith('.db'))
            .map(file => ({
                name: file,
                path: path.join(BACKUPS_DIR, file),
                time: fs.statSync(path.join(BACKUPS_DIR, file)).mtime.getTime()
            }))
            .sort((a, b) => b.time - a.time);

        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        files.slice(30)
            .filter(file => file.time < thirtyDaysAgo)
            .forEach(file => {
                fs.unlinkSync(file.path);
                console.log(`🗑️ Oude backup verwijderd: ${file.name}`);
            });
    } catch (error) {
        // Negeer cleanup fouten
    }
}

// Startup backup in productie
if (process.env.NODE_ENV === 'production') {
    setTimeout(() => createBackup('startup'), 5000);
}

// Helper function to get db instance (for routes that need direct db access)
function getDb() {
    return {
        get: (sql, params) => dbGet(sql, params),
        run: (sql, params) => dbRun(sql, params),
        all: (sql, params) => dbAll(sql, params)
    };
}

module.exports = {
    db,
    dbRun,
    dbGet,
    dbAll,
    getDb,
    createBackup,
    DATABASE_PATH,
    DATA_DIR
};
