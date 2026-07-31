namespace Umbraco.Community.Kanban.Models.Api;

/// <summary>One card placed on the calendar by its date property.</summary>
public sealed class KanbanCalendarItemModel
{
    /// <summary>The start calendar date as stored, "yyyy-MM-dd".</summary>
    public required string Date { get; init; }

    /// <summary>The start time as stored, "HH:mm". Null when the stored value is date-only (midnight).</summary>
    public string? Time { get; init; }

    /// <summary>The end calendar date as stored, when a valid end-date property value exists.</summary>
    public string? EndDate { get; init; }

    public string? EndTime { get; init; }

    /// <summary>
    /// The moment the start value names, round-trip ISO-8601 with offset — present only when the
    /// stored value states its own zone (Umbraco.DateTimeWithTimeZone, or a UTC value). The client
    /// converts it into the viewer's zone and places the card there, matching what a board card's
    /// value summary shows for the same property. Null means the value is a bare wall clock, and
    /// <see cref="Date"/>/<see cref="Time"/> are already the answer.
    /// </summary>
    public string? Instant { get; init; }

    /// <summary>The end value's moment, on the same terms as <see cref="Instant"/>.</summary>
    public string? EndInstant { get; init; }

    /// <summary>The raw category property value. Null when no category property is configured or the card has none.</summary>
    public string? Category { get; init; }

    public required KanbanCardModel Card { get; init; }
}

/// <summary>One category, resolved through the same source-and-overrides pipeline lanes use.</summary>
public sealed class KanbanCategoryModel
{
    public required string Value { get; init; }

    public required string Name { get; init; }

    public string? Colour { get; init; }

    public string? Icon { get; init; }
}

public sealed class KanbanCalendarResponseModel
{
    /// <summary>Placed cards ordered by date, then time (date-only first), then name.</summary>
    public required IReadOnlyList<KanbanCalendarItemModel> Items { get; init; }

    public required IReadOnlyList<KanbanCategoryModel> Categories { get; init; }

    /// <summary>
    /// The date property's editor schema alias, so the client can build a create-preset value in
    /// the right shape. Null for system properties, which cannot be preset.
    /// </summary>
    public string? DatePropertyEditorAlias { get; init; }

    /// <summary>The configured date property alias — the property a slot-created document presets.</summary>
    public required string DatePropertyAlias { get; init; }

    /// <summary>The parent's content type key, which is what the allowed-child-types lookup needs.</summary>
    public required Guid ParentContentTypeKey { get; init; }

    /// <summary>Whether the configuration shows the agenda list — echoed so hosts need only the config key.</summary>
    public bool ShowAgenda { get; init; }

    /// <summary>Children with no (or an unparseable) date value — omitted from Items, but not silently.</summary>
    public required int UndatedCount { get; init; }

    /// <summary>True when the item cap or the child-load cap cut real items from the range.</summary>
    public required bool Truncated { get; init; }
}
