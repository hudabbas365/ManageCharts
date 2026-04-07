using ManageCharts.Models;
using ManageCharts.Services;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;

namespace ManageCharts.Controllers;

[Route("api/[controller]")]
[ApiController]
public class ChartController : ControllerBase
{
    private readonly IChartService _chartService;
    private const string SessionKey = "canvas_state";

    public ChartController(IChartService chartService)
    {
        _chartService = chartService;
    }

    private CanvasState GetCanvas()
    {
        var json = HttpContext.Session.GetString(SessionKey);
        if (string.IsNullOrEmpty(json))
        {
            var canvas = new CanvasState { Charts = _chartService.GetDefaultCharts() };
            HttpContext.Session.SetString(SessionKey, JsonConvert.SerializeObject(canvas));
            return canvas;
        }
        return JsonConvert.DeserializeObject<CanvasState>(json) ?? new CanvasState();
    }

    private void SaveCanvas(CanvasState canvas)
    {
        canvas.LastModified = DateTime.UtcNow;
        HttpContext.Session.SetString(SessionKey, JsonConvert.SerializeObject(canvas));
    }

    [HttpGet]
    public IActionResult GetAll()
    {
        var canvas = GetCanvas();
        return Ok(canvas);
    }

    [HttpPost("add")]
    public IActionResult Add([FromBody] ChartDefinition chart)
    {
        var canvas = GetCanvas();
        chart.Id = Guid.NewGuid().ToString("N")[..8];
        canvas.Charts.Add(chart);
        SaveCanvas(canvas);
        return Ok(chart);
    }

    [HttpPut("{id}")]
    public IActionResult Update(string id, [FromBody] ChartDefinition chart)
    {
        var canvas = GetCanvas();
        var idx = canvas.Charts.FindIndex(c => c.Id == id);
        if (idx < 0) return NotFound();
        chart.Id = id;
        canvas.Charts[idx] = chart;
        SaveCanvas(canvas);
        return Ok(chart);
    }

    [HttpDelete("{id}")]
    public IActionResult Delete(string id)
    {
        var canvas = GetCanvas();
        var removed = canvas.Charts.RemoveAll(c => c.Id == id);
        if (removed == 0) return NotFound();
        SaveCanvas(canvas);
        return Ok(new { success = true });
    }

    [HttpPost("reorder")]
    public IActionResult Reorder([FromBody] List<string> ids)
    {
        var canvas = GetCanvas();
        var reordered = ids
            .Select(id => canvas.Charts.FirstOrDefault(c => c.Id == id))
            .Where(c => c != null)
            .Cast<ChartDefinition>()
            .ToList();
        canvas.Charts = reordered;
        SaveCanvas(canvas);
        return Ok(new { success = true });
    }

    [HttpPost("rename")]
    public IActionResult RenameCanvas([FromBody] RenameRequest req)
    {
        var canvas = GetCanvas();
        canvas.CanvasName = req.Name;
        SaveCanvas(canvas);
        return Ok(new { success = true });
    }

    [HttpPost("reset")]
    public IActionResult Reset()
    {
        var canvas = new CanvasState { Charts = _chartService.GetDefaultCharts() };
        SaveCanvas(canvas);
        return Ok(canvas);
    }

    [HttpGet("types")]
    public IActionResult GetTypes()
    {
        return Ok(_chartService.GetGroupedCharts()
            .Select(g => new { group = g.Key, charts = g.ToList() }));
    }
}

public class RenameRequest
{
    public string Name { get; set; } = "";
}
