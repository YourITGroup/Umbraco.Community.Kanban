# Umbraco.Community.Kanban.Contentment

Resolves [Umbraco.Community.Kanban](https://github.com/YourITGroup/Umbraco.Community.Kanban) lanes from
a [Contentment](https://github.com/leekelleher/umbraco-contentment) Data List property.

Install it alongside the Kanban package; no configuration or startup code is needed. A board whose lane
property is a Contentment Data List then gets one lane per item the data source produces, named and
iconed as Contentment names them. Items marked disabled appear as lanes but refuse drops.

Any Data List data source works, including custom ones — resolution goes through Contentment's
`IContentmentDataSource` rather than a list of known source types.

## Limitations

- **Data sources that depend on the current node return no lanes.** Contentment's own editor endpoint
  sets a content context before asking a source for its items; lane resolution has no such context, and
  none at all in the data type editor. This affects sources resolving relative to the content being
  edited, such as *Umbraco Content Property Value* and the XPath source. Bounded sources — .NET
  Enumeration, User-defined, JSON, SQL, Text Delimited, Countries, Currencies — are unaffected.
- **Data Picker is not supported**, only Data List. Its sources are built around search and paging
  rather than a bounded set of options, which is not what a lane needs.
- **Lane colour does not come from the data source.** Contentment items carry no colour, so lanes take
  their colour from a lane override or the palette cycle.

## Versions

Requires Contentment 7 (`[7.0.1, 8.0.0)`). Contentment 8 removes `IDataListSource` and may move more.
