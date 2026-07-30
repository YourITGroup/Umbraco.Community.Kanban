namespace Umbraco.Community.Kanban.Models;

/// <summary>
/// A single swimlane on a board.
/// </summary>
public class KanbanLane
{
    /// <summary>The stored property value that puts a card in this lane.</summary>
    public string Value { get; set; } = string.Empty;

    /// <summary>The label shown in the lane header.</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>An Umbraco colour alias, a raw CSS colour, or null to take one from the cycle.</summary>
    public string? Colour { get; set; }

    public string? Icon { get; set; }

    /// <summary>True for the synthetic lane collecting empty and unmatched values.</summary>
    public bool IsUnassigned { get; set; }

    /// <summary>False for lanes a card may leave but not be dropped into.</summary>
    public bool AcceptsDrops { get; set; } = true;

    /// <summary>Creates the synthetic unassigned lane, which is always neutral and drag-out-only.</summary>
    public static KanbanLane Unassigned() => new()
    {
        Value = string.Empty,
        Name = "Unassigned",
        Colour = "grey",
        IsUnassigned = true,
        AcceptsDrops = false,
    };
}
