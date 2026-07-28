using Umbraco.Community.Kanban.Models;
using Umbraco.Community.Kanban.Models.Api;

namespace Umbraco.Community.Kanban.Tests.Models;

public class KanbanLanePreviewRequestModelTests
{
    private static readonly Guid Requested = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid Configured = Guid.Parse("22222222-2222-2222-2222-222222222222");

    [Fact]
    public void EffectiveContentTypeKey_UsesTheRequestedContentType()
    {
        var request = new KanbanLanePreviewRequestModel
        {
            ContentTypeKey = Requested,
            Configuration = new KanbanBoardConfiguration { LaneContentTypeKey = Configured },
        };

        request.EffectiveContentTypeKey.Should().Be(Requested);
    }

    [Fact]
    public void EffectiveContentTypeKey_FallsBackToTheConfiguredOne_ForCallersWithNoDocument()
    {
        // The data type workspace previewing its own configuration: it has no document, and
        // therefore no content type, other than the one the lane property was picked from.
        var request = new KanbanLanePreviewRequestModel
        {
            Configuration = new KanbanBoardConfiguration { LaneContentTypeKey = Configured },
        };

        request.EffectiveContentTypeKey.Should().Be(Configured);
    }

    [Fact]
    public void EffectiveContentTypeKey_IsEmptyWhenNeitherIsGiven()
    {
        var request = new KanbanLanePreviewRequestModel { Configuration = new KanbanBoardConfiguration() };

        request.EffectiveContentTypeKey.Should().Be(Guid.Empty);
    }
}
