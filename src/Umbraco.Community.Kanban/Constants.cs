namespace Umbraco.Community.Kanban;

public static class Constants
{
    public const string PackageAlias = "Umbraco.Community.Kanban";
    public const string PluginAlias = "UmbracoCommunityKanban";

    public const string ApiName = "kanban";
    public const string ManagementApiPath = "/kanban/api";

    public const string BoardEditorAlias = "Umbraco.Community.Kanban.Board";
    public const string CalendarEditorAlias = "Umbraco.Community.Kanban.Calendar";

    public const string BoardEditorUiAlias = "Umb.Community.Kanban.PropertyEditorUi.Board";
    public const string CalendarEditorUiAlias = "Umb.Community.Kanban.PropertyEditorUi.Calendar";

    /// <summary>
    /// The extra configuration key written onto a Collection data type naming which
    /// Kanban Board configuration its board layout uses.
    /// </summary>
    public const string BoardConfigIdKey = "kanban.boardConfigId";

    /// <summary>
    /// The alias of the lane source that reads lanes typed into the board configuration.
    /// Lives here rather than only on <c>ManualLaneSource</c> because
    /// <see cref="Models.KanbanBoardConfiguration" /> pins it without depending on the Lanes namespace.
    /// </summary>
    public const string ManualLaneSourceAlias = "manual";

    /// <summary>How many children a board reads before it reports itself truncated.</summary>
    public const int DefaultChildCap = 1000;
}
