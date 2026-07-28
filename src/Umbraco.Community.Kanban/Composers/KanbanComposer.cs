using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Community.Kanban.Extensions;

namespace Umbraco.Community.Kanban.Composers;

public sealed class KanbanComposer : IComposer
{
    public void Compose(IUmbracoBuilder builder) => builder.AddKanban();
}
