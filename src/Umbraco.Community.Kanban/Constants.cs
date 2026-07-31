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

    /// <summary>The extra configuration alias naming a Calendar configuration on a Collection data type.</summary>
    public const string CalendarConfigIdKey = "kanban.calendarConfigId";

    /// <summary>The most items one calendar range request returns; past it the response flags truncation.</summary>
    public const int DefaultCalendarCap = 500;

    /// <summary>
    /// The alias of the group source that reads groups typed into the configuration by hand.
    /// Lives here rather than only on <c>ManualGroupSource</c> because
    /// <see cref="Models.KanbanBoardConfiguration" /> pins it without depending on the Grouping namespace.
    /// </summary>
    public const string ManualGroupSourceAlias = "manual";

    /// <summary>The alias of the group source that lists the documents a picker property allows.</summary>
    public const string ContentInstanceGroupSourceAlias = "content-instances";

    /// <summary>
    /// The most groups a source may produce. A board of hundreds of swimlanes is unusable long before
    /// this, so the cap exists to keep a picker aimed at a large document type from rendering a board
    /// nobody can scroll; the source logs when it bites.
    /// </summary>
    public const int DefaultGroupCap = 200;

    /// <summary>How many children a board reads before it reports itself truncated.</summary>
    public const int DefaultChildCap = 1000;

    /// <summary>
    /// How many grandchildren a board reads to fill its cards' child lists. Deliberately larger than
    /// <see cref="DefaultChildCap" />: it covers every card's children at once, in one query.
    /// </summary>
    public const int DefaultGrandchildCap = 2000;

    /// <summary>
    /// How many children a card lists. A card is a summary, so there is no "show more" — the rest are
    /// reported as a count and seen by opening the card.
    /// </summary>
    public const int CardChildDisplayCap = 5;
}
