using Umbraco.Cms.Core.Actions;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Models.Membership;
using Umbraco.Cms.Core.Security.Authorization;
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Services;

/// <inheritdoc />
public sealed class KanbanCardService(
    IKanbanContentLoader contentLoader,
    IKanbanContentWriter contentWriter,
    IKanbanBoardConfigurationResolver configurationResolver,
    IContentPermissionAuthorizer permissionAuthorizer,
    IKanbanPropertyValueReader propertyValueReader) : IKanbanCardService
{
    private static readonly ISet<string> UpdatePermission = new HashSet<string> { ActionUpdate.ActionLetter };
    private static readonly ISet<string> BrowsePermission = new HashSet<string> { ActionBrowse.ActionLetter };
    private static readonly ISet<string> CreatePermission = new HashSet<string> { ActionNew.ActionLetter };

    public async Task<KanbanCardLaneResult> SetLaneAsync(KanbanCardLaneRequest request, IUser user)
    {
        IContent? card = contentLoader.GetById(request.CardKey);

        if (card is null)
        {
            return Failure(KanbanCardLaneStatus.CardNotFound);
        }

        IContent? parent = contentLoader.GetById(card.ParentId);

        if (parent is null)
        {
            return Failure(KanbanCardLaneStatus.ParentNotFound);
        }

        // The same resolver GET /board uses, so a board and its writes can never disagree about which
        // configuration is in force.
        KanbanBoardConfigurationResult configuration = await configurationResolver.ResolveAsync(
            null,
            parent.ContentType.ListView);

        if (configuration.Status != KanbanBoardConfigurationStatus.Success || configuration.Configuration is null)
        {
            return Failure(ToLaneStatus(configuration.Status));
        }

        KanbanBoardConfiguration board = configuration.Configuration;

        if (board.AllowDrag == false)
        {
            return Failure(KanbanCardLaneStatus.DragNotAllowed);
        }

        if (string.IsNullOrWhiteSpace(board.LaneProperty))
        {
            return Failure(KanbanCardLaneStatus.NotConfigured);
        }

        // On the card itself, not the parent: this is the same permission CanUpdate on the card model
        // already reports, so a client respecting that flag never lands here — but the server does not
        // trust the client.
        if (await permissionAuthorizer.IsDeniedAsync(user, [card.Key], UpdatePermission))
        {
            return Failure(KanbanCardLaneStatus.AccessDenied);
        }

        KanbanCardSaveResult saved = contentWriter.SetLaneValue(
            card,
            board.LaneProperty,
            request.LaneValue,
            request.Culture);

        return saved.Saved
            ? new KanbanCardLaneResult(
                KanbanCardLaneStatus.Success,
                KanbanCardStateResolver.Resolve(saved.Published, saved.Edited))
            : Failure(KanbanCardLaneStatus.SaveFailed);
    }

    public async Task<KanbanCardResult> GetCardAsync(KanbanCardRequest request, IUser user)
    {
        IContent? parent = contentLoader.GetById(request.ParentId);

        if (parent is null)
        {
            return Missing(KanbanCardStatus.ParentNotFound);
        }

        if (await permissionAuthorizer.IsDeniedAsync(user, [parent.Key], BrowsePermission))
        {
            return Missing(KanbanCardStatus.ParentAccessDenied);
        }

        KanbanBoardConfigurationResult configuration = await configurationResolver.ResolveAsync(
            request.ConfigId,
            parent.ContentType.ListView);

        if (configuration.Status != KanbanBoardConfigurationStatus.Success || configuration.Configuration is null)
        {
            return Missing(ToCardStatus(configuration.Status));
        }

        KanbanBoardConfiguration board = configuration.Configuration;

        IContent? card = contentLoader.GetById(request.CardKey);

        if (card is null)
        {
            return Missing(KanbanCardStatus.CardNotFound);
        }

        // Trashed, moved elsewhere, and browse-denied all collapse to NotChild — see the enum's remarks.
        if (card.Trashed || card.ParentId != parent.Id)
        {
            return Missing(KanbanCardStatus.NotChild);
        }

        if (await permissionAuthorizer.IsDeniedAsync(user, [card.Key], BrowsePermission))
        {
            return Missing(KanbanCardStatus.NotChild);
        }

        var canUpdate = await permissionAuthorizer.IsDeniedAsync(user, [card.Key], UpdatePermission) == false;
        var canCreate = await permissionAuthorizer.IsDeniedAsync(user, [card.Key], CreatePermission) == false;

        KanbanCardChildren children = board.ShowChildItems
            ? await ComposeChildrenAsync(card, board, request.Culture, user)
            : KanbanCardChildren.None;

        return new KanbanCardResult(
            KanbanCardStatus.Success,
            KanbanLaneValueReader.Read(card, board.LaneProperty, request.Culture),
            KanbanCardMapper.Map(
                card,
                board.CardProperties,
                request.Culture,
                canUpdate,
                propertyValueReader,
                canCreate,
                children));
    }

    /// <summary>
    /// The card's children through the same query shape the board uses — its descendants one level
    /// down, in the configured child order — so a reconciled card lists children identically to a
    /// board-loaded one.
    /// </summary>
    private async Task<KanbanCardChildren> ComposeChildrenAsync(
        IContent card,
        KanbanBoardConfiguration board,
        string? culture,
        IUser user)
    {
        KanbanGrandchildPage page = contentLoader.GetGrandchildren(
            card.Id,
            card.Level + 1,
            Constants.DefaultGrandchildCap,
            KanbanChildOrdering.From(board.ChildItemsSortBy, board.ChildItemsSortDirection, culture));

        ISet<Guid> browseable = await permissionAuthorizer.FilterAuthorizedAsync(
            user,
            page.Grandchildren.Select(child => child.Key),
            BrowsePermission);

        IReadOnlyDictionary<int, KanbanCardChildren> byCard = KanbanCardChildAssembler.Assemble(
            page.Grandchildren,
            browseable,
            page.Capped,
            culture,
            Constants.CardChildDisplayCap);

        return byCard.GetValueOrDefault(card.Id) ?? KanbanCardChildren.None;
    }

    private static KanbanCardResult Missing(KanbanCardStatus status) => new(status, null, null);

    private static KanbanCardStatus ToCardStatus(KanbanBoardConfigurationStatus status) => status switch
    {
        KanbanBoardConfigurationStatus.ConfigurationNotFound => KanbanCardStatus.ConfigurationNotFound,
        _ => KanbanCardStatus.NotConfigured,
    };

    private static KanbanCardLaneResult Failure(KanbanCardLaneStatus status) => new(status, null);

    private static KanbanCardLaneStatus ToLaneStatus(KanbanBoardConfigurationStatus status) => status switch
    {
        KanbanBoardConfigurationStatus.ConfigurationNotFound => KanbanCardLaneStatus.ConfigurationNotFound,
        _ => KanbanCardLaneStatus.NotConfigured,
    };
}
