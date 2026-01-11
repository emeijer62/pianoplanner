/**
 * PianoPlanner Offline Store
 * IndexedDB-based offline storage for appointments, customers, and pianos
 * Enables full offline access to critical data
 */

const OfflineStore = (function() {
    'use strict';

    const DB_NAME = 'PianoPlanner';
    const DB_VERSION = 1;
    
    // Store names
    const STORES = {
        APPOINTMENTS: 'appointments',
        CUSTOMERS: 'customers',
        PIANOS: 'pianos',
        SERVICES: 'services',
        SYNC_QUEUE: 'syncQueue',
        META: 'meta'
    };

    let db = null;
    let isInitialized = false;

    /**
     * Initialize IndexedDB
     */
    async function init() {
        if (isInitialized && db) return db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error('[OfflineStore] Failed to open database:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                db = request.result;
                isInitialized = true;
                console.log('[OfflineStore] Database opened successfully');
                resolve(db);
            };

            request.onupgradeneeded = (event) => {
                const database = event.target.result;
                console.log('[OfflineStore] Upgrading database schema...');

                // Appointments store
                if (!database.objectStoreNames.contains(STORES.APPOINTMENTS)) {
                    const appointmentsStore = database.createObjectStore(STORES.APPOINTMENTS, { keyPath: 'id' });
                    appointmentsStore.createIndex('date', 'date', { unique: false });
                    appointmentsStore.createIndex('customerId', 'customerId', { unique: false });
                    appointmentsStore.createIndex('start', 'start', { unique: false });
                }

                // Customers store
                if (!database.objectStoreNames.contains(STORES.CUSTOMERS)) {
                    const customersStore = database.createObjectStore(STORES.CUSTOMERS, { keyPath: 'id' });
                    customersStore.createIndex('name', 'name', { unique: false });
                    customersStore.createIndex('email', 'email', { unique: false });
                }

                // Pianos store
                if (!database.objectStoreNames.contains(STORES.PIANOS)) {
                    const pianosStore = database.createObjectStore(STORES.PIANOS, { keyPath: 'id' });
                    pianosStore.createIndex('customerId', 'customerId', { unique: false });
                    pianosStore.createIndex('brand', 'brand', { unique: false });
                }

                // Services store
                if (!database.objectStoreNames.contains(STORES.SERVICES)) {
                    database.createObjectStore(STORES.SERVICES, { keyPath: 'id' });
                }

                // Sync queue for offline changes
                if (!database.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
                    const syncStore = database.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id', autoIncrement: true });
                    syncStore.createIndex('timestamp', 'timestamp', { unique: false });
                    syncStore.createIndex('type', 'type', { unique: false });
                }

                // Meta store for last sync times, etc.
                if (!database.objectStoreNames.contains(STORES.META)) {
                    database.createObjectStore(STORES.META, { keyPath: 'key' });
                }

                console.log('[OfflineStore] Database schema created');
            };
        });
    }

    /**
     * Generic get all from store
     */
    async function getAll(storeName) {
        await init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Generic get by ID
     */
    async function getById(storeName, id) {
        await init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Generic put (insert or update)
     */
    async function put(storeName, data) {
        await init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Generic put many
     */
    async function putMany(storeName, items) {
        await init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);

            items.forEach(item => store.put(item));

            transaction.oncomplete = () => resolve(items.length);
            transaction.onerror = () => reject(transaction.error);
        });
    }

    /**
     * Generic delete
     */
    async function remove(storeName, id) {
        await init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(id);

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Clear a store
     */
    async function clearStore(storeName) {
        await init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    // ==================== APPOINTMENTS ====================

    /**
     * Get appointments for a specific date
     */
    async function getAppointmentsForDate(date) {
        await init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORES.APPOINTMENTS, 'readonly');
            const store = transaction.objectStore(STORES.APPOINTMENTS);
            const index = store.index('date');
            const request = index.getAll(date);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get appointments for a date range
     */
    async function getAppointmentsInRange(startDate, endDate) {
        await init();
        const allAppointments = await getAll(STORES.APPOINTMENTS);
        
        return allAppointments.filter(apt => {
            const aptDate = apt.start.split('T')[0];
            return aptDate >= startDate && aptDate <= endDate;
        });
    }

    /**
     * Save appointments (full sync from server)
     */
    async function syncAppointments(appointments) {
        // Add date field for indexing
        const withDates = appointments.map(apt => ({
            ...apt,
            date: apt.start ? apt.start.split('T')[0] : null
        }));
        
        await clearStore(STORES.APPOINTMENTS);
        await putMany(STORES.APPOINTMENTS, withDates);
        await setMeta('lastAppointmentsSync', new Date().toISOString());
        
        console.log(`[OfflineStore] Synced ${appointments.length} appointments`);
        return appointments.length;
    }

    // ==================== CUSTOMERS ====================

    /**
     * Get all customers
     */
    async function getCustomers() {
        return getAll(STORES.CUSTOMERS);
    }

    /**
     * Get customer by ID
     */
    async function getCustomer(id) {
        return getById(STORES.CUSTOMERS, id);
    }

    /**
     * Search customers by name
     */
    async function searchCustomers(query) {
        const customers = await getAll(STORES.CUSTOMERS);
        const lowerQuery = query.toLowerCase();
        
        return customers.filter(c => 
            c.name?.toLowerCase().includes(lowerQuery) ||
            c.email?.toLowerCase().includes(lowerQuery) ||
            c.city?.toLowerCase().includes(lowerQuery)
        );
    }

    /**
     * Sync customers from server
     */
    async function syncCustomers(customers) {
        await clearStore(STORES.CUSTOMERS);
        await putMany(STORES.CUSTOMERS, customers);
        await setMeta('lastCustomersSync', new Date().toISOString());
        
        console.log(`[OfflineStore] Synced ${customers.length} customers`);
        return customers.length;
    }

    // ==================== PIANOS ====================

    /**
     * Get all pianos
     */
    async function getPianos() {
        return getAll(STORES.PIANOS);
    }

    /**
     * Get pianos for a customer
     */
    async function getPianosForCustomer(customerId) {
        await init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORES.PIANOS, 'readonly');
            const store = transaction.objectStore(STORES.PIANOS);
            const index = store.index('customerId');
            const request = index.getAll(customerId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Sync pianos from server
     */
    async function syncPianos(pianos) {
        await clearStore(STORES.PIANOS);
        await putMany(STORES.PIANOS, pianos);
        await setMeta('lastPianosSync', new Date().toISOString());
        
        console.log(`[OfflineStore] Synced ${pianos.length} pianos`);
        return pianos.length;
    }

    // ==================== SERVICES ====================

    /**
     * Get all services
     */
    async function getServices() {
        return getAll(STORES.SERVICES);
    }

    /**
     * Sync services from server
     */
    async function syncServices(services) {
        await clearStore(STORES.SERVICES);
        await putMany(STORES.SERVICES, services);
        await setMeta('lastServicesSync', new Date().toISOString());
        
        console.log(`[OfflineStore] Synced ${services.length} services`);
        return services.length;
    }

    // ==================== SYNC QUEUE ====================

    /**
     * Add item to sync queue (for offline changes)
     */
    async function queueChange(type, action, data) {
        const queueItem = {
            type,      // 'appointment', 'customer', 'piano'
            action,    // 'create', 'update', 'delete'
            data,
            timestamp: new Date().toISOString(),
            synced: false
        };
        
        await put(STORES.SYNC_QUEUE, queueItem);
        console.log(`[OfflineStore] Queued ${action} for ${type}`);
        return queueItem;
    }

    /**
     * Get pending sync items
     */
    async function getPendingSync() {
        const all = await getAll(STORES.SYNC_QUEUE);
        return all.filter(item => !item.synced);
    }

    /**
     * Mark sync item as completed
     */
    async function markSynced(id) {
        const item = await getById(STORES.SYNC_QUEUE, id);
        if (item) {
            item.synced = true;
            item.syncedAt = new Date().toISOString();
            await put(STORES.SYNC_QUEUE, item);
        }
    }

    /**
     * Clear completed sync items
     */
    async function clearSyncedItems() {
        const all = await getAll(STORES.SYNC_QUEUE);
        const synced = all.filter(item => item.synced);
        
        for (const item of synced) {
            await remove(STORES.SYNC_QUEUE, item.id);
        }
        
        return synced.length;
    }

    // ==================== META ====================

    /**
     * Set meta value
     */
    async function setMeta(key, value) {
        await put(STORES.META, { key, value });
    }

    /**
     * Get meta value
     */
    async function getMeta(key) {
        const result = await getById(STORES.META, key);
        return result?.value;
    }

    /**
     * Get last sync time for a store
     */
    async function getLastSyncTime(storeName) {
        return getMeta(`last${storeName.charAt(0).toUpperCase() + storeName.slice(1)}Sync`);
    }

    // ==================== FULL SYNC ====================

    /**
     * Perform full sync from server
     */
    async function fullSync() {
        if (!navigator.onLine) {
            console.log('[OfflineStore] Offline - skipping sync');
            return { success: false, reason: 'offline' };
        }

        console.log('[OfflineStore] Starting full sync...');
        const results = { appointments: 0, customers: 0, pianos: 0, services: 0 };

        try {
            // Sync appointments (current month + next month)
            const today = new Date();
            const startDate = new Date(today.getFullYear(), today.getMonth(), 1);
            const endDate = new Date(today.getFullYear(), today.getMonth() + 2, 0);
            
            const appointmentsRes = await fetch(`/api/appointments?start=${startDate.toISOString()}&end=${endDate.toISOString()}`);
            if (appointmentsRes.ok) {
                const appointments = await appointmentsRes.json();
                results.appointments = await syncAppointments(Array.isArray(appointments) ? appointments : []);
            }

            // Sync customers
            const customersRes = await fetch('/api/customers');
            if (customersRes.ok) {
                const customers = await customersRes.json();
                results.customers = await syncCustomers(Array.isArray(customers) ? customers : []);
            }

            // Sync pianos
            const pianosRes = await fetch('/api/pianos');
            if (pianosRes.ok) {
                const pianos = await pianosRes.json();
                results.pianos = await syncPianos(Array.isArray(pianos) ? pianos : []);
            }

            // Sync services
            const servicesRes = await fetch('/api/services');
            if (servicesRes.ok) {
                const services = await servicesRes.json();
                results.services = await syncServices(Array.isArray(services) ? services : []);
            }

            await setMeta('lastFullSync', new Date().toISOString());
            console.log('[OfflineStore] Full sync completed:', results);
            
            return { success: true, results };
        } catch (error) {
            console.error('[OfflineStore] Sync error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Process pending sync queue (upload offline changes)
     */
    async function processSyncQueue() {
        if (!navigator.onLine) return { processed: 0 };

        const pending = await getPendingSync();
        if (pending.length === 0) return { processed: 0 };

        console.log(`[OfflineStore] Processing ${pending.length} queued changes...`);
        let processed = 0;
        let errors = [];

        for (const item of pending) {
            try {
                let endpoint, method, body;

                switch (item.type) {
                    case 'appointment':
                        endpoint = item.action === 'create' ? '/api/appointments' : `/api/appointments/${item.data.id}`;
                        method = item.action === 'delete' ? 'DELETE' : (item.action === 'create' ? 'POST' : 'PUT');
                        body = item.action !== 'delete' ? JSON.stringify(item.data) : null;
                        break;
                    case 'customer':
                        endpoint = item.action === 'create' ? '/api/customers' : `/api/customers/${item.data.id}`;
                        method = item.action === 'delete' ? 'DELETE' : (item.action === 'create' ? 'POST' : 'PUT');
                        body = item.action !== 'delete' ? JSON.stringify(item.data) : null;
                        break;
                    default:
                        continue;
                }

                const response = await fetch(endpoint, {
                    method,
                    headers: body ? { 'Content-Type': 'application/json' } : {},
                    body
                });

                if (response.ok) {
                    await markSynced(item.id);
                    processed++;
                } else {
                    errors.push({ item, status: response.status });
                }
            } catch (err) {
                errors.push({ item, error: err.message });
            }
        }

        // Clear successfully synced items
        await clearSyncedItems();

        console.log(`[OfflineStore] Processed ${processed}/${pending.length} queued changes`);
        return { processed, total: pending.length, errors };
    }

    // ==================== UTILITIES ====================

    /**
     * Check if data is stale (older than specified minutes)
     */
    async function isDataStale(storeName, maxAgeMinutes = 60) {
        const lastSync = await getLastSyncTime(storeName);
        if (!lastSync) return true;

        const lastSyncTime = new Date(lastSync).getTime();
        const now = Date.now();
        const age = (now - lastSyncTime) / 60000; // minutes

        return age > maxAgeMinutes;
    }

    /**
     * Get storage usage estimate
     */
    async function getStorageInfo() {
        if (navigator.storage && navigator.storage.estimate) {
            const estimate = await navigator.storage.estimate();
            return {
                usage: estimate.usage,
                quota: estimate.quota,
                usagePercent: ((estimate.usage / estimate.quota) * 100).toFixed(2)
            };
        }
        return null;
    }

    /**
     * Clear all offline data
     */
    async function clearAllData() {
        await clearStore(STORES.APPOINTMENTS);
        await clearStore(STORES.CUSTOMERS);
        await clearStore(STORES.PIANOS);
        await clearStore(STORES.SERVICES);
        await clearStore(STORES.SYNC_QUEUE);
        await clearStore(STORES.META);
        console.log('[OfflineStore] All data cleared');
    }

    // Public API
    return {
        init,
        
        // Appointments
        getAppointmentsForDate,
        getAppointmentsInRange,
        syncAppointments,
        
        // Customers
        getCustomers,
        getCustomer,
        searchCustomers,
        syncCustomers,
        
        // Pianos
        getPianos,
        getPianosForCustomer,
        syncPianos,
        
        // Services
        getServices,
        syncServices,
        
        // Sync queue
        queueChange,
        getPendingSync,
        processSyncQueue,
        
        // Sync
        fullSync,
        isDataStale,
        getLastSyncTime,
        
        // Utils
        getStorageInfo,
        clearAllData,
        
        // Constants
        STORES
    };
})();

// Auto-initialize on load
if (typeof window !== 'undefined') {
    window.OfflineStore = OfflineStore;
    
    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => OfflineStore.init());
    } else {
        OfflineStore.init();
    }
    
    // Sync when coming back online
    window.addEventListener('online', async () => {
        console.log('[OfflineStore] Back online - syncing...');
        await OfflineStore.processSyncQueue();
        await OfflineStore.fullSync();
    });
    
    // Periodic sync when online (every 15 minutes)
    setInterval(async () => {
        if (navigator.onLine) {
            const isStale = await OfflineStore.isDataStale('appointments', 15);
            if (isStale) {
                await OfflineStore.fullSync();
            }
        }
    }, 15 * 60 * 1000);
}
