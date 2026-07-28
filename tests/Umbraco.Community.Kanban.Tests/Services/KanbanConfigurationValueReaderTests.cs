using System.Text.Json;
using Umbraco.Community.Kanban.Services;

namespace Umbraco.Community.Kanban.Tests.Services;

public class KanbanConfigurationValueReaderTests
{
    private const string Key = "kanban.boardConfigId";
    private static readonly Guid Expected = Guid.Parse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");

    private static IDictionary<string, object> FromJson(string json) =>
        JsonSerializer.Deserialize<Dictionary<string, object>>(json)!;

    [Fact]
    public void Reads_a_guid_stored_as_json_which_is_how_a_saved_data_type_arrives()
    {
        IDictionary<string, object> data = FromJson($"{{\"{Key}\":\"{Expected}\"}}");

        KanbanConfigurationValueReader.ReadGuid(data, Key).Should().Be(Expected);
    }

    [Fact]
    public void Reads_a_guid_stored_as_a_plain_string()
    {
        var data = new Dictionary<string, object> { [Key] = Expected.ToString() };

        KanbanConfigurationValueReader.ReadGuid(data, Key).Should().Be(Expected);
    }

    [Fact]
    public void Reads_a_guid_stored_as_a_guid()
    {
        var data = new Dictionary<string, object> { [Key] = Expected };

        KanbanConfigurationValueReader.ReadGuid(data, Key).Should().Be(Expected);
    }

    [Fact]
    public void Returns_null_when_the_key_is_absent() =>
        KanbanConfigurationValueReader.ReadGuid(new Dictionary<string, object>(), Key)
            .Should().BeNull();

    [Fact]
    public void Returns_null_for_an_empty_string()
    {
        var data = new Dictionary<string, object> { [Key] = string.Empty };

        KanbanConfigurationValueReader.ReadGuid(data, Key).Should().BeNull();
    }

    [Fact]
    public void Returns_null_for_a_value_that_is_not_a_guid()
    {
        IDictionary<string, object> data = FromJson($"{{\"{Key}\":\"not-a-guid\"}}");

        KanbanConfigurationValueReader.ReadGuid(data, Key).Should().BeNull();
    }

    [Fact]
    public void Returns_null_for_a_json_value_of_the_wrong_kind()
    {
        IDictionary<string, object> data = FromJson($"{{\"{Key}\":42}}");

        KanbanConfigurationValueReader.ReadGuid(data, Key).Should().BeNull();
    }

    [Fact]
    public void Returns_null_for_an_empty_guid_because_it_names_nothing()
    {
        var data = new Dictionary<string, object> { [Key] = Guid.Empty };

        KanbanConfigurationValueReader.ReadGuid(data, Key).Should().BeNull();
    }
}
