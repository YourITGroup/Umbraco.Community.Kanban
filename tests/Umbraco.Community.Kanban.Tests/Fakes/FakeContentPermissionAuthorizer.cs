using Umbraco.Cms.Core.Models.Membership;
using Umbraco.Cms.Core.Security.Authorization;

namespace Umbraco.Community.Kanban.Tests.Fakes;

internal sealed class FakeContentPermissionAuthorizer : IContentPermissionAuthorizer
{
    /// <summary>Permission letter to the content keys the user holds it for. Absent letter means "all allowed".</summary>
    public Dictionary<string, HashSet<Guid>> Allowed { get; } = [];

    /// <summary>Every FilterAuthorizedAsync call, so a test can assert filtering was bulk, not per node.</summary>
    public List<(string Permission, int KeyCount)> FilterCalls { get; } = [];

    public Task<bool> IsDeniedAsync(IUser currentUser, IEnumerable<Guid> contentKeys, ISet<string> permissionsToCheck)
    {
        List<Guid> keys = contentKeys.ToList();

        return Task.FromResult(permissionsToCheck.Any(permission => keys.Any(key => Holds(permission, key) == false)));
    }

    public Task<ISet<Guid>> FilterAuthorizedAsync(IUser currentUser, IEnumerable<Guid> contentKeys, ISet<string> permissionsToCheck)
    {
        List<Guid> keys = contentKeys.ToList();

        foreach (var permission in permissionsToCheck)
        {
            FilterCalls.Add((permission, keys.Count));
        }

        return Task.FromResult<ISet<Guid>>(
            keys.Where(key => permissionsToCheck.All(permission => Holds(permission, key))).ToHashSet());
    }

    public Task<bool> IsDeniedWithDescendantsAsync(IUser currentUser, Guid parentKey, ISet<string> permissionsToCheck) =>
        throw new NotSupportedException();

    public Task<bool> IsDeniedAtRootLevelAsync(IUser currentUser, ISet<string> permissionsToCheck) =>
        throw new NotSupportedException();

    public Task<bool> IsDeniedAtRecycleBinLevelAsync(IUser currentUser, ISet<string> permissionsToCheck) =>
        throw new NotSupportedException();

    public Task<bool> IsDeniedForCultures(IUser currentUser, ISet<string> culturesToCheck) =>
        throw new NotSupportedException();

    private bool Holds(string permission, Guid key) =>
        Allowed.TryGetValue(permission, out HashSet<Guid>? keys) == false || keys.Contains(key);
}
