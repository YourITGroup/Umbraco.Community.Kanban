namespace Umbraco.Community.Kanban.Models;

/// <summary>
/// One property shown as a summary item on a card.
/// </summary>
/// <remarks>
/// Mirrors Umbraco's own <c>UmbCollectionColumnConfiguration</c>, the shape its List View column
/// configuration stores, so the backoffice control and this model agree without translation.
/// </remarks>
public class KanbanCardProperty
{
    /// <summary>The content type property alias, or a system field name such as <c>updateDate</c>.</summary>
    public string Alias { get; set; } = string.Empty;

    /// <summary>The label shown on the card. Falls back to the property's own name when empty.</summary>
    public string? Header { get; set; }

    /// <summary>
    /// A UFM template, e.g. <c>{umbMemberName: value}</c> or <c>${ value ? 'Yes' : 'No' }</c>. Rendered
    /// by the client; the server only carries it.
    /// </summary>
    public string? NameTemplate { get; set; }

    /// <summary>
    /// Whether <see cref="Alias" /> names a system field rather than a content type property. Stored
    /// rather than derived: a content type is free to declare a property aliased <c>published</c>, and
    /// only the editor that added the row knows which was meant. Umbraco's own column configuration
    /// stores it for the same reason, as the <c>0</c>/<c>1</c> this mirrors.
    /// </summary>
    public int IsSystem { get; set; }
}
