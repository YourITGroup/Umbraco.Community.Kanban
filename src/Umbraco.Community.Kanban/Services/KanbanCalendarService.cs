using System.Globalization;
using Umbraco.Cms.Core.Actions;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Models.Membership;
using Umbraco.Cms.Core.Security.Authorization;
using Umbraco.Community.Kanban.Grouping;
using Umbraco.Community.Kanban.Models;
using Umbraco.Community.Kanban.Models.Api;

namespace Umbraco.Community.Kanban.Services;

/// <summary>
/// The resolved categories, split into what the calendar shows and which values it must drop items for.
/// </summary>
/// <param name="Visible">The categories to send, hidden ones already removed.</param>
/// <param name="Hidden">The values of hidden categories, compared case-insensitively.</param>
internal sealed record KanbanCategoryResolution(
    IReadOnlyList<KanbanCategoryModel> Visible,
    IReadOnlySet<string> Hidden)
{
    public static KanbanCategoryResolution None { get; } =
        new([], new HashSet<string>(StringComparer.OrdinalIgnoreCase));
}

/// <inheritdoc />
public sealed class KanbanCalendarService(
    IKanbanContentLoader contentLoader,
    IKanbanCalendarConfigurationResolver configurationResolver,
    IKanbanLaneContentTypeResolver laneContentTypeResolver,
    IKanbanGroupResolver laneResolver,
    IContentPermissionAuthorizer permissionAuthorizer,
    IKanbanPropertyValueReader propertyValueReader) : IKanbanCalendarService
{
    private static readonly ISet<string> BrowsePermission = new HashSet<string> { ActionBrowse.ActionLetter };

    public async Task<KanbanCalendarResult> GetCalendarAsync(KanbanCalendarRequest request, IUser user)
    {
        IContent? parent = contentLoader.GetById(request.ParentId);

        if (parent is null)
        {
            return new KanbanCalendarResult(KanbanBoardStatus.ParentNotFound, null);
        }

        if (await permissionAuthorizer.IsDeniedAsync(user, [parent.Key], BrowsePermission))
        {
            return new KanbanCalendarResult(KanbanBoardStatus.ParentAccessDenied, null);
        }

        KanbanCalendarConfigurationResult configuration = await configurationResolver.ResolveAsync(
            request.ConfigId,
            parent.ContentType.ListView);

        if (configuration.Status != KanbanBoardConfigurationStatus.Success || configuration.Configuration is null)
        {
            return new KanbanCalendarResult(ToStatus(configuration.Status), null);
        }

        return new KanbanCalendarResult(
            KanbanBoardStatus.Success,
            await ComposeAsync(request, parent, configuration.Configuration, user));
    }

    private static KanbanBoardStatus ToStatus(KanbanBoardConfigurationStatus status) => status switch
    {
        KanbanBoardConfigurationStatus.ConfigurationNotFound => KanbanBoardStatus.ConfigurationNotFound,
        _ => KanbanBoardStatus.NotConfigured,
    };

    private async Task<KanbanCalendarResponseModel> ComposeAsync(
        KanbanCalendarRequest request,
        IContent parent,
        KanbanCalendarConfiguration configuration,
        IUser user)
    {
        KanbanChildPage page = contentLoader.GetChildren(parent.Id, Constants.DefaultChildCap);

        // One bulk permission call, never one per node — the same rule the board documents.
        ISet<Guid> browseable = await permissionAuthorizer.FilterAuthorizedAsync(
            user,
            page.Children.Select(child => child.Key).ToList(),
            BrowsePermission);

        // Resolved before the items, because a hidden category takes the items carrying it with it and
        // that has to be decided before the cap counts what is shown.
        KanbanCategoryResolution categories = await ResolveCategoriesAsync(parent, configuration);

        var undated = 0;
        var placed = new List<(KanbanCardDate Start, KanbanCardDate? End, string? Category, IContent Content)>();

        foreach (IContent child in page.Children)
        {
            if (browseable.Contains(child.Key) == false)
            {
                continue;
            }

            var category = ReadCategory(child, configuration, request.Culture);

            // An uncategorised item is never hidden: there is no category to have hidden.
            if (category is not null && categories.Hidden.Contains(category))
            {
                continue;
            }

            KanbanCardDate? start = KanbanCardDateReader.Read(child, configuration.DateProperty, request.Culture);

            if (start is null)
            {
                undated++;
                continue;
            }

            // A day of slack either side: a zone-bearing value is filtered here by its stored wall
            // clock, but the client places it in the viewer's zone, which can move it across a
            // boundary. The client drops whatever still falls outside the window it asked for.
            if (start.Value.Date < request.From.AddDays(-1) || start.Value.Date > request.To.AddDays(1))
            {
                continue;
            }

            placed.Add((start.Value, ReadEnd(child, configuration, request.Culture, start.Value), category, child));
        }

        var truncatedByCap = placed.Count > Constants.DefaultCalendarCap;

        List<KanbanCalendarItemModel> items = placed
            .OrderBy(entry => entry.Start.Date)
            .ThenBy(entry => entry.Start.Time ?? TimeOnly.MinValue)
            .ThenBy(entry => entry.Content.Name, StringComparer.OrdinalIgnoreCase)
            .Take(Constants.DefaultCalendarCap)
            .Select(entry => new KanbanCalendarItemModel
            {
                Date = entry.Start.Date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                Time = entry.Start.Time?.ToString("HH:mm", CultureInfo.InvariantCulture),
                EndDate = entry.End?.Date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                EndTime = entry.End?.Time?.ToString("HH:mm", CultureInfo.InvariantCulture),
                Instant = entry.Start.Instant?.ToString("O", CultureInfo.InvariantCulture),
                EndInstant = entry.End?.Instant?.ToString("O", CultureInfo.InvariantCulture),
                Category = entry.Category,
                Card = KanbanCardMapper.Map(
                    entry.Content,
                    configuration.CardProperties,
                    request.Culture,
                    canUpdate: false,
                    propertyValueReader),
            })
            .ToList();

        return new KanbanCalendarResponseModel
        {
            Items = items,
            Categories = categories.Visible,
            DatePropertyEditorAlias = ResolveEditorAlias(page.Children, configuration.DateProperty),
            DatePropertyAlias = configuration.DateProperty,
            ParentContentTypeKey = parent.ContentType.Key,
            ShowAgenda = configuration.ShowAgenda,
            UndatedCount = undated,
            Truncated = truncatedByCap || page.TotalChildCount > page.Children.Count,
        };
    }

    /// <summary>An end is carried only when it parses and does not precede its start.</summary>
    private static KanbanCardDate? ReadEnd(
        IContent child,
        KanbanCalendarConfiguration configuration,
        string? culture,
        KanbanCardDate start)
    {
        if (string.IsNullOrWhiteSpace(configuration.EndDateProperty))
        {
            return null;
        }

        KanbanCardDate? end = KanbanCardDateReader.Read(child, configuration.EndDateProperty, culture);

        if (end is null)
        {
            return null;
        }

        DateTime startPoint = start.Date.ToDateTime(start.Time ?? TimeOnly.MinValue);
        DateTime endPoint = end.Value.Date.ToDateTime(end.Value.Time ?? TimeOnly.MinValue);

        return endPoint < startPoint ? null : end;
    }

    private static string? ReadCategory(IContent child, KanbanCalendarConfiguration configuration, string? culture)
    {
        if (string.IsNullOrWhiteSpace(configuration.CategoryProperty))
        {
            return null;
        }

        var value = KanbanLaneValueReader.Read(child, configuration.CategoryProperty, culture);

        return value.Length == 0 ? null : value;
    }

    /// <summary>
    /// Categories resolve through the exact pipeline lanes do — source from the property's editor,
    /// manual values as fallback, overrides on top — by adapting the calendar's category settings
    /// into the board-configuration shape the lane resolver takes. The synthetic unassigned lane is
    /// dropped: an uncategorised card is simply unaccented, not bucketed.
    /// </summary>
    private async Task<KanbanCategoryResolution> ResolveCategoriesAsync(
        IContent parent,
        KanbanCalendarConfiguration configuration)
    {
        if (string.IsNullOrWhiteSpace(configuration.CategoryProperty))
        {
            return KanbanCategoryResolution.None;
        }

        Guid contentTypeKey = await laneContentTypeResolver.ResolveAsync(
            parent.ContentType.Key,
            configuration.CategoryProperty);

        KanbanGroupResolution resolution = await laneResolver.ResolveAsync(contentTypeKey, new KanbanBoardConfiguration
        {
            LaneProperty = configuration.CategoryProperty,
            ManualLanes = configuration.CategoryManualValues,
            UseManualLanes = configuration.CategoryManualValues.Length > 0,
            LaneOverrides = configuration.CategoryOverrides,
        });

        List<KanbanGroup> categories = resolution.Groups.Where(lane => lane.IsUnassigned == false).ToList();

        return new KanbanCategoryResolution(
            categories
                .Where(category => category.Hidden == false)
                .Select(category => new KanbanCategoryModel
                {
                    Value = category.Value,
                    Name = category.Name,
                    Colour = category.Colour,
                    Icon = category.Icon,
                })
                .ToList(),
            // Case-insensitive, matching how every other comparison against a stored group value is made.
            categories
                .Where(category => category.Hidden)
                .Select(category => category.Value)
                .ToHashSet(StringComparer.OrdinalIgnoreCase));
    }

    /// <summary>
    /// The date property's editor schema alias, read off the first child carrying the property.
    /// Null for system properties — they cannot be preset, and the client treats null exactly so.
    /// </summary>
    private static string? ResolveEditorAlias(IReadOnlyList<IContent> children, string dateProperty)
    {
        if (string.Equals(dateProperty, KanbanCalendarConfiguration.UpdateDateAlias, StringComparison.OrdinalIgnoreCase)
            || string.Equals(dateProperty, "createDate", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        foreach (IContent child in children)
        {
            if (child.Properties.TryGetValue(dateProperty, out IProperty? property))
            {
                return property.PropertyType.PropertyEditorAlias;
            }
        }

        return null;
    }
}
