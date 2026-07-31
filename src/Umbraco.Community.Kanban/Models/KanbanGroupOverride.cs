namespace Umbraco.Community.Kanban.Models;

/// <summary>
/// An editor-supplied appearance override for one lane, applied whatever source produced it.
/// </summary>
public class KanbanGroupOverride
{
    /// <summary>The lane value this override targets.</summary>
    public string Value { get; set; } = string.Empty;

    public string? Colour { get; set; }

    public string? Icon { get; set; }

    /// <summary>Replaces the label the source supplied.</summary>
    public string? Label { get; set; }

    /// <summary>
    /// Keeps this group off the board or calendar entirely — the lane is not rendered, and the cards
    /// in it are not shown anywhere. Unlike the appearance fields, false is a meaningful value here
    /// (shown), so it is applied rather than treated as "unset".
    /// </summary>
    public bool Hidden { get; set; }
}
