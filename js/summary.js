/**
 * Summary Module
 *
 * Group-wise overview: how many territories each group holds, how many are
 * in progress, completed or not yet started, and how much of the group was
 * covered in a chosen service year.
 */

class TerritorySummary {
    constructor() {
        this.serviceYear = null; // e.g. '2025-2026'; null = current service year
    }

    init() {
        this.container = document.getElementById('summaryCards');
        this.totalsEl = document.getElementById('summaryTotals');
        this.yearSelect = document.getElementById('summaryServiceYear');

        this.yearSelect?.addEventListener('change', (e) => {
            this.serviceYear = e.target.value;
            this.render();
        });

        // Drill through to the sheet with the matching filter applied
        const drill = (e) => {
            const target = e.target.closest('[data-drill-group]');
            if (!target || !territorySheet || !app) return;

            const group = target.dataset.drillGroup;
            const status = target.dataset.drillStatus;

            territorySheet.applyExternalFilter({
                group: group === '*' ? [] : [group],
                status: status ? [status] : []
            });
            app.switchView('sheet');
        };

        this.container?.addEventListener('click', drill);
        this.totalsEl?.addEventListener('click', drill);

        this.populateServiceYears();
        this.render();
    }

    /**
     * Fill the service year dropdown from the years present in the data
     */
    populateServiceYears() {
        if (!this.yearSelect || !app) return;

        const years = app.getServiceYears().filter(y => !y.future);
        this.yearSelect.innerHTML = years.map(y =>
            `<option value="${y.value}">${y.label}${y.current ? ' (Current)' : ''}</option>`
        ).join('');

        // Keep the current selection when the list is rebuilt
        const preferred = years.some(y => y.value === this.serviceYear)
            ? this.serviceYear
            : (years.find(y => y.current) || years[0] || {}).value;

        if (preferred) {
            this.yearSelect.value = preferred;
            this.serviceYear = preferred;
        }
    }

    /**
     * Service year boundaries (Sep 1 - Aug 31)
     */
    getServiceYearRange() {
        let startYear = this.serviceYear ? parseInt(String(this.serviceYear).split('-')[0], 10) : null;
        if (!startYear) {
            const now = new Date();
            startYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
        }
        return {
            start: new Date(startYear, 8, 1),
            end: new Date(startYear + 1, 7, 31, 23, 59, 59)
        };
    }

    /**
     * Per-group tallies plus an "all groups" total
     */
    buildStats() {
        const { start, end } = this.getServiceYearRange();
        const groups = territoryData.getAllGroups();

        const blank = (name, color, id) => ({
            id, name, color,
            total: 0,
            yetToStart: 0,
            inProgress: 0,
            completed: 0,
            doneThisYear: 0,
            neverCompleted: 0
        });

        const buckets = new Map();
        groups.forEach(g => buckets.set(String(g.id), blank(g.name, g.color, g.id)));

        const ungrouped = blank('Ungrouped', '#DDD5C8', null);
        const totals = blank('All Groups', null, '*');

        territoryData.getAllTerritories().forEach(t => {
            const group = territoryData.getGroup(t.groupId !== undefined ? t.groupId : t.group);
            const bucket = group ? buckets.get(String(group.id)) : ungrouped;
            if (!bucket) return;

            const assignments = (t.assignments || []).slice().sort((a, b) =>
                new Date(b.dateAssigned || 0) - new Date(a.dateAssigned || 0)
            );
            const latest = assignments[0] || null;

            const completedDates = assignments.filter(a => a.dateCompleted).map(a => new Date(a.dateCompleted));
            const doneThisYear = completedDates.some(d => d >= start && d <= end);

            [bucket, totals].forEach(b => {
                b.total++;
                if (!latest) b.yetToStart++;
                else if (latest.dateAssigned && !latest.dateCompleted) b.inProgress++;
                else b.completed++;

                if (doneThisYear) b.doneThisYear++;
                if (!completedDates.length) b.neverCompleted++;
            });
        });

        const list = [...buckets.values()];
        if (ungrouped.total) list.push(ungrouped);

        return { groups: list, totals };
    }

    render() {
        if (!this.container) return;

        const { groups, totals } = this.buildStats();

        this.renderTotals(totals);

        this.container.innerHTML = groups.length
            ? groups.map(g => this.renderCard(g)).join('')
            : '<p class="panel-placeholder">No groups yet. Add groups to see a breakdown.</p>';
    }

    renderTotals(totals) {
        if (!this.totalsEl) return;

        const tiles = [
            { label: 'Territories', value: totals.total, cls: 'neutral', status: null },
            { label: 'Yet to start', value: totals.yetToStart, cls: 'danger', status: 'Yet to start' },
            { label: 'In progress', value: totals.inProgress, cls: 'warning', status: 'In progress' },
            { label: 'Completed', value: totals.completed, cls: 'success', status: 'Completed' },
            { label: 'Covered this year', value: totals.doneThisYear, cls: 'info', status: null },
            { label: 'Never completed', value: totals.neverCompleted, cls: 'danger', status: null }
        ];

        this.totalsEl.innerHTML = tiles.map(tile => `
            <div class="summary-tile ${tile.cls}" ${tile.status ? `data-drill-group="*" data-drill-status="${tile.status}" role="button"` : ''}>
                <span class="summary-tile-value">${tile.value}</span>
                <span class="summary-tile-label">${tile.label}</span>
            </div>
        `).join('');
    }

    renderCard(group) {
        const pct = group.total ? Math.round((group.doneThisYear / group.total) * 100) : 0;
        // Territories with no group filter on a blank Group cell in the sheet
        const drill = group.id === null ? '' : this.escape(group.name);

        const rows = [
            { label: 'Yet to start', value: group.yetToStart, cls: 'danger', status: 'Yet to start' },
            { label: 'In progress', value: group.inProgress, cls: 'warning', status: 'In progress' },
            { label: 'Completed', value: group.completed, cls: 'success', status: 'Completed' }
        ];

        return `
            <div class="summary-card">
                <div class="summary-card-bar" style="background: ${group.color || 'var(--color-border-dark)'}"></div>
                <div class="summary-card-head">
                    <h3 class="summary-card-title">${this.escape(group.name)}</h3>
                    <span class="summary-card-total">${group.total}<small>territories</small></span>
                </div>

                <div class="summary-stat-rows">
                    ${rows.map(row => `
                        <button class="summary-stat-row ${row.cls}" data-drill-group="${drill}" data-drill-status="${row.status}">
                            <span class="summary-stat-dot"></span>
                            <span class="summary-stat-label">${row.label}</span>
                            <span class="summary-stat-value">${row.value}</span>
                        </button>
                    `).join('')}
                </div>

                <div class="summary-progress">
                    <div class="summary-progress-head">
                        <span>Covered in ${this.serviceYear || 'this year'}</span>
                        <strong>${group.doneThisYear} / ${group.total} &middot; ${pct}%</strong>
                    </div>
                    <div class="summary-progress-track">
                        <div class="summary-progress-fill" style="width: ${pct}%"></div>
                    </div>
                </div>

                <div class="summary-card-foot">
                    <span class="summary-never">${group.neverCompleted} never completed</span>
                    <button class="btn btn-secondary btn-sm" data-drill-group="${drill}">Open in Sheet</button>
                </div>
            </div>
        `;
    }

    escape(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}

// Export
let territorySummary = null;
