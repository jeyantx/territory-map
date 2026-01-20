/**
 * Main Application
 * 
 * Territory Map Application for Chennai Urappakkam Congregation
 * Integrates all modules and handles navigation.
 */

class App {
    constructor() {
        this.currentView = 'map';
        this.isInitialized = false;
        this.isAuthenticated = false;
        this.password = "242424";
    }

    /**
     * Initialize the application
     */
    async init() {
        try {
            // Setup mobile restriction
            this.setupMobileRestriction();

            // Check authentication
            this.setupLogin();
            if (!this.checkAuth()) {
                this.showLoading(false);
                return;
            }

            this.showLoading(true);

            // Initialize storage
            await storage.init();

            // Initialize territory data
            await territoryData.init();

            // Initialize map
            territoryMap = new TerritoryMap('mapContainer');
            territoryMap.init();

            // Initialize editor
            territoryEditor = new TerritoryEditor();
            territoryEditor.init();

            // Setup event listeners
            this.setupEventListeners();
            this.setupGroupManagement();

            // Render initial views
            this.renderListView();
            this.populateGroupSelects();

            // Add data change listener
            territoryData.addListener((event, data) => {
                this.handleDataChange(event, data);
                if (event === 'groupsUpdated' || event === 'init') {
                    this.populateGroupSelects();
                    if (this.currentView === 'list') this.renderListView();
                }
            });

            this.isInitialized = true;
            this.showLoading(false);

            console.log('Territory Map App initialized successfully');

        } catch (error) {
            console.error('Failed to initialize app:', error);
            this.showLoading(false);
            this.showError('Failed to load territory data. Please refresh the page.');
        }
    }

    /**
     * Setup login logic
     */
    setupLogin() {
        const loginOverlay = document.getElementById('loginOverlay');
        const loginForm = document.getElementById('loginForm');
        const loginPassword = document.getElementById('loginPassword');
        const loginError = document.getElementById('loginError');

        if (!loginForm) return;

        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (loginPassword.value === this.password) {
                this.isAuthenticated = true;
                localStorage.setItem('territory_auth', 'true');
                loginOverlay.classList.remove('active');
                this.init();
            } else {
                loginError.classList.add('active');
                setTimeout(() => loginError.classList.remove('active'), 3000);
            }
        });
    }

    /**
     * Check if user is authenticated
     */
    checkAuth() {
        if (this.isAuthenticated) return true;
        const auth = localStorage.getItem('territory_auth');
        if (auth === 'true') {
            this.isAuthenticated = true;
            document.getElementById('loginOverlay')?.classList.remove('active');
            // Check auto-logout (2 days inactivity)
            const lastLogin = localStorage.getItem('territory_last_login');
            if (lastLogin) {
                const twoDays = 2 * 24 * 60 * 60 * 1000;
                if (Date.now() - parseInt(lastLogin) > twoDays) {
                    this.logout();
                    return false;
                }
            }

            // Update last login
            localStorage.setItem('territory_last_login', Date.now().toString());
            return true;
        }

        /**
         * Logout
         */
        logout() {
            this.isAuthenticated = false;
            localStorage.removeItem('territory_auth');
            localStorage.removeItem('territory_last_login');
            window.location.reload();
        }

        /**
         * Setup mobile restriction
         */
        setupMobileRestriction() {
            const isMobile = window.innerWidth <= 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

            if (isMobile) {
                const restrictionOverlay = document.createElement('div');
                restrictionOverlay.className = 'mobile-restriction-overlay';
                restrictionOverlay.innerHTML = `
                <div class="restriction-content">
                    <div class="restriction-icon">💻</div>
                    <h2>Desktop Required</h2>
                    <p>For the best experience while managing territory maps and boundaries, please use a desktop or laptop system.</p>
                </div>
            `;
                document.body.appendChild(restrictionOverlay);
            }
        }

        /**
         * Setup event listeners
         */
        setupEventListeners() {
            // Navigation
            document.querySelectorAll('.nav-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const view = btn.dataset.view;
                    this.switchView(view);
                });
            });

            // List view search and filter
            document.getElementById('listSearch')?.addEventListener('input', (e) => {
                this.filterListView(e.target.value, document.getElementById('listGroupFilter')?.value);
            });

            document.getElementById('listGroupFilter')?.addEventListener('change', (e) => {
                this.filterListView(document.getElementById('listSearch')?.value, e.target.value);
            });

            // Map color mode
            document.getElementById('colorModeFilter')?.addEventListener('change', (e) => {
                if (territoryMap) {
                    territoryMap.setColorMode(e.target.value);
                }
            });

            // Map layer (Simple vs Earth)
            document.getElementById('mapLayerFilter')?.addEventListener('change', (e) => {
                if (territoryMap) {
                    territoryMap.setMapLayer(e.target.value);
                }
            });

            // Territory CRUD
            document.getElementById('addTerritoryBtn')?.addEventListener('click', () => {
                this.openTerritoryModal();
            });

            document.getElementById('closeModal')?.addEventListener('click', () => {
                this.closeTerritoryModal();
            });

            document.getElementById('cancelTerritoryBtn')?.addEventListener('click', () => {
                this.closeTerritoryModal();
            });

            document.getElementById('territoryForm')?.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleTerritorySubmit();
            });

            // Window resize
            window.addEventListener('resize', () => {
                if (this.currentView === 'map' && territoryMap) {
                    territoryMap.handleResize();
                }
            });

            // Keyboard shortcuts
            document.addEventListener('keydown', (e) => {
                this.handleKeyboardShortcuts(e);
            });

            // Close list details panel
            document.getElementById('closeListPanel')?.addEventListener('click', () => {
                this.closeListDetailsPanel();
            });

            // Report view
            document.getElementById('printReportBtn')?.addEventListener('click', () => {
                window.print();
            });

            document.getElementById('serviceYear')?.addEventListener('change', (e) => {
                this.renderReport(e.target.value);
            });

            // Backup & Logout
            document.getElementById('backupToolsBtn')?.addEventListener('click', () => {
                if (confirm('Do you want to export all data for backup?')) {
                    storage.exportData();
                }
            });

            document.getElementById('logoutBtn')?.addEventListener('click', () => {
                if (confirm('Are you sure you want to logout?')) {
                    this.logout();
                }
            });

            // Add Import Button handling (hidden input)
            let importInput = document.getElementById('importDataInput');
            if (!importInput) {
                importInput = document.createElement('input');
                importInput.type = 'file';
                importInput.accept = '.json';
                importInput.style.display = 'none';
                importInput.id = 'importDataInput';
                document.body.appendChild(importInput);
            }

            importInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    // Check password
                    const password = prompt("Enter password to import data:");
                    if (password === "343434") {
                        this.showLoading(true);
                        storage.importData(file).then(() => {
                            this.showLoading(false);
                            this.showToast('Data imported successfully. Refreshing...', 'success');
                            setTimeout(() => window.location.reload(), 1500);
                        }).catch(err => {
                            this.showLoading(false);
                            this.showToast('Import failed: ' + err.message, 'error');
                        });
                    } else if (password) {
                        alert("Incorrect password");
                    }
                }
                // Reset input
                e.target.value = '';
            });

            // Right click on backup button to trigger import
            document.getElementById('backupToolsBtn')?.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                importInput.click();
            });
        }

        /**
         * Setup Group Management UI
         */
        setupGroupManagement() {
            const form = document.getElementById('groupForm');
            const resetBtn = document.getElementById('resetGroupFormBtn');

            resetBtn?.addEventListener('click', () => {
                form.reset();
                document.getElementById('editGroupId').value = '';
                document.getElementById('saveGroupBtn').textContent = 'Add Group';
                document.getElementById('groupFormTitle').textContent = 'Add New Group';
            });

            form?.addEventListener('submit', async (e) => {
                e.preventDefault();
                const id = document.getElementById('editGroupId').value;
                const name = document.getElementById('groupNameInput').value;
                const color = document.getElementById('groupColorInput').value;

                try {
                    if (id) {
                        await territoryData.updateGroup(id, { name, color });
                        this.showToast('Group updated');
                    } else {
                        await territoryData.addGroup({ name, color });
                        this.showToast('Group added');
                    }
                    form.reset();
                    document.getElementById('editGroupId').value = '';
                    document.getElementById('saveGroupBtn').textContent = 'Add Group';
                    this.renderGroupsManager();
                    this.populateGroupSelects();
                } catch (err) {
                    this.showToast(err.message, 'error');
                }
            });

            // Sync color input and hex text
            const colorInput = document.getElementById('groupColorInput');
            const hexInput = document.getElementById('groupColorHexInput');

            colorInput?.addEventListener('input', (e) => hexInput.value = e.target.value.toUpperCase());
            hexInput?.addEventListener('input', (e) => {
                if (/^#[0-9A-F]{6}$/i.test(e.target.value)) {
                    colorInput.value = e.target.value;
                }
            });
        }

        /**
         * Populate group selects
         */
        populateGroupSelects() {
            const groups = territoryData.getAllGroups();
            const selects = [
                { id: 'groupFilter', type: 'filter' },
                { id: 'listGroupFilter', type: 'filter' },
                { id: 'territoryGroupInput', type: 'form' },
                { id: 'assignTerritory', type: 'editor' }
            ];

            selects.forEach(item => {
                const select = document.getElementById(item.id);
                if (!select) return;

                const currentValue = select.value;
                let options = '';

                if (item.type === 'filter') {
                    options = '<option value="all">All Groups</option>';
                } else if (item.type === 'form') {
                    options = '<option value="">Select group...</option>';
                } else if (item.type === 'editor') {
                    // Done by editor.js
                    return;
                }

                options += groups.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
                select.innerHTML = options;

                // Try to restore selection
                if (currentValue) select.value = currentValue;
            });
        }

        /**
         * Render groups list in manager
         */
        renderGroupsManager() {
            const container = document.getElementById('groupsListItems');
            if (!container) return;

            const groups = territoryData.getAllGroups();
            if (groups.length === 0) {
                container.innerHTML = '<p class="text-muted">No groups created yet. Use the form to add one.</p>';
                return;
            }

            container.innerHTML = groups.map(g => `
            <div class="group-manager-item">
                <div class="group-info-main">
                    <div class="group-swatch" style="background: ${g.color}"></div>
                    <span class="group-name-label">${g.name}</span>
                </div>
                <div class="group-actions">
                    <button class="btn-icon" onclick="app.editGroup(${g.id}, '${g.name}', '${g.color}')" title="Edit Group">✏️</button>
                    <button class="btn-icon" onclick="app.deleteGroup(${g.id})" title="Delete Group">🗑️</button>
                </div>
            </div>
        `).join('');
        }

        editGroup(id, name, color) {
            document.getElementById('editGroupId').value = id;
            document.getElementById('groupNameInput').value = name;
            document.getElementById('groupColorInput').value = color;
            document.getElementById('groupColorHexInput').value = color.toUpperCase();
            document.getElementById('saveGroupBtn').textContent = 'Update Group';
            document.getElementById('groupFormTitle').textContent = 'Edit Group';
            // Scroll form into view on mobile
            if (window.innerWidth <= 900) {
                document.querySelector('.groups-form-card').scrollIntoView({ behavior: 'smooth' });
            }
        }

    async deleteGroup(id) {
            if (!confirm('Are you sure? Groups containing territories cannot be deleted.')) return;
            try {
                await territoryData.deleteGroup(id);
                this.showToast('Group deleted');
                this.renderGroupsManager();
                this.populateGroupSelects();
            } catch (err) {
                this.showToast(err.message, 'error');
            }
        }

        /**
         * Switch view
         */
        switchView(view) {
            this.currentView = view;

            // Update nav buttons
            document.querySelectorAll('.nav-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.view === view);
            });

            // Update view sections
            document.querySelectorAll('.view-section').forEach(section => {
                section.classList.remove('active');
            });

            const viewElement = document.getElementById(`${view}View`);
            if (viewElement) {
                viewElement.classList.add('active');
            }

            // View-specific actions
            switch (view) {
                case 'map':
                    if (territoryMap) {
                        territoryMap.handleResize();
                        territoryMap.render();
                    }
                    break;
                case 'list':
                    this.renderListView();
                    break;
                case 'editor':
                    if (territoryEditor) {
                        territoryEditor.render();
                        territoryEditor.updateUnassignedList();
                    }
                    break;
                case 'report':
                    this.setupReportView();
                    break;
                case 'groups':
                    this.renderGroupsManager();
                    break;
            }
        }

        /**
         * Render list view
         */
        renderListView() {
            const listContainer = document.getElementById('territoryList');
            const statsElement = document.getElementById('listStats');

            if (!listContainer) return;

            const territories = territoryData.getAllTerritories();
            const stats = territoryData.getStats();

            // Update stats
            if (statsElement) {
                statsElement.innerHTML = `
                <span class="stat-item">Total: <strong>${stats.total}</strong></span>
                <span class="stat-item">With Boundaries: <strong>${stats.withPolygons}</strong></span>
                <span class="stat-item">Missing: <strong>${stats.withoutPolygons}</strong></span>
            `;
            }

            // Render cards
            this.renderTerritoryCards(territories);
        }

        /**
         * Render territory cards
         */
        renderTerritoryCards(territories) {
            const listContainer = document.getElementById('territoryList');
            if (!listContainer) return;

            if (territories.length === 0) {
                listContainer.innerHTML = `
                <div class="empty-state">
                    <p class="text-muted">No territories found matching your criteria.</p>
                </div>
            `;
                return;
            }

            listContainer.innerHTML = territories.map(territory => {
                const displayNumber = territory.number || territory.id;
                const assignments = territory.assignments || [];

                // Resolve group info
                const group = territoryData.getGroup(territory.groupId || territory.group);
                const groupName = group ? group.name : (territory.group || 'Unassigned');
                const groupColor = group ? group.color : '#ccc';
                const groupSafeName = groupName.toLowerCase().replace(/\s+/g, '-');

                // Sort by completion date descending
                const sortedAssignments = [...assignments].sort((a, b) =>
                    new Date(b.dateCompleted || b.dateAssigned || 0) - new Date(a.dateCompleted || a.dateAssigned || 0)
                );
                const lastAssignment = sortedAssignments[0];

                return `
                <div class="territory-card" data-id="${territory.id}" data-group="${groupName}">
                    <div class="card-header">
                        <span class="card-number" style="background: ${groupColor}">${displayNumber}</span>
                        <span class="card-name">${territory.name}</span>
                        <div class="card-actions">
                            <button class="btn-icon view-territory" title="View Details" data-id="${territory.id}">
                                👁️
                            </button>
                            <button class="btn-icon edit-territory" title="Edit Territory" data-id="${territory.id}">
                                ✏️
                            </button>
                            <button class="btn-icon delete-territory" title="Delete Territory" data-id="${territory.id}">
                                🗑️
                            </button>
                        </div>
                    </div>
                    <div class="card-group ${groupSafeName}">${groupName}</div>
                    <div class="card-meta">
                        <span>${lastAssignment ? `Last: ${this.formatDate(lastAssignment.dateCompleted || lastAssignment.dateAssigned)}` : 'Never assigned'}</span>
                    </div>
                    ${territory.description ? `<div class="card-description">${territory.description}</div>` : ''}
                </div>
            `;
            }).join('');

            // Add click handlers
            listContainer.querySelectorAll('.territory-card').forEach(card => {
                card.addEventListener('click', (e) => {
                    // Don't trigger if action button was clicked
                    if (e.target.closest('.card-actions')) return;

                    const id = parseInt(card.dataset.id);
                    this.showListDetailPanel(id);
                });
            });

            // View details handlers
            listContainer.querySelectorAll('.view-territory').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const id = parseInt(btn.dataset.id);
                    this.showListDetailPanel(id);
                });
            });

            // Edit/Delete handlers
            listContainer.querySelectorAll('.edit-territory').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const id = parseInt(btn.dataset.id);
                    this.openTerritoryModal(id);
                });
            });

            listContainer.querySelectorAll('.delete-territory').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const id = parseInt(btn.dataset.id);
                    this.handleDeleteTerritory(id);
                });
            });
        }

        /**
         * Open territory modal
         */
        openTerritoryModal(territoryId = null) {
            const modal = document.getElementById('territoryModal');
            const form = document.getElementById('territoryForm');
            const title = document.getElementById('modalTitle');
            const numberInput = document.getElementById('territoryNumberInput');

            form.reset();
            document.getElementById('editTerritoryId').value = territoryId || '';

            if (territoryId) {
                title.textContent = 'Edit Territory';
                const territory = territoryData.getTerritory(territoryId);
                if (territory) {
                    numberInput.value = territory.number || territory.id;
                    document.getElementById('territoryNameInput').value = territory.name;
                    document.getElementById('territoryGroupInput').value = territory.groupId || '';
                    document.getElementById('territoryDescriptionInput').value = territory.description || '';
                }
            } else {
                title.textContent = 'Add Territory';
                // Auto-calculate next number
                const territories = territoryData.getAllTerritories();
                const maxNum = territories.reduce((max, t) => {
                    const num = parseInt(t.number || t.id) || 0;
                    return Math.max(max, num);
                }, 0);
                numberInput.value = maxNum + 1;
            }

            modal.classList.add('active');
        }

        /**
         * Close territory modal
         */
        closeTerritoryModal() {
            document.getElementById('territoryModal').classList.remove('active');
        }

    /**
     * Handle territory form submission
     */
    async handleTerritorySubmit() {
            const editId = document.getElementById('editTerritoryId').value;
            const number = document.getElementById('territoryNumberInput').value.trim();
            const name = document.getElementById('territoryNameInput').value;
            const group = document.getElementById('territoryGroupInput').value;
            const description = document.getElementById('territoryDescriptionInput').value;

            if (!number) {
                this.showToast('Territory number is required', 'error');
                return;
            }

            try {
                if (editId) {
                    // Update existing territory
                    const territoryDataObj = {
                        number,
                        name,
                        groupId: parseInt(group),
                        description
                    };
                    await territoryData.updateTerritory(parseInt(editId), territoryDataObj);
                    this.showToast('Territory updated successfully', 'success');
                } else {
                    // Create new territory with auto-generated ID
                    const territories = territoryData.getAllTerritories();
                    const nextId = territories.reduce((max, t) => Math.max(max, t.id), 0) + 1;

                    const territoryDataObj = {
                        id: nextId,
                        number,
                        name,
                        groupId: parseInt(group),
                        description
                    };

                    await territoryData.addTerritory(territoryDataObj);
                    this.showToast('Territory added successfully', 'success');
                }

                this.closeTerritoryModal();
                this.renderListView();
                if (territoryMap) territoryMap.render();

            } catch (error) {
                console.error('Failed to save territory:', error);
                this.showToast('Failed to save territory', 'error');
            }
        }

    /**
     * Handle territory deletion
     */
    async handleDeleteTerritory(id) {
            if (!confirm(`Are you sure you want to delete territory #${id}? This will also unassign any map regions associated with it.`)) {
                return;
            }

            try {
                await territoryData.deleteTerritory(id);
                this.showToast('Territory deleted successfully', 'success');
                this.renderListView();
                if (territoryMap) territoryMap.render();
            } catch (error) {
                console.error('Failed to delete territory:', error);
                this.showToast('Failed to delete territory', 'error');
            }
        }

        /**
         * Filter list view
         */
        filterListView(search = '', group = 'all') {
            const territories = territoryData.filterTerritories({ search, group });
            this.renderTerritoryCards(territories);

            // Update stats
            const statsElement = document.getElementById('listStats');
            if (statsElement) {
                statsElement.innerHTML = `
                <span class="stat-item">Showing: <strong>${territories.length}</strong></span>
            `;
            }
        }

        /**
         * Show territory on map
         */
        showTerritoryOnMap(id) {
            this.switchView('map');
            if (territoryMap) {
                territoryMap.highlightTerritory(id);
            }
        }

        /**
         * Show territory details in list panel (unified with map panel)
         */
        showListDetailPanel(id) {
            const territory = territoryData.getTerritory(id);
            if (!territory) return;

            const panel = document.getElementById('listDetailsPanel');
            const content = document.getElementById('listPanelContent');
            if (!panel || !content) return;

            const displayNumber = territory.number || territory.id;
            const group = territoryData.getGroup(territory.groupId || territory.group);
            const groupName = group ? group.name : (territory.group || 'Unassigned');
            const color = group ? group.color : '#ccc';
            const assignments = territory.assignments || [];

            // Sort assignments by date (most recent first)
            const sortedAssignments = [...assignments].sort((a, b) =>
                new Date(b.dateAssigned || 0) - new Date(a.dateAssigned || 0)
            );

            content.innerHTML = `
            <div class="territory-detail">
                <div class="territory-header">
                    <div class="territory-number" style="background: ${color}">${displayNumber}</div>
                    <div class="territory-info">
                        <h3>${territory.name}</h3>
                        <span class="territory-group">
                            <span class="group-color" style="background: ${color}"></span>
                            ${groupName}
                        </span>
                    </div>
                </div>

                ${territory.description ? `
                <div class="assignment-section">
                    <h4 class="section-title">Description</h4>
                    <p class="territory-description-text">${territory.description.replace(/\n/g, '<br>')}</p>
                </div>
                ` : ''}
                
                <div class="assignment-section">
                    <h4 class="section-title">Assignment History</h4>
                    <div class="assignment-records">
                        ${sortedAssignments.length > 0 ? `
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
                                            <td>${this.formatDate(a.dateAssigned)}${a.dateCompleted ? ` - ${this.formatDate(a.dateCompleted)}` : ' - Present'}</td>
                                            <td>
                                                <div class="record-actions">
                                                    <span class="action-icon" onclick="app.editAssignment(${territory.id}, ${a.id})">✏️</span>
                                                    <span class="action-icon" onclick="app.deleteAssignment(${territory.id}, ${a.id})">🗑️</span>
                                                </div>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        ` : '<p class="text-muted">No assignment records found.</p>'}
                    </div>
                    <button class="btn btn-primary btn-sm" style="margin-top: 12px;" onclick="app.showAddAssignmentModal(${territory.id})">
                        + Add Record
                    </button>
                </div>

                <div class="assignment-section">
                    <h4 class="section-title">Actions</h4>
                    <div class="action-buttons">
                        <button class="btn btn-secondary" onclick="app.openTerritoryModal(${territory.id})">
                            ✏️ Edit Territory
                        </button>
                        <button class="btn btn-secondary" onclick="app.showTerritoryOnMap(${territory.id})">
                            🗺️ View on Map
                        </button>
                    </div>
                </div>
            </div>
        `;

            panel.classList.add('open');
        }

        /**
         * Close list details panel
         */
        closeListDetailsPanel() {
            const panel = document.getElementById('listDetailsPanel');
            if (panel) {
                panel.classList.remove('open');
            }
        }

        /**
         * Show add assignment modal (delegates to map's modal)
         */
        showAddAssignmentModal(territoryId) {
            if (territoryMap) {
                territoryMap.openAssignmentModal(territoryId);
            }
        }

        /**
         * Edit assignment
         */
        editAssignment(territoryId, assignmentId) {
            if (territoryMap) {
                territoryMap.openAssignmentModal(territoryId, assignmentId);
            }
        }

    /**
     * Delete assignment
     */
    async deleteAssignment(territoryId, assignmentId) {
            if (!confirm('Are you sure you want to delete this assignment record?')) return;

            try {
                await territoryData.deleteAssignment(territoryId, assignmentId);
                this.showToast('Assignment deleted', 'success');
                this.showListDetailPanel(territoryId); // Refresh panel
            } catch (error) {
                console.error('Failed to delete assignment:', error);
                this.showToast('Failed to delete assignment', 'error');
            }
        }

    /**
     * Export data
     */
    async exportData() {
            try {
                await storage.exportData();
                this.showToast('Data exported successfully', 'success');
            } catch (error) {
                console.error('Export failed:', error);
                this.showToast('Failed to export data', 'error');
            }
        }

    /**
     * Import data
     */
    async importData(file) {
            try {
                await storage.importData(file);
                await territoryData.init();

                // Refresh views
                this.renderListView();
                if (territoryMap) {
                    territoryMap.render();
                }
                if (territoryEditor) {
                    territoryEditor.populateTerritorySelect();
                    territoryEditor.updateUnassignedList();
                    territoryEditor.render();
                }

                this.showToast('Data imported successfully', 'success');
            } catch (error) {
                console.error('Import failed:', error);
                this.showToast('Failed to import data: ' + error.message, 'error');
            }
        }

        /**
         * Handle data changes
         */
        handleDataChange(event, data) {
            console.log('Data changed:', event, data);

            // Refresh relevant views
            if (this.currentView === 'list') {
                this.renderListView();
            }
            if (this.currentView === 'map' && territoryMap) {
                territoryMap.render();
            }
        }

        /**
         * Handle keyboard shortcuts
         */
        handleKeyboardShortcuts(e) {
            // Global shortcuts
            if (e.altKey) {
                switch (e.key) {
                    case '1':
                        this.switchView('map');
                        e.preventDefault();
                        break;
                    case '2':
                        this.switchView('list');
                        e.preventDefault();
                        break;
                    case '3':
                        this.switchView('editor');
                        e.preventDefault();
                        break;
                }
            }

            // Ctrl/Cmd shortcuts
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 's':
                        // Save
                        e.preventDefault();
                        storage.save().then(() => {
                            this.showToast('Saved to cloud', 'success');
                        }).catch(err => {
                            this.showToast('Failed to save', 'error');
                        });
                        break;
                }
            }
        }

        /**
         * Show loading overlay
         */
        showLoading(show) {
            const overlay = document.getElementById('loadingOverlay');
            if (overlay) {
                overlay.classList.toggle('hidden', !show);
            }
        }

        /**
         * Show error message
         */
        showError(message) {
            const overlay = document.getElementById('loadingOverlay');
            if (overlay) {
                overlay.innerHTML = `
                <div class="error-icon">⚠️</div>
                <p class="error-text">${message}</p>
                <button class="btn btn-primary" onclick="location.reload()">Reload</button>
            `;
                overlay.classList.remove('hidden');
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

        /**
         * Format date for display
         */
        formatDate(dateStr) {
            if (!dateStr) return 'N/A';
            const date = new Date(dateStr);
            return date.toLocaleDateString('en-IN', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        }

        /**
         * Setup Report View
         */
        setupReportView() {
            const yearSelect = document.getElementById('serviceYear');
            if (!yearSelect) return;

            // Populate service years
            const years = this.getServiceYears();
            yearSelect.innerHTML = years.map(year =>
                `<option value="${year.value}" ${year.current ? 'selected' : ''}>${year.label}</option>`
            ).join('');

            // Render for current service year
            const currentYear = years.find(y => y.current);
            if (currentYear) {
                this.renderReport(currentYear.value);
            }
        }

        /**
         * Get available service years
         */
        getServiceYears() {
            const years = [];
            const currentDate = new Date();
            const currentMonth = currentDate.getMonth(); // 0-11
            const currentYear = currentDate.getFullYear();

            // Service year runs Sep to Aug
            // If we're in Sep-Dec, current service year starts this year
            // If we're in Jan-Aug, current service year started last year
            const serviceYearStart = currentMonth >= 8 ? currentYear : currentYear - 1;

            // Generate last 5 years and next year
            for (let i = -1; i < 5; i++) {
                const startYear = serviceYearStart - i;
                const endYear = startYear + 1;
                years.push({
                    value: `${startYear}-${endYear}`,
                    label: `${startYear} - ${endYear}`,
                    current: i === 0
                });
            }

            return years;
        }

        /**
         * Render S-13-E Report
         */
        renderReport(serviceYearValue) {
            const container = document.getElementById('reportContainer');
            if (!container) return;

            const [startYear, endYear] = serviceYearValue.split('-').map(Number);
            const territories = territoryData.getAllTerritories();

            // Sort territories by number
            const sortedTerritories = [...territories].sort((a, b) => {
                const numA = parseInt(a.number || a.id) || 0;
                const numB = parseInt(b.number || b.id) || 0;
                return numA - numB;
            });

            // Service year date range: Sep 1 of start year to Aug 31 of end year
            const serviceYearStart = new Date(startYear, 8, 1); // Sep 1
            const serviceYearEnd = new Date(endYear, 7, 31);    // Aug 31

            // Split into pages (20 territories per page)
            const territoriesPerPage = 20;
            const pages = [];
            for (let i = 0; i < sortedTerritories.length; i += territoriesPerPage) {
                pages.push(sortedTerritories.slice(i, i + territoriesPerPage));
            }

            // Render each page
            container.innerHTML = pages.map((pageTerritories, pageIndex) => `
            <div class="report-page">
                <div class="report-page-header">
                    <h1 class="report-main-title">TERRITORY ASSIGNMENT RECORD</h1>
                    <div class="report-service-year">
                        <span class="report-service-year-label">Service Year:</span>
                        <span class="report-service-year-value">${startYear} - ${endYear}</span>
                    </div>
                </div>
                <table class="report-table">
                    <thead>
                        <tr class="header-row">
                            <th rowspan="2" class="col-terr-no">Terr.<br>no</th>
                            <th rowspan="2" class="col-last-completed">Last date<br>completed*</th>
                            <th colspan="2" class="col-assigned-to">Assigned to</th>
                            <th colspan="2" class="col-assigned-to">Assigned to</th>
                            <th colspan="2" class="col-assigned-to">Assigned to</th>
                            <th colspan="2" class="col-assigned-to">Assigned to</th>
                        </tr>
                        <tr class="subheader-row">
                            <th class="col-date">Date<br>assigned</th>
                            <th class="col-date">Date<br>completed</th>
                            <th class="col-date">Date<br>assigned</th>
                            <th class="col-date">Date<br>completed</th>
                            <th class="col-date">Date<br>assigned</th>
                            <th class="col-date">Date<br>completed</th>
                            <th class="col-date">Date<br>assigned</th>
                            <th class="col-date">Date<br>completed</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${pageTerritories.map(territory => this.renderReportRow(territory, serviceYearStart, serviceYearEnd)).join('')}
                    </tbody>
                </table>
                <div class="report-page-footer">
                    <span class="report-note">*When beginning a new sheet, use this column to record the date on which each territory was last completed.</span>
                    <span class="report-form-id">S-13-E</span>
                </div>
            </div>
        `).join('');
        }

        /**
         * Render a single report row
         */
        renderReportRow(territory, serviceYearStart, serviceYearEnd) {
            const displayNumber = territory.number || territory.id;
            const assignments = territory.assignments || [];

            // Filter and sort assignments for this service year
            const yearAssignments = assignments
                .filter(a => {
                    const assignedDate = new Date(a.dateAssigned);
                    return assignedDate >= serviceYearStart && assignedDate <= serviceYearEnd;
                })
                .sort((a, b) => new Date(a.dateAssigned) - new Date(b.dateAssigned));

            // Get the most recent completed date (from any time, not just this service year)
            const allCompleted = assignments
                .filter(a => a.dateCompleted)
                .map(a => new Date(a.dateCompleted))
                .sort((a, b) => b - a);

            const lastCompletedDate = allCompleted.length > 0 ? allCompleted[0] : null;

            // Check if there's an ongoing assignment (assigned but not completed) in the current year
            const hasOngoing = yearAssignments.some(a => a.dateAssigned && !a.dateCompleted);

            // Check if last completed is from before the selected service year (for * marker)
            const isFromPreviousYear = lastCompletedDate && lastCompletedDate < serviceYearStart;

            // Determine date status class and text
            let lastCompletedClass = '';
            let lastCompletedText = '';

            if (hasOngoing) {
                lastCompletedClass = 'date-ongoing';
                lastCompletedText = 'Ongoing';
            } else if (lastCompletedDate) {
                const monthsAgo = this.getMonthsDifference(lastCompletedDate, new Date());
                if (monthsAgo > 12) {
                    lastCompletedClass = 'date-old';
                }
                lastCompletedText = this.formatReportDate(lastCompletedDate);
            }

            const showAsterisk = isFromPreviousYear && !hasOngoing;

            // Generate publisher row cells and date row cells separately
            const publisherRowCells = [];
            const dateRowCells = [];

            for (let i = 0; i < 4; i++) {
                const assignment = yearAssignments[i];
                if (assignment) {
                    publisherRowCells.push(`<td colspan="2" class="report-publisher-name-cell">${assignment.publisher || ''}</td>`);
                    dateRowCells.push(`<td class="report-date-cell">${this.formatReportDate(assignment.dateAssigned)}</td>`);
                    dateRowCells.push(`<td class="report-date-cell">${assignment.dateCompleted ? this.formatReportDate(assignment.dateCompleted) : ''}</td>`);
                } else {
                    publisherRowCells.push(`<td colspan="2" class="report-publisher-name-cell"></td>`);
                    dateRowCells.push(`<td class="report-date-cell"></td>`);
                    dateRowCells.push(`<td class="report-date-cell"></td>`);
                }
            }

            return `
            <tr class="territory-row-main">
                <td rowspan="2" class="terr-no-cell">${displayNumber}</td>
                <td rowspan="2" class="last-completed-cell ${lastCompletedClass}">${lastCompletedText}${showAsterisk ? ' *' : ''}</td>
                ${publisherRowCells.join('')}
            </tr>
            <tr class="territory-row-dates">
                ${dateRowCells.join('')}
            </tr>
        `;
        }

        /**
         * Format date for report (matching PDF format: Mon DD, YYYY)
         */
        formatReportDate(dateInput) {
            if (!dateInput) return '';
            const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
            if (isNaN(date.getTime())) return '';

            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });
        }

        /**
         * Get difference in months between two dates
         */
        getMonthsDifference(date1, date2) {
            const d1 = new Date(date1);
            const d2 = new Date(date2);
            return (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
        }
    }

// Global app reference for onclick handlers
let app = null;

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    app = new App();
    app.init();
});

// Make app globally available for debugging
window.territoryApp = {
    get storage() { return storage; },
    get data() { return territoryData; },
    get map() { return territoryMap; },
    get editor() { return territoryEditor; },
    get app() { return app; }
};

