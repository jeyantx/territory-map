/**
 * Map Module
 * 
 * Handles SVG map rendering, pan/zoom, and territory interactions.
 */

class TerritoryMap {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.wrapper = document.getElementById('mapWrapper');
        this.background = document.getElementById('mapBackground');
        this.loader = document.getElementById('mapLoader');
        this.overlay = document.getElementById('territoryOverlay');
        this.detailsPanel = document.getElementById('detailsPanel');

        // State
        this.scale = 1;
        this.minScale = 0.1;
        this.maxScale = 4;
        this.translateX = 0;
        this.translateY = 0;
        this.isDragging = false;
        this.startX = 0;
        this.startY = 0;
        this.searchQuery = '';
        this.colorMode = 'group'; // 'group' or 'timeline'
        this.mapLayer = 'simple'; // 'simple' or 'earth'

        // Image dimensions (will be updated when image loads)
        this.imageWidth = 1920;
        this.imageHeight = 1357;

        // Original region dimensions (from extracted_regions.json)
        this.regionImageWidth = 14032;
        this.regionImageHeight = 9920;

        // Context menu
        this.contextMenu = null;

        // Bind methods
        this.handleWheel = this.handleWheel.bind(this);
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleTouchStart = this.handleTouchStart.bind(this);
        this.handleTouchMove = this.handleTouchMove.bind(this);
        this.handleTouchEnd = this.handleTouchEnd.bind(this);
    }

    /**
     * Initialize the map
     */
    init() {
        this.setupEventListeners();
        this.setupImageLoad();
        this.createContextMenu();
        this.fitToContainer();

        // Get region image dimensions from data
        const dims = territoryData.getImageDimensions();
        this.regionImageWidth = dims.width;
        this.regionImageHeight = dims.height;
    }

    /**
     * Create context menu element
     */
    createContextMenu() {
        this.contextMenu = document.createElement('div');
        this.contextMenu.className = 'context-menu';
        this.contextMenu.innerHTML = `
            <div class="context-menu-header" id="contextMenuHeader">Region</div>
            <ul class="context-menu-list">
                <li class="context-menu-item" data-action="view">
                    <span class="context-icon">👁</span> View Details
                </li>
                <li class="context-menu-item" data-action="assign">
                    <span class="context-icon">📍</span> Assign to Territory
                </li>
                <li class="context-menu-item" data-action="highlight">
                    <span class="context-icon">✨</span> Highlight Group
                </li>
                <li class="context-menu-divider"></li>
                <li class="context-menu-item" data-action="copy">
                    <span class="context-icon">📋</span> Copy Coordinates
                </li>
            </ul>
        `;
        document.body.appendChild(this.contextMenu);

        // Add click handlers for menu items
        this.contextMenu.querySelectorAll('.context-menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = item.dataset.action;
                this.handleContextMenuAction(action);
            });
        });

        // Close context menu when clicking elsewhere
        document.addEventListener('click', () => this.hideContextMenu());
    }

    /**
     * Show context menu at position
     */
    showContextMenu(x, y, region) {
        this.contextMenuRegion = region;

        // Check assignment status
        const assignedTerritory = territoryData.getAssignedTerritory(region.regionId);
        const isAssigned = !!assignedTerritory;

        // Update header
        const header = this.contextMenu.querySelector('#contextMenuHeader');
        if (isAssigned) {
            header.textContent = `Territory #${assignedTerritory.id} - ${assignedTerritory.name}`;
        } else {
            header.textContent = `Unassigned Region #${region.regionId}`;
        }

        // Update menu items based on assignment
        const assignItem = this.contextMenu.querySelector('[data-action="assign"]');
        if (assignItem) {
            if (isAssigned) {
                assignItem.innerHTML = '<span class="context-icon">❌</span> Unassign Territory';
                assignItem.dataset.action = 'unassign';
            } else {
                assignItem.innerHTML = '<span class="context-icon">📍</span> Assign to Territory';
                assignItem.dataset.action = 'assign';
            }
        }

        // Position menu
        const menuWidth = 200;
        const menuHeight = 180;
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;

        let posX = x;
        let posY = y;

        if (x + menuWidth > windowWidth) {
            posX = windowWidth - menuWidth - 10;
        }
        if (y + menuHeight > windowHeight) {
            posY = windowHeight - menuHeight - 10;
        }

        this.contextMenu.style.left = `${posX}px`;
        this.contextMenu.style.top = `${posY}px`;
        this.contextMenu.classList.add('visible');
    }

    /**
     * Hide context menu
     */
    hideContextMenu() {
        if (this.contextMenu) {
            this.contextMenu.classList.remove('visible');
        }
    }

    /**
     * Set color mode and re-render
     */
    setColorMode(mode) {
        this.colorMode = mode;
        this.render();
        this.updateLegend();
    }

    /**
     * Set map layer and update background image
     */
    setMapLayer(layer) {
        this.mapLayer = layer;

        // Show loader before switching
        this.showLoader(true);

        if (layer === 'earth') {
            this.background.srcset = `
                images/background-earth-mobile.png 800w,
                images/background-earth-tablet.png 1200w,
                images/background-earth-laptop.png 2560w,
                images/background-earth-desktop.png 3840w
            `;
            this.background.src = "images/background-earth-laptop.png";
        } else {
            this.background.srcset = `
                images/background-mobile.png 800w,
                images/background-tablet.png 1200w,
                images/background-laptop.png 2560w,
                images/background-desktop.png 3840w
            `;
            this.background.src = "images/background-laptop.png";
        }

        // Also update editor background if it exists
        const editorBg = document.getElementById('editorBackground');
        if (editorBg) {
            editorBg.src = layer === 'earth' ? "images/background-earth-laptop.png" : "images/background-laptop.png";
        }

        // Wait for image to load to update dimensions
        if (this.background.complete) {
            // It might happen that the image is already cached and the load event won't fire for src change if it's instant
            // But usually src change triggers load.
            // Explicitly checking complete might be tricky with src change.
            // We'll rely on load event which fires on src change.
        }
    }

    /**
     * Update legend display
     */
    updateLegend() {
        let legend = document.getElementById('mapLegend');
        if (!legend) {
            legend = document.createElement('div');
            legend.id = 'mapLegend';
            legend.className = 'map-legend';
            this.container.appendChild(legend);
        }

        if (this.colorMode === 'timeline') {
            legend.className = 'map-legend timeline-legend';
            legend.innerHTML = `
                <div class="legend-item"><div class="legend-color" style="background: #4CAF50"></div><span>Recently Completed</span></div>
                <div class="legend-item"><div class="legend-color" style="background: #A5D6A7"></div><span>Completed Earlier</span></div>
                <div class="legend-item"><div class="legend-color" style="background: #FFCDD2"></div><span>Not Completed (Yearly)</span></div>
                <div class="legend-item"><div class="legend-color" style="background: #E57373"></div><span>Not Completed (> 1 Year)</span></div>
                <div class="legend-item"><div class="legend-color" style="background: #C62828"></div><span>Never Completed</span></div>
            `;
            legend.style.display = 'flex';
        } else if (this.colorMode === 'group') {
            const groups = territoryData.getAllGroups();
            if (groups.length === 0) {
                legend.style.display = 'none';
                return;
            }
            legend.className = 'map-legend group-legend';
            legend.innerHTML = groups.map(g => `
                <div class="legend-item">
                    <div class="legend-color" style="background: ${g.color}"></div>
                    <span>${g.name}</span>
                </div>
            `).join('');
            legend.style.display = 'flex';
        } else {
            legend.style.display = 'none';
        }
    }

    /**
     * Handle context menu action
     */
    handleContextMenuAction(action) {
        const region = this.contextMenuRegion;
        if (!region) return;

        const assignedTerritory = territoryData.getAssignedTerritory(region.regionId);

        switch (action) {
            case 'view':
                this.showRegionDetails(region);
                break;
            case 'assign':
                this.showRegionDetails(region);
                break;
            case 'unassign':
                this.unassignRegion(region.regionId);
                break;
            case 'highlight':
                if (assignedTerritory) {
                    this.setFilter(assignedTerritory.group);
                    document.getElementById('groupFilter').value = assignedTerritory.group;
                }
                break;
            case 'copy':
                const coords = JSON.stringify(region.polygon);
                navigator.clipboard.writeText(coords).then(() => {
                    this.showToast('Coordinates copied to clipboard');
                });
                break;
        }

        this.hideContextMenu();
    }

    /**
     * Show toast message
     */
    showToast(message) {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = 'toast info';
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }

    /**
     * Show region details panel
     */
    showRegionDetails(region) {
        const content = document.getElementById('panelContent');
        if (!content) return;

        const assignedTerritory = territoryData.getAssignedTerritory(region.regionId);
        const isAssigned = !!assignedTerritory;
        const centroid = region.centroid || this.calculateCentroid(region.polygon);

        if (isAssigned) {
            // Show assigned territory details
            const color = territoryData.getColorForGroup(assignedTerritory.group);
            const displayNumber = assignedTerritory.number || assignedTerritory.id;
            content.innerHTML = `
                <div class="territory-detail">
                    <div class="territory-header">
                        <div class="territory-number" style="background: ${color}">${displayNumber}</div>
                        <div class="territory-info">
                            <h3>${assignedTerritory.name}</h3>
                            <span class="territory-group">
                                <span class="group-color" style="background: ${color}"></span>
                                ${assignedTerritory.group}
                            </span>
                        </div>
                    </div>
                    
                    <div class="assignment-section">
                        <h4 class="section-title">Assignment History</h4>
                        <div class="assignment-records" id="assignmentHistory">
                            ${this.renderAssignmentHistory(assignedTerritory)}
                        </div>
                        <button class="btn btn-primary btn-sm" style="margin-top: 12px;" onclick="territoryMap.showAddAssignmentForm(${assignedTerritory.id})">
                            + Add Record
                        </button>
                    </div>

                    <div class="assignment-section">
                        <h4 class="section-title">Actions</h4>
                        <div class="action-buttons">
                            <button class="btn btn-secondary" onclick="territoryMap.editRegionInEditor(${region.regionId})">
                                ✏️ Edit Boundary
                            </button>
                            <button class="btn btn-secondary" onclick="territoryMap.unassignRegion(${region.regionId})">
                                Unassign
                            </button>
                        </div>
                    </div>
                </div>
            `;
        } else {
            // Show unassigned region details with assignment options
            const unassignedTerritories = territoryData.getTerritoriesWithoutPolygons();
            content.innerHTML = `
                <div class="territory-detail">
                    <div class="territory-header">
                        <div class="territory-number" style="background: #E0E0E0">?</div>
                        <div class="territory-info">
                            <h3>Unassigned Region</h3>
                            <span class="territory-group">
                                <span class="group-color" style="background: #E0E0E0"></span>
                                Region #${region.regionId}
                            </span>
                        </div>
                    </div>
                    
                    <div class="assignment-section">
                        <h4 class="section-title">Region Info</h4>
                        <div class="info-grid">
                            <div class="info-item">
                                <span class="info-label">Vertices:</span>
                                <span class="info-value">${region.polygon.length}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Area:</span>
                                <span class="info-value">${territoryData.formatArea(region.area || 0)}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Centroid:</span>
                                <span class="info-value">(${Math.round(centroid[0])}, ${Math.round(centroid[1])})</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="assignment-section">
                        <h4 class="section-title">Assign to Territory</h4>
                        <div class="form-group">
                            <select id="assignTerritorySelect" class="form-select">
                                <option value="">Select territory...</option>
                                ${unassignedTerritories.map(t => `
                                    <option value="${t.id}">${t.id} - ${t.name} (${t.group})</option>
                                `).join('')}
                            </select>
                        </div>
                        <button class="btn btn-primary" onclick="territoryMap.assignSelectedTerritory(${region.regionId})">
                            Assign
                        </button>
                    </div>
                    
                    <div class="assignment-section">
                        <h4 class="section-title">Actions</h4>
                        <div class="action-buttons">
                            <button class="btn btn-secondary" onclick="territoryMap.editRegionInEditor(${region.regionId})">
                                ✏️ Edit Boundary
                            </button>
                            <button class="btn btn-danger" onclick="territoryMap.deleteRegion(${region.regionId})">
                                🗑️ Delete Region
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }
        this.detailsPanel.classList.add('open');
    }

    /**
     * Unassign a region
     */
    async unassignRegion(regionId) {
        try {
            await territoryData.unassignRegion(regionId);
            this.showToast('Region unassigned');
            this.closeDetailsPanel();
            this.render();
        } catch (error) {
            console.error('Failed to unassign region:', error);
            this.showToast('Failed to unassign region');
        }
    }

    /**
     * Assign region to selected territory
     */
    async assignSelectedTerritory(regionId) {
        const select = document.getElementById('assignTerritorySelect');
        const territoryId = parseInt(select.value);

        if (!territoryId) {
            this.showToast('Please select a territory');
            return;
        }

        try {
            await territoryData.assignRegionToTerritory(regionId, territoryId);
            this.showToast(`Region assigned to territory ${territoryId}`);
            this.closeDetailsPanel();
            this.render();
        } catch (error) {
            console.error('Failed to assign region:', error);
            this.showToast('Failed to assign region');
        }
    }

    /**
     * Show assign dialog
     */
    showAssignDialog(region) {
        this.showRegionDetails(region);
    }

    /**
     * Delete a region
     */
    async deleteRegion(regionId) {
        if (!confirm('Are you sure you want to delete this region? This cannot be undone.')) {
            return;
        }

        try {
            await territoryData.deleteRegion(regionId);
            this.showToast('Region deleted');
            this.closeDetailsPanel();
            this.render();
        } catch (error) {
            console.error('Failed to delete region:', error);
            this.showToast('Failed to delete region');
        }
    }

    /**
     * Edit region in editor
     */
    editRegionInEditor(regionId) {
        // Switch to editor view and load the region for editing
        if (window.territoryApp) {
            window.territoryApp.switchView('editor');
            // Wait a bit for the editor to initialize, then load the region
            setTimeout(() => {
                if (window.territoryApp.editor) {
                    window.territoryApp.editor.loadRegionForEditing(regionId);
                }
            }, 100);
        }
    }

    /**
     * Render assignment history table
     */
    renderAssignmentHistory(territory) {
        if (!territory.assignments || territory.assignments.length === 0) {
            return '<p class="text-muted">No assignment records found.</p>';
        }

        const sortedAssignments = [...territory.assignments].sort((a, b) =>
            new Date(b.dateAssigned || 0) - new Date(a.dateAssigned || 0)
        );

        return `
            <table class="records-table">
                <thead>
                    <tr>
                        <th>Publisher</th>
                        <th>Period</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${sortedAssignments.map(a => `
                        <tr>
                            <td>${a.publisher || 'Unknown'}</td>
                            <td>${this.formatDateShort(a.dateAssigned)}${a.dateCompleted ? ` - ${this.formatDateShort(a.dateCompleted)}` : ' - Present'}</td>
                            <td>
                                <div class="record-actions">
                                    <span class="action-icon" onclick="territoryMap.showEditAssignmentForm(${territory.id}, ${a.id})">✏️</span>
                                    <span class="action-icon" onclick="territoryMap.deleteAssignment(${territory.id}, ${a.id})">🗑️</span>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    /**
     * Show form to add assignment
     */
    showAddAssignmentForm(territoryId) {
        this.openAssignmentModal(territoryId);
    }

    /**
     * Show form to edit assignment
     */
    showEditAssignmentForm(territoryId, assignmentId) {
        this.openAssignmentModal(territoryId, assignmentId);
    }

    /**
     * Open assignment modal
     */
    openAssignmentModal(territoryId, assignmentId = null) {
        const modal = document.getElementById('assignmentModal');
        const form = document.getElementById('assignmentForm');
        const title = document.getElementById('assignmentModalTitle');
        const tIdInput = document.getElementById('assignmentTerritoryId');
        const aIdInput = document.getElementById('editAssignmentId');

        form.reset();
        tIdInput.value = territoryId;
        aIdInput.value = assignmentId || '';

        // Default date
        document.getElementById('dateAssigned').valueAsDate = new Date();

        if (assignmentId) {
            title.textContent = 'Edit Assignment Record';
            const territory = territoryData.getTerritory(territoryId);
            const assignment = territory.assignments.find(a => a.id === assignmentId);
            if (assignment) {
                document.getElementById('publisherName').value = assignment.publisher || '';
                document.getElementById('dateAssigned').value = assignment.dateAssigned || '';
                document.getElementById('dateCompleted').value = assignment.dateCompleted || '';
            }
        } else {
            title.textContent = 'Add Assignment Record';
        }

        modal.classList.add('active');
    }

    /**
     * Close assignment modal
     */
    closeAssignmentModal() {
        document.getElementById('assignmentModal').classList.remove('active');
    }

    /**
     * Handle assignment form submission
     */
    async handleAssignmentSubmit(e) {
        e.preventDefault();

        const territoryId = parseInt(document.getElementById('assignmentTerritoryId').value);
        const assignmentId = document.getElementById('editAssignmentId').value;
        const publisher = document.getElementById('publisherName').value;
        const dateAssigned = document.getElementById('dateAssigned').value;
        const dateCompleted = document.getElementById('dateCompleted').value;

        if (!territoryId || !publisher || !dateAssigned) {
            this.showToast('Please fill in all required fields', 'warning');
            return;
        }

        const data = {
            publisher,
            dateAssigned,
            dateCompleted: dateCompleted || null
        };

        try {
            if (assignmentId) {
                await territoryData.updateAssignment(territoryId, parseInt(assignmentId), data);
                this.showToast("Assignment updated");
            } else {
                await territoryData.addAssignment(territoryId, {
                    ...data,
                    id: Date.now()
                });
                this.showToast("Assignment added");
            }

            this.closeAssignmentModal();

            // Refresh details panel
            // We need to re-fetch the territory/region to get updated data
            const region = territoryData.getExtractedRegions().find(r => r.assignedTerritoryId === territoryId);
            if (region) {
                this.showRegionDetails(region);
            } else {
                // If just viewing territory details (no polygon)
                const territory = territoryData.getTerritory(territoryId);
                this.showTerritoryDetailsPanel(territory);
            }

        } catch (error) {
            console.error("Failed to save assignment:", error);
            this.showToast("Failed to save assignment", "error");
        }
    }

    /**
     * Delete assignment
     */
    async deleteAssignment(territoryId, assignmentId) {
        if (!confirm("Are you sure you want to delete this assignment record?")) return;

        try {
            await territoryData.deleteAssignment(territoryId, assignmentId);
            this.showToast("Assignment deleted");
            // Refresh details panel
            const region = territoryData.getExtractedRegions().find(r => r.assignedTerritoryId === territoryId);
            if (region) this.showRegionDetails(region);
        } catch (error) {
            console.error("Failed to delete assignment:", error);
            this.showToast("Failed to delete assignment", "error");
        }
    }

    /**
     * Format date short
     */
    formatDateShort(dateStr) {
        if (!dateStr) return 'N/A';
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-IN', {
            month: 'short',
            day: 'numeric',
            year: '2-digit'
        });
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Zoom
        this.container.addEventListener('wheel', this.handleWheel, { passive: false });

        // Pan (mouse)
        this.container.addEventListener('mousedown', this.handleMouseDown);
        document.addEventListener('mousemove', this.handleMouseMove);
        document.addEventListener('mouseup', this.handleMouseUp);

        // Pan (touch)
        this.container.addEventListener('touchstart', this.handleTouchStart, { passive: false });
        document.addEventListener('touchmove', this.handleTouchMove, { passive: false });
        document.addEventListener('touchend', this.handleTouchEnd);

        // Zoom controls
        document.getElementById('zoomIn')?.addEventListener('click', () => this.zoomIn());
        document.getElementById('zoomOut')?.addEventListener('click', () => this.zoomOut());
        document.getElementById('zoomFit')?.addEventListener('click', () => this.fitToContainer());

        // Close details panel
        document.getElementById('closePanel')?.addEventListener('click', () => this.closeDetailsPanel());

        // Filter
        document.getElementById('groupFilter')?.addEventListener('change', (e) => {
            this.setFilter(e.target.value);
        });

        // Search
        document.getElementById('territorySearch')?.addEventListener('input', (e) => {
            this.setSearch(e.target.value);
        });

        // Assignment Modal
        document.getElementById('closeAssignmentModal')?.addEventListener('click', () => this.closeAssignmentModal());
        document.getElementById('cancelAssignmentBtn')?.addEventListener('click', () => this.closeAssignmentModal());
        document.getElementById('assignmentForm')?.addEventListener('submit', (e) => this.handleAssignmentSubmit(e));
    }

    /**
     * Setup image load handler
     */
    setupImageLoad() {
        this.background.addEventListener('load', () => {
            this.handleImageLoad();
        });

        // If image already loaded (cached)
        if (this.background.complete && this.background.naturalWidth > 0) {
            this.handleImageLoad();
        } else {
            // Show loader initially
            this.showLoader(true);
        }
    }

    /**
     * Handle image load completion
     */
    handleImageLoad() {
        this.imageWidth = this.background.naturalWidth;
        this.imageHeight = this.background.naturalHeight;
        this.updateOverlaySize();
        this.fitToContainer();
        this.render();
        this.showLoader(false);
    }

    /**
     * Show/Hide loader
     */
    showLoader(show) {
        if (this.loader) {
            if (show) {
                this.loader.classList.add('active');
            } else {
                this.loader.classList.remove('active');
            }
        }
    }

    /**
     * Update SVG overlay size to match image
     */
    updateOverlaySize() {
        this.overlay.setAttribute('width', this.imageWidth);
        this.overlay.setAttribute('height', this.imageHeight);
        this.overlay.setAttribute('viewBox', `0 0 ${this.imageWidth} ${this.imageHeight}`);
    }

    /**
     * Handle mouse wheel (zoom)
     */
    handleWheel(e) {
        e.preventDefault();

        const rect = this.container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Significantly reduce zoom speed for smoothness (1.02 factor)
        const delta = e.deltaY > 0 ? 0.98 : 1.02;
        this.zoomAtPoint(mouseX, mouseY, delta);
    }

    /**
     * Zoom at a specific point
     */
    zoomAtPoint(x, y, factor) {
        const newScale = Math.max(this.minScale, Math.min(this.maxScale, this.scale * factor));

        if (newScale === this.scale) return;

        // Calculate new position to zoom towards cursor
        const scaleDiff = newScale - this.scale;
        this.translateX -= (x - this.translateX) * (scaleDiff / this.scale);
        this.translateY -= (y - this.translateY) * (scaleDiff / this.scale);

        this.scale = newScale;
        this.applyTransform();
        this.updateZoomLevel();
    }

    /**
     * Handle mouse down (start pan)
     */
    handleMouseDown(e) {
        if (e.target.closest('.territory-polygon')) {
            return; // Don't start pan if clicking on territory
        }

        this.isDragging = true;
        this.startX = e.clientX - this.translateX;
        this.startY = e.clientY - this.translateY;
        this.container.style.cursor = 'grabbing';
    }

    /**
     * Handle mouse move (pan)
     */
    handleMouseMove(e) {
        if (!this.isDragging) return;

        this.translateX = e.clientX - this.startX;
        this.translateY = e.clientY - this.startY;
        this.applyTransform();
    }

    /**
     * Handle mouse up (end pan)
     */
    handleMouseUp() {
        this.isDragging = false;
        this.container.style.cursor = 'grab';
    }

    /**
     * Handle touch start
     */
    handleTouchStart(e) {
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            this.isDragging = true;
            this.startX = touch.clientX - this.translateX;
            this.startY = touch.clientY - this.translateY;
        } else if (e.touches.length === 2) {
            // Pinch zoom start
            this.lastPinchDistance = this.getPinchDistance(e.touches);
        }
    }

    /**
     * Handle touch move
     */
    handleTouchMove(e) {
        e.preventDefault();

        if (e.touches.length === 1 && this.isDragging) {
            const touch = e.touches[0];
            this.translateX = touch.clientX - this.startX;
            this.translateY = touch.clientY - this.startY;
            this.applyTransform();
        } else if (e.touches.length === 2) {
            // Pinch zoom
            const distance = this.getPinchDistance(e.touches);
            const factor = distance / this.lastPinchDistance;

            const rect = this.container.getBoundingClientRect();
            const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
            const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;

            this.zoomAtPoint(centerX, centerY, factor);
            this.lastPinchDistance = distance;
        }
    }

    /**
     * Handle touch end
     */
    handleTouchEnd() {
        this.isDragging = false;
    }

    /**
     * Get pinch distance between two touches
     */
    getPinchDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Apply transform to wrapper
     */
    applyTransform() {
        this.wrapper.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
    }

    /**
     * Update zoom level display
     */
    updateZoomLevel() {
        const zoomLevel = document.getElementById('zoomLevel');
        if (zoomLevel) {
            zoomLevel.textContent = `${Math.round(this.scale * 100)}%`;
        }
    }

    /**
     * Zoom in
     */
    zoomIn() {
        const rect = this.container.getBoundingClientRect();
        this.zoomAtPoint(rect.width / 2, rect.height / 2, 1.25);
    }

    /**
     * Zoom out
     */
    zoomOut() {
        const rect = this.container.getBoundingClientRect();
        this.zoomAtPoint(rect.width / 2, rect.height / 2, 0.8);
    }

    /**
     * Fit map to container
     */
    fitToContainer() {
        const containerRect = this.container.getBoundingClientRect();
        const containerWidth = containerRect.width;
        const containerHeight = containerRect.height;

        // Calculate scale to fit
        const scaleX = containerWidth / this.imageWidth;
        const scaleY = containerHeight / this.imageHeight;
        this.scale = Math.min(scaleX, scaleY) * 0.95; // 95% to add some padding

        // Center the map
        this.translateX = (containerWidth - this.imageWidth * this.scale) / 2;
        this.translateY = (containerHeight - this.imageHeight * this.scale) / 2;

        this.applyTransform();
        this.updateZoomLevel();
    }

    /**
     * Render territories on the map
     */
    render() {
        // Get extracted regions
        const regions = territoryData.getExtractedRegions();
        this.renderRegions(regions);
        this.updateLegend();
    }

    /**
     * Calculate scale factor between original image and displayed image
     */
    getScaleFactor() {
        if (!this.background.naturalWidth) return 1;
        return this.background.naturalWidth / this.regionImageWidth;
    }

    /**
     * Scale polygon coordinates from original image size to displayed image size
     */
    scalePolygon(polygon) {
        const scale = this.getScaleFactor();
        return polygon.map(p => [p[0] * scale, p[1] * scale]);
    }

    /**
     * Render extracted region polygons
     */
    renderRegions(regions) {
        // Clear existing
        this.overlay.innerHTML = '';

        // Create a group for all regions
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');

        // First, render congregation boundary if available
        const congBoundary = territoryData.getCongregationBoundary();
        if (congBoundary && congBoundary.length >= 3) {
            const scaledBoundary = this.scalePolygon(congBoundary);
            const boundaryPath = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            const points = scaledBoundary.map(p => p.join(',')).join(' ');
            boundaryPath.setAttribute('points', points);
            boundaryPath.setAttribute('class', 'congregation-boundary');
            boundaryPath.style.fill = 'none';
            boundaryPath.style.stroke = '#000';
            boundaryPath.style.strokeWidth = '5';
            g.appendChild(boundaryPath);
        }

        regions.forEach(region => {
            if (!region.polygon || region.polygon.length < 3) return;

            // Scale polygon to match displayed image size
            const scaledPolygon = this.scalePolygon(region.polygon);

            // Check if region is assigned to a territory
            const isAssigned = territoryData.isRegionAssigned(region.regionId);
            const assignedTerritory = territoryData.getAssignedTerritory(region.regionId);

            // Get group info
            const group = assignedTerritory ? territoryData.getGroup(assignedTerritory.groupId || assignedTerritory.group) : null;
            const groupName = group ? group.name : (assignedTerritory ? assignedTerritory.group : null);
            let color = territoryData.getRegionColor(region.regionId);

            if (this.colorMode === 'timeline' && assignedTerritory) {
                color = this.getTimelineColor(assignedTerritory);
            } else if (this.colorMode === 'none') {
                color = 'rgba(200, 200, 200, 0.1)';
            }

            // Get label - territory number if assigned, "?" if not
            const label = territoryData.getRegionLabel(region.regionId);

            // Create polygon
            const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            const points = scaledPolygon.map(p => p.join(',')).join(' ');
            polygon.setAttribute('points', points);
            polygon.setAttribute('class', 'territory-polygon');
            polygon.setAttribute('data-region-id', region.regionId);
            polygon.setAttribute('data-assigned', isAssigned ? 'true' : 'false');
            if (assignedTerritory) {
                polygon.setAttribute('data-territory-id', assignedTerritory.id);
                polygon.setAttribute('data-group-id', assignedTerritory.groupId || '');
                polygon.setAttribute('data-group', groupName || '');
            }
            polygon.style.fill = color;

            // Add unassigned class for different styling
            if (!isAssigned) {
                polygon.classList.add('unassigned');
            }

            // Apply filter styling - only filter assigned territories
            if (this.currentFilter !== 'all') {
                const territoryGroupId = assignedTerritory ? assignedTerritory.groupId : null;
                const territoryGroupName = assignedTerritory ? assignedTerritory.group : null;

                if (territoryGroupId != this.currentFilter && territoryGroupName !== this.currentFilter) {
                    polygon.classList.add('filtered-out');
                }
            }

            // Apply search styling
            if (this.searchQuery && !this.matchesRegionSearch(region, assignedTerritory)) {
                polygon.classList.add('filtered-out');
            }

            // Selected state
            if (this.selectedRegion && this.selectedRegion.regionId === region.regionId) {
                polygon.classList.add('selected');
            }

            // Click handler (left click)
            // Click handler (left click)
            polygon.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectRegion(region.regionId, true);
            });

            // Right click handler (context menu) - Show details and menu
            polygon.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.selectRegion(region.regionId, true);
                this.showContextMenu(e.clientX, e.clientY, region);
            });

            g.appendChild(polygon);

            // Add label
            const scaledCentroid = region.centroid ?
                [region.centroid[0] * this.getScaleFactor(), region.centroid[1] * this.getScaleFactor()] :
                this.calculateCentroid(scaledPolygon);

            if (scaledCentroid) {
                const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.setAttribute('x', scaledCentroid[0]);
                text.setAttribute('y', scaledCentroid[1]);
                text.setAttribute('class', `territory-label ${isAssigned ? 'assigned' : 'unassigned'}`);
                text.textContent = label;
                g.appendChild(text);
            }
        });

        this.overlay.appendChild(g);
    }

    /**
     * Calculate centroid of a polygon
     */
    calculateCentroid(polygon) {
        if (!polygon || polygon.length === 0) return null;
        let x = 0, y = 0;
        polygon.forEach(p => {
            x += p[0];
            y += p[1];
        });
        return [x / polygon.length, y / polygon.length];
    }

    /**
     * Check if region matches search query
     */
    matchesRegionSearch(region, assignedTerritory = null) {
        if (!this.searchQuery) return true;
        const query = this.searchQuery.toLowerCase();

        // If assigned, search by territory number and name
        if (assignedTerritory) {
            const group = territoryData.getGroup(assignedTerritory.groupId || assignedTerritory.group);
            const groupName = group ? group.name : (assignedTerritory.group || '');

            return assignedTerritory.id.toString().includes(query) ||
                (assignedTerritory.number && assignedTerritory.number.toString().includes(query)) ||
                assignedTerritory.name.toLowerCase().includes(query) ||
                groupName.toLowerCase().includes(query);
        }

        // For unassigned, just search by region ID
        return region.regionId.toString().includes(query);
    }

    /**
     * Select a region
     */
    /**
     * Select a region
     */
    selectRegion(regionId, showDetails = true) {
        const region = territoryData.getExtractedRegion(regionId);
        if (!region) return;

        this.selectedRegion = region;
        this.render();

        if (showDetails) {
            this.showRegionDetails(region);
        }
    }

    /**
     * Center view on a region
     */
    centerOnRegion(region) {
        if (!region.centroid) return;

        const scale = this.getScaleFactor();
        const centroid = [region.centroid[0] * scale, region.centroid[1] * scale];

        const containerRect = this.container.getBoundingClientRect();
        const centerX = containerRect.width / 2;
        const centerY = containerRect.height / 2;

        this.translateX = centerX - centroid[0] * this.scale;
        this.translateY = centerY - centroid[1] * this.scale;

        this.applyTransform();
    }

    /**
     * Check if territory matches search query (kept for backwards compatibility)
     */
    matchesSearch(item) {
        if (!this.searchQuery) return true;
        const query = this.searchQuery.toLowerCase();

        const group = territoryData.getGroup(item.groupId || item.group);
        const groupName = group ? group.name : (item.group || '');

        if (item.id) {
            return item.id.toString().includes(query) ||
                (item.number && item.number.toString().includes(query)) ||
                (item.name && item.name.toLowerCase().includes(query)) ||
                groupName.toLowerCase().includes(query);
        }
        return item.regionId.toString().includes(query);
    }

    /**
     * Set filter
     */
    setFilter(group) {
        this.currentFilter = group;
        this.render();
    }

    /**
     * Set search query
     */
    setSearch(query) {
        this.searchQuery = query;
        this.render();
    }

    /**
     * Select a territory (legacy method for list view compatibility)
     */
    selectTerritory(id) {
        const territory = territoryData.getTerritory(id);
        if (!territory) return;

        // If territory has a polygon, show it
        if (territory.polygon && territory.polygon.length > 0) {
            this.showTerritoryDetailsPanel(territory);
            // Don't auto-center per user request
            // this.centerOnTerritory(territory);
        } else {
            // Show territory info without polygon
            this.showTerritoryDetailsPanel(territory);
        }
    }

    /**
     * Center view on a territory
     */
    centerOnTerritory(territory) {
        if (!territory.polygon || territory.polygon.length === 0) return;

        const centroid = territoryData.calculateCentroid(territory.polygon);
        if (!centroid) return;

        const scale = this.getScaleFactor();
        const scaledCentroid = [centroid[0] * scale, centroid[1] * scale];

        const containerRect = this.container.getBoundingClientRect();
        const centerX = containerRect.width / 2;
        const centerY = containerRect.height / 2;

        this.translateX = centerX - scaledCentroid[0] * this.scale;
        this.translateY = centerY - scaledCentroid[1] * this.scale;

        this.applyTransform();
    }

    /**
     * Show details panel for a territory
     */
    showTerritoryDetailsPanel(territory) {
        const content = document.getElementById('panelContent');
        if (!content) return;

        content.innerHTML = this.renderTerritoryDetails(territory);
        this.detailsPanel.classList.add('open');
    }

    /**
     * Render territory details HTML
     */
    renderTerritoryDetails(territory) {
        const displayNumber = territory.number || territory.id;
        const group = territoryData.getGroup(territory.groupId || territory.group);
        const groupName = group ? group.name : (territory.group || 'Unassigned');
        const color = group ? group.color : '#ccc';
        const assignments = territory.assignments || [];

        // Sort by completion date descending
        const sortedAssignments = [...assignments].sort((a, b) =>
            new Date(b.dateCompleted || b.dateAssigned || 0) - new Date(a.dateCompleted || a.dateAssigned || 0)
        );

        return `
            <div class="territory-detail">
                <div class="territory-header">
                    <div class="territory-number" style="background: ${color}">${displayNumber}</div>
                    <div class="territory-info">
                        <h3>${territory.name}</h3>
                        <div class="territory-group">
                            <span class="group-color" style="background: ${color}"></span>
                            ${groupName}
                        </div>
                    </div>
                </div>

                <div class="assignment-section" style="padding-top: 0">
                    <div class="info-grid">
                        <div class="info-item">
                            <span class="info-label">Area:</span>
                            <span class="info-value">${territory.polygon ? territoryData.formatArea(territoryData.calculateArea(territory.polygon)) : 'No boundary set'}</span>
                        </div>
                    </div>
                </div>

                ${territory.description ? `
                <div class="assignment-section">
                    <h4 class="section-title">Description</h4>
                    <p class="territory-description-text">${territory.description}</p>
                </div>
                ` : ''}

                <div class="assignment-section">
                    <h4 class="section-title">Assignment History</h4>
                    <div class="assignment-records">
                        ${this.renderAssignmentHistory(territory)}
                    </div>
                    <button class="btn btn-primary btn-sm" style="margin-top: 12px;" onclick="territoryMap.showAddAssignmentForm(${territory.id})">
                        + Add Record
                    </button>
                </div>

                <div class="assignment-section">
                    <h4 class="section-title">Actions</h4>
                    <div class="action-buttons">
                        <button class="btn btn-secondary" onclick="app.openTerritoryModal(${territory.id})">
                            ✏️ Edit Territory
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Get coloring for timeline mode
     */
    getTimelineColor(territory) {
        const assignments = territory.assignments || [];
        const completed = assignments.filter(a => a.dateCompleted).map(a => new Date(a.dateCompleted)).sort((a, b) => b - a);

        if (completed.length === 0) return '#C62828'; // Muted Dark Red (Never)

        const lastDate = completed[0];
        const now = new Date();
        const currentYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
        const serviceYearStart = new Date(currentYear, 8, 1);

        if (lastDate >= serviceYearStart) {
            const monthsAgo = (now.getFullYear() - lastDate.getFullYear()) * 12 + now.getMonth() - lastDate.getMonth();
            return monthsAgo <= 2 ? '#4CAF50' : '#A5D6A7'; // Pastel Green if < 2 months, else Muted Light Green
        } else {
            const diffYears = (now - lastDate) / (1000 * 60 * 60 * 24 * 365);
            if (diffYears > 2) return '#D32F2F'; // Muted Red if > 2 years
            if (diffYears > 1) return '#E57373'; // Pastel Red if > 1 year
            return '#FFCDD2'; // Very Light Red
        }
    }

    /**
     * Format date for display
     */
    formatDate(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    /**
     * Close details panel
     */
    closeDetailsPanel() {
        this.detailsPanel.classList.remove('open');
        this.selectedRegion = null;
        this.render();
    }

    /**
     * Highlight a territory (from list view)
     */
    highlightTerritory(id) {
        this.selectTerritory(id);
    }

    /**
     * Highlight a region by ID
     */
    highlightRegion(regionId) {
        this.selectRegion(regionId);
    }

    /**
     * Resize handler
     */
    handleResize() {
        this.fitToContainer();
    }
}

// Export
let territoryMap = null;

