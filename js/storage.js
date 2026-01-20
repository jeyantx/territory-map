/**
 * Storage Module
 * 
 * Provides a Firebase-ready storage interface.
 * Stores all data as a single JSON object in Firestore.
 */

const STORAGE_KEY = 'territory_data';
const STORAGE_VERSION = '1.0';
const COLLECTION_NAME = 'territory_data_v2';
const DOCUMENT_ID = 'all_data_json';

class TerritoryStorage {
    constructor() {
        this.useFirebase = true; // Enabled by default now
        this.firebaseConfig = {
            apiKey: "AIzaSyCZyDDl4qlUAJ4COtJRSd6d5_pWA-I-G_E",
            authDomain: "todo-5fcdf.firebaseapp.com",
            projectId: "todo-5fcdf",
            storageBucket: "todo-5fcdf.firebasestorage.app",
            messagingSenderId: "493348371854",
            appId: "1:493348371854:web:0d09953c5881d3d0e4f8df"
        };
        this.db = null;
        this.cache = null;
        this.extractedRegions = {
            extractedRegions: [],
            congregationBoundary: null,
            imageWidth: 14032,
            imageHeight: 9920,
            sourceImage: ""
        };
        this.isInitialized = false;
    }

    /**
     * Initialize storage
     */
    async init() {
        if (this.isInitialized) return;

        try {
            await this.initFirebase();
            await this.loadData();
            this.isInitialized = true;
        } catch (error) {
            console.error('Failed to initialize storage:', error);
            throw error; // Let app handle the failure
        }
    }

    /**
     * Initialize Firebase using compat SDK
     */
    async initFirebase() {
        if (typeof firebase === 'undefined') {
            console.warn('Firebase SDK not loaded. Falling back to local storage.');
            this.useFirebase = false;
            return;
        }

        if (!firebase.apps.length) {
            firebase.initializeApp(this.firebaseConfig);
        }
        this.db = firebase.firestore();
    }

    /**
     * Load data from Firebase or LocalStorage fallback
     */
    async loadData() {
        if (this.useFirebase && this.db) {
            try {
                const doc = await this.db.collection(COLLECTION_NAME).doc(DOCUMENT_ID).get();
                if (doc.exists) {
                    const data = doc.data();
                    let parsedData = data;

                    // Handle stringified data if present
                    if (data.data_json && typeof data.data_json === 'string') {
                        try {
                            parsedData = JSON.parse(data.data_json);
                        } catch (e) {
                            console.error('Failed to parse data_json:', e);
                        }
                    }

                    // Map to cache and map regions data
                    const rawCache = parsedData.territoryData || parsedData.cache || (Array.isArray(parsedData) ? parsedData : null);
                    this.cache = this._normalizeData(rawCache);

                    // Consolidate map metadata into extractedRegions object
                    this.extractedRegions = this._normalizeMapData(parsedData);

                    console.log('Loaded data from Firebase');
                    return this.cache;
                }
            } catch (error) {
                console.error('Failed to load from Firebase:', error);
                throw error;
            }
        }

        // Fallback to local files only if Firebase is not yet configured or explicitly disabled
        return this.loadFromFiles();
    }

    /**
     * Load data from local JSON files
     */
    async loadFromFiles() {
        try {
            console.log('Loading data from local files...');
            const territoryResponse = await fetch('data/territories.json');
            const rawData = await territoryResponse.json();
            this.cache = this._normalizeData(rawData);

            // Try different local file names as fallback
            const regionsToTry = [
                'data/extracted_regions.json',
                'data/extracted_regions-check if load from firebase.json'
            ];

            for (const file of regionsToTry) {
                try {
                    const regionsResponse = await fetch(file);
                    if (regionsResponse.ok) {
                        const rawRegionsData = await regionsResponse.json();
                        this.extractedRegions = this._normalizeMapData(rawRegionsData);
                        break;
                    }
                } catch (e) { }
            }

            await this.save(); // Initial save to firebase
            return this.cache;
        } catch (error) {
            console.error('Failed to load local files:', error);
            throw error;
        }
    }

    /**
     * Save data to Firebase
     */
    async save() {
        if (this.useFirebase && this.db) {
            try {
                const dataToSave = {
                    territoryData: this.cache,
                    ...this.extractedRegions, // Flatten metadata into top-level keys
                    version: STORAGE_VERSION,
                    lastUpdated: new Date().toISOString()
                };

                await this.db.collection(COLLECTION_NAME).doc(DOCUMENT_ID).set({
                    data_json: JSON.stringify(dataToSave),
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                });
                console.log('Saved data to Firebase');
            } catch (error) {
                console.error('Failed to save to Firebase:', error);
                throw error;
            }
        }
    }

    /**
     * Save complete data object directly
     */
    async saveData(data) {
        if (data.territories) this.cache = this._normalizeData(data);
        if (data.extractedRegions) this.extractedRegions = this._normalizeMapData(data);

        await this.save();
    }

    /**
     * Normalize map regions data and its metadata
     */
    _normalizeMapData(data) {
        if (!data) {
            return {
                extractedRegions: [],
                congregationBoundary: null,
                imageWidth: 14032,
                imageHeight: 9920,
                sourceImage: ""
            };
        }

        // If it's already the consolidated object
        if (data.extractedRegions && Array.isArray(data.extractedRegions)) {
            return {
                extractedRegions: data.extractedRegions,
                congregationBoundary: data.congregationBoundary || null,
                imageWidth: data.imageWidth || 14032,
                imageHeight: data.imageHeight || 9920,
                sourceImage: data.sourceImage || ""
            };
        }

        // If it's just the regions array
        if (Array.isArray(data)) {
            return {
                extractedRegions: data,
                congregationBoundary: null,
                imageWidth: 14032,
                imageHeight: 9920,
                sourceImage: ""
            };
        }

        // Fallback or handles object with missing pieces
        return {
            extractedRegions: data.extractedRegions || [],
            congregationBoundary: data.congregationBoundary || null,
            imageWidth: data.imageWidth || 14032,
            imageHeight: data.imageHeight || 9920,
            sourceImage: data.sourceImage || ""
        };
    }

    /**
     * Get all territory data
     */
    async getData() {
        if (!this.cache) await this.loadData();
        return this._normalizeData(this.cache);
    }

    /**
     * Normalize data to ensure it always has the expected object structure
     * @param {Object|Array} data - Data to normalize
     * @returns {Object} Normalized object with territories, groups, and metadata
     */
    _normalizeData(data) {
        if (!data) return { territories: [], groups: [], metadata: {} };

        // If it's the full expected object
        if (data.territories && Array.isArray(data.territories)) {
            return {
                territories: data.territories,
                groups: data.groups || [],
                metadata: data.metadata || {}
            };
        }

        // If it's just the territories array
        if (Array.isArray(data)) {
            return {
                territories: data,
                groups: [],
                metadata: {}
            };
        }

        // Handle case where it might be wrapped in another property
        if (data.territoryData) return this._normalizeData(data.territoryData);
        if (data.cache) return this._normalizeData(data.cache);

        return { territories: [], groups: [], metadata: {} };
    }

    /**
     * Import data from a File or JSON object
     */
    async importData(source) {
        let importedData;

        try {
            if (source instanceof File) {
                const text = await source.text();
                importedData = JSON.parse(text);
            } else {
                importedData = source;
            }

            if (!importedData) throw new Error('Invalid import data source');

            // Check if it's the sync export format {territoryData, ...mapMetadata}
            if (importedData.territoryData || importedData.extractedRegions) {
                this.cache = this._normalizeData(importedData.territoryData || importedData);
                this.extractedRegions = this._normalizeMapData(importedData);
            } else {
                // Direct data import
                this.cache = this._normalizeData(importedData);
            }

            await this.save();
            return this.cache;
        } catch (error) {
            console.error('Import failed:', error);
            throw error;
        }
    }

    /**
     * Get extracted regions
     */
    getExtractedRegions() {
        return this.extractedRegions;
    }

    /**
     * Save extracted regions
     */
    async saveExtractedRegions(data) {
        this.extractedRegions = data;
        await this.save();
    }

    /**
     * Get all territories
     */
    async getTerritories() {
        const data = await this.getData();
        return data.territories;
    }

    /**
     * Update a territory
     */
    async updateTerritory(id, updates) {
        const data = await this.getData();
        const index = data.territories.findIndex(t => t.id === id);

        if (index === -1) throw new Error(`Territory ${id} not found`);

        data.territories[index] = { ...data.territories[index], ...updates };
        this.cache = data;
        await this.save();
        return data.territories[index];
    }

    /**
     * Add a new territory
     */
    async addTerritory(territory) {
        const data = await this.getData();
        const maxId = data.territories.reduce((max, t) => Math.max(max, t.id), 0);
        const newTerritory = {
            ...territory,
            id: territory.id || (maxId + 1),
            assignments: territory.assignments || [],
            polygon: territory.polygon || [],
            description: territory.description || ''
        };

        data.territories.push(newTerritory);
        this.cache = data;
        await this.save();
        return newTerritory;
    }

    /**
     * Delete a territory
     */
    async deleteTerritory(id) {
        const data = await this.getData();
        const index = data.territories.findIndex(t => t.id === id);
        if (index === -1) return;

        data.territories.splice(index, 1);
        this.cache = data;
        await this.save();
    }

    /**
     * Add assignment
     */
    async addAssignment(id, assignment) {
        const data = await this.getData();
        const t = data.territories.find(t => t.id === id);
        if (!t) return;

        const assignments = t.assignments || [];
        assignments.push({ ...assignment, id: Date.now() });
        return this.updateTerritory(id, { assignments });
    }

    /**
     * Update assignment
     */
    async updateAssignment(territoryId, assignmentId, updates) {
        const data = await this.getData();
        const t = data.territories.find(t => t.id === territoryId);
        if (!t) return;

        const assignments = t.assignments || [];
        const idx = assignments.findIndex(a => a.id === assignmentId);
        if (idx === -1) return;

        assignments[idx] = { ...assignments[idx], ...updates };
        return this.updateTerritory(territoryId, { assignments });
    }

    /**
     * Delete assignment
     */
    async deleteAssignment(territoryId, assignmentId) {
        const data = await this.getData();
        const t = data.territories.find(t => t.id === territoryId);
        if (!t) return;

        const assignments = t.assignments || [];
        const idx = assignments.findIndex(a => a.id === assignmentId);
        if (idx === -1) return;

        assignments.splice(idx, 1);
        return this.updateTerritory(territoryId, { assignments });
    }

    /**
     * Export all data as JSON
     */
    async exportData() {
        const data = {
            territoryData: this.cache,
            ...this.extractedRegions // Include all map metadata
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `territory_data_sync_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// Export singleton instance
const storage = new TerritoryStorage();
