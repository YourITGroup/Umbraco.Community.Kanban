using Umbraco.Cms.Core.Configuration.Models;
using Umbraco.Cms.Core.Models.Membership;

namespace Umbraco.Community.Kanban.Tests.Fakes;

/// <summary>
/// A minimal user for tests that need an <see cref="IUser" /> but never inspect it beyond its
/// key — the permission authorizer fake only threads it through, never reads it. Implementing
/// <see cref="IUser" /> by hand would mean stubbing all of <c>IMembershipUser</c> and
/// <c>IRememberBeingDirty</c> for no benefit, so this subclasses the real, constructable
/// <see cref="User" /> instead and pins its key.
/// </summary>
internal sealed class FakeUser : User
{
    public static readonly Guid FixedKey = Guid.Parse("99999999-9999-9999-9999-999999999999");

    public FakeUser()
        : base(new GlobalSettings())
    {
        Key = FixedKey;
    }
}
