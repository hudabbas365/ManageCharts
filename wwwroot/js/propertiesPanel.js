// Properties panel - handles the right panel
class PropertiesPanel {
    constructor() {
        this.currentChart = null;
        this.fields = [];
    }

    clear() {
        this.currentChart = null;
        const panel = document.getElementById('properties-empty');
        const form = document.getElementById('properties-form');
        if (panel) panel.style.display = 'flex';
        if (form) form.style.display = 'none';
    }

    async load(chartDef) {
        this.currentChart = JSON.parse(JSON.stringify(chartDef));
        const panel = document.getElementById('properties-empty');
        const form = document.getElementById('properties-form');
        if (panel) panel.style.display = 'none';
        if (form) form.style.display = 'block';

        await this.loadFields(chartDef.datasetName);
        this.populate();
    }

    async loadFields(datasetName) {
        try {
            const resp = await fetch(`/api/data/${datasetName}/fields`);
            this.fields = await resp.json();
            this.updateFieldSelects();
        } catch(e) {
            this.fields = [];
        }
    }

    updateFieldSelects() {
        const selects = document.querySelectorAll('.field-select');
        selects.forEach(sel => {
            const current = sel.value;
            sel.innerHTML = '<option value="">-- none --</option>' +
                this.fields.map(f => `<option value="${f}">${f}</option>`).join('');
            if (current) sel.value = current;
        });
    }

    populate() {
        if (!this.currentChart) return;
        const c = this.currentChart;
        this.setVal('prop-title', c.title);
        this.setVal('prop-chart-type', c.chartType);
        this.setVal('prop-dataset', c.datasetName);
        this.setVal('prop-width', c.width);
        this.setVal('prop-height', c.height);
        this.setVal('prop-label-field', c.mapping?.labelField || '');
        this.setVal('prop-value-field', c.mapping?.valueField || '');
        this.setVal('prop-agg-enabled', c.aggregation?.enabled || false, 'checkbox');
        this.setVal('prop-agg-function', c.aggregation?.function || 'SUM');
        this.setVal('prop-color-palette', c.style?.colorPalette || 'default');
        this.setVal('prop-show-legend', c.style?.showLegend !== false, 'checkbox');
        this.setVal('prop-legend-position', c.style?.legendPosition || 'top');
        this.setVal('prop-fill-area', c.style?.fillArea || false, 'checkbox');
        this.setVal('prop-show-tooltips', c.style?.showTooltips !== false, 'checkbox');
        this.setVal('prop-animated', c.style?.animated !== false, 'checkbox');
        this.setVal('prop-title-font-size', c.style?.titleFontSize || 14);
        this.setVal('prop-border-radius', c.style?.borderRadius || '4');
        this.setVal('prop-custom-json', c.customJsonData || '');
    }

    setVal(id, val, type = 'value') {
        const el = document.getElementById(id);
        if (!el) return;
        if (type === 'checkbox') el.checked = !!val;
        else el.value = val ?? '';
    }

    getVal(id, type = 'value') {
        const el = document.getElementById(id);
        if (!el) return undefined;
        if (type === 'checkbox') return el.checked;
        return el.value;
    }

    collect() {
        if (!this.currentChart) return null;
        return {
            ...this.currentChart,
            title: this.getVal('prop-title'),
            chartType: this.getVal('prop-chart-type'),
            datasetName: this.getVal('prop-dataset'),
            width: parseInt(this.getVal('prop-width')) || 6,
            height: parseInt(this.getVal('prop-height')) || 300,
            mapping: {
                ...this.currentChart.mapping,
                labelField: this.getVal('prop-label-field'),
                valueField: this.getVal('prop-value-field'),
            },
            aggregation: {
                enabled: this.getVal('prop-agg-enabled', 'checkbox'),
                function: this.getVal('prop-agg-function'),
            },
            style: {
                ...this.currentChart.style,
                colorPalette: this.getVal('prop-color-palette'),
                showLegend: this.getVal('prop-show-legend', 'checkbox'),
                legendPosition: this.getVal('prop-legend-position'),
                fillArea: this.getVal('prop-fill-area', 'checkbox'),
                showTooltips: this.getVal('prop-show-tooltips', 'checkbox'),
                animated: this.getVal('prop-animated', 'checkbox'),
                titleFontSize: parseInt(this.getVal('prop-title-font-size')) || 14,
                borderRadius: this.getVal('prop-border-radius'),
            },
            customJsonData: this.getVal('prop-custom-json'),
        };
    }

    async apply() {
        const updated = this.collect();
        if (!updated) return;
        this.currentChart = updated;
        if (window.canvasManager) await window.canvasManager.updateChart(updated);
    }

    async datasetChanged() {
        const ds = this.getVal('prop-dataset');
        await this.loadFields(ds);
        if (this.currentChart) this.currentChart.datasetName = ds;
    }
}

window.propertiesPanel = new PropertiesPanel();
