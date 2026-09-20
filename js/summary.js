/**
 * Summary Module
 *
 * Group-wise overview for a chosen service year: how many territories each
 * group holds and how many were completed, started or not touched during
 * that year. Personal territories are counted separately and left out of the
 * group totals and progress.
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
            app?.syncUrl();
        });

        // Drill through to the sheet with the matching filter applied
        const drill = (e) => {
            const target = e.target.closest('[data-drill-group]');
            if (!target || !territorySheet || !app) return;

            const group = target.dataset.drillGroup;
            const status = target.dataset.drillStatus;
            const personal = target.dataset.drillPersonal;

            territorySheet.applyExternalFilter({
                group: group === '*' ? [] : [group],
                status: status ? [status] : [],
                personal: personal ? [personal] : []
            }, this.serviceYear);
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
     * Per-group tallies for the selected service year, plus an overall total.
     *
     * `total` counts the territories the group is responsible for this year,
     * which excludes personal territories; those are reported as `personal`.
     */
    buildStats() {
        const range = territoryData.getServiceYearRange(this.serviceYear);
        const groups = territoryData.getAllGroups();

        const blank = (name, color, id) => ({
            id, name, color,
            total: 0,        // non-personal territories
            personal: 0,
            yetToStart: 0,
            inProgress: 0,
            completed: 0,
            covered: 0,      // completed at least once during the year
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

            if (territoryData.isPersonalTerritory(t)) {
                bucket.personal++;
                totals.personal++;
                return;
            }

            const activity = territoryData.getServiceYearActivity(t, range);

            [bucket, totals].forEach(b => {
                b.total++;
                if (activity.status === 'In progress') b.inProgress++;
                else if (activity.status === 'Completed') b.completed++;
                else b.yetToStart++;

                if (activity.coveredInYear) b.covered++;
                if (activity.neverCompleted) b.neverCompleted++;
            });
        });

        const list = [...buckets.values()];
        if (ungrouped.total || ungrouped.personal) list.push(ungrouped);

        return { groups: list, totals, range };
    }

    render() {
        if (!this.container) return;

        const { groups, totals, range } = this.buildStats();

        this.renderTotals(totals, range);

        this.container.innerHTML = groups.length
            ? groups.map(g => this.renderCard(g, range)).join('')
            : '<p class="panel-placeholder">No groups yet. Add groups to see a breakdown.</p>';
    }

    renderTotals(totals, range) {
        if (!this.totalsEl) return;

        const tiles = [
            { label: 'Territories', value: totals.total + totals.personal, cls: 'neutral', status: null },
            { label: 'Personal (not counted)', value: totals.personal, cls: 'info', status: null, personal: 'Personal' },
            { label: 'Congregation territories', value: totals.total, cls: 'neutral', status: null, personal: 'Regular' },
            { label: `Completed in ${range.value}`, value: totals.completed, cls: 'success', status: 'Completed' },
            { label: 'In progress', value: totals.inProgress, cls: 'warning', status: 'In progress' },
            { label: `Not worked in ${range.value}`, value: totals.yetToStart, cls: 'danger', status: 'Yet to start' },
            { label: 'Never completed', value: totals.neverCompleted, cls: 'danger', status: null }
        ];

        this.totalsEl.innerHTML = tiles.map(tile => {
            const drillable = tile.status || tile.personal;
            const attrs = drillable
                ? `data-drill-group="*" ${tile.status ? `data-drill-status="${tile.status}"` : ''} ${tile.personal ? `data-drill-personal="${tile.personal}"` : ''} role="button"`
                : '';
            return `
                <div class="summary-tile ${tile.cls}" ${attrs}>
                    <span class="summary-tile-value">${tile.value}</span>
                    <span class="summary-tile-label">${tile.label}</span>
                </div>
            `;
        }).join('');
    }

    renderCard(group, range) {
        const pct = group.total ? Math.round((group.covered / group.total) * 100) : 0;
        // Territories with no group filter on a blank Group cell in the sheet
        const drill = group.id === null ? '' : this.escape(group.name);

        const rows = [
            { label: `Completed in ${range.value}`, value: group.completed, cls: 'success', status: 'Completed' },
            { label: 'In progress', value: group.inProgress, cls: 'warning', status: 'In progress' },
            { label: 'Not worked yet', value: group.yetToStart, cls: 'danger', status: 'Yet to start' }
        ];

        return `
            <div class="summary-card">
                <div class="summary-card-bar" style="background: ${group.color || 'var(--color-border-dark)'}"></div>
                <div class="summary-card-head">
                    <h3 class="summary-card-title">${this.escape(group.name)}</h3>
                    <span class="summary-card-total">${group.total}<small>territories</small></span>
                </div>

                ${group.personal ? `
                    <button class="summary-personal-note" data-drill-group="${drill}" data-drill-personal="Personal">
                        ${group.personal} personal territor${group.personal === 1 ? 'y' : 'ies'} not counted
                    </button>
                ` : ''}

                <div class="summary-stat-rows">
                    ${rows.map(row => `
                        <button class="summary-stat-row ${row.cls}" data-drill-group="${drill}"
                                data-drill-status="${row.status}" data-drill-personal="Regular">
                            <span class="summary-stat-dot"></span>
                            <span class="summary-stat-label">${row.label}</span>
                            <span class="summary-stat-value">${row.value}</span>
                        </button>
                    `).join('')}
                </div>

                <div class="summary-progress">
                    <div class="summary-progress-head">
                        <span>Covered in ${range.value}</span>
                        <strong>${group.covered} / ${group.total} &middot; ${pct}%</strong>
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

    // ------------------------------------------------------------------
    // URL state
    // ------------------------------------------------------------------

    writeUrlParams(params) {
        if (this.serviceYear) params.set('summaryYear', this.serviceYear);
    }

    readUrlParams(params) {
        const year = params.get('summaryYear');
        if (!year) return;
        this.serviceYear = year;
        if (this.yearSelect) this.yearSelect.value = year;
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
