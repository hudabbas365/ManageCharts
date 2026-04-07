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

    // ─── Core helpers ─────────────────────────────────────────────────────────────

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
        } catch (e) {
            console.warn('Chart render error:', e);
        }
    }

    // ─── Data fetching ─────────────────────────────────────────────────────────────

    async fetchData(chartDef) {
        if (chartDef.customJsonData) {
            try { return JSON.parse(chartDef.customJsonData); } catch (e) {}
        }
        const mapping = chartDef.mapping || {};
        const agg = chartDef.aggregation || {};
        const labelField = mapping.labelField || 'month';
        const valueField = mapping.valueField || 'revenue';
        const chartType = chartDef.chartType;

        // OHLC types need raw open/high/low/close fields
        if (['candlestick', 'ohlc'].includes(chartType)) {
            const resp = await fetch(`/api/data/${chartDef.datasetName}`);
            const raw = await resp.json();
            return {
                labels: raw.map(r => String(r[labelField] || r.ticker || '')),
                ohlc: raw.map(r => ({
                    o: parseFloat(r[mapping.xField || 'open']) || 0,
                    h: parseFloat(r['high']) || 0,
                    l: parseFloat(r['low']) || 0,
                    c: parseFloat(r[mapping.yField || 'close']) || 0,
                }))
            };
        }

        // Bubble types need x, y, r fields
        if (['bubble', 'bubbleMap'].includes(chartType)) {
            const resp = await fetch(`/api/data/${chartDef.datasetName}`);
            const raw = await resp.json();
            const xF = mapping.xField || 'units';
            const yF = mapping.yField || 'revenue';
            const rF = mapping.rField || 'profit';
            return {
                labels: raw.map(r => String(r[labelField] || '')),
                bubbleData: raw.map(r => ({
                    x: parseFloat(r[xF]) || 0,
                    y: parseFloat(r[yF]) || 0,
                    r: Math.max(3, Math.sqrt(Math.abs(parseFloat(r[rF]) || 0) / 500))
                }))
            };
        }

        // Multi-series: group data by groupByField when available
        const multiSeriesTypes = ['mixedBarLine','groupedBar','stackedArea100','streamGraph','populationPyramid','pairedBar'];
        if (mapping.groupByField && multiSeriesTypes.includes(chartType)) {
            const resp = await fetch(`/api/data/${chartDef.datasetName}`);
            const raw = await resp.json();
            const labelSet = [...new Set(raw.map(r => String(r[labelField] || '')))];
            const groupSet = [...new Set(raw.map(r => String(r[mapping.groupByField] || '')))];
            const grouped = {};
            groupSet.forEach(g => { grouped[g] = {}; });
            raw.forEach(r => {
                const label = String(r[labelField] || '');
                const group = String(r[mapping.groupByField] || '');
                if (grouped[group] !== undefined) {
                    const v = parseFloat(r[valueField]) || 0;
                    grouped[group][label] = (grouped[group][label] || 0) + v;
                }
            });
            return {
                labels: labelSet,
                series: groupSet.map(g => ({
                    name: g,
                    values: labelSet.map(l => grouped[g][l] || 0)
                }))
            };
        }

        // Standard aggregated fetch
        if (agg.enabled && labelField && valueField) {
            const resp = await fetch(`/api/data/${chartDef.datasetName}/aggregated?labelField=${labelField}&valueField=${valueField}&aggregation=${agg.function || 'SUM'}`);
            return resp.json();
        }

        // Standard raw fetch
        const resp = await fetch(`/api/data/${chartDef.datasetName}`);
        const raw = await resp.json();
        return {
            labels: raw.map(r => r[labelField]),
            values: raw.map(r => parseFloat(r[valueField]) || 0)
        };
    }

    // ─── Config dispatch ───────────────────────────────────────────────────────────

    buildConfig(chartDef, data) {
        const style = chartDef.style || {};
        const palette = style.colorPalette || 'default';
        const labels = data.labels || [];
        const values = data.values || [];

        switch (chartDef.chartType) {
            // ── Advanced ──
            case 'mixedBarLine':      return this.buildMixedBarLineConfig(chartDef, data, style, palette);
            case 'groupedBar':        return this.buildGroupedBarConfig(chartDef, data, style, palette);
            case 'waterfall':         return this.buildWaterfallConfig(chartDef, labels, values, style, palette);
            case 'funnel':            return this.buildFunnelConfig(chartDef, labels, values, style, palette);
            case 'gauge':             return this.buildGaugeConfig(chartDef, values, style);
            case 'treemap':           return this.buildTreemapConfig(chartDef, labels, values, style, palette);
            case 'heatmap':           return this.buildHeatmapConfig(chartDef, labels, values, style, palette);
            case 'sankey':            return this.buildSankeyConfig(chartDef, labels, values, style, palette);
            case 'sunburst':          return this.buildSunburstConfig(chartDef, labels, values, style, palette);
            // ── Statistical ──
            case 'histogram':         return this.buildHistogramConfig(chartDef, labels, values, style, palette);
            case 'boxPlot':           return this.buildBoxPlotConfig(chartDef, labels, values, style, palette);
            case 'violin':            return this.buildViolinConfig(chartDef, labels, values, style, palette);
            case 'bellCurve':         return this.buildBellCurveConfig(chartDef, labels, values, style, palette);
            case 'pareto':            return this.buildParetoConfig(chartDef, labels, values, style, palette);
            case 'controlChart':      return this.buildControlChartConfig(chartDef, labels, values, style, palette);
            case 'regressionLine':    return this.buildRegressionLineConfig(chartDef, labels, values, style, palette);
            case 'confidenceBand':    return this.buildConfidenceBandConfig(chartDef, labels, values, style, palette);
            case 'errorBar':          return this.buildErrorBarConfig(chartDef, labels, values, style, palette);
            case 'stemLeaf':          return this.buildStemLeafConfig(chartDef, labels, values, style, palette);
            // ── Time Series ──
            case 'timeLine':          return this.buildTimeLineConfig(chartDef, labels, values, style, palette);
            case 'candlestick':       return this.buildCandlestickConfig(chartDef, data, style, palette);
            case 'ohlc':              return this.buildOhlcConfig(chartDef, data, style, palette);
            case 'rangeArea':         return this.buildRangeAreaConfig(chartDef, labels, values, style, palette);
            case 'stepLine':          return this.buildStepLineConfig(chartDef, labels, values, style, palette);
            case 'streamGraph':       return this.buildStreamGraphConfig(chartDef, data, style, palette);
            case 'eventTimeline':     return this.buildEventTimelineConfig(chartDef, labels, values, style, palette);
            case 'gantt':             return this.buildGanttConfig(chartDef, labels, values, style, palette);
            case 'burnDown':          return this.buildBurnDownConfig(chartDef, labels, values, style, palette);
            case 'velocityChart':     return this.buildVelocityChartConfig(chartDef, labels, values, style, palette);
            // ── Comparison ──
            case 'bulletChart':       return this.buildBulletChartConfig(chartDef, labels, values, style, palette);
            case 'marimekko':         return this.buildMarimekkoConfig(chartDef, labels, values, style, palette);
            case 'dotPlot':           return this.buildDotPlotConfig(chartDef, labels, values, style, palette);
            case 'lollipop':          return this.buildLollipopConfig(chartDef, labels, values, style, palette);
            case 'dumbbell':          return this.buildDumbbellConfig(chartDef, labels, values, style, palette);
            case 'slope':             return this.buildSlopeConfig(chartDef, labels, values, style, palette);
            case 'divergingBar':      return this.buildDivergingBarConfig(chartDef, labels, values, style, palette);
            case 'spanChart':         return this.buildSpanChartConfig(chartDef, labels, values, style, palette);
            case 'pairedBar':         return this.buildPairedBarConfig(chartDef, data, style, palette);
            case 'populationPyramid': return this.buildPopulationPyramidConfig(chartDef, data, style, palette);
            // ── Geographic ──
            case 'choropleth':        return this.buildChoroplethConfig(chartDef, labels, values, style, palette);
            case 'bubbleMap':         return this.buildBubbleMapConfig(chartDef, data, style, palette);
            case 'heatMapGeo':        return this.buildHeatmapConfig(chartDef, labels, values, style, palette);
            case 'flowMap':           return this.buildFlowMapConfig(chartDef, labels, values, style, palette);
            case 'spikeMap':          return this.buildSpikeMapConfig(chartDef, labels, values, style, palette);
            // ── Relationship ──
            case 'networkGraph':      return this.buildNetworkGraphConfig(chartDef, labels, values, style, palette);
            case 'chordDiagram':      return this.buildChordDiagramConfig(chartDef, labels, values, style, palette);
            case 'arcDiagram':        return this.buildArcDiagramConfig(chartDef, labels, values, style, palette);
            case 'forceDirected':     return this.buildNetworkGraphConfig(chartDef, labels, values, style, palette);
            case 'matrix':            return this.buildHeatmapConfig(chartDef, labels, values, style, palette);
            // ── Part-to-Whole ──
            case 'stackedBar100':     return this.buildStackedBar100Config(chartDef, labels, values, style, palette);
            case 'stackedArea100':    return this.buildStackedArea100Config(chartDef, data, style, palette);
            case 'waffleChart':       return this.buildWaffleChartConfig(chartDef, labels, values, style, palette);
            case 'pictograph':        return this.buildWaffleChartConfig(chartDef, labels, values, style, palette);
            case 'nightingaleRose':   return this.buildNightingaleRoseConfig(chartDef, labels, values, style, palette);
            // ── KPI/Metrics ──
            case 'kpiCard':           return this.buildKpiConfig(chartDef, labels, values, style);
            case 'sparkline':         return this.buildSparklineConfig(chartDef, labels, values, style, palette);
            case 'progressBar':       return this.buildProgressBarConfig(chartDef, labels, values, style, palette);
            case 'radialProgress':    return this.buildRadialProgressConfig(chartDef, values, style);
            case 'metricTile':        return this.buildKpiConfig(chartDef, labels, values, style);
            default:
                return this.buildDefaultConfig(chartDef, data, style, palette);
        }
    }

    // ─── Shared base options ───────────────────────────────────────────────────────

    baseOptions(chartDef, style, withScales = true) {
        const opts = {
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
            }
        };
        if (withScales) {
            opts.scales = {
                x: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 10 } } },
                y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 10 } }, beginAtZero: true }
            };
        }
        return opts;
    }

    // ─── Statistical helpers ───────────────────────────────────────────────────────

    percentile(arr, p) {
        if (!arr.length) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const idx = (p / 100) * (sorted.length - 1);
        const lo = Math.floor(idx), hi = Math.ceil(idx);
        return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
    }

    mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }

    stddev(arr) {
        const m = this.mean(arr);
        return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(arr.length - 1, 1));
    }

    linearRegression(xs, ys) {
        const n = xs.length;
        const mx = this.mean(xs), my = this.mean(ys);
        const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
        const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
        const slope = den ? num / den : 0;
        return { slope, intercept: my - slope * mx };
    }

    // ─── Default fallback ──────────────────────────────────────────────────────────

    buildDefaultConfig(chartDef, data, style, palette) {
        const labels = data.labels || [];
        const values = data.values || [];
        const colors = this.getColors(palette, labels.length);
        const type = this.mapType(chartDef.chartType);
        const opts = this.baseOptions(chartDef, style, ['bar','line','scatter'].includes(type));
        const isCategorical = ['pie','doughnut','polarArea'].includes(type);

        const datasets = [{
            label: chartDef.title || 'Data',
            data: (type === 'bubble' && data.bubbleData) ? data.bubbleData : values,
            backgroundColor: isCategorical ? colors : colors[0] + 'CC',
            borderColor: isCategorical ? colors : colors[0],
            borderWidth: 2,
            fill: (chartDef.chartType === 'area') ? true : (style.fillArea || false),
            tension: 0.4,
            borderRadius: parseInt(style.borderRadius || '4'),
            pointRadius: 4,
            pointHoverRadius: 6
        }];

        if (chartDef.chartType === 'horizontalBar' && opts.scales) opts.indexAxis = 'y';
        if (chartDef.chartType === 'stackedBar' && opts.scales) {
            opts.scales.x.stacked = true;
            opts.scales.y.stacked = true;
        }

        return { type, data: { labels, datasets }, options: opts };
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // ADVANCED CHARTS
    // ═══════════════════════════════════════════════════════════════════════════════

    buildMixedBarLineConfig(chartDef, data, style, palette) {
        const colors = this.getColors(palette, 8);
        const opts = this.baseOptions(chartDef, style, true);
        opts.plugins.legend.display = true;

        let labels, series;
        if (data.series && data.series.length >= 2) {
            labels = data.labels || [];
            series = data.series;
        } else {
            const vals = data.values || [];
            labels = data.labels || [];
            series = [
                { name: 'Series A', values: vals },
                { name: 'Series B', values: vals.map(v => v * 0.6) }
            ];
        }

        const datasets = series.map((s, i) => ({
            type: i === 0 ? 'bar' : 'line',
            label: s.name,
            data: s.values,
            backgroundColor: i === 0 ? colors[0] + 'CC' : 'transparent',
            borderColor: colors[i],
            borderWidth: i === 0 ? 1 : 2,
            fill: false,
            tension: 0.4,
            pointRadius: i === 0 ? 0 : 4,
            borderRadius: i === 0 ? 4 : 0,
            yAxisID: 'y',
        }));

        return { type: 'bar', data: { labels, datasets }, options: opts };
    }

    buildGroupedBarConfig(chartDef, data, style, palette) {
        const colors = this.getColors(palette, 8);
        const opts = this.baseOptions(chartDef, style, true);
        opts.plugins.legend.display = true;

        let labels, series;
        if (data.series && data.series.length > 0) {
            labels = data.labels || [];
            series = data.series;
        } else {
            const vals = data.values || [];
            labels = data.labels || [];
            series = [
                { name: 'Group A', values: vals },
                { name: 'Group B', values: vals.map((v, i) => v * (0.5 + (i % 3) * 0.2)) },
                { name: 'Group C', values: vals.map((v, i) => v * (0.3 + (i % 4) * 0.15)) }
            ];
        }

        const datasets = series.map((s, i) => ({
            label: s.name,
            data: s.values,
            backgroundColor: colors[i] + 'CC',
            borderColor: colors[i],
            borderWidth: 1,
            borderRadius: 4,
        }));

        return { type: 'bar', data: { labels, datasets }, options: opts };
    }

    buildWaterfallConfig(chartDef, labels, values, style, palette) {
        let cumulative = 0;
        const floatingData = values.map(val => {
            const start = cumulative;
            cumulative += val;
            return [start, cumulative];
        });

        const barColors = values.map((v, i) => {
            if (i === values.length - 1) return '#4A90D9';
            return v >= 0 ? '#4CAF50' : '#E63946';
        });

        const opts = this.baseOptions(chartDef, style, true);
        opts.plugins.legend.display = false;
        opts.scales.y.beginAtZero = false;

        return {
            type: 'bar',
            data: {
                labels,
                datasets: [{ label: 'Waterfall', data: floatingData, backgroundColor: barColors, borderColor: barColors, borderWidth: 1, borderSkipped: false }]
            },
            options: opts
        };
    }

    buildFunnelConfig(chartDef, labels, values, style, palette) {
        const pairs = labels.map((l, i) => [l, values[i]]).sort((a, b) => b[1] - a[1]);
        const sortedLabels = pairs.map(p => p[0]);
        const sortedValues = pairs.map(p => p[1]);
        const colors = this.getColors(palette, sortedValues.length);

        const opts = this.baseOptions(chartDef, style, true);
        opts.indexAxis = 'y';
        opts.plugins.legend.display = false;
        opts.scales.x.beginAtZero = true;

        return {
            type: 'bar',
            data: {
                labels: sortedLabels,
                datasets: [{ label: 'Funnel', data: sortedValues, backgroundColor: colors.map(c => c + 'CC'), borderColor: colors, borderWidth: 1, borderRadius: 4 }]
            },
            options: opts
        };
    }

    buildTreemapConfig(chartDef, labels, values, style, palette) {
        const total = values.reduce((a, b) => a + Math.abs(b), 0) || 1;
        const proportions = values.map(v => parseFloat((Math.abs(v) / total * 100).toFixed(1)));
        const colors = this.getColors(palette, labels.length);

        const datasets = labels.map((l, i) => ({
            label: l,
            data: [proportions[i]],
            backgroundColor: colors[i] + 'CC',
            borderColor: colors[i],
            borderWidth: 1,
            borderRadius: 2,
        }));

        const opts = this.baseOptions(chartDef, style, true);
        opts.indexAxis = 'y';
        opts.plugins.legend.display = true;
        opts.plugins.legend.position = 'right';
        opts.scales.x.stacked = true;
        opts.scales.y.stacked = true;
        opts.scales.x.max = 100;
        opts.scales.x.ticks = { callback: v => v + '%', font: { size: 10 } };

        return { type: 'bar', data: { labels: [''], datasets }, options: opts };
    }

    buildHeatmapConfig(chartDef, labels, values, style, palette) {
        const n = Math.max(2, Math.ceil(Math.sqrt(labels.length)));
        const minV = Math.min(...values);
        const range = (Math.max(...values) - minV) || 1;
        const scatterData = values.map((v, i) => ({ x: i % n, y: Math.floor(i / n) }));

        const heatPlugin = {
            id: 'heatCells_' + chartDef.id,
            afterDatasetsDraw(chart) {
                const ctx = chart.ctx;
                const xScale = chart.scales.x;
                const yScale = chart.scales.y;
                if (!xScale || !yScale) return;
                const cellW = Math.abs((xScale.getPixelForValue(1) - xScale.getPixelForValue(0))) || 30;
                const cellH = Math.abs((yScale.getPixelForValue(1) - yScale.getPixelForValue(0))) || 30;
                values.forEach((v, idx) => {
                    const col = idx % n;
                    const row = Math.floor(idx / n);
                    const px = xScale.getPixelForValue(col);
                    const py = yScale.getPixelForValue(row);
                    const t = (v - minV) / range;
                    const r = Math.round(74 + t * 180);
                    const g = Math.round(Math.max(0, 144 - t * 100));
                    const b = Math.round(Math.max(0, 217 - t * 160));
                    ctx.fillStyle = `rgba(${r},${g},${b},0.85)`;
                    ctx.fillRect(px - cellW / 2 + 1, py - cellH / 2 + 1, cellW - 2, cellH - 2);
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(px - cellW / 2, py - cellH / 2, cellW, cellH);
                    if (cellW > 25) {
                        ctx.fillStyle = t > 0.5 ? '#fff' : '#333';
                        ctx.font = `${Math.min(11, cellW * 0.3)}px Inter`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(Math.round(v), px, py);
                    }
                });
            }
        };

        const opts = this.baseOptions(chartDef, style, true);
        opts.scales.x.min = -0.5;
        opts.scales.x.max = n - 0.5;
        opts.scales.y.min = -0.5;
        opts.scales.y.max = n - 0.5;
        opts.scales.x.ticks = { display: false };
        opts.scales.y.ticks = { display: false };
        opts.scales.x.grid = { display: false };
        opts.scales.y.grid = { display: false };
        opts.plugins.legend.display = false;

        return {
            type: 'scatter',
            data: { datasets: [{ data: scatterData, pointRadius: 0 }] },
            options: opts,
            plugins: [heatPlugin]
        };
    }

    buildSankeyConfig(chartDef, labels, values, style, palette) {
        const colors = this.getColors(palette, labels.length);
        const datasets = labels.map((l, i) => ({
            label: l,
            data: [values[i]],
            backgroundColor: colors[i] + 'CC',
            borderColor: colors[i],
            borderWidth: 1,
        }));

        const opts = this.baseOptions(chartDef, style, true);
        opts.indexAxis = 'y';
        opts.scales.x.stacked = true;
        opts.scales.y.stacked = true;
        opts.plugins.legend.display = true;
        opts.plugins.legend.position = 'right';

        return { type: 'bar', data: { labels: ['Flow'], datasets }, options: opts };
    }

    buildSunburstConfig(chartDef, labels, values, style, palette) {
        const colors = this.getColors(palette, labels.length);
        const half = Math.ceil(labels.length / 2);
        const innerValues = [
            values.slice(0, half).reduce((a, b) => a + b, 0),
            values.slice(half).reduce((a, b) => a + b, 0) || 1
        ];
        const innerColors = [colors[0], colors[Math.min(4, colors.length - 1)]];

        const opts = this.baseOptions(chartDef, style, false);
        opts.plugins.legend.display = true;

        return {
            type: 'doughnut',
            data: {
                labels: [...labels, 'Group A', 'Group B'],
                datasets: [
                    { data: values, backgroundColor: colors, borderColor: '#fff', borderWidth: 2, cutout: '60%' },
                    { data: innerValues, backgroundColor: innerColors.map(c => c + '99'), borderColor: '#fff', borderWidth: 2, cutout: '0%' }
                ]
            },
            options: opts
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // STATISTICAL CHARTS
    // ═══════════════════════════════════════════════════════════════════════════════

    buildHistogramConfig(chartDef, labels, values, style, palette) {
        const colors = this.getColors(palette, 1);
        const opts = this.baseOptions(chartDef, style, true);
        opts.plugins.legend.display = false;

        return {
            type: 'bar',
            data: {
                labels,
                datasets: [{ label: 'Frequency', data: values, backgroundColor: colors[0] + 'CC', borderColor: colors[0], borderWidth: 1, borderRadius: 0 }]
            },
            options: { ...opts, categoryPercentage: 1.0, barPercentage: 1.0 }
        };
    }

    buildBoxPlotConfig(chartDef, labels, values, style, palette) {
        const q1 = this.percentile(values, 25);
        const q3 = this.percentile(values, 75);
        const median = this.percentile(values, 50);
        const minV = Math.min(...values);
        const maxV = Math.max(...values);

        const opts = this.baseOptions(chartDef, style, true);
        opts.plugins.legend.display = true;
        opts.scales.y.beginAtZero = false;

        return {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Whisker', data: labels.map(() => [minV, maxV]), backgroundColor: 'rgba(74,144,217,0.15)', borderColor: '#4A90D9', borderWidth: 1, borderSkipped: false, borderRadius: 0 },
                    { label: 'IQR', data: labels.map(() => [q1, q3]), backgroundColor: 'rgba(74,144,217,0.55)', borderColor: '#4A90D9', borderWidth: 2, borderSkipped: false, borderRadius: 0 },
                    { type: 'line', label: 'Median', data: labels.map(() => median), borderColor: '#E63946', borderWidth: 2, pointRadius: 4, pointBackgroundColor: '#E63946', fill: false }
                ]
            },
            options: opts
        };
    }

    buildViolinConfig(chartDef, labels, values, style, palette) {
        const colors = this.getColors(palette, labels.length);
        const absVals = values.map(Math.abs);
        const opts = this.baseOptions(chartDef, style, true);
        opts.plugins.legend.display = false;
        opts.scales.y.beginAtZero = false;

        return {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Upper', data: absVals, backgroundColor: colors.map(c => c + 'CC'), borderColor: colors, borderWidth: 1, borderRadius: 20 },
                    { label: 'Lower', data: absVals.map(v => -v), backgroundColor: colors.map(c => c + '88'), borderColor: colors, borderWidth: 1, borderRadius: 20 }
                ]
            },
            options: opts
        };
    }

    buildBellCurveConfig(chartDef, labels, values, style, palette) {
        const m = this.mean(values);
        const s = this.stddev(values) || 1;
        const curveLabels = [], curveValues = [];
        for (let i = 0; i <= 40; i++) {
            const x = m - 4 * s + (8 * s * i / 40);
            curveLabels.push(x.toFixed(1));
            curveValues.push((1 / (s * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((x - m) / s) ** 2));
        }

        const colors = this.getColors(palette, 1);
        const opts = this.baseOptions(chartDef, style, true);
        opts.plugins.legend.display = false;
        opts.scales.y.beginAtZero = true;

        return {
            type: 'line',
            data: {
                labels: curveLabels,
                datasets: [{ label: 'Normal Distribution', data: curveValues, borderColor: colors[0], backgroundColor: colors[0] + '33', borderWidth: 2, fill: true, tension: 0.4, pointRadius: 0 }]
            },
            options: opts
        };
    }

    buildParetoConfig(chartDef, labels, values, style, palette) {
        const sorted = labels.map((l, i) => [l, values[i]]).sort((a, b) => b[1] - a[1]);
        const sortedLabels = sorted.map(p => p[0]);
        const sortedValues = sorted.map(p => p[1]);
        const total = sortedValues.reduce((a, b) => a + b, 0) || 1;
        let cum = 0;
        const cumPct = sortedValues.map(v => parseFloat(((cum += v) / total * 100).toFixed(1)));

        const colors = this.getColors(palette, 2);
        const opts = this.baseOptions(chartDef, style, true);
        opts.plugins.legend.display = true;
        opts.scales.y2 = {
            type: 'linear',
            position: 'right',
            min: 0,
            max: 100,
            ticks: { callback: v => v + '%', font: { size: 10 } },
            grid: { drawOnChartArea: false }
        };

        return {
            type: 'bar',
            data: {
                labels: sortedLabels,
                datasets: [
                    { type: 'bar', label: 'Value', data: sortedValues, backgroundColor: colors[0] + 'CC', borderColor: colors[0], borderWidth: 1, yAxisID: 'y' },
                    { type: 'line', label: 'Cumulative %', data: cumPct, borderColor: '#E63946', borderWidth: 2, pointRadius: 3, fill: false, tension: 0, yAxisID: 'y2' }
                ]
            },
            options: opts
        };
    }

    buildControlChartConfig(chartDef, labels, values, style, palette) {
        const m = this.mean(values);
        const s = this.stddev(values);
        const ucl = m + 3 * s, lcl = m - 3 * s;
        const n = labels.length;

        const colors = this.getColors(palette, 1);
        const opts = this.baseOptions(chartDef, style, true);
        opts.plugins.legend.display = true;
        opts.scales.y.beginAtZero = false;

        return {
            type: 'line',
            data: {
                labels,
                datasets: [
                    { label: 'Value', data: values, borderColor: colors[0], borderWidth: 2, pointRadius: 3, fill: false, tension: 0.1 },
                    { label: 'UCL', data: Array(n).fill(ucl), borderColor: '#E63946', borderWidth: 1, borderDash: [6, 3], pointRadius: 0, fill: false },
                    { label: 'Center', data: Array(n).fill(m), borderColor: '#4CAF50', borderWidth: 1, borderDash: [4, 4], pointRadius: 0, fill: false },
                    { label: 'LCL', data: Array(n).fill(lcl), borderColor: '#E63946', borderWidth: 1, borderDash: [6, 3], pointRadius: 0, fill: false }
                ]
            },
            options: opts
        };
    }

    buildRegressionLineConfig(chartDef, labels, values, style, palette) {
        const xs = values.map((_, i) => i);
        const { slope, intercept } = this.linearRegression(xs, values);
        const scatterData = values.map((v, i) => ({ x: i, y: v }));
        const lineData = xs.map(x => ({ x, y: slope * x + intercept }));

        const colors = this.getColors(palette, 2);
        const opts = this.baseOptions(chartDef, style, true);
        opts.plugins.legend.display = true;
        opts.scales.y.beginAtZero = false;
        opts.scales.x.type = 'linear';

        return {
            type: 'scatter',
            data: {
                datasets: [
                    { label: 'Data', data: scatterData, backgroundColor: colors[0] + 'CC', pointRadius: 5 },
                    { type: 'line', label: 'Regression', data: lineData, borderColor: '#E63946', borderWidth: 2, pointRadius: 0, fill: false }
                ]
            },
            options: opts
        };
    }

    buildConfidenceBandConfig(chartDef, labels, values, style, palette) {
        const s = this.stddev(values);
        const upper = values.map(v => v + 1.96 * s);
        const lower = values.map(v => v - 1.96 * s);

        const colors = this.getColors(palette, 1);
        const opts = this.baseOptions(chartDef, style, true);
        opts.plugins.legend.display = true;
        opts.scales.y.beginAtZero = false;

        return {
            type: 'line',
            data: {
                labels,
                datasets: [
                    { label: 'Upper 95%', data: upper, borderColor: colors[0] + '88', borderWidth: 1, borderDash: [4, 2], fill: '+1', backgroundColor: colors[0] + '22', pointRadius: 0 },
                    { label: 'Value', data: values, borderColor: colors[0], borderWidth: 2, fill: false, pointRadius: 3 },
                    { label: 'Lower 95%', data: lower, borderColor: colors[0] + '88', borderWidth: 1, borderDash: [4, 2], fill: false, pointRadius: 0 }
                ]
            },
            options: opts
        };
    }

    buildErrorBarConfig(chartDef, labels, values, style, palette) {
        const s = this.stddev(values) / 2;
        const upper = values.map(v => v + s);
        const lower = values.map(v => v - s);

        const colors = this.getColors(palette, 1);
        const opts = this.baseOptions(chartDef, style, true);
        opts.plugins.legend.display = true;

        return {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Value', data: values, backgroundColor: colors[0] + 'CC', borderColor: colors[0], borderWidth: 1, borderRadius: 4 },
                    { type: 'line', label: 'Error+', data: upper, borderColor: '#E63946', borderWidth: 1, borderDash: [3, 2], pointStyle: 'line', pointRadius: 6, fill: false, showLine: false },
                    { type: 'line', label: 'Error-', data: lower, borderColor: '#E63946', borderWidth: 1, borderDash: [3, 2], pointStyle: 'line', pointRadius: 6, fill: false, showLine: false }
                ]
            },
            options: opts
        };
    }

    buildStemLeafConfig(chartDef, labels, values, style, palette) {
        const colors = this.getColors(palette, labels.length);
        const opts = this.baseOptions(chartDef, style, true);
        opts.indexAxis = 'y';
        opts.plugins.legend.display = false;
        opts.scales.x.beginAtZero = true;

        return {
            type: 'bar',
            data: {
                labels,
                datasets: [{ label: 'Value', data: values, backgroundColor: colors.map(c => c + 'CC'), borderColor: colors, borderWidth: 1, barThickness: 8 }]
            },
            options: opts
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // TIME SERIES CHARTS
    // ═══════════════════════════════════════════════════════════════════════════════

    buildTimeLineConfig(chartDef, labels, values, style, palette) {
        const colors = this.getColors(palette, 1);
        const opts = this.baseOptions(chartDef, style, true);
        opts.scales.y.beginAtZero = false;
        opts.plugins.legend.display = false;

        return {
            type: 'line',
            data: {
                labels,
                datasets: [{ label: chartDef.title || 'Time Series', data: values, borderColor: colors[0], backgroundColor: colors[0] + '22', borderWidth: 2, fill: true, tension: 0.3, pointRadius: 3 }]
            },
            options: opts
        };
    }

    buildCandlestickConfig(chartDef, data, style, palette) {
        const labels = data.labels || [];
        const ohlcData = data.ohlc || labels.map((_, i) => {
            const base = 100 + i * 3;
            return { o: base, h: base + 6, l: base - 4, c: base + (i % 2 === 0 ? 3 : -2) };
        });

        const floatingBars = ohlcData.map(d => [Math.min(d.o, d.c), Math.max(d.o, d.c)]);
        const barColors = ohlcData.map(d => d.c >= d.o ? '#4CAF50CC' : '#E63946CC');
        const borderColors = ohlcData.map(d => d.c >= d.o ? '#4CAF50' : '#E63946');

        const wickPlugin = {
            id: 'candleWicks_' + chartDef.id,
            afterDatasetsDraw(chart) {
                const ctx = chart.ctx;
                const xScale = chart.scales.x;
                const yScale = chart.scales.y;
                if (!xScale || !yScale) return;
                ohlcData.forEach((d, i) => {
                    const x = xScale.getPixelForValue(i);
                    const hiY = yScale.getPixelForValue(d.h);
                    const loY = yScale.getPixelForValue(d.l);
                    ctx.beginPath();
                    ctx.strokeStyle = d.c >= d.o ? '#4CAF50' : '#E63946';
                    ctx.lineWidth = 1.5;
                    ctx.moveTo(x, hiY);
                    ctx.lineTo(x, loY);
                    ctx.stroke();
                });
            }
        };

        const opts = this.baseOptions(chartDef, style, true);
        opts.plugins.legend.display = false;
        opts.scales.y.beginAtZero = false;

        return {
            type: 'bar',
            data: {
                labels,
                datasets: [{ label: 'OHLC', data: floatingBars, backgroundColor: barColors, borderColor: borderColors, borderWidth: 1, borderSkipped: false, borderRadius: 0 }]
            },
            options: opts,
            plugins: [wickPlugin]
        };
    }

    buildOhlcConfig(chartDef, data, style, palette) {
        const labels = data.labels || [];
        const ohlcData = data.ohlc || labels.map((_, i) => {
            const base = 100 + i * 3;
            return { o: base, h: base + 6, l: base - 4, c: base + (i % 2 === 0 ? 3 : -2) };
        });

        const ohlcPlugin = {
            id: 'ohlcLines_' + chartDef.id,
            afterDatasetsDraw(chart) {
                const ctx = chart.ctx;
                const xScale = chart.scales.x;
                const yScale = chart.scales.y;
                if (!xScale || !yScale) return;
                ohlcData.forEach((d, i) => {
                    const x = xScale.getPixelForValue(i);
                    const color = d.c >= d.o ? '#4CAF50' : '#E63946';
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 2;
                    // High-Low line
                    ctx.beginPath(); ctx.moveTo(x, yScale.getPixelForValue(d.h)); ctx.lineTo(x, yScale.getPixelForValue(d.l)); ctx.stroke();
                    // Open tick (left)
                    ctx.beginPath(); ctx.moveTo(x - 6, yScale.getPixelForValue(d.o)); ctx.lineTo(x, yScale.getPixelForValue(d.o)); ctx.stroke();
                    // Close tick (right)
                    ctx.beginPath(); ctx.moveTo(x, yScale.getPixelForValue(d.c)); ctx.lineTo(x + 6, yScale.getPixelForValue(d.c)); ctx.stroke();
                });
            }
        };

        const opts = this.baseOptions(chartDef, style, true);
        opts.plugins.legend.display = false;
        opts.scales.y.beginAtZero = false;
        opts.scales.x.type = 'linear';
        opts.scales.x.min = -1;
        opts.scales.x.max = labels.length;
        opts.scales.x.ticks = { callback: v => labels[v] || '', font: { size: 10 } };

        return {
            type: 'scatter',
            data: { datasets: [{ data: [], pointRadius: 0 }] },
            options: opts,
            plugins: [ohlcPlugin]
        };
    }

    buildRangeAreaConfig(chartDef, labels, values, style, palette) {
        const s = this.stddev(values) || 1;
        const upper = values.map(v => v + s);
        const lower = values.map(v => v - s);

        const colors = this.getColors(palette, 1);
        const opts = this.baseOptions(chartDef, style, true);
        opts.plugins.legend.display = true;
        opts.scales.y.beginAtZero = false;

        return {
            type: 'line',
            data: {
                labels,
                datasets: [
                    { label: 'Upper', data: upper, borderColor: colors[0] + '88', borderWidth: 1, fill: '+1', backgroundColor: colors[0] + '33', pointRadius: 0 },
                    { label: 'Lower', data: lower, borderColor: colors[0] + '88', borderWidth: 1, fill: false, pointRadius: 0 },
                    { label: 'Value', data: values, borderColor: colors[0], borderWidth: 2, fill: false, pointRadius: 3 }
                ]
            },
            options: opts
        };
    }

    buildStepLineConfig(chartDef, labels, values, style, palette) {
        const colors = this.getColors(palette, 1);
        const opts = this.baseOptions(chartDef, style, true);
        opts.plugins.legend.display = false;
        opts.scales.y.beginAtZero = false;

        return {
            type: 'line',
            data: {
                labels,
                datasets: [{ label: chartDef.title || 'Step', data: values, borderColor: colors[0], backgroundColor: colors[0] + '22', borderWidth: 2, stepped: true, fill: true, pointRadius: 3 }]
            },
            options: opts
        };
    }

    buildStreamGraphConfig(chartDef, data, style, palette) {
        const colors = this.getColors(palette, 8);
        let labels, series;
        if (data.series && data.series.length > 0) {
            labels = data.labels || [];
            series = data.series;
        } else {
            const vals = data.values || [];
            labels = data.labels || [];
            series = [
                { name: 'Stream A', values: vals },
                { name: 'Stream B', values: vals.map((v, i) => v * 0.6 + i * 0.5) },
                { name: 'Stream C', values: vals.map((v, i) => v * 0.4 + i * 0.3) }
            ];
        }

        const opts = this.baseOptions(chartDef, style, true);
        opts.plugins.legend.display = true;
        opts.scales.x.stacked = true;
        opts.scales.y.stacked = true;

        return {
            type: 'line',
            data: {
                labels,
                datasets: series.map((s, i) => ({
                    label: s.name,
                    data: s.values,
                    backgroundColor: colors[i] + '99',
                    borderColor: colors[i],
                    borderWidth: 1,
                    fill: true,
                    tension: 0.5,
                    pointRadius: 0,
                }))
            },
            options: opts
        };
    }

    buildEventTimelineConfig(chartDef, labels, values, style, palette) {
        const colors = this.getColors(palette, labels.length);
        const maxVal = Math.max(...values) || 1;
        const floatingData = values.map((v, i) => [i * (maxVal / labels.length), i * (maxVal / labels.length) + v]);

        const opts = this.baseOptions(chartDef, style, true);
        opts.indexAxis = 'y';
        opts.plugins.legend.display = false;
        opts.scales.x.beginAtZero = true;
        opts.scales.x.ticks = { callback: v => 'T+' + v.toFixed(0), font: { size: 10 } };

        return {
            type: 'bar',
            data: {
                labels,
                datasets: [{ label: 'Events', data: floatingData, backgroundColor: colors.map(c => c + 'CC'), borderColor: colors, borderWidth: 1, borderRadius: 4, borderSkipped: false }]
            },
            options: opts
        };
    }

    buildGanttConfig(chartDef, labels, values, style, palette) {
        const colors = this.getColors(palette, labels.length);
        const maxVal = Math.max(...values) || 1;
        const floatingData = values.map((v, i) => {
            const start = i * 2;
            const end = start + Math.max(0.5, v / maxVal * 8);
            return [start, end];
        });

        const opts = this.baseOptions(chartDef, style, true);
        opts.indexAxis = 'y';
        opts.plugins.legend.display = false;
        opts.scales.x.beginAtZero = true;
        opts.scales.x.ticks = { callback: v => 'Day ' + v.toFixed(0), font: { size: 10 } };

        return {
            type: 'bar',
            data: {
                labels,
                datasets: [{ label: 'Duration', data: floatingData, backgroundColor: colors.map(c => c + 'CC'), borderColor: colors, borderWidth: 1, borderRadius: 4, borderSkipped: false }]
            },
            options: opts
        };
    }

    buildBurnDownConfig(chartDef, labels, values, style, palette) {
        const total = Math.max(...values) || 100;
        const n = labels.length;
        const idealLine = labels.map((_, i) => total - (total / (n - 1 || 1)) * i);

        const colors = this.getColors(palette, 2);
        const opts = this.baseOptions(chartDef, style, true);
        opts.plugins.legend.display = true;
        opts.scales.y.beginAtZero = true;

        return {
            type: 'line',
            data: {
                labels,
                datasets: [
                    { label: 'Remaining', data: values, borderColor: colors[0], backgroundColor: colors[0] + '22', borderWidth: 2, fill: true, tension: 0.3, pointRadius: 3 },
                    { label: 'Ideal', data: idealLine, borderColor: '#E63946', borderWidth: 1, borderDash: [6, 3], pointRadius: 0, fill: false }
                ]
            },
            options: opts
        };
    }

    buildVelocityChartConfig(chartDef, labels, values, style, palette) {
        const avg = this.mean(values);
        const colors = this.getColors(palette, 2);
        const opts = this.baseOptions(chartDef, style, true);
        opts.plugins.legend.display = true;

        return {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { type: 'bar', label: 'Velocity', data: values, backgroundColor: colors[0] + 'CC', borderColor: colors[0], borderWidth: 1, borderRadius: 4 },
                    { type: 'line', label: 'Average', data: Array(labels.length).fill(avg), borderColor: '#E63946', borderWidth: 2, borderDash: [4, 3], pointRadius: 0, fill: false }
                ]
            },
            options: opts
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // COMPARISON CHARTS
    // ═══════════════════════════════════════════════════════════════════════════════

    buildBulletChartConfig(chartDef, labels, values, style, palette) {
        const avg = this.mean(values);
        const target = avg * 1.2;
        const rangeData = values.map(v => v * 1.5);
        const colors = this.getColors(palette, 3);

        const opts = this.baseOptions(chartDef, style, true);
        opts.indexAxis = 'y';
        opts.plugins.legend.display = true;
        opts.scales.x.beginAtZero = true;

        return {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Range', data: rangeData, backgroundColor: 'rgba(200,200,200,0.3)', borderColor: 'transparent', borderWidth: 0, borderRadius: 0, barThickness: 20 },
                    { label: 'Actual', data: values, backgroundColor: colors[0] + 'CC', borderColor: colors[0], borderWidth: 1, borderRadius: 3, barThickness: 10 },
                    { type: 'line', label: 'Target', data: Array(labels.length).fill(target), borderColor: '#E63946', borderWidth: 2, pointStyle: 'line', pointRadius: 8, fill: false }
                ]
            },
            options: opts
        };
    }

    buildMarimekkoConfig(chartDef, labels, values, style, palette) {
        const total = values.reduce((a, b) => a + Math.abs(b), 0) || 1;
        const pcts = values.map(v => parseFloat((Math.abs(v) / total * 100).toFixed(1)));
        const colors = this.getColors(palette, labels.length);
        const datasets = labels.map((l, i) => ({
            label: l,
            data: [pcts[i]],
            backgroundColor: colors[i] + 'CC',
            borderColor: colors[i],
            borderWidth: 1,
        }));

        const opts = this.baseOptions(chartDef, style, true);
        opts.scales.x.stacked = true;
        opts.scales.y.stacked = true;
        opts.scales.x.max = 100;
        opts.plugins.legend.display = true;
        opts.plugins.legend.position = 'right';

        return { type: 'bar', data: { labels: [''], datasets }, options: opts };
    }

    buildDotPlotConfig(chartDef, labels, values, style, palette) {
        const colors = this.getColors(palette, labels.length);
        const scatterData = values.map((v, i) => ({ x: v, y: i }));

        const opts = this.baseOptions(chartDef, style, true);
        opts.scales.x.beginAtZero = true;
        opts.scales.y.min = -0.5;
        opts.scales.y.max = labels.length - 0.5;
        opts.scales.y.ticks = { callback: v => labels[Math.round(v)] || '', font: { size: 10 } };
        opts.plugins.legend.display = false;

        return {
            type: 'scatter',
            data: { datasets: [{ label: 'Values', data: scatterData, backgroundColor: colors, pointRadius: 8, pointHoverRadius: 10 }] },
            options: opts
        };
    }

    buildLollipopConfig(chartDef, labels, values, style, palette) {
        const colors = this.getColors(palette, 1);
        const opts = this.baseOptions(chartDef, style, true);
        opts.plugins.legend.display = false;

        return {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { type: 'bar', label: 'Stem', data: values, backgroundColor: 'transparent', borderColor: colors[0], borderWidth: 2, barThickness: 2, borderRadius: 0, borderSkipped: false },
                    { type: 'line', label: 'Dot', data: values, borderColor: 'transparent', pointRadius: 8, pointHoverRadius: 10, pointBackgroundColor: colors[0], pointBorderColor: '#fff', pointBorderWidth: 2, fill: false, tension: 0, showLine: false }
                ]
            },
            options: opts
        };
    }

    buildDumbbellConfig(chartDef, labels, values, style, palette) {
        const colors = this.getColors(palette, 2);
        const values2 = values.map((v, i) => v * (0.6 + (i % 5) * 0.08));
        const connectors = values.map((v, i) => [Math.min(v, values2[i]), Math.max(v, values2[i])]);

        const opts = this.baseOptions(chartDef, style, true);
        opts.indexAxis = 'y';
        opts.plugins.legend.display = true;
        opts.scales.x.beginAtZero = false;

        return {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Connector', data: connectors, backgroundColor: 'rgba(180,180,180,0.4)', borderColor: 'transparent', borderWidth: 0, borderSkipped: false, barThickness: 3 },
                    { label: 'Before', data: values, backgroundColor: colors[0], borderColor: colors[0], borderWidth: 0, barThickness: 12, borderRadius: 6, borderSkipped: false },
                    { label: 'After', data: values2, backgroundColor: colors[1], borderColor: colors[1], borderWidth: 0, barThickness: 12, borderRadius: 6, borderSkipped: false }
                ]
            },
            options: opts
        };
    }

    buildSlopeConfig(chartDef, labels, values, style, palette) {
        const colors = this.getColors(palette, labels.length);
        const endValues = values.map((v, i) => v * (0.75 + (i % 4) * 0.1));

        const datasets = labels.map((l, i) => ({
            label: l,
            data: [values[i], endValues[i]],
            borderColor: colors[i],
            backgroundColor: colors[i],
            borderWidth: 2,
            fill: false,
            pointRadius: 5,
            tension: 0
        }));

        const opts = this.baseOptions(chartDef, style, true);
        opts.plugins.legend.display = true;
        opts.scales.y.beginAtZero = false;

        return {
            type: 'line',
            data: { labels: ['Before', 'After'], datasets },
            options: opts
        };
    }

    buildDivergingBarConfig(chartDef, labels, values, style, palette) {
        const m = this.mean(values);
        const diverged = values.map(v => v - m);
        const bgColors = diverged.map(v => v >= 0 ? '#4CAF50CC' : '#E63946CC');
        const borderColors = diverged.map(v => v >= 0 ? '#4CAF50' : '#E63946');

        const opts = this.baseOptions(chartDef, style, true);
        opts.indexAxis = 'y';
        opts.plugins.legend.display = false;
        opts.scales.x.beginAtZero = false;

        return {
            type: 'bar',
            data: {
                labels,
                datasets: [{ label: 'Divergence', data: diverged, backgroundColor: bgColors, borderColor: borderColors, borderWidth: 1, borderRadius: 4, borderSkipped: false }]
            },
            options: opts
        };
    }

    buildSpanChartConfig(chartDef, labels, values, style, palette) {
        const colors = this.getColors(palette, labels.length);
        const s = this.stddev(values) || Math.max(...values) * 0.1 || 10;
        const floatingData = values.map((v, i) => [v - s * (0.5 + (i % 3) * 0.3), v + s * (0.5 + (i % 3) * 0.3)]);

        const opts = this.baseOptions(chartDef, style, true);
        opts.indexAxis = 'y';
        opts.plugins.legend.display = false;
        opts.scales.x.beginAtZero = false;

        return {
            type: 'bar',
            data: {
                labels,
                datasets: [{ label: 'Range', data: floatingData, backgroundColor: colors.map(c => c + '88'), borderColor: colors, borderWidth: 2, borderRadius: 4, borderSkipped: false }]
            },
            options: opts
        };
    }

    buildPairedBarConfig(chartDef, data, style, palette) {
        const labels = data.labels || [];
        const values = data.values || [];
        const colors = this.getColors(palette, 2);

        let series;
        if (data.series && data.series.length >= 2) {
            series = data.series;
        } else {
            series = [
                { name: 'Group A', values: values },
                { name: 'Group B', values: values.map((v, i) => -v * (0.5 + (i % 4) * 0.1)) }
            ];
        }

        const opts = this.baseOptions(chartDef, style, true);
        opts.indexAxis = 'y';
        opts.plugins.legend.display = true;
        opts.scales.x.beginAtZero = false;

        return {
            type: 'bar',
            data: {
                labels,
                datasets: series.map((s, i) => ({
                    label: s.name,
                    data: s.values,
                    backgroundColor: colors[i] + 'CC',
                    borderColor: colors[i],
                    borderWidth: 1,
                    borderRadius: 4,
                }))
            },
            options: opts
        };
    }

    buildPopulationPyramidConfig(chartDef, data, style, palette) {
        const labels = data.labels || [];
        const values = data.values || [];
        const colors = this.getColors(palette, 2);

        let males, females;
        if (data.series && data.series.length >= 2) {
            males = data.series[0].values;
            females = data.series[1].values;
        } else {
            males = values.map((v, i) => -Math.abs(v * (0.9 + (i % 3) * 0.05)));
            females = values.map((v, i) => Math.abs(v * (0.8 + (i % 4) * 0.05)));
        }

        const opts = this.baseOptions(chartDef, style, true);
        opts.indexAxis = 'y';
        opts.plugins.legend.display = true;
        opts.scales.x.beginAtZero = false;

        return {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Male', data: males, backgroundColor: colors[0] + 'CC', borderColor: colors[0], borderWidth: 1, borderRadius: 4 },
                    { label: 'Female', data: females, backgroundColor: colors[1] + 'CC', borderColor: colors[1], borderWidth: 1, borderRadius: 4 }
                ]
            },
            options: opts
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // GEOGRAPHIC CHARTS (Chart.js approximations)
    // ═══════════════════════════════════════════════════════════════════════════════

    buildChoroplethConfig(chartDef, labels, values, style, palette) {
        const minV = Math.min(...values), maxV = Math.max(...values) || 1;
        const bgColors = values.map(v => {
            const t = (v - minV) / (maxV - minV);
            return `rgba(${Math.round(74 + t * 180)},${Math.round(Math.max(0, 144 - t * 100))},${Math.round(Math.max(0, 217 - t * 160))},0.8)`;
        });

        const opts = this.baseOptions(chartDef, style, true);
        opts.indexAxis = 'y';
        opts.plugins.legend.display = false;

        return {
            type: 'bar',
            data: {
                labels,
                datasets: [{ label: 'Region Value', data: values, backgroundColor: bgColors, borderColor: bgColors, borderWidth: 1, borderRadius: 3 }]
            },
            options: opts
        };
    }

    buildBubbleMapConfig(chartDef, data, style, palette) {
        const colors = this.getColors(palette, 1);
        const bubbleData = data.bubbleData || (data.values || []).map((v, i) => ({
            x: (i % 5) * 20 + 10,
            y: Math.floor(i / 5) * 20 + 10,
            r: Math.max(4, Math.sqrt(v / 100))
        }));

        const opts = this.baseOptions(chartDef, style, true);
        opts.plugins.legend.display = false;
        opts.scales.x.min = 0; opts.scales.x.max = 100;
        opts.scales.y.min = 0; opts.scales.y.max = 100;

        return {
            type: 'bubble',
            data: { datasets: [{ label: 'Location', data: bubbleData, backgroundColor: colors[0] + '99', borderColor: colors[0], borderWidth: 1 }] },
            options: opts
        };
    }

    buildFlowMapConfig(chartDef, labels, values, style, palette) {
        const n = labels.length;
        const scatterData = values.map((v, i) => ({ x: i * (100 / Math.max(n - 1, 1)), y: v }));
        const colors = this.getColors(palette, 1);

        const opts = this.baseOptions(chartDef, style, true);
        opts.plugins.legend.display = false;
        opts.scales.y.beginAtZero = false;

        return {
            type: 'scatter',
            data: {
                datasets: [{ label: 'Flow', data: scatterData, backgroundColor: colors[0], pointRadius: 6, showLine: true, borderColor: colors[0] + '88', borderWidth: 1 }]
            },
            options: opts
        };
    }

    buildSpikeMapConfig(chartDef, labels, values, style, palette) {
        const colors = this.getColors(palette, 1);
        const opts = this.baseOptions(chartDef, style, true);
        opts.plugins.legend.display = false;

        return {
            type: 'bar',
            data: {
                labels,
                datasets: [{ label: 'Spike', data: values, backgroundColor: colors[0] + 'CC', borderColor: colors[0], borderWidth: 1, barThickness: 4, borderRadius: 2 }]
            },
            options: opts
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // RELATIONSHIP CHARTS
    // ═══════════════════════════════════════════════════════════════════════════════

    buildNetworkGraphConfig(chartDef, labels, values, style, palette) {
        const n = Math.min(labels.length, 10);
        const angleStep = (2 * Math.PI) / n;
        const nodes = labels.slice(0, n).map((_, i) => ({
            x: Math.cos(i * angleStep) * 40 + 50,
            y: Math.sin(i * angleStep) * 40 + 50
        }));

        // Deterministic edges based on index parity
        const edges = [];
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                if ((i + j) % 3 !== 0) edges.push([i, j]);
            }
        }

        const colors = this.getColors(palette, n);
        const edgePlugin = {
            id: 'networkEdges_' + chartDef.id,
            beforeDatasetsDraw(chart) {
                const ctx = chart.ctx;
                const xScale = chart.scales.x;
                const yScale = chart.scales.y;
                if (!xScale || !yScale) return;
                ctx.save();
                ctx.strokeStyle = 'rgba(150,150,150,0.4)';
                ctx.lineWidth = 1;
                edges.forEach(([i, j]) => {
                    ctx.beginPath();
                    ctx.moveTo(xScale.getPixelForValue(nodes[i].x), yScale.getPixelForValue(nodes[i].y));
                    ctx.lineTo(xScale.getPixelForValue(nodes[j].x), yScale.getPixelForValue(nodes[j].y));
                    ctx.stroke();
                });
                ctx.restore();
            }
        };

        const opts = this.baseOptions(chartDef, style, true);
        opts.scales.x.min = 0; opts.scales.x.max = 100;
        opts.scales.y.min = 0; opts.scales.y.max = 100;
        opts.scales.x.ticks = { display: false };
        opts.scales.y.ticks = { display: false };
        opts.scales.x.grid = { display: false };
        opts.scales.y.grid = { display: false };
        opts.plugins.legend.display = false;

        return {
            type: 'scatter',
            data: {
                labels: labels.slice(0, n),
                datasets: [{
                    data: nodes,
                    backgroundColor: colors,
                    pointRadius: values.slice(0, n).map(v => Math.max(6, v / Math.max(...values, 1) * 16)),
                    pointHoverRadius: 12
                }]
            },
            options: opts,
            plugins: [edgePlugin]
        };
    }

    buildChordDiagramConfig(chartDef, labels, values, style, palette) {
        const colors = this.getColors(palette, labels.length);
        const opts = this.baseOptions(chartDef, style, false);
        opts.plugins.legend.display = true;
        opts.cutout = '40%';

        return {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{ data: values, backgroundColor: colors, borderColor: '#fff', borderWidth: 3, hoverOffset: 8 }]
            },
            options: opts
        };
    }

    buildArcDiagramConfig(chartDef, labels, values, style, palette) {
        const n = labels.length;
        const nodes = labels.map((_, i) => ({ x: i * (100 / Math.max(n - 1, 1)), y: 50 }));
        const colors = this.getColors(palette, n);

        const arcPlugin = {
            id: 'arcArcs_' + chartDef.id,
            afterDatasetsDraw(chart) {
                const ctx = chart.ctx;
                const xScale = chart.scales.x;
                const yScale = chart.scales.y;
                if (!xScale || !yScale) return;
                ctx.save();
                for (let i = 0; i < nodes.length - 1; i++) {
                    const x1 = xScale.getPixelForValue(nodes[i].x);
                    const x2 = xScale.getPixelForValue(nodes[i + 1].x);
                    const y = yScale.getPixelForValue(50);
                    const h = (x2 - x1) * 0.4;
                    ctx.beginPath();
                    ctx.strokeStyle = colors[i] + '99';
                    ctx.lineWidth = 2;
                    ctx.moveTo(x1, y);
                    ctx.bezierCurveTo(x1, y - h, x2, y - h, x2, y);
                    ctx.stroke();
                }
                ctx.restore();
            }
        };

        const opts = this.baseOptions(chartDef, style, true);
        opts.scales.x.min = -5; opts.scales.x.max = 105;
        opts.scales.y.min = 0; opts.scales.y.max = 100;
        opts.scales.x.ticks = { callback: (v, i) => labels[i] || '', font: { size: 9 } };
        opts.scales.y.ticks = { display: false };
        opts.scales.y.grid = { display: false };
        opts.plugins.legend.display = false;

        return {
            type: 'scatter',
            data: { datasets: [{ data: nodes, backgroundColor: colors, pointRadius: 8, pointHoverRadius: 12, pointBorderColor: '#fff', pointBorderWidth: 2 }] },
            options: opts,
            plugins: [arcPlugin]
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // PART-TO-WHOLE CHARTS
    // ═══════════════════════════════════════════════════════════════════════════════

    buildStackedBar100Config(chartDef, labels, values, style, palette) {
        const colors = this.getColors(palette, 2);
        const values2 = values.map((v, i) => v * (0.4 + (i % 5) * 0.08));
        const totals = values.map((v, i) => v + values2[i] || 1);
        const pctA = values.map((v, i) => parseFloat((v / totals[i] * 100).toFixed(1)));
        const pctB = values2.map((v, i) => parseFloat((v / totals[i] * 100).toFixed(1)));

        const opts = this.baseOptions(chartDef, style, true);
        opts.scales.x.stacked = true;
        opts.scales.y.stacked = true;
        opts.scales.y.max = 100;
        opts.scales.y.ticks = { callback: v => v + '%', font: { size: 10 } };
        opts.plugins.legend.display = true;

        return {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Part A', data: pctA, backgroundColor: colors[0] + 'CC', borderColor: colors[0], borderWidth: 1 },
                    { label: 'Part B', data: pctB, backgroundColor: colors[1] + 'CC', borderColor: colors[1], borderWidth: 1 }
                ]
            },
            options: opts
        };
    }

    buildStackedArea100Config(chartDef, data, style, palette) {
        const colors = this.getColors(palette, 8);
        let labels, series;
        if (data.series && data.series.length > 0) {
            labels = data.labels || [];
            series = data.series;
        } else {
            const vals = data.values || [];
            labels = data.labels || [];
            series = [
                { name: 'Part A', values: vals },
                { name: 'Part B', values: vals.map(v => v * 0.5) }
            ];
        }

        const n = labels.length;
        const totals = Array.from({ length: n }, (_, i) => series.reduce((s, sr) => s + Math.abs(sr.values[i] || 0), 0) || 1);
        const pctSeries = series.map(s => ({
            name: s.name,
            values: s.values.map((v, i) => parseFloat((Math.abs(v) / totals[i] * 100).toFixed(1)))
        }));

        const opts = this.baseOptions(chartDef, style, true);
        opts.scales.x.stacked = true;
        opts.scales.y.stacked = true;
        opts.scales.y.max = 100;
        opts.scales.y.ticks = { callback: v => v + '%', font: { size: 10 } };
        opts.plugins.legend.display = true;

        return {
            type: 'line',
            data: {
                labels,
                datasets: pctSeries.map((s, i) => ({
                    label: s.name,
                    data: s.values,
                    backgroundColor: colors[i] + '99',
                    borderColor: colors[i],
                    borderWidth: 1,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0
                }))
            },
            options: opts
        };
    }

    buildWaffleChartConfig(chartDef, labels, values, style, palette) {
        const total = values.reduce((a, b) => a + Math.abs(b), 0) || 1;
        const colors = this.getColors(palette, labels.length);
        const cellsPerValue = values.map(v => Math.round(Math.abs(v) / total * 100));
        // Adjust last cell to correct rounding error and ensure all 100 grid squares are filled
        const diff = 100 - cellsPerValue.reduce((a, b) => a + b, 0);
        if (cellsPerValue.length > 0) cellsPerValue[cellsPerValue.length - 1] = Math.max(0, cellsPerValue[cellsPerValue.length - 1] + diff);

        const wafflePlugin = {
            id: 'waffle_' + chartDef.id,
            afterDraw(chart) {
                const ctx = chart.ctx;
                const { top, bottom, left, right } = chart.chartArea;
                const w = (right - left) / 10;
                const h = (bottom - top) / 10;
                let colorIdx = 0, filled = 0;
                for (let row = 0; row < 10; row++) {
                    for (let col = 0; col < 10; col++) {
                        // Advance to next value segment; skip zero-cell segments to avoid
                        // stalling on empty values (each iteration moves colorIdx forward)
                        while (colorIdx < cellsPerValue.length && filled >= cellsPerValue[colorIdx]) {
                            colorIdx++;
                            filled = 0;
                        }
                        const c = colors[Math.min(colorIdx, colors.length - 1)] || '#ccc';
                        ctx.fillStyle = c + 'CC';
                        ctx.fillRect(left + col * w + 1, top + row * h + 1, w - 2, h - 2);
                        ctx.strokeStyle = '#fff';
                        ctx.lineWidth = 1;
                        ctx.strokeRect(left + col * w, top + row * h, w, h);
                        filled++;
                    }
                }
            }
        };

        const opts = this.baseOptions(chartDef, style, false);
        opts.plugins.legend.display = true;
        opts.plugins.tooltip.enabled = false;

        return {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{ data: Array(labels.length).fill(1), backgroundColor: 'transparent', borderWidth: 0 }]
            },
            options: opts,
            plugins: [wafflePlugin]
        };
    }

    buildNightingaleRoseConfig(chartDef, labels, values, style, palette) {
        const colors = this.getColors(palette, labels.length);
        const opts = this.baseOptions(chartDef, style, false);
        opts.plugins.legend.display = style.showLegend !== false;

        return {
            type: 'polarArea',
            data: {
                labels,
                datasets: [{ data: values, backgroundColor: colors.map(c => c + 'CC'), borderColor: colors, borderWidth: 2 }]
            },
            options: opts
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // KPI / METRICS CHARTS
    // ═══════════════════════════════════════════════════════════════════════════════

    buildGaugeConfig(chartDef, values, style) {
        const val = values[0] || 0;
        const max = Math.max(...values, 100);
        const pct = Math.min(val / max, 1);
        return {
            type: 'doughnut',
            data: {
                labels: ['Value', 'Remaining'],
                datasets: [{ data: [pct * 100, (1 - pct) * 100], backgroundColor: ['#4A90D9', '#E9ECEF'], borderWidth: 0 }]
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
            data: {
                labels: labels.slice(0, 1),
                datasets: [{ data: values.slice(0, 1), backgroundColor: '#4A90D9' }]
            },
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

    buildSparklineConfig(chartDef, labels, values, style, palette) {
        const colors = this.getColors(palette, 1);
        return {
            type: 'line',
            data: {
                labels,
                datasets: [{ data: values, borderColor: colors[0], borderWidth: 2, fill: false, tension: 0.4, pointRadius: 0 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 0 },
                plugins: { legend: { display: false }, title: { display: false }, tooltip: { enabled: false } },
                scales: { x: { display: false }, y: { display: false } }
            }
        };
    }

    buildProgressBarConfig(chartDef, labels, values, style, palette) {
        const val = values[0] || 0;
        const max = Math.max(...values, 100);
        const remaining = Math.max(0, max - val);
        const colors = this.getColors(palette, 1);

        return {
            type: 'bar',
            data: {
                labels: [chartDef.title || 'Progress'],
                datasets: [
                    { label: 'Progress', data: [val], backgroundColor: colors[0] + 'CC', borderColor: colors[0], borderWidth: 1, borderRadius: 4 },
                    { label: 'Remaining', data: [remaining], backgroundColor: '#E9ECEF', borderColor: '#dee2e6', borderWidth: 1, borderRadius: 4 }
                ]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    title: { display: true, text: chartDef.title || 'Progress' }
                },
                scales: {
                    x: { stacked: true, display: true, max, beginAtZero: true, ticks: { font: { size: 10 } } },
                    y: { stacked: true, display: false }
                }
            }
        };
    }

    buildRadialProgressConfig(chartDef, values, style) {
        const val = values[0] || 0;
        const max = Math.max(...values, 100);
        const pct = Math.min(val / max, 1);
        return {
            type: 'doughnut',
            data: {
                labels: ['Progress', 'Remaining'],
                datasets: [{ data: [pct * 100, (1 - pct) * 100], backgroundColor: ['#4A90D9', '#E9ECEF'], borderWidth: 0 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '75%',
                plugins: {
                    legend: { display: false },
                    title: { display: true, text: chartDef.title || 'Progress' }
                }
            }
        };
    }

    // ─── Chart.js type mapping ──────────────────────────────────────────────────────

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
