using Newtonsoft.Json;
using System.Xml.Serialization;

namespace ManageCharts.Models;

public class CanvasState
{
    public List<ReportPage> Pages { get; set; } = new() { new ReportPage { Name = "Page 1" } };
    public string CanvasName { get; set; } = "My Report";
    public DateTime LastModified { get; set; } = DateTime.UtcNow;
    public int ActivePageIndex { get; set; } = 0;

    // Convenience accessor for the active page's charts — keeps existing controller code working.
    [JsonIgnore]
    [XmlIgnore]
    public List<ChartDefinition> Charts
    {
        get => Pages?.Count > 0 ? Pages[Math.Clamp(ActivePageIndex, 0, Pages.Count - 1)].Charts : new();
        set { if (Pages?.Count > 0) Pages[Math.Clamp(ActivePageIndex, 0, Pages.Count - 1)].Charts = value; }
    }
}

public class ReportPage
{
    public string Name { get; set; } = "Page 1";
    public List<ChartDefinition> Charts { get; set; } = new();
}
