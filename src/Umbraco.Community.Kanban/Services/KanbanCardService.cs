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
    IContentPermissionAuthorizer permissionAuthorizer) : IKanbanCardService
{
    private static readonly ISet<string> UpdatePermission = new HashSet<string> { ActionUpdate.ActionLetter };

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

    private static KanbanCardLaneResult Failure(KanbanCardLaneStatus status) => new(status, null);

    private static KanbanCardLaneStatus ToLaneStatus(KanbanBoardConfigurationStatus status) => status switch
    {
        KanbanBoardConfigurationStatus.ConfigurationNotFound => KanbanCardLaneStatus.ConfigurationNotFound,
        _ => KanbanCardLaneStatus.NotConfigured,
    };
}
