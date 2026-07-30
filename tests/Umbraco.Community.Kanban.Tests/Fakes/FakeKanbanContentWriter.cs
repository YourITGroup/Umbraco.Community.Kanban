using Umbraco.Cms.Core.Models;
using Umbraco.Community.Kanban.Services;

namespace Umbraco.Community.Kanban.Tests.Fakes;

internal sealed class FakeKanbanContentWriter : IKanbanContentWriter
{
    /// <summary>Every write, so a test can assert the alias, value and culture that reached the writer.</summary>
    public List<(Guid Key, string LaneProperty, string LaneValue, string? Culture)> Writes { get; } = [];

    /// <summary>
    /// What the fake reports back. Set per test — the published/edited pair cannot be produced from an
    /// in-memory Content, which is exactly why the real writer returns it rather than the caller reading it.
    /// </summary>
    public KanbanCardSaveResult Result { get; set; } = new(true, false, false);

    public KanbanCardSaveResult SetLaneValue(IContent content, string laneProperty, string laneValue, string? culture)
    {
        Writes.Add((content.Key, laneProperty, laneValue, culture));

        // The real writer decides the property culture itself; the fake records what it was *given* so a
        // test asserts the service's own culture handling, not the writer's.
        return Result;
    }
}
