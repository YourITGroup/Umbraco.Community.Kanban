using Umbraco.Community.Kanban.Models.Api;
using Umbraco.Community.Kanban.Services;

namespace Umbraco.Community.Kanban.Tests.Services;

public class KanbanCardStateResolverTests
{
    [Fact]
    public void Published_and_unedited_is_published() =>
        KanbanCardStateResolver.Resolve(published: true, edited: false)
            .Should().Be(KanbanCardStates.Published);

    [Fact]
    public void Published_and_edited_is_published_pending_changes() =>
        KanbanCardStateResolver.Resolve(published: true, edited: true)
            .Should().Be(KanbanCardStates.PublishedPendingChanges);

    [Fact]
    public void Unpublished_is_draft() =>
        KanbanCardStateResolver.Resolve(published: false, edited: false)
            .Should().Be(KanbanCardStates.Draft);

    [Fact]
    public void Unpublished_but_edited_is_still_draft() =>
        KanbanCardStateResolver.Resolve(published: false, edited: true)
            .Should().Be(KanbanCardStates.Draft);
}
