namespace Umbraco.Community.Kanban.Models.Api;

/// <summary>
/// The publish states a card can report. Deliberately our own three-value vocabulary
/// rather than Umbraco's variant-state enum: every card is a document that exists, so
/// there is no "not created", and the client's badge stays free of an enum whose
/// serialised form we would otherwise have to match exactly.
/// </summary>
public static class KanbanCardStates
{
    public const string Published = "published";
    public const string PublishedPendingChanges = "publishedPendingChanges";
    public const string Draft = "draft";
}

/// <summary>One summary property shown on a card.</summary>
public sealed class KanbanCardPropertyModel
{
    public required string Alias { get; init; }

    public required string Name { get; init; }

    /// <summary>
    /// The property editor *schema* alias, e.g. "Umbraco.DropDown.Flexible". The client
    /// hands this to umb-value-summary-extension to pick a renderer.
    /// </summary>
    public required string EditorAlias { get; init; }

    /// <summary>
    /// A UFM template the client renders instead of the value's own summary, when set. Carried rather
    /// than applied: resolving it needs the backoffice's own UFM renderer.
    /// </summary>
    public string? NameTemplate { get; init; }

    public object? Value { get; init; }
}

/// <summary>One child of a card — enough to list it and open it, and nothing more.</summary>
public sealed class KanbanCardChildModel
{
    public required Guid Key { get; init; }

    public required string Name { get; init; }

    /// <summary>The content type icon verbatim, colour suffix and all, as a card's own icon is.</summary>
    public string? Icon { get; init; }
}

/// <summary>One card on a board — a child document.</summary>
public sealed class KanbanCardModel
{
    public required Guid Key { get; init; }

    public required string Name { get; init; }

    public required string ContentTypeAlias { get; init; }

    /// <summary>
    /// The content type icon verbatim, including any "color-x" suffix — umb-icon
    /// splits and resolves that itself, so nothing here parses it.
    /// </summary>
    public string? Icon { get; init; }

    /// <summary>One of <see cref="KanbanCardStates" />.</summary>
    public required string State { get; init; }

    /// <summary>
    /// Whether the current user may update this node. Populated from this milestone on,
    /// but nothing reads it until drag arrives in milestone 3.
    /// </summary>
    public bool CanUpdate { get; init; }

    /// <summary>
    /// Whether the current user may create under this card. Gates the card's add button, so the
    /// button never appears for a user the workspace would then refuse.
    /// </summary>
    public bool CanCreate { get; init; }

    /// <summary>
    /// The card's content type key. Carried alongside the alias because resolving which types may be
    /// created under this card needs the key: the client asks Umbraco's own document type structure
    /// repository, which is keyed by GUID.
    /// </summary>
    public required Guid ContentTypeKey { get; init; }

    /// <summary>
    /// The first few children of this card, in the board's configured child order. Empty unless the
    /// board's <c>showChildItems</c> setting is on.
    /// </summary>
    public IReadOnlyList<KanbanCardChildModel> Children { get; init; } = [];

    /// <summary>
    /// How many children of this card the board read and the user may browse. Unlike
    /// <see cref="KanbanBoardResponseModel.ChildCount" /> this IS permission-filtered and is meant to
    /// be displayed.
    /// </summary>
    public int ChildTotal { get; init; }

    /// <summary>
    /// False when the board hit its grandchild cap, making <see cref="ChildTotal" /> a lower bound —
    /// the same distinction <see cref="KanbanBoardLaneModel.TotalIsExact" /> draws for a lane.
    /// </summary>
    public bool ChildTotalIsExact { get; init; } = true;

    public IReadOnlyList<KanbanCardPropertyModel> Properties { get; init; } = [];
}

/// <summary>One lane, with the page of cards the request asked for.</summary>
public sealed class KanbanBoardLaneModel
{
    public required string Value { get; init; }

    public required string Name { get; init; }

    public string? Colour { get; init; }

    public string? Icon { get; init; }

    public bool IsUnassigned { get; init; }

    public bool AcceptsDrops { get; init; }

    /// <summary>
    /// Cards in this lane the current user can see. Exact while
    /// <see cref="TotalIsExact" /> is true, otherwise a lower bound.
    /// </summary>
    public int Total { get; init; }

    public bool TotalIsExact { get; init; } = true;

    /// <summary>How many cards were skipped to produce <see cref="Cards" />.</summary>
    public int Skip { get; init; }

    public IReadOnlyList<KanbanCardModel> Cards { get; init; } = [];
}

/// <summary>The board, or a single lane's page when the request named one.</summary>
public sealed class KanbanBoardResponseModel
{
    public IReadOnlyList<KanbanBoardLaneModel> Lanes { get; init; } = [];

    /// <summary>True when the parent has more children than the board read.</summary>
    public bool Truncated { get; init; }

    /// <summary>
    /// The parent's true child count, exact even when truncated. Deliberately NOT
    /// permission-filtered — truncation semantics need the real count — so the client must never
    /// display it, or it would disclose siblings a restricted user cannot see.
    /// </summary>
    public int ChildCount { get; init; }

    /// <summary>
    /// Whether this board lists each card's children. Board-wide state rather than per-card data, and
    /// stated explicitly because a card with no children is otherwise indistinguishable from a board
    /// that does not show them.
    /// </summary>
    public bool ShowChildItems { get; init; }
}
