/**
 * Offline-Aware Fetch Wrapper
 * Automatically uses IndexedDB when offline or as fallback
 */

const OfflineFetch = (function() {
    'use strict';

    /**
     * Fetch with offline fallback
     * @param {string} url - The URL to fetch
     * @param {object} options - Fetch options
     * @returns {Promise<Response|object>}
     */
    async function fetchWithOffline(url, options = {}) {
        const isOnline = navigator.onLine;
        const method = (options.method || 'GET').toUpperCase();
        
        // For GET requests, try cache first if offline
        if (method === 'GET') {
            if (!isOnline) {
                return handleOfflineGet(url);
            }
            
            // Try network first, fallback to offline
            try {
                const response = await fetch(url, options);
                if (response.ok) {
                    // Cache successful response in IndexedDB
                    cacheResponse(url, response.clone());
                    return response;
                }
                throw new Error(`HTTP ${response.status}`);
            } catch (error) {
                console.log(`[OfflineFetch] Network failed, using offline data for ${url}`);
                return handleOfflineGet(url);
            }
        }
        
        // For mutations (POST, PUT, DELETE)
        if (!isOnline) {
            return handleOfflineMutation(url, method, options);
        }
        
        // Online - make the request
        return fetch(url, options);
    }

    /**
     * Handle offline GET requests using IndexedDB
     */
    async function handleOfflineGet(url) {
        const urlObj = new URL(url, window.location.origin);
        const path = urlObj.pathname;
        
        // Parse URL to determine what data to return
        if (path.startsWith('/api/appointments')) {
            return handleAppointmentsGet(urlObj);
        }
        
        if (path.startsWith('/api/customers')) {
            return handleCustomersGet(urlObj);
        }
        
        if (path.startsWith('/api/pianos')) {
            return handlePianosGet(urlObj);
        }
        
        if (path.startsWith('/api/services')) {
            return handleServicesGet(urlObj);
        }
        
        // No offline data available
        throw new Error('No offline data available for this endpoint');
    }

    /**
     * Handle appointments GET
     */
    async function handleAppointmentsGet(urlObj) {
        const path = urlObj.pathname;
        const params = urlObj.searchParams;
        
        // /api/appointments/:id
        const idMatch = path.match(/\/api\/appointments\/([^/]+)$/);
        if (idMatch) {
            const appointments = await OfflineStore.getAppointmentsInRange('1900-01-01', '2100-12-31');
            const apt = appointments.find(a => a.id === idMatch[1]);
            return createJsonResponse(apt || null);
        }
        
        // /api/appointments with date params
        const startParam = params.get('start');
        const endParam = params.get('end');
        const dateParam = params.get('date');
        
        if (dateParam) {
            const appointments = await OfflineStore.getAppointmentsForDate(dateParam);
            return createJsonResponse(appointments);
        }
        
        if (startParam && endParam) {
            const start = startParam.split('T')[0];
            const end = endParam.split('T')[0];
            const appointments = await OfflineStore.getAppointmentsInRange(start, end);
            return createJsonResponse(appointments);
        }
        
        // Return all cached appointments
        const allAppointments = await OfflineStore.getAppointmentsInRange('1900-01-01', '2100-12-31');
        return createJsonResponse(allAppointments);
    }

    /**
     * Handle customers GET
     */
    async function handleCustomersGet(urlObj) {
        const path = urlObj.pathname;
        const params = urlObj.searchParams;
        
        // /api/customers/:id
        const idMatch = path.match(/\/api\/customers\/([^/]+)$/);
        if (idMatch) {
            const customer = await OfflineStore.getCustomer(idMatch[1]);
            return createJsonResponse(customer || null);
        }
        
        // /api/customers with search
        const search = params.get('search') || params.get('q');
        if (search) {
            const customers = await OfflineStore.searchCustomers(search);
            return createJsonResponse(customers);
        }
        
        // All customers
        const customers = await OfflineStore.getCustomers();
        return createJsonResponse(customers);
    }

    /**
     * Handle pianos GET
     */
    async function handlePianosGet(urlObj) {
        const path = urlObj.pathname;
        const params = urlObj.searchParams;
        
        // /api/pianos/:id
        const idMatch = path.match(/\/api\/pianos\/([^/]+)$/);
        if (idMatch) {
            const pianos = await OfflineStore.getPianos();
            const piano = pianos.find(p => p.id === idMatch[1]);
            return createJsonResponse(piano || null);
        }
        
        // /api/pianos?customerId=xxx
        const customerId = params.get('customerId');
        if (customerId) {
            const pianos = await OfflineStore.getPianosForCustomer(customerId);
            return createJsonResponse(pianos);
        }
        
        // All pianos
        const pianos = await OfflineStore.getPianos();
        return createJsonResponse(pianos);
    }

    /**
     * Handle services GET
     */
    async function handleServicesGet(urlObj) {
        const services = await OfflineStore.getServices();
        return createJsonResponse(services);
    }

    /**
     * Handle offline mutations (queue for later sync)
     */
    async function handleOfflineMutation(url, method, options) {
        const urlObj = new URL(url, window.location.origin);
        const path = urlObj.pathname;
        let body = null;
        
        if (options.body) {
            try {
                body = JSON.parse(options.body);
            } catch (e) {
                body = options.body;
            }
        }
        
        // Determine type and action
        let type = null;
        let action = null;
        
        if (path.includes('/appointments')) {
            type = 'appointment';
        } else if (path.includes('/customers')) {
            type = 'customer';
        } else if (path.includes('/pianos')) {
            type = 'piano';
        }
        
        if (method === 'POST') action = 'create';
        else if (method === 'PUT' || method === 'PATCH') action = 'update';
        else if (method === 'DELETE') action = 'delete';
        
        if (type && action) {
            // Queue the change
            await OfflineStore.queueChange(type, action, body);
            
            // For creates, generate a temporary ID
            if (action === 'create') {
                body.id = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                body._isOffline = true;
            }
            
            // Update local IndexedDB immediately for optimistic UI
            if (type === 'appointment' && action !== 'delete') {
                const appointments = await OfflineStore.getAppointmentsInRange('1900-01-01', '2100-12-31');
                if (action === 'create') {
                    appointments.push({ ...body, date: body.start?.split('T')[0] });
                } else {
                    const idx = appointments.findIndex(a => a.id === body.id);
                    if (idx !== -1) appointments[idx] = { ...appointments[idx], ...body };
                }
                await OfflineStore.syncAppointments(appointments);
            }
            
            // Return fake successful response
            return createJsonResponse(body, 201);
        }
        
        throw new Error('Cannot perform this action offline');
    }

    /**
     * Cache response in IndexedDB
     */
    async function cacheResponse(url, response) {
        // Only cache successful JSON responses
        const contentType = response.headers.get('content-type');
        if (!contentType?.includes('application/json')) return;
        
        try {
            const data = await response.json();
            const urlObj = new URL(url, window.location.origin);
            const path = urlObj.pathname;
            
            // Sync data to appropriate store
            if (path.includes('/appointments') && Array.isArray(data)) {
                await OfflineStore.syncAppointments(data);
            } else if (path.includes('/customers') && Array.isArray(data)) {
                await OfflineStore.syncCustomers(data);
            } else if (path.includes('/pianos') && Array.isArray(data)) {
                await OfflineStore.syncPianos(data);
            } else if (path.includes('/services') && Array.isArray(data)) {
                await OfflineStore.syncServices(data);
            }
        } catch (e) {
            console.warn('[OfflineFetch] Failed to cache response:', e);
        }
    }

    /**
     * Create a fake Response object with JSON data
     */
    function createJsonResponse(data, status = 200) {
        return {
            ok: status >= 200 && status < 300,
            status,
            json: async () => data,
            text: async () => JSON.stringify(data),
            headers: new Headers({ 'content-type': 'application/json' }),
            _isOffline: true
        };
    }

    /**
     * Get sync status
     */
    async function getSyncStatus() {
        const pending = await OfflineStore.getPendingSync();
        const lastSync = await OfflineStore.getLastSyncTime('appointments');
        
        return {
            pendingChanges: pending.length,
            lastSync,
            isOnline: navigator.onLine
        };
    }

    /**
     * Force sync now
     */
    async function syncNow() {
        if (!navigator.onLine) {
            return { success: false, reason: 'offline' };
        }
        
        // Process pending changes first
        await OfflineStore.processSyncQueue();
        
        // Then do full sync
        return OfflineStore.fullSync();
    }

    // Public API
    return {
        fetch: fetchWithOffline,
        getSyncStatus,
        syncNow
    };
})();

// Make available globally
if (typeof window !== 'undefined') {
    window.OfflineFetch = OfflineFetch;
}
