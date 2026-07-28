using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.PropertyEditors;

namespace Umbraco.Community.Kanban.Tests.Fakes;

/// <summary>
/// A hand-written fake. Never invoked by the tests that use it: they only check that a property
/// editor's constructor sets <see cref="DataEditor.SupportsReadOnly"/>, which requires no factory call.
/// </summary>
internal sealed class FakeDataValueEditorFactory : IDataValueEditorFactory
{
    public TDataValueEditor Create<TDataValueEditor>(params object[] args)
        where TDataValueEditor : class, IDataValueEditor =>
        throw new NotSupportedException();
}
