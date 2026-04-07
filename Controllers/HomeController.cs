using ManageCharts.Models;
using ManageCharts.Services;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;

namespace ManageCharts.Controllers;

public class HomeController : Controller
{
    private readonly IChartService _chartService;
    private readonly IDataService _dataService;
    private const string SessionKey = "canvas_state";

    private static readonly JsonSerializerSettings CamelCaseSettings = new()
    {
        ContractResolver = new CamelCasePropertyNamesContractResolver(),
        ReferenceLoopHandling = ReferenceLoopHandling.Ignore
    };

    public HomeController(IChartService chartService, IDataService dataService)
    {
        _chartService = chartService;
        _dataService = dataService;
    }

    public IActionResult Index()
    {
        var canvasJson = HttpContext.Session.GetString(SessionKey);
        CanvasState canvas;
        if (string.IsNullOrEmpty(canvasJson))
        {
            canvas = new CanvasState { Charts = _chartService.GetDefaultCharts() };
            HttpContext.Session.SetString(SessionKey, JsonConvert.SerializeObject(canvas));
        }
        else
        {
            canvas = JsonConvert.DeserializeObject<CanvasState>(canvasJson) ?? new CanvasState();
        }

        ViewBag.InitialCharts = JsonConvert.SerializeObject(canvas.Charts, CamelCaseSettings);
        ViewBag.CanvasName = canvas.CanvasName;
        ViewBag.ChartLibrary = JsonConvert.SerializeObject(
            _chartService.GetGroupedCharts().Select(g => new { group = g.Key, charts = g.ToList() }),
            CamelCaseSettings);
        ViewBag.Datasets = JsonConvert.SerializeObject(_dataService.GetDatasets());

        return View(canvas);
    }

    [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
    public IActionResult Error() => View();
}
