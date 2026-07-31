using Umbraco.Cms.Core.Composing;

namespace Umbraco.Community.Kanban.Grouping;

/// <summary>
/// The ordered set of registered group sources. Add your own with
/// <c>builder.KanbanGroupSources().Append&lt;MyGroupSource&gt;()</c>.
/// </summary>
public sealed class KanbanGroupSourceCollection(Func<IEnumerable<IKanbanGroupSource>> items)
    : BuilderCollectionBase<IKanbanGroupSource>(items);

public sealed class KanbanGroupSourceCollectionBuilder
    : OrderedCollectionBuilderBase<KanbanGroupSourceCollectionBuilder, KanbanGroupSourceCollection, IKanbanGroupSource>
{
    protected override KanbanGroupSourceCollectionBuilder This => this;
}
