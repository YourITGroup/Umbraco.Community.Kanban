using Umbraco.Cms.Core.Actions;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Models.Membership;
using Umbraco.Cms.Core.Security.Authorization;
using Umbraco.Community.Kanban.Grouping;
using Umbraco.Community.Kanban.Models;
using Umbraco.Community.Kanban.Models.Api;

namespace Umbraco.Community.Kanban.Services;

/// <inheritdoc />
public sealed class KanbanBoardService(
    IKanbanContentLoader contentLoader,
    IKanbanBoardConfigurationResolver configurationResolver,
    IKanbanLaneContentTypeResolver laneContentTypeResolver,
    IKanbanGroupResolver laneResolver,
    IContentPermissionAuthorizer permissionAuthorizer,
    IKanbanPropertyValueReader propertyValueReader) : IKanbanBoardService
{
    private static readonly ISet<string> BrowsePermission = new HashSet<string> { ActionBrowse.ActionLetter };
    private static readonly ISet<string> UpdatePermission = new HashSet<string> { ActionUpdate.ActionLetter };
    private static readonly ISet<string> CreatePermission = new HashSet<string> { ActionNew.ActionLetter };

    public async Task<KanbanBoardResult> GetBoardAsync(KanbanBoardRequest request, IUser user)
    {
        IContent? parent = contentLoader.GetById(request.ParentId);

        if (parent is null)
        {
            return new KanbanBoardResult(KanbanBoardStatus.ParentNotFound, null);
        }

        if (await permissionAuthorizer.IsDeniedAsync(user, [parent.Key], BrowsePermission))
        {
            return new KanbanBoardResult(KanbanBoardStatus.ParentAccessDenied, null);
        }

        KanbanBoardConfigurationResult configuration = await configurationResolver.ResolveAsync(
            request.ConfigId,
            parent.ContentType.ListView);

        if (configuration.Status != KanbanBoardConfigurationStatus.Success || configuration.Configuration is null)
        {
            return new KanbanBoardResult(ToBoardStatus(configuration.Status), null);
        }

        return new KanbanBoardResult(
            KanbanBoardStatus.Success,
            await ComposeAsync(request, parent, configuration.Configuration, user));
    }

    private static KanbanBoardStatus ToBoardStatus(KanbanBoardConfigurationStatus status) => status switch
    {
        KanbanBoardConfigurationStatus.ConfigurationNotFound => KanbanBoardStatus.ConfigurationNotFound,
        _ => KanbanBoardStatus.NotConfigured,
    };

    private async Task<KanbanBoardResponseModel> ComposeAsync(
        KanbanBoardRequest request,
        IContent parent,
        KanbanBoardConfiguration configuration,
        IUser user)
    {
        Guid laneContentTypeKey = await laneContentTypeResolver.ResolveAsync(
            parent.ContentType.Key,
            configuration.LaneProperty);

        KanbanGroupResolution lanes = await laneResolver.ResolveAsync(laneContentTypeKey, configuration);

        KanbanChildPage page = contentLoader.GetChildren(parent.Id, Constants.DefaultChildCap);
        List<Guid> keys = page.Children.Select(child => child.Key).ToList();

        // Children of the cards, for the per-card child list. Skipped entirely when the board does not
        // show them, so a board that lists no children pays for neither the query nor the payload.
        KanbanGrandchildPage grandchildren = configuration.ShowChildItems
            ? contentLoader.GetGrandchildren(
                parent.Id,
                parent.Level + 2,
                Constants.DefaultGrandchildCap,
                KanbanChildOrdering.From(
                    configuration.ChildItemsSortBy,
                    configuration.ChildItemsSortDirection,
                    request.Culture))
            : new KanbanGrandchildPage([], false);

        // One bulk call per permission, never one per node — a board may hold a thousand children.
        // Browse covers cards and their children together rather than in two round trips.
        ISet<Guid> browseable = await permissionAuthorizer.FilterAuthorizedAsync(
            user,
            [.. keys, .. grandchildren.Grandchildren.Select(grandchild => grandchild.Key)],
            BrowsePermission);
        ISet<Guid> updatable = await permissionAuthorizer.FilterAuthorizedAsync(user, keys, UpdatePermission);
        ISet<Guid> creatable = await permissionAuthorizer.FilterAuthorizedAsync(user, keys, CreatePermission);

        IReadOnlyDictionary<int, KanbanCardChildren> childrenByCard = KanbanCardChildAssembler.Assemble(
            grandchildren.Grandchildren,
            browseable,
            grandchildren.Capped,
            request.Culture,
            Constants.CardChildDisplayCap);

        List<KanbanCardAssignment> assignments = page.Children
            .Where(child => browseable.Contains(child.Key))
            .Select(child => new KanbanCardAssignment(
                KanbanLaneValueReader.Read(child, configuration.LaneProperty, request.Culture),
                KanbanCardMapper.Map(
                    child,
                    configuration.CardProperties,
                    request.Culture,
                    updatable.Contains(child.Key),
                    propertyValueReader,
                    creatable.Contains(child.Key),
                    childrenByCard.GetValueOrDefault(child.Id) ?? KanbanCardChildren.None)))
            .ToList();

        var truncated = page.TotalChildCount > page.Children.Count;
        var pageSize = Math.Max(1, request.Take ?? configuration.LanePageSize);

        return KanbanBoardComposer.Compose(new KanbanBoardComposerRequest(
            lanes.Groups,
            assignments,
            page.TotalChildCount,
            truncated,
            pageSize,
            request.Lane,
            request.Skip ?? 0,
            configuration.ShowChildItems,
            configuration.AllowDrag,
            lanes.LanePropertyIsMandatory));
    }
}
