using Umbraco.Cms.Core.Actions;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Models.Membership;
using Umbraco.Cms.Core.Security.Authorization;
using Umbraco.Community.Kanban.Lanes;
using Umbraco.Community.Kanban.Models;
using Umbraco.Community.Kanban.Models.Api;

namespace Umbraco.Community.Kanban.Services;

/// <inheritdoc />
public sealed class KanbanCalendarService(
    IKanbanContentLoader contentLoader,
    IKanbanCalendarConfigurationResolver configurationResolver,
    IKanbanLaneContentTypeResolver laneContentTypeResolver,
    IKanbanLaneResolver laneResolver,
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

        var undated = 0;
        var placed = new List<(KanbanCardDate Start, KanbanCardDate? End, IContent Content)>();

        foreach (IContent child in page.Children)
        {
            if (browseable.Contains(child.Key) == false)
            {
                continue;
            }

            KanbanCardDate? start = KanbanCardDateReader.Read(child, configuration.DateProperty, request.Culture);

            if (start is null)
            {
                undated++;
                continue;
            }

            if (start.Value.Date < request.From || start.Value.Date > request.To)
            {
                continue;
            }

            placed.Add((start.Value, ReadEnd(child, configuration, request.Culture, start.Value), child));
        }

        var truncatedByCap = placed.Count > Constants.DefaultCalendarCap;

        List<KanbanCalendarItemModel> items = placed
            .OrderBy(entry => entry.Start.Date)
            .ThenBy(entry => entry.Start.Time ?? TimeOnly.MinValue)
            .ThenBy(entry => entry.Content.Name, StringComparer.OrdinalIgnoreCase)
            .Take(Constants.DefaultCalendarCap)
            .Select(entry => new KanbanCalendarItemModel
            {
                Date = entry.Start.Date.ToString("yyyy-MM-dd"),
                Time = entry.Start.Time?.ToString("HH:mm"),
                EndDate = entry.End?.Date.ToString("yyyy-MM-dd"),
                EndTime = entry.End?.Time?.ToString("HH:mm"),
                Category = ReadCategory(entry.Content, configuration, request.Culture),
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
            Categories = await ResolveCategoriesAsync(parent, configuration),
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
    private async Task<IReadOnlyList<KanbanCategoryModel>> ResolveCategoriesAsync(
        IContent parent,
        KanbanCalendarConfiguration configuration)
    {
        if (string.IsNullOrWhiteSpace(configuration.CategoryProperty))
        {
            return [];
        }

        Guid contentTypeKey = await laneContentTypeResolver.ResolveAsync(
            parent.ContentType.Key,
            configuration.CategoryProperty);

        KanbanLaneResolution resolution = await laneResolver.ResolveAsync(contentTypeKey, new KanbanBoardConfiguration
        {
            LaneProperty = configuration.CategoryProperty,
            ManualLanes = configuration.CategoryManualValues,
            UseManualLanes = configuration.CategoryManualValues.Length > 0,
            LaneOverrides = configuration.CategoryOverrides,
        });

        return resolution.Lanes
            .Where(lane => lane.IsUnassigned == false)
            .Select(lane => new KanbanCategoryModel
            {
                Value = lane.Value,
                Name = lane.Name,
                Colour = lane.Colour,
                Icon = lane.Icon,
            })
            .ToList();
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
