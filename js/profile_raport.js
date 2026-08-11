// ============================================================
// PROFILE_RAPORT.JS - v5.0.0 (REFACTORED)
// ============================================================
// CHANGELOG v5.0.0:
// ✅ Centralized State Management dengan AppState
// ✅ Smart Cache dengan Event-based Invalidation
// ✅ Error Handling & Retry dengan Exponential Backoff
// ✅ Performance Optimization (Virtual Scrolling, Batch DOM)
// ✅ Data Consistency & Sync
// ✅ Network Optimization (Batch Requests, Prefetch)
// ✅ Responsive & Accessibility (ARIA, Keyboard, Touch)
// ============================================================

// ============================================================
// 1. CONFIGURATION
// ============================================================
const CONFIG = {
    API_BASE: 'https://script.google.com/macros/s/AKfycbxfANwhLfJnT1uDqC_4xIFpCvMDLbM0rZcrFPXqLuFc-u0juCrsTgb7v9yGMUedlWiF/exec',
    CACHE: {
        TTL: 5 * 60 * 1000, // 5 minutes
        DETAIL_TTL: 10 * 60 * 1000, // 10 minutes
        MAX_ITEMS: 50
    },
    PAGINATION: {
        PAGE_SIZE: 20
    },
    RETRY: {
        MAX_ATTEMPTS: 3,
        BASE_DELAY: 1000,
        MAX_DELAY: 10000
    },
    DEBOUNCE: {
        SEARCH: 300,
        SCROLL: 100
    },
    VIRTUAL_SCROLL: {
        ITEM_HEIGHT: 60,
        BUFFER: 5
    }
};

// ============================================================
// 2. STATE MANAGEMENT
// ============================================================
class AppState {
    constructor() {
        this._state = {
            pegawai: null,
            stats: null,
            records: [],
            holidays: [],
            filter: 'month',
            pagination: {
                page: 0,
                hasMore: true,
                isLoading: false
            },
            ui: {
                detailOpen: false,
                selectedDate: null,
                isLoading: false,
                error: null
            },
            version: 1
        };
        this._listeners = new Map();
        this._history = [];
        this._maxHistory = 50;
    }

    // Getter dengan default values
    get state() {
        return this._state;
    }

    get pegawai() { return this._state.pegawai; }
    get stats() { return this._state.stats; }
    get records() { return this._state.records; }
    get holidays() { return this._state.holidays; }
    get filter() { return this._state.filter; }
    get pagination() { return this._state.pagination; }
    get ui() { return this._state.ui; }

    // State update dengan history
    update(updates, meta = {}) {
        const oldState = { ...this._state };
        this._state = this._deepMerge(this._state, updates);
        this._state.version++;
        
        // Save history untuk undo
        this._history.push({
            timestamp: Date.now(),
            oldState,
            newState: { ...this._state },
            meta
        });
        if (this._history.length > this._maxHistory) {
            this._history.shift();
        }

        this._notifyListeners(oldState, this._state);
        return this._state;
    }

    // Subscribe ke perubahan state
    subscribe(key, callback) {
        if (!this._listeners.has(key)) {
            this._listeners.set(key, []);
        }
        this._listeners.get(key).push(callback);
        
        // Return unsubscribe function
        return () => {
            const callbacks = this._listeners.get(key);
            if (callbacks) {
                const index = callbacks.indexOf(callback);
                if (index > -1) callbacks.splice(index, 1);
            }
        };
    }

    // Subscribe ke semua perubahan
    subscribeAll(callback) {
        return this.subscribe('*', callback);
    }

    // Notify listeners
    _notifyListeners(oldState, newState) {
        // Notify specific keys
        const changedKeys = this._getChangedKeys(oldState, newState);
        changedKeys.forEach(key => {
            const callbacks = this._listeners.get(key);
            if (callbacks) {
                callbacks.forEach(cb => {
                    try {
                        cb(newState[key], oldState[key], newState);
                    } catch (e) {
                        console.error(`Error in listener for ${key}:`, e);
                    }
                });
            }
        });

        // Notify all listeners
        const allCallbacks = this._listeners.get('*');
        if (allCallbacks) {
            allCallbacks.forEach(cb => {
                try {
                    cb(newState, oldState);
                } catch (e) {
                    console.error('Error in all listener:', e);
                }
            });
        }
    }

    // Helper: Deep merge objects
    _deepMerge(target, source) {
        const result = { ...target };
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this._deepMerge(result[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }
        return result;
    }

    // Helper: Get changed keys
    _getChangedKeys(oldState, newState) {
        const keys = new Set();
        const allKeys = new Set([...Object.keys(oldState), ...Object.keys(newState)]);
        allKeys.forEach(key => {
            if (JSON.stringify(oldState[key]) !== JSON.stringify(newState[key])) {
                keys.add(key);
            }
        });
        return keys;
    }

    // Undo last state change
    undo() {
        if (this._history.length === 0) return null;
        const last = this._history.pop();
        this._state = last.oldState;
        this._notifyListeners(last.newState, this._state);
        return this._state;
    }

    // Reset state
    reset() {
        const oldState = { ...this._state };
        this._state = {
            pegawai: null,
            stats: null,
            records: [],
            holidays: [],
            filter: 'month',
            pagination: { page: 0, hasMore: true, isLoading: false },
            ui: { detailOpen: false, selectedDate: null, isLoading: false, error: null },
            version: 1
        };
        this._history = [];
        this._notifyListeners(oldState, this._state);
        return this._state;
    }

    // Debug: Get state snapshot
    getSnapshot() {
        return {
            state: { ...this._state },
            history: this._history.length,
            listeners: {
                total: this._listeners.size,
                keys: Array.from(this._listeners.keys())
            }
        };
    }
}

// ============================================================
// 3. SMART CACHE
// ============================================================
class SmartCache {
    constructor() {
        this._cache = new Map();
        this._version = 1;
        this._eventListeners = new Map();
        this._maxItems = CONFIG.CACHE.MAX_ITEMS;
        this._ttl = CONFIG.CACHE.TTL;
        this._timestamps = new Map();
    }

    // Set cache dengan TTL per key
    set(key, data, ttl = this._ttl) {
        // Limit cache size
        if (this._cache.size >= this._maxItems) {
            const oldest = this._getOldestKey();
            if (oldest) this.delete(oldest);
        }

        const cacheKey = this._getCacheKey(key);
        this._cache.set(cacheKey, data);
        this._timestamps.set(cacheKey, Date.now() + ttl);
        
        // Notify listeners
        this._emit('set', { key, data });
        return data;
    }

    // Get cache dengan validation
    get(key) {
        const cacheKey = this._getCacheKey(key);
        const data = this._cache.get(cacheKey);
        const expiry = this._timestamps.get(cacheKey);
        
        if (!data || !expiry) return null;
        
        // Check TTL
        if (Date.now() > expiry) {
            this.delete(key);
            return null;
        }
        
        // Validate data
        if (this._isValid(data)) {
            this._emit('hit', { key, data });
            return data;
        }
        
        this.delete(key);
        return null;
    }

    // Delete cache
    delete(key) {
        const cacheKey = this._getCacheKey(key);
        this._cache.delete(cacheKey);
        this._timestamps.delete(cacheKey);
        this._emit('delete', { key });
        return true;
    }

    // Clear all cache
    clear() {
        this._cache.clear();
        this._timestamps.clear();
        this._version++;
        this._emit('clear', {});
        return true;
    }

    // Invalidate berdasarkan event
    invalidate(event, data) {
        if (this._eventListeners.has(event)) {
            const listeners = this._eventListeners.get(event);
            listeners.forEach(cb => {
                try {
                    cb(data);
                } catch (e) {
                    console.error(`Error in invalidate listener for ${event}:`, e);
                }
            });
        }
        // Increment version untuk semua cache
        this._version++;
        this._emit('invalidate', { event, data });
        return true;
    }

    // Event system
    on(event, callback) {
        if (!this._eventListeners.has(event)) {
            this._eventListeners.set(event, []);
        }
        this._eventListeners.get(event).push(callback);
        return () => {
            const callbacks = this._eventListeners.get(event);
            if (callbacks) {
                const index = callbacks.indexOf(callback);
                if (index > -1) callbacks.splice(index, 1);
            }
        };
    }

    // Emit event
    _emit(event, data) {
        if (this._eventListeners.has(event)) {
            this._eventListeners.get(event).forEach(cb => {
                try {
                    cb(data);
                } catch (e) {
                    console.error(`Error in ${event} listener:`, e);
                }
            });
        }
    }

    // Get cache key with version
    _getCacheKey(key) {
        return `${key}_v${this._version}`;
    }

    // Get oldest key (for cache eviction)
    _getOldestKey() {
        let oldest = null;
        let oldestTime = Infinity;
        for (const [key, expiry] of this._timestamps) {
            if (expiry < oldestTime) {
                oldestTime = expiry;
                oldest = key;
            }
        }
        return oldest ? this._parseCacheKey(oldest) : null;
    }

    // Parse cache key
    _parseCacheKey(cacheKey) {
        const parts = cacheKey.split('_v');
        return parts[0] || null;
    }

    // Validate data
    _isValid(data) {
        if (data === null || data === undefined) return false;
        if (typeof data === 'object' && data.status === 'error') return false;
        return true;
    }

    // Get cache stats
    getStats() {
        return {
            size: this._cache.size,
            version: this._version,
            maxItems: this._maxItems,
            events: Array.from(this._eventListeners.keys()),
            keys: Array.from(this._cache.keys())
        };
    }
}

// ============================================================
// 4. ERROR HANDLING & RETRY
// ============================================================
class RetryManager {
    constructor(options = {}) {
        this.maxAttempts = options.maxAttempts || CONFIG.RETRY.MAX_ATTEMPTS;
        this.baseDelay = options.baseDelay || CONFIG.RETRY.BASE_DELAY;
        this.maxDelay = options.maxDelay || CONFIG.RETRY.MAX_DELAY;
        this.shouldRetry = options.shouldRetry || this._defaultShouldRetry;
        this.onRetry = options.onRetry || (() => {});
        this.errors = [];
    }

    // Execute dengan retry
    async execute(fn, context = {}) {
        let lastError;
        let attempt = 0;

        while (attempt < this.maxAttempts) {
            try {
                const result = await fn();
                // Success - clear errors
                this.errors = [];
                return result;
            } catch (error) {
                lastError = error;
                this.errors.push({
                    attempt: attempt + 1,
                    error: error.message,
                    timestamp: Date.now(),
                    context
                });

                attempt++;
                
                if (attempt >= this.maxAttempts) {
                    break;
                }

                // Check if should retry
                if (!this.shouldRetry(error, attempt)) {
                    break;
                }

                // Calculate delay with exponential backoff + jitter
                const delay = Math.min(
                    this.baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000,
                    this.maxDelay
                );

                this.onRetry({
                    attempt,
                    delay,
                    error: error.message,
                    context
                });

                // Wait before next attempt
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        // All attempts failed
        const error = new Error(`Failed after ${this.maxAttempts} attempts`);
        error.cause = lastError;
        error.attempts = this.errors;
        throw error;
    }

    // Default should retry
    _defaultShouldRetry(error, attempt) {
        // Network errors
        if (error.name === 'AbortError' || error.name === 'TimeoutError') {
            return true;
        }
        
        // Server errors (5xx)
        if (error.status && error.status >= 500 && error.status < 600) {
            return true;
        }
        
        // Rate limiting (429)
        if (error.status === 429) {
            return true;
        }
        
        // Don't retry on client errors (4xx)
        if (error.status && error.status >= 400 && error.status < 500) {
            return false;
        }
        
        // Default: retry up to 3 times
        return attempt < 3;
    }

    // Get error history
    getErrorHistory() {
        return [...this.errors];
    }

    // Clear error history
    clearErrors() {
        this.errors = [];
        return true;
    }
}

// ============================================================
// 5. DATA CONSISTENCY
// ============================================================
class DataConsistency {
    constructor() {
        this.data = null;
        this.derived = null;
        this.validators = [];
        this.fixers = [];
        this.history = [];

        // Register default validators
        this.registerValidator(this.validateStructure.bind(this));
        this.registerValidator(this.validateAlpha.bind(this));
        this.registerValidator(this.validatePercentages.bind(this));

        // Register default fixers
        this.registerFixer(this.fixAlpha.bind(this));
        this.registerFixer(this.fixPercentages.bind(this));
    }

    // Register validator
    registerValidator(validator) {
        this.validators.push(validator);
    }

    // Register fixer
    registerFixer(fixer) {
        this.fixers.push(fixer);
    }

    // Validate data
    validate(rawData) {
        const errors = [];
        const warnings = [];
        
        this.validators.forEach(validator => {
            try {
                const result = validator(rawData);
                if (result.errors) {
                    errors.push(...result.errors);
                }
                if (result.warnings) {
                    warnings.push(...result.warnings);
                }
            } catch (e) {
                errors.push(`Validator error: ${e.message}`);
            }
        });

        return { errors, warnings };
    }

    // Fix data
    fix(rawData) {
        let fixedData = { ...rawData };
        let fixes = [];

        this.fixers.forEach(fixer => {
            try {
                const result = fixer(fixedData);
                if (result.fixed) {
                    fixedData = result.data;
                    fixes.push(result.message);
                }
            } catch (e) {
                console.warn('Fixer error:', e);
            }
        });

        return { data: fixedData, fixes };
    }

    // Set data with validation and fixing
    setData(rawData) {
        // Validate
        const validation = this.validate(rawData);
        
        // Auto-fix if possible
        let fixedData = rawData;
        if (validation.errors.length > 0) {
            console.warn('Data validation failed:', validation.errors);
            const fixResult = this.fix(rawData);
            fixedData = fixResult.data;
            if (fixResult.fixes.length > 0) {
                console.log('Fixed data:', fixResult.fixes);
            }
        }

        // Update state
        this.data = fixedData;
        this.derived = this.deriveData(fixedData);
        this.history.push({
            timestamp: Date.now(),
            validation,
            fixes: validation.errors.length > 0 ? this.fix(fixedData).fixes : []
        });

        // Keep history limited
        if (this.history.length > 100) {
            this.history.shift();
        }

        return {
            data: fixedData,
            derived: this.derived,
            validation,
            history: this.history
        };
    }

    // Derive additional data
    deriveData(data) {
        if (!data || !data.stats) return null;

        const stats = data.stats;
        const derived = {
            totalKehadiran: (stats.hadir || 0) + 
                           (stats.terlambat || 0) + 
                           (stats.izin || 0) + 
                           (stats.sakit || 0) + 
                           (stats.dinas || 0),
            maxPossibleScore: (data.workingDays || 0) * 100,
            grade: this.calculateGrade(stats.totalNilai || 0, data.workingDays || 0),
            consistency: this.calculateConsistency(stats),
            trend: this.calculateTrend(stats)
        };

        return derived;
    }

    // Validators
    validateStructure(data) {
        const errors = [];
        const warnings = [];

        if (!data) {
            errors.push('Data is null or undefined');
            return { errors, warnings };
        }

        if (!data.stats) {
            errors.push('Missing stats object');
            return { errors, warnings };
        }

        const required = ['hadir', 'terlambat', 'izin', 'sakit', 'dinas', 'alpha', 'totalNilai'];
        required.forEach(field => {
            if (data.stats[field] === undefined) {
                warnings.push(`Missing field: ${field}`);
            }
        });

        return { errors, warnings };
    }

    validateAlpha(data) {
        const errors = [];
        const warnings = [];

        if (!data.stats || data.workingDays === undefined) {
            return { errors, warnings };
        }

        const totalKehadiran = (data.stats.hadir || 0) + 
                              (data.stats.terlambat || 0) + 
                              (data.stats.izin || 0) + 
                              (data.stats.sakit || 0) + 
                              (data.stats.dinas || 0);
        
        const expectedAlpha = Math.max(0, data.workingDays - totalKehadiran);
        const actualAlpha = data.stats.alpha || 0;

        if (Math.abs(actualAlpha - expectedAlpha) > 0.5) {
            errors.push(`Alpha mismatch: expected ${expectedAlpha}, got ${actualAlpha}`);
        }

        return { errors, warnings };
    }

    validatePercentages(data) {
        const errors = [];
        const warnings = [];

        if (!data.stats || !data.percentages || data.workingDays === undefined) {
            return { errors, warnings };
        }

        const total = Object.values(data.percentages).reduce((sum, val) => {
            return sum + (parseFloat(val) || 0);
        }, 0);

        if (Math.abs(total - 100) > 1) {
            warnings.push(`Percentages sum to ${total.toFixed(1)}%, expected 100%`);
        }

        return { errors, warnings };
    }

    // Fixers
    fixAlpha(data) {
        const fixedData = { ...data };
        if (!fixedData.stats || fixedData.workingDays === undefined) {
            return { fixed: false, data: fixedData };
        }

        const totalKehadiran = (fixedData.stats.hadir || 0) + 
                              (fixedData.stats.terlambat || 0) + 
                              (fixedData.stats.izin || 0) + 
                              (fixedData.stats.sakit || 0) + 
                              (fixedData.stats.dinas || 0);
        
        const expectedAlpha = Math.max(0, fixedData.workingDays - totalKehadiran);
        fixedData.stats.alpha = expectedAlpha;

        return {
            fixed: true,
            data: fixedData,
            message: `Fixed alpha to ${expectedAlpha}`
        };
    }

    fixPercentages(data) {
        const fixedData = { ...data };
        if (!fixedData.percentages || fixedData.workingDays === undefined) {
            return { fixed: false, data: fixedData };
        }

        const stats = fixedData.stats;
        const workingDays = fixedData.workingDays;
        
        const pct = {
            hadir: workingDays > 0 ? ((stats.hadir / workingDays) * 100).toFixed(1) : '0.0',
            terlambat: workingDays > 0 ? ((stats.terlambat / workingDays) * 100).toFixed(1) : '0.0',
            izin: workingDays > 0 ? ((stats.izin / workingDays) * 100).toFixed(1) : '0.0',
            sakit: workingDays > 0 ? ((stats.sakit / workingDays) * 100).toFixed(1) : '0.0',
            dinas: workingDays > 0 ? ((stats.dinas / workingDays) * 100).toFixed(1) : '0.0',
            alpha: workingDays > 0 ? ((stats.alpha / workingDays) * 100).toFixed(1) : '0.0'
        };

        fixedData.percentages = pct;

        return {
            fixed: true,
            data: fixedData,
            message: 'Recalculated percentages'
        };
    }

    // Helper calculations
    calculateGrade(score, workingDays) {
        const maxScore = workingDays * 100;
        const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
        
        if (percentage >= 90) return 'A';
        if (percentage >= 80) return 'B';
        if (percentage >= 70) return 'C';
        if (percentage >= 60) return 'D';
        return 'E';
    }

    calculateConsistency(stats) {
        const total = Object.values(stats).reduce((sum, val) => sum + (val || 0), 0);
        if (total === 0) return 0;
        
        const present = (stats.hadir || 0) + (stats.terlambat || 0);
        return (present / total) * 100;
    }

    calculateTrend(stats) {
        // Sederhana: bandingkan hadir vs terlambat
        const total = (stats.hadir || 0) + (stats.terlambat || 0);
        if (total === 0) return 'stable';
        
        const hadirRatio = (stats.hadir || 0) / total;
        if (hadirRatio >= 0.8) return 'improving';
        if (hadirRatio >= 0.5) return 'stable';
        return 'declining';
    }

    // Get data quality report
    getQualityReport() {
        if (!this.data) return null;

        const lastCheck = this.history[this.history.length - 1];
        return {
            timestamp: Date.now(),
            hasData: !!this.data,
            validationCount: this.history.length,
            lastValidation: lastCheck ? lastCheck.timestamp : null,
            lastErrors: lastCheck ? lastCheck.validation.errors : [],
            lastFixes: lastCheck ? lastCheck.fixes : [],
            derived: this.derived
        };
    }
}

// ============================================================
// 6. NETWORK OPTIMIZATION
// ============================================================
class NetworkOptimizer {
    constructor(options = {}) {
        this.baseURL = options.baseURL || CONFIG.API_BASE;
        this.batchQueue = [];
        this.batchTimeout = null;
        this.batchSize = options.batchSize || 10;
        this.batchDelay = options.batchDelay || 100;
        this.pendingRequests = new Map();
        this.abortControllers = new Map();
        this.retryManager = new RetryManager(options.retry);
        this.onProgress = options.onProgress || (() => {});
    }

    // Batch request dengan deduplication
    async batchRequest(requests) {
        return new Promise((resolve, reject) => {
            // Add to queue
            this.batchQueue.push({
                requests,
                resolve,
                reject,
                timestamp: Date.now()
            });

            // Process batch immediately if queue is full
            if (this.batchQueue.length >= this.batchSize) {
                this._processBatch();
                return;
            }

            // Process batch after delay
            clearTimeout(this.batchTimeout);
            this.batchTimeout = setTimeout(() => {
                this._processBatch();
            }, this.batchDelay);
        });
    }

    // Process batch queue
    async _processBatch() {
        if (this.batchQueue.length === 0) return;

        const batch = [...this.batchQueue];
        this.batchQueue = [];

        // Deduplicate requests
        const uniqueRequests = this._deduplicateRequests(batch);

        try {
            // Execute batch
            const results = await this._executeBatch(uniqueRequests);

            // Resolve individual promises
            batch.forEach(item => {
                const result = results.find(r => r.id === item.requests.id);
                if (result && !result.error) {
                    item.resolve(result.data);
                } else if (result) {
                    item.reject(new Error(result.error));
                } else {
                    item.reject(new Error('Request not found in batch response'));
                }
            });

        } catch (error) {
            // Reject all with error
            batch.forEach(item => {
                item.reject(error);
            });
        }
    }

    // Execute batch with retry
    async _executeBatch(requests) {
        const url = `${this.baseURL}?batch=${encodeURIComponent(JSON.stringify(requests))}`;
        const controller = new AbortController();
        const requestId = Date.now().toString();

        this.abortControllers.set(requestId, controller);

        try {
            const response = await this.retryManager.execute(async () => {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    signal: controller.signal
                });

                if (!res.ok) {
                    const error = new Error(`HTTP ${res.status}`);
                    error.status = res.status;
                    throw error;
                }

                return res.json();
            }, { requestId, url });

            this.abortControllers.delete(requestId);
            return response.data || [];

        } catch (error) {
            this.abortControllers.delete(requestId);
            throw error;
        }
    }

    // Deduplicate requests
    _deduplicateRequests(batch) {
        const seen = new Map();
        const result = [];

        batch.forEach(item => {
            const key = JSON.stringify(item.requests);
            if (!seen.has(key)) {
                seen.set(key, item);
                result.push({
                    ...item.requests,
                    _originalResolve: item.resolve,
                    _originalReject: item.reject
                });
            }
        });

        return result;
    }

    // Single request dengan cache
    async request(action, params = {}, options = {}) {
        const requestId = `${action}_${JSON.stringify(params)}`;
        
        // Check pending request
        if (this.pendingRequests.has(requestId)) {
            return this.pendingRequests.get(requestId);
        }

        const promise = this._executeRequest(action, params, options);
        this.pendingRequests.set(requestId, promise);

        try {
            const result = await promise;
            return result;
        } finally {
            this.pendingRequests.delete(requestId);
        }
    }

    // Execute single request
    async _executeRequest(action, params, options) {
        const url = `${this.baseURL}?action=${action}&${new URLSearchParams(params)}&cb=${Date.now()}`;
        const controller = new AbortController();
        const requestId = `${action}_${Date.now()}`;

        this.abortControllers.set(requestId, controller);

        try {
            const response = await this.retryManager.execute(async () => {
                const res = await fetch(url, {
                    signal: controller.signal,
                    headers: {
                        'Cache-Control': 'no-cache'
                    },
                    ...options
                });

                if (!res.ok) {
                    const error = new Error(`HTTP ${res.status}`);
                    error.status = res.status;
                    throw error;
                }

                return res.json();
            }, { requestId, action, params });

            this.abortControllers.delete(requestId);
            return response;

        } catch (error) {
            this.abortControllers.delete(requestId);
            throw error;
        }
    }

    // Abort request
    abort(requestId) {
        if (this.abortControllers.has(requestId)) {
            this.abortControllers.get(requestId).abort();
            this.abortControllers.delete(requestId);
            return true;
        }
        return false;
    }

    // Abort all requests
    abortAll() {
        this.abortControllers.forEach(controller => controller.abort());
        this.abortControllers.clear();
        return true;
    }

    // Prefetch data
    async prefetch(queries) {
        try {
            const results = await this.batchRequest(queries);
            return results;
        } catch (error) {
            console.warn('Prefetch failed:', error);
            return null;
        }
    }

    // Cancel batch processing
    cancelBatch() {
        clearTimeout(this.batchTimeout);
        this.batchQueue = [];
        return true;
    }

    // Get request stats
    getStats() {
        return {
            batchQueueSize: this.batchQueue.length,
            pendingRequests: this.pendingRequests.size,
            activeControllers: this.abortControllers.size,
            retryHistory: this.retryManager.getErrorHistory()
        };
    }
}

// ============================================================
// 7. ACCESSIBILITY
// ============================================================
class AccessibilityManager {
    constructor() {
        this.announcer = this._createAnnouncer();
        this.focusTraps = [];
        this.keyboardShortcuts = new Map();
        this.focusHistory = [];
        this.ariaLiveRegions = new Map();
    }

    // Initialize accessibility
    init() {
        // Set page title
        document.title = 'Profile Raport - Presensi PPA';
        
        // Add skip link
        this._addSkipLink();
        
        // Add ARIA landmarks
        this._addLandmarks();
        
        // Setup keyboard shortcuts
        this._setupShortcuts();
        
        // Handle focus management
        this._setupFocusManagement();
        
        // Handle reduced motion
        this._handleReducedMotion();
    }

    // Announce to screen readers
    announce(message, priority = 'polite') {
        const announcer = this.announcer;
        announcer.setAttribute('aria-live', priority);
        announcer.textContent = '';
        
        // Use setTimeout to ensure screen readers pick up the change
        requestAnimationFrame(() => {
            announcer.textContent = message;
        });
    }

    // Create announcer element
    _createAnnouncer() {
        let announcer = document.getElementById('sr-announcer');
        if (!announcer) {
            announcer = document.createElement('div');
            announcer.id = 'sr-announcer';
            announcer.className = 'sr-only';
            announcer.setAttribute('aria-live', 'polite');
            document.body.appendChild(announcer);
        }
        return announcer;
    }

    // Add skip link
    _addSkipLink() {
        const skipLink = document.createElement('a');
        skipLink.href = '#main-content';
        skipLink.className = 'skip-link';
        skipLink.textContent = 'Lompat ke konten utama';
        skipLink.style.cssText = `
            position: absolute;
            top: -1000px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--sda-toska);
            color: white;
            padding: 12px 24px;
            border-radius: 0 0 8px 8px;
            z-index: 99999;
            font-weight: 700;
        `;
        skipLink.addEventListener('focus', () => {
            skipLink.style.top = '0';
        });
        skipLink.addEventListener('blur', () => {
            skipLink.style.top = '-1000px';
        });
        document.body.prepend(skipLink);
    }

    // Add ARIA landmarks
    _addLandmarks() {
        const main = document.querySelector('main');
        if (main) {
            main.setAttribute('role', 'main');
            main.id = 'main-content';
        }

        const nav = document.querySelector('nav');
        if (nav) {
            nav.setAttribute('role', 'navigation');
            nav.setAttribute('aria-label', 'Navigasi utama');
        }

        const sidebar = document.querySelector('.sidebar');
        if (sidebar) {
            sidebar.setAttribute('role', 'complementary');
            sidebar.setAttribute('aria-label', 'Informasi profil');
        }
    }

    // Setup keyboard shortcuts
    _setupShortcuts() {
        // Register shortcuts
        this.registerShortcut('b', 'Kembali', () => goBack());
        this.registerShortcut('f', 'Filter Bulan Ini', () => setFilter('month'));
        this.registerShortcut('r', 'Refresh Data', () => loadData());
        this.registerShortcut('Escape', 'Tutup Detail', () => closeDetail());

        document.addEventListener('keydown', (e) => {
            // Don't trigger shortcuts if user is typing
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            // Check modifiers
            if (e.ctrlKey || e.altKey || e.metaKey) {
                return;
            }

            const key = e.key;
            if (this.keyboardShortcuts.has(key)) {
                e.preventDefault();
                const shortcut = this.keyboardShortcuts.get(key);
                shortcut.action();
                this.announce(`Shortcut: ${shortcut.description}`);
            }
        });
    }

    // Register keyboard shortcut
    registerShortcut(key, description, action) {
        this.keyboardShortcuts.set(key, { description, action });
        return () => this.keyboardShortcuts.delete(key);
    }

    // Setup focus management
    _setupFocusManagement() {
        // Save focus before modal opens
        document.addEventListener('focusin', (e) => {
            this.focusHistory.push(e.target);
            if (this.focusHistory.length > 10) {
                this.focusHistory.shift();
            }
        });

        // Restore focus after modal closes
        this.restoreFocus = () => {
            const lastFocus = this.focusHistory.pop();
            if (lastFocus && document.contains(lastFocus)) {
                lastFocus.focus();
            }
        };
    }

    // Handle reduced motion preference
    _handleReducedMotion() {
        const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        if (mediaQuery.matches) {
            document.body.classList.add('reduced-motion');
            // Disable animations
            document.querySelectorAll('.animate, .transition').forEach(el => {
                el.style.animationDuration = '0.01ms';
                el.style.transitionDuration = '0.01ms';
            });
        }

        mediaQuery.addEventListener('change', (e) => {
            if (e.matches) {
                document.body.classList.add('reduced-motion');
            } else {
                document.body.classList.remove('reduced-motion');
            }
        });
    }

    // Make element focusable
    makeFocusable(element, label) {
        if (!element) return;
        element.setAttribute('role', 'button');
        element.setAttribute('tabindex', '0');
        element.setAttribute('aria-label', label || element.textContent || 'Button');

        // Add keyboard support
        element.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                element.click();
            }
        });
    }

    // Create focus trap (for modals)
    createFocusTrap(container) {
        const trap = {
            container,
            previousFocus: document.activeElement,
            elements: null,
            currentIndex: 0
        };

        // Get focusable elements
        const getFocusable = () => {
            return container.querySelectorAll(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );
        };

        // Focus first element
        const focusFirst = () => {
            const elements = getFocusable();
            if (elements.length > 0) {
                elements[0].focus();
                trap.currentIndex = 0;
            }
        };

        // Focus last element
        const focusLast = () => {
            const elements = getFocusable();
            if (elements.length > 0) {
                elements[elements.length - 1].focus();
                trap.currentIndex = elements.length - 1;
            }
        };

        // Trap focus
        const trapFocus = (e) => {
            if (e.key !== 'Tab') return;
            
            const elements = getFocusable();
            if (elements.length === 0) return;

            const first = elements[0];
            const last = elements[elements.length - 1];

            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };

        // Activate trap
        trap.activate = () => {
            trap.previousFocus = document.activeElement;
            container.addEventListener('keydown', trapFocus);
            focusFirst();
            this.focusTraps.push(trap);
        };

        // Deactivate trap
        trap.deactivate = () => {
            container.removeEventListener('keydown', trapFocus);
            if (trap.previousFocus && document.contains(trap.previousFocus)) {
                trap.previousFocus.focus();
            }
            this.focusTraps = this.focusTraps.filter(t => t !== trap);
        };

        return trap;
    }

    // Announce loading state
    announceLoading(message = 'Memuat data...') {
        this.announce(message, 'assertive');
        document.body.setAttribute('aria-busy', 'true');
    }

    // Announce loaded state
    announceLoaded(message = 'Data selesai dimuat') {
        this.announce(message, 'polite');
        document.body.removeAttribute('aria-busy');
    }

    // Set page title
    setPageTitle(title) {
        document.title = `${title} - Presensi PPA`;
        // Announce page title change
        this.announce(`Halaman: ${title}`);
    }

    // Get accessibility report
    getReport() {
        const issues = [];
        
        // Check for images without alt text
        document.querySelectorAll('img:not([alt])').forEach(img => {
            issues.push(`Image missing alt text: ${img.src}`);
        });

        // Check for form labels
        document.querySelectorAll('input, textarea, select').forEach(el => {
            if (!el.id) return;
            const label = document.querySelector(`label[for="${el.id}"]`);
            if (!label) {
                issues.push(`Input missing label: ${el.id}`);
            }
        });

        // Check for heading hierarchy
        const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        let lastLevel = 0;
        headings.forEach(h => {
            const level = parseInt(h.tagName[1]);
            if (level > lastLevel + 1) {
                issues.push(`Heading skipped: ${h.tagName} -> ${h.textContent}`);
            }
            lastLevel = level;
        });

        return {
            issues,
            totalIssues: issues.length,
            shortcuts: Array.from(this.keyboardShortcuts.keys()),
            focusTraps: this.focusTraps.length,
            ariaLiveRegions: this.ariaLiveRegions.size
        };
    }
}

// ============================================================
// 8. UI COMPONENTS & RENDERERS
// ============================================================
class UIComponent {
    constructor(options = {}) {
        this.id = options.id || `component_${Date.now()}`;
        this.template = options.template || (() => '');
        this.state = options.state || {};
        this.events = options.events || {};
        this.children = options.children || [];
        this.parent = options.parent || null;
        this._mounted = false;
        this._element = null;
    }

    // Mount component
    mount(target) {
        if (this._mounted) return this._element;

        const container = typeof target === 'string' 
            ? document.querySelector(target) 
            : target;

        if (!container) {
            console.error(`Container not found for component ${this.id}`);
            return null;
        }

        this._element = this._createElement();
        container.appendChild(this._element);
        this._mounted = true;

        // Mount children
        this.children.forEach(child => {
            child.mount(this._element);
        });

        // Attach events
        this._attachEvents();

        // Lifecycle hooks
        this.onMount();

        return this._element;
    }

    // Unmount component
    unmount() {
        if (!this._mounted) return;

        // Unmount children
        this.children.forEach(child => child.unmount());

        // Remove events
        this._detachEvents();

        // Remove element
        if (this._element && this._element.parentNode) {
            this._element.parentNode.removeChild(this._element);
        }

        this._mounted = false;
        this._element = null;

        // Lifecycle hooks
        this.onUnmount();
    }

    // Update component
    update(newState) {
        const oldState = { ...this.state };
        this.state = { ...this.state, ...newState };
        
        // Re-render if needed
        this.render();

        // Lifecycle hooks
        this.onUpdate(oldState, this.state);

        return this;
    }

    // Render component
    render() {
        if (!this._mounted || !this._element) return;

        const content = this.template(this.state);
        this._element.innerHTML = content;

        // Re-attach events
        this._attachEvents();

        // Lifecycle hooks
        this.onRender();

        return this;
    }

    // Create element
    _createElement() {
        const element = document.createElement('div');
        element.id = this.id;
        element.className = this.state.className || '';
        element.dataset.component = this.id;
        return element;
    }

    // Attach events
    _attachEvents() {
        Object.entries(this.events).forEach(([event, handler]) => {
            if (typeof handler === 'function') {
                this._element.addEventListener(event, handler);
            }
        });
    }

    // Detach events
    _detachEvents() {
        Object.entries(this.events).forEach(([event, handler]) => {
            if (typeof handler === 'function') {
                this._element.removeEventListener(event, handler);
            }
        });
    }

    // Lifecycle hooks
    onMount() {}
    onUnmount() {}
    onUpdate(oldState, newState) {}
    onRender() {}

    // Find child by id
    findChild(id) {
        return this.children.find(child => child.id === id);
    }

    // Get element
    get element() {
        return this._element;
    }

    // Check if mounted
    get isMounted() {
        return this._mounted;
    }
}

// ============================================================
// 9. VIRTUAL SCROLLER
// ============================================================
class VirtualScroller {
    constructor(options = {}) {
        this.container = options.container;
        this.items = options.items || [];
        this.itemHeight = options.itemHeight || CONFIG.VIRTUAL_SCROLL.ITEM_HEIGHT;
        this.buffer = options.buffer || CONFIG.VIRTUAL_SCROLL.BUFFER;
        this.renderItem = options.renderItem || (() => '');
        this.onScroll = options.onScroll || (() => {});
        this.onEnd = options.onEnd || (() => {});

        this._scrollTop = 0;
        this._visibleRange = { start: 0, end: 0 };
        this._totalHeight = 0;
        this._mounted = false;
        this._cachedItems = new Map();
        this._rafId = null;

        this._init();
    }

    // Initialize
    _init() {
        // Set container styles
        this.container.style.overflow = 'auto';
        this.container.style.position = 'relative';
        this.container.style.height = '100%';
        this.container.style.willChange = 'scroll-position';

        // Create content wrapper
        this._wrapper = document.createElement('div');
        this._wrapper.style.position = 'relative';
        this._wrapper.style.willChange = 'transform';
        this.container.appendChild(this._wrapper);

        // Bind scroll event
        this._onScroll = this._onScroll.bind(this);
        this.container.addEventListener('scroll', this._onScroll, { passive: true });

        this._mounted = true;
        this.update(this.items);
    }

    // Update items
    update(items) {
        this.items = items || [];
        this._totalHeight = this.items.length * this.itemHeight;
        this._wrapper.style.height = this._totalHeight + 'px';
        this._cachedItems.clear();
        this._renderVisible();
        this._updateScrollInfo();
    }

    // Scroll to item
    scrollTo(index) {
        if (index < 0 || index >= this.items.length) return;
        const target = index * this.itemHeight;
        this.container.scrollTop = target;
    }

    // Get visible range
    _getVisibleRange() {
        const containerHeight = this.container.clientHeight;
        const scrollTop = this.container.scrollTop;

        const start = Math.floor(scrollTop / this.itemHeight);
        const end = Math.ceil((scrollTop + containerHeight) / this.itemHeight);

        return {
            start: Math.max(0, start - this.buffer),
            end: Math.min(this.items.length, end + this.buffer)
        };
    }

    // Render visible items
    _renderVisible() {
        const range = this._getVisibleRange();
        
        if (range.start === this._visibleRange.start && 
            range.end === this._visibleRange.end) {
            return;
        }

        this._visibleRange = range;
        const { start, end } = range;

        // Build fragment
        const fragment = document.createDocumentFragment();
        const startOffset = start * this.itemHeight;

        for (let i = start; i < end; i++) {
            const item = this.items[i];
            let element = this._cachedItems.get(i);
            
            if (!element) {
                element = document.createElement('div');
                element.style.position = 'absolute';
                element.style.top = (i * this.itemHeight) + 'px';
                element.style.left = '0';
                element.style.right = '0';
                element.style.height = this.itemHeight + 'px';
                element.style.willChange = 'transform';
                element.dataset.index = i;
                
                this._cachedItems.set(i, element);
            }

            // Only re-render if content changed
            const content = this.renderItem(item, i);
            if (element.innerHTML !== content) {
                element.innerHTML = content;
            }

            fragment.appendChild(element);
        }

        // Clear wrapper and add fragment
        this._wrapper.innerHTML = '';
        this._wrapper.style.transform = `translateY(${startOffset}px)`;
        this._wrapper.appendChild(fragment);

        // Cleanup cache (remove items outside visible range)
        const cacheKeys = Array.from(this._cachedItems.keys());
        cacheKeys.forEach(key => {
            if (key < start || key >= end) {
                this._cachedItems.delete(key);
            }
        });
    }

    // Handle scroll
    _onScroll() {
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
        }

        this._rafId = requestAnimationFrame(() => {
            const { scrollTop, scrollHeight, clientHeight } = this.container;
            this._scrollTop = scrollTop;

            // Check if scrolled to bottom
            if (scrollTop + clientHeight >= scrollHeight - 50) {
                this.onEnd();
            }

            this._renderVisible();
            this.onScroll({
                scrollTop,
                scrollHeight,
                clientHeight,
                visibleRange: this._visibleRange,
                scrollPercent: (scrollTop / (scrollHeight - clientHeight)) * 100
            });

            this._rafId = null;
        });
    }

    // Update scroll info
    _updateScrollInfo() {
        const { scrollTop, scrollHeight, clientHeight } = this.container;
        this._scrollTop = scrollTop;
        this.onScroll({
            scrollTop,
            scrollHeight,
            clientHeight,
            visibleRange: this._visibleRange,
            scrollPercent: (scrollTop / (scrollHeight - clientHeight)) * 100
        });
    }

    // Destroy scroller
    destroy() {
        if (!this._mounted) return;
        this.container.removeEventListener('scroll', this._onScroll);
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
        }
        this._cachedItems.clear();
        this._wrapper.remove();
        this._mounted = false;
    }

    // Get item at index
    getItem(index) {
        return this.items[index] || null;
    }

    // Get visible items
    getVisibleItems() {
        const { start, end } = this._visibleRange;
        return this.items.slice(start, end);
    }

    // Get stats
    getStats() {
        return {
            totalItems: this.items.length,
            visibleItems: this._visibleRange.end - this._visibleRange.start,
            scrollTop: this._scrollTop,
            cachedItems: this._cachedItems.size,
            totalHeight: this._totalHeight
        };
    }
}

// ============================================================
// 10. MAIN APPLICATION - PROFILE_RAPORT
// ============================================================
// Initialize core systems
const appState = new AppState();
const cache = new SmartCache();
const dataConsistency = new DataConsistency();
const network = new NetworkOptimizer({
    baseURL: CONFIG.API_BASE,
    retry: {
        maxAttempts: CONFIG.RETRY.MAX_ATTEMPTS,
        baseDelay: CONFIG.RETRY.BASE_DELAY,
        maxDelay: CONFIG.RETRY.MAX_DELAY
    }
});
const accessibility = new AccessibilityManager();

// State subscriptions
let currentPegawai = null;
let statsData = null;
let recordsData = [];
let holidays = [];
let currentFilter = 'month';
let currentPage = 0;
let isLoadingMore = false;
let hasMoreData = true;

// DOM References
const DOM = {
    loadingOverlay: null,
    loadStatus: null,
    mainContent: null,
    historyBody: null,
    btnLoadMore: null,
    detailCard: null,
    detailContent: null,
    notificationModal: null,
    notifContent: null,
    profileAvatar: null,
    profileName: null,
    profileJob: null,
    profileWil: null,
    sidebarLogo: null,
    todayDate: null,
    todayHadir: null,
    todayHadirPoint: null,
    todayPulang: null,
    todayPulangPoint: null,
    todaySpecial: null,
    todaySpecialPoint: null,
    todayTotal: null,
    todayTotalPoint: null,
    historyCount: null,
    statHadir: null,
    statTerlambat: null,
    statIzin: null,
    statSakit: null,
    statDinas: null,
    statAlpha: null,
    statHadirPct: null,
    statTerlambatPct: null,
    statIzinPct: null,
    statSakitPct: null,
    statDinasPct: null,
    statAlphaPct: null,
    totalKehadiran: null,
    totalNilai: null,
    persentaseKehadiran: null,
    totalKehadiranStats: null,
    totalAlphaStats: null,
    totalWorkingDays: null,
    barHadir: null,
    barTerlambat: null,
    barIzin: null,
    barSakit: null,
    barDinas: null,
    barAlpha: null,
    liveClock: null,
    statsTitleText: null
};

// Initialize DOM references
function initDOM() {
    const ids = [
        'loadingOverlay', 'loadStatus', 'mainContent', 'historyBody', 'btnLoadMore',
        'detailCard', 'detailContent', 'notificationModal', 'notifContent',
        'profileAvatar', 'profileName', 'profileJob', 'profileWil', 'sidebarLogo',
        'todayDate', 'todayHadir', 'todayHadirPoint', 'todayPulang', 'todayPulangPoint',
        'todaySpecial', 'todaySpecialPoint', 'todayTotal', 'todayTotalPoint',
        'historyCount', 'statHadir', 'statTerlambat', 'statIzin', 'statSakit', 'statDinas',
        'statAlpha', 'statHadirPct', 'statTerlambatPct', 'statIzinPct', 'statSakitPct',
        'statDinasPct', 'statAlphaPct', 'totalKehadiran', 'totalNilai',
        'persentaseKehadiran', 'totalKehadiranStats', 'totalAlphaStats',
        'totalWorkingDays', 'barHadir', 'barTerlambat', 'barIzin', 'barSakit',
        'barDinas', 'barAlpha', 'liveClock', 'statsTitleText'
    ];

    ids.forEach(id => {
        DOM[id] = document.getElementById(id);
    });
}

// ============================================================
// 11. LOAD DATA WITH NEW SYSTEMS
// ============================================================
async function loadData() {
    const overlay = DOM.loadingOverlay;
    const statusText = DOM.loadStatus;
    
    if (!currentPegawai) {
        showToast('Error', 'Data pegawai tidak ditemukan.', 'error');
        setTimeout(() => goToPresensi(), 2000);
        return;
    }

    // Show loading
    if (overlay) overlay.style.display = 'flex';
    if (statusText) statusText.innerText = 'Memuat Profile Raport...';
    
    // Accessibility
    accessibility.announceLoading('Memuat data raport...');

    try {
        const pid = currentPegawai.ID || currentPegawai.id;
        const cacheKey = `dashboard_${pid}_${currentFilter}`;
        
        // Check cache
        const cached = cache.get(cacheKey);
        if (cached) {
            const data = cached.data;
            // Validate cached data
            const validation = dataConsistency.validate(data);
            if (validation.errors.length === 0) {
                statsData = data.stats;
                statsData.percentages = data.percentages || {};
                statsData.totalHariKerja = data.workingDays || 0;
                recordsData = data.records || [];
                holidays = data.holidays || [];
                
                renderAll();
                if (overlay) overlay.style.display = 'none';
                accessibility.announceLoaded('Data dimuat dari cache');
                return;
            }
            // Cache invalid, continue to fetch
        }

        // Fetch with retry
        const url = `${CONFIG.API_BASE}?action=getPegawaiStats&id=${encodeURIComponent(pid)}&period=${currentFilter}&cb=${Date.now()}`;
        
        const result = await network.request('getPegawaiStats', {
            id: pid,
            period: currentFilter
        }, {
            timeout: 30000
        });

        if (result.status === 'success') {
            // Validate and fix data
            const consistencyResult = dataConsistency.setData(result);
            const data = consistencyResult.data;

            statsData = data.stats || {};
            statsData.percentages = data.percentages || {};
            statsData.totalHariKerja = data.workingDays || 0;
            statsData.alpha = Math.max(0, statsData.alpha || 0);
            recordsData = data.records || [];
            holidays = data.holidays || [];
            
            // Cache the data
            cache.set(cacheKey, {
                data: { 
                    stats: statsData, 
                    percentages: statsData.percentages,
                    workingDays: statsData.totalHariKerja,
                    records: recordsData, 
                    holidays: holidays 
                }
            }, CONFIG.CACHE.TTL);
            
            renderAll();
            accessibility.announceLoaded('Data berhasil dimuat');
        } else {
            throw new Error(result.message || 'Gagal memuat data');
        }
        
        if (overlay) overlay.style.display = 'none';
        
    } catch (e) {
        console.error("❌ Load data error:", e);
        if (overlay) overlay.style.display = 'none';
        
        // Show error
        showToast('Error', 'Gagal memuat data: ' + e.message, 'error');
        accessibility.announce('Gagal memuat data: ' + e.message, 'assertive');
        
        // Try to use fallback data
        const fallback = localStorage.getItem('lastRaportData');
        if (fallback) {
            try {
                const data = JSON.parse(fallback);
                statsData = data.stats || {};
                statsData.percentages = data.percentages || {};
                statsData.totalHariKerja = data.workingDays || 0;
                recordsData = data.records || [];
                holidays = data.holidays || [];
                renderAll();
                showToast('Peringatan', 'Menggunakan data terakhir yang tersimpan', 'warning');
            } catch (e2) {
                console.error('Fallback data error:', e2);
            }
        }
    }
}

// ============================================================
// 12. RENDER ALL WITH PERFORMANCE OPTIMIZATION
// ============================================================
function renderAll() {
    // Use requestAnimationFrame for smooth rendering
    requestAnimationFrame(() => {
        renderProfile();
        renderTodayStatus();
        renderHistory();
        renderStats();
        renderSummaryStats();
    });
}

// ============================================================
// 13. RENDER HISTORY WITH VIRTUAL SCROLLING
// ============================================================
let virtualScroller = null;

function renderHistory() {
    const tbody = DOM.historyBody;
    if (!tbody) return;

    // Group records by date
    const grouped = recordsData.reduce((acc, r) => {
        const dateKey = r.date || (r.timestamp ? new Date(r.timestamp).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }) : null);
        if (!dateKey) return acc;
        if (!acc[dateKey]) acc[dateKey] = [];
        acc[dateKey].push(r);
        return acc;
    }, {});

    const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

    // Update history count
    updateHistoryCount(sortedDates.length);

    // Create items for virtual scroller
    const items = sortedDates.map(date => ({
        date,
        records: grouped[date],
        key: date
    }));

    // Clean up old virtual scroller
    if (virtualScroller) {
        virtualScroller.destroy();
        virtualScroller = null;
    }

    // Create new virtual scroller
    const container = tbody.parentElement;
    if (!container) return;

    // Clear existing table body content
    tbody.innerHTML = '';
    container.style.height = '400px'; // Set fixed height for scrolling

    virtualScroller = new VirtualScroller({
        container: container,
        items: items,
        itemHeight: CONFIG.VIRTUAL_SCROLL.ITEM_HEIGHT,
        renderItem: (item, index) => {
            return renderHistoryRow(item, index);
        },
        onEnd: () => {
            if (hasMoreData) {
                loadMoreHistory();
            }
        }
    });

    // If no data, show empty state
    if (items.length === 0 && currentPage === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align:center;padding:40px;opacity:0.5">
                    <i data-lucide="inbox" size="48" style="margin-bottom:12px"></i>
                    <p>Belum ada data presensi</p>
                </td>
            </tr>
        `;
        lucide.createIcons();
        return;
    }

    lucide.createIcons();
}

// ============================================================
// 14. RENDER HISTORY ROW
// ============================================================
function renderHistoryRow(item, index) {
    const { date, records } = item;
    const dateObj = new Date(date);
    const dateStr = dateObj.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    const dayName = dateObj.toLocaleDateString('id-ID', { weekday: 'long' });
    
    const nowD = new Date();
    const todayKey = nowD.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    const curMonth = todayKey.slice(0, 7);
    const rowMonth = date.slice(0, 7);
    
    let rowClass = '';
    if (date === todayKey) {
        rowClass = 'row-today';
    } else if (rowMonth === curMonth) {
        rowClass = 'row-current';
    } else {
        rowClass = 'row-past';
    }

    let masukTime = '-', pulangTime = '-';
    let totalNilai = 0;
    let statuses = [];

    records.forEach(r => {
        const status = (r.status || '').toLowerCase();
        totalNilai += parseInt(r.nilai) || 0;
        
        if (status.includes('hadir') || status.includes('terlambat') || status.includes('qr hadir')) {
            masukTime = r.time || r.waktu || '-';
        }
        if (status.includes('pulang') || status.includes('qr pulang')) {
            pulangTime = r.time || r.waktu || '-';
        }
        
        if (status.includes('izin')) {
            if (!statuses.includes('Izin')) statuses.push('Izin');
        } else if (status.includes('sakit')) {
            if (!statuses.includes('Sakit')) statuses.push('Sakit');
        } else if (status.includes('dinas')) {
            if (!statuses.includes('Dinas')) statuses.push('Dinas');
        } else if (status.includes('terlambat')) {
            if (!statuses.includes('Terlambat')) statuses.push('Terlambat');
        } else if (status.includes('hadir') || status.includes('qr')) {
            if (!statuses.includes('Hadir')) statuses.push('Hadir');
        }
    });

    let statusClass = 'alpha';
    let statusDisplay = 'Alpha';

    if (statuses.length > 1) {
        statusClass = 'multi-status';
        const displayStatuses = statuses.slice(0, 2);
        statusDisplay = displayStatuses.join(' + ');
        if (statuses.length > 2) statusDisplay += ' +';
    } else if (statuses.length === 1) {
        statusClass = statuses[0].toLowerCase();
        statusDisplay = statuses[0];
    }

    return `
        <tr class="${rowClass}" onclick="showDetail('${date}')" role="button" tabindex="0" 
            aria-label="Detail presensi tanggal ${dateStr}">
            <td>${dateStr}</td>
            <td>${dayName}</td>
            <td>${masukTime}</td>
            <td>${pulangTime}</td>
            <td style="font-weight:800;color:var(--sda-toska)">${totalNilai}</td>
            <td><span class="status-badge-table ${statusClass}">${statusDisplay}</span></td>
        </tr>
    `;
}

// ============================================================
// 15. UPDATE HISTORY COUNT
// ============================================================
function updateHistoryCount(total) {
    const el = DOM.historyCount;
    if (el) {
        const start = currentPage * CONFIG.PAGINATION.PAGE_SIZE + 1;
        const end = Math.min((currentPage + 1) * CONFIG.PAGINATION.PAGE_SIZE, total);
        if (total > 0) {
            el.innerText = `Menampilkan ${start}-${end} dari ${total} data`;
        } else {
            el.innerText = 'Belum ada data';
        }
    }
    
    const btn = DOM.btnLoadMore;
    if (btn) {
        const totalPages = Math.ceil(total / CONFIG.PAGINATION.PAGE_SIZE);
        const currentPageNum = currentPage + 1;
        if (hasMoreData && totalPages > 1 && currentPageNum < totalPages) {
            btn.style.display = 'flex';
            btn.innerHTML = '<i data-lucide="chevron-down" size="16"></i> Load More';
            accessibility.makeFocusable(btn, 'Muat lebih banyak data');
        } else {
            btn.style.display = 'none';
        }
        lucide.createIcons();
    }
}

// ============================================================
// 16. LOAD MORE WITH DEBOUNCE
// ============================================================
const loadMoreDebounce = debounce(() => {
    if (isLoadingMore || !hasMoreData) return;
    isLoadingMore = true;
    
    const btn = DOM.btnLoadMore;
    if (btn) {
        btn.innerHTML = '<i data-lucide="loader" size="16" style="animation:spin 0.8s linear infinite"></i> Loading...';
        btn.disabled = true;
        lucide.createIcons();
    }
    
    currentPage++;
    
    setTimeout(() => {
        renderHistory();
        isLoadingMore = false;
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="chevron-down" size="16"></i> Load More';
            lucide.createIcons();
        }
    }, 300);
}, 300);

function loadMoreHistory() {
    loadMoreDebounce();
}

// ============================================================
// 17. DEBOUNCE HELPER
// ============================================================
function debounce(fn, delay) {
    let timeoutId = null;
    return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
}

// ============================================================
// 18. RENDER PROFILE
// ============================================================
function renderProfile() {
    const p = currentPegawai;
    const placeholderImg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 280'%3E%3Crect width='200' height='280' fill='%232e446e' rx='20'/%3E%3Ccircle cx='100' cy='100' r='50' fill='%23ffffff' opacity='.15'/%3E%3C/svg%3E";
    
    const rawUrl = p.Link_Foto_Profile || '';
    let finalSrc = placeholderImg;
    if (rawUrl) {
        if (rawUrl.includes('drive.google.com') || rawUrl.includes('googleusercontent.com')) {
            let fileId = "";
            let match = rawUrl.match(/\/d\/([^\/\?]+)/);
            if (match && match[1]) fileId = match[1];
            if (!fileId) {
                match = rawUrl.match(/[?&]id=([^&]+)/);
                if (match && match[1]) fileId = match[1];
            }
            if (fileId) {
                finalSrc = `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;
            }
        } else {
            finalSrc = rawUrl;
        }
    }
    
    const img = DOM.profileAvatar;
    if (img) {
        img.onload = null;
        img.onerror = null;
        img.style.transition = 'opacity 0.4s ease';
        img.style.opacity = 0;
        img.src = finalSrc;
        img.alt = `Foto profil ${p.Nama || p.nama}`;
        img.onload = () => { img.style.opacity = 1; };
        img.onerror = () => {
            img.onerror = null;
            img.src = placeholderImg;
            img.alt = 'Foto profil tidak tersedia';
            img.style.opacity = 1;
        };
    }
    
    if (DOM.profileName) DOM.profileName.innerText = p.Nama || p.nama;
    if (DOM.profileJob) DOM.profileJob.innerHTML = `<i data-lucide="briefcase" size="14"></i> ${p.Jabatan || 'PPA'}`;
    if (DOM.profileWil) DOM.profileWil.innerHTML = `<i data-lucide="map-pin" size="14"></i> ${p.Wilayah || 'UPT'}`;
    if (DOM.sidebarLogo) DOM.sidebarLogo.src = GITHUB_LOGO_URL;
    
    lucide.createIcons();
}

// ============================================================
// 19. RENDER TODAY STATUS
// ============================================================
function renderTodayStatus() {
    const today = new Date();
    const todayStr = today.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    
    if (DOM.todayDate) {
        DOM.todayDate.innerText = today.toLocaleDateString('id-ID', { 
            day: 'numeric', month: 'long', year: 'numeric' 
        });
    }
    
    const todayRecords = recordsData.filter(r => {
        if (r.date) return r.date === todayStr;
        if (r.timestamp) {
            const d = new Date(r.timestamp);
            return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }) === todayStr;
        }
        return false;
    });
    
    let hadirTime = '--:--', pulangTime = '--:--';
    let hadirNilai = 0, pulangNilai = 0, specialNilai = 0;
    let hasHadir = false, hasPulang = false, hasSpecial = false;
    let specialType = '-';
    let totalPts = 0;
    
    todayRecords.forEach(r => {
        const status = (r.status || '').toLowerCase();
        const nilai = parseInt(r.nilai) || 0;
        totalPts += nilai;
        
        if (status.includes('izin') || status.includes('sakit') || status.includes('dinas')) {
            hasSpecial = true;
            specialType = status.charAt(0).toUpperCase() + status.slice(1);
            specialNilai = nilai;
        } else if (status.includes('hadir') || status.includes('terlambat') || status.includes('qr hadir')) {
            hasHadir = true;
            hadirTime = r.time || r.waktu || '--:--';
            hadirNilai = nilai;
        } else if (status.includes('pulang') || status.includes('qr pulang')) {
            hasPulang = true;
            pulangTime = r.time || r.waktu || '--:--';
            pulangNilai = nilai;
        }
    });
    
    if (DOM.todayHadir) {
        DOM.todayHadir.innerText = hadirTime;
        DOM.todayHadir.style.color = hasHadir ? 'var(--success)' : 'rgba(255,255,255,0.3)';
    }
    if (DOM.todayHadirPoint) DOM.todayHadirPoint.innerText = hadirNilai + ' pts';
    
    if (DOM.todayPulang) {
        DOM.todayPulang.innerText = pulangTime;
        DOM.todayPulang.style.color = hasPulang ? 'var(--pu-blue)' : 'rgba(255,255,255,0.3)';
    }
    if (DOM.todayPulangPoint) DOM.todayPulangPoint.innerText = pulangNilai + ' pts';
    
    if (DOM.todaySpecial) {
        DOM.todaySpecial.innerText = specialType;
        DOM.todaySpecial.style.color = hasSpecial ? '#a855f7' : 'rgba(255,255,255,0.3)';
    }
    if (DOM.todaySpecialPoint) DOM.todaySpecialPoint.innerText = specialNilai + ' pts';
    
    const totalCount = (hasHadir ? 1 : 0) + (hasPulang ? 1 : 0) + (hasSpecial ? 1 : 0);
    if (DOM.todayTotal) DOM.todayTotal.innerText = totalCount;
    if (DOM.todayTotalPoint) DOM.todayTotalPoint.innerText = totalPts + ' pts';
    
    lucide.createIcons();
}

// ============================================================
// 20. RENDER STATS
// ============================================================
function renderStats() {
    if (!statsData) return;
    
    const set = (el, v) => { if (el) el.textContent = v; };
    
    // Stats numbers
    set(DOM.statHadir, statsData.hadir || 0);
    set(DOM.statTerlambat, statsData.terlambat || 0);
    set(DOM.statIzin, statsData.izin || 0);
    set(DOM.statSakit, statsData.sakit || 0);
    set(DOM.statDinas, statsData.dinas || 0);
    set(DOM.statAlpha, Math.max(0, statsData.alpha || 0));
    
    // Percentages
    const pct = statsData.percentages || {};
    const setPct = (el, val) => {
        if (el) el.textContent = (val || '0.0') + '%';
    };
    setPct(DOM.statHadirPct, pct.hadir);
    setPct(DOM.statTerlambatPct, pct.terlambat);
    setPct(DOM.statIzinPct, pct.izin);
    setPct(DOM.statSakitPct, pct.sakit);
    setPct(DOM.statDinasPct, pct.dinas);
    setPct(DOM.statAlphaPct, pct.alpha);
    
    // Working days
    const workingDays = statsData.totalHariKerja || 0;
    if (DOM.totalWorkingDays) {
        DOM.totalWorkingDays.textContent = workingDays;
    }
    
    // Update hero stats
    updateHeroStats(statsData);
    
    // Bar chart
    const maxStat = Math.max(
        statsData.hadir || 0,
        statsData.terlambat || 0,
        statsData.izin || 0,
        statsData.sakit || 0,
        statsData.dinas || 0,
        Math.max(0, statsData.alpha || 0),
        1
    );
    
    requestAnimationFrame(() => {
        const bar = (el, val) => {
            if (el) el.style.width = ((val || 0) / maxStat * 100) + '%';
        };
        bar(DOM.barHadir, statsData.hadir);
        bar(DOM.barTerlambat, statsData.terlambat);
        bar(DOM.barIzin, statsData.izin);
        bar(DOM.barSakit, statsData.sakit);
        bar(DOM.barDinas, statsData.dinas);
        bar(DOM.barAlpha, Math.max(0, statsData.alpha || 0));
    });
}

// ============================================================
// 21. UPDATE HERO STATS
// ============================================================
function updateHeroStats(s) {
    const totalKehadiran = (s.hadir || 0) + 
                          (s.terlambat || 0) + 
                          (s.izin || 0) + 
                          (s.sakit || 0) + 
                          (s.dinas || 0);
    
    const alpha = Math.max(0, s.alpha || 0);
    const totalHariKerjaBulan = s.totalHariKerja || 0;
    
    if (DOM.totalKehadiranStats) {
        DOM.totalKehadiranStats.textContent = totalKehadiran;
    }
    if (DOM.totalAlphaStats) {
        DOM.totalAlphaStats.textContent = totalHariKerjaBulan;
    }
    
    if (DEBUG_MODE) {
        console.log('📊 Hero Stats Updated:');
        console.log('  Total Kehadiran:', totalKehadiran);
        console.log('  Hari Kerja (Bulan):', totalHariKerjaBulan);
        console.log('  Alpha (Stats Card):', alpha);
    }
}

// ============================================================
// 22. RENDER SUMMARY STATS
// ============================================================
function renderSummaryStats() {
    if (!statsData) return;
    
    const workingDays = statsData.totalHariKerja || 0;
    const totalNilai = statsData.totalNilai || 0;
    const maxPossibleScore = workingDays * 100;
    
    const persentase = maxPossibleScore > 0 
        ? Math.round((totalNilai / maxPossibleScore) * 100) 
        : 0;
    
    const totalKehadiran = (statsData.hadir || 0) + 
                          (statsData.terlambat || 0) + 
                          (statsData.izin || 0) + 
                          (statsData.sakit || 0) + 
                          (statsData.dinas || 0);
    
    if (DOM.totalKehadiran) DOM.totalKehadiran.textContent = totalKehadiran;
    if (DOM.totalNilai) DOM.totalNilai.textContent = totalNilai;
    if (DOM.persentaseKehadiran) DOM.persentaseKehadiran.textContent = persentase + '%';
    if (DOM.totalWorkingDays) DOM.totalWorkingDays.textContent = workingDays;
    
    updateHeroStats(statsData);
    
    if (DEBUG_MODE) {
        console.log('📊 Hero Summary:');
        console.log('  Working Days:', workingDays);
        console.log('  Total Nilai:', totalNilai);
        console.log('  Max Possible:', maxPossibleScore);
        console.log('  Persentase:', persentase + '%');
        console.log('  Total Kehadiran:', totalKehadiran);
        console.log('  Alpha:', statsData.alpha);
    }
}

// ============================================================
// 23. SHOW DETAIL WITH ACCESSIBILITY
// ============================================================
let focusTrap = null;

async function showDetail(date) {
    const card = DOM.detailCard;
    const content = DOM.detailContent;
    if (!card || !content) return;
    
    const cacheKey = `detail_${currentPegawai.ID}_${date}`;
    
    // Check cache
    const cached = cache.get(cacheKey);
    if (cached) {
        renderDetailContent(cached.data);
        card.style.display = 'block';
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        accessibility.announce('Detail presensi dimuat');
        
        // Create focus trap
        if (focusTrap) focusTrap.deactivate();
        focusTrap = accessibility.createFocusTrap(card);
        focusTrap.activate();
        return;
    }
    
    content.innerHTML = '<p style="text-align:center;opacity:0.5">Memuat detail...</p>';
    card.style.display = 'block';
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    accessibility.announceLoading('Memuat detail presensi');
    
    try {
        const result = await network.request('getPresensiDetail', {
            id: currentPegawai.ID,
            date: date
        });
        
        if (result.status === 'success') {
            cache.set(cacheKey, result, CONFIG.CACHE.DETAIL_TTL);
            renderDetailContent(result);
            accessibility.announceLoaded('Detail presensi selesai dimuat');
            
            // Create focus trap
            if (focusTrap) focusTrap.deactivate();
            focusTrap = accessibility.createFocusTrap(card);
            focusTrap.activate();
        } else {
            content.innerHTML = `<p style="color:var(--danger)">${result.message}</p>`;
            accessibility.announce('Gagal memuat detail: ' + result.message, 'assertive');
        }
    } catch (e) {
        console.error('❌ Detail error:', e);
        content.innerHTML = `<p style="color:var(--danger)">Gagal memuat detail: ${e.message}</p>`;
        accessibility.announce('Gagal memuat detail: ' + e.message, 'assertive');
    }
}

// ============================================================
// 24. RENDER DETAIL CONTENT
// ============================================================
function renderDetailContent(data) {
    const content = DOM.detailContent;
    const records = data.records || [];
    
    const hadirRecord = records.find(r => {
        const s = (r.status || '').toLowerCase();
        return s.includes('hadir') || s.includes('terlambat') || s.includes('qr hadir');
    });
    
    const pulangRecord = records.find(r => {
        const s = (r.status || '').toLowerCase();
        return s.includes('pulang') || s.includes('qr pulang');
    });
    
    const specialRecord = records.find(r => {
        const s = (r.status || '').toLowerCase();
        return s.includes('izin') || s.includes('sakit') || s.includes('dinas');
    });
    
    let html = `<h4 style="margin-bottom:16px;color:var(--sda-toska)">📅 ${formatDateIndo(data.date)}</h4>`;
    
    if (hadirRecord) html += renderDetailSection('☀️ Absen Hadir', hadirRecord, 'hadir');
    if (pulangRecord) html += renderDetailSection('🌙 Absen Pulang', pulangRecord, 'pulang');
    if (specialRecord) html += renderDetailSection('📋 Status Khusus', specialRecord, 'special');
    
    if (!hadirRecord && !pulangRecord && !specialRecord) {
        html += '<p style="text-align:center;opacity:0.5">Tidak ada data presensi</p>';
    }
    
    html += `
        <div style="text-align:center;margin-top:20px">
            <button class="btn-close-detail" onclick="closeDetail()" 
                    aria-label="Tutup detail presensi">
                <i data-lucide="x" size="20"></i>
            </button>
        </div>
    `;
    
    content.innerHTML = html;
    lucide.createIcons();
    
    // Make interactive elements focusable
    content.querySelectorAll('button, [onclick]').forEach(el => {
        accessibility.makeFocusable(el);
    });
}

// ============================================================
// 25. RENDER DETAIL SECTION
// ============================================================
function renderDetailSection(title, record, type) {
    const colors = {
        hadir: 'var(--success)',
        pulang: 'var(--pu-blue)',
        special: '#a855f7'
    };
    
    const escapeHtml = (str) => {
        if (!str) return '-';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    };
    
    const status = escapeHtml(record.status);
    const keterangan = escapeHtml(record.keterangan || '-');
    const gps = escapeHtml(record.gps || '-');
    const nilai = record.nilai || 0;
    const time = record.time || '--:--';
    
    let html = `
    <div style="margin-bottom:20px;padding:16px;background:linear-gradient(135deg,rgba(30,64,175,0.92),rgba(15,23,42,0.95));border-radius:16px;border-left:4px solid ${colors[type]};box-shadow:0 8px 24px rgba(30,64,175,0.35)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <h5 style="font-size:0.9rem;font-weight:800;color:#ffffff;margin:0">${title}</h5>
            <span style="font-family:'JetBrains Mono',monospace;font-size:0.85rem;color:${colors[type]};font-weight:800">
                ${time}
            </span>
        </div>
        
        <div class="detail-row">
            <div class="detail-label">Status</div>
            <div class="detail-value">${status}</div>
        </div>
        
        <div class="detail-row">
            <div class="detail-label">Nilai</div>
            <div class="detail-value" style="color:${colors[type]};font-weight:800">${nilai} pts</div>
        </div>
        
        <div class="detail-row">
            <div class="detail-label">Keterangan</div>
            <div class="detail-value">${keterangan}</div>
        </div>
        
        ${gps && gps !== '-' ? `
        <div class="detail-row">
            <div class="detail-label">GPS</div>
            <div class="detail-value" style="font-family:'JetBrains Mono',monospace;font-size:0.75rem;background:rgba(0,0,0,0.25);padding:6px 10px;border-radius:8px;border:1px solid rgba(96,165,250,0.2)">
                ${gps}
            </div>
        </div>` : ''}
        
        <div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:12px">`;
    
    if (record.foto_selfie && record.foto_selfie !== '-') {
        html += `
        <div>
            <div style="font-size:0.7rem;font-weight:700;opacity:0.6;margin-bottom:6px;text-transform:uppercase;color:rgba(255,255,255,0.7)">
                Foto Selfie
            </div>
            <img src="${record.foto_selfie}" 
                 alt="Foto selfie presensi" 
                 loading="lazy"
                 style="width:100%;border-radius:12px;cursor:pointer;border:2px solid rgba(96,165,250,0.4)"
                 onclick="openImageModal('${record.foto_selfie}')"
                 onerror="this.style.display='none'">
        </div>`;
    }
    
    if (record.foto_kerja && record.foto_kerja !== '-') {
        html += `
        <div>
            <div style="font-size:0.7rem;font-weight:700;opacity:0.6;margin-bottom:6px;text-transform:uppercase;color:rgba(255,255,255,0.7)">
                Foto Kerja
            </div>
            <img src="${record.foto_kerja}" 
                 alt="Foto aktivitas kerja" 
                 loading="lazy"
                 style="width:100%;border-radius:12px;cursor:pointer;border:2px solid rgba(96,165,250,0.4)"
                 onclick="openImageModal('${record.foto_kerja}')"
                 onerror="this.style.display='none'">
        </div>`;
    }
    
    html += `</div></div>`;
    return html;
}

// ============================================================
// 26. CLOSE DETAIL
// ============================================================
function closeDetail() {
    const card = DOM.detailCard;
    if (card) {
        card.style.display = 'none';
        // Deactivate focus trap
        if (focusTrap) {
            focusTrap.deactivate();
            focusTrap = null;
        }
        // Restore focus
        accessibility.restoreFocus();
        accessibility.announce('Detail ditutup');
    }
}

// ============================================================
// 27. IMAGE MODAL
// ============================================================
function openImageModal(url) {
    // Add ARIA attributes
    const modal = document.createElement('div');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Tampilan gambar');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:300000;display:flex;align-items:center;justify-content:center;cursor:zoom-out;padding:20px';
    modal.onclick = () => {
        modal.remove();
        accessibility.announce('Gambar ditutup');
    };
    
    // Keyboard support
    modal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            modal.remove();
            accessibility.announce('Gambar ditutup');
        }
    });
    
    const img = document.createElement('img');
    img.src = url;
    img.alt = 'Gambar presensi';
    img.style.cssText = 'max-width:90%;max-height:90%;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.8);';
    img.loading = 'lazy';
    
    modal.appendChild(img);
    document.body.appendChild(modal);
    
    // Focus modal
    setTimeout(() => modal.focus(), 100);
    accessibility.announce('Gambar dibuka');
}

// ============================================================
// 28. UTILITY FUNCTIONS
// ============================================================
function formatDateIndo(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('id-ID', { 
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' 
    });
}

function getPegawaiFromURL() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    
    if (id) {
        currentPegawai = {
            ID: id,
            Nama: params.get('nama') || 'Pegawai',
            Jabatan: params.get('jabatan') || 'PPA',
            Wilayah: params.get('wilayah') || 'UPT',
            Link_Foto_Profile: params.get('foto') || ''
        };
        
        const status = params.get('status');
        const msg = params.get('msg');
        if (status === 'success' && msg) {
            showSuccessToast(msg);
        }
        
        return true;
    }
    return false;
}

function goBack() {
    sessionStorage.setItem('return_from_profile', 'true');
    window.location.href = 'presensi.html';
}

function goToPresensi() {
    sessionStorage.setItem('return_from_profile', 'true');
    window.location.href = 'presensi.html';
}

// ============================================================
// 29. TOAST NOTIFICATIONS
// ============================================================
function showSuccessToast(message) {
    const toast = document.getElementById('successToast');
    const msgEl = document.getElementById('toastMessage');
    if (toast && msgEl) {
        msgEl.innerText = message;
        toast.style.display = 'flex';
        accessibility.announce(message);
        setTimeout(() => closeToast(), 5000);
    }
}

function closeToast() {
    const toast = document.getElementById('successToast');
    if (toast) toast.style.display = 'none';
}

function showToast(title, message, type = "info") {
    const modal = DOM.notificationModal;
    const content = DOM.notifContent;
    const iconEl = document.getElementById('notifIcon');
    const titleEl = document.getElementById('notifTitle');
    const msgEl = document.getElementById('notifMessage');
    const btnOk = document.getElementById('btnNotifOk');
    
    if (!modal || !content) return;

    content.className = 'notif-modal-content';
    content.classList.add(`notif-${type}`);
    titleEl.innerText = title;
    msgEl.innerText = message;
    btnOk.innerHTML = '<i data-lucide="check" size="18"></i> Mengerti';
    
    const icons = { success: 'check-circle', error: 'x-circle', warning: 'alert-triangle', info: 'info' };
    iconEl.setAttribute('data-lucide', icons[type] || 'info');
    lucide.createIcons();

    modal.style.display = 'flex';
    requestAnimationFrame(() => { modal.classList.add('show'); });
    
    // Accessibility
    modal.setAttribute('role', 'alertdialog');
    modal.setAttribute('aria-label', title);
    modal.setAttribute('aria-describedby', 'notifMessage');
    accessibility.announce(`${title}: ${message}`, 'assertive');
    
    // Focus trap
    const trap = accessibility.createFocusTrap(modal);
    trap.activate();

    btnOk.onclick = () => {
        modal.classList.remove('show');
        trap.deactivate();
        setTimeout(() => { modal.style.display = 'none'; }, 300);
        // Restore focus
        accessibility.restoreFocus();
    };
    
    // Keyboard support
    modal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            btnOk.click();
        }
    });
}

// ============================================================
// 30. FILTER FUNCTIONS
// ============================================================
function setFilter(period) {
    currentFilter = period;
    currentPage = 0;
    document.querySelectorAll('.btn-filter').forEach(btn => btn.classList.remove('active'));
    
    let filterId = '';
    if (period === 'all') filterId = 'filterAll';
    else if (period === '7') filterId = 'filter7';
    else if (period === '30') filterId = 'filter30';
    else if (period === 'month') filterId = 'filterMonth';
    
    const filterBtn = document.getElementById(filterId);
    if (filterBtn) filterBtn.classList.add('active');
    
    cache.clear();
    loadData();
    
    accessibility.announce(`Filter diubah: ${period}`);
}

// ============================================================
// 31. MONTH SELECTOR
// ============================================================
function initStatsMonthSelect() {
    const sel = document.getElementById('statsMonthSelect');
    if (!sel) return;
    
    const now = new Date();
    let html = '';
    for (let i = 0; i < 6; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const val = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        const label = d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
        html += `<option value="${val}" ${i === 0 ? 'selected' : ''}>${i === 0 ? '📅 ' : ''}${label}</option>`;
    }
    sel.innerHTML = html;
    
    // Make it accessible
    accessibility.makeFocusable(sel, 'Pilih bulan statistik');
}

// ============================================================
// 32. LOAD STATS FOR MONTH
// ============================================================
async function onStatsMonthChange(monthStr) {
    if (!currentPegawai) return;
    await loadStatsForMonth(monthStr);
}

async function loadStatsForMonth(monthStr) {
    if (!currentPegawai) return;
    
    const pid = currentPegawai.ID || currentPegawai.id;
    const cacheKey = `stats_${pid}_${monthStr}`;
    
    // Check cache
    const cached = cache.get(cacheKey);
    if (cached) {
        updateStatsUI(cached);
        updateHeroStats(cached);
        accessibility.announce('Statistik bulan dimuat dari cache');
        return;
    }
    
    try {
        accessibility.announceLoading('Memuat statistik bulan');
        
        const result = await network.request('getPegawaiStats', {
            id: pid,
            month: monthStr
        });
        
        if (result.status !== 'success') {
            throw new Error(result.message || 'Gagal memuat statistik');
        }
        
        const s = result.stats || {};
        const p = result.percentages || {};
        s.alpha = Math.max(0, s.alpha || 0);
        s.percentages = p;
        s.totalHariKerja = result.workingDays || 0;
        
        // Validate and fix data
        const consistencyResult = dataConsistency.setData({
            stats: s,
            percentages: p,
            workingDays: result.workingDays || 0
        });
        
        cache.set(cacheKey, consistencyResult.data.stats, CONFIG.CACHE.TTL);
        updateStatsUI(consistencyResult.data.stats);
        updateHeroStats(consistencyResult.data.stats);
        
        const [y, m] = monthStr.split('-').map(Number);
        const label = new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
        const title = DOM.statsTitleText;
        if (title) title.textContent = 'Statistik ' + label;
        
        accessibility.announceLoaded(`Statistik ${label} dimuat`);
        
    } catch (e) {
        console.warn('⚠️ Gagal load statistik bulan:', e);
        showToast('Error', 'Gagal memuat statistik: ' + e.message, 'error');
        accessibility.announce('Gagal memuat statistik: ' + e.message, 'assertive');
    }
}

// ============================================================
// 33. UPDATE STATS UI
// ============================================================
function updateStatsUI(s) {
    const set = (el, v) => { if (el) el.textContent = v; };
    
    set(DOM.statHadir, s.hadir || 0);
    set(DOM.statTerlambat, s.terlambat || 0);
    set(DOM.statIzin, s.izin || 0);
    set(DOM.statSakit, s.sakit || 0);
    set(DOM.statDinas, s.dinas || 0);
    set(DOM.statAlpha, s.alpha || 0);
    
    const pct = s.percentages || {};
    const setPct = (el, val) => {
        if (el) el.textContent = (val || '0.0') + '%';
    };
    setPct(DOM.statHadirPct, pct.hadir);
    setPct(DOM.statTerlambatPct, pct.terlambat);
    setPct(DOM.statIzinPct, pct.izin);
    setPct(DOM.statSakitPct, pct.sakit);
    setPct(DOM.statDinasPct, pct.dinas);
    setPct(DOM.statAlphaPct, pct.alpha);

    const max = Math.max(
        s.hadir || 0,
        s.terlambat || 0,
        s.izin || 0,
        s.sakit || 0,
        s.dinas || 0,
        s.alpha || 0,
        1
    );
    
    const bar = (el, v) => {
        if (el) el.style.width = ((v || 0) / max * 100) + '%';
    };
    bar(DOM.barHadir, s.hadir);
    bar(DOM.barTerlambat, s.terlambat);
    bar(DOM.barIzin, s.izin);
    bar(DOM.barSakit, s.sakit);
    bar(DOM.barDinas, s.dinas);
    bar(DOM.barAlpha, s.alpha);
}

// ============================================================
// 34. CLOCK
// ============================================================
function updateClock() {
    const now = new Date();
    const jakartaStr = now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' });
    const jakartaDate = new Date(jakartaStr);
    const timeStr = jakartaDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
    const clockEl = DOM.liveClock;
    if (clockEl) {
        clockEl.textContent = timeStr;
        clockEl.setAttribute('aria-label', `Waktu saat ini: ${timeStr} WIB`);
    }
}

// ============================================================
// 35. INITIALIZATION
// ============================================================
const GITHUB_LOGO_URL = "https://raw.githubusercontent.com/tpopbwi/presensi-pusda/main/assets/logo.png";
const DEBUG_MODE = false;

window.onload = async () => {
    // Initialize systems
    initDOM();
    accessibility.init();
    lucide.createIcons();
    
    // Get pegawai data
    const hasParam = getPegawaiFromURL();
    
    if (!hasParam) {
        const saved = sessionStorage.getItem('profile_pegawai');
        if (saved) {
            try {
                currentPegawai = JSON.parse(saved);
            } catch(e) {}
        }
    }
    
    if (!currentPegawai) {
        showToast('Peringatan', 'Data pegawai tidak ditemukan.', 'warning');
        setTimeout(() => goToPresensi(), 2000);
        return;
    }
    
    // Save to session
    sessionStorage.setItem('profile_pegawai', JSON.stringify(currentPegawai));
    
    // Initialize month selector
    initStatsMonthSelect();
    
    // Load data
    await loadData();
    
    // Load current month stats
    const now = new Date();
    const currentMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    await loadStatsForMonth(currentMonth);
    
    // Start clock
    setInterval(updateClock, 1000);
    updateClock();
    
    // Register keyboard shortcuts
    accessibility.registerShortcut('b', 'Kembali', () => goBack());
    accessibility.registerShortcut('f', 'Filter Bulan Ini', () => setFilter('month'));
    accessibility.registerShortcut('r', 'Refresh Data', () => loadData());
    accessibility.registerShortcut('Escape', 'Tutup Detail', () => closeDetail());
    
    // Service Worker
    try {
        if ('serviceWorker' in navigator) {
            const protocol = window.location.protocol;
            const isSecure = protocol === 'https:' ||
                (protocol === 'http:' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'));
            if (isSecure) {
                navigator.serviceWorker.register('sw.js').catch(() => {});
            }
        }
    } catch (e) {}
    
    // Cleanup on beforeunload
    window.addEventListener('beforeunload', () => {
        cache.clear();
        if (virtualScroller) {
            virtualScroller.destroy();
            virtualScroller = null;
        }
        network.abortAll();
    });
    
    if (DEBUG_MODE) {
        console.log('✅ Profile Raport v5.0.0 loaded');
        console.log('📊 Stats:', statsData);
        console.log('📊 Records:', recordsData.length);
        console.log('📊 Accessibility Report:', accessibility.getReport());
        console.log('📊 Cache Stats:', cache.getStats());
        console.log('📊 Network Stats:', network.getStats());
        console.log('📊 Data Quality:', dataConsistency.getQualityReport());
    }
};

// ============================================================
// EXPOSE FUNCTIONS TO GLOBAL SCOPE
// ============================================================
window.setFilter = setFilter;
window.loadData = loadData;
window.showDetail = showDetail;
window.closeDetail = closeDetail;
window.openImageModal = openImageModal;
window.goBack = goBack;
window.goToPresensi = goToPresensi;
window.loadMoreHistory = loadMoreHistory;
window.onStatsMonthChange = onStatsMonthChange;
window.showToast = showToast;
window.closeToast = closeToast;

// ============================================================
// END OF PROFILE_RAPORT.JS v5.0.0
// ============================================================
