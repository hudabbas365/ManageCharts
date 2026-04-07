namespace ManageCharts.Models;

public class CanvasState
{
    public List<ChartDefinition> Charts { get; set; } = new();
    public string CanvasName { get; set; } = "My Report";
    public DateTime LastModified { get; set; } = DateTime.UtcNow;
}
