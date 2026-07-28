using System.Diagnostics.CodeAnalysis;
using Umbraco.Cms.Core.Serialization;

namespace Umbraco.Community.Kanban.Tests.Fakes;

/// <summary>
/// A hand-written fake. No members are exercised by the tests that use it.
/// </summary>
internal sealed class FakeJsonSerializer : IJsonSerializer
{
    public string Serialize(object? input) => throw new NotSupportedException();

    public T? Deserialize<T>(string input) => throw new NotSupportedException();

    public bool TryDeserialize<T>(object input, [NotNullWhen(true)] out T? value)
        where T : class =>
        throw new NotSupportedException();
}
