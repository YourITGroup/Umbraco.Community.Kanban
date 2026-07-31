namespace Umbraco.Community.Kanban.Models.Api;

/// <summary>The query for GET /calendar. From and to are inclusive calendar dates.</summary>
public class KanbanCalendarRequestModel
{
    public Guid ParentId { get; set; }

    public Guid? ConfigId { get; set; }

    public string? Culture { get; set; }

    public DateOnly From { get; set; }

    public DateOnly To { get; set; }
}
