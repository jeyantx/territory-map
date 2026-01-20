/**
 * Editor Module
 * 
 * Handles polygon drawing and editing for territory boundaries.
 */

class TerritoryEditor {
    constructor() {
        this.canvasWrapper = document.getElementById('editorCanvasWrapper');
        this.canvas = document.getElementById('editorCanvas');
        this.background = document.getElementById('editorBackground');

        // State
        this.currentTool = 'select'; // select, draw, edit
        this.isDrawing = false;
        this.currentPolygon = [];
        this.selectedTerritoryId = null;
        this.selectedRegionId = null;
        this.selectedVertexIndex = null;
        this.isDraggingVertex = false;
        this.history = [];
        this.historyIndex = -1;

        // Image dimensions
        this.imageWidth = 1920;
        this.imageHeight = 1357;

        // Pan state
        this.isPanning = false;
        this.panStartX = 0;
        this.panStartY = 0;
        this.scrollLeft = 0;
        this.scrollTop = 0;

        // Bind methods
        this.handleCanvasClick = this.handleCanvasClick.bind(this);
        this.handleCanvasMouseMove = this.handleCanvasMouseMove.bind(this);
        this.handleCanvasMouseDown = this.handleCanvasMouseDown.bind(this);
        this.handleCanvasMouseUp = this.handleCanvasMouseUp.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
    }

    /**
     * Initialize the editor
     */
    init() {
        this.setupEventListeners();
        this.setupImageLoad();
        this.populateTerritorySelect();
        this.updateUnassignedList();
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Canvas events
        this.canvas.addEventListener('click', this.handleCanvasClick);
        this.canvas.addEventListener('mousemove', this.handleCanvasMouseMove);
        this.canvas.addEventListener('mousedown', this.handleCanvasMouseDown);
        document.addEventListener('mouseup', this.handleCanvasMouseUp);

        // Keyboard events
        document.addEventListener('keydown', this.handleKeyDown);

        // Tool buttons
        document.getElementById('selectTool')?.addEventListener('click', () => this.setTool('select'));
        document.getElementById('drawTool')?.addEventListener('click', () => this.setTool('draw'));
        document.getElementById('editTool')?.addEventListener('click', () => this.setTool('edit'));

        // Undo/Redo
        document.getElementById('undoBtn')?.addEventListener('click', () => this.undo());
        document.getElementById('redoBtn')?.addEventListener('click', () => this.redo());

        // Save/Cancel
        document.getElementById('saveEdit')?.addEventListener('click', () => this.saveChanges());
        document.getElementById('cancelEdit')?.addEventListener('click', () => this.cancelChanges());

        // Territory select
        document.getElementById('assignTerritory')?.addEventListener('change', (e) => {
            this.assignPolygonToTerritory(parseInt(e.target.value));
        });

        // Delete region button
        document.getElementById('deleteRegionBtn')?.addEventListener('click', () => this.deleteSelectedRegion());

        // Pan with middle mouse or space+drag
        this.canvasWrapper.addEventListener('mousedown', (e) => {
            if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
                this.isPanning = true;
                this.panStartX = e.clientX;
                this.panStartY = e.clientY;
                this.scrollLeft = this.canvasWrapper.scrollLeft;
                this.scrollTop = this.canvasWrapper.scrollTop;
                e.preventDefault();
            }
        });

        this.canvasWrapper.addEventListener('mousemove', (e) => {
            if (this.isPanning) {
                this.canvasWrapper.scrollLeft = this.scrollLeft - (e.clientX - this.panStartX);
                this.canvasWrapper.scrollTop = this.scrollTop - (e.clientY - this.panStartY);
            }
        });

        this.canvasWrapper.addEventListener('mouseup', () => {
            this.isPanning = false;
        });

        this.canvasWrapper.addEventListener('mouseleave', () => {
            this.isPanning = false;
        });
    }

    /**
     * Setup image load handler
     */
    setupImageLoad() {
        this.background.addEventListener('load', () => {
            this.imageWidth = this.background.naturalWidth;
            this.imageHeight = this.background.naturalHeight;
            this.updateCanvasSize();
            this.render();
        });

        if (this.background.complete) {
            this.imageWidth = this.background.naturalWidth;
            this.imageHeight = this.background.naturalHeight;
            this.updateCanvasSize();
        }
    }

    /**
     * Update canvas size to match image
     */
    updateCanvasSize() {
        this.canvas.setAttribute('width', this.imageWidth);
        this.canvas.setAttribute('height', this.imageHeight);
        this.canvas.style.width = this.imageWidth + 'px';
        this.canvas.style.height = this.imageHeight + 'px';
    }

    /**
     * Calculate scale factor between original image and displayed image
     */
    getScaleFactor() {
        if (!this.background.naturalWidth || !territoryData.regionImageWidth) return 1;
        return this.background.naturalWidth / territoryData.regionImageWidth;
    }

    /**
     * Set current tool
     */
    setTool(tool) {
        this.currentTool = tool;

        // Update button states
        document.querySelectorAll('.editor-tools .tool-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.getElementById(`${tool}Tool`)?.classList.add('active');

        // Update status
        const status = {
            select: 'Click on a territory polygon to select it',
            draw: 'Click to add vertices. Press Enter or double-click to finish.',
            edit: 'Drag vertices to adjust polygon shape'
        };
        this.updateStatus(status[tool] || 'Select a tool to begin');

        // Reset drawing if switching away from draw
        if (tool !== 'draw' && this.isDrawing) {
            this.cancelDrawing();
        }

        // Update cursor
        this.canvas.style.cursor = tool === 'draw' ? 'crosshair' : 'default';
    }

    /**
     * Update status text
     */
    updateStatus(text) {
        const statusEl = document.getElementById('editorStatus');
        if (statusEl) {
            statusEl.textContent = text;
        }
    }

    /**
     * Get mouse position relative to canvas
     */
    getMousePosition(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width.baseVal.value / rect.width;
        const scaleY = this.canvas.height.baseVal.value / rect.height;

        return {
            x: Math.round((e.clientX - rect.left) * scaleX),
            y: Math.round((e.clientY - rect.top) * scaleY)
        };
    }

    /**
     * Get unscaled position (converts canvas coords to image coords)
     */
    getUnscaledPosition(pos) {
        const scale = this.getScaleFactor();
        return {
            x: pos.x / scale,
            y: pos.y / scale
        };
    }

    /**
     * Handle canvas click
     */
    handleCanvasClick(e) {
        if (this.isPanning) return;

        const pos = this.getMousePosition(e);

        switch (this.currentTool) {
            case 'select':
                this.handleSelectClick(pos);
                break;
            case 'draw':
                this.handleDrawClick(pos, e);
                break;
            case 'edit':
                this.handleEditClick(pos);
                break;
        }
    }

    /**
     * Handle select tool click
     */
    handleSelectClick(pos) {
        // Find region at click position
        // We need to check using unscaled coordinates since territoryData stores unscaled polygons
        const unscaledPos = this.getUnscaledPosition(pos);
        const regions = territoryData.getExtractedRegions();

        for (const region of regions) {
            if (region.polygon && territoryData.isPointInPolygon([unscaledPos.x, unscaledPos.y], region.polygon)) {
                this.selectRegion(region.regionId);
                return;
            }
        }

        // Clicked outside any region
        this.deselectRegion();
    }

    /**
     * Select a region for editing
     */
    selectRegion(regionId) {
        this.selectedRegionId = regionId;
        this.selectedTerritoryId = null;
        const region = territoryData.getExtractedRegion(regionId);

        if (region) {
            this.updateRegionInfo(region);

            // Update territory assignment dropdown
            const assignedTerritory = territoryData.getAssignedTerritory(regionId);
            const select = document.getElementById('assignTerritory');
            if (select && assignedTerritory) {
                select.value = assignedTerritory.id;
            } else if (select) {
                select.value = '';
            }

            // Show region actions
            const actionsEl = document.getElementById('regionActions');
            if (actionsEl) actionsEl.style.display = 'block';
        }

        this.render();
    }

    /**
     * Deselect region
     */
    deselectRegion() {
        this.selectedRegionId = null;
        this.selectedTerritoryId = null;
        this.selectedVertexIndex = null;

        // Clear dropdown
        const select = document.getElementById('assignTerritory');
        if (select) {
            select.value = '';
        }

        // Clear polygon info
        document.getElementById('vertexCount').textContent = '-';
        document.getElementById('polygonArea').textContent = '-';

        // Hide region actions
        const actionsEl = document.getElementById('regionActions');
        if (actionsEl) actionsEl.style.display = 'none';

        this.render();
    }

    /**
     * Delete the currently selected region
     */
    async deleteSelectedRegion() {
        if (!this.selectedRegionId) {
            this.showToast('No region selected', 'warning');
            return;
        }

        if (!confirm('Are you sure you want to delete this region? This cannot be undone.')) {
            return;
        }

        try {
            await territoryData.deleteRegion(this.selectedRegionId);
            this.showToast('Region deleted');
            this.deselectRegion();
            this.render();
        } catch (error) {
            console.error('Failed to delete region:', error);
            this.showToast('Failed to delete region', 'error');
        }
    }

    /**
     * Handle draw tool click
     */
    handleDrawClick(pos, e) {
        // Double-click to finish
        if (e.detail === 2 && this.currentPolygon.length >= 3) {
            this.finishDrawing();
            return;
        }

        // Add vertex (store unscaled coordinates)
        const unscaled = this.getUnscaledPosition(pos);
        this.currentPolygon.push([unscaled.x, unscaled.y]);
        this.isDrawing = true;
        this.render();

        this.updateStatus(`Drawing polygon: ${this.currentPolygon.length} vertices. Press Enter to finish.`);
    }

    /**
     * Handle edit tool click
     */
    handleEditClick(pos) {
        if (!this.selectedRegionId) {
            // Try to select a region first
            this.handleSelectClick(pos);
        }
    }

    /**
     * Handle canvas mouse move
     */
    handleCanvasMouseMove(e) {
        if (this.isPanning) return;

        const pos = this.getMousePosition(e);

        // Drag vertex in edit mode
        if (this.currentTool === 'edit' && this.isDraggingVertex && this.selectedRegionId !== null) {
            const region = territoryData.getExtractedRegion(this.selectedRegionId);
            if (region && region.polygon && this.selectedVertexIndex !== null) {
                const unscaled = this.getUnscaledPosition(pos);
                region.polygon[this.selectedVertexIndex] = [unscaled.x, unscaled.y];
                this.render();
            }
        }

        // Show preview line while drawing
        if (this.currentTool === 'draw' && this.isDrawing && this.currentPolygon.length > 0) {
            this.renderDrawingPreview(pos);
        }
    }

    /**
     * Handle canvas mouse down
     */
    handleCanvasMouseDown(e) {
        if (this.isPanning) return;

        const pos = this.getMousePosition(e);

        // Start vertex drag or delete in edit mode
        if (this.currentTool === 'edit' && this.selectedRegionId !== null) {
            const region = territoryData.getExtractedRegion(this.selectedRegionId);
            if (region && region.polygon) {
                // Scale polygon to canvas coords for vertex detection
                const scale = this.getScaleFactor();
                const scaledPolygon = region.polygon.map(p => [p[0] * scale, p[1] * scale]);

                const vertexIndex = this.findVertexAtPosition(scaledPolygon, pos);
                if (vertexIndex !== -1) {
                    // Check for shift key to delete vertex
                    if (e.shiftKey) {
                        if (region.polygon.length > 3) {
                            this.saveToHistory();
                            region.polygon.splice(vertexIndex, 1);
                            this.render();
                            this.showToast('Vertex deleted');
                        } else {
                            this.showToast('Polygon must have at least 3 vertices', 'warning');
                        }
                        return;
                    }

                    this.selectedVertexIndex = vertexIndex;
                    this.isDraggingVertex = true;
                    this.saveToHistory();
                }
            }
        }
    }

    /**
     * Handle canvas mouse up
     */
    handleCanvasMouseUp() {
        this.isDraggingVertex = false;
        this.selectedVertexIndex = null;
    }

    /**
     * Handle keyboard events
     */
    handleKeyDown(e) {
        // Only handle when editor view is active
        if (!document.getElementById('editorView')?.classList.contains('active')) {
            return;
        }

        switch (e.key) {
            case 'Enter':
                if (this.isDrawing && this.currentPolygon.length >= 3) {
                    this.finishDrawing();
                }
                break;
            case 'Escape':
                if (this.isDrawing) {
                    this.cancelDrawing();
                } else {
                    this.deselectRegion();
                }
                break;
            case 'Delete':
            case 'Backspace':
                if (this.isDrawing && this.currentPolygon.length > 0) {
                    // Remove last vertex
                    this.currentPolygon.pop();
                    this.render();
                }
                break;
            case 'z':
                if (e.ctrlKey || e.metaKey) {
                    if (e.shiftKey) {
                        this.redo();
                    } else {
                        this.undo();
                    }
                    e.preventDefault();
                }
                break;
        }
    }

    /**
     * Find vertex at position
     */
    findVertexAtPosition(polygon, pos, threshold = 15) {
        for (let i = 0; i < polygon.length; i++) {
            const [vx, vy] = polygon[i];
            const dist = Math.sqrt(Math.pow(pos.x - vx, 2) + Math.pow(pos.y - vy, 2));
            if (dist < threshold) {
                return i;
            }
        }
        return -1;
    }

    /**
     * Select a territory for editing
     */
    selectTerritory(id) {
        this.selectedTerritoryId = id;
        const territory = territoryData.getTerritory(id);

        if (territory) {
            // Update territory select dropdown
            const select = document.getElementById('assignTerritory');
            if (select) {
                select.value = id;
            }

            // Update polygon info
            this.updatePolygonInfo(territory);
        }

        this.render();
    }

    /**
     * Deselect territory
     */
    deselectTerritory() {
        this.selectedTerritoryId = null;
        this.selectedVertexIndex = null;

        // Clear dropdown
        const select = document.getElementById('assignTerritory');
        if (select) {
            select.value = '';
        }

        // Clear polygon info
        document.getElementById('vertexCount').textContent = '-';
        document.getElementById('polygonArea').textContent = '-';

        this.render();
    }

    /**
     * Update polygon info panel
     */
    updatePolygonInfo(territory) {
        const vertexCount = document.getElementById('vertexCount');
        const polygonArea = document.getElementById('polygonArea');

        if (territory.polygon && territory.polygon.length > 0) {
            vertexCount.textContent = territory.polygon.length;
            const area = territoryData.calculateArea(territory.polygon);
            polygonArea.textContent = Math.round(area).toLocaleString() + ' px²';
        } else {
            vertexCount.textContent = '0';
            polygonArea.textContent = 'N/A';
        }
    }

    /**
     * Finish drawing current polygon
     */
    async finishDrawing() {
        if (this.currentPolygon.length < 3) {
            this.showToast('Polygon needs at least 3 vertices', 'warning');
            return;
        }

        this.isDrawing = false;

        // Add as a new region
        try {
            const newRegion = await territoryData.addRegion({
                polygon: [...this.currentPolygon]
            });
            this.showToast(`New region #${newRegion.regionId} created`);
            this.currentPolygon = [];
            this.selectRegion(newRegion.regionId);
            this.updateStatus('Region created. You can now assign it to a territory.');
        } catch (error) {
            console.error('Failed to create region:', error);
            this.showToast('Failed to create region', 'error');
        }

        this.render();
    }

    /**
     * Cancel drawing
     */
    cancelDrawing() {
        this.isDrawing = false;
        this.currentPolygon = [];
        this.render();
        this.updateStatus('Drawing cancelled');
    }

    /**
     * Assign drawn polygon to territory
     */
    async assignDrawnPolygon(territoryId) {
        if (this.currentPolygon.length < 3) {
            this.showToast('No polygon to assign', 'error');
            return;
        }

        this.saveToHistory();

        try {
            await territoryData.updatePolygon(territoryId, [...this.currentPolygon]);
            this.currentPolygon = [];
            this.updateUnassignedList();
            this.render();
            this.showToast(`Polygon assigned to territory ${territoryId}`, 'success');
        } catch (error) {
            console.error('Failed to assign polygon:', error);
            this.showToast('Failed to assign polygon', 'error');
        }
    }

    /**
     * Assign polygon to territory (from dropdown)
     */
    async assignPolygonToTerritory(territoryId) {
        if (!territoryId) return;

        this.selectedTerritoryId = territoryId;

        // If we have a drawn polygon, assign it
        if (this.currentPolygon.length >= 3) {
            await this.assignDrawnPolygon(territoryId);
        } else {
            // Just select the territory
            this.selectTerritory(territoryId);
        }
    }

    /**
     * Populate territory select dropdown
     */
    populateTerritorySelect() {
        const select = document.getElementById('assignTerritory');
        if (!select) return;

        const territories = territoryData.getAllTerritories();
        select.innerHTML = '<option value="">Select territory...</option>';

        // Group territories by group info
        const groups = {};
        territories.forEach(t => {
            const group = territoryData.getGroup(t.groupId || t.group);
            const groupName = group ? group.name : (t.group || 'Unassigned');

            if (!groups[groupName]) {
                groups[groupName] = [];
            }
            groups[groupName].push(t);
        });

        // Create optgroups
        Object.keys(groups).sort().forEach(groupName => {
            const optgroup = document.createElement('optgroup');
            optgroup.label = groupName;

            groups[groupName].sort((a, b) => {
                const numA = parseInt(a.number || a.id) || 0;
                const numB = parseInt(b.number || b.id) || 0;
                return numA - numB;
            }).forEach(t => {
                const option = document.createElement('option');
                option.value = t.id;
                const displayNumber = t.number || t.id;
                option.textContent = `${displayNumber} - ${t.name}`;
                if (t.polygon && t.polygon.length > 0) {
                    option.textContent += ' ✓';
                }
                optgroup.appendChild(option);
            });

            select.appendChild(optgroup);
        });
    }

    /**
     * Update unassigned territories list
     */
    updateUnassignedList() {
        const list = document.getElementById('unassignedList');
        if (!list) return;

        const unassigned = territoryData.getTerritoriesWithoutPolygons();

        if (unassigned.length === 0) {
            list.innerHTML = '<p class="text-muted">All territories have polygons!</p>';
            return;
        }

        list.innerHTML = unassigned.map(t => {
            const displayNumber = t.number || t.id;
            return `
            <div class="unassigned-item" data-id="${t.id}">
                <span class="unassigned-number">${displayNumber}</span>
                <span class="unassigned-name">${t.name}</span>
            </div>
            `;
        }).join('');

        // Add click handlers
        list.querySelectorAll('.unassigned-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = parseInt(item.dataset.id);
                this.selectTerritory(id);
                document.getElementById('assignTerritory').value = id;
            });
        });
    }

    /**
     * Save current state to history
     */
    saveToHistory() {
        // Remove any future states
        this.history = this.history.slice(0, this.historyIndex + 1);

        // Save current state
        const state = {
            territories: JSON.parse(JSON.stringify(territoryData.getAllTerritories())),
            currentPolygon: [...this.currentPolygon]
        };

        this.history.push(state);
        this.historyIndex = this.history.length - 1;

        // Limit history size
        if (this.history.length > 50) {
            this.history.shift();
            this.historyIndex--;
        }
    }

    /**
     * Undo last action
     */
    undo() {
        if (this.historyIndex <= 0) {
            this.showToast('Nothing to undo', 'info');
            return;
        }

        this.historyIndex--;
        this.restoreState(this.history[this.historyIndex]);
        this.showToast('Undone', 'info');
    }

    /**
     * Redo last undone action
     */
    redo() {
        if (this.historyIndex >= this.history.length - 1) {
            this.showToast('Nothing to redo', 'info');
            return;
        }

        this.historyIndex++;
        this.restoreState(this.history[this.historyIndex]);
        this.showToast('Redone', 'info');
    }

    /**
     * Restore a history state
     */
    restoreState(state) {
        // Restore territories
        state.territories.forEach(t => {
            const index = territoryData.territories.findIndex(tt => tt.id === t.id);
            if (index !== -1) {
                territoryData.territories[index] = t;
            }
        });

        this.currentPolygon = [...state.currentPolygon];
        this.render();
    }

    /**
     * Save all changes
     */
    async saveChanges() {
        try {
            // Save any edited region
            if (this.selectedRegionId) {
                const region = territoryData.getExtractedRegion(this.selectedRegionId);
                if (region) {
                    await territoryData.updateRegionPolygon(this.selectedRegionId, region.polygon);
                }
            }

            await storage.save();
            this.showToast('Changes saved successfully', 'success');

            // Update main map view if it exists
            if (typeof territoryMap !== 'undefined' && territoryMap) {
                territoryMap.render();
            }
        } catch (error) {
            console.error('Failed to save:', error);
            this.showToast('Failed to save changes', 'error');
        }
    }

    /**
     * Cancel all changes (reload from storage)
     */
    async cancelChanges() {
        if (confirm('Are you sure you want to discard all changes?')) {
            await territoryData.init();
            this.history = [];
            this.historyIndex = -1;
            this.currentPolygon = [];
            this.selectedTerritoryId = null;
            this.updateUnassignedList();
            this.populateTerritorySelect();
            this.render();
            this.showToast('Changes discarded', 'info');
        }
    }

    /**
     * Render the editor canvas
     */
    render() {
        // Clear canvas
        this.canvas.innerHTML = '';

        // Render all extracted regions
        const regions = territoryData.getExtractedRegions();
        regions.forEach(region => {
            this.renderRegion(region);
        });

        // Render current drawing polygon
        if (this.currentPolygon.length > 0) {
            this.renderDrawingPolygon();
        }
    }

    /**
     * Render an extracted region
     */
    renderRegion(region) {
        if (!region.polygon || region.polygon.length < 3) return;

        const isSelected = this.selectedRegionId === region.regionId;
        const assignedTerritory = territoryData.getAssignedTerritory(region.regionId);

        // Scale polygon to match displayed image size
        const scale = this.getScaleFactor();
        const scaledPolygon = region.polygon.map(p => [p[0] * scale, p[1] * scale]);

        // Get color
        let color = 'rgba(200, 200, 200, 0.3)'; // Default transparent gray
        let strokeColor = '#666';
        let strokeWidth = '1.5';
        let opacity = '0.4';

        if (assignedTerritory) {
            color = assignedTerritory.color; // Use territory color
        }

        if (isSelected) {
            strokeColor = '#4A3728';
            strokeWidth = '3';
            opacity = '0.6';
        }

        // Create polygon
        const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        const points = scaledPolygon.map(p => p.join(',')).join(' ');
        polygon.setAttribute('points', points);
        polygon.setAttribute('class', 'territory-polygon' + (isSelected ? ' selected' : ''));
        polygon.setAttribute('data-region-id', region.regionId);
        polygon.style.fill = color;
        polygon.style.fillOpacity = opacity;
        polygon.style.stroke = strokeColor;
        polygon.style.strokeWidth = strokeWidth;

        this.canvas.appendChild(polygon);

        // Render vertices if editing this region
        if (isSelected && this.currentTool === 'edit') {
            scaledPolygon.forEach((point, index) => {
                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('cx', point[0]);
                circle.setAttribute('cy', point[1]);
                circle.setAttribute('r', '6');
                circle.setAttribute('class', 'polygon-vertex');
                circle.setAttribute('data-index', index);
                this.canvas.appendChild(circle);
            });
        }

        // Add label (Territory ID or "?")
        const centroid = territoryData.calculateCentroid(scaledPolygon);
        if (centroid) {
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', centroid[0]);
            text.setAttribute('y', centroid[1]);
            text.setAttribute('class', 'territory-label');
            text.style.fontSize = '14px';
            text.style.fontWeight = '600';
            text.style.fill = isSelected ? '#000' : '#333';
            text.textContent = assignedTerritory ? assignedTerritory.id : '?';

            // Adjust label position slightly to not overlap vertex
            if (isSelected) {
                text.setAttribute('y', centroid[1] - 15);
            }

            this.canvas.appendChild(text);
        }
    }

    /**
     * Load a region for editing (called from map view)
     */
    loadRegionForEditing(regionId) {
        this.selectedRegionId = regionId;
        const region = territoryData.getExtractedRegion(regionId);

        if (region) {
            // Update polygon info
            this.updateRegionInfo(region);

            // Set edit tool
            this.setTool('edit');

            // Center on region
            this.centerOnRegion(region);
        }

        this.render();
    }

    /**
     * Center view on a region
     */
    centerOnRegion(region) {
        if (!region.centroid) return;

        const [cx, cy] = region.centroid;
        const wrapperWidth = this.canvasWrapper.clientWidth;
        const wrapperHeight = this.canvasWrapper.clientHeight;

        this.canvasWrapper.scrollLeft = cx - wrapperWidth / 2;
        this.canvasWrapper.scrollTop = cy - wrapperHeight / 2;
    }

    /**
     * Update region info panel
     */
    updateRegionInfo(region) {
        document.getElementById('vertexCount').textContent = region.polygon.length;
        document.getElementById('polygonArea').textContent = Math.round(region.area || 0).toLocaleString() + ' px²';
    }

    /**
     * Render a territory polygon
     */
    renderPolygon(territory) {
        if (!territory.polygon || territory.polygon.length < 3) return;

        const isSelected = this.selectedTerritoryId === territory.id;

        // Create polygon
        const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        const points = territory.polygon.map(p => p.join(',')).join(' ');
        polygon.setAttribute('points', points);
        polygon.setAttribute('class', 'territory-polygon' + (isSelected ? ' selected' : ''));
        polygon.setAttribute('data-id', territory.id);
        polygon.style.fill = territory.color;
        polygon.style.fillOpacity = isSelected ? '0.6' : '0.4';
        polygon.style.stroke = isSelected ? '#4A3728' : '#666';
        polygon.style.strokeWidth = isSelected ? '3' : '1';

        this.canvas.appendChild(polygon);

        // Render vertices if editing this polygon
        if (isSelected && this.currentTool === 'edit') {
            territory.polygon.forEach((point, index) => {
                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('cx', point[0]);
                circle.setAttribute('cy', point[1]);
                circle.setAttribute('r', '6');
                circle.setAttribute('class', 'polygon-vertex');
                circle.setAttribute('data-index', index);
                this.canvas.appendChild(circle);
            });
        }

        // Add label
        const centroid = territoryData.calculateCentroid(territory.polygon);
        if (centroid) {
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', centroid[0]);
            text.setAttribute('y', centroid[1]);
            text.setAttribute('class', 'territory-label');
            text.style.fontSize = '14px';
            text.style.fontWeight = '600';
            text.style.fill = '#333';
            text.style.textAnchor = 'middle';
            text.style.dominantBaseline = 'middle';
            text.textContent = territory.id;
            this.canvas.appendChild(text);
        }
    }

    /**
     * Render the current drawing polygon
     */
    renderDrawingPolygon() {
        if (this.currentPolygon.length === 0) return;

        // Draw polygon if has 3+ points
        // Scale polygon to canvas coords
        const scale = this.getScaleFactor();
        const scaledPolygon = this.currentPolygon.map(p => [p[0] * scale, p[1] * scale]);

        const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        const points = scaledPolygon.map(p => p.join(',')).join(' ');

        polygon.setAttribute('points', points);
        polygon.setAttribute('class', 'drawing-polygon');
        polygon.style.fill = 'none';
        polygon.style.stroke = '#2196F3';
        polygon.style.strokeWidth = '2';
        polygon.style.strokeDasharray = '5,5';

        this.canvas.appendChild(polygon);

        // Draw vertices
        scaledPolygon.forEach(point => {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', point[0]);
            circle.setAttribute('cy', point[1]);
            circle.setAttribute('r', '4');
            circle.setAttribute('fill', '#2196F3');
            this.canvas.appendChild(circle);
        });
    }

    /**
     * Render drawing preview line
     */
    renderDrawingPreview(pos) {
        // Remove existing preview
        this.canvas.querySelectorAll('.drawing-preview').forEach(el => el.remove());

        if (this.currentPolygon.length === 0) return;

        const lastPoint = this.currentPolygon[this.currentPolygon.length - 1];

        // Scale last point to canvas coords
        const scale = this.getScaleFactor();
        const scaledLastPoint = [lastPoint[0] * scale, lastPoint[1] * scale];

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', scaledLastPoint[0]);
        line.setAttribute('y1', scaledLastPoint[1]);
        line.setAttribute('x2', pos.x);
        line.setAttribute('y2', pos.y);
        line.setAttribute('class', 'drawing-preview');
        line.style.stroke = '#8B7355';
        line.style.strokeWidth = '2';
        line.style.strokeDasharray = '5 5';
        this.canvas.appendChild(line);

        // If near first point, show closing hint
        if (this.currentPolygon.length >= 3) {
            const firstPoint = this.currentPolygon[0];
            const scaledFirstPoint = [firstPoint[0] * scale, firstPoint[1] * scale];
            const dist = Math.sqrt(
                Math.pow(pos.x - scaledFirstPoint[0], 2) +
                Math.pow(pos.y - scaledFirstPoint[1], 2)
            );
            if (dist < 20) {
                const closeLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                closeLine.setAttribute('x1', mousePos.x);
                closeLine.setAttribute('y1', mousePos.y);
                closeLine.setAttribute('x2', firstPoint[0]);
                closeLine.setAttribute('y2', firstPoint[1]);
                closeLine.setAttribute('class', 'drawing-preview');
                closeLine.style.stroke = '#5A9A5A';
                closeLine.style.strokeWidth = '2';
                this.canvas.appendChild(closeLine);
            }
        }
    }

    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;

        container.appendChild(toast);

        // Remove after 3 seconds
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Export
let territoryEditor = null;
