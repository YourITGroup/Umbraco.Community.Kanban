using System.Text.Json.Nodes;
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Lanes.Sources;

/// <summary>
/// Resolves lanes from the core list editors, all of which store their options
/// under the <c>items</c> configuration key.
/// </summary>
public sealed class CoreListEditorLaneSource : IKanbanLaneSource
{
    private static readonly HashSet<string> SupportedEditorAliases = new(StringComparer.OrdinalIgnoreCase)
    {
        "Umbraco.DropDown.Flexible",
        "Umbraco.RadioButtonList",
        "Umbraco.CheckBoxList",
    };

    public string Alias => "core-list-editor";

    public bool CanHandle(KanbanLaneSourceContext context) =>
        SupportedEditorAliases.Contains(context.EditorAlias);

    public Task<IReadOnlyList<KanbanLane>> GetLanesAsync(KanbanLaneSourceContext context)
    {
        IReadOnlyList<KanbanLane> lanes = ReadItems(context.ConfigurationData)
            .Where(item => string.IsNullOrWhiteSpace(item) == false)
            .Select(item => new KanbanLane { Value = item, Name = item })
            .ToList();

        return Task.FromResult(lanes);
    }

    private static IEnumerable<string> ReadItems(IDictionary<string, object> configuration)
    {
        if (configuration.TryGetValue("items", out var value) == false || value is null)
        {
            return [];
        }

        return value switch
        {
            IEnumerable<string> strings => strings,
            JsonArray array => array.Select(node => node?.GetValue<string>() ?? string.Empty),
            System.Collections.IEnumerable enumerable => enumerable
                .Cast<object?>()
                .Select(item => item?.ToString() ?? string.Empty),
            _ => [],
        };
    }
}
