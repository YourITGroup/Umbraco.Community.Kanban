using System.Diagnostics.CodeAnalysis;
using Umbraco.Cms.Core.IO;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.PropertyEditors;
using Umbraco.Cms.Core.Serialization;
using Umbraco.Cms.Core.Strings;
using Umbraco.Community.Kanban.Models;
using Umbraco.Community.Kanban.PropertyEditors;

namespace Umbraco.Community.Kanban.Tests.PropertyEditors;

public class KanbanCalendarPropertyEditorTests
{
    [Fact]
    public void Configuration_DefaultsToTheLastUpdatedDate()
    {
        var configuration = new KanbanCalendarConfiguration();

        configuration.DateProperty.Should().Be("updateDate");
        configuration.ShowAgenda.Should().BeTrue();
    }

    [Fact]
    public void DragIsUnsupported_WhenTheDateSourceIsLastUpdated()
    {
        var configuration = new KanbanCalendarConfiguration { AllowDrag = true };

        configuration.IsDragSupported.Should().BeFalse();
    }

    [Fact]
    public void DragIsSupported_ForARealDateProperty()
    {
        var configuration = new KanbanCalendarConfiguration { DateProperty = "eventDate", AllowDrag = true };

        configuration.IsDragSupported.Should().BeTrue();
    }

    [Fact]
    public void DragIsUnsupported_WhenTheEditorTurnedItOff()
    {
        var configuration = new KanbanCalendarConfiguration { DateProperty = "eventDate", AllowDrag = false };

        configuration.IsDragSupported.Should().BeFalse();
    }

    [Fact]
    public void DataEditorAttribute_UsesTheDocumentedAlias()
    {
        var attribute = typeof(KanbanCalendarPropertyEditor)
            .GetCustomAttributes(typeof(DataEditorAttribute), false)
            .Cast<DataEditorAttribute>()
            .Single();

        attribute.Alias.Should().Be(Constants.CalendarEditorAlias);
    }

    [Fact]
    public void ValueEditor_IsReadOnly()
    {
        var valueEditor = new KanbanBoardPropertyEditor.KanbanReadOnlyValueEditor(
            new FakeShortStringHelper(),
            new FakeJsonSerializer(),
            new FakeIOHelper(),
            new DataEditorAttribute(Constants.CalendarEditorAlias));

        valueEditor.IsReadOnly.Should().BeTrue();
    }

    [Fact]
    public void PropertyEditor_SupportsReadOnly()
    {
        var editor = new KanbanCalendarPropertyEditor(new FakeDataValueEditorFactory(), new FakeIOHelper());

        editor.SupportsReadOnly.Should().BeTrue();
    }

    /// <summary>
    /// A hand-written fake, duplicated from <see cref="KanbanBoardPropertyEditorTests"/> because that
    /// class's fakes are private to it. No members are exercised by the tests above; every member
    /// throws if called so a future test that starts depending on real behaviour fails loudly instead
    /// of silently passing.
    /// </summary>
    private sealed class FakeShortStringHelper : IShortStringHelper
    {
        public string CleanStringForSafeAlias(string text) => throw new NotSupportedException();

        public string CleanStringForSafeAlias(string text, string culture) => throw new NotSupportedException();

        public string CleanStringForUrlSegment(string text) => throw new NotSupportedException();

        public string CleanStringForUrlSegment(string text, string? culture) => throw new NotSupportedException();

        public string CleanStringForSafeFileName(string text) => throw new NotSupportedException();

        public string CleanStringForSafeFileName(string text, string culture) => throw new NotSupportedException();

        public string SplitPascalCasing(string text, char separator) => throw new NotSupportedException();

        public string CleanString(string text, CleanStringType stringType) => throw new NotSupportedException();

        public string CleanString(string text, CleanStringType stringType, char separator) =>
            throw new NotSupportedException();

        public string CleanString(string text, CleanStringType stringType, string culture) =>
            throw new NotSupportedException();

        public string CleanString(string text, CleanStringType stringType, char separator, string culture) =>
            throw new NotSupportedException();
    }

    /// <summary>
    /// A hand-written fake, duplicated from <see cref="KanbanBoardPropertyEditorTests"/>. No members
    /// are exercised by the tests above.
    /// </summary>
    private sealed class FakeJsonSerializer : IJsonSerializer
    {
        public string Serialize(object? input) => throw new NotSupportedException();

        public T? Deserialize<T>(string input) => throw new NotSupportedException();

        public bool TryDeserialize<T>(object input, [NotNullWhen(true)] out T? value)
            where T : class =>
            throw new NotSupportedException();
    }

    /// <summary>
    /// A hand-written fake, duplicated from <see cref="KanbanBoardPropertyEditorTests"/>. No members
    /// are exercised by the tests above.
    /// </summary>
    private sealed class FakeIOHelper : IIOHelper
    {
        public string FindFile(string virtualPath) => throw new NotSupportedException();

        public string ResolveUrl(string virtualPath) => throw new NotSupportedException();

        public string MapPath(string path) => throw new NotSupportedException();

        public bool VerifyEditPath(string filePath, string validDir) => throw new NotSupportedException();

        public bool VerifyEditPath(string filePath, IEnumerable<string> validDirs) =>
            throw new NotSupportedException();

        public bool VerifyFileExtension(string filePath, IEnumerable<string> validFileExtensions) =>
            throw new NotSupportedException();

        public bool PathStartsWith(string path, string root, params char[] separators) =>
            throw new NotSupportedException();

        public void EnsurePathExists(string path) => throw new NotSupportedException();

        public string GetRelativePath(string path) => throw new NotSupportedException();

        public DirectoryInfo[] GetTempFolders() => throw new NotSupportedException();

        public CleanFolderResult CleanFolder(DirectoryInfo folder, TimeSpan age) => throw new NotSupportedException();
    }

    /// <summary>
    /// A hand-written fake, duplicated from <see cref="KanbanBoardPropertyEditorTests"/>. Never
    /// invoked: the tests above only check that the property editor's constructor sets
    /// <see cref="DataEditor.SupportsReadOnly"/>, which requires no factory call.
    /// </summary>
    private sealed class FakeDataValueEditorFactory : IDataValueEditorFactory
    {
        public TDataValueEditor Create<TDataValueEditor>(params object[] args)
            where TDataValueEditor : class, IDataValueEditor =>
            throw new NotSupportedException();
    }
}
