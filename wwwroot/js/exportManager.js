// Export manager - handles PDF, PNG, JSON exports
class ExportManager {
    async exportPng() {
        const canvas = document.getElementById('chart-canvas-drop');
        if (!canvas) return;
        const c = await html2canvas(canvas, { backgroundColor: '#ffffff', scale: 2 });
        const link = document.createElement('a');
        link.download = 'report.png';
        link.href = c.toDataURL('image/png');
        link.click();
    }

    async exportPdf() {
        const canvas = document.getElementById('chart-canvas-drop');
        if (!canvas || typeof window.jspdf === 'undefined') return;
        const { jsPDF } = window.jspdf;
        const c = await html2canvas(canvas, { backgroundColor: '#ffffff', scale: 1.5 });
        const imgData = c.toDataURL('image/png');
        const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [c.width, c.height] });
        pdf.addImage(imgData, 'PNG', 0, 0, c.width, c.height);
        pdf.save('report.pdf');
    }

    exportJson() {
        const charts = window.canvasManager ? window.canvasManager.charts : [];
        const blob = new Blob([JSON.stringify(charts, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.download = 'report-config.json';
        link.href = URL.createObjectURL(blob);
        link.click();
    }

    async importJson(file) {
        if (!file) return;
        const text = await file.text();
        try {
            const charts = JSON.parse(text);
            if (!Array.isArray(charts)) throw new Error('Invalid format');
            if (window.canvasManager) {
                window.canvasManager.charts = charts;
                window.canvasManager.renderAll();
            }
        } catch(e) {
            console.error('Import failed:', e);
            alert('Could not import file. Please ensure it is a valid report JSON export.');
        }
    }
}

window.exportManager = new ExportManager();
