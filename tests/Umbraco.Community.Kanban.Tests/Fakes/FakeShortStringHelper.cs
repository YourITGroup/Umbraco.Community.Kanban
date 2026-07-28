using Umbraco.Cms.Core.Strings;

namespace Umbraco.Community.Kanban.Tests.Fakes;

/// <summary>
/// A hand-written fake. Every member throws if called, so a future test that starts depending
/// on real behaviour fails loudly instead of silently passing — except
/// <see cref="CleanString(string, CleanStringType)" />, which <c>ContentTypeBase.Alias</c>'s
/// setter calls internally (via <c>ToCleanString</c>) on every assignment. Tests that assign
/// aliases already pass clean, code-safe values, so this returns the text unchanged rather than
/// reimplementing Umbraco's alias-cleaning rules.
/// </summary>
internal sealed class FakeShortStringHelper : IShortStringHelper
{
    public string CleanStringForSafeAlias(string text) => throw new NotSupportedException();

    public string CleanStringForSafeAlias(string text, string culture) => throw new NotSupportedException();

    public string CleanStringForUrlSegment(string text) => throw new NotSupportedException();

    public string CleanStringForUrlSegment(string text, string? culture) => throw new NotSupportedException();

    public string CleanStringForSafeFileName(string text) => throw new NotSupportedException();

    public string CleanStringForSafeFileName(string text, string culture) => throw new NotSupportedException();

    public string SplitPascalCasing(string text, char separator) => throw new NotSupportedException();

    public string CleanString(string text, CleanStringType stringType) => text;

    public string CleanString(string text, CleanStringType stringType, char separator) =>
        throw new NotSupportedException();

    public string CleanString(string text, CleanStringType stringType, string culture) =>
        throw new NotSupportedException();

    public string CleanString(string text, CleanStringType stringType, char separator, string culture) =>
        throw new NotSupportedException();
}
