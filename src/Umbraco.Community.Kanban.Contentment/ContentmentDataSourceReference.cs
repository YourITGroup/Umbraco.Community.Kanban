namespace Umbraco.Community.Kanban.Contentment;

/// <summary>
/// The data source a Contentment Data List data type is configured with.
/// </summary>
/// <param name="Key">
/// Contentment's identifier for the data source implementation — its type name with assembly, e.g.
/// <c>Umbraco.Community.Contentment.DataEditors.EnumDataListSource, Umbraco.Community.Contentment</c>.
/// </param>
/// <param name="ValueJson">
/// That data source's own configuration, still as JSON. Kept as text rather than a dictionary because
/// deserialising it is Contentment's business, not ours: sources read their configuration through
/// Umbraco's own conversion, so the deserialisation has to happen the way Contentment does it.
/// <c>{}</c> when the source has no configuration.
/// </param>
public sealed record ContentmentDataSourceReference(string Key, string ValueJson);
