// Canvas manager - manages charts on a free-form absolute-positioned canvas
class CanvasManager {
    constructor() {
        this.charts = [];
        this.selectedChartId = null;
        this._maxZIndex = 1;
        this._dragState = null;
    }

    init(initialCharts) {
        this.charts = initialCharts || [];
        this.renderAll();
        this.initDropZone();
    }

    initDropZone() {
        const dropZone = document.getElementById('chart-canvas-drop');
        if (!dropZone) return;
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });
        dropZone.addEventListener('dragleave', (e) => {
            if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('drag-over');
        });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            const chartType = e.dataTransfer.getData('chartType');
            const chartName = e.dataTransfer.getData('chartName');
            if (chartType) {
                const rect = dropZone.getBoundingClientRect();
                const x = Math.max(0, e.clientX - rect.left - 100);
                const y = Math.max(0, e.clientY - rect.top - 20);
                this.addChart({ chartType, title: chartName, posX: Math.round(x), posY: Math.round(y) });
            }
        });
    }

    async addChart(partial) {
        const defaultX = 20 + (this.charts.length % 5) * 30;
        const defaultY = 20 + (this.charts.length % 5) * 30;
        const chart = {
            id: 'c' + Date.now(),
            chartType: partial.chartType || 'bar',
            title: partial.title || 'New Chart',
            datasetName: partial.datasetName || 'sales',
            width: partial.width || 6,
            height: partial.height || 300,
            gridCol: 0,
            gridRow: 0,
            posX: partial.posX !== undefined ? partial.posX : defaultX,
            posY: partial.posY !== undefined ? partial.posY : defaultY,
            zIndex: ++this._maxZIndex,
            mapping: partial.mapping || { labelField: 'month', valueField: 'revenue', groupByField: '', xField: '', yField: '', rField: '', multiValueFields: [] },
            aggregation: partial.aggregation || { function: 'SUM', enabled: true },
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
        copy.posX = (original.posX || 0) + 30;
        copy.posY = (original.posY || 0) + 30;
        await this.addChart(copy);
    }

    selectChart(chartId) {
        this.selectedChartId = chartId;
        document.querySelectorAll('.chart-card').forEach(c => c.classList.remove('selected'));
        const card = document.querySelector(`.chart-card[data-chart-id="${chartId}"]`);
        if (card) {
            card.classList.add('selected');
            // Bring to front
            const chart = this.charts.find(c => c.id === chartId);
            if (chart) {
                chart.zIndex = ++this._maxZIndex;
                card.style.zIndex = chart.zIndex;
            }
        }
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
            // Update card width
            const cardWidth = this.colsToPixels(chartDef.width || 6);
            card.style.width = cardWidth + 'px';
            const canvasWrap = card.querySelector('.chart-canvas-wrap');
            if (canvasWrap) canvasWrap.style.height = (parseInt(chartDef.height) || 300) + 'px';
            const canvasEl = card.querySelector('canvas');
            if (canvasEl) await window.chartRenderer.render(chartDef, canvasEl);
        }
    }

    renderAll() {
        const container = document.getElementById('chart-canvas-drop');
        if (!container) return;
        container.innerHTML = '';
        this._maxZIndex = 0;
        this.charts.forEach(c => {
            if (c.zIndex > this._maxZIndex) this._maxZIndex = c.zIndex;
        });
        this.charts.forEach(c => this.renderChart(c));
        this.updateEmptyState();
    }

    colsToPixels(width) {
        // Convert Bootstrap cols (2-12) to pixel width
        const baseWidth = Math.min(window.innerWidth - 600, 900);
        const pct = (parseInt(width) || 6) / 12;
        return Math.round(Math.max(200, baseWidth * pct));
    }

    renderChart(chartDef) {
        const container = document.getElementById('chart-canvas-drop');
        if (!container) return;

        const safeId = escapeHtml(chartDef.id);
        const safeTitle = escapeHtml(chartDef.title || 'Chart');
        const posX = chartDef.posX !== undefined ? chartDef.posX : 20;
        const posY = chartDef.posY !== undefined ? chartDef.posY : 20;
        const cardWidth = this.colsToPixels(chartDef.width || 6);
        const zIdx = chartDef.zIndex || 1;

        const card = document.createElement('div');
        card.className = 'chart-card';
        card.dataset.chartId = chartDef.id;
        card.style.cssText = `left:${posX}px;top:${posY}px;width:${cardWidth}px;z-index:${zIdx};`;

        card.innerHTML = `
            <div class="chart-card-header">
                <i class="bi bi-grip-vertical chart-drag-handle text-muted me-2" title="Drag to reposition"></i>
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

        card.querySelector('[data-action="edit"]').addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectChart(chartDef.id);
        });
        card.querySelector('[data-action="duplicate"]').addEventListener('click', (e) => {
            e.stopPropagation();
            this.duplicateChart(chartDef.id);
        });
        card.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteChart(chartDef.id);
        });

        card.addEventListener('mousedown', (e) => {
            if (!e.target.closest('button')) this.selectChart(chartDef.id);
        });

        container.appendChild(card);

        // Make draggable
        this._makeCardDraggable(card, chartDef);

        const canvasEl = card.querySelector('canvas');
        requestAnimationFrame(() => window.chartRenderer.render(chartDef, canvasEl));
    }

    _makeCardDraggable(card, chartDef) {
        const handle = card.querySelector('.chart-drag-handle');
        if (!handle) return;

        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();

            this.selectChart(chartDef.id);

            const container = document.getElementById('chart-canvas-drop');
            const scrollEl = container.parentElement; // .canvas-scroll
            // Snapshot rects at drag start; adjust for current scroll offset
            const containerBase = container.getBoundingClientRect();
            const scrollLeft = scrollEl ? scrollEl.scrollLeft : 0;
            const scrollTop  = scrollEl ? scrollEl.scrollTop  : 0;
            const cardRect = card.getBoundingClientRect();

            // Offset from mouse to card top-left
            const offsetX = e.clientX - cardRect.left;
            const offsetY = e.clientY - cardRect.top;

            card.classList.add('dragging');

            const onMouseMove = (ev) => {
                const sl = scrollEl ? scrollEl.scrollLeft : 0;
                const st = scrollEl ? scrollEl.scrollTop  : 0;
                const x = Math.max(0, ev.clientX - containerBase.left + (sl - scrollLeft) - offsetX);
                const y = Math.max(0, ev.clientY - containerBase.top  + (st - scrollTop)  - offsetY);
                card.style.left = x + 'px';
                card.style.top  = y + 'px';
            };

            const onMouseUp = (ev) => {
                card.classList.remove('dragging');
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);

                const x = Math.max(0, ev.clientX - containerRect.left - offsetX);
                const y = Math.max(0, ev.clientY - containerRect.top - offsetY);
                chartDef.posX = Math.round(x);
                chartDef.posY = Math.round(y);

                const chart = this.charts.find(c => c.id === chartDef.id);
                if (chart) {
                    chart.posX = chartDef.posX;
                    chart.posY = chartDef.posY;
                    // Persist position change
                    fetch(`/api/chart/${chartDef.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(chart)
                    }).catch(err => console.warn('Could not persist chart position:', err));
                }
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
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
    }
}

window.canvasManager = new CanvasManager();
