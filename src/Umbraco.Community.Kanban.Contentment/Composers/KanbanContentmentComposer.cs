using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Community.Kanban.Contentment.Extensions;

namespace Umbraco.Community.Kanban.Contentment.Composers;

/// <summary>
/// Makes installing this package the only step required: Umbraco discovers and runs composers itself.
/// </summary>
public sealed class KanbanContentmentComposer : IComposer
{
    public void Compose(IUmbracoBuilder builder) => builder.AddKanbanContentment();
}
