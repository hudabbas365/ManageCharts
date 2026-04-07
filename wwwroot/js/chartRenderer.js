// Chart rendering engine using Chart.js
class ChartRenderer {
    constructor() {
        this.instances = {};
        this.colorPalettes = {
            default: ['#4A90D9','#E87C3E','#4CAF50','#9C27B0','#FF5722','#00BCD4','#FFC107','#795548'],
            ocean:   ['#006994','#0099CC','#00BFFF','#40E0D0','#20B2AA','#008080','#4682B4','#5F9EA0'],
            sunset:  ['#FF6B6B','#FF8E53','#FF6B35','#F7C59F','#EFEFD0','#4ECDC4','#45B7D1','#96CEB4'],
            forest:  ['#2D6A4F','#40916C','#52B788','#74C69D','#95D5B2','#B7E4C7','#D8F3DC','#1B4332'],
            rainbow: ['#E63946','#E76F51','#F4A261','#2A9D8F','#457B9D','#6A4C93','#BC4749','#264653'],
            pastel:  ['#FFB3BA','#FFDFBA','#FFFFBA','#BAFFC9','#BAE1FF','#D4BAFF','#FFBAF0','#C9F0FF'],
        };
    }

    getColors(palette, count) {
        const colors = this.colorPalettes[palette] || this.colorPalettes.default;
        const result = [];
        for (let i = 0; i < count; i++) result.push(colors[i % colors.length]);
        return result;
    }

    destroy(chartId) {
        if (this.instances[chartId]) {
            this.instances[chartId].destroy();
            delete this.instances[chartId];
        }
    }

    async render(chartDef, canvasEl) {
        this.destroy(chartDef.id);

        const ctx = canvasEl.getContext('2d');
        const data = await this.fetchData(chartDef);
        const config = this.buildConfig(chartDef, data);

        try {
            this.instances[chartDef.id] = new Chart(ctx, config);
        } catch(e) {
            console.warn('Chart render error:', e);
        }
    }

    async fetchData(chartDef) {
        if (chartDef.customJsonData) {
            try { return JSON.parse(chartDef.customJsonData); } catch(e) {}
        }
        const mapping = chartDef.mapping || {};
        const agg = chartDef.aggregation || {};
        const labelField = mapping.labelField || 'month';
        const valueField = mapping.valueField || 'revenue';

        if (agg.enabled && labelField && valueField) {
            const resp = await fetch(`/api/data/${chartDef.datasetName}/aggregated?labelField=${labelField}&valueField=${valueField}&aggregation=${agg.function || 'SUM'}`);
            return resp.json();
        } else {
            const resp = await fetch(`/api/data/${chartDef.datasetName}`);
            const raw = await resp.json();
            const labels = raw.map(r => r[labelField]);
            const values = raw.map(r => parseFloat(r[valueField]) || 0);
            return { labels, values };
        }
    }

    buildConfig(chartDef, data) {
        const style = chartDef.style || {};
        const palette = style.colorPalette || 'default';
        const labels = data.labels || [];
        const values = data.values || [];
        const colors = this.getColors(palette, labels.length);
        const type = this.mapType(chartDef.chartType);

        if (chartDef.chartType === 'gauge') {
            return this.buildGaugeConfig(chartDef, values, style);
        }
        if (chartDef.chartType === 'kpiCard') {
            return this.buildKpiConfig(chartDef, labels, values, style);
        }

        let datasets = [{
            label: chartDef.title || 'Data',
            data: values,
            backgroundColor: ['pie','doughnut','polarArea'].includes(type) ? colors : colors[0] + 'CC',
            borderColor: ['pie','doughnut','polarArea'].includes(type) ? colors : colors[0],
            borderWidth: 2,
            fill: style.fillArea || false,
            tension: 0.4,
            borderRadius: parseInt(style.borderRadius || '4'),
            pointRadius: 4,
            pointHoverRadius: 6
        }];

        const options = {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: style.animated !== false ? 800 : 0 },
            plugins: {
                legend: {
                    display: style.showLegend !== false,
                    position: style.legendPosition || 'top',
                    labels: { font: { family: style.fontFamily || 'Inter, sans-serif', size: 11 } }
                },
                tooltip: { enabled: style.showTooltips !== false },
                title: {
                    display: true,
                    text: chartDef.title || '',
                    font: { size: style.titleFontSize || 14, family: style.fontFamily || 'Inter, sans-serif', weight: '600' },
                    color: '#2c3e50'
                }
            },
            scales: ['bar','line','scatter'].includes(type) ? {
                x: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 10 } } },
                y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 10 } }, beginAtZero: true }
            } : {}
        };

        if (type === 'bar' && chartDef.chartType === 'horizontalBar') {
            options.indexAxis = 'y';
        }
        if (type === 'bar' && (chartDef.chartType === 'stackedBar' || chartDef.chartType === 'stackedBar100')) {
            if (options.scales.x) options.scales.x.stacked = true;
            if (options.scales.y) options.scales.y.stacked = true;
        }

        return { type, data: { labels, datasets }, options };
    }

    buildGaugeConfig(chartDef, values, style) {
        const val = values[0] || 0;
        const max = Math.max(...values, 100);
        const pct = Math.min(val / max, 1);
        return {
            type: 'doughnut',
            data: {
                labels: ['Value', 'Remaining'],
                datasets: [{
                    data: [pct * 100, (1 - pct) * 100],
                    backgroundColor: ['#4A90D9', '#E9ECEF'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                circumference: 180,
                rotation: -90,
                plugins: {
                    legend: { display: false },
                    title: { display: true, text: chartDef.title || 'Gauge' }
                }
            }
        };
    }

    buildKpiConfig(chartDef, labels, values, style) {
        return {
            type: 'bar',
            data: { labels: labels.slice(0,1), datasets: [{ data: values.slice(0,1), backgroundColor: '#4A90D9' }] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    title: { display: true, text: chartDef.title || 'KPI' }
                }
            }
        };
    }

    mapType(chartType) {
        const map = {
            bar: 'bar', horizontalBar: 'bar', stackedBar: 'bar', groupedBar: 'bar',
            waterfall: 'bar', funnel: 'bar', treemap: 'bar', heatmap: 'bar',
            sankey: 'bar', histogram: 'bar', boxPlot: 'bar', pareto: 'bar',
            bulletChart: 'bar', marimekko: 'bar', lollipop: 'bar', divergingBar: 'bar',
            spanChart: 'bar', pairedBar: 'bar', populationPyramid: 'bar',
            stackedBar100: 'bar', waffleChart: 'bar', pictograph: 'bar',
            progressBar: 'bar', kpiCard: 'bar', metricTile: 'bar',
            line: 'line', area: 'line', stepLine: 'line', streamGraph: 'line',
            burnDown: 'line', bellCurve: 'line', controlChart: 'line',
            confidenceBand: 'line', timeLine: 'line', rangeArea: 'line',
            slope: 'line', sparkline: 'line', stackedArea100: 'line',
            pie: 'pie', sunburst: 'pie', chordDiagram: 'pie',
            donut: 'doughnut', gauge: 'doughnut', radialProgress: 'doughnut',
            nightingaleRose: 'polarArea', polarArea: 'polarArea',
            scatter: 'scatter', dotPlot: 'scatter', networkGraph: 'scatter',
            arcDiagram: 'scatter', forceDirected: 'scatter', regressionLine: 'scatter',
            bubble: 'bubble', bubbleMap: 'bubble',
            radar: 'radar',
        };
        return map[chartType] || 'bar';
    }
}

window.chartRenderer = new ChartRenderer();
