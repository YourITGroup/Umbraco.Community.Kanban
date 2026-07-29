using Umbraco.Cms.Core.Serialization;
using Umbraco.Cms.Infrastructure.Serialization;
using Umbraco.Community.Kanban.Models;
using Umbraco.Community.Kanban.PropertyEditors;
using Umbraco.Community.Kanban.Tests.Fakes;

namespace Umbraco.Community.Kanban.Tests.PropertyEditors;

/// <summary>
/// Exercises the real client-to-server configuration round trip: a configuration dictionary
/// shaped exactly the way the actual chosen property editor UIs produce it, deserialized
/// through the real <see cref="KanbanBoardConfigurationEditor"/> / <see cref="KanbanCalendarConfigurationEditor"/>
/// <c>ToConfigurationObject</c> - the same path Umbraco itself uses to hydrate
/// <see cref="Umbraco.Cms.Core.Models.IDataType.ConfigurationObject"/>.
/// </summary>
/// <remarks>
/// Both configs bind their "appliesTo" setting to <c>Umb.PropertyEditorUi.DocumentTypePicker</c>,
/// whose underlying <c>umb-input-document-type</c> element stores its value as a single
/// comma-separated string of keys, not a JSON array. Before the <c>GuidArrayJsonConverter</c>
/// fix, deserializing that shape into <c>Guid[]</c> threw, and these tests failed with a
/// <see cref="System.Text.Json.JsonException"/> wrapped in an <see cref="InvalidOperationException"/>.
/// </remarks>
public class KanbanConfigurationRoundTripTests
{
    private static readonly Guid FirstContentTypeKey = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid SecondContentTypeKey = Guid.Parse("22222222-2222-2222-2222-222222222222");

    private static readonly IConfigurationEditorJsonSerializer Serializer =
        new SystemTextConfigurationEditorJsonSerializer(new DefaultJsonSerializerEncoderFactory());

    [Fact]
    public void BoardEditor_DeserializesTheCommaSeparatedAppliesToShapeTheDocumentTypePickerProduces()
    {
        var editor = new KanbanBoardConfigurationEditor(new FakeIOHelper());

        IDictionary<string, object> clientConfiguration = new Dictionary<string, object>
        {
            ["laneProperty"] = "status",
            ["laneContentTypeKey"] = FirstContentTypeKey.ToString(),
            ["useManualLanes"] = false,
            ["manualLanes"] = Array.Empty<object>(),
            ["laneOverrides"] = Array.Empty<object>(),
            ["cardProperties"] = new object[] { "title" },
            ["lanePageSize"] = 25,
            ["allowDrag"] = true,
            ["appliesTo"] = $"{FirstContentTypeKey},{SecondContentTypeKey}",
            ["tabName"] = "Board",
            ["tabIcon"] = "icon-grid",
        };

        var configurationObject = editor.ToConfigurationObject(clientConfiguration, Serializer);

        var configuration = configurationObject.Should().BeOfType<KanbanBoardConfiguration>().Subject;
        configuration.AppliesTo.Should().Equal(FirstContentTypeKey, SecondContentTypeKey);
        configuration.LaneProperty.Should().Be("status");
        configuration.LaneContentTypeKey.Should().Be(FirstContentTypeKey);
        configuration.LanePageSize.Should().Be(25);
    }

    [Fact]
    public void BoardEditor_DeserializesTheToggleShapeForManualLanes()
    {
        var editor = new KanbanBoardConfigurationEditor(new FakeIOHelper());

        IDictionary<string, object> clientConfiguration = new Dictionary<string, object>
        {
            ["useManualLanes"] = true,
        };

        var configurationObject = editor.ToConfigurationObject(clientConfiguration, Serializer);

        var configuration = configurationObject.Should().BeOfType<KanbanBoardConfiguration>().Subject;
        configuration.UseManualLanes.Should().BeTrue();
        configuration.PinnedLaneSource.Should().Be("manual");
    }

    [Fact]
    public void BoardEditor_DeserializesTheLaneOrderTheSortableListWrites()
    {
        var editor = new KanbanBoardConfigurationEditor(new FakeIOHelper());

        IDictionary<string, object> clientConfiguration = new Dictionary<string, object>
        {
            ["laneOrder"] = new[] { "confirmed", "pending" },
        };

        var configurationObject = editor.ToConfigurationObject(clientConfiguration, Serializer);

        var configuration = configurationObject.Should().BeOfType<KanbanBoardConfiguration>().Subject;
        configuration.LaneOrder.Should().Equal("confirmed", "pending");
    }

    [Fact]
    public void BoardEditor_ReadsAnAbsentLaneOrderAsEmpty()
    {
        // Every board configured before laneOrder existed. It must read as "source order", not fail
        // the whole configuration object.
        var editor = new KanbanBoardConfigurationEditor(new FakeIOHelper());

        IDictionary<string, object> clientConfiguration = new Dictionary<string, object>
        {
            ["laneProperty"] = "status",
        };

        var configurationObject = editor.ToConfigurationObject(clientConfiguration, Serializer);

        var configuration = configurationObject.Should().BeOfType<KanbanBoardConfiguration>().Subject;
        configuration.LaneOrder.Should().BeEmpty();
    }

    [Fact]
    public void BoardEditor_TreatsAnEmptiedLaneContentTypePickerAsUnset()
    {
        // What the lane property picker stores when its selection is cleared. Without the
        // NullableGuidJsonConverter this threw and took the whole configuration with it, not just
        // the one field — so a cleared picker would break every setting on the board.
        var editor = new KanbanBoardConfigurationEditor(new FakeIOHelper());

        IDictionary<string, object> clientConfiguration = new Dictionary<string, object>
        {
            ["laneContentTypeKey"] = string.Empty,
            ["laneProperty"] = "status",
        };

        var configurationObject = editor.ToConfigurationObject(clientConfiguration, Serializer);

        var configuration = configurationObject.Should().BeOfType<KanbanBoardConfiguration>().Subject;
        configuration.LaneContentTypeKey.Should().BeNull();
        configuration.LaneProperty.Should().Be("status");
    }

    [Fact]
    public void CalendarEditor_DeserializesTheCommaSeparatedAppliesToShapeTheDocumentTypePickerProduces()
    {
        var editor = new KanbanCalendarConfigurationEditor(new FakeIOHelper());

        IDictionary<string, object> clientConfiguration = new Dictionary<string, object>
        {
            ["dateProperty"] = "eventDate",
            ["cardProperties"] = new object[] { "title" },
            ["showAgenda"] = true,
            ["allowDrag"] = true,
            ["appliesTo"] = $"{FirstContentTypeKey},{SecondContentTypeKey}",
            ["tabName"] = "Schedule",
            ["tabIcon"] = "icon-calendar",
        };

        var configurationObject = editor.ToConfigurationObject(clientConfiguration, Serializer);

        var configuration = configurationObject.Should().BeOfType<KanbanCalendarConfiguration>().Subject;
        configuration.AppliesTo.Should().Equal(FirstContentTypeKey, SecondContentTypeKey);
        configuration.DateProperty.Should().Be("eventDate");
    }

    [Fact]
    public void BoardEditor_DeserializesASingleAppliesToKey()
    {
        var editor = new KanbanBoardConfigurationEditor(new FakeIOHelper());

        IDictionary<string, object> clientConfiguration = new Dictionary<string, object>
        {
            ["appliesTo"] = FirstContentTypeKey.ToString(),
        };

        var configurationObject = editor.ToConfigurationObject(clientConfiguration, Serializer);

        var configuration = configurationObject.Should().BeOfType<KanbanBoardConfiguration>().Subject;
        configuration.AppliesTo.Should().Equal(FirstContentTypeKey);
    }

    [Fact]
    public void BoardEditor_DeserializesAnEmptyAppliesToString()
    {
        var editor = new KanbanBoardConfigurationEditor(new FakeIOHelper());

        IDictionary<string, object> clientConfiguration = new Dictionary<string, object>
        {
            ["appliesTo"] = string.Empty,
        };

        var configurationObject = editor.ToConfigurationObject(clientConfiguration, Serializer);

        var configuration = configurationObject.Should().BeOfType<KanbanBoardConfiguration>().Subject;
        configuration.AppliesTo.Should().BeEmpty();
    }

    [Fact]
    public void BoardEditor_StillDeserializesAJsonArrayShapeForAppliesTo()
    {
        // Not the shape the DocumentTypePicker produces, but the converter must remain
        // lenient to the canonical JSON array shape too (e.g. round-tripping a value this
        // package itself wrote via GuidArrayJsonConverter.Write).
        var editor = new KanbanBoardConfigurationEditor(new FakeIOHelper());

        IDictionary<string, object> clientConfiguration = new Dictionary<string, object>
        {
            ["appliesTo"] = new object[] { FirstContentTypeKey.ToString(), SecondContentTypeKey.ToString() },
        };

        var configurationObject = editor.ToConfigurationObject(clientConfiguration, Serializer);

        var configuration = configurationObject.Should().BeOfType<KanbanBoardConfiguration>().Subject;
        configuration.AppliesTo.Should().Equal(FirstContentTypeKey, SecondContentTypeKey);
    }
}
