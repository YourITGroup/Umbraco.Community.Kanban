namespace Umbraco.Community.Kanban.Models;

/// <summary>
/// An editor-supplied appearance override for one lane, applied whatever source produced it.
/// </summary>
public class KanbanLaneOverride
{
    /// <summary>The lane value this override targets.</summary>
    public string Value { get; set; } = string.Empty;

    public string? Colour { get; set; }

    public string? Icon { get; set; }

    /// <summary>Replaces the label the source supplied.</summary>
    public string? Label { get; set; }
}
