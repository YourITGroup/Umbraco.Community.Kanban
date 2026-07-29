using Umbraco.Cms.Core.Models;

namespace Umbraco.Community.Kanban.Services;

/// <summary>
/// Reads a property's value in the shape the backoffice expects.
/// </summary>
/// <remarks>
/// A card property's value is rendered by <c>umb-value-summary-extension</c>, which picks a renderer by
/// property editor alias and hands it the value. Those renderers expect the **editor** value, not the
/// **stored** one, and for editors declaring <c>ValueTypes.Json</c> the two differ: the stored value is
/// a JSON string where the editor value is an object. <c>Umbraco.DateTimeWithTimeZone</c> is the case
/// that exposed this — its summary reads <c>value.date</c>, so a JSON string rendered as nothing at all.
///
/// Exists as a seam because the conversion needs <c>PropertyEditorCollection</c>, which would otherwise
/// make <see cref="KanbanCardMapper" /> untestable. Mirrors <c>IKanbanPropertyDataTypeLookup</c>, which
/// exists for the same reason.
/// </remarks>
public interface IKanbanPropertyValueReader
{
    object? ReadEditorValue(IProperty property, string? culture);
}
