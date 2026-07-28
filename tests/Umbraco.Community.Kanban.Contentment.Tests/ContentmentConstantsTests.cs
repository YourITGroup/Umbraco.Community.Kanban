using System.Reflection;
using Umbraco.Community.Contentment.DataEditors;

namespace Umbraco.Community.Kanban.Contentment.Tests;

public class ContentmentConstantsTests
{
    [Fact]
    public void DataListEditorAlias_MatchesContentmentsOwnConstant()
    {
        // Contentment declares this alias on an internal const, so ours is hardcoded. Reflecting
        // theirs is what makes that safe: a rename in a Contentment upgrade fails here, instead of
        // silently producing boards with no lanes. DataListValueConverter is only an anchor — a
        // public type in the same assembly.
        Type? editor = typeof(DataListValueConverter).Assembly
            .GetType("Umbraco.Community.Contentment.DataEditors.DataListDataEditor");

        editor.Should().NotBeNull("Contentment no longer declares DataListDataEditor");

        FieldInfo? field = editor!.GetField("DataEditorAlias", BindingFlags.NonPublic | BindingFlags.Static);

        field.Should().NotBeNull("Contentment no longer declares DataListDataEditor.DataEditorAlias");
        field!.GetRawConstantValue().Should().Be(ContentmentConstants.DataListEditorAlias);
    }
}
