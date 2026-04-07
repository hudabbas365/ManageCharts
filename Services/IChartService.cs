using ManageCharts.Models;

namespace ManageCharts.Services;

public interface IChartService
{
    List<ChartTypeInfo> GetChartLibrary();
    List<ChartDefinition> GetDefaultCharts();
    IEnumerable<IGrouping<string, ChartTypeInfo>> GetGroupedCharts();
}
