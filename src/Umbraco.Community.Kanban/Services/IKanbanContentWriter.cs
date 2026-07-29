using Umbraco.Cms.Core.Models;

namespace Umbraco.Community.Kanban.Services;

/// <param name="Saved">False when the property was not there to write, or the save itself failed.</param>
/// <param name="Published">The document's published flag after the save, for the effective culture.</param>
/// <param name="Edited">The document's edited flag after the save, for the effective culture.</param>
/// <remarks>
/// The published/edited pair is returned rather than read back off the <see cref="IContent" /> by the
/// caller for one reason: the per-culture flags come from IContent internals that cannot be set on an
/// in-memory Content instance, so a caller computing state itself would be untestable. Returning the
/// pair keeps <see cref="KanbanCardStateResolver" /> the single place that decides what a state means.
/// </remarks>
public sealed record KanbanCardSaveResult(bool Saved, bool Published, bool Edited)
{
    /// <summary>Nothing was written — a missing lane property, or a save Umbraco refused.</summary>
    public static KanbanCardSaveResult NotSaved { get; } = new(false, false, false);
}

/// <summary>
/// The narrow slice of IContentService the card write path needs, so the card service is testable —
/// IContentService can be neither hand-faked nor constructed without persistence. The read-side
/// counterpart is <see cref="IKanbanContentLoader" />.
/// </summary>
public interface IKanbanContentWriter
{
    /// <summary>
    /// Sets one property and saves the document — <c>Save</c>, never a publish, because a dragged card
    /// must stay reversible until an editor publishes it deliberately.
    /// </summary>
    /// <remarks>
    /// Culture targeting follows the property's own variation, not the document's: an invariant property
    /// on a varying document still stores its value under no culture, and passing a culture there would
    /// write a value nothing ever reads back.
    /// </remarks>
    KanbanCardSaveResult SetLaneValue(IContent content, string laneProperty, string laneValue, string? culture);
}
