using Umbraco.Cms.Core.IO;

namespace Umbraco.Community.Kanban.Tests.Fakes;

/// <summary>
/// A hand-written fake. No members are exercised by the tests that use it.
/// </summary>
internal sealed class FakeIOHelper : IIOHelper
{
    public string FindFile(string virtualPath) => throw new NotSupportedException();

    public string ResolveUrl(string virtualPath) => throw new NotSupportedException();

    public string MapPath(string path) => throw new NotSupportedException();

    public bool VerifyEditPath(string filePath, string validDir) => throw new NotSupportedException();

    public bool VerifyEditPath(string filePath, IEnumerable<string> validDirs) =>
        throw new NotSupportedException();

    public bool VerifyFileExtension(string filePath, IEnumerable<string> validFileExtensions) =>
        throw new NotSupportedException();

    public bool PathStartsWith(string path, string root, params char[] separators) =>
        throw new NotSupportedException();

    public void EnsurePathExists(string path) => throw new NotSupportedException();

    public string GetRelativePath(string path) => throw new NotSupportedException();

    public DirectoryInfo[] GetTempFolders() => throw new NotSupportedException();

    public CleanFolderResult CleanFolder(DirectoryInfo folder, TimeSpan age) => throw new NotSupportedException();
}
