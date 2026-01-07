/**
 * Encryptie module voor gevoelige data (zoals Apple Calendar wachtwoorden)
 * Gebruikt AES-256-GCM voor veilige versleuteling
 */

const crypto = require('crypto');

// Encryptie sleutel - moet in environment variable staan in productie!
// Genereer met: crypto.randomBytes(32).toString('hex')
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'dev-key-alleen-voor-lokaal-testen-32ch';

// Zorg dat de sleutel 32 bytes is voor AES-256
function getKey() {
    const key = ENCRYPTION_KEY;
    // Hash de key naar precies 32 bytes
    return crypto.createHash('sha256').update(key).digest();
}

/**
 * Versleutel een waarde
 * @param {string} value - De waarde om te versleutelen
 * @returns {string|null} - Versleutelde string of null bij lege waarde
 */
function encrypt(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    
    try {
        const text = String(value);
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
        
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        const authTag = cipher.getAuthTag();
        
        // Format: iv:authTag:encryptedData
        return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
    } catch (error) {
        console.error('Encryptie fout:', error.message);
        return null;
    }
}

/**
 * Ontsleutel een waarde
 * @param {string} encryptedValue - De versleutelde string
 * @returns {string|null} - Ontsleutelde waarde of null bij fout
 */
function decrypt(encryptedValue) {
    if (!encryptedValue || encryptedValue === '') {
        return null;
    }
    
    // Check of het al versleuteld is (bevat dubbele punten van ons format)
    if (!encryptedValue.includes(':')) {
        // Niet versleuteld, geef originele waarde terug (voor backward compatibility)
        return encryptedValue;
    }
    
    try {
        const parts = encryptedValue.split(':');
        if (parts.length !== 3) {
            // Ongeldig format, geef origineel terug
            return encryptedValue;
        }
        
        const iv = Buffer.from(parts[0], 'hex');
        const authTag = Buffer.from(parts[1], 'hex');
        const encrypted = parts[2];
        
        const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
        decipher.setAuthTag(authTag);
        
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    } catch (error) {
        console.error('Decryptie fout:', error.message);
        // Bij fout, retourneer origineel (mogelijk niet versleuteld)
        return encryptedValue;
    }
}

/**
 * Check of een waarde versleuteld is
 * @param {string} value - De waarde om te checken
 * @returns {boolean} - True als versleuteld
 */
function isEncrypted(value) {
    if (!value || typeof value !== 'string') return false;
    const parts = value.split(':');
    if (parts.length !== 3) return false;
    // Check of het hex-encoded is
    return /^[0-9a-f]+$/i.test(parts[0]) && 
           /^[0-9a-f]+$/i.test(parts[1]) && 
           /^[0-9a-f]+$/i.test(parts[2]);
}

module.exports = {
    encrypt,
    decrypt,
    isEncrypted
};
