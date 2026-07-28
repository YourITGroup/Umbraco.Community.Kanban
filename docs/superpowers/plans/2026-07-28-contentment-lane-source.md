# Contentment Data List Lane Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A board whose lane property is a Contentment Data List gets one lane per item that data source produces, by installing a new package.

**Architecture:** A new class library, `Umbraco.Community.Kanban.Contentment`, contributing one `IKanbanLaneSource` to the core package's existing lane source collection. The work splits three ways because Contentment's `ConfigurationEditorUtility` is `public sealed` with no interface and cannot be faked: a pure configuration parser, a one-method seam over Contentment, and the lane source that composes them. Nothing in the core package changes.

**Tech Stack:** .NET 10, Umbraco CMS 18, Umbraco.Community.Contentment 7, xUnit, FluentAssertions.

**Design:** [2026-07-28-contentment-lane-source-design.md](../specs/2026-07-28-contentment-lane-source-design.md)

## Global Constraints

- Target framework, nullable and implicit usings come from the repo's `Directory.Build.props` — new csproj files must **not** restate `TargetFramework`.
- Central package management is on: every `PackageReference` is **version-less**, and versions live in `Directory.Packages.props`.
- `Umbraco.Community.Contentment` is pinned `[7.0.1, 8.0.0)`. Contentment 8 removes `IDataListSource`; the upper bound is deliberate.
- C# style, per `CLAUDE.md`: file-scoped namespaces, primary constructors where possible, **no underscore prefix on private fields**.
- Test style, matching `tests/Umbraco.Community.Kanban.Tests`: xUnit + FluentAssertions, `global using FluentAssertions; global using Xunit;` in `GlobalUsings.cs`, hand-written fakes rather than a mocking framework.
- **No changes to the core `Umbraco.Community.Kanban` project.** If a task appears to need one, stop and report — the design is wrong.
- The alias `Umbraco.Community.Contentment.DataList` is hardcoded because Contentment's constants are `internal`. Task 1's guard test is what makes that safe; do not delete it.
- **Do not run `git` commands in `/Users/gandalf/Source/Repos/your-it-team-cloud`.** Task 4 edits two files there; leave them uncommitted for the user.

---

### Task 1: Projects, constants, and the alias guard test

Scaffolds both projects and lands the one test that protects the hardcoded alias. Nothing else can be written until the projects exist, and the guard test is what makes the hardcoded alias defensible, so they ship together.

**Files:**
- Create: `src/Umbraco.Community.Kanban.Contentment/Umbraco.Community.Kanban.Contentment.csproj`
- Create: `src/Umbraco.Community.Kanban.Contentment/ContentmentConstants.cs`
- Create: `tests/Umbraco.Community.Kanban.Contentment.Tests/Umbraco.Community.Kanban.Contentment.Tests.csproj`
- Create: `tests/Umbraco.Community.Kanban.Contentment.Tests/GlobalUsings.cs`
- Test: `tests/Umbraco.Community.Kanban.Contentment.Tests/ContentmentConstantsTests.cs`
- Modify: `Directory.Packages.props` (add the Contentment version)
- Modify: `Umbraco.Community.Kanban.slnx` (add both projects)

**Interfaces:**
- Consumes: nothing.
- Produces: `Umbraco.Community.Kanban.Contentment.ContentmentConstants` with `public const string DataListEditorAlias` and `public const string LaneSourceAlias`.

- [ ] **Step 1: Add the Contentment package version**

In `Directory.Packages.props`, add to the first `ItemGroup` (the Umbraco one), after the two existing entries:

```xml
    <PackageVersion Include="Umbraco.Community.Contentment" Version="[7.0.1, 8.0.0)" />
```

The range is the supported-version pin; with central package management it belongs here, not on the reference. NuGet resolves the lowest version in the range (7.0.1), which is what a library should compile against.

- [ ] **Step 2: Create the library project**

`src/Umbraco.Community.Kanban.Contentment/Umbraco.Community.Kanban.Contentment.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <PackageId>Umbraco.Community.Kanban.Contentment</PackageId>
    <Product>Umbraco.Community.Kanban.Contentment</Product>
    <Title>Umbraco.Community.Kanban.Contentment</Title>
    <Description>Resolves Kanban lanes from Contentment Data List properties.</Description>
    <PackageTags>umbraco plugin package umbraco-marketplace kanban board contentment datalist</PackageTags>
    <RootNamespace>Umbraco.Community.Kanban.Contentment</RootNamespace>
    <Authors>Your IT Group</Authors>
    <PackageProjectUrl>https://github.com/YourITGroup/Umbraco.Community.Kanban</PackageProjectUrl>
    <RepositoryUrl>https://github.com/YourITGroup/Umbraco.Community.Kanban</RepositoryUrl>
    <RepositoryType>git</RepositoryType>
    <PackageLicenseExpression>MIT</PackageLicenseExpression>
    <IncludeSymbols>true</IncludeSymbols>
    <SymbolPackageFormat>snupkg</SymbolPackageFormat>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Umbraco.Community.Contentment" />
    <ProjectReference Include="..\Umbraco.Community.Kanban\Umbraco.Community.Kanban.csproj" />
  </ItemGroup>
</Project>
```

Note there is no `TargetFramework` — `Directory.Build.props` supplies it. This is a plain `Microsoft.NET.Sdk` project, not `Microsoft.NET.Sdk.Razor`: it ships no client assets.

- [ ] **Step 3: Create the constants**

`src/Umbraco.Community.Kanban.Contentment/ContentmentConstants.cs`:

```csharp
namespace Umbraco.Community.Kanban.Contentment;

/// <summary>
/// Named <c>ContentmentConstants</c> rather than <c>Constants</c> so it never collides with
/// <see cref="Umbraco.Community.Kanban.Constants" /> in a file that uses both namespaces.
/// </summary>
public static class ContentmentConstants
{
    /// <summary>
    /// The editor alias of Contentment's Data List. Hardcoded because Contentment's own constants
    /// are <c>internal</c> — guarded by a test that reflects theirs, so a rename in a Contentment
    /// upgrade fails the build rather than silently producing empty boards.
    /// </summary>
    public const string DataListEditorAlias = "Umbraco.Community.Contentment.DataList";

    /// <summary>The alias a board configuration uses to pin this lane source explicitly.</summary>
    public const string LaneSourceAlias = "contentment-data-list";
}
```

- [ ] **Step 4: Create the test project**

`tests/Umbraco.Community.Kanban.Contentment.Tests/Umbraco.Community.Kanban.Contentment.Tests.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <IsPackable>false</IsPackable>
    <IsTestProject>true</IsTestProject>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" />
    <PackageReference Include="xunit" />
    <PackageReference Include="xunit.runner.visualstudio" />
    <PackageReference Include="FluentAssertions" />
  </ItemGroup>
  <ItemGroup>
    <ProjectReference Include="..\..\src\Umbraco.Community.Kanban.Contentment\Umbraco.Community.Kanban.Contentment.csproj" />
  </ItemGroup>
</Project>
```

`tests/Umbraco.Community.Kanban.Contentment.Tests/GlobalUsings.cs`:

```csharp
global using FluentAssertions;
global using Xunit;
```

- [ ] **Step 5: Add both projects to the solution**

In `Umbraco.Community.Kanban.slnx`, add one line to each folder so it reads:

```xml
<Solution>
  <Folder Name="/src/">
    <Project Path="src/Umbraco.Community.Kanban/Umbraco.Community.Kanban.csproj" />
    <Project Path="src/Umbraco.Community.Kanban.Contentment/Umbraco.Community.Kanban.Contentment.csproj" />
  </Folder>
  <Folder Name="/tests/">
    <Project Path="tests/Umbraco.Community.Kanban.Tests/Umbraco.Community.Kanban.Tests.csproj" />
    <Project Path="tests/Umbraco.Community.Kanban.Contentment.Tests/Umbraco.Community.Kanban.Contentment.Tests.csproj" />
  </Folder>
</Solution>
```

- [ ] **Step 6: Write the failing guard test**

`tests/Umbraco.Community.Kanban.Contentment.Tests/ContentmentConstantsTests.cs`:

```csharp
using System.Reflection;
using Umbraco.Community.Contentment.DataEditors;
using Umbraco.Community.Kanban.Contentment;

namespace Umbraco.Community.Kanban.Contentment.Tests;

public class ContentmentConstantsTests
{
    [Fact]
    public void DataListEditorAlias_MatchesContentmentsOwnConstant()
    {
        // Contentment declares this alias on an internal const, so ours is hardcoded. Reflecting
        // theirs is what makes that safe: a rename in a Contentment upgrade fails here, instead of
        // silently producing boards with no lanes. DataListValueConverter is only an anchor — a
        // public type in the same assembly.
        Type? editor = typeof(DataListValueConverter).Assembly
            .GetType("Umbraco.Community.Contentment.DataEditors.DataListDataEditor");

        editor.Should().NotBeNull("Contentment no longer declares DataListDataEditor");

        FieldInfo? field = editor!.GetField("DataEditorAlias", BindingFlags.NonPublic | BindingFlags.Static);

        field.Should().NotBeNull("Contentment no longer declares DataListDataEditor.DataEditorAlias");
        field!.GetRawConstantValue().Should().Be(ContentmentConstants.DataListEditorAlias);
    }
}
```

- [ ] **Step 7: Run the test**

Run: `cd /Users/gandalf/Source/Repos/Umbraco.Community.Kanban && dotnet test --filter FullyQualifiedName~ContentmentConstantsTests`

Expected: PASS. Unusually for TDD, this test is expected to pass first time — it asserts a fact about an installed dependency, not behaviour being built. If it **fails**, do not change the test to match: the hardcoded alias in Step 3 is wrong, and the failure message tells you the real value.

- [ ] **Step 8: Verify the whole solution still builds and the existing suite is untouched**

Run: `cd /Users/gandalf/Source/Repos/Umbraco.Community.Kanban && dotnet test`

Expected: PASS, 172 tests (the 171 that exist today plus the guard).

- [ ] **Step 9: Commit**

```bash
cd /Users/gandalf/Source/Repos/Umbraco.Community.Kanban
git add Directory.Packages.props Umbraco.Community.Kanban.slnx src/Umbraco.Community.Kanban.Contentment tests/Umbraco.Community.Kanban.Contentment.Tests
git commit -m "feat: scaffold the Kanban Contentment package with an alias guard test"
```

---

### Task 2: The configuration parser

Reads the data source key and its raw configuration JSON out of a Data List data type's stored configuration. Pure and self-contained: every shape-guessing decision lives here, where it is directly testable.

**Files:**
- Create: `src/Umbraco.Community.Kanban.Contentment/ContentmentDataSourceReference.cs`
- Create: `src/Umbraco.Community.Kanban.Contentment/ContentmentDataListConfiguration.cs`
- Test: `tests/Umbraco.Community.Kanban.Contentment.Tests/ContentmentDataListConfigurationTests.cs`

**Interfaces:**
- Consumes: nothing from Task 1 beyond the projects existing.
- Produces:
  - `public sealed record ContentmentDataSourceReference(string Key, string ValueJson)`
  - `public static bool ContentmentDataListConfiguration.TryRead(IDictionary<string, object>? configurationData, out ContentmentDataSourceReference? reference)`

- [ ] **Step 1: Write the failing tests**

`tests/Umbraco.Community.Kanban.Contentment.Tests/ContentmentDataListConfigurationTests.cs`:

```csharp
using System.Text.Json;
using System.Text.Json.Nodes;
using Umbraco.Community.Kanban.Contentment;

namespace Umbraco.Community.Kanban.Contentment.Tests;

public class ContentmentDataListConfigurationTests
{
    private const string EnumSourceKey =
        "Umbraco.Community.Contentment.DataEditors.EnumDataListSource, Umbraco.Community.Contentment";

    // A property, not a const: a raw interpolated string is not usable as a compile-time constant here.
    private static string CanonicalJson =>
        $$"""[ { "key": "{{EnumSourceKey}}", "value": { "enumType": [ "Bookings", "Bookings.BookingStatus" ] } } ]""";

    /// <summary>The shape Umbraco hands over: IDataType.ConfigurationData with JsonNode values.</summary>
    private static Dictionary<string, object> Canonical() =>
        new() { ["dataSource"] = JsonNode.Parse(CanonicalJson)! };

    [Fact]
    public void TryRead_ReadsTheKeyAndValueFromTheCanonicalShape()
    {
        var read = ContentmentDataListConfiguration.TryRead(Canonical(), out var reference);

        read.Should().BeTrue();
        reference!.Key.Should().Be(EnumSourceKey);
        reference.ValueJson.Should().Contain("enumType");
    }

    [Fact]
    public void TryRead_ReadsAValueThatArrivedAsJsonElement()
    {
        // What a configuration that has been through a System.Text.Json round trip looks like.
        var roundTripped = JsonSerializer.Deserialize<Dictionary<string, object>>(
            $$"""{ "dataSource": {{CanonicalJson}} }""")!;

        var read = ContentmentDataListConfiguration.TryRead(roundTripped, out var reference);

        read.Should().BeTrue();
        reference!.Key.Should().Be(EnumSourceKey);
        reference.ValueJson.Should().Contain("enumType");
    }

    [Fact]
    public void TryRead_ReadsAValueThatArrivedAsPlainClrObjects()
    {
        IDictionary<string, object> configuration = new Dictionary<string, object>
        {
            ["dataSource"] = new List<Dictionary<string, object>>
            {
                new() { ["key"] = EnumSourceKey, ["value"] = new Dictionary<string, object> { ["enumType"] = "x" } },
            },
        };

        var read = ContentmentDataListConfiguration.TryRead(configuration, out var reference);

        read.Should().BeTrue();
        reference!.Key.Should().Be(EnumSourceKey);
        reference.ValueJson.Should().Contain("enumType");
    }

    [Fact]
    public void TryRead_ReadsAValueThatArrivedAsAJsonString()
    {
        IDictionary<string, object> configuration = new Dictionary<string, object> { ["dataSource"] = CanonicalJson };

        var read = ContentmentDataListConfiguration.TryRead(configuration, out var reference);

        read.Should().BeTrue();
        reference!.Key.Should().Be(EnumSourceKey);
    }

    [Fact]
    public void TryRead_AcceptsASingleObjectInsteadOfAnArray()
    {
        IDictionary<string, object> configuration = new Dictionary<string, object>
        {
            ["dataSource"] = JsonNode.Parse($$"""{ "key": "{{EnumSourceKey}}" }""")!,
        };

        ContentmentDataListConfiguration.TryRead(configuration, out var reference).Should().BeTrue();
        reference!.Key.Should().Be(EnumSourceKey);
    }

    [Fact]
    public void TryRead_DefaultsAMissingValueToAnEmptyObject()
    {
        // Contentment's own code does the same (`obj["value"]?.ToString() ?? "{}"`): a source with no
        // configuration of its own still has to be handed a dictionary.
        IDictionary<string, object> configuration = new Dictionary<string, object>
        {
            ["dataSource"] = JsonNode.Parse($$"""[ { "key": "{{EnumSourceKey}}" } ]""")!,
        };

        ContentmentDataListConfiguration.TryRead(configuration, out var reference).Should().BeTrue();
        reference!.ValueJson.Should().Be("{}");
    }

    [Fact]
    public void TryRead_TakesTheFirstEntry_AsEverywhereElseInTheLanePipeline()
    {
        IDictionary<string, object> configuration = new Dictionary<string, object>
        {
            ["dataSource"] = JsonNode.Parse("""[ { "key": "first" }, { "key": "second" } ]""")!,
        };

        ContentmentDataListConfiguration.TryRead(configuration, out var reference).Should().BeTrue();
        reference!.Key.Should().Be("first");
    }

    [Theory]
    [InlineData("""{ "notADataSource": 1 }""")]
    [InlineData("""{ "dataSource": [] }""")]
    [InlineData("""{ "dataSource": [ { "notAKey": 1 } ] }""")]
    [InlineData("""{ "dataSource": [ { "key": "" } ] }""")]
    [InlineData("""{ "dataSource": [ { "key": "   " } ] }""")]
    [InlineData("""{ "dataSource": 42 }""")]
    [InlineData("""{ "dataSource": null }""")]
    public void TryRead_ReportsNothingForAConfigurationItCannotRead(string json)
    {
        // No lanes is recoverable; an exception out of GET /board is not.
        var configuration = JsonSerializer.Deserialize<Dictionary<string, object>>(json)!;

        ContentmentDataListConfiguration.TryRead(configuration, out var reference).Should().BeFalse();
        reference.Should().BeNull();
    }

    [Fact]
    public void TryRead_ReportsNothingForAStringThatIsNotJson()
    {
        IDictionary<string, object> configuration = new Dictionary<string, object> { ["dataSource"] = "not json" };

        ContentmentDataListConfiguration.TryRead(configuration, out var reference).Should().BeFalse();
        reference.Should().BeNull();
    }

    [Fact]
    public void TryRead_ReportsNothingForNoConfigurationAtAll()
    {
        ContentmentDataListConfiguration.TryRead(null, out var reference).Should().BeFalse();
        reference.Should().BeNull();
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/gandalf/Source/Repos/Umbraco.Community.Kanban && dotnet test --filter FullyQualifiedName~ContentmentDataListConfigurationTests`

Expected: build failure — `ContentmentDataListConfiguration` and `ContentmentDataSourceReference` do not exist.

- [ ] **Step 3: Write the reference record**

`src/Umbraco.Community.Kanban.Contentment/ContentmentDataSourceReference.cs`:

```csharp
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
```

- [ ] **Step 4: Write the parser**

`src/Umbraco.Community.Kanban.Contentment/ContentmentDataListConfiguration.cs`:

```csharp
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Umbraco.Community.Kanban.Contentment;

/// <summary>
/// Reads the data source out of a Contentment Data List data type's stored configuration, which holds
/// it as <c>dataSource: [ { key, value } ]</c> — the shape Contentment's own
/// <c>DataListValueConverter</c> reads.
/// </summary>
public static class ContentmentDataListConfiguration
{
    private const string DataSourceKey = "dataSource";
    private const string NoConfiguration = "{}";

    /// <summary>
    /// Never throws and never reports a partial result: a configuration this cannot read means no
    /// lanes, which is recoverable, where an exception out of <c>GET /board</c> is not.
    /// </summary>
    public static bool TryRead(
        IDictionary<string, object>? configurationData,
        out ContentmentDataSourceReference? reference)
    {
        reference = null;

        if (configurationData is null
            || configurationData.TryGetValue(DataSourceKey, out var value) == false
            || value is null)
        {
            return false;
        }

        JsonObject? entry = FirstEntry(ToNode(value));

        // ToString() on a JsonValue holding a string yields the string itself, which is what makes
        // this work for both a real JSON string node and anything else.
        var key = entry?["key"]?.ToString();

        if (string.IsNullOrWhiteSpace(key))
        {
            return false;
        }

        var valueJson = entry?["value"]?.ToString();

        reference = new ContentmentDataSourceReference(
            key,
            string.IsNullOrWhiteSpace(valueJson) ? NoConfiguration : valueJson);

        return true;
    }

    /// <summary>
    /// Contentment always stores an array, but a lone object is accepted too — it costs one line and
    /// means a hand-edited or migrated configuration still resolves.
    /// </summary>
    private static JsonObject? FirstEntry(JsonNode? node) => node switch
    {
        // Duplicate entries are not meaningful here, so the first wins, as it does everywhere else
        // in the lane pipeline.
        JsonArray array => array.Count > 0 ? array[0] as JsonObject : null,
        JsonObject entry => entry,
        _ => null,
    };

    /// <summary>
    /// Normalises whatever the configuration dictionary happens to hold into one node type, so the
    /// reading above has a single code path. Umbraco hands over <see cref="JsonNode" />s, but a
    /// configuration that has been through a JSON round trip arrives as <see cref="JsonElement" />s,
    /// and one assembled in code as plain lists and dictionaries.
    /// </summary>
    private static JsonNode? ToNode(object value)
    {
        try
        {
            return value switch
            {
                JsonNode node => node,
                JsonElement element => JsonNode.Parse(element.GetRawText()),
                string text => string.IsNullOrWhiteSpace(text) ? null : JsonNode.Parse(text),
                _ => JsonSerializer.SerializeToNode(value),
            };
        }
        catch (JsonException)
        {
            // A stored string that is not JSON is a configuration we cannot read, not a crash.
            return null;
        }
    }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd /Users/gandalf/Source/Repos/Umbraco.Community.Kanban && dotnet test --filter FullyQualifiedName~ContentmentDataListConfigurationTests`

Expected: PASS, 17 tests (10 facts plus the 7 theory cases).

- [ ] **Step 6: Commit**

```bash
cd /Users/gandalf/Source/Repos/Umbraco.Community.Kanban
git add src/Umbraco.Community.Kanban.Contentment tests/Umbraco.Community.Kanban.Contentment.Tests
git commit -m "feat: read the data source out of a Data List configuration"
```

---

### Task 3: The lane source

The lane source itself, plus the one-method seam it reads items through. Tested end to end against a fake seam, including a source that throws.

**Files:**
- Create: `src/Umbraco.Community.Kanban.Contentment/IContentmentDataListItems.cs`
- Create: `src/Umbraco.Community.Kanban.Contentment/ContentmentDataListLaneSource.cs`
- Create: `tests/Umbraco.Community.Kanban.Contentment.Tests/Fakes/FakeContentmentDataListItems.cs`
- Create: `tests/Umbraco.Community.Kanban.Contentment.Tests/Fakes/FakePropertyDataTypeLookup.cs`
- Test: `tests/Umbraco.Community.Kanban.Contentment.Tests/ContentmentDataListLaneSourceTests.cs`
- Test: `tests/Umbraco.Community.Kanban.Contentment.Tests/ContentmentLaneResolutionTests.cs`

**Interfaces:**
- Consumes: `ContentmentConstants.DataListEditorAlias`, `ContentmentConstants.LaneSourceAlias` (Task 1); `ContentmentDataListConfiguration.TryRead`, `ContentmentDataSourceReference` (Task 2).
- Produces:
  - `public interface IContentmentDataListItems { IEnumerable<DataListItem> GetItems(ContentmentDataSourceReference reference); }`
  - `public sealed class ContentmentDataListLaneSource(IContentmentDataListItems items, ILogger<ContentmentDataListLaneSource> logger) : IKanbanLaneSource`

- [ ] **Step 1: Write the seam interface**

Written before its test because the fake in Step 2 implements it. `src/Umbraco.Community.Kanban.Contentment/IContentmentDataListItems.cs`:

```csharp
using Umbraco.Community.Contentment.DataEditors;

namespace Umbraco.Community.Kanban.Contentment;

/// <summary>
/// Reads the items a Contentment data source produces.
/// </summary>
/// <remarks>
/// Exists as a seam only because Contentment's <c>ConfigurationEditorUtility</c> is <c>public sealed</c>
/// with no interface, so a lane source depending on it directly could not be tested at all. Mirrors
/// <c>IKanbanPropertyDataTypeLookup</c> in the core package, which exists for the same reason.
/// </remarks>
public interface IContentmentDataListItems
{
    IEnumerable<DataListItem> GetItems(ContentmentDataSourceReference reference);
}
```

- [ ] **Step 2: Write the fake**

`tests/Umbraco.Community.Kanban.Contentment.Tests/Fakes/FakeContentmentDataListItems.cs`:

```csharp
using Umbraco.Community.Contentment.DataEditors;
using Umbraco.Community.Kanban.Contentment;

namespace Umbraco.Community.Kanban.Contentment.Tests.Fakes;

/// <summary>
/// Returns canned items, so lane source tests need neither Contentment's DI nor a mocking framework.
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
```

- [ ] **Step 3: Write the failing tests**

`tests/Umbraco.Community.Kanban.Contentment.Tests/ContentmentDataListLaneSourceTests.cs`:

```csharp
using System.Text.Json.Nodes;
using Microsoft.Extensions.Logging.Abstractions;
using Umbraco.Community.Contentment.DataEditors;
using Umbraco.Community.Kanban.Contentment;
using Umbraco.Community.Kanban.Contentment.Tests.Fakes;
using Umbraco.Community.Kanban.Lanes;
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Contentment.Tests;

public class ContentmentDataListLaneSourceTests
{
    private const string SourceKey = "Some.Source, Some.Assembly";

    private static ContentmentDataListLaneSource Source(IContentmentDataListItems items) =>
        new(items, NullLogger<ContentmentDataListLaneSource>.Instance);

    private static KanbanLaneSourceContext Context(
        string editorAlias = ContentmentConstants.DataListEditorAlias,
        KanbanBoardConfiguration? configuration = null) =>
        new(
            editorAlias,
            new Dictionary<string, object>
            {
                ["dataSource"] = JsonNode.Parse($$"""[ { "key": "{{SourceKey}}", "value": { "a": 1 } } ]""")!,
            },
            configuration ?? new KanbanBoardConfiguration());

    [Fact]
    public void Alias_IsTheOneABoardConfigurationCanPin()
    {
        Source(new FakeContentmentDataListItems()).Alias.Should().Be("contentment-data-list");
    }

    [Theory]
    [InlineData("Umbraco.Community.Contentment.DataList", true)]
    [InlineData("umbraco.community.contentment.datalist", true)]
    [InlineData("Umbraco.DropDown.Flexible", false)]
    [InlineData("Umbraco.Community.Contentment.DataPicker", false)]
    [InlineData("", false)]
    public void CanHandle_ClaimsOnlyTheDataListEditor(string editorAlias, bool expected)
    {
        // The Data Picker is deliberately not claimed: its sources are built around search and paging
        // rather than a bounded option set.
        Source(new FakeContentmentDataListItems()).CanHandle(Context(editorAlias)).Should().Be(expected);
    }

    [Fact]
    public async Task GetLanes_AsksForTheConfiguredDataSource()
    {
        var items = new FakeContentmentDataListItems();

        await Source(items).GetLanesAsync(Context());

        items.Requested!.Key.Should().Be(SourceKey);
        items.Requested.ValueJson.Should().Contain("\"a\"");
    }

    [Fact]
    public async Task GetLanes_MapsValueNameAndIcon()
    {
        var items = new FakeContentmentDataListItems(
            new DataListItem { Value = "confirmed", Name = "Confirmed", Icon = "icon-check" });

        IReadOnlyList<KanbanLane> lanes = await Source(items).GetLanesAsync(Context());

        lanes.Should().ContainSingle();
        lanes[0].Value.Should().Be("confirmed");
        lanes[0].Name.Should().Be("Confirmed");
        lanes[0].Icon.Should().Be("icon-check");
    }

    [Fact]
    public async Task GetLanes_FallsBackToTheValueWhenAnItemHasNoName()
    {
        var items = new FakeContentmentDataListItems(new DataListItem { Value = "confirmed", Name = "" });

        IReadOnlyList<KanbanLane> lanes = await Source(items).GetLanesAsync(Context());

        lanes[0].Name.Should().Be("confirmed");
    }

    [Fact]
    public async Task GetLanes_LeavesColourUnsetSoLanesJoinThePaletteCycle()
    {
        // DataListItem has no colour, and reading one out of its extension bag was deliberately
        // rejected: lane colour comes from an override or the cycle.
        var items = new FakeContentmentDataListItems(new DataListItem { Value = "confirmed", Name = "Confirmed" });

        IReadOnlyList<KanbanLane> lanes = await Source(items).GetLanesAsync(Context());

        lanes[0].Colour.Should().BeNull();
    }

    [Fact]
    public async Task GetLanes_TreatsABlankIconAsNoIcon()
    {
        var items = new FakeContentmentDataListItems(new DataListItem { Value = "confirmed", Icon = "" });

        IReadOnlyList<KanbanLane> lanes = await Source(items).GetLanesAsync(Context());

        lanes[0].Icon.Should().BeNull();
    }

    [Fact]
    public async Task GetLanes_MakesADisabledItemALaneThatRejectsDrops()
    {
        var items = new FakeContentmentDataListItems(
            new DataListItem { Value = "cancelled", Name = "Cancelled", Disabled = true },
            new DataListItem { Value = "confirmed", Name = "Confirmed" });

        IReadOnlyList<KanbanLane> lanes = await Source(items).GetLanesAsync(Context());

        lanes[0].AcceptsDrops.Should().BeFalse();
        lanes[1].AcceptsDrops.Should().BeTrue();
    }

    [Fact]
    public async Task GetLanes_SkipsItemsWithNoValue()
    {
        // A lane with no value can never match a card, and would collide with the unassigned lane.
        var items = new FakeContentmentDataListItems(
            new DataListItem { Value = "", Name = "Nameless" },
            new DataListItem { Value = null, Name = "Also nameless" },
            new DataListItem { Value = "confirmed", Name = "Confirmed" });

        IReadOnlyList<KanbanLane> lanes = await Source(items).GetLanesAsync(Context());

        lanes.Select(lane => lane.Value).Should().Equal("confirmed");
    }

    [Fact]
    public async Task GetLanes_PreservesSourceOrder_BecauseOrderDrivesLaneColours()
    {
        var items = new FakeContentmentDataListItems(
            new DataListItem { Value = "pending" },
            new DataListItem { Value = "confirmed" },
            new DataListItem { Value = "cancelled" });

        IReadOnlyList<KanbanLane> lanes = await Source(items).GetLanesAsync(Context());

        lanes.Select(lane => lane.Value).Should().Equal("pending", "confirmed", "cancelled");
    }

    [Fact]
    public async Task GetLanes_ReturnsNothingWhenTheConfigurationNamesNoDataSource()
    {
        var context = new KanbanLaneSourceContext(
            ContentmentConstants.DataListEditorAlias,
            new Dictionary<string, object>(),
            new KanbanBoardConfiguration());

        IReadOnlyList<KanbanLane> lanes = await Source(new FakeContentmentDataListItems()).GetLanesAsync(context);

        lanes.Should().BeEmpty();
    }

    [Fact]
    public async Task GetLanes_ReturnsNothingWhenTheDataSourceThrows()
    {
        // GetItems runs third-party code. An empty board is recoverable; a 500 from GET /board is not.
        IReadOnlyList<KanbanLane> lanes =
            await Source(FakeContentmentDataListItems.Throwing()).GetLanesAsync(Context());

        lanes.Should().BeEmpty();
    }
}
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cd /Users/gandalf/Source/Repos/Umbraco.Community.Kanban && dotnet test --filter FullyQualifiedName~ContentmentDataListLaneSourceTests`

Expected: build failure — `ContentmentDataListLaneSource` does not exist.

- [ ] **Step 5: Write the lane source**

`src/Umbraco.Community.Kanban.Contentment/ContentmentDataListLaneSource.cs`:

```csharp
using Microsoft.Extensions.Logging;
using Umbraco.Community.Contentment.DataEditors;
using Umbraco.Community.Kanban.Lanes;
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Contentment;

/// <summary>
/// Resolves lanes from a Contentment Data List property, one lane per item its data source produces.
/// Any data source works, including custom ones, because resolution goes through Contentment's
/// <c>IContentmentDataSource</c> rather than enumerating known source types.
/// </summary>
public sealed class ContentmentDataListLaneSource(
    IContentmentDataListItems items,
    ILogger<ContentmentDataListLaneSource> logger) : IKanbanLaneSource
{
    public string Alias => ContentmentConstants.LaneSourceAlias;

    public bool CanHandle(KanbanLaneSourceContext context) =>
        string.Equals(context.EditorAlias, ContentmentConstants.DataListEditorAlias, StringComparison.OrdinalIgnoreCase);

    public Task<IReadOnlyList<KanbanLane>> GetLanesAsync(KanbanLaneSourceContext context)
    {
        if (ContentmentDataListConfiguration.TryRead(context.ConfigurationData, out ContentmentDataSourceReference? reference) == false
            || reference is null)
        {
            return Task.FromResult<IReadOnlyList<KanbanLane>>([]);
        }

        IReadOnlyList<KanbanLane> lanes = Read(reference)
            .Where(item => string.IsNullOrWhiteSpace(item.Value) == false)
            .Select(ToLane)
            .ToList();

        return Task.FromResult(lanes);
    }

    /// <summary>
    /// Guarded here rather than inside the seam so the failure path is testable with a throwing fake.
    /// A data source runs third-party code — a SQL source with a bad connection string, an Examine
    /// source with no index — and a board with no lanes is recoverable where a 500 is not.
    /// </summary>
    private IEnumerable<DataListItem> Read(ContentmentDataSourceReference reference)
    {
        try
        {
            return items.GetItems(reference) ?? [];
        }
        catch (Exception exception)
        {
            logger.LogError(
                exception,
                "The Contentment data source {DataSourceKey} failed to produce lanes.",
                reference.Key);

            return [];
        }
    }

    private static KanbanLane ToLane(DataListItem item) => new()
    {
        // Blank values are filtered out before this runs, so Value is known to be present.
        Value = item.Value!,
        Name = string.IsNullOrWhiteSpace(item.Name) ? item.Value! : item.Name,
        Icon = string.IsNullOrWhiteSpace(item.Icon) ? null : item.Icon,

        // Colour is deliberately left unset: DataListItem carries none, so every lane joins the
        // palette cycle unless a lane override says otherwise.
        AcceptsDrops = item.Disabled == false,
    };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd /Users/gandalf/Source/Repos/Umbraco.Community.Kanban && dotnet test --filter FullyQualifiedName~ContentmentDataListLaneSourceTests`

Expected: PASS, 17 tests (12 facts plus the 5 `CanHandle` theory cases).

- [ ] **Step 7: Write the fake property lookup**

Needed by Step 8, and deliberately a copy rather than a reference: the core test project is not referenced by this one, and test fakes are not shipped in the core package.

`tests/Umbraco.Community.Kanban.Contentment.Tests/Fakes/FakePropertyDataTypeLookup.cs`:

```csharp
using Umbraco.Community.Kanban.Lanes;

namespace Umbraco.Community.Kanban.Contentment.Tests.Fakes;

/// <summary>
/// A dictionary-backed lookup, so resolver tests need no Umbraco services and no mocking framework.
/// </summary>
public sealed class FakePropertyDataTypeLookup : IKanbanPropertyDataTypeLookup
{
    private readonly Dictionary<string, KanbanPropertyDataType> entries = new(StringComparer.OrdinalIgnoreCase);

    public FakePropertyDataTypeLookup Add(string propertyAlias, string editorAlias, IDictionary<string, object> configuration)
    {
        entries[propertyAlias] = new KanbanPropertyDataType(editorAlias, configuration);
        return this;
    }

    public Task<KanbanPropertyDataType?> GetAsync(Guid contentTypeKey, string propertyAlias) =>
        Task.FromResult(entries.TryGetValue(propertyAlias, out var entry) ? entry : null);
}
```

- [ ] **Step 8: Write the failing resolution tests**

These are what prove the feature works: the source in isolation is necessary but not sufficient, since the resolver decides which source is asked at all.

`tests/Umbraco.Community.Kanban.Contentment.Tests/ContentmentLaneResolutionTests.cs`:

```csharp
using System.Text.Json.Nodes;
using Microsoft.Extensions.Logging.Abstractions;
using Umbraco.Community.Contentment.DataEditors;
using Umbraco.Community.Kanban.Contentment.Tests.Fakes;
using Umbraco.Community.Kanban.Lanes;
using Umbraco.Community.Kanban.Lanes.Sources;
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Contentment.Tests;

/// <summary>
/// The lane source through the real <see cref="KanbanLaneResolver" />, with the built-in sources
/// alongside it — the arrangement a live site has.
/// </summary>
public class ContentmentLaneResolutionTests
{
    private static readonly Guid ContentTypeKey = Guid.Parse("8f6f5f4e-0000-4000-8000-000000000001");

    private static KanbanLaneResolver Resolver(IContentmentDataListItems items, IKanbanPropertyDataTypeLookup lookup) =>
        new(
            lookup,
            new KanbanLaneSourceCollection(() =>
            [
                new ManualLaneSource(),
                new CoreListEditorLaneSource(),
                new ContentmentDataListLaneSource(items, NullLogger<ContentmentDataListLaneSource>.Instance),
            ]));

    private static FakePropertyDataTypeLookup StatusIsADataList() =>
        new FakePropertyDataTypeLookup().Add(
            "status",
            ContentmentConstants.DataListEditorAlias,
            new Dictionary<string, object>
            {
                ["dataSource"] = JsonNode.Parse("""[ { "key": "Some.Source, Some.Assembly" } ]""")!,
            });

    [Fact]
    public async Task Resolve_UsesTheContentmentSourceForADataListProperty()
    {
        var items = new FakeContentmentDataListItems(
            new DataListItem { Value = "pending", Name = "Pending" },
            new DataListItem { Value = "confirmed", Name = "Confirmed" });
        var configuration = new KanbanBoardConfiguration { LaneProperty = "status" };

        KanbanLaneResolution result = await Resolver(items, StatusIsADataList())
            .ResolveAsync(ContentTypeKey, configuration);

        result.Lanes.Where(lane => lane.IsUnassigned == false).Select(lane => lane.Value)
            .Should().Equal("pending", "confirmed");

        // The resolver always appends the unassigned lane last.
        result.Lanes.Last().IsUnassigned.Should().BeTrue();
    }

    [Fact]
    public async Task Resolve_AssignsPaletteColours_SinceContentmentItemsCarryNone()
    {
        var items = new FakeContentmentDataListItems(new DataListItem { Value = "pending", Name = "Pending" });
        var configuration = new KanbanBoardConfiguration { LaneProperty = "status" };

        KanbanLaneResolution result = await Resolver(items, StatusIsADataList())
            .ResolveAsync(ContentTypeKey, configuration);

        result.Lanes.First().Colour.Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public async Task Resolve_StillPrefersManualLanesWhenTheToggleIsOn()
    {
        // A pinned source beats one that merely claims the editor, so an editor can override a
        // Data List's own options.
        var items = new FakeContentmentDataListItems(new DataListItem { Value = "pending", Name = "Pending" });
        var configuration = new KanbanBoardConfiguration
        {
            LaneProperty = "status",
            UseManualLanes = true,
            ManualLanes = [new KanbanManualLane { Value = "custom", Label = "Custom" }],
        };

        KanbanLaneResolution result = await Resolver(items, StatusIsADataList())
            .ResolveAsync(ContentTypeKey, configuration);

        result.Lanes.Where(lane => lane.IsUnassigned == false).Select(lane => lane.Value)
            .Should().Equal("custom");
    }
}
```

- [ ] **Step 9: Run the resolution tests**

Run: `cd /Users/gandalf/Source/Repos/Umbraco.Community.Kanban && dotnet test --filter FullyQualifiedName~ContentmentLaneResolutionTests`

Expected: PASS, 3 tests. These need no new production code — if they fail, the lane source or the parser is wrong, not the resolver.

- [ ] **Step 10: Commit**

```bash
cd /Users/gandalf/Source/Repos/Umbraco.Community.Kanban
git add src/Umbraco.Community.Kanban.Contentment tests/Umbraco.Community.Kanban.Contentment.Tests
git commit -m "feat: resolve Kanban lanes from a Contentment Data List"
```

---

### Task 4: Contentment adapter, registration, and site wiring

The real seam implementation, the composer that makes installing the package sufficient, and the `ProjectReference` from the site. Grouped because the adapter's only meaningful verification is that composition resolves it, and because a package that works but is not registered delivers nothing.

**Files:**
- Create: `src/Umbraco.Community.Kanban.Contentment/ContentmentDataListItems.cs`
- Create: `src/Umbraco.Community.Kanban.Contentment/Extensions/UmbracoBuilderExtensions.cs`
- Create: `src/Umbraco.Community.Kanban.Contentment/Composers/KanbanContentmentComposer.cs`
- Create: `src/Umbraco.Community.Kanban.Contentment/README.md`
- Modify: `src/Umbraco.Community.Kanban.Contentment/Umbraco.Community.Kanban.Contentment.csproj` (pack the README)
- Create: `tests/Umbraco.Community.Kanban.Contentment.Tests/Composing/KanbanContentmentBuilderFixture.cs`
- Test: `tests/Umbraco.Community.Kanban.Contentment.Tests/Composing/RegistrationTests.cs`
- Modify: `/Users/gandalf/Source/Repos/your-it-team-cloud/YourITTeam.slnx`
- Modify: `/Users/gandalf/Source/Repos/your-it-team-cloud/src/YourITTeam/YourITTeam.csproj`

**Interfaces:**
- Consumes: `IContentmentDataListItems`, `ContentmentDataListLaneSource` (Task 3); `ContentmentDataSourceReference` (Task 2).
- Produces:
  - `public sealed class ContentmentDataListItems(ConfigurationEditorUtility utility, IJsonSerializer jsonSerializer) : IContentmentDataListItems`
  - `public static IUmbracoBuilder AddKanbanContentment(this IUmbracoBuilder builder)`
  - `public sealed class KanbanContentmentComposer : IComposer`

- [ ] **Step 1: Write the adapter**

Written before the test because the registration test asserts its type. `src/Umbraco.Community.Kanban.Contentment/ContentmentDataListItems.cs`:

```csharp
using Umbraco.Cms.Core.Serialization;
using Umbraco.Community.Contentment.DataEditors;

namespace Umbraco.Community.Kanban.Contentment;

/// <summary>
/// Asks Contentment for a data source's items, the same way Contentment's own
/// <c>DataListController.GetEditor</c> does.
/// </summary>
/// <remarks>
/// The deserialisation deliberately mirrors Contentment's, including using Umbraco's
/// <see cref="IJsonSerializer" />: data sources read their own configuration through Umbraco's
/// conversion helpers, so a differently-serialised dictionary can silently yield no values.
/// <c>EnumDataListSource</c> reading <c>enumType</c> as a <c>List&lt;string&gt;</c> is the concrete case.
/// </remarks>
public sealed class ContentmentDataListItems(
    ConfigurationEditorUtility utility,
    IJsonSerializer jsonSerializer) : IContentmentDataListItems
{
    public IEnumerable<DataListItem> GetItems(ContentmentDataSourceReference reference)
    {
        IContentmentDataSource? source = utility.GetConfigurationEditor<IContentmentDataSource>(reference.Key);

        if (source is null)
        {
            // A data source Contentment does not know: its package may have been removed since the
            // data type was configured. No lanes, no exception.
            return [];
        }

        Dictionary<string, object> configuration =
            jsonSerializer.Deserialize<Dictionary<string, object>>(reference.ValueJson) ?? [];

        return source.GetItems(configuration) ?? [];
    }
}
```

- [ ] **Step 2: Write the builder extension and composer**

`src/Umbraco.Community.Kanban.Contentment/Extensions/UmbracoBuilderExtensions.cs`:

```csharp
using Microsoft.Extensions.DependencyInjection;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Community.Kanban.Extensions;

namespace Umbraco.Community.Kanban.Contentment.Extensions;

public static class UmbracoBuilderExtensions
{
    /// <summary>
    /// Registers the Contentment Data List lane source. Safe to call more than once.
    /// </summary>
    public static IUmbracoBuilder AddKanbanContentment(this IUmbracoBuilder builder)
    {
        if (builder.Services.Any(x => x.ServiceType == typeof(IContentmentDataListItems)))
        {
            return builder;
        }

        // Idempotent, and this package is useless without it — so it does not matter whether the
        // core composer has run yet.
        builder.AddKanban();

        builder.Services.AddSingleton<IContentmentDataListItems, ContentmentDataListItems>();

        // Appended last, which is safe: no built-in source claims the Data List alias, and a
        // configuration pinning "manual" still wins through KanbanBoardConfiguration.PinnedLaneSource.
        builder.KanbanLaneSources().Append<ContentmentDataListLaneSource>();

        return builder;
    }
}
```

`src/Umbraco.Community.Kanban.Contentment/Composers/KanbanContentmentComposer.cs`:

```csharp
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Community.Kanban.Contentment.Extensions;

namespace Umbraco.Community.Kanban.Contentment.Composers;

/// <summary>
/// Makes installing this package the only step required: Umbraco discovers and runs composers itself.
/// </summary>
public sealed class KanbanContentmentComposer : IComposer
{
    public void Compose(IUmbracoBuilder builder) => builder.AddKanbanContentment();
}
```

- [ ] **Step 3: Write the test fixture**

`tests/Umbraco.Community.Kanban.Contentment.Tests/Composing/KanbanContentmentBuilderFixture.cs`:

```csharp
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;

namespace Umbraco.Community.Kanban.Contentment.Tests.Composing;

/// <summary>
/// A real <see cref="IUmbracoBuilder" /> with no fakes or mocks — just enough scaffolding (a real
/// <see cref="TypeLoader" /> over this test assembly) to satisfy Umbraco's "primarily for testing"
/// <see cref="UmbracoBuilder" /> constructor, which registers Umbraco's own core services. Mirrors
/// KanbanBuilderFixture in the core test project.
/// </summary>
public static class KanbanContentmentBuilderFixture
{
    public static IUmbracoBuilder CreateUmbracoBuilder()
    {
        var services = new ServiceCollection();
        var config = new ConfigurationBuilder().Build();
        var assemblyProvider = new DefaultUmbracoAssemblyProvider(
            typeof(KanbanContentmentBuilderFixture).Assembly,
            NullLoggerFactory.Instance);
        var typeFinder = new TypeFinder(
            NullLoggerFactory.Instance.CreateLogger<TypeFinder>(),
            assemblyProvider,
            null);
        var typeLoader = new TypeLoader(
            typeFinder,
            NullLoggerFactory.Instance.CreateLogger<TypeLoader>());

        return new UmbracoBuilder(services, config, typeLoader);
    }
}
```

If `CreateLogger<T>` is not found, add `using Microsoft.Extensions.Logging;` — the core project's fixture imports both namespaces.

- [ ] **Step 4: Write the failing registration tests**

`tests/Umbraco.Community.Kanban.Contentment.Tests/Composing/RegistrationTests.cs`:

```csharp
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Community.Kanban.Contentment.Extensions;
using Umbraco.Community.Kanban.Contentment.Tests.Fakes;
using Umbraco.Community.Kanban.Lanes;
using Umbraco.Community.Kanban.Lanes.Sources;

namespace Umbraco.Community.Kanban.Contentment.Tests.Composing;

public class RegistrationTests
{
    [Fact]
    public void AddKanbanContentment_RegistersTheItemsSeam()
    {
        // Asserted as a registration rather than resolved: ContentmentDataListItems depends on
        // Contentment's ConfigurationEditorUtility, which only exists once Contentment's own
        // composer has run — infrastructure this test project deliberately does not stand up.
        IUmbracoBuilder builder = KanbanContentmentBuilderFixture.CreateUmbracoBuilder();

        builder.AddKanbanContentment();

        builder.Services.Should().ContainSingle(d =>
            d.ServiceType == typeof(IContentmentDataListItems) &&
            d.ImplementationType == typeof(ContentmentDataListItems) &&
            d.Lifetime == ServiceLifetime.Singleton);
    }

    [Fact]
    public void AddKanbanContentment_AppendsTheLaneSource_AndKeepsTheBuiltInOnes()
    {
        // Exercises the real composition path, so dropping the .Append<>() call fails here. The seam
        // is swapped for a fake first, purely so the collection can be constructed at all — see the
        // test above for the registration it replaces.
        IUmbracoBuilder builder = KanbanContentmentBuilderFixture.CreateUmbracoBuilder();

        builder.AddKanbanContentment();

        builder.Services.RemoveAll<IContentmentDataListItems>();
        builder.Services.AddSingleton<IContentmentDataListItems>(new FakeContentmentDataListItems());

        builder.Build();

        using ServiceProvider provider = builder.Services.BuildServiceProvider();
        var sources = provider.GetRequiredService<KanbanLaneSourceCollection>();

        // Manual stays first so a pinned manual configuration is found before any source claims
        // the editor.
        sources.First().Should().BeOfType<ManualLaneSource>();
        sources.Should().ContainSingle(x => x is CoreListEditorLaneSource);
        sources.Should().ContainSingle(x => x is ContentmentDataListLaneSource);
    }

    [Fact]
    public void AddKanbanContentment_IsSafeToCallTwice()
    {
        IUmbracoBuilder builder = KanbanContentmentBuilderFixture.CreateUmbracoBuilder();

        builder.AddKanbanContentment();
        builder.AddKanbanContentment();

        builder.Services.Should().ContainSingle(d => d.ServiceType == typeof(IContentmentDataListItems));
    }
}
```

- [ ] **Step 5: Run the tests to verify they fail, then pass**

Run: `cd /Users/gandalf/Source/Repos/Umbraco.Community.Kanban && dotnet test --filter FullyQualifiedName~Composing.RegistrationTests`

Expected: PASS, 3 tests. If `builder.Build()` throws while resolving the collection, the fake swap in the second test did not take effect — check `RemoveAll` is imported from `Microsoft.Extensions.DependencyInjection.Extensions`.

- [ ] **Step 6: Write the package README**

The design requires the content-context limitation be documented where an installer will see it.
Create `src/Umbraco.Community.Kanban.Contentment/README.md`:

```markdown
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
```

Then add the README to the package in `src/Umbraco.Community.Kanban.Contentment/Umbraco.Community.Kanban.Contentment.csproj` — a `PackageReadmeFile` that is not packed is an error, so both lines land together. In the first `PropertyGroup`:

```xml
    <PackageReadmeFile>README.md</PackageReadmeFile>
```

And a new `ItemGroup`:

```xml
  <ItemGroup>
    <None Include="README.md" Pack="true" PackagePath="\" />
  </ItemGroup>
```

- [ ] **Step 7: Run the whole suite**

Run: `cd /Users/gandalf/Source/Repos/Umbraco.Community.Kanban && dotnet test`

Expected: PASS. 171 existing tests plus 41 new (1 guard + 17 parser + 17 lane source + 3 resolution + 3 registration) = 212.

- [ ] **Step 8: Commit the package**

```bash
cd /Users/gandalf/Source/Repos/Umbraco.Community.Kanban
git add src/Umbraco.Community.Kanban.Contentment tests/Umbraco.Community.Kanban.Contentment.Tests
git commit -m "feat: register the Contentment lane source from a composer"
```

- [ ] **Step 9: Wire the project into the site**

In `/Users/gandalf/Source/Repos/your-it-team-cloud/YourITTeam.slnx`, after the existing Kanban line:

```xml
  <Project Path="../Umbraco.Community.Kanban/src/Umbraco.Community.Kanban.Contentment/Umbraco.Community.Kanban.Contentment.csproj" />
```

In `/Users/gandalf/Source/Repos/your-it-team-cloud/src/YourITTeam/YourITTeam.csproj`, in the `ItemGroup` holding the existing Kanban `ProjectReference`:

```xml
    <ProjectReference Include="../../../Umbraco.Community.Kanban/src/Umbraco.Community.Kanban.Contentment/Umbraco.Community.Kanban.Contentment.csproj" />
```

The site already has `Umbraco.Community.Contentment` as a `PackageReference` at 7.0.1, so nothing else is needed. The Kanban repo's own `Directory.Packages.props` governs the referenced project, because MSBuild resolves it from the project's own directory upwards.

- [ ] **Step 10: Verify the site builds**

Run: `cd /Users/gandalf/Source/Repos/your-it-team-cloud && dotnet build src/YourITTeam/YourITTeam.csproj`

Expected: build succeeds. **Do not run any `git` command in this repository** — leave both edits uncommitted for the user to review.

- [ ] **Step 11: Report**

State: the test count, that the site builds, and that the two site files are modified but uncommitted. Then hand over the manual verification from the design: point a board's lane property at a booking's `status`, leave "Define lanes manually" off, and confirm the lanes are the enum's values with the unassigned lane last.

---

## Notes for the implementer

- **`DataListItem.Value` is `string?`.** The `ToLane` mapping uses `item.Value!` because blank values are filtered out immediately before. Do not add a second null check; do not remove the filter.
- **`JsonNode.ToString()` is indented**, so `ValueJson` may contain newlines. That is harmless — Contentment's own code takes the same `ToString()` — which is why the parser tests assert with `Contain` rather than an exact string.
- **Do not add a colour.** `DataListItem` has a `Properties` extension bag that could carry one; reading it was considered and rejected in the design (§2, Out).
- **If a test needs Contentment's DI**, stop. Everything in Tasks 1-3 is designed to avoid it, and Task 4 asserts registrations for exactly that reason.
