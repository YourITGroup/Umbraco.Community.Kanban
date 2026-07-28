using Umbraco.Cms.Core.Composing;

namespace Umbraco.Community.Kanban.Lanes;

/// <summary>
/// The ordered set of registered lane sources. Add your own with
/// <c>builder.KanbanLaneSources().Append&lt;MyLaneSource&gt;()</c>.
/// </summary>
public sealed class KanbanLaneSourceCollection(Func<IEnumerable<IKanbanLaneSource>> items)
    : BuilderCollectionBase<IKanbanLaneSource>(items);

public sealed class KanbanLaneSourceCollectionBuilder
    : OrderedCollectionBuilderBase<KanbanLaneSourceCollectionBuilder, KanbanLaneSourceCollection, IKanbanLaneSource>
{
    protected override KanbanLaneSourceCollectionBuilder This => this;
}
