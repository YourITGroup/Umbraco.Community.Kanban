using System.Text.Json;
using Umbraco.Community.Kanban.Models.Api;

namespace Umbraco.Community.Kanban.Tests.Models;

public class KanbanConfigurationKindSerialisationTests
{
    private static KanbanConfigurationResponseModel Model(KanbanConfigurationKind kind) => new()
    {
        Key = Guid.Parse("11111111-1111-1111-1111-111111111111"),
        Name = "Tasks by status",
        Kind = kind,
    };

    [Theory]
    [InlineData(KanbanConfigurationKind.Board, "Board")]
    [InlineData(KanbanConfigurationKind.Calendar, "Calendar")]
    public void Serialises_the_kind_as_a_string_so_the_client_can_match_on_it(
        KanbanConfigurationKind kind,
        string expected)
    {
        var json = JsonSerializer.Serialize(Model(kind));

        json.Should().Contain($"\"{expected}\"");
        json.Should().NotContain("\"kind\":0").And.NotContain("\"Kind\":0");
    }

    [Fact]
    public void Round_trips_the_kind()
    {
        var json = JsonSerializer.Serialize(Model(KanbanConfigurationKind.Calendar));

        JsonSerializer.Deserialize<KanbanConfigurationResponseModel>(json)!.Kind
            .Should().Be(KanbanConfigurationKind.Calendar);
    }
}
