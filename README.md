# ManageCharts – Dynamic Report Designer

A full-featured **Dynamic Report Designer** web application built with ASP.NET Core MVC (.NET 8), Chart.js 4, Bootstrap 5, and jQuery. Design interactive dashboards by dragging and dropping from a library of **70 chart types**, binding them to JSON data with unknown/dynamic schemas, and customizing every visual property live.

---

## 🚀 Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | ASP.NET Core MVC (.NET 8) |
| **UI** | Bootstrap 5.3, Bootstrap Icons 1.11 |
| **Charts** | Chart.js 4.4 |
| **Interactivity** | jQuery 3.7, SortableJS 1.15 |
| **Export** | jsPDF 2.5, html2canvas 1.4, PptxGenJS 3.12 |
| **Serialization** | Newtonsoft.Json 13.0.3 |
| **Session** | ASP.NET Core distributed memory cache |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Report Designer                             │
├───────────────┬──────────────────────────┬──────────────────────┤
│  LEFT PANEL   │     CENTER CANVAS        │   RIGHT PANEL        │
│   (260px)     │        (1fr)             │    (320px)           │
│               │                          │                      │
│ 🔍 Search     │  Toolbar: Add|Clear|Undo │  📊 Data Source      │
│               │         |Redo|Zoom|Grid  │  🔗 Field Mapping    │
│ 📁 Basic (10) │                          │  ∑  Aggregation      │
│ 📁 Advanced   │  ┌─────────┐ ┌────────┐ │  🎨 Style            │
│ 📁 Statistical│  │  Chart  │ │ Chart  │ │  📖 Legend           │
│ 📁 Time (10)  │  │    1    │ │   2    │ │  💬 Tooltips         │
│ 📁 Comparison │  └─────────┘ └────────┘ │  📤 Export           │
│ 📁 Geographic │  ┌─────────┐ ┌────────┐ │                      │
│ 📁 KPI (5)    │  │  Chart  │ │ Chart  │ │  [Apply Changes]     │
│               │  │    3    │ │   4    │ │                      │
└───────────────┴──────────────────────────┴──────────────────────┘
```

### Project Structure

```
ManageCharts/
├── ManageCharts.csproj
├── Program.cs
├── appsettings.json
├── Controllers/
│   ├── HomeController.cs          # Session canvas management
│   ├── ChartController.cs         # Chart CRUD REST API
│   └── DataController.cs          # Dataset & aggregation API
├── Models/
│   ├── ChartDefinition.cs
│   ├── ChartConfig.cs             # ChartConfig + ChartTypeInfo + ChartStyleConfig
│   ├── FieldMapping.cs
│   ├── AggregationConfig.cs
│   ├── CanvasState.cs
│   └── SampleDataSets.cs
├── Services/
│   ├── IChartService.cs
│   ├── ChartService.cs            # 70 chart types catalog
│   ├── IDataService.cs
│   └── DataService.cs             # Data loading + aggregation engine
├── wwwroot/
│   ├── css/site.css               # Soft blue theme, 3-panel grid
│   ├── js/
│   │   ├── chartLibrary.js        # Library panel, search, drag
│   │   ├── chartRenderer.js       # Chart.js factory for all types
│   │   ├── canvasManager.js       # Canvas state, undo/redo, SortableJS
│   │   ├── propertiesPanel.js     # Live property binding
│   │   └── exportManager.js       # PNG, HTML, JSON export
│   └── data/
│       ├── sales.json             # 12 months × 6 fields
│       ├── population.json        # 15 countries × 5 fields
│       ├── weather.json           # 12 months × 5 fields
│       └── finance.json           # 8 quarters × 5 fields
└── Views/
    ├── Shared/_Layout.cshtml
    ├── Home/Index.cshtml
    └── Partials/
        ├── _ChartCard.cshtml
        ├── _PropertiesPanel.cshtml
        ├── _ChartCanvas.cshtml
        └── _DataMapper.cshtml
```

---

## ⚙️ Setup Instructions

### Prerequisites
- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)

### Run Locally

```bash
git clone https://github.com/hudabbas365/ManageCharts.git
cd ManageCharts
dotnet run
```

Open your browser at `http://localhost:5000`

### Build

```bash
dotnet build
```

---

## ✨ Features

### Three-Panel Designer Layout
- **Left Panel** – Scrollable library of 70 chart types, organized into 9 groups, with live search filtering
- **Center Canvas** – Drag-and-drop grid of chart tiles with undo/redo history (up to 50 steps), zoom control, and grid overlay
- **Right Panel** – 7-section accordion properties editor with live preview

### Dynamic JSON Binding
- Select from 4 built-in datasets (Sales, Population, Weather, Finance) or paste custom JSON
- Fields are auto-detected from the first record via AJAX (`GET /Data/GetFields/{name}`)
- Field dropdowns update dynamically without page reload

### Live Property Updates
- Any property change immediately re-renders the chart (debounced 300 ms)
- Supports: color palette, fill area, legend, tooltips, font size, border radius, title, dimensions

### Aggregation Engine
Supported functions: **SUM**, **AVG**, **COUNT**, **MAX**, **MIN**
- Group data by any field before aggregating
- Results automatically become chart labels + values

### Session Isolation
- Each browser session gets its own `CanvasState` stored in `HttpContext.Session`
- Session key: `canvas_state`
- No data is shared between sessions

### Export Formats
| Format | Method |
|---|---|
| **PNG** | `canvas.toDataURL('image/png')` → download link |
| **HTML** | Inline Chart.js config → self-contained HTML file |
| **JSON** | Raw chart definition → downloadable `.json` |
| **PDF** | html2canvas + jsPDF (requires CDN) |
| **PPT** | PptxGenJS slide (requires CDN) |

---

## 📊 70 Chart Types

### Basic (10)
Bar, Horizontal Bar, Stacked Bar, Line, Area, Pie, Donut, Scatter, Bubble, Radar

### Advanced (10)
Mixed Bar+Line, Grouped Bar, Waterfall, Funnel, Gauge, Treemap, Heatmap, Sankey, Sunburst, Polar Area

### Statistical (10)
Histogram, Box Plot, Violin, Bell Curve, Pareto, Control Chart, Regression Line, Confidence Band, Error Bar, Stem and Leaf

### Time Series (10)
Time Line, Candlestick, OHLC, Range Area, Step Line, Stream Graph, Event Timeline, Gantt, Burn Down, Velocity Chart

### Comparison (10)
Bullet Chart, Marimekko, Dot Plot, Lollipop, Dumbbell, Slope, Diverging Bar, Span Chart, Paired Bar, Population Pyramid

### Geographic (5)
Choropleth, Bubble Map, Heat Map Geographic, Flow Map, Spike Map

### Relationship (5)
Network Graph, Chord Diagram, Arc Diagram, Force-Directed, Matrix

### Part-to-Whole (5)
100% Stacked Bar, 100% Stacked Area, Waffle Chart, Pictograph, Nightingale Rose

### KPI/Metrics (5)
KPI Card, Sparkline, Progress Bar, Radial Progress, Metric Tile

---

## 🎨 Color Theme

| Variable | Value |
|---|---|
| Primary | `#4A90D9` |
| Primary Dark | `#2C6FAC` |
| Primary Light | `#EBF4FF` |
| Background | `#F4F7FB` |
| Surface | `#FFFFFF` |
| Border | `#DDE8F0` |

---

## 🌐 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/Data/GetDatasets` | List available dataset names |
| `GET` | `/Data/GetData/{name}` | Raw JSON array for dataset |
| `GET` | `/Data/GetFields/{name}` | Field names from first record |
| `POST` | `/Data/GetAggregated` | Aggregated `{ labels, values }` |
| `POST` | `/Chart/AddChart` | Add chart to session canvas |
| `POST` | `/Chart/UpdateChart` | Update chart config in session |
| `DELETE` | `/Chart/RemoveChart/{id}` | Remove chart from session |
| `GET` | `/Chart/GetCanvasState` | Full session canvas JSON |
| `POST` | `/Chart/SaveCanvas` | Persist canvas state to session |

---

## 📝 License

MIT License – see [LICENSE](LICENSE) for details.