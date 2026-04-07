// Canvas manager - manages the chart grid/canvas
class CanvasManager {
    constructor() {
        this.charts = [];
        this.selectedChartId = null;
        this.nextRow = 0;
        this.nextCol = 0;
    }

    init(initialCharts) {
        this.charts = initialCharts || [];
        this.renderAll();
        this.initDropZone();
        this.initSortable();
    }

    initDropZone() {
        const dropZone = document.getElementById('chart-canvas-drop');
        if (!dropZone) return;
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            const chartType = e.dataTransfer.getData('chartType');
            const chartName = e.dataTransfer.getData('chartName');
            if (chartType) {
                this.addChart({ chartType, title: chartName });
            }
        });
    }

    initSortable() {
        const grid = document.getElementById('chart-canvas-drop');
        if (!grid || typeof Sortable === 'undefined') return;
        Sortable.create(grid, {
            animation: 150,
            handle: '.chart-drag-handle',
            ghostClass: 'chart-ghost',
            onEnd: (evt) => {
                const cards = grid.querySelectorAll('.chart-card');
                const ids = Array.from(cards).map(c => c.dataset.chartId);
                this.reorderCharts(ids);
            }
        });
    }

    async addChart(partial) {
        const defaults = this.getDefaultsForType(partial.chartType || 'bar');
        const chart = {
            id: 'c' + Date.now(),
            chartType: partial.chartType || 'bar',
            title: partial.title || 'New Chart',
            datasetName: partial.datasetName || defaults.datasetName,
            width: partial.width || 6,
            height: partial.height || 300,
            gridCol: 0,
            gridRow: this.nextRow++,
            mapping: partial.mapping || defaults.mapping,
            aggregation: partial.aggregation || defaults.aggregation,
            style: partial.style || { backgroundColor: '#4A90D9', borderColor: '#2C6FAC', showLegend: true, legendPosition: 'top', showTooltips: true, fillArea: false, colorPalette: 'default', showDataLabels: false, fontFamily: 'Inter, sans-serif', titleFontSize: 14, animated: true, responsive: true, borderRadius: '4' },
            customJsonData: partial.customJsonData || ''
        };

        const resp = await fetch('/api/chart/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(chart)
        });
        const saved = await resp.json();
        chart.id = saved.id;
        this.charts.push(chart);
        this.renderChart(chart);
        this.selectChart(chart.id);
        this.updateEmptyState();
        return chart;
    }

    async deleteChart(chartId) {
        await fetch(`/api/chart/${chartId}`, { method: 'DELETE' });
        this.charts = this.charts.filter(c => c.id !== chartId);
        const card = document.querySelector(`.chart-card[data-chart-id="${chartId}"]`);
        if (card) card.remove();
        if (this.selectedChartId === chartId) {
            this.selectedChartId = null;
            if (window.propertiesPanel) window.propertiesPanel.clear();
        }
        this.updateEmptyState();
    }

    async duplicateChart(chartId) {
        const original = this.charts.find(c => c.id === chartId);
        if (!original) return;
        const copy = JSON.parse(JSON.stringify(original));
        copy.title = original.title + ' (Copy)';
        await this.addChart(copy);
    }

    selectChart(chartId) {
        this.selectedChartId = chartId;
        document.querySelectorAll('.chart-card').forEach(c => c.classList.remove('selected'));
        const card = document.querySelector(`.chart-card[data-chart-id="${chartId}"]`);
        if (card) card.classList.add('selected');
        const chart = this.charts.find(c => c.id === chartId);
        if (chart && window.propertiesPanel) window.propertiesPanel.load(chart);
    }

    async updateChart(chartDef) {
        const idx = this.charts.findIndex(c => c.id === chartDef.id);
        if (idx >= 0) this.charts[idx] = chartDef;

        await fetch(`/api/chart/${chartDef.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(chartDef)
        });

        const card = document.querySelector(`.chart-card[data-chart-id="${chartDef.id}"]`);
        if (card) {
            const titleEl = card.querySelector('.chart-title');
            if (titleEl) titleEl.textContent = chartDef.title;
            const canvasEl = card.querySelector('canvas');
            if (canvasEl) await window.chartRenderer.render(chartDef, canvasEl);
        }
    }

    renderAll() {
        const container = document.getElementById('chart-canvas-drop');
        if (!container) return;
        container.innerHTML = '';
        this.charts.forEach(c => this.renderChart(c));
        this.updateEmptyState();
    }

    renderChart(chartDef) {
        const container = document.getElementById('chart-canvas-drop');
        if (!container) return;

        const col = this.getColClass(chartDef.width || 6);
        const safeId = escapeHtml(chartDef.id);
        const safeTitle = escapeHtml(chartDef.title || 'Chart');
        const card = document.createElement('div');
        card.className = `chart-card col-${col}`;
        card.dataset.chartId = chartDef.id;
        card.innerHTML = `
            <div class="chart-card-header">
                <i class="bi bi-grip-vertical chart-drag-handle text-muted me-2"></i>
                <span class="chart-title">${safeTitle}</span>
                <div class="chart-card-actions ms-auto">
                    <button class="btn btn-xs btn-icon" data-action="edit" title="Edit">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-xs btn-icon" data-action="duplicate" title="Duplicate">
                        <i class="bi bi-copy"></i>
                    </button>
                    <button class="btn btn-xs btn-icon text-danger" data-action="delete" title="Delete">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>
            <div class="chart-canvas-wrap" style="height: ${parseInt(chartDef.height) || 300}px">
                <canvas id="canvas-${safeId}"></canvas>
            </div>
        `;

        card.querySelector('[data-action="edit"]').addEventListener('click', () => this.selectChart(chartDef.id));
        card.querySelector('[data-action="duplicate"]').addEventListener('click', () => this.duplicateChart(chartDef.id));
        card.querySelector('[data-action="delete"]').addEventListener('click', () => this.deleteChart(chartDef.id));

        container.appendChild(card);

        card.addEventListener('click', (e) => {
            if (!e.target.closest('button')) this.selectChart(chartDef.id);
        });

        const canvasEl = card.querySelector('canvas');
        setTimeout(() => window.chartRenderer.render(chartDef, canvasEl), 50);
    }

    getColClass(width) {
        const map = { 2:'2', 3:'3', 4:'4', 5:'5', 6:'6', 8:'8', 12:'12' };
        return map[width] || '6';
    }

    async reorderCharts(ids) {
        await fetch('/api/chart/reorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ids)
        });
    }

    updateEmptyState() {
        const empty = document.getElementById('canvas-empty-state');
        if (empty) empty.style.display = this.charts.length === 0 ? 'flex' : 'none';
    }

    async resetCanvas() {
        if (!confirm('Reset canvas to default charts?')) return;
        const resp = await fetch('/api/chart/reset', { method: 'POST' });
        const canvas = await resp.json();
        this.charts = canvas.charts || [];
        this.renderAll();
        this.initSortable();
    }

    getDefaultsForType(chartType) {
        // OHLC / candlestick charts use finance dataset with open/high/low/close fields
        if (['candlestick', 'ohlc'].includes(chartType)) {
            return {
                datasetName: 'finance',
                mapping: { labelField: 'ticker', valueField: 'close', groupByField: '', xField: 'open', yField: 'close', rField: '', multiValueFields: [] },
                aggregation: { function: 'SUM', enabled: false }
            };
        }
        // Bubble / bubble map use x/y/r fields from sales
        if (['bubble', 'bubbleMap'].includes(chartType)) {
            return {
                datasetName: 'sales',
                mapping: { labelField: 'month', valueField: 'revenue', groupByField: '', xField: 'units', yField: 'revenue', rField: 'profit', multiValueFields: [] },
                aggregation: { function: 'SUM', enabled: false }
            };
        }
        // Multi-series charts that benefit from groupByField
        if (['mixedBarLine', 'groupedBar', 'streamGraph', 'stackedArea100', 'populationPyramid', 'pairedBar'].includes(chartType)) {
            return {
                datasetName: 'sales',
                mapping: { labelField: 'month', valueField: 'revenue', groupByField: 'region', xField: '', yField: '', rField: '', multiValueFields: [] },
                aggregation: { function: 'SUM', enabled: false }
            };
        }
        // Financial/time charts prefer finance dataset
        if (['timeLine', 'rangeArea', 'stepLine', 'regressionLine'].includes(chartType)) {
            return {
                datasetName: 'finance',
                mapping: { labelField: 'ticker', valueField: 'close', groupByField: '', xField: '', yField: '', rField: '', multiValueFields: [] },
                aggregation: { function: 'SUM', enabled: false }
            };
        }
        // Weather dataset suits some statistical charts
        if (['bellCurve', 'histogram', 'boxPlot', 'violin', 'controlChart', 'confidenceBand', 'errorBar'].includes(chartType)) {
            return {
                datasetName: 'weather',
                mapping: { labelField: 'city', valueField: 'temperature', groupByField: '', xField: '', yField: '', rField: '', multiValueFields: [] },
                aggregation: { function: 'AVG', enabled: true }
            };
        }
        // Population dataset suits demographic charts (populationPyramid is handled in multi-series above)
        if (['dotPlot', 'dumbbell', 'slope', 'divergingBar'].includes(chartType)) {
            return {
                datasetName: 'population',
                mapping: { labelField: 'country', valueField: 'population', groupByField: '', xField: '', yField: '', rField: '', multiValueFields: [] },
                aggregation: { function: 'SUM', enabled: false }
            };
        }
        // Default: sales dataset
        return {
            datasetName: 'sales',
            mapping: { labelField: 'month', valueField: 'revenue', groupByField: '', xField: '', yField: '', rField: '', multiValueFields: [] },
            aggregation: { function: 'SUM', enabled: true }
        };
    }
}

window.canvasManager = new CanvasManager();
