/**
 * Data Module
 * 
 * Handles territory data management, filtering, and searching.
 */

class TerritoryData {
    constructor() {
        this.territories = [];
        this.groups = [];
        this.metadata = null;
        this.listeners = [];
        this.extractedRegions = [];
        this.congregationBoundary = null;
        this.regionImageWidth = 14032;
        this.regionImageHeight = 9920;

        // Map of regionId -> territoryId for assignments
        this.regionAssignments = {};
    }

    /**
     * Initialize data from storage
     */
    async init() {
        try {
            let data = await storage.getData();

            // Handle legacy or corrupted format where data is just the array
            if (Array.isArray(data)) {
                console.warn('Data loaded as array, wrapping into object structure');
                data = {
                    territories: data,
                    groups: [],
                    metadata: {}
                };
            }

            this.territories = data.territories || [];

            // Migration: Groups and groupId mapping
            this.groups = data.groups || [];
            this.groups.forEach((g, idx) => {
                if (g.id === undefined) g.id = idx + 1;
            });

            this.territories = data.territories || [];
            this.territories.forEach(t => {
                // Ensure number field
                if (t.number === undefined) {
                    t.number = (t.id || "").toString();
                }

                // Map legacy group name to groupId
                if (t.groupId === undefined && t.group) {
                    const group = this.groups.find(g => g.name === t.group);
                    if (group) {
                        t.groupId = group.id;
                    }
                }
            });

            this.metadata = data.metadata || {};

            // Load extracted regions
            const extractedData = storage.getExtractedRegions();
            if (extractedData) {
                this.extractedRegions = extractedData.extractedRegions || [];
                this.congregationBoundary = extractedData.congregationBoundary || null;
                this.regionImageWidth = extractedData.imageWidth || 14032;
                this.regionImageHeight = extractedData.imageHeight || 9920;

                // Add an ID to each extracted region and check for assignments
                this.extractedRegions = this.extractedRegions.map((region, index) => {
                    const regionId = region.regionId || (index + 1);
                    return {
                        ...region,
                        regionId: regionId,
                        assignedTerritoryId: region.assignedTerritoryId || null
                    };
                });

                // Build assignment map from existing territory polygons
                this.buildAssignmentMap();
            }

            this.notifyListeners('init');
            return true;
        } catch (error) {
            console.error('Failed to initialize data:', error);
            throw error;
        }
    }

    /**
     * Build assignment map from territory data
     * Territories that have polygons are considered assigned
     */
    buildAssignmentMap() {
        this.regionAssignments = {};

        // Check each territory for a polygon match
        this.territories.forEach(territory => {
            if (territory.polygon && territory.polygon.length > 0) {
                // Try to find matching region
                const matchingRegion = this.extractedRegions.find(region =>
                    this.polygonsMatch(region.polygon, territory.polygon)
                );
                if (matchingRegion) {
                    this.regionAssignments[matchingRegion.regionId] = territory.id;
                    matchingRegion.assignedTerritoryId = territory.id;
                }
            }
        });
    }

    /**
     * Check if two polygons are approximately the same
     */
    polygonsMatch(poly1, poly2) {
        if (!poly1 || !poly2 || poly1.length !== poly2.length) return false;
        // Simple check: compare first few points
        for (let i = 0; i < Math.min(3, poly1.length); i++) {
            if (Math.abs(poly1[i][0] - poly2[i][0]) > 10 ||
                Math.abs(poly1[i][1] - poly2[i][1]) > 10) {
                return false;
            }
        }
        return true;
    }

    /**
     * Add a data change listener
     * @param {Function} callback - Callback function
     */
    addListener(callback) {
        this.listeners.push(callback);
    }

    /**
     * Remove a data change listener
     * @param {Function} callback - Callback function
     */
    removeListener(callback) {
        this.listeners = this.listeners.filter(l => l !== callback);
    }

    /**
     * Notify all listeners of a change
     * @param {string} event - Event type
     * @param {*} data - Event data
     */
    notifyListeners(event, data = null) {
        this.listeners.forEach(callback => {
            try {
                callback(event, data);
            } catch (error) {
                console.error('Listener error:', error);
            }
        });
    }

    /**
     * Get all territories
     */
    getAllTerritories() {
        return [...this.territories];
    }

    /**
     * Get territory by ID
     * @param {number} id - Territory ID
     */
    getTerritory(id) {
        return this.territories.find(t => t.id === id);
    }

    /**
     * Get territories by group ID
     * @param {number|string} groupId - Group ID or 'all'
     */
    getTerritoriesByGroup(groupId) {
        if (groupId === 'all') {
            return this.getAllTerritories();
        }
        return this.territories.filter(t => t.groupId == groupId);
    }

    /**
     * Search territories by name or number
     * @param {string} query - Search query
     */
    searchTerritories(query) {
        if (!query || query.trim() === '') {
            return this.getAllTerritories();
        }

        const lowerQuery = query.toLowerCase().trim();

        return this.territories.filter(t => {
            // Search by number (displayed number)
            if (t.number && t.number.toString().includes(lowerQuery)) {
                return true;
            }
            // Fallback to searching by ID if number not present
            if (t.id.toString().includes(lowerQuery)) {
                return true;
            }
            // Search by name
            if (t.name.toLowerCase().includes(lowerQuery)) {
                return true;
            }
            // Search by group
            if (t.group.toLowerCase().includes(lowerQuery)) {
                return true;
            }
            return false;
        });
    }

    /**
     * Filter and search territories
     * @param {Object} filters - Filter options
     * @param {string} filters.group - Group name or 'all'
     * @param {string} filters.search - Search query
     */
    filterTerritories(filters = {}) {
        let results = this.getAllTerritories();

        // Filter by group (now uses groupId)
        if (filters.group && filters.group !== 'all') {
            results = results.filter(t => t.groupId == filters.group || t.group === filters.group);
        }

        // Search
        if (filters.search && filters.search.trim() !== '') {
            const query = filters.search.toLowerCase().trim();
            results = results.filter(t => {
                return t.id.toString().includes(query) ||
                    (t.number && t.number.toString().includes(query)) ||
                    t.name.toLowerCase().includes(query);
            });
        }

        return results;
    }

    /**
     * Get all groups
     */
    getAllGroups() {
        return [...this.groups];
    }

    /**
     * Get group by name
     * @param {string} name - Group name
     */
    getGroup(name) {
        return this.groups.find(g => g.name === name);
    }

    /**
     * Get group color by ID
     * @param {number} groupId - Group ID
     */
    getGroupColor(groupId) {
        const group = this.getGroup(groupId);
        return group ? group.color : '#E8E0D0';
    }

    /**
     * Get group by ID or name (for legacy support)
     */
    getGroup(idOrName) {
        return this.groups.find(g => g.id == idOrName || g.name === idOrName);
    }

    /**
     * Get territories with polygons
     */
    getTerritoriesWithPolygons() {
        return this.territories.filter(t => t.polygon && t.polygon.length > 0);
    }

    /**
     * Get territories without polygons
     */
    getTerritoriesWithoutPolygons() {
        return this.territories.filter(t => !t.polygon || t.polygon.length === 0);
    }

    /**
     * Get all extracted regions
     */
    getExtractedRegions() {
        return [...this.extractedRegions];
    }

    /**
     * Get extracted regions by group
     * @param {string} groupName - Group name
     */
    getExtractedRegionsByGroup(groupName) {
        if (groupName === 'all') {
            return this.getExtractedRegions();
        }
        return this.extractedRegions.filter(r => r.group === groupName);
    }

    /**
     * Get extracted region by ID
     * @param {number} regionId - Region ID
     */
    getExtractedRegion(regionId) {
        return this.extractedRegions.find(r => r.regionId === regionId);
    }

    /**
     * Get color for a group ID
     */
    getColorForGroup(groupId) {
        const group = this.getGroup(groupId);
        return group ? group.color : '#E8E0D0';
    }

    /**
     * Get the assigned territory for a region
     * @param {number} regionId - Region ID
     * @returns {Object|null} Territory object or null if unassigned
     */
    getAssignedTerritory(regionId) {
        const territoryId = this.regionAssignments[regionId];
        if (territoryId) {
            return this.getTerritory(territoryId);
        }
        return null;
    }

    /**
     * Check if a region is assigned
     * @param {number} regionId - Region ID
     */
    isRegionAssigned(regionId) {
        return !!this.regionAssignments[regionId];
    }

    /**
     * Get display label for a region
     * Returns territory number if assigned, "?" otherwise
     * @param {number} regionId - Region ID
     */
    getRegionLabel(regionId) {
        const territory = this.getAssignedTerritory(regionId);
        return territory ? (territory.number || territory.id).toString() : '?';
    }

    /**
     * Get display color for a region
     * Returns territory group color if assigned, neutral color otherwise
     * @param {number} regionId - Region ID
     */
    getRegionColor(regionId) {
        const territory = this.getAssignedTerritory(regionId);
        if (territory) {
            return this.getColorForGroup(territory.groupId || territory.group);
        }
        // Neutral color for unassigned regions
        return 'rgba(200, 200, 200, 0.2)';
    }

    /**
     * Get congregation boundary
     */
    getCongregationBoundary() {
        return this.congregationBoundary;
    }

    /**
     * Get image dimensions for scaling
     */
    getImageDimensions() {
        return {
            width: this.regionImageWidth,
            height: this.regionImageHeight
        };
    }

    /**
     * Assign an extracted region to a territory
     * @param {number} regionId - Extracted region ID
     * @param {number} territoryId - Territory ID to assign to
     */
    async assignRegionToTerritory(regionId, territoryId) {
        const region = this.getExtractedRegion(regionId);
        if (!region) {
            throw new Error(`Region ${regionId} not found`);
        }

        const territory = this.getTerritory(territoryId);
        if (!territory) {
            throw new Error(`Territory ${territoryId} not found`);
        }

        // Update the territory with the polygon
        const result = await this.updatePolygon(territoryId, region.polygon);

        // Update the assignment tracking
        this.regionAssignments[regionId] = territoryId;
        region.assignedTerritoryId = territoryId;

        this.notifyListeners('assignment', { regionId, territoryId });

        return result;
    }

    /**
     * Unassign a region from its territory
     * @param {number} regionId - Region ID
     */
    async unassignRegion(regionId) {
        const region = this.getExtractedRegion(regionId);
        if (!region) return;

        const territoryId = this.regionAssignments[regionId];
        if (territoryId) {
            // Clear the territory's polygon
            await this.updatePolygon(territoryId, []);

            // Update tracking
            delete this.regionAssignments[regionId];
            region.assignedTerritoryId = null;

            this.notifyListeners('assignment', { regionId, territoryId: null });
        }
    }

    /**
     * Delete a region completely
     * @param {number} regionId - Region ID to delete
     */
    async deleteRegion(regionId) {
        // First unassign if needed
        if (this.regionAssignments[regionId]) {
            await this.unassignRegion(regionId);
        }

        // Remove from extracted regions
        const index = this.extractedRegions.findIndex(r => r.regionId === regionId);
        if (index !== -1) {
            this.extractedRegions.splice(index, 1);
        }

        // Save to storage
        await storage.saveExtractedRegions({
            extractedRegions: this.extractedRegions,
            congregationBoundary: this.congregationBoundary,
            imageWidth: this.regionImageWidth,
            imageHeight: this.regionImageHeight
        });

        this.notifyListeners('regionDeleted', { regionId });
    }

    /**
     * Add a new region
     * @param {Object} regionData - Region data with polygon, centroid, area
     */
    async addRegion(regionData) {
        // Generate new region ID
        const maxId = this.extractedRegions.reduce((max, r) => Math.max(max, r.regionId), 0);
        const newRegion = {
            regionId: maxId + 1,
            polygon: regionData.polygon,
            centroid: regionData.centroid || this.calculateCentroid(regionData.polygon),
            area: regionData.area || this.calculatePolygonArea(regionData.polygon),
            vertices: regionData.polygon.length
        };

        this.extractedRegions.push(newRegion);

        // Save to storage
        await storage.saveExtractedRegions({
            extractedRegions: this.extractedRegions,
            congregationBoundary: this.congregationBoundary,
            imageWidth: this.regionImageWidth,
            imageHeight: this.regionImageHeight
        });

        this.notifyListeners('regionAdded', { region: newRegion });
        return newRegion;
    }

    /**
     * Update a region's polygon
     * @param {number} regionId - Region ID
     * @param {Array} polygon - New polygon coordinates
     */
    async updateRegionPolygon(regionId, polygon) {
        const region = this.getExtractedRegion(regionId);
        if (!region) return;

        region.polygon = polygon;
        region.centroid = this.calculateCentroid(polygon);
        region.area = this.calculatePolygonArea(polygon);
        region.vertices = polygon.length;

        // Save to storage
        await storage.saveExtractedRegions({
            extractedRegions: this.extractedRegions,
            congregationBoundary: this.congregationBoundary,
            imageWidth: this.regionImageWidth,
            imageHeight: this.regionImageHeight
        });

        this.notifyListeners('regionUpdated', { region });
    }

    /**
     * Calculate polygon area using Shoelace formula
     */
    calculatePolygonArea(polygon) {
        if (!polygon || polygon.length < 3) return 0;

        let area = 0;
        const n = polygon.length;

        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            area += polygon[i][0] * polygon[j][1];
            area -= polygon[j][0] * polygon[i][1];
        }

        return Math.abs(area / 2);
    }

    /**
     * Get statistics
     */
    getStats() {
        const total = this.territories.length;
        const withPolygons = this.getTerritoriesWithPolygons().length;
        const withoutPolygons = this.getTerritoriesWithoutPolygons().length;

        const byGroup = {};
        this.groups.forEach(g => {
            byGroup[g.name] = this.territories.filter(t => t.group === g.name).length;
        });

        return {
            total,
            withPolygons,
            withoutPolygons,
            byGroup
        };
    }

    /**
     * Group Management Methods
     */

    async addGroup(groupData) {
        const maxId = this.groups.reduce((max, g) => Math.max(max, g.id || 0), 0);
        const newGroup = {
            id: maxId + 1,
            name: groupData.name,
            color: groupData.color || '#E8E0D0'
        };
        this.groups.push(newGroup);
        await this.saveGroups();
        this.notifyListeners('groupsUpdated', this.groups);
        return newGroup;
    }

    async updateGroup(id, updates) {
        const index = this.groups.findIndex(g => g.id == id);
        if (index === -1) return;

        this.groups[index] = { ...this.groups[index], ...updates };
        await this.saveGroups();

        // Update any territories using this group color
        this.notifyListeners('groupsUpdated', this.groups);
        return this.groups[index];
    }

    async deleteGroup(id) {
        // Check if any territory uses this group
        const hasTerritories = this.territories.some(t => t.groupId == id);
        if (hasTerritories) {
            throw new Error("Cannot delete group that contains territories.");
        }

        this.groups = this.groups.filter(g => g.id != id);
        await this.saveGroups();
        this.notifyListeners('groupsUpdated', this.groups);
    }

    async saveGroups() {
        // We save the entire data object to firebase via storage
        const currentData = await storage.getData();
        currentData.groups = this.groups;
        await storage.saveData(currentData);
    }

    /**
     * Update territory
     * @param {number} id - Territory ID
     * @param {Object} updates - Fields to update
     */
    async updateTerritory(id, updates) {
        const result = await storage.updateTerritory(id, updates);

        // Update local cache
        const index = this.territories.findIndex(t => t.id === id);
        if (index !== -1) {
            this.territories[index] = result;
        }

        this.notifyListeners('update', { id, updates });
        return result;
    }

    /**
     * Add a new territory
     * @param {Object} territoryData - Territory data
     */
    async addTerritory(territoryData) {
        const result = await storage.addTerritory(territoryData);
        this.territories.push(result);
        this.notifyListeners('add', result);
        return result;
    }

    /**
     * Delete a territory
     * @param {number} id - Territory ID
     */
    async deleteTerritory(id) {
        // First, check if this territory is assigned to any regions
        const regions = this.extractedRegions.filter(r => r.assignedTerritoryId === id);
        for (const region of regions) {
            await this.unassignRegion(region.regionId);
        }

        await storage.deleteTerritory(id);
        const index = this.territories.findIndex(t => t.id === id);
        if (index !== -1) {
            this.territories.splice(index, 1);
        }
        this.notifyListeners('delete', id);
    }

    /**
     * Update territory polygon
     * @param {number} id - Territory ID
     * @param {Array} polygon - Polygon coordinates
     */
    async updatePolygon(id, polygon) {
        return this.updateTerritory(id, { polygon });
    }

    /**
     * Add assignment to territory
     * @param {number} id - Territory ID
     * @param {Object} assignment - Assignment data
     */
    async addAssignment(id, assignment) {
        const result = await storage.addAssignment(id, assignment);

        // Update local cache
        const index = this.territories.findIndex(t => t.id === id);
        if (index !== -1) {
            this.territories[index] = result;
        }

        this.notifyListeners('assignment', { id, assignment });
        return result;
    }

    /**
     * Update an assignment
     */
    async updateAssignment(territoryId, assignmentId, updates) {
        const result = await storage.updateAssignment(territoryId, assignmentId, updates);
        const index = this.territories.findIndex(t => t.id === territoryId);
        if (index !== -1) {
            this.territories[index] = result;
        }
        this.notifyListeners('updateAssignment', { territoryId, assignmentId, updates });
        return result;
    }

    /**
     * Delete an assignment
     */
    async deleteAssignment(territoryId, assignmentId) {
        const result = await storage.deleteAssignment(territoryId, assignmentId);
        const index = this.territories.findIndex(t => t.id === territoryId);
        if (index !== -1) {
            this.territories[index] = result;
        }
        this.notifyListeners('deleteAssignment', { territoryId, assignmentId });
        return result;
    }

    /**
     * Get metadata
     */
    getMetadata() {
        return { ...this.metadata };
    }

    /**
     * Calculate polygon centroid
     * @param {Array} polygon - Array of [x, y] coordinates
     */
    calculateCentroid(polygon) {
        if (!polygon || polygon.length === 0) {
            return null;
        }

        let x = 0;
        let y = 0;
        const n = polygon.length;

        polygon.forEach(point => {
            x += point[0];
            y += point[1];
        });

        return [x / n, y / n];
    }

    /**
     * Calculate polygon area
     * @param {Array} polygon - Array of [x, y] coordinates
     */
    calculateArea(polygon) {
        if (!polygon || polygon.length < 3) {
            return 0;
        }

        let area = 0;
        const n = polygon.length;

        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            area += polygon[i][0] * polygon[j][1];
            area -= polygon[j][0] * polygon[i][1];
        }

        return Math.abs(area / 2);
    }

    /**
     * Format area from px2 to Acres
     */
    formatArea(px2) {
        if (!px2) return '0 Acres';
        // Based on user provided ratio: 247,736 px² = 2,533,120.54 ft²
        // 1 acre = 43,560 ft²
        const ft2 = px2 * (2533120.54 / 247736);
        const acres = ft2 / 43560;

        if (acres < 0.01) return acres.toFixed(4) + ' Acres';
        if (acres < 1) return acres.toFixed(3) + ' Acres';
        return acres.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' Acres';
    }

    /**
     * Check if a point is inside a polygon
     * @param {Array} point - [x, y] coordinate
     * @param {Array} polygon - Array of [x, y] coordinates
     */
    isPointInPolygon(point, polygon) {
        if (!polygon || polygon.length < 3) {
            return false;
        }

        const [x, y] = point;
        let inside = false;
        const n = polygon.length;

        for (let i = 0, j = n - 1; i < n; j = i++) {
            const [xi, yi] = polygon[i];
            const [xj, yj] = polygon[j];

            if (((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }

        return inside;
    }

    /**
     * Find territory at a point
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     */
    findTerritoryAtPoint(x, y) {
        for (const territory of this.territories) {
            if (territory.polygon && territory.polygon.length > 0) {
                if (this.isPointInPolygon([x, y], territory.polygon)) {
                    return territory;
                }
            }
        }
        return null;
    }

    /**
     * Sort territories
     * @param {Array} territories - Territories to sort
     * @param {string} sortBy - Sort field (id, name, group)
     * @param {string} order - Sort order (asc, desc)
     */
    sortTerritories(territories, sortBy = 'id', order = 'asc') {
        return [...territories].sort((a, b) => {
            let comparison = 0;

            switch (sortBy) {
                case 'id':
                    comparison = a.id - b.id;
                    break;
                case 'name':
                    comparison = a.name.localeCompare(b.name);
                    break;
                case 'group':
                    comparison = a.group.localeCompare(b.group);
                    break;
                default:
                    comparison = a.id - b.id;
            }

            return order === 'desc' ? -comparison : comparison;
        });
    }
}

// Export singleton instance
const territoryData = new TerritoryData();

