using Umbraco.Cms.Core.Models;
using Umbraco.Community.Kanban.Services;

namespace Umbraco.Community.Kanban.Tests.Fakes;

/// <summary>
/// Stands in for the real converter, so card mapping tests need no property editor collection.
/// </summary>
/// <remarks>
/// Defaults to the stored value, which is what the real reader falls back to for an editor that stores
/// its value as-is. <see cref="Returning" /> stands in for an editor whose editor value differs from its
/// stored one — a JSON-stored date, say.
/// </remarks>
public sealed class FakePropertyValueReader : IKanbanPropertyValueReader
{
    private readonly Dictionary<string, object?> converted = new(StringComparer.OrdinalIgnoreCase);

    public static FakePropertyValueReader Stored() => new();

    /// <summary>Makes one property's editor value differ from what it stores.</summary>
    public FakePropertyValueReader Returning(string propertyAlias, object? editorValue)
    {
        converted[propertyAlias] = editorValue;
        return this;
    }

    public string? RequestedCulture { get; private set; }

    public object? ReadEditorValue(IProperty property, string? culture)
    {
        RequestedCulture = culture;

        return converted.TryGetValue(property.PropertyType.Alias, out var editorValue)
            ? editorValue
            : property.GetValue(culture);
    }
}
