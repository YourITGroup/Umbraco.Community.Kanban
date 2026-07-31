using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Grouping;

/// <summary>
/// Everything a group source needs, with no dependency on <c>IDataType</c> so sources stay trivially testable.
/// </summary>
/// <param name="EditorAlias">The property editor alias of the grouping property's data type (the board's lane property, or the calendar's category property).</param>
/// <param name="ConfigurationData">That data type's raw configuration dictionary.</param>
/// <param name="Configuration">The board configuration being resolved.</param>
public sealed record KanbanGroupSourceContext(
    string EditorAlias,
    IDictionary<string, object> ConfigurationData,
    KanbanBoardConfiguration Configuration);
