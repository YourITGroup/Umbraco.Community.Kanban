using Umbraco.Community.Contentment.DataEditors;

namespace Umbraco.Community.Kanban.Contentment.Tests.Fakes;

/// <summary>
/// Returns canned items, so group source tests need neither Contentment's DI nor a mocking framework.
/// Records the reference it was asked for, which is how the tests assert the configuration reached it.
/// </summary>
public sealed class FakeContentmentDataListItems : IContentmentDataListItems
{
    private readonly IEnumerable<DataListItem> items;
    private readonly Exception? throws;

    public FakeContentmentDataListItems(params DataListItem[] items) => this.items = items;

    private FakeContentmentDataListItems(Exception throws)
    {
        this.items = [];
        this.throws = throws;
    }

    /// <summary>A data source that blows up — a SQL source with a bad connection string, say.</summary>
    public static FakeContentmentDataListItems Throwing(string message = "the data source failed") =>
        new(new InvalidOperationException(message));

    public ContentmentDataSourceReference? Requested { get; private set; }

    public IEnumerable<DataListItem> GetItems(ContentmentDataSourceReference reference)
    {
        Requested = reference;

        if (throws is not null)
        {
            throw throws;
        }

        return items;
    }
}
