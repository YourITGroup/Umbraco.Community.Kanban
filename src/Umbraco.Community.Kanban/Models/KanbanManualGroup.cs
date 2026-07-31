namespace Umbraco.Community.Kanban.Models;

/// <summary>
/// A lane typed by hand into the board configuration.
/// Separate from <see cref="KanbanGroup"/> so runtime-only fields never end up
/// in the stored data type configuration.
/// </summary>
public class KanbanManualGroup
{
    public string Value { get; set; } = string.Empty;

    /// <summary>The lane header text. Falls back to <see cref="Value"/> when empty.</summary>
    public string? Label { get; set; }

    public string? Colour { get; set; }

    public string? Icon { get; set; }
}
