/**
 * Sheet Module
 *
 * Spreadsheet-style view of every territory: all fields visible in one grid,
 * editable inline, with Excel-style per-column filtering and sorting.
 */

class TerritorySheet {
    constructor() {
        this.container = null;
        this.search = '';
        this.sort = { key: 'number', dir: 'asc' };

        // key -> Set of selected display values. A missing key means "no filter".
        this.filters = {};

        this.openMenuKey = null;
        this.internalEdit = false;

        this.columns = [
            { key: 'number', label: 'Map No', width: 90, type: 'text', editable: true, sticky: true },
            { key: 'name', label: 'Territory Name', width: 220, type: 'text', editable: true },
            { key: 'group', label: 'Group', width: 170, type: 'group', editable: true },
            { key: 'status', label: 'Status', width: 130, type: 'status', editable: false },
            { key: 'publisher', label: 'Assigned To', width: 170, type: 'text', editable: true },
            { key: 'dateAssigned', label: 'Date Checked Out', width: 150, type: 'date', editable: true },
            { key: 'dateCompleted', label: 'Date Checked In', width: 150, type: 'date', editable: true },
            { key: 'lastCompleted', label: 'Last Completed', width: 140, type: 'date', editable: false },
            { key: 'records', label: 'Records', width: 80, type: 'number', editable: false },
            { key: 'comments', label: 'Comments', width: 260, type: 'text', editable: true }
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

        this.setupEventListeners();
        this.render();
    }

    get readOnly() {
        return typeof app !== 'undefined' && app && app.accessLevel === 'viewer';
    }

    /**
     * Wire up toolbar and delegated table events
     */
    setupEventListeners() {
        document.getElementById('sheetSearch')?.addEventListener('input', (e) => {
            this.search = e.target.value.trim().toLowerCase();
            this.renderBody();
        });

        document.getElementById('sheetClearFilters')?.addEventListener('click', () => {
            this.filters = {};
            this.search = '';
            const searchInput = document.getElementById('sheetSearch');
            if (searchInput) searchInput.value = '';
            this.render();
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
            this.saveCell(parseInt(input.dataset.territoryId, 10), input.dataset.cellKey, input.value);
        });

        // Keep the empty-date styling in sync while typing
        this.body?.addEventListener('input', (e) => {
            const input = e.target.closest('input[type="date"][data-cell-key]');
            if (input) input.classList.toggle('is-empty', !input.value);
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

        // Row actions
        this.body?.addEventListener('click', (e) => {
            const btn = e.target.closest('.sheet-row-btn');
            if (!btn) return;
            const id = parseInt(btn.dataset.territoryId, 10);

            if (btn.dataset.action === 'add-record' && territoryMap) {
                territoryMap.openAssignmentModal(id);
            } else if (btn.dataset.action === 'show-map' && app) {
                app.switchView('map');
                if (territoryMap) territoryMap.highlightTerritory(id);
            } else if (btn.dataset.action === 'edit' && app) {
                app.openTerritoryModal(id);
            }
        });

        // Close the filter menu on outside click / Escape
        document.addEventListener('click', (e) => {
            if (!this.openMenuKey) return;
            if (e.target.closest('.sheet-filter-menu')) return;
            this.closeFilterMenu();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.openMenuKey) this.closeFilterMenu();
        });
    }

    // ------------------------------------------------------------------
    // Row model
    // ------------------------------------------------------------------

    /**
     * Flatten territories into sheet rows. The publisher/date columns reflect
     * the most recent assignment record; older records stay in the history.
     */
    buildRows() {
        return territoryData.getAllTerritories().map(t => {
            const assignments = (t.assignments || []).slice().sort((a, b) =>
                new Date(b.dateAssigned || 0) - new Date(a.dateAssigned || 0)
            );
            const latest = assignments[0] || null;

            const completed = assignments
                .filter(a => a.dateCompleted)
                .sort((a, b) => new Date(b.dateCompleted) - new Date(a.dateCompleted));

            const group = territoryData.getGroup(t.groupId !== undefined ? t.groupId : t.group);

            let status;
            if (!latest) {
                status = 'Yet to start';
            } else if (latest.dateAssigned && !latest.dateCompleted) {
                status = 'In progress';
            } else {
                status = 'Completed';
            }

            return {
                id: t.id,
                number: t.number || '',
                name: t.name || '',
                group: group ? group.name : (t.group || ''),
                groupId: group ? group.id : null,
                groupColor: group ? group.color : null,
                status,
                publisher: latest ? (latest.publisher || '') : '',
                dateAssigned: latest ? (latest.dateAssigned || '') : '',
                dateCompleted: latest ? (latest.dateCompleted || '') : '',
                lastCompleted: completed.length ? completed[0].dateCompleted : '',
                records: assignments.length,
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
        if (col.type === 'date') {
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
                    <button class="sheet-row-btn" data-action="add-record" data-territory-id="${row.id}"
                            title="Add a new assignment record">＋</button>
                    <button class="sheet-row-btn" data-action="show-map" data-territory-id="${row.id}"
                            title="Show on map">◎</button>
                    <button class="sheet-row-btn" data-action="edit" data-territory-id="${row.id}"
                            title="Open full editor">✎</button>
                </div>
            </td>
        `;

        return `<tr data-territory-id="${row.id}">
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

        if (col.type === 'number') {
            return `<td class="sheet-cell-readonly${stickyClass}">${row[col.key]}</td>`;
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
            return `<td class="sheet-cell${stickyClass}">
                <div class="sheet-group-cell">${swatch}
                    <select class="sheet-input sheet-select" data-cell-key="group" data-territory-id="${row.id}">${options}</select>
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
            } else if (key === 'group') {
                const group = value ? territoryData.getGroup(parseInt(value, 10)) : null;
                await territoryData.updateTerritory(territoryId, {
                    groupId: group ? group.id : null,
                    group: group ? group.name : ''
                });
                if (territoryMap) territoryMap.render();
            } else if (key === 'publisher' || key === 'dateAssigned' || key === 'dateCompleted') {
                await this.saveAssignmentField(territory, key, value);
                if (territoryMap) territoryMap.render();
            }

            this.refreshRow(territoryId);
        } catch (error) {
            console.error('Failed to save cell:', error);
            this.toast('Failed to save change', 'error');
            this.refreshRow(territoryId);
        } finally {
            this.internalEdit = false;
        }
    }

    /**
     * Publisher and date columns edit the most recent assignment record.
     * If the territory has no record yet, the edit starts one.
     */
    async saveAssignmentField(territory, key, value) {
        const assignments = (territory.assignments || []).slice().sort((a, b) =>
            new Date(b.dateAssigned || 0) - new Date(a.dateAssigned || 0)
        );
        const latest = assignments[0] || null;

        if (latest) {
            await territoryData.updateAssignment(territory.id, latest.id, { [key]: value || null });
            return;
        }

        if (!value) return; // Nothing to record yet

        const record = {
            publisher: '',
            dateAssigned: new Date().toISOString().split('T')[0],
            dateCompleted: null,
            [key]: value
        };
        await territoryData.addAssignment(territory.id, record);
        this.toast('New record created for this territory');
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
                        <span>${v === '' ? '(Blanks)' : (col.type === 'date' ? this.formatDate(v) : this.escape(v))}</span>
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
            });
        });

        menu.querySelector('[data-menu-action="clear"]')?.addEventListener('click', () => {
            delete this.filters[key];
            this.closeFilterMenu();
            this.refresh();
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
     */
    applyExternalFilter(filters) {
        this.filters = {};
        Object.entries(filters || {}).forEach(([key, values]) => {
            if (values && values.length) this.filters[key] = new Set(values);
        });

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
        a.download = `territory_sheet_${new Date().toISOString().split('T')[0]}.csv`;
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
