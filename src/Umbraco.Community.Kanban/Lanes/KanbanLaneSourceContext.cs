using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Lanes;

/// <summary>
/// Everything a lane source needs, with no dependency on <c>IDataType</c> so sources stay trivially testable.
/// </summary>
/// <param name="EditorAlias">The property editor alias of the lane property's data type.</param>
/// <param name="ConfigurationData">That data type's raw configuration dictionary.</param>
/// <param name="Configuration">The board configuration being resolved.</param>
public sealed record KanbanLaneSourceContext(
    string EditorAlias,
    IDictionary<string, object> ConfigurationData,
    KanbanBoardConfiguration Configuration);
