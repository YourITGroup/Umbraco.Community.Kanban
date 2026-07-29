using Umbraco.Cms.Core.Models;

namespace Umbraco.Community.Kanban.Services;

/// <summary>
/// The document fields a card can show that are not content type properties.
/// </summary>
/// <remarks>
/// The same five, under the same aliases, that Umbraco's own List View column picker offers for
/// documents, so an editor moving between the two sees the same names.
/// </remarks>
public static class KanbanSystemProperty
{
    public const string CreateDate = "createDate";
    public const string UpdateDate = "updateDate";
    public const string Creator = "creator";
    public const string SortOrder = "sortOrder";
    public const string Published = "published";

    public static readonly IReadOnlyList<string> All =
    [
        CreateDate,
        UpdateDate,
        Creator,
        SortOrder,
        Published,
    ];

    public static bool IsSystemAlias(string alias) =>
        All.Contains(alias, StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// The value and a renderer for one system field, or null when the alias names none.
    /// </summary>
    /// <remarks>
    /// The editor alias is a **presentation choice**, not a claim about a data type: a system field has
    /// no data type at all. It is the alias of the editor whose client-side renderer suits the value,
    /// which is all the client uses it for when picking a summary renderer.
    /// </remarks>
    public static (object? Value, string EditorAlias)? Read(IContent content, string alias)
    {
        // Matched case-insensitively against the canonical aliases rather than by lowering the input:
        // the aliases are camelCase, so a lowered input would match none of them.
        if (Is(alias, CreateDate)) return (content.CreateDate, "Umbraco.DateTime");
        if (Is(alias, UpdateDate)) return (content.UpdateDate, "Umbraco.DateTime");
        if (Is(alias, Creator)) return (content.CreatorId, "Umbraco.Integer");
        if (Is(alias, SortOrder)) return (content.SortOrder, "Umbraco.Integer");
        if (Is(alias, Published)) return (content.Published, "Umbraco.TrueFalse");

        return null;
    }

    /// <summary>The label shown when the editor has not named the row themselves.</summary>
    public static string DefaultHeader(string alias)
    {
        if (Is(alias, CreateDate)) return "Created";
        if (Is(alias, UpdateDate)) return "Last edited";
        if (Is(alias, Creator)) return "Creator";
        if (Is(alias, SortOrder)) return "Sort order";
        if (Is(alias, Published)) return "Published";

        return alias;
    }

    private static bool Is(string alias, string canonical) =>
        string.Equals(alias, canonical, StringComparison.OrdinalIgnoreCase);
}
