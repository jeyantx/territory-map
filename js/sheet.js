/**
 * Sheet Module
 *
 * Spreadsheet-style view of every territory: all fields visible in one grid,
 * editable inline, with Excel-style per-column filtering and sorting.
 *
 * The record columns (status, publisher, dates) are shown for a chosen
 * service year, so the sheet reads as "how did this year go".
 */

class TerritorySheet {
    constructor() {
        this.container = null;
        this.search = '';
        this.sort = { key: 'number', dir: 'asc' };
        this.serviceYear = null; // e.g. '2025-2026'; null = current service year

        // key -> Set of selected display values. A missing key means "no filter".
        this.filters = {};

        this.openMenuKey = null;
        this.internalEdit = false;
        this.openPanelTerritoryId = null;

        this.columns = [
            { key: 'number', label: 'Map No', width: 90, type: 'text', editable: true, sticky: true },
            { key: 'name', label: 'Territory Name', width: 210, type: 'text', editable: true },
            { key: 'group', label: 'Group', width: 200, type: 'group', editable: true },
            { key: 'personal', label: 'Personal', width: 90, type: 'personal', editable: true },
            { key: 'status', label: 'Status', width: 125, type: 'status', editable: false },
            { key: 'publisher', label: 'Last Assigned To', width: 165, type: 'text', editable: false },
            { key: 'dateAssigned', label: 'Date Last Started', width: 145, type: 'date', editable: false },
            { key: 'dateCompleted', label: 'Date Last Completed', width: 165, type: 'lastCompleted', editable: false },
            { key: 'records', label: 'Records', width: 80, type: 'number', editable: false },
            { key: 'comments', label: 'Comments', width: 240, type: 'text', editable: true }
        ];

        this.statusOrder = ['Yet to start', 'In progress', 'Completed'];
    }

    /**
     * Initialize the sheet view
     */
    init() {
        this.container = document.getElementById('sheetView');
        if (!this.container) return;

        this.body = document.getElementById('sheetBody');
        this.head = document.getElementById('sheetHead');
        this.detailsPanel = document.getElementById('sheetDetailsPanel');
        this.panelContent = document.getElementById('sheetPanelContent');

        this.populateServiceYears();
        this.setupEventListeners();
        this.render();
    }

    get readOnly() {
        return typeof app !== 'undefined' && app && app.accessLevel === 'viewer';
    }

    getRange() {
        return territoryData.getServiceYearRange(this.serviceYear);
    }

    /**
     * Fill the service year dropdown from the years present in the data
     */
    populateServiceYears() {
        const select = document.getElementById('sheetServiceYear');
        if (!select || !app) return;

        const years = app.getServiceYears().filter(y => !y.future);
        select.innerHTML = years.map(y =>
            `<option value="${y.value}">${y.label}${y.current ? ' (Current)' : ''}</option>`
        ).join('');

        const preferred = years.some(y => y.value === this.serviceYear)
            ? this.serviceYear
            : (years.find(y => y.current) || years[0] || {}).value;

        if (preferred) {
            select.value = preferred;
            this.serviceYear = preferred;
        }
    }

    /**
     * Wire up toolbar and delegated table events
     */
    setupEventListeners() {
        document.getElementById('sheetSearch')?.addEventListener('input', (e) => {
            this.search = e.target.value.trim().toLowerCase();
            this.renderBody();
            app?.syncUrl();
        });

        document.getElementById('sheetServiceYear')?.addEventListener('change', (e) => {
            this.serviceYear = e.target.value;
            this.refresh();
            app?.syncUrl();
        });

        document.getElementById('sheetClearFilters')?.addEventListener('click', () => {
            this.filters = {};
            this.search = '';
            const searchInput = document.getElementById('sheetSearch');
            if (searchInput) searchInput.value = '';
            this.render();
            app?.syncUrl();
        });

        document.getElementById('sheetAddTerritoryBtn')?.addEventListener('click', () => {
            if (app) app.openTerritoryModal();
        });

        document.getElementById('sheetExportBtn')?.addEventListener('click', () => {
            this.exportCsv();
        });

        // Column header: sort / filter menu
        this.head?.addEventListener('click', (e) => {
            const filterBtn = e.target.closest('.sheet-filter-btn');
            if (filterBtn) {
                e.stopPropagation();
                this.toggleFilterMenu(filterBtn.dataset.key, filterBtn);
                return;
            }

            const label = e.target.closest('.sheet-th-label');
            if (label) {
                this.toggleSort(label.dataset.key);
            }
        });

        // Cell edits
        this.body?.addEventListener('change', (e) => {
            const input = e.target.closest('[data-cell-key]');
            if (!input) return;
            const value = input.type === 'checkbox' ? input.checked : input.value;
            this.saveCell(parseInt(input.dataset.territoryId, 10), input.dataset.cellKey, value);
        });

        // Enter commits and moves focus down the column
        this.body?.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            const input = e.target.closest('input[data-cell-key]');
            if (!input) return;
            e.preventDefault();
            input.blur();
            this.focusNextInColumn(input);
        });

        // Row actions and row selection
        this.body?.addEventListener('click', (e) => {
            const btn = e.target.closest('.sheet-row-btn');
            if (btn) {
                const id = parseInt(btn.dataset.territoryId, 10);
                if (btn.dataset.action === 'edit-record') {
                    this.editLatestRecord(id);
                } else if (btn.dataset.action === 'add-record' && territoryMap) {
                    territoryMap.openAssignmentModal(id);
                }
                return;
            }

            // Clicking anywhere else on a row opens its details
            if (e.target.closest('input, select, button, a, label')) return;
            const tr = e.target.closest('tr[data-territory-id]');
            if (tr) this.showHistory(parseInt(tr.dataset.territoryId, 10));
        });

        // Details panel actions
        this.panelContent?.addEventListener('change', (e) => {
            const toggle = e.target.closest('[data-panel-personal]');
            if (toggle) this.setPersonal(parseInt(toggle.dataset.panelPersonal, 10), toggle.checked);
        });

        this.panelContent?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-panel-action]');
            if (!btn) return;
            const id = parseInt(btn.dataset.territoryId, 10);

            switch (btn.dataset.panelAction) {
                case 'add-record':
                    territoryMap?.openAssignmentModal(id);
                    break;
                case 'edit-record':
                    territoryMap?.openAssignmentModal(id, parseInt(btn.dataset.assignmentId, 10));
                    break;
                case 'delete-record':
                    this.deleteRecord(id, parseInt(btn.dataset.assignmentId, 10));
                    break;
                case 'edit-territory':
                    app?.openTerritoryModal(id);
                    break;
                case 'show-map':
                    app?.switchView('map');
                    territoryMap?.highlightTerritory(id);
                    break;
            }
        });

        document.getElementById('closeSheetPanel')?.addEventListener('click', () => {
            this.closeHistory();
        });

        // Close the filter menu on outside click / Escape
        document.addEventListener('click', (e) => {
            if (!this.openMenuKey) return;
            if (e.target.closest('.sheet-filter-menu')) return;
            this.closeFilterMenu();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            if (this.openMenuKey) this.closeFilterMenu();
            else if (this.openPanelTerritoryId) this.closeHistory();
        });
    }

    // ------------------------------------------------------------------
    // Row model
    // ------------------------------------------------------------------

    /**
     * Flatten territories into sheet rows for the selected service year.
     */
    buildRows() {
        const range = this.getRange();

        return territoryData.getAllTerritories().map(t => {
            const activity = territoryData.getServiceYearActivity(t, range);
            const latest = activity.latest;
            const group = territoryData.getGroup(t.groupId !== undefined ? t.groupId : t.group);

            return {
                id: t.id,
                number: t.number || '',
                name: t.name || '',
                group: group ? group.name : (t.group || ''),
                groupId: group ? group.id : null,
                groupColor: group ? group.color : null,
                personal: territoryData.isPersonalTerritory(t) ? 'Personal' : 'Regular',
                status: activity.status,
                publisher: latest ? (latest.publisher || '') : '',
                dateAssigned: latest ? (latest.dateAssigned || '') : '',
                dateCompleted: activity.lastCompleted,
                lastCompletedIsEarlier: activity.lastCompletedIsEarlier,
                records: activity.recordsInYear,
                comments: t.description || '',
                latestAssignmentId: latest ? latest.id : null
            };
        });
    }

    /**
     * Rows passing every filter except the one named (Excel shows the values
     * still reachable given the other columns' filters).
     */
    applyFilters(rows, exceptKey = null) {
        return rows.filter(row => {
            for (const key of Object.keys(this.filters)) {
                if (key === exceptKey) continue;
                const selected = this.filters[key];
                if (!selected || !selected.size) continue;
                if (!selected.has(this.cellText(row, key))) return false;
            }
            return true;
        });
    }

    /**
     * Rows after filters, search and sorting
     */
    getVisibleRows() {
        let rows = this.applyFilters(this.buildRows());

        if (this.search) {
            rows = rows.filter(row =>
                this.columns.some(col => this.cellText(row, col.key).toLowerCase().includes(this.search))
            );
        }

        const { key, dir } = this.sort;
        if (key) {
            const col = this.columns.find(c => c.key === key);
            rows.sort((a, b) => {
                const result = this.compareValues(a, b, col);
                return dir === 'asc' ? result : -result;
            });
        }

        return rows;
    }

    compareValues(a, b, col) {
        const key = col.key;

        if (col.type === 'number') {
            return (a[key] || 0) - (b[key] || 0);
        }
        if (col.type === 'date' || col.type === 'lastCompleted') {
            // Blanks always sort last so unworked territories don't hide the data
            if (!a[key] && !b[key]) return 0;
            if (!a[key]) return 1;
            if (!b[key]) return -1;
            return new Date(a[key]) - new Date(b[key]);
        }
        if (col.type === 'status') {
            return this.statusOrder.indexOf(a[key]) - this.statusOrder.indexOf(b[key]);
        }
        if (key === 'number') {
            // Natural order: 1, 2, 10, 10A rather than 1, 10, 10A, 2
            const na = parseFloat(a[key]);
            const nb = parseFloat(b[key]);
            if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
        }
        return String(a[key] || '').localeCompare(String(b[key] || ''), undefined, { numeric: true });
    }

    cellText(row, key) {
        const value = row[key];
        if (value === null || value === undefined) return '';
        return String(value);
    }

    // ------------------------------------------------------------------
    // Rendering
    // ------------------------------------------------------------------

    render() {
        if (!this.head || !this.body) return;
        this.renderHead();
        this.renderBody();
    }

    renderHead() {
        const cells = this.columns.map(col => {
            const active = this.filters[col.key] && this.filters[col.key].size;
            const sorted = this.sort.key === col.key ? (this.sort.dir === 'asc' ? ' ▲' : ' ▼') : '';
            return `
                <th class="${col.sticky ? 'sheet-sticky-col' : ''}" style="width: ${col.width}px; min-width: ${col.width}px;">
                    <div class="sheet-th-inner">
                        <button class="sheet-th-label" data-key="${col.key}" title="Sort by ${col.label}">
                            ${col.label}<span class="sheet-sort-mark">${sorted}</span>
                        </button>
                        <button class="sheet-filter-btn ${active ? 'active' : ''}" data-key="${col.key}"
                                title="Filter ${col.label}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                            </svg>
                        </button>
                    </div>
                </th>
            `;
        }).join('');

        this.head.innerHTML = `<tr>
            <th class="sheet-rownum-col">#</th>
            ${cells}
            ${this.readOnly ? '' : '<th class="sheet-actions-col">Actions</th>'}
        </tr>`;
    }

    renderBody() {
        const rows = this.getVisibleRows();
        const total = territoryData.getAllTerritories().length;

        this.body.innerHTML = rows.length
            ? rows.map((row, index) => this.renderRow(row, index + 1)).join('')
            : `<tr><td class="sheet-empty" colspan="${this.columns.length + (this.readOnly ? 1 : 2)}">
                   No territories match the current filters.
               </td></tr>`;

        this.updateStats(rows.length, total);
    }

    renderRow(row, rowNumber) {
        const cells = this.columns.map(col => this.renderCell(row, col)).join('');

        const actions = this.readOnly ? '' : `
            <td class="sheet-actions-col">
                <div class="sheet-row-actions">
                    <button class="sheet-row-btn" data-action="edit-record" data-territory-id="${row.id}"
                            title="Edit the latest record">Edit</button>
                    <button class="sheet-row-btn primary" data-action="add-record" data-territory-id="${row.id}"
                            title="Add a new record">+ New</button>
                </div>
            </td>
        `;

        const selected = this.openPanelTerritoryId === row.id ? ' class="is-selected"' : '';

        return `<tr data-territory-id="${row.id}"${selected}>
            <td class="sheet-rownum-col">${rowNumber}</td>
            ${cells}
            ${actions}
        </tr>`;
    }

    renderCell(row, col) {
        const stickyClass = col.sticky ? ' sheet-sticky-col' : '';
        const disabled = this.readOnly || !col.editable;

        if (col.type === 'status') {
            const slug = row.status.toLowerCase().replace(/\s+/g, '-');
            return `<td class="sheet-cell-status${stickyClass}">
                <span class="sheet-status-badge status-${slug}">${row.status}</span>
            </td>`;
        }

        if (col.type === 'personal') {
            const checked = row.personal === 'Personal';
            if (this.readOnly) {
                return `<td class="sheet-cell-readonly${stickyClass}">${checked ? 'Personal' : ''}</td>`;
            }
            return `<td class="sheet-cell-check${stickyClass}">
                <label class="sheet-check" title="Mark as a personal territory">
                    <input type="checkbox" ${checked ? 'checked' : ''} data-cell-key="personal" data-territory-id="${row.id}">
                </label>
            </td>`;
        }

        if (col.type === 'number') {
            return `<td class="sheet-cell-readonly${stickyClass}">${row[col.key]}</td>`;
        }

        // Last completion on or before the selected year; * when it predates the year
        if (col.type === 'lastCompleted') {
            if (!row.dateCompleted) return `<td class="sheet-cell-readonly${stickyClass}"></td>`;
            const earlier = row.lastCompletedIsEarlier;
            return `<td class="sheet-cell-readonly${stickyClass}"${earlier ? ' title="Completed before the selected service year"' : ''}>${this.formatDate(row.dateCompleted)}${earlier ? '<span class="sheet-earlier-mark">*</span>' : ''}</td>`;
        }

        if (disabled) {
            const value = col.type === 'date' ? this.formatDate(row[col.key]) : this.escape(row[col.key]);
            return `<td class="sheet-cell-readonly${stickyClass}">${value}</td>`;
        }

        if (col.type === 'group') {
            const groups = territoryData.getAllGroups();
            const options = ['<option value="">—</option>']
                .concat(groups.map(g =>
                    `<option value="${g.id}" ${g.id === row.groupId ? 'selected' : ''}>${this.escape(g.name)}</option>`
                )).join('');
            const swatch = row.groupColor
                ? `<span class="sheet-group-swatch" style="background: ${row.groupColor}"></span>`
                : '';
            const badge = row.personal === 'Personal'
                ? '<span class="sheet-personal-badge" title="Personal territory">Personal</span>'
                : '';
            return `<td class="sheet-cell${stickyClass}">
                <div class="sheet-group-cell">${swatch}
                    <select class="sheet-input sheet-select" data-cell-key="group" data-territory-id="${row.id}">${options}</select>
                    ${badge}
                </div>
            </td>`;
        }

        const type = col.type === 'date' ? 'date' : 'text';
        // Empty date inputs keep their dd/mm/yyyy hint hidden so the grid reads like a sheet
        const emptyClass = col.type === 'date' && !row[col.key] ? ' is-empty' : '';
        return `<td class="sheet-cell${stickyClass}">
            <input class="sheet-input${emptyClass}" type="${type}" value="${this.escape(row[col.key])}"
                   data-cell-key="${col.key}" data-territory-id="${row.id}">
        </td>`;
    }

    updateStats(shown, total) {
        const stats = document.getElementById('sheetStats');
        if (!stats) return;

        const activeFilters = Object.keys(this.filters).filter(k => this.filters[k] && this.filters[k].size);
        const filterNote = activeFilters.length
            ? ` · filtered by ${activeFilters.map(k => this.columns.find(c => c.key === k).label).join(', ')}`
            : '';

        stats.innerHTML = `<strong>${shown}</strong> of ${total} territories${filterNote}`;
    }

    /**
     * Re-render while keeping the scroll position
     */
    refresh() {
        const wrapper = document.getElementById('sheetTableWrapper');
        const scrollTop = wrapper ? wrapper.scrollTop : 0;
        const scrollLeft = wrapper ? wrapper.scrollLeft : 0;
        this.render();
        if (wrapper) {
            wrapper.scrollTop = scrollTop;
            wrapper.scrollLeft = scrollLeft;
        }

        // Records may have changed while the panel was open
        if (this.openPanelTerritoryId) this.showHistory(this.openPanelTerritoryId);
    }

    /**
     * Called by the app on data changes elsewhere (map, list, modals)
     */
    handleDataChange() {
        if (this.internalEdit) return;
        if (app && app.currentView !== 'sheet') return;
        this.refresh();
    }

    // ------------------------------------------------------------------
    // Editing
    // ------------------------------------------------------------------

    async saveCell(territoryId, key, rawValue) {
        const territory = territoryData.getTerritory(territoryId);
        if (!territory) return;

        const value = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
        this.internalEdit = true;

        try {
            if (key === 'number' || key === 'name') {
                if (key === 'number' && !value) {
                    this.toast('Map number cannot be empty', 'error');
                    return this.refreshRow(territoryId);
                }
                await territoryData.updateTerritory(territoryId, { [key]: value });
            } else if (key === 'comments') {
                await territoryData.updateTerritory(territoryId, { description: value });
            } else if (key === 'personal') {
                await territoryData.updateTerritory(territoryId, { isPersonal: !!value });
                if (territorySummary) territorySummary.render();
            } else if (key === 'group') {
                const group = value ? territoryData.getGroup(parseInt(value, 10)) : null;
                await territoryData.updateTerritory(territoryId, {
                    groupId: group ? group.id : null,
                    group: group ? group.name : ''
                });
                if (territoryMap) territoryMap.render();
            }

            this.refreshRow(territoryId);
            if (this.openPanelTerritoryId === territoryId) this.showHistory(territoryId);
        } catch (error) {
            console.error('Failed to save cell:', error);
            this.toast('Failed to save change', 'error');
            this.refreshRow(territoryId);
        } finally {
            this.internalEdit = false;
        }
    }

    /**
     * Flag or unflag a personal territory from the details panel
     */
    async setPersonal(territoryId, isPersonal) {
        this.internalEdit = true;
        try {
            await territoryData.updateTerritory(territoryId, { isPersonal: !!isPersonal });
            this.refreshRow(territoryId);
            if (territorySummary) territorySummary.render();
            this.toast(isPersonal ? 'Marked as personal territory' : 'Personal territory flag removed');
        } catch (error) {
            console.error('Failed to update personal flag:', error);
            this.toast('Failed to save change', 'error');
        } finally {
            this.internalEdit = false;
        }
    }

    /**
     * Open the assignment modal on this territory's most recent record.
     * Territories without a record yet start a new one instead.
     */
    editLatestRecord(territoryId) {
        if (!territoryMap) return;

        const row = this.buildRows().find(r => r.id === territoryId);
        if (row && row.latestAssignmentId) {
            territoryMap.openAssignmentModal(territoryId, row.latestAssignmentId);
        } else {
            this.toast('No record yet - adding the first one', 'info');
            territoryMap.openAssignmentModal(territoryId);
        }
    }

    async deleteRecord(territoryId, assignmentId) {
        if (!confirm('Delete this assignment record?')) return;

        try {
            await territoryData.deleteAssignment(territoryId, assignmentId);
            this.toast('Record deleted');
        } catch (error) {
            console.error('Failed to delete record:', error);
            this.toast('Failed to delete record', 'error');
        }
    }

    // ------------------------------------------------------------------
    // Details panel
    // ------------------------------------------------------------------

    /**
     * Show the territory's details, full assignment history and actions
     */
    showHistory(territoryId) {
        const territory = territoryData.getTerritory(territoryId);
        if (!territory || !this.detailsPanel || !this.panelContent) return;

        this.panelContent.innerHTML = this.renderDetails(territory);
        this.detailsPanel.classList.add('open');
        this.container?.classList.add('panel-open');

        this.openPanelTerritoryId = territoryId;
        this.highlightSelectedRow();
    }

    renderDetails(territory) {
        const group = territoryData.getGroup(territory.groupId !== undefined ? territory.groupId : territory.group);
        const groupName = group ? group.name : (territory.group || 'Unassigned');
        const color = group ? group.color : '#ccc';
        const isPersonal = territoryData.isPersonalTerritory(territory);
        const range = this.getRange();
        const activity = territoryData.getServiceYearActivity(territory, range);
        const area = territory.polygon && territory.polygon.length >= 3
            ? territoryData.formatArea(territoryData.calculateArea(territory.polygon))
            : 'No boundary set';

        return `
            <div class="territory-detail">
                <div class="territory-header">
                    <div class="territory-number" style="background: ${color}">${this.escape(territory.number || territory.id)}</div>
                    <div class="territory-info">
                        <h3>${this.escape(territory.name || '')}</h3>
                        <div class="territory-group">
                            <span class="group-color" style="background: ${color}"></span>
                            ${this.escape(groupName)}${isPersonal ? ' &middot; Personal Territory' : ''}
                        </div>
                    </div>
                </div>

                <div class="assignment-section" style="padding-top: 0">
                    <div class="info-grid">
                        <div class="info-item">
                            <span class="info-label">${range.value}:</span>
                            <span class="info-value">
                                <span class="sheet-status-badge status-${activity.status.toLowerCase().replace(/\s+/g, '-')}">${activity.status}</span>
                            </span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Area:</span>
                            <span class="info-value">${area}</span>
                        </div>
                    </div>
                </div>

                ${this.readOnly ? '' : `
                <div class="assignment-section">
                    <label class="sheet-panel-toggle">
                        <input type="checkbox" ${isPersonal ? 'checked' : ''} data-panel-personal="${territory.id}">
                        <span>
                            <strong>Personal territory</strong>
                            <small>Left out of this group's totals in the Summary</small>
                        </span>
                    </label>
                </div>
                `}

                ${territory.description ? `
                <div class="assignment-section">
                    <h4 class="section-title">Comments</h4>
                    <p class="territory-description-text">${this.escape(territory.description)}</p>
                </div>
                ` : ''}

                <div class="assignment-section">
                    <h4 class="section-title">Assignment History</h4>
                    <div class="assignment-records">${this.renderHistoryTable(territory)}</div>
                    ${this.readOnly ? '' : `
                        <button class="btn btn-primary btn-sm" style="margin-top: 12px;"
                                data-panel-action="add-record" data-territory-id="${territory.id}">
                            + Add Record
                        </button>
                    `}
                </div>

                <div class="assignment-section">
                    <h4 class="section-title">Actions</h4>
                    <div class="action-buttons">
                        <button class="btn btn-secondary" data-panel-action="show-map" data-territory-id="${territory.id}">
                            🗺️ Show on Map
                        </button>
                        ${this.readOnly ? '' : `
                            <button class="btn btn-secondary" data-panel-action="edit-territory" data-territory-id="${territory.id}">
                                ✏️ Edit Territory
                            </button>
                        `}
                    </div>
                </div>
            </div>
        `;
    }

    renderHistoryTable(territory) {
        const assignments = (territory.assignments || []).slice().sort((a, b) =>
            new Date(b.dateAssigned || 0) - new Date(a.dateAssigned || 0)
        );

        if (!assignments.length) return '<p class="text-muted">No assignment records yet.</p>';

        return `
            <table class="records-table">
                <thead>
                    <tr>
                        <th>Publisher</th>
                        <th>Period</th>
                        ${this.readOnly ? '' : '<th>Actions</th>'}
                    </tr>
                </thead>
                <tbody>
                    ${assignments.map(a => `
                        <tr>
                            <td>${this.escape(a.publisher || 'Unknown')}</td>
                            <td>${this.formatDateShort(a.dateAssigned)}${a.dateCompleted ? ` - ${this.formatDateShort(a.dateCompleted)}` : ' - Present'}</td>
                            ${this.readOnly ? '' : `
                                <td>
                                    <div class="record-actions">
                                        <span class="action-icon" title="Edit record" data-panel-action="edit-record"
                                              data-territory-id="${territory.id}" data-assignment-id="${a.id}">✏️</span>
                                        <span class="action-icon" title="Delete record" data-panel-action="delete-record"
                                              data-territory-id="${territory.id}" data-assignment-id="${a.id}">🗑️</span>
                                    </div>
                                </td>
                            `}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    closeHistory() {
        this.detailsPanel?.classList.remove('open');
        this.container?.classList.remove('panel-open');
        this.openPanelTerritoryId = null;
        this.highlightSelectedRow();
    }

    highlightSelectedRow() {
        this.body?.querySelectorAll('tr').forEach(tr => {
            tr.classList.toggle('is-selected', parseInt(tr.dataset.territoryId, 10) === this.openPanelTerritoryId);
        });
    }

    /**
     * Repaint a single row so an edit doesn't disturb the rest of the sheet
     */
    refreshRow(territoryId) {
        const tr = this.body?.querySelector(`tr[data-territory-id="${territoryId}"]`);
        if (!tr) return;

        const row = this.buildRows().find(r => r.id === territoryId);
        if (!row) return;

        const rowNumber = tr.querySelector('.sheet-rownum-col')?.textContent || '';
        tr.outerHTML = this.renderRow(row, rowNumber);
    }

    focusNextInColumn(input) {
        const tr = input.closest('tr');
        const next = tr?.nextElementSibling;
        if (!next) return;
        next.querySelector(`[data-cell-key="${input.dataset.cellKey}"]`)?.focus();
    }

    // ------------------------------------------------------------------
    // Column filter menu
    // ------------------------------------------------------------------

    toggleFilterMenu(key, anchor) {
        if (this.openMenuKey === key) {
            this.closeFilterMenu();
            return;
        }
        this.closeFilterMenu();
        this.openFilterMenu(key, anchor);
    }

    openFilterMenu(key, anchor) {
        const col = this.columns.find(c => c.key === key);
        const rows = this.applyFilters(this.buildRows(), key);

        // Distinct values still reachable given the other columns' filters
        const values = [...new Set(rows.map(r => this.cellText(r, key)))]
            .sort((a, b) => {
                if (!a) return -1;
                if (!b) return 1;
                if (col.type === 'status') return this.statusOrder.indexOf(a) - this.statusOrder.indexOf(b);
                return String(a).localeCompare(String(b), undefined, { numeric: true });
            });

        const selected = this.filters[key];
        const allChecked = !selected || !selected.size;
        const isDate = col.type === 'date' || col.type === 'lastCompleted';

        const menu = document.createElement('div');
        menu.className = 'sheet-filter-menu';
        menu.innerHTML = `
            <div class="sheet-menu-section">
                <button class="sheet-menu-item" data-sort="asc">↑ Sort A to Z</button>
                <button class="sheet-menu-item" data-sort="desc">↓ Sort Z to A</button>
            </div>
            <div class="sheet-menu-divider"></div>
            <input type="text" class="sheet-menu-search" placeholder="Search values...">
            <label class="sheet-menu-check sheet-menu-all">
                <input type="checkbox" ${allChecked ? 'checked' : ''} data-all="1">
                <span>(Select All)</span>
            </label>
            <div class="sheet-menu-values">
                ${values.map(v => `
                    <label class="sheet-menu-check" data-value="${this.escape(v)}">
                        <input type="checkbox" value="${this.escape(v)}" ${allChecked || selected.has(v) ? 'checked' : ''}>
                        <span>${v === '' ? '(Blanks)' : (isDate ? this.formatDate(v) : this.escape(v))}</span>
                    </label>
                `).join('')}
            </div>
            <div class="sheet-menu-footer">
                <button class="btn btn-secondary btn-sm" data-menu-action="clear">Clear</button>
                <button class="btn btn-primary btn-sm" data-menu-action="apply">Apply</button>
            </div>
        `;

        document.body.appendChild(menu);

        // Anchor below the filter button, kept inside the viewport
        const rect = anchor.getBoundingClientRect();
        const left = Math.min(rect.left, window.innerWidth - menu.offsetWidth - 12);
        menu.style.left = `${Math.max(8, left)}px`;
        menu.style.top = `${rect.bottom + 4}px`;

        const maxHeight = window.innerHeight - rect.bottom - 24;
        menu.style.maxHeight = `${Math.max(220, maxHeight)}px`;

        this.wireFilterMenu(menu, key);
        this.openMenuKey = key;
        this.openMenu = menu;

        menu.querySelector('.sheet-menu-search')?.focus();
    }

    wireFilterMenu(menu, key) {
        const valueBoxes = () => [...menu.querySelectorAll('.sheet-menu-values input[type="checkbox"]')];
        const allBox = menu.querySelector('input[data-all]');

        menu.querySelector('.sheet-menu-search')?.addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase();
            menu.querySelectorAll('.sheet-menu-values .sheet-menu-check').forEach(label => {
                label.style.display = label.textContent.toLowerCase().includes(q) ? '' : 'none';
            });
        });

        allBox?.addEventListener('change', () => {
            valueBoxes().forEach(box => {
                if (box.closest('.sheet-menu-check').style.display !== 'none') {
                    box.checked = allBox.checked;
                }
            });
        });

        menu.addEventListener('change', (e) => {
            if (e.target === allBox) return;
            const boxes = valueBoxes();
            allBox.checked = boxes.every(b => b.checked);
        });

        menu.querySelectorAll('[data-sort]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.sort = { key, dir: btn.dataset.sort };
                this.closeFilterMenu();
                this.refresh();
                app?.syncUrl();
            });
        });

        menu.querySelector('[data-menu-action="clear"]')?.addEventListener('click', () => {
            delete this.filters[key];
            this.closeFilterMenu();
            this.refresh();
            app?.syncUrl();
        });

        menu.querySelector('[data-menu-action="apply"]')?.addEventListener('click', () => {
            const checked = valueBoxes().filter(b => b.checked).map(b => b.value);
            if (checked.length === valueBoxes().length) {
                delete this.filters[key];
            } else {
                this.filters[key] = new Set(checked);
            }
            this.closeFilterMenu();
            this.refresh();
            app?.syncUrl();
        });
    }

    closeFilterMenu() {
        this.openMenu?.remove();
        this.openMenu = null;
        this.openMenuKey = null;
    }

    /**
     * Apply a filter set from outside (e.g. drilling in from the Summary view)
     * @param {Object} filters - map of column key -> array of values
     * @param {string|null} serviceYear - service year to switch the sheet to
     */
    applyExternalFilter(filters, serviceYear = null) {
        this.filters = {};
        Object.entries(filters || {}).forEach(([key, values]) => {
            if (values && values.length) this.filters[key] = new Set(values);
        });

        if (serviceYear) {
            this.serviceYear = serviceYear;
            const select = document.getElementById('sheetServiceYear');
            if (select) select.value = serviceYear;
        }

        this.search = '';
        const searchInput = document.getElementById('sheetSearch');
        if (searchInput) searchInput.value = '';

        this.render();
    }

    toggleSort(key) {
        if (this.sort.key === key) {
            this.sort.dir = this.sort.dir === 'asc' ? 'desc' : 'asc';
        } else {
            this.sort = { key, dir: 'asc' };
        }
        this.refresh();
        app?.syncUrl();
    }

    // ------------------------------------------------------------------
    // URL state
    // ------------------------------------------------------------------

    writeUrlParams(params) {
        if (this.serviceYear) params.set('year', this.serviceYear);
        if (this.search) params.set('q', this.search);
        if (this.sort.key !== 'number' || this.sort.dir !== 'asc') {
            params.set('sort', `${this.sort.key}:${this.sort.dir}`);
        }
        Object.entries(this.filters).forEach(([key, values]) => {
            if (values && values.size) params.set(`f.${key}`, [...values].join('|'));
        });
    }

    readUrlParams(params) {
        const year = params.get('year');
        if (year) {
            this.serviceYear = year;
            const select = document.getElementById('sheetServiceYear');
            if (select) select.value = year;
        }

        const q = params.get('q');
        if (q) {
            this.search = q.toLowerCase();
            const input = document.getElementById('sheetSearch');
            if (input) input.value = q;
        }

        const sort = params.get('sort');
        if (sort && sort.includes(':')) {
            const [key, dir] = sort.split(':');
            if (this.columns.some(c => c.key === key)) {
                this.sort = { key, dir: dir === 'desc' ? 'desc' : 'asc' };
            }
        }

        this.filters = {};
        this.columns.forEach(col => {
            const value = params.get(`f.${col.key}`);
            if (value !== null) this.filters[col.key] = new Set(value.split('|'));
        });
    }

    // ------------------------------------------------------------------
    // Export
    // ------------------------------------------------------------------

    exportCsv() {
        const rows = this.getVisibleRows();
        const header = this.columns.map(c => c.label);
        const lines = [header, ...rows.map(row => this.columns.map(col => this.cellText(row, col.key)))];

        const csv = lines
            .map(line => line.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
            .join('\n');

        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `territory_sheet_${this.getRange().value}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.toast(`Exported ${rows.length} rows`);
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    formatDate(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        if (isNaN(date)) return this.escape(dateStr);
        return date.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
    }

    formatDateShort(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        if (isNaN(date)) return this.escape(dateStr);
        return date.toLocaleDateString('en-IN', { year: '2-digit', month: 'short', day: 'numeric' });
    }

    escape(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    toast(message, type = 'success') {
        if (app && app.showToast) app.showToast(message, type);
    }
}

// Export
let territorySheet = null;
