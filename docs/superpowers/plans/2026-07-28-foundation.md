# Kanban Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the package skeleton, the two Kanban configuration data types, and the server-side lane resolution pipeline, so an editor can create and configure a Kanban Board or Kanban Calendar data type and the server can resolve its lanes.

**Architecture:** A Razor Class Library hosts the C# services and, via a Vite build, an embedded Lit client under `wwwroot/App_Plugins/UmbracoCommunityKanban`. A configuration is a data type instance; two `DataEditor`s define their configuration schemas with read-only value editors so placing one on a document never marks it dirty. Lane resolution is a small pipeline — a lookup finds the lane property's data type, a source turns its configuration into lanes, then overrides and a colour cycle are applied.

**Tech Stack:** .NET 10, Umbraco CMS 18.0.2, xUnit + FluentAssertions, TypeScript, Lit 3, Vite 7.

## Global Constraints

- Target framework is `net10.0`. Umbraco packages are pinned to `18.0.2` via central package management.
- Namespace and package id root is `Umbraco.Community.Kanban`. The App_Plugins folder is `UmbracoCommunityKanban`.
- File-scoped namespaces. Primary constructors where a class only stores its injected dependencies.
- **Private fields take no underscore prefix.** `private readonly ILogger logger;` — not `_logger`.
- Nullable reference types enabled; `ImplicitUsings` enabled.
- Tests use xUnit with FluentAssertions and hand-written fakes. **No mocking framework** — if something is hard to fake, the seam is wrong.
- The core package must never reference Contentment.
- Property editor aliases, fixed: `Umbraco.Community.Kanban.Board` and `Umbraco.Community.Kanban.Calendar`.
- The Management API base path is `/kanban/api`, api name `kanban`.
- Commit after every task. Conventional commit prefixes (`feat:`, `test:`, `chore:`).

---

### Task 1: Repository and solution scaffolding

**Files:**
- Create: `.gitignore`
- Create: `Directory.Build.props`
- Create: `Directory.Packages.props`
- Create: `Umbraco.Community.Kanban.slnx`
- Create: `src/Umbraco.Community.Kanban/Umbraco.Community.Kanban.csproj`
- Create: `src/Umbraco.Community.Kanban/Constants.cs`
- Create: `tests/Umbraco.Community.Kanban.Tests/Umbraco.Community.Kanban.Tests.csproj`
- Create: `tests/Umbraco.Community.Kanban.Tests/GlobalUsings.cs`
- Create: `tests/Umbraco.Community.Kanban.Tests/ConstantsTests.cs`

**Interfaces:**
- Consumes: nothing.
- Produces: `Umbraco.Community.Kanban.Constants` with `PackageAlias`, `PluginAlias`, `ApiName`, `ManagementApiPath`, `BoardEditorAlias`, `CalendarEditorAlias`, `BoardEditorUiAlias`, `CalendarEditorUiAlias` — all `const string`.

- [ ] **Step 1: Create the .gitignore**

```gitignore
bin/
obj/
node_modules/
.vs/
.vscode/
*.user
src/Umbraco.Community.Kanban/wwwroot/App_Plugins/UmbracoCommunityKanban/
```

The built client output is generated, so it is ignored in source control and produced by the build.

- [ ] **Step 2: Create Directory.Build.props**

```xml
<Project>
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <LangVersion>latest</LangVersion>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>
  </PropertyGroup>
</Project>
```

- [ ] **Step 3: Create Directory.Packages.props**

```xml
<Project>
  <PropertyGroup>
    <ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>
  </PropertyGroup>
  <ItemGroup>
    <PackageVersion Include="Umbraco.Cms.Web.Website" Version="18.0.2" />
    <PackageVersion Include="Umbraco.Cms.Api.Management" Version="18.0.2" />
  </ItemGroup>
  <ItemGroup>
    <PackageVersion Include="Microsoft.NET.Test.Sdk" Version="17.12.0" />
    <PackageVersion Include="xunit" Version="2.9.2" />
    <PackageVersion Include="xunit.runner.visualstudio" Version="2.8.2" />
    <PackageVersion Include="FluentAssertions" Version="6.12.2" />
  </ItemGroup>
</Project>
```

- [ ] **Step 4: Create the RCL project file**

`src/Umbraco.Community.Kanban/Umbraco.Community.Kanban.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk.Razor">
  <PropertyGroup>
    <AddRazorSupportForMvc>true</AddRazorSupportForMvc>
    <StaticWebAssetBasePath>/</StaticWebAssetBasePath>
    <EnableDefaultContentItems>true</EnableDefaultContentItems>
  </PropertyGroup>

  <PropertyGroup>
    <PackageId>Umbraco.Community.Kanban</PackageId>
    <Product>Umbraco.Community.Kanban</Product>
    <Title>Umbraco.Community.Kanban</Title>
    <Description>Kanban board and calendar views for Umbraco child nodes.</Description>
    <PackageTags>umbraco plugin package umbraco-marketplace kanban board calendar collection listview</PackageTags>
    <RootNamespace>Umbraco.Community.Kanban</RootNamespace>
    <Authors>Your IT Group</Authors>
    <PackageProjectUrl>https://github.com/YourITGroup/Umbraco.Community.Kanban</PackageProjectUrl>
    <RepositoryUrl>https://github.com/YourITGroup/Umbraco.Community.Kanban</RepositoryUrl>
    <RepositoryType>git</RepositoryType>
    <PackageLicenseExpression>MIT</PackageLicenseExpression>
    <IncludeSymbols>true</IncludeSymbols>
    <SymbolPackageFormat>snupkg</SymbolPackageFormat>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Umbraco.Cms.Web.Website" />
    <PackageReference Include="Umbraco.Cms.Api.Management" />
    <InternalsVisibleTo Include="Umbraco.Community.Kanban.Tests" />
  </ItemGroup>

  <ItemGroup>
    <!-- The client sources are built by Vite into wwwroot; they are not compiled or packed. -->
    <Content Remove="Client\**" />
    <None Include="Client\public\umbraco-package.json" Pack="false" />
  </ItemGroup>
</Project>
```

- [ ] **Step 5: Write the failing test for Constants**

`tests/Umbraco.Community.Kanban.Tests/ConstantsTests.cs`:

```csharp
namespace Umbraco.Community.Kanban.Tests;

public class ConstantsTests
{
    [Fact]
    public void EditorAliases_AreTheDocumentedValues()
    {
        Constants.BoardEditorAlias.Should().Be("Umbraco.Community.Kanban.Board");
        Constants.CalendarEditorAlias.Should().Be("Umbraco.Community.Kanban.Calendar");
    }

    [Fact]
    public void ManagementApiPath_IsUnderTheKanbanPrefix()
    {
        Constants.ManagementApiPath.Should().Be("/kanban/api");
        Constants.ApiName.Should().Be("kanban");
    }
}
```

`GlobalUsings.cs`:

```csharp
global using FluentAssertions;
global using Xunit;
```

`tests/Umbraco.Community.Kanban.Tests/Umbraco.Community.Kanban.Tests.csproj`:

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
    <ProjectReference Include="..\..\src\Umbraco.Community.Kanban\Umbraco.Community.Kanban.csproj" />
  </ItemGroup>
</Project>
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `dotnet test tests/Umbraco.Community.Kanban.Tests`
Expected: compile error — `Constants` does not exist.

- [ ] **Step 7: Write Constants**

`src/Umbraco.Community.Kanban/Constants.cs`:

```csharp
namespace Umbraco.Community.Kanban;

public static class Constants
{
    public const string PackageAlias = "Umbraco.Community.Kanban";
    public const string PluginAlias = "UmbracoCommunityKanban";

    public const string ApiName = "kanban";
    public const string ManagementApiPath = "/kanban/api";

    public const string BoardEditorAlias = "Umbraco.Community.Kanban.Board";
    public const string CalendarEditorAlias = "Umbraco.Community.Kanban.Calendar";

    public const string BoardEditorUiAlias = "Umb.Community.Kanban.PropertyEditorUi.Board";
    public const string CalendarEditorUiAlias = "Umb.Community.Kanban.PropertyEditorUi.Calendar";
}
```

- [ ] **Step 8: Create the solution and add the projects**

```bash
dotnet new sln --format slnx -n Umbraco.Community.Kanban
dotnet sln add src/Umbraco.Community.Kanban/Umbraco.Community.Kanban.csproj
dotnet sln add tests/Umbraco.Community.Kanban.Tests/Umbraco.Community.Kanban.Tests.csproj
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `dotnet test`
Expected: PASS, 2 tests.

- [ ] **Step 10: Commit**

```bash
git add .
git commit -m "chore: scaffold solution, RCL and test project"
```

---

### Task 2: Client build pipeline

**Files:**
- Create: `src/Umbraco.Community.Kanban/Client/package.json`
- Create: `src/Umbraco.Community.Kanban/Client/tsconfig.json`
- Create: `src/Umbraco.Community.Kanban/Client/vite.config.ts`
- Create: `src/Umbraco.Community.Kanban/Client/vitest.config.ts`
- Create: `src/Umbraco.Community.Kanban/Client/public/umbraco-package.json`
- Create: `src/Umbraco.Community.Kanban/Client/src/bundle.manifests.ts`
- Create: `src/Umbraco.Community.Kanban/Client/src/constants.ts`
- Test: `src/Umbraco.Community.Kanban/Client/src/constants.test.ts`

**Interfaces:**
- Consumes: `Constants` aliases from Task 1 — the TypeScript constants must match them exactly.
- Produces: `KANBAN_BOARD_EDITOR_ALIAS`, `KANBAN_CALENDAR_EDITOR_ALIAS`, `KANBAN_BOARD_EDITOR_UI_ALIAS`, `KANBAN_CALENDAR_EDITOR_UI_ALIAS`, `KANBAN_API_PATH` exported from `src/constants.ts`; a `manifests` array exported from `src/bundle.manifests.ts`.

- [ ] **Step 1: Create package.json**

```json
{
  "name": "umbraco-community-kanban",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "tsc --noEmit && vite build",
    "watch": "vite build --watch",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "engines": { "node": ">=22" },
  "devDependencies": {
    "@umbraco-cms/backoffice": "^18.0.0",
    "@types/node": "^22.0.0",
    "lit": "^3.3.0",
    "typescript": "~5.8.3",
    "vite": "^7.0.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "experimentalDecorators": true,
    "useDefineForClassFields": false,
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src/**/*.ts"]
}
```

`useDefineForClassFields: false` and `experimentalDecorators: true` are required for Lit's `@property`/`@state` decorators to work.

- [ ] **Step 3: Create vite.config.ts**

```ts
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: { alias: { '@': resolve(__dirname, './src') } },
  build: {
    lib: {
      entry: 'src/bundle.manifests.ts',
      formats: ['es'],
      fileName: 'umbraco-community-kanban',
    },
    outDir: '../wwwroot/App_Plugins/UmbracoCommunityKanban',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: { external: [/^@umbraco/] },
  },
  base: '/App_Plugins/UmbracoCommunityKanban/',
});
```

`external: [/^@umbraco/]` is essential — the backoffice supplies those modules at runtime via its import map. Bundling them produces a second copy of the framework and the extension silently fails to register.

- [ ] **Step 4: Create vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: { alias: { '@': resolve(__dirname, './src') } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
```

- [ ] **Step 5: Write the failing test**

`src/constants.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  KANBAN_BOARD_EDITOR_ALIAS,
  KANBAN_CALENDAR_EDITOR_ALIAS,
  KANBAN_API_PATH,
} from './constants.js';

describe('constants', () => {
  it('match the server-side editor aliases', () => {
    expect(KANBAN_BOARD_EDITOR_ALIAS).toBe('Umbraco.Community.Kanban.Board');
    expect(KANBAN_CALENDAR_EDITOR_ALIAS).toBe('Umbraco.Community.Kanban.Calendar');
  });

  it('points at the kanban management api', () => {
    expect(KANBAN_API_PATH).toBe('/umbraco/kanban/api/v1');
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `cd src/Umbraco.Community.Kanban/Client && npm install && npm test`
Expected: FAIL — cannot resolve `./constants.js`.

- [ ] **Step 7: Write constants.ts and the bundle entry**

`src/constants.ts`:

```ts
export const KANBAN_BOARD_EDITOR_ALIAS = 'Umbraco.Community.Kanban.Board';
export const KANBAN_CALENDAR_EDITOR_ALIAS = 'Umbraco.Community.Kanban.Calendar';
export const KANBAN_BOARD_EDITOR_UI_ALIAS = 'Umb.Community.Kanban.PropertyEditorUi.Board';
export const KANBAN_CALENDAR_EDITOR_UI_ALIAS = 'Umb.Community.Kanban.PropertyEditorUi.Calendar';
export const KANBAN_API_PATH = '/umbraco/kanban/api/v1';
```

`src/bundle.manifests.ts`:

```ts
export const manifests: Array<UmbExtensionManifest> = [];
```

The array is empty for now. Tasks 14–16 add the property editor manifests to it.

- [ ] **Step 8: Create public/umbraco-package.json**

```json
{
  "id": "Umbraco.Community.Kanban",
  "name": "Umbraco.Community.Kanban",
  "version": "1.0.0",
  "allowPackageTelemetry": true,
  "importmap": {
    "imports": {
      "@umbraco-community/kanban": "/App_Plugins/UmbracoCommunityKanban/umbraco-community-kanban.js"
    }
  },
  "extensions": [
    {
      "type": "bundle",
      "alias": "Umbraco.Community.Kanban.Bundle",
      "name": "Umbraco Community Kanban Bundle",
      "js": "/App_Plugins/UmbracoCommunityKanban/umbraco-community-kanban.js"
    }
  ]
}
```

The `importmap` entry is what lets a third-party host — the planned Bookings workspace — do `import { … } from '@umbraco-community/kanban'`.

- [ ] **Step 9: Run the test and the build to verify both pass**

Run: `npm test && npm run build`
Expected: tests PASS; build writes `umbraco-community-kanban.js` and `umbraco-package.json` into `../wwwroot/App_Plugins/UmbracoCommunityKanban/`.

Confirm the output exists: `ls ../wwwroot/App_Plugins/UmbracoCommunityKanban/`

- [ ] **Step 10: Commit**

```bash
git add src/Umbraco.Community.Kanban/Client package-lock.json
git commit -m "chore: add Vite/Lit client build pipeline"
```

---

### Task 3: Lane model and the lane source contract

**Files:**
- Create: `src/Umbraco.Community.Kanban/Models/KanbanLane.cs`
- Create: `src/Umbraco.Community.Kanban/Models/KanbanLaneOverride.cs`
- Create: `src/Umbraco.Community.Kanban/Models/KanbanManualLane.cs`
- Create: `src/Umbraco.Community.Kanban/Models/KanbanBoardConfiguration.cs`
- Create: `src/Umbraco.Community.Kanban/Lanes/KanbanLaneSourceContext.cs`
- Create: `src/Umbraco.Community.Kanban/Lanes/IKanbanLaneSource.cs`
- Test: `tests/Umbraco.Community.Kanban.Tests/Lanes/KanbanLaneTests.cs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `KanbanLane` — mutable class with `string Value`, `string Name`, `string? Colour`, `string? Icon`, `bool IsUnassigned`, `bool AcceptsDrops`.
  - `KanbanLaneOverride` — `string Value`, `string? Colour`, `string? Icon`, `string? Label`.
  - `KanbanManualLane` — `string Value`, `string? Label`, `string? Colour`, `string? Icon`.
  - `KanbanBoardConfiguration` — `string? LaneProperty`, `string? LaneSource`, `KanbanManualLane[] ManualLanes`, `KanbanLaneOverride[] LaneOverrides`, `string[] CardProperties`, `int LanePageSize`, `bool AllowDrag`, `Guid[] AppliesTo`, `string? TabName`, `string? TabIcon`.

`KanbanManualLane` is a separate type from `KanbanLane` on purpose. `KanbanLane` is a runtime
object carrying `IsUnassigned` and `AcceptsDrops`; if the configuration reused it, every hand-typed
lane would serialise those two fields into the stored data type configuration as noise.
  - `KanbanLaneSourceContext(string EditorAlias, IDictionary<string, object> ConfigurationData, KanbanBoardConfiguration Configuration)`.
  - `IKanbanLaneSource` with `string Alias`, `bool CanHandle(KanbanLaneSourceContext)`, `Task<IReadOnlyList<KanbanLane>> GetLanesAsync(KanbanLaneSourceContext)`.

- [ ] **Step 1: Write the failing test**

`tests/Umbraco.Community.Kanban.Tests/Lanes/KanbanLaneTests.cs`:

```csharp
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Tests.Lanes;

public class KanbanLaneTests
{
    [Fact]
    public void ALane_AcceptsDropsByDefault()
    {
        var lane = new KanbanLane { Value = "open", Name = "Open" };

        lane.AcceptsDrops.Should().BeTrue();
        lane.IsUnassigned.Should().BeFalse();
        lane.Colour.Should().BeNull();
    }

    [Fact]
    public void TheUnassignedLane_IsDragOutOnly()
    {
        var lane = KanbanLane.Unassigned();

        lane.IsUnassigned.Should().BeTrue();
        lane.AcceptsDrops.Should().BeFalse();
        lane.Colour.Should().Be("grey");
        lane.Value.Should().BeEmpty();
    }

    [Fact]
    public void BoardConfiguration_DefaultsLanePageSizeTo25AndAllowsDrag()
    {
        var config = new KanbanBoardConfiguration();

        config.LanePageSize.Should().Be(25);
        config.AllowDrag.Should().BeTrue();
        config.ManualLanes.Should().BeEmpty();
        config.LaneOverrides.Should().BeEmpty();
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test --filter FullyQualifiedName~KanbanLaneTests`
Expected: compile error — the types do not exist.

- [ ] **Step 3: Write the models**

`Models/KanbanLane.cs`:

```csharp
namespace Umbraco.Community.Kanban.Models;

/// <summary>
/// A single swimlane on a board.
/// </summary>
public class KanbanLane
{
    /// <summary>The stored property value that puts a card in this lane.</summary>
    public string Value { get; set; } = string.Empty;

    /// <summary>The label shown in the lane header.</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>An Umbraco colour alias, a raw CSS colour, or null to take one from the cycle.</summary>
    public string? Colour { get; set; }

    public string? Icon { get; set; }

    /// <summary>True for the synthetic lane collecting empty and unmatched values.</summary>
    public bool IsUnassigned { get; set; }

    /// <summary>False for lanes a card may leave but not be dropped into.</summary>
    public bool AcceptsDrops { get; set; } = true;

    /// <summary>Creates the synthetic unassigned lane, which is always neutral and drag-out-only.</summary>
    public static KanbanLane Unassigned() => new()
    {
        Value = string.Empty,
        Name = "(Unassigned)",
        Colour = "grey",
        IsUnassigned = true,
        AcceptsDrops = false,
    };
}
```

`Models/KanbanLaneOverride.cs`:

```csharp
namespace Umbraco.Community.Kanban.Models;

/// <summary>
/// An editor-supplied appearance override for one lane, applied whatever source produced it.
/// </summary>
public class KanbanLaneOverride
{
    /// <summary>The lane value this override targets.</summary>
    public string Value { get; set; } = string.Empty;

    public string? Colour { get; set; }

    public string? Icon { get; set; }

    /// <summary>Replaces the label the source supplied.</summary>
    public string? Label { get; set; }
}
```

`Models/KanbanManualLane.cs`:

```csharp
namespace Umbraco.Community.Kanban.Models;

/// <summary>
/// A lane typed by hand into the board configuration.
/// Separate from <see cref="KanbanLane"/> so runtime-only fields never end up
/// in the stored data type configuration.
/// </summary>
public class KanbanManualLane
{
    public string Value { get; set; } = string.Empty;

    /// <summary>The lane header text. Falls back to <see cref="Value"/> when empty.</summary>
    public string? Label { get; set; }

    public string? Colour { get; set; }

    public string? Icon { get; set; }
}
```

`Models/KanbanBoardConfiguration.cs`:

```csharp
using Umbraco.Cms.Core.PropertyEditors;

namespace Umbraco.Community.Kanban.Models;

/// <summary>
/// The configuration stored on a Kanban Board data type.
/// </summary>
public class KanbanBoardConfiguration
{
    [ConfigurationField("laneProperty")]
    public string? LaneProperty { get; set; }

    [ConfigurationField("laneSource")]
    public string? LaneSource { get; set; }

    [ConfigurationField("manualLanes")]
    public KanbanManualLane[] ManualLanes { get; set; } = [];

    [ConfigurationField("laneOverrides")]
    public KanbanLaneOverride[] LaneOverrides { get; set; } = [];

    [ConfigurationField("cardProperties")]
    public string[] CardProperties { get; set; } = [];

    [ConfigurationField("lanePageSize")]
    public int LanePageSize { get; set; } = 25;

    [ConfigurationField("allowDrag")]
    public bool AllowDrag { get; set; } = true;

    [ConfigurationField("appliesTo")]
    public Guid[] AppliesTo { get; set; } = [];

    [ConfigurationField("tabName")]
    public string? TabName { get; set; }

    [ConfigurationField("tabIcon")]
    public string? TabIcon { get; set; }
}
```

`Lanes/KanbanLaneSourceContext.cs`:

```csharp
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Lanes;

/// <summary>
/// Everything a lane source needs, with no dependency on <c>IDataType</c> so sources stay trivially testable.
/// </summary>
/// <param name="EditorAlias">The property editor alias of the lane property's data type.</param>
/// <param name="ConfigurationData">That data type's raw configuration dictionary.</param>
/// <param name="Configuration">The board configuration being resolved.</param>
public sealed record KanbanLaneSourceContext(
    string EditorAlias,
    IDictionary<string, object> ConfigurationData,
    KanbanBoardConfiguration Configuration);
```

`Lanes/IKanbanLaneSource.cs`:

```csharp
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Lanes;

/// <summary>
/// Turns a lane property's data type configuration into swimlanes.
/// Implement this to support a property editor the package does not know about.
/// </summary>
public interface IKanbanLaneSource
{
    /// <summary>A stable alias, used when a configuration pins a specific source.</summary>
    string Alias { get; }

    bool CanHandle(KanbanLaneSourceContext context);

    Task<IReadOnlyList<KanbanLane>> GetLanesAsync(KanbanLaneSourceContext context);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `dotnet test --filter FullyQualifiedName~KanbanLaneTests`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat: add lane model and lane source contract"
```

---

### Task 4: Core editor lane source

**Files:**
- Create: `src/Umbraco.Community.Kanban/Lanes/Sources/CoreListEditorLaneSource.cs`
- Test: `tests/Umbraco.Community.Kanban.Tests/Lanes/CoreListEditorLaneSourceTests.cs`

**Interfaces:**
- Consumes: `IKanbanLaneSource`, `KanbanLaneSourceContext`, `KanbanLane` from Task 3.
- Produces: `CoreListEditorLaneSource` with `Alias == "core-list-editor"`, handling editor aliases `Umbraco.DropDown.Flexible`, `Umbraco.RadioButtonList` and `Umbraco.CheckBoxList`.

Those three editors store their options under the `items` configuration key. In Umbraco 18 the value is a `string[]` when the data type was saved by the current backoffice, but it can deserialise as a `List<object>` or a `JsonArray` depending on how it reached us, so the parser handles all three shapes.

- [ ] **Step 1: Write the failing test**

`tests/Umbraco.Community.Kanban.Tests/Lanes/CoreListEditorLaneSourceTests.cs`:

```csharp
using System.Text.Json.Nodes;
using Umbraco.Community.Kanban.Lanes;
using Umbraco.Community.Kanban.Lanes.Sources;
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Tests.Lanes;

public class CoreListEditorLaneSourceTests
{
    private static KanbanLaneSourceContext Context(string editorAlias, object items) =>
        new(editorAlias, new Dictionary<string, object> { ["items"] = items }, new KanbanBoardConfiguration());

    [Theory]
    [InlineData("Umbraco.DropDown.Flexible")]
    [InlineData("Umbraco.RadioButtonList")]
    [InlineData("Umbraco.CheckBoxList")]
    public void CanHandle_TheThreeCoreListEditors(string editorAlias)
    {
        var source = new CoreListEditorLaneSource();

        source.CanHandle(Context(editorAlias, new[] { "a" })).Should().BeTrue();
    }

    [Fact]
    public void CanHandle_IsFalseForOtherEditors()
    {
        var source = new CoreListEditorLaneSource();

        source.CanHandle(Context("Umbraco.TextBox", new[] { "a" })).Should().BeFalse();
    }

    [Fact]
    public async Task GetLanes_ReadsAStringArray()
    {
        var source = new CoreListEditorLaneSource();

        var lanes = await source.GetLanesAsync(Context("Umbraco.DropDown.Flexible", new[] { "Open", "Done" }));

        lanes.Select(x => x.Value).Should().Equal("Open", "Done");
        lanes.Select(x => x.Name).Should().Equal("Open", "Done");
    }

    [Fact]
    public async Task GetLanes_ReadsAJsonArray()
    {
        var items = new JsonArray("Open", "Done");
        var source = new CoreListEditorLaneSource();

        var lanes = await source.GetLanesAsync(Context("Umbraco.RadioButtonList", items));

        lanes.Select(x => x.Value).Should().Equal("Open", "Done");
    }

    [Fact]
    public async Task GetLanes_IsEmptyWhenItemsIsMissing()
    {
        var context = new KanbanLaneSourceContext(
            "Umbraco.DropDown.Flexible",
            new Dictionary<string, object>(),
            new KanbanBoardConfiguration());
        var source = new CoreListEditorLaneSource();

        var lanes = await source.GetLanesAsync(context);

        lanes.Should().BeEmpty();
    }

    [Fact]
    public async Task GetLanes_SkipsBlankOptions()
    {
        var source = new CoreListEditorLaneSource();

        var lanes = await source.GetLanesAsync(Context("Umbraco.CheckBoxList", new[] { "Open", "", "  ", "Done" }));

        lanes.Select(x => x.Value).Should().Equal("Open", "Done");
    }
}
```

Blank options are skipped because an empty value is indistinguishable from "no value set", which belongs in the unassigned lane rather than a lane of its own.

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test --filter FullyQualifiedName~CoreListEditorLaneSourceTests`
Expected: compile error — `CoreListEditorLaneSource` does not exist.

- [ ] **Step 3: Write the implementation**

`Lanes/Sources/CoreListEditorLaneSource.cs`:

```csharp
using System.Text.Json.Nodes;
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Lanes.Sources;

/// <summary>
/// Resolves lanes from the core list editors, all of which store their options
/// under the <c>items</c> configuration key.
/// </summary>
public sealed class CoreListEditorLaneSource : IKanbanLaneSource
{
    private static readonly HashSet<string> SupportedEditorAliases = new(StringComparer.OrdinalIgnoreCase)
    {
        "Umbraco.DropDown.Flexible",
        "Umbraco.RadioButtonList",
        "Umbraco.CheckBoxList",
    };

    public string Alias => "core-list-editor";

    public bool CanHandle(KanbanLaneSourceContext context) =>
        SupportedEditorAliases.Contains(context.EditorAlias);

    public Task<IReadOnlyList<KanbanLane>> GetLanesAsync(KanbanLaneSourceContext context)
    {
        IReadOnlyList<KanbanLane> lanes = ReadItems(context.ConfigurationData)
            .Where(item => string.IsNullOrWhiteSpace(item) == false)
            .Select(item => new KanbanLane { Value = item, Name = item })
            .ToList();

        return Task.FromResult(lanes);
    }

    private static IEnumerable<string> ReadItems(IDictionary<string, object> configuration)
    {
        if (configuration.TryGetValue("items", out var value) == false || value is null)
        {
            return [];
        }

        return value switch
        {
            IEnumerable<string> strings => strings,
            JsonArray array => array.Select(node => node?.GetValue<string>() ?? string.Empty),
            System.Collections.IEnumerable enumerable => enumerable
                .Cast<object?>()
                .Select(item => item?.ToString() ?? string.Empty),
            _ => [],
        };
    }
}
```

The `IEnumerable<string>` case must come before the non-generic one, because a `string[]` matches both and the specific branch avoids a needless `ToString()`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `dotnet test --filter FullyQualifiedName~CoreListEditorLaneSourceTests`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat: resolve lanes from core list editors"
```

---

### Task 5: Manual lane source

**Files:**
- Create: `src/Umbraco.Community.Kanban/Lanes/Sources/ManualLaneSource.cs`
- Test: `tests/Umbraco.Community.Kanban.Tests/Lanes/ManualLaneSourceTests.cs`

**Interfaces:**
- Consumes: `IKanbanLaneSource`, `KanbanLaneSourceContext`, `KanbanBoardConfiguration.ManualLanes` from Task 3.
- Produces: `ManualLaneSource` with `Alias == "manual"`. It handles any editor alias, but only when the configuration pins `LaneSource` to `"manual"` — so it never wins by accident.

- [ ] **Step 1: Write the failing test**

`tests/Umbraco.Community.Kanban.Tests/Lanes/ManualLaneSourceTests.cs`:

```csharp
using Umbraco.Community.Kanban.Lanes;
using Umbraco.Community.Kanban.Lanes.Sources;
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Tests.Lanes;

public class ManualLaneSourceTests
{
    private static KanbanLaneSourceContext Context(KanbanBoardConfiguration configuration) =>
        new("Umbraco.TextBox", new Dictionary<string, object>(), configuration);

    [Fact]
    public void CanHandle_OnlyWhenTheConfigurationPinsIt()
    {
        var source = new ManualLaneSource();

        source.CanHandle(Context(new KanbanBoardConfiguration { LaneSource = "manual" })).Should().BeTrue();
        source.CanHandle(Context(new KanbanBoardConfiguration())).Should().BeFalse();
    }

    [Fact]
    public async Task GetLanes_ReturnsTheConfiguredLanesInOrder()
    {
        var configuration = new KanbanBoardConfiguration
        {
            LaneSource = "manual",
            ManualLanes =
            [
                new KanbanManualLane { Value = "todo", Label = "To do", Colour = "blue" },
                new KanbanManualLane { Value = "done", Label = "Done" },
            ],
        };
        var source = new ManualLaneSource();

        var lanes = await source.GetLanesAsync(Context(configuration));

        lanes.Select(x => x.Value).Should().Equal("todo", "done");
        lanes[0].Colour.Should().Be("blue");
        lanes[1].Colour.Should().BeNull();
    }

    [Fact]
    public async Task GetLanes_FallsBackToTheValueWhenNoLabelIsGiven()
    {
        var configuration = new KanbanBoardConfiguration
        {
            LaneSource = "manual",
            ManualLanes = [new KanbanManualLane { Value = "todo", Label = "" }],
        };
        var source = new ManualLaneSource();

        var lanes = await source.GetLanesAsync(Context(configuration));

        lanes[0].Name.Should().Be("todo");
    }

    [Fact]
    public async Task GetLanes_SkipsRowsWithNoValue()
    {
        var configuration = new KanbanBoardConfiguration
        {
            LaneSource = "manual",
            ManualLanes = [new KanbanManualLane { Value = "", Label = "Nameless" }],
        };
        var source = new ManualLaneSource();

        var lanes = await source.GetLanesAsync(Context(configuration));

        lanes.Should().BeEmpty();
    }

    [Fact]
    public async Task GetLanes_ProducesLanesThatAcceptDrops()
    {
        var configuration = new KanbanBoardConfiguration
        {
            LaneSource = "manual",
            ManualLanes = [new KanbanManualLane { Value = "todo", Label = "To do" }],
        };
        var source = new ManualLaneSource();

        var lanes = await source.GetLanesAsync(Context(configuration));

        lanes[0].AcceptsDrops.Should().BeTrue();
        lanes[0].IsUnassigned.Should().BeFalse();
    }
}
```

The source builds fresh `KanbanLane` objects rather than handing out anything the configuration
owns, because colour assignment in Task 6 writes to those objects and a cached data type
configuration must not accumulate colours.

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test --filter FullyQualifiedName~ManualLaneSourceTests`
Expected: compile error — `ManualLaneSource` does not exist.

- [ ] **Step 3: Write the implementation**

`Lanes/Sources/ManualLaneSource.cs`:

```csharp
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Lanes.Sources;

/// <summary>
/// Lanes typed by hand into the board configuration. Works against any property,
/// including plain text, at the cost of drifting if the underlying options change.
/// </summary>
public sealed class ManualLaneSource : IKanbanLaneSource
{
    public const string SourceAlias = "manual";

    public string Alias => SourceAlias;

    public bool CanHandle(KanbanLaneSourceContext context) =>
        string.Equals(context.Configuration.LaneSource, SourceAlias, StringComparison.OrdinalIgnoreCase);

    public Task<IReadOnlyList<KanbanLane>> GetLanesAsync(KanbanLaneSourceContext context)
    {
        IReadOnlyList<KanbanLane> lanes = context.Configuration.ManualLanes
            .Where(lane => string.IsNullOrWhiteSpace(lane.Value) == false)
            .Select(lane => new KanbanLane
            {
                Value = lane.Value,
                Name = string.IsNullOrWhiteSpace(lane.Label) ? lane.Value : lane.Label,
                Colour = lane.Colour,
                Icon = lane.Icon,
            })
            .ToList();

        return Task.FromResult(lanes);
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `dotnet test --filter FullyQualifiedName~ManualLaneSourceTests`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat: add manual lane source"
```

---

### Task 6: Lane palette and colour assignment

**Files:**
- Create: `src/Umbraco.Community.Kanban/Lanes/KanbanLanePalette.cs`
- Create: `src/Umbraco.Community.Kanban/Lanes/KanbanLaneColourAssigner.cs`
- Test: `tests/Umbraco.Community.Kanban.Tests/Lanes/KanbanLaneColourAssignerTests.cs`

**Interfaces:**
- Consumes: `KanbanLane` from Task 3.
- Produces:
  - `KanbanLanePalette.Cycle` — `IReadOnlyList<string>` of the eight non-legacy Umbraco colour aliases.
  - `KanbanLaneColourAssigner.Assign(IReadOnlyList<KanbanLane> lanes)` — assigns colours in place.

- [ ] **Step 1: Write the failing test**

`tests/Umbraco.Community.Kanban.Tests/Lanes/KanbanLaneColourAssignerTests.cs`:

```csharp
using Umbraco.Community.Kanban.Lanes;
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Tests.Lanes;

public class KanbanLaneColourAssignerTests
{
    private static List<KanbanLane> Lanes(int count) =>
        Enumerable.Range(0, count)
            .Select(i => new KanbanLane { Value = $"lane{i}", Name = $"Lane {i}" })
            .ToList();

    [Fact]
    public void Palette_IsTheEightNonLegacyUmbracoColours()
    {
        KanbanLanePalette.Cycle.Should().Equal(
            "yellow", "pink", "blue", "light-blue", "red", "green", "brown", "grey");
    }

    [Fact]
    public void Assign_GivesEachLaneTheColourAtItsIndex()
    {
        var lanes = Lanes(3);

        KanbanLaneColourAssigner.Assign(lanes);

        lanes.Select(x => x.Colour).Should().Equal("yellow", "pink", "blue");
    }

    [Fact]
    public void Assign_WrapsPastTheEndOfThePalette()
    {
        var lanes = Lanes(10);

        KanbanLaneColourAssigner.Assign(lanes);

        lanes[8].Colour.Should().Be("yellow");
        lanes[9].Colour.Should().Be("pink");
    }

    [Fact]
    public void Assign_LeavesExplicitColoursAlone()
    {
        var lanes = Lanes(3);
        lanes[1].Colour = "#ff0000";

        KanbanLaneColourAssigner.Assign(lanes);

        lanes.Select(x => x.Colour).Should().Equal("yellow", "#ff0000", "blue");
    }

    [Fact]
    public void Assign_IndexesFromTheFullOrderSoAnOverrideDoesNotShiftOtherLanes()
    {
        var withoutOverride = Lanes(3);
        KanbanLaneColourAssigner.Assign(withoutOverride);

        var withOverride = Lanes(3);
        withOverride[0].Colour = "#ff0000";
        KanbanLaneColourAssigner.Assign(withOverride);

        withOverride[1].Colour.Should().Be(withoutOverride[1].Colour);
        withOverride[2].Colour.Should().Be(withoutOverride[2].Colour);
    }

    [Fact]
    public void Assign_SkipsTheUnassignedLaneAndLeavesItGrey()
    {
        var lanes = Lanes(2);
        lanes.Add(KanbanLane.Unassigned());

        KanbanLaneColourAssigner.Assign(lanes);

        lanes[2].Colour.Should().Be("grey");
        lanes.Select(x => x.Colour).Should().Equal("yellow", "pink", "grey");
    }

    [Fact]
    public void Assign_IsStableAcrossRepeatedCalls()
    {
        var lanes = Lanes(4);

        KanbanLaneColourAssigner.Assign(lanes);
        var first = lanes.Select(x => x.Colour).ToArray();
        KanbanLaneColourAssigner.Assign(lanes);

        lanes.Select(x => x.Colour).Should().Equal(first);
    }
}
```

`Assign_IndexesFromTheFullOrderSoAnOverrideDoesNotShiftOtherLanes` is the one that fails if you implement the obvious "walk the uncoloured lanes and hand out the next colour" loop. Index by position in the full list, not by a running counter.

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test --filter FullyQualifiedName~KanbanLaneColourAssignerTests`
Expected: compile error — the types do not exist.

- [ ] **Step 3: Write the implementation**

`Lanes/KanbanLanePalette.cs`:

```csharp
namespace Umbraco.Community.Kanban.Lanes;

/// <summary>
/// The colour aliases lanes cycle through when nothing supplies one.
/// These mirror the non-legacy entries of the backoffice's own <c>umbracoColors</c>,
/// the palette behind the content type icon colour picker, minus <c>text</c> —
/// which is a text colour rather than a hue.
/// </summary>
public static class KanbanLanePalette
{
    public static readonly IReadOnlyList<string> Cycle =
    [
        "yellow",
        "pink",
        "blue",
        "light-blue",
        "red",
        "green",
        "brown",
        "grey",
    ];

    /// <summary>The neutral colour used by the unassigned lane.</summary>
    public const string Neutral = "grey";
}
```

`Lanes/KanbanLaneColourAssigner.cs`:

```csharp
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Lanes;

/// <summary>
/// Fills in a colour for lanes that do not already have one.
/// </summary>
public static class KanbanLaneColourAssigner
{
    /// <summary>
    /// Assigns palette colours in place. A lane's colour comes from its index in the
    /// full lane order, so adding an override never re-colours an unrelated lane, and
    /// a lane keeps the same colour on every load.
    /// </summary>
    public static void Assign(IReadOnlyList<KanbanLane> lanes)
    {
        for (var index = 0; index < lanes.Count; index++)
        {
            var lane = lanes[index];

            if (lane.IsUnassigned)
            {
                lane.Colour = KanbanLanePalette.Neutral;
                continue;
            }

            if (string.IsNullOrWhiteSpace(lane.Colour) == false)
            {
                continue;
            }

            lane.Colour = KanbanLanePalette.Cycle[index % KanbanLanePalette.Cycle.Count];
        }
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `dotnet test --filter FullyQualifiedName~KanbanLaneColourAssignerTests`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat: cycle the Umbraco palette for uncoloured lanes"
```

---

### Task 7: Lane override application

**Files:**
- Create: `src/Umbraco.Community.Kanban/Lanes/KanbanLaneOverrideApplier.cs`
- Test: `tests/Umbraco.Community.Kanban.Tests/Lanes/KanbanLaneOverrideApplierTests.cs`

**Interfaces:**
- Consumes: `KanbanLane`, `KanbanLaneOverride` from Task 3.
- Produces: `KanbanLaneOverrideApplier.Apply(IReadOnlyList<KanbanLane> lanes, IReadOnlyList<KanbanLaneOverride> overrides)` returning `IReadOnlyList<KanbanLaneOverride>` — the overrides that matched no lane, for the config UI to flag.

- [ ] **Step 1: Write the failing test**

`tests/Umbraco.Community.Kanban.Tests/Lanes/KanbanLaneOverrideApplierTests.cs`:

```csharp
using Umbraco.Community.Kanban.Lanes;
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Tests.Lanes;

public class KanbanLaneOverrideApplierTests
{
    private static List<KanbanLane> Lanes() =>
    [
        new KanbanLane { Value = "todo", Name = "To do" },
        new KanbanLane { Value = "done", Name = "Done", Colour = "green" },
    ];

    [Fact]
    public void Apply_SetsColourIconAndLabel()
    {
        var lanes = Lanes();
        KanbanLaneOverride[] overrides =
        [
            new() { Value = "todo", Colour = "red", Icon = "icon-alert", Label = "Blocked" },
        ];

        KanbanLaneOverrideApplier.Apply(lanes, overrides);

        lanes[0].Colour.Should().Be("red");
        lanes[0].Icon.Should().Be("icon-alert");
        lanes[0].Name.Should().Be("Blocked");
    }

    [Fact]
    public void Apply_BeatsAColourTheSourceSupplied()
    {
        var lanes = Lanes();
        KanbanLaneOverride[] overrides = [new() { Value = "done", Colour = "brown" }];

        KanbanLaneOverrideApplier.Apply(lanes, overrides);

        lanes[1].Colour.Should().Be("brown");
    }

    [Fact]
    public void Apply_LeavesFieldsTheOverrideDoesNotSet()
    {
        var lanes = Lanes();
        KanbanLaneOverride[] overrides = [new() { Value = "done", Icon = "icon-check" }];

        KanbanLaneOverrideApplier.Apply(lanes, overrides);

        lanes[1].Colour.Should().Be("green");
        lanes[1].Name.Should().Be("Done");
        lanes[1].Icon.Should().Be("icon-check");
    }

    [Fact]
    public void Apply_MatchesLaneValuesCaseInsensitively()
    {
        var lanes = Lanes();
        KanbanLaneOverride[] overrides = [new() { Value = "TODO", Colour = "red" }];

        KanbanLaneOverrideApplier.Apply(lanes, overrides);

        lanes[0].Colour.Should().Be("red");
    }

    [Fact]
    public void Apply_ReturnsOverridesThatMatchedNothing()
    {
        var lanes = Lanes();
        KanbanLaneOverride[] overrides =
        [
            new() { Value = "todo", Colour = "red" },
            new() { Value = "archived", Colour = "grey" },
        ];

        var unmatched = KanbanLaneOverrideApplier.Apply(lanes, overrides);

        unmatched.Select(x => x.Value).Should().Equal("archived");
    }

    [Fact]
    public void Apply_ToleratesNoOverrides()
    {
        var lanes = Lanes();

        var unmatched = KanbanLaneOverrideApplier.Apply(lanes, []);

        unmatched.Should().BeEmpty();
        lanes[0].Colour.Should().BeNull();
    }
}
```

Returning the unmatched overrides rather than dropping them is what lets the config UI flag a renamed dropdown option instead of silently discarding the editor's styling.

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test --filter FullyQualifiedName~KanbanLaneOverrideApplierTests`
Expected: compile error — `KanbanLaneOverrideApplier` does not exist.

- [ ] **Step 3: Write the implementation**

`Lanes/KanbanLaneOverrideApplier.cs`:

```csharp
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Lanes;

/// <summary>
/// Applies editor-supplied appearance overrides on top of whatever the lane source produced.
/// </summary>
public static class KanbanLaneOverrideApplier
{
    /// <summary>
    /// Applies <paramref name="overrides"/> to <paramref name="lanes"/> in place.
    /// </summary>
    /// <returns>
    /// The overrides that matched no lane. These are kept rather than discarded so the
    /// configuration UI can flag them — a renamed option should not silently lose its styling.
    /// </returns>
    public static IReadOnlyList<KanbanLaneOverride> Apply(
        IReadOnlyList<KanbanLane> lanes,
        IReadOnlyList<KanbanLaneOverride> overrides)
    {
        var byValue = lanes.ToDictionary(lane => lane.Value, StringComparer.OrdinalIgnoreCase);
        var unmatched = new List<KanbanLaneOverride>();

        foreach (var laneOverride in overrides)
        {
            if (byValue.TryGetValue(laneOverride.Value, out var lane) == false)
            {
                unmatched.Add(laneOverride);
                continue;
            }

            if (string.IsNullOrWhiteSpace(laneOverride.Colour) == false)
            {
                lane.Colour = laneOverride.Colour;
            }

            if (string.IsNullOrWhiteSpace(laneOverride.Icon) == false)
            {
                lane.Icon = laneOverride.Icon;
            }

            if (string.IsNullOrWhiteSpace(laneOverride.Label) == false)
            {
                lane.Name = laneOverride.Label;
            }
        }

        return unmatched;
    }
}
```

`ToDictionary` throws on duplicate lane values, which is correct — two lanes sharing a value is a resolution bug, not something to paper over.

- [ ] **Step 4: Run the test to verify it passes**

Run: `dotnet test --filter FullyQualifiedName~KanbanLaneOverrideApplierTests`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat: apply per-lane appearance overrides"
```

---

### Task 8: Board property editor

**Files:**
- Create: `src/Umbraco.Community.Kanban/PropertyEditors/KanbanBoardConfigurationEditor.cs`
- Create: `src/Umbraco.Community.Kanban/PropertyEditors/KanbanBoardPropertyEditor.cs`
- Test: `tests/Umbraco.Community.Kanban.Tests/PropertyEditors/KanbanBoardPropertyEditorTests.cs`

**Interfaces:**
- Consumes: `Constants.BoardEditorAlias` from Task 1, `KanbanBoardConfiguration` from Task 3.
- Produces: `KanbanBoardPropertyEditor` registered by `[DataEditor]`, exposing a read-only value editor and a `ConfigurationEditor<KanbanBoardConfiguration>`.

The value editor is read-only so a board placed on a document tab never writes a property value and never marks the document dirty. This mirrors how core's `LabelPropertyEditor` works.

- [ ] **Step 1: Write the failing test**

`tests/Umbraco.Community.Kanban.Tests/PropertyEditors/KanbanBoardPropertyEditorTests.cs`:

```csharp
using Umbraco.Cms.Core.PropertyEditors;
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Tests.PropertyEditors;

public class KanbanBoardPropertyEditorTests
{
    [Fact]
    public void Configuration_DeclaresEveryFieldTheClientEdits()
    {
        var aliases = typeof(KanbanBoardConfiguration)
            .GetProperties()
            .SelectMany(p => p.GetCustomAttributes(typeof(ConfigurationFieldAttribute), false))
            .Cast<ConfigurationFieldAttribute>()
            .Select(a => a.Key)
            .ToArray();

        aliases.Should().BeEquivalentTo(
            "laneProperty",
            "laneSource",
            "manualLanes",
            "laneOverrides",
            "cardProperties",
            "lanePageSize",
            "allowDrag",
            "appliesTo",
            "tabName",
            "tabIcon");
    }

    [Fact]
    public void DataEditorAttribute_UsesTheDocumentedAlias()
    {
        var attribute = typeof(KanbanBoardPropertyEditor)
            .GetCustomAttributes(typeof(DataEditorAttribute), false)
            .Cast<DataEditorAttribute>()
            .Single();

        attribute.Alias.Should().Be(Constants.BoardEditorAlias);
    }
}
```

The first test is the guard against server/client drift: add a `ConfigurationField` here without a
matching setting in the client manifest (Task 14) and the field silently becomes uneditable.

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test --filter FullyQualifiedName~KanbanBoardPropertyEditorTests`
Expected: compile error — `KanbanBoardPropertyEditor` does not exist.

- [ ] **Step 3: Write the configuration editor and property editor**

`PropertyEditors/KanbanBoardConfigurationEditor.cs`:

```csharp
using Umbraco.Cms.Core.IO;
using Umbraco.Cms.Core.PropertyEditors;
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.PropertyEditors;

/// <summary>
/// Configuration editor for the Kanban Board data type.
/// </summary>
public class KanbanBoardConfigurationEditor(IIOHelper ioHelper)
    : ConfigurationEditor<KanbanBoardConfiguration>(ioHelper);
```

`PropertyEditors/KanbanBoardPropertyEditor.cs`:

```csharp
using Umbraco.Cms.Core.IO;
using Umbraco.Cms.Core.PropertyEditors;
using Umbraco.Cms.Core.Serialization;
using Umbraco.Cms.Core.Strings;

namespace Umbraco.Community.Kanban.PropertyEditors;

/// <summary>
/// A Kanban Board configuration. Each data type using this editor is one named board configuration.
/// The value editor is read-only, so placing a board on a document tab never marks the document dirty.
/// </summary>
[DataEditor(Constants.BoardEditorAlias, ValueEditorIsReusable = true)]
public class KanbanBoardPropertyEditor : DataEditor
{
    private readonly IIOHelper ioHelper;

    public KanbanBoardPropertyEditor(IDataValueEditorFactory dataValueEditorFactory, IIOHelper ioHelper)
        : base(dataValueEditorFactory)
    {
        this.ioHelper = ioHelper;
        SupportsReadOnly = true;
    }

    protected override IDataValueEditor CreateValueEditor() =>
        DataValueEditorFactory.Create<KanbanReadOnlyValueEditor>(Attribute!);

    protected override IConfigurationEditor CreateConfigurationEditor() =>
        new KanbanBoardConfigurationEditor(ioHelper);

    /// <summary>
    /// A value editor that never persists anything. Mirrors core's label editor.
    /// </summary>
    internal sealed class KanbanReadOnlyValueEditor(
        IShortStringHelper shortStringHelper,
        IJsonSerializer jsonSerializer,
        IIOHelper ioHelper,
        DataEditorAttribute attribute)
        : DataValueEditor(shortStringHelper, jsonSerializer, ioHelper, attribute)
    {
        public override bool IsReadOnly => true;
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `dotnet test --filter FullyQualifiedName~KanbanBoardPropertyEditorTests`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat: add the Kanban Board property editor"
```

---

### Task 9: Calendar property editor

**Files:**
- Create: `src/Umbraco.Community.Kanban/Models/KanbanCalendarConfiguration.cs`
- Create: `src/Umbraco.Community.Kanban/PropertyEditors/KanbanCalendarConfigurationEditor.cs`
- Create: `src/Umbraco.Community.Kanban/PropertyEditors/KanbanCalendarPropertyEditor.cs`
- Test: `tests/Umbraco.Community.Kanban.Tests/PropertyEditors/KanbanCalendarPropertyEditorTests.cs`

**Interfaces:**
- Consumes: `Constants.CalendarEditorAlias` from Task 1, `KanbanBoardPropertyEditor.KanbanReadOnlyValueEditor` from Task 8.
- Produces: `KanbanCalendarConfiguration` with `string DateProperty` (defaulting to `"updateDate"`), `string[] CardProperties`, `bool ShowAgenda`, `bool AllowDrag`, `Guid[] AppliesTo`, `string? TabName`, `string? TabIcon`; plus `bool IsDragSupported`, a computed property that is false when the date source is `updateDate`.

- [ ] **Step 1: Write the failing test**

`tests/Umbraco.Community.Kanban.Tests/PropertyEditors/KanbanCalendarPropertyEditorTests.cs`:

```csharp
using Umbraco.Cms.Core.PropertyEditors;
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Tests.PropertyEditors;

public class KanbanCalendarPropertyEditorTests
{
    [Fact]
    public void Configuration_DefaultsToTheLastUpdatedDate()
    {
        var configuration = new KanbanCalendarConfiguration();

        configuration.DateProperty.Should().Be("updateDate");
        configuration.ShowAgenda.Should().BeTrue();
    }

    [Fact]
    public void DragIsUnsupported_WhenTheDateSourceIsLastUpdated()
    {
        var configuration = new KanbanCalendarConfiguration { AllowDrag = true };

        configuration.IsDragSupported.Should().BeFalse();
    }

    [Fact]
    public void DragIsSupported_ForARealDateProperty()
    {
        var configuration = new KanbanCalendarConfiguration { DateProperty = "eventDate", AllowDrag = true };

        configuration.IsDragSupported.Should().BeTrue();
    }

    [Fact]
    public void DragIsUnsupported_WhenTheEditorTurnedItOff()
    {
        var configuration = new KanbanCalendarConfiguration { DateProperty = "eventDate", AllowDrag = false };

        configuration.IsDragSupported.Should().BeFalse();
    }

    [Fact]
    public void DataEditorAttribute_UsesTheDocumentedAlias()
    {
        var attribute = typeof(KanbanCalendarPropertyEditor)
            .GetCustomAttributes(typeof(DataEditorAttribute), false)
            .Cast<DataEditorAttribute>()
            .Single();

        attribute.Alias.Should().Be(Constants.CalendarEditorAlias);
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test --filter FullyQualifiedName~KanbanCalendarPropertyEditorTests`
Expected: compile error — the types do not exist.

- [ ] **Step 3: Write the configuration model**

`Models/KanbanCalendarConfiguration.cs`:

```csharp
using System.Text.Json.Serialization;
using Umbraco.Cms.Core.PropertyEditors;

namespace Umbraco.Community.Kanban.Models;

/// <summary>
/// The configuration stored on a Kanban Calendar data type.
/// </summary>
public class KanbanCalendarConfiguration
{
    /// <summary>The system property meaning "last updated", which cannot be written to.</summary>
    public const string UpdateDateAlias = "updateDate";

    [ConfigurationField("dateProperty")]
    public string DateProperty { get; set; } = UpdateDateAlias;

    [ConfigurationField("cardProperties")]
    public string[] CardProperties { get; set; } = [];

    [ConfigurationField("showAgenda")]
    public bool ShowAgenda { get; set; } = true;

    [ConfigurationField("allowDrag")]
    public bool AllowDrag { get; set; } = true;

    [ConfigurationField("appliesTo")]
    public Guid[] AppliesTo { get; set; } = [];

    [ConfigurationField("tabName")]
    public string? TabName { get; set; }

    [ConfigurationField("tabIcon")]
    public string? TabIcon { get; set; }

    /// <summary>
    /// False when the date source is the last-updated timestamp, which is maintained by
    /// Umbraco and cannot be set, so the calendar has to be read-only.
    /// </summary>
    [JsonIgnore]
    public bool IsDragSupported =>
        AllowDrag && string.Equals(DateProperty, UpdateDateAlias, StringComparison.OrdinalIgnoreCase) == false;
}
```

`[JsonIgnore]` keeps the computed property out of the serialised configuration; without it the value would round-trip into the data type's stored configuration as a phantom field.

- [ ] **Step 4: Write the configuration editor and property editor**

`PropertyEditors/KanbanCalendarConfigurationEditor.cs`:

```csharp
using Umbraco.Cms.Core.IO;
using Umbraco.Cms.Core.PropertyEditors;
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.PropertyEditors;

/// <summary>
/// Configuration editor for the Kanban Calendar data type.
/// </summary>
public class KanbanCalendarConfigurationEditor(IIOHelper ioHelper)
    : ConfigurationEditor<KanbanCalendarConfiguration>(ioHelper);
```

`PropertyEditors/KanbanCalendarPropertyEditor.cs`:

```csharp
using Umbraco.Cms.Core.IO;
using Umbraco.Cms.Core.PropertyEditors;

namespace Umbraco.Community.Kanban.PropertyEditors;

/// <summary>
/// A Kanban Calendar configuration. Each data type using this editor is one named calendar
/// configuration. The value editor is read-only, as with the board editor.
/// </summary>
[DataEditor(Constants.CalendarEditorAlias, ValueEditorIsReusable = true)]
public class KanbanCalendarPropertyEditor : DataEditor
{
    private readonly IIOHelper ioHelper;

    public KanbanCalendarPropertyEditor(IDataValueEditorFactory dataValueEditorFactory, IIOHelper ioHelper)
        : base(dataValueEditorFactory)
    {
        this.ioHelper = ioHelper;
        SupportsReadOnly = true;
    }

    protected override IDataValueEditor CreateValueEditor() =>
        DataValueEditorFactory.Create<KanbanBoardPropertyEditor.KanbanReadOnlyValueEditor>(Attribute!);

    protected override IConfigurationEditor CreateConfigurationEditor() =>
        new KanbanCalendarConfigurationEditor(ioHelper);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `dotnet test --filter FullyQualifiedName~KanbanCalendarPropertyEditorTests`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "feat: add the Kanban Calendar property editor"
```

---

### Task 10: Lane resolver

**Files:**
- Create: `src/Umbraco.Community.Kanban/Lanes/IKanbanPropertyDataTypeLookup.cs`
- Create: `src/Umbraco.Community.Kanban/Lanes/KanbanPropertyDataTypeLookup.cs`
- Create: `src/Umbraco.Community.Kanban/Lanes/KanbanLaneSourceCollection.cs`
- Create: `src/Umbraco.Community.Kanban/Lanes/IKanbanLaneResolver.cs`
- Create: `src/Umbraco.Community.Kanban/Lanes/KanbanLaneResolver.cs`
- Test: `tests/Umbraco.Community.Kanban.Tests/Lanes/KanbanLaneResolverTests.cs`
- Test: `tests/Umbraco.Community.Kanban.Tests/Fakes/FakePropertyDataTypeLookup.cs`

**Interfaces:**
- Consumes: everything from Tasks 3–7.
- Produces:
  - `KanbanPropertyDataType(string EditorAlias, IDictionary<string, object> ConfigurationData)`.
  - `IKanbanPropertyDataTypeLookup.GetAsync(Guid contentTypeKey, string propertyAlias)` returning `Task<KanbanPropertyDataType?>`.
  - `KanbanLaneSourceCollection` / `KanbanLaneSourceCollectionBuilder` — Umbraco's ordered collection pattern.
  - `IKanbanLaneResolver.ResolveAsync(Guid contentTypeKey, KanbanBoardConfiguration configuration)` returning `Task<KanbanLaneResolution>`.
  - `KanbanLaneResolution(IReadOnlyList<KanbanLane> Lanes, IReadOnlyList<KanbanLaneOverride> UnmatchedOverrides)`.

Resolution order: find the lane property's data type → build a context → pick the first source that can handle it, preferring one pinned by `LaneSource` → apply overrides → assign colours → append the unassigned lane.

- [ ] **Step 1: Write the fake and the failing test**

`tests/Umbraco.Community.Kanban.Tests/Fakes/FakePropertyDataTypeLookup.cs`:

```csharp
using Umbraco.Community.Kanban.Lanes;

namespace Umbraco.Community.Kanban.Tests.Fakes;

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

`tests/Umbraco.Community.Kanban.Tests/Lanes/KanbanLaneResolverTests.cs`:

```csharp
using Umbraco.Community.Kanban.Lanes;
using Umbraco.Community.Kanban.Lanes.Sources;
using Umbraco.Community.Kanban.Models;
using Umbraco.Community.Kanban.Tests.Fakes;

namespace Umbraco.Community.Kanban.Tests.Lanes;

public class KanbanLaneResolverTests
{
    private static readonly Guid ContentTypeKey = Guid.Parse("8f6f5f4e-0000-4000-8000-000000000001");

    private static KanbanLaneResolver Resolver(IKanbanPropertyDataTypeLookup lookup) =>
        new(lookup, new KanbanLaneSourceCollection(() => [new ManualLaneSource(), new CoreListEditorLaneSource()]));

    [Fact]
    public async Task Resolve_UsesTheSourceThatHandlesTheEditor()
    {
        var lookup = new FakePropertyDataTypeLookup()
            .Add("status", "Umbraco.DropDown.Flexible", new Dictionary<string, object> { ["items"] = new[] { "Open", "Done" } });
        var configuration = new KanbanBoardConfiguration { LaneProperty = "status" };

        var result = await Resolver(lookup).ResolveAsync(ContentTypeKey, configuration);

        result.Lanes.Where(x => x.IsUnassigned == false).Select(x => x.Value).Should().Equal("Open", "Done");
    }

    [Fact]
    public async Task Resolve_PrefersASourcePinnedByConfiguration()
    {
        var lookup = new FakePropertyDataTypeLookup()
            .Add("status", "Umbraco.DropDown.Flexible", new Dictionary<string, object> { ["items"] = new[] { "Open" } });
        var configuration = new KanbanBoardConfiguration
        {
            LaneProperty = "status",
            LaneSource = "manual",
            ManualLanes = [new KanbanManualLane { Value = "custom", Label = "Custom" }],
        };

        var result = await Resolver(lookup).ResolveAsync(ContentTypeKey, configuration);

        result.Lanes.Where(x => x.IsUnassigned == false).Select(x => x.Value).Should().Equal("custom");
    }

    [Fact]
    public async Task Resolve_AlwaysAppendsTheUnassignedLaneLast()
    {
        var lookup = new FakePropertyDataTypeLookup()
            .Add("status", "Umbraco.DropDown.Flexible", new Dictionary<string, object> { ["items"] = new[] { "Open" } });
        var configuration = new KanbanBoardConfiguration { LaneProperty = "status" };

        var result = await Resolver(lookup).ResolveAsync(ContentTypeKey, configuration);

        result.Lanes.Last().IsUnassigned.Should().BeTrue();
        result.Lanes.Should().ContainSingle(x => x.IsUnassigned);
    }

    [Fact]
    public async Task Resolve_AssignsPaletteColours()
    {
        var lookup = new FakePropertyDataTypeLookup()
            .Add("status", "Umbraco.DropDown.Flexible", new Dictionary<string, object> { ["items"] = new[] { "Open", "Done" } });
        var configuration = new KanbanBoardConfiguration { LaneProperty = "status" };

        var result = await Resolver(lookup).ResolveAsync(ContentTypeKey, configuration);

        result.Lanes[0].Colour.Should().Be("yellow");
        result.Lanes[1].Colour.Should().Be("pink");
    }

    [Fact]
    public async Task Resolve_AppliesOverridesBeforeColours()
    {
        var lookup = new FakePropertyDataTypeLookup()
            .Add("status", "Umbraco.DropDown.Flexible", new Dictionary<string, object> { ["items"] = new[] { "Open", "Done" } });
        var configuration = new KanbanBoardConfiguration
        {
            LaneProperty = "status",
            LaneOverrides = [new KanbanLaneOverride { Value = "Open", Colour = "red", Label = "Blocked" }],
        };

        var result = await Resolver(lookup).ResolveAsync(ContentTypeKey, configuration);

        result.Lanes[0].Colour.Should().Be("red");
        result.Lanes[0].Name.Should().Be("Blocked");
        result.Lanes[1].Colour.Should().Be("pink");
    }

    [Fact]
    public async Task Resolve_ReportsUnmatchedOverrides()
    {
        var lookup = new FakePropertyDataTypeLookup()
            .Add("status", "Umbraco.DropDown.Flexible", new Dictionary<string, object> { ["items"] = new[] { "Open" } });
        var configuration = new KanbanBoardConfiguration
        {
            LaneProperty = "status",
            LaneOverrides = [new KanbanLaneOverride { Value = "Archived", Colour = "grey" }],
        };

        var result = await Resolver(lookup).ResolveAsync(ContentTypeKey, configuration);

        result.UnmatchedOverrides.Select(x => x.Value).Should().Equal("Archived");
    }

    [Fact]
    public async Task Resolve_ReturnsOnlyTheUnassignedLaneWhenNoLanePropertyIsConfigured()
    {
        var result = await Resolver(new FakePropertyDataTypeLookup())
            .ResolveAsync(ContentTypeKey, new KanbanBoardConfiguration());

        result.Lanes.Should().ContainSingle().Which.IsUnassigned.Should().BeTrue();
    }

    [Fact]
    public async Task Resolve_ReturnsOnlyTheUnassignedLaneWhenNoSourceHandlesTheEditor()
    {
        var lookup = new FakePropertyDataTypeLookup()
            .Add("status", "Umbraco.TextBox", new Dictionary<string, object>());
        var configuration = new KanbanBoardConfiguration { LaneProperty = "status" };

        var result = await Resolver(lookup).ResolveAsync(ContentTypeKey, configuration);

        result.Lanes.Should().ContainSingle().Which.IsUnassigned.Should().BeTrue();
    }
}
```

Degrading to a single unassigned lane, rather than throwing, means a half-configured board renders as an obviously-empty board instead of a stack trace.

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test --filter FullyQualifiedName~KanbanLaneResolverTests`
Expected: compile error — the resolver types do not exist.

- [ ] **Step 3: Write the lookup contract and its Umbraco-backed implementation**

`Lanes/IKanbanPropertyDataTypeLookup.cs`:

```csharp
namespace Umbraco.Community.Kanban.Lanes;

/// <summary>The editor alias and configuration of the data type behind a content type property.</summary>
public sealed record KanbanPropertyDataType(string EditorAlias, IDictionary<string, object> ConfigurationData);

/// <summary>
/// Finds the data type behind a property. Exists as a seam so lane resolution can be
/// tested without Umbraco's content type and data type services.
/// </summary>
public interface IKanbanPropertyDataTypeLookup
{
    Task<KanbanPropertyDataType?> GetAsync(Guid contentTypeKey, string propertyAlias);
}
```

`Lanes/KanbanPropertyDataTypeLookup.cs`:

```csharp
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Services;

namespace Umbraco.Community.Kanban.Lanes;

/// <inheritdoc />
public sealed class KanbanPropertyDataTypeLookup(
    IContentTypeService contentTypeService,
    IDataTypeService dataTypeService) : IKanbanPropertyDataTypeLookup
{
    public async Task<KanbanPropertyDataType?> GetAsync(Guid contentTypeKey, string propertyAlias)
    {
        if (string.IsNullOrWhiteSpace(propertyAlias))
        {
            return null;
        }

        IContentType? contentType = contentTypeService.Get(contentTypeKey);
        IPropertyType? propertyType = contentType?
            .CompositionPropertyTypes
            .FirstOrDefault(x => string.Equals(x.Alias, propertyAlias, StringComparison.OrdinalIgnoreCase));

        if (propertyType is null)
        {
            return null;
        }

        IDataType? dataType = await dataTypeService.GetAsync(propertyType.DataTypeKey);

        return dataType is null
            ? null
            : new KanbanPropertyDataType(dataType.EditorAlias, dataType.ConfigurationData);
    }
}
```

`CompositionPropertyTypes` rather than `PropertyTypes` — a lane property inherited from a composition is still a perfectly good lane property.

- [ ] **Step 4: Write the source collection**

`Lanes/KanbanLaneSourceCollection.cs`:

```csharp
using Umbraco.Cms.Core.Composing;

namespace Umbraco.Community.Kanban.Lanes;

/// <summary>
/// The ordered set of registered lane sources. Add your own with
/// <c>builder.KanbanLaneSources().Append&lt;MyLaneSource&gt;()</c>.
/// </summary>
public sealed class KanbanLaneSourceCollection(Func<IEnumerable<IKanbanLaneSource>> items)
    : BuilderCollectionBase<IKanbanLaneSource>(items);

public sealed class KanbanLaneSourceCollectionBuilder
    : OrderedCollectionBuilderBase<KanbanLaneSourceCollectionBuilder, KanbanLaneSourceCollection, IKanbanLaneSource>
{
    protected override KanbanLaneSourceCollectionBuilder This => this;
}
```

- [ ] **Step 5: Write the resolver**

`Lanes/IKanbanLaneResolver.cs`:

```csharp
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Lanes;

/// <summary>The outcome of resolving a board's lanes.</summary>
/// <param name="Lanes">The lanes in display order, always ending with the unassigned lane.</param>
/// <param name="UnmatchedOverrides">Overrides pointing at lane values that no longer resolve.</param>
public sealed record KanbanLaneResolution(
    IReadOnlyList<KanbanLane> Lanes,
    IReadOnlyList<KanbanLaneOverride> UnmatchedOverrides);

public interface IKanbanLaneResolver
{
    Task<KanbanLaneResolution> ResolveAsync(Guid contentTypeKey, KanbanBoardConfiguration configuration);
}
```

`Lanes/KanbanLaneResolver.cs`:

```csharp
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Lanes;

/// <inheritdoc />
public sealed class KanbanLaneResolver(
    IKanbanPropertyDataTypeLookup lookup,
    KanbanLaneSourceCollection sources) : IKanbanLaneResolver
{
    public async Task<KanbanLaneResolution> ResolveAsync(Guid contentTypeKey, KanbanBoardConfiguration configuration)
    {
        var lanes = await GetLanesAsync(contentTypeKey, configuration);

        var unmatched = KanbanLaneOverrideApplier.Apply(lanes, configuration.LaneOverrides);
        lanes.Add(KanbanLane.Unassigned());
        KanbanLaneColourAssigner.Assign(lanes);

        return new KanbanLaneResolution(lanes, unmatched);
    }

    private async Task<List<KanbanLane>> GetLanesAsync(Guid contentTypeKey, KanbanBoardConfiguration configuration)
    {
        if (string.IsNullOrWhiteSpace(configuration.LaneProperty))
        {
            // A manual board does not need a lane property to produce lanes.
            var manualOnly = BuildContext(string.Empty, new Dictionary<string, object>(), configuration);
            return await ResolveFromSourcesAsync(manualOnly);
        }

        var dataType = await lookup.GetAsync(contentTypeKey, configuration.LaneProperty);
        if (dataType is null)
        {
            return [];
        }

        var context = BuildContext(dataType.EditorAlias, dataType.ConfigurationData, configuration);
        return await ResolveFromSourcesAsync(context);
    }

    private async Task<List<KanbanLane>> ResolveFromSourcesAsync(KanbanLaneSourceContext context)
    {
        var source = SelectSource(context);
        if (source is null)
        {
            return [];
        }

        var lanes = await source.GetLanesAsync(context);
        return lanes.ToList();
    }

    private IKanbanLaneSource? SelectSource(KanbanLaneSourceContext context)
    {
        // An explicitly pinned source wins, so an editor can force manual lanes
        // over an editor a built-in source would otherwise claim.
        if (string.IsNullOrWhiteSpace(context.Configuration.LaneSource) == false)
        {
            var pinned = sources.FirstOrDefault(x =>
                string.Equals(x.Alias, context.Configuration.LaneSource, StringComparison.OrdinalIgnoreCase));

            if (pinned is not null && pinned.CanHandle(context))
            {
                return pinned;
            }
        }

        return sources.FirstOrDefault(x => x.CanHandle(context));
    }

    private static KanbanLaneSourceContext BuildContext(
        string editorAlias,
        IDictionary<string, object> configurationData,
        KanbanBoardConfiguration configuration) =>
        new(editorAlias, configurationData, configuration);
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `dotnet test --filter FullyQualifiedName~KanbanLaneResolverTests`
Expected: PASS, 8 tests.

- [ ] **Step 7: Commit**

```bash
git add src tests
git commit -m "feat: resolve lanes from configuration, sources, overrides and palette"
```

---

### Task 11: Dependency injection and the Management API base

> **Corrected after implementation review (see `.superpowers/sdd/2026-07-28-foundation/task-11-report.md`):**
> Umbraco 18's Management API generates its OpenAPI documents with the native
> `Microsoft.AspNetCore.OpenApi` pipeline via `IUmbracoBuilder.AddBackOfficeOpenApiDocument` —
> there is no Swashbuckle (`Swashbuckle.AspNetCore.SwaggerGen`/`SwaggerGenOptions`) in this
> dependency graph at all. Every "Swagger" reference below is replaced with the equivalent
> OpenAPI-document call, matching the pattern `Umbraco.Cms.Api.Management`'s own composition
> uses. Separately, `Umbraco.Cms.Core.Constants.Web.AttributeRouting.BackOfficeToken` is
> `"umbracoBackOffice"` (capital "O"), not `"umbracoBackoffice"` — the test literal below is
> corrected to match.

**Files:**
- Create: `src/Umbraco.Community.Kanban/Extensions/UmbracoBuilderExtensions.cs`
- Create: `src/Umbraco.Community.Kanban/Composers/KanbanComposer.cs`
- Create: `src/Umbraco.Community.Kanban/Configuration/KanbanOpenApiDocument.cs`
- Create: `src/Umbraco.Community.Kanban/Attributes/KanbanVersionedRouteAttribute.cs`
- Create: `src/Umbraco.Community.Kanban/Controllers/KanbanControllerBase.cs`
- Test: `tests/Umbraco.Community.Kanban.Tests/Composing/RegistrationTests.cs`

**Interfaces:**
- Consumes: `IKanbanLaneResolver`, `IKanbanPropertyDataTypeLookup`, `KanbanLaneSourceCollectionBuilder` from Task 10.
- Produces:
  - `IUmbracoBuilder.AddKanban()` — registers services, the lane source collection with both built-ins, and the package's own OpenAPI document.
  - `IUmbracoBuilder.KanbanLaneSources()` — the collection builder, for consumers adding their own sources.
  - `KanbanControllerBase` — the routed, authorised, `[MapToApi(Constants.ApiName)]`-grouped base for every endpoint.

- [ ] **Step 1: Write the failing test**

The registration order (`ManualLaneSource` before `CoreListEditorLaneSource`) is behavioural,
not incidental — `KanbanLaneResolver.SelectSource` (Task 10) prefers a pinned source and only
falls back to the first that can handle the context, so if `AddKanban()` ever registered the two
in the other order, boards without a pin would resolve against the wrong source. Assert this by
exercising the real composition path — `builder.AddKanban()` — rather than constructing a
`KanbanLaneSourceCollection` by hand: a hand-built collection would still pass even if
`AddKanban()` dropped or reordered its `.Append<>()` calls.

`tests/Umbraco.Community.Kanban.Tests/Composing/RegistrationTests.cs`:

```csharp
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Community.Kanban.Controllers;
using Umbraco.Community.Kanban.Extensions;
using Umbraco.Community.Kanban.Lanes;
using Umbraco.Community.Kanban.Lanes.Sources;

namespace Umbraco.Community.Kanban.Tests.Composing;

public class RegistrationTests
{
    [Fact]
    public void AddKanban_RegistersTheBuiltInSources_ManualFirst()
    {
        // Manual must come first so a pinned manual configuration is found before
        // a built-in source claims the editor.
        IUmbracoBuilder builder = CreateUmbracoBuilder();

        builder.AddKanban();
        builder.Build();

        using ServiceProvider provider = builder.Services.BuildServiceProvider();
        var sources = provider.GetRequiredService<KanbanLaneSourceCollection>();

        sources.First().Should().BeOfType<ManualLaneSource>();
        sources.Should().ContainSingle(x => x is CoreListEditorLaneSource);
    }

    [Fact]
    public void AddKanban_RegistersTheLaneResolverAndPropertyDataTypeLookup()
    {
        // Asserted via the service descriptors, not by resolving an instance:
        // KanbanPropertyDataTypeLookup depends on IContentTypeService/IDataTypeService,
        // whose own dependencies (repositories, scope providers, persistence) are wired
        // by Umbraco's full composition — infrastructure this test project deliberately
        // does not stand up (see Fakes/: resolver tests use hand-written fakes instead).
        // Asserting the registration still fails this test if AddKanban() stops
        // registering either service.
        IUmbracoBuilder builder = CreateUmbracoBuilder();

        builder.AddKanban();

        builder.Services.Should().ContainSingle(d =>
            d.ServiceType == typeof(IKanbanLaneResolver) &&
            d.ImplementationType == typeof(KanbanLaneResolver) &&
            d.Lifetime == ServiceLifetime.Singleton);

        builder.Services.Should().ContainSingle(d =>
            d.ServiceType == typeof(IKanbanPropertyDataTypeLookup) &&
            d.ImplementationType == typeof(KanbanPropertyDataTypeLookup) &&
            d.Lifetime == ServiceLifetime.Singleton);
    }

    [Fact]
    public void ControllerBase_IsRoutedUnderTheKanbanApiPath()
    {
        var route = typeof(KanbanControllerBase)
            .GetCustomAttributes(typeof(Umbraco.Cms.Web.Common.Routing.BackOfficeRouteAttribute), true)
            .Cast<Umbraco.Cms.Web.Common.Routing.BackOfficeRouteAttribute>()
            .Single();

        // BackOfficeRouteAttribute derives from RouteAttribute and prefixes the backoffice token,
        // which is substituted with the configured Umbraco path at routing time. The token
        // (Umbraco.Cms.Core.Constants.Web.AttributeRouting.BackOfficeToken) is "umbracoBackOffice"
        // — capital "O" in "Office".
        route.Template.Should().Be("[umbracoBackOffice]/kanban/api/v{version:apiVersion}/");
    }

    /// <summary>
    /// Builds a real <see cref="IUmbracoBuilder"/> using Umbraco's own "primarily for testing"
    /// constructor, with no fakes or mocks — just enough scaffolding (a real <see cref="TypeLoader"/>
    /// over this test assembly) to satisfy the constructor. <see cref="UmbracoBuilder"/> registers
    /// Umbraco's core services itself, so <c>AddKanban()</c> runs against the same DI surface it
    /// would in production.
    /// </summary>
    private static IUmbracoBuilder CreateUmbracoBuilder()
    {
        var services = new ServiceCollection();
        var config = new ConfigurationBuilder().Build();

        var assemblyProvider = new DefaultUmbracoAssemblyProvider(typeof(RegistrationTests).Assembly, NullLoggerFactory.Instance);
        var typeFinder = new TypeFinder(NullLoggerFactory.Instance.CreateLogger<TypeFinder>(), assemblyProvider, null);
        var typeLoader = new TypeLoader(typeFinder, NullLoggerFactory.Instance.CreateLogger<TypeLoader>());

        return new UmbracoBuilder(services, config, typeLoader);
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test --filter FullyQualifiedName~RegistrationTests`
Expected: compile error — `KanbanControllerBase` does not exist.

- [ ] **Step 3: Write the route attribute and controller base**

`Attributes/KanbanVersionedRouteAttribute.cs`:

```csharp
using Umbraco.Cms.Web.Common.Routing;

namespace Umbraco.Community.Kanban.Attributes;

/// <summary>
/// Routes a controller under the package's versioned Management API path.
/// </summary>
public sealed class KanbanVersionedRouteAttribute(string template)
    : BackOfficeRouteAttribute($"{Constants.ManagementApiPath.TrimStart('/')}/v{{version:apiVersion}}/{template.TrimStart('/')}");
```

`Controllers/KanbanControllerBase.cs`:

```csharp
using Microsoft.AspNetCore.Authorization;
using Umbraco.Cms.Api.Common.Attributes;
using Umbraco.Cms.Api.Management.Controllers;
using Umbraco.Cms.Web.Common.Authorization;
using Umbraco.Community.Kanban.Attributes;

namespace Umbraco.Community.Kanban.Controllers;

/// <summary>
/// Base for every Kanban Management API controller. Requires backoffice access;
/// individual endpoints tighten this where they need more.
/// </summary>
[Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
[KanbanVersionedRoute("")]
[MapToApi(Constants.ApiName)]
public abstract class KanbanControllerBase : ManagementApiControllerBase;
```

- [ ] **Step 4: Write the OpenAPI document registration**

Umbraco 18 generates Management API OpenAPI documents with the native
`Microsoft.AspNetCore.OpenApi` pipeline, via `IUmbracoBuilder.AddBackOfficeOpenApiDocument` —
there is no Swashbuckle in this dependency graph. `Umbraco.Cms.Api.Management`'s own
composition (`UmbracoBuilderExtensions.AddManagementApi`) registers its document the same way,
chaining a title, `.WithBackOfficeAuthentication()` (advertises the backoffice security
requirement in the generated document — the controller's `[Authorize]` still does the actual
enforcement), and `.WithJsonOptions(...)` naming the same JSON options the backoffice
controller pipeline serializes with, so the generated schema matches runtime behaviour. Mirror
that shape:

`Configuration/KanbanOpenApiDocument.cs`:

```csharp
using Umbraco.Cms.Api.Common.OpenApi;
using Umbraco.Cms.Api.Management.OpenApi;
using Umbraco.Cms.Core.DependencyInjection;

namespace Umbraco.Community.Kanban.Configuration;

/// <summary>
/// Registers the package's own OpenAPI document, so its endpoints do not clutter
/// the core Management API document and can generate their own client.
/// </summary>
public static class KanbanOpenApiDocument
{
    private const string Title = "Kanban Management API";

    /// <summary>
    /// Adds the Kanban API's own OpenAPI document, scoped to endpoints carrying
    /// <c>[MapToApi(Constants.ApiName)]</c>.
    /// </summary>
    public static IUmbracoBuilder AddKanbanOpenApiDocument(this IUmbracoBuilder builder) =>
        builder.AddBackOfficeOpenApiDocument(
            Constants.ApiName,
            document => document
                .WithTitle(Title)
                .WithBackOfficeAuthentication()
                .WithJsonOptions(Umbraco.Cms.Core.Constants.JsonOptionsNames.BackOffice));
}
```

- [ ] **Step 5: Write the builder extension and composer**

`Extensions/UmbracoBuilderExtensions.cs`:

```csharp
using Microsoft.Extensions.DependencyInjection;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Community.Kanban.Configuration;
using Umbraco.Community.Kanban.Lanes;
using Umbraco.Community.Kanban.Lanes.Sources;

namespace Umbraco.Community.Kanban.Extensions;

public static class UmbracoBuilderExtensions
{
    /// <summary>
    /// Registers everything the Kanban package needs. Safe to call more than once.
    /// </summary>
    public static IUmbracoBuilder AddKanban(this IUmbracoBuilder builder)
    {
        if (builder.Services.Any(x => x.ServiceType == typeof(IKanbanLaneResolver)))
        {
            return builder;
        }

        builder.AddKanbanOpenApiDocument();

        builder.Services.AddSingleton<IKanbanPropertyDataTypeLookup, KanbanPropertyDataTypeLookup>();
        builder.Services.AddSingleton<IKanbanLaneResolver, KanbanLaneResolver>();

        // Manual is appended first so a configuration that pins it wins over an
        // editor-matching source.
        builder.KanbanLaneSources()
            .Append<ManualLaneSource>()
            .Append<CoreListEditorLaneSource>();

        return builder;
    }

    /// <summary>
    /// The lane source collection, for packages adding their own sources.
    /// </summary>
    public static KanbanLaneSourceCollectionBuilder KanbanLaneSources(this IUmbracoBuilder builder) =>
        builder.WithCollectionBuilder<KanbanLaneSourceCollectionBuilder>();
}
```

`Composers/KanbanComposer.cs`:

```csharp
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Community.Kanban.Extensions;

namespace Umbraco.Community.Kanban.Composers;

public sealed class KanbanComposer : IComposer
{
    public void Compose(IUmbracoBuilder builder) => builder.AddKanban();
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `dotnet test --filter FullyQualifiedName~RegistrationTests`
Expected: PASS, 2 tests.

- [ ] **Step 7: Run the whole suite and build**

Run: `dotnet build && dotnet test`
Expected: build succeeds, all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src tests
git commit -m "feat: wire up DI, the lane source collection and the API base"
```

---

### Task 12: GET /configurations endpoint

**Files:**
- Create: `src/Umbraco.Community.Kanban/Models/Api/KanbanConfigurationResponseModel.cs`
- Create: `src/Umbraco.Community.Kanban/Services/IKanbanConfigurationService.cs`
- Create: `src/Umbraco.Community.Kanban/Services/KanbanConfigurationService.cs`
- Create: `src/Umbraco.Community.Kanban/Controllers/ConfigurationsController.cs`
- Modify: `src/Umbraco.Community.Kanban/Extensions/UmbracoBuilderExtensions.cs`
- Test: `tests/Umbraco.Community.Kanban.Tests/Services/KanbanConfigurationMappingTests.cs`

**Interfaces:**
- Consumes: `Constants.BoardEditorAlias` / `CalendarEditorAlias`, both configuration models.
- Produces:
  - `KanbanConfigurationResponseModel` — `Guid Key`, `string Name`, `KanbanConfigurationKind Kind`, `Guid[] AppliesTo`, `string? TabName`, `string? TabIcon`.
  - `KanbanConfigurationKind` enum — `Board`, `Calendar`.
  - `IKanbanConfigurationService.GetAllAsync()` returning `Task<IReadOnlyList<KanbanConfigurationResponseModel>>`.
  - `KanbanConfigurationMapper.Map(Guid key, string name, string editorAlias, object? configurationObject)` — the pure mapping step, tested directly.

The client entry point calls this on startup to register one content app per configuration, so it must be readable by any backoffice user, not just those with Settings access.

- [ ] **Step 1: Write the failing test**

`tests/Umbraco.Community.Kanban.Tests/Services/KanbanConfigurationMappingTests.cs`:

```csharp
using Umbraco.Community.Kanban.Models;
using Umbraco.Community.Kanban.Models.Api;
using Umbraco.Community.Kanban.Services;

namespace Umbraco.Community.Kanban.Tests.Services;

public class KanbanConfigurationMappingTests
{
    private static readonly Guid Key = Guid.Parse("8f6f5f4e-0000-4000-8000-000000000002");
    private static readonly Guid ContentTypeKey = Guid.Parse("8f6f5f4e-0000-4000-8000-000000000003");

    [Fact]
    public void Map_ABoardConfiguration()
    {
        var configuration = new KanbanBoardConfiguration
        {
            AppliesTo = [ContentTypeKey],
            TabName = "Board",
            TabIcon = "icon-grid",
        };

        var model = KanbanConfigurationMapper.Map(Key, "Task board", Constants.BoardEditorAlias, configuration);

        model.Should().NotBeNull();
        model!.Key.Should().Be(Key);
        model.Name.Should().Be("Task board");
        model.Kind.Should().Be(KanbanConfigurationKind.Board);
        model.AppliesTo.Should().Equal(ContentTypeKey);
        model.TabName.Should().Be("Board");
        model.TabIcon.Should().Be("icon-grid");
    }

    [Fact]
    public void Map_ACalendarConfiguration()
    {
        var configuration = new KanbanCalendarConfiguration { AppliesTo = [ContentTypeKey] };

        var model = KanbanConfigurationMapper.Map(Key, "Schedule", Constants.CalendarEditorAlias, configuration);

        model!.Kind.Should().Be(KanbanConfigurationKind.Calendar);
        model.AppliesTo.Should().Equal(ContentTypeKey);
    }

    [Fact]
    public void Map_ReturnsNullForAnUnknownEditorAlias()
    {
        var model = KanbanConfigurationMapper.Map(Key, "Something", "Umbraco.TextBox", new KanbanBoardConfiguration());

        model.Should().BeNull();
    }

    [Fact]
    public void Map_ToleratesAConfigurationObjectOfTheWrongType()
    {
        var model = KanbanConfigurationMapper.Map(Key, "Task board", Constants.BoardEditorAlias, "not a configuration");

        model.Should().NotBeNull();
        model!.AppliesTo.Should().BeEmpty();
        model.Kind.Should().Be(KanbanConfigurationKind.Board);
    }
}
```

The last case matters: a data type saved before a configuration field existed deserialises to something unexpected, and the content app registration must degrade rather than throw during backoffice startup.

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test --filter FullyQualifiedName~KanbanConfigurationMappingTests`
Expected: compile error — the mapper does not exist.

- [ ] **Step 3: Write the response model and mapper**

`Models/Api/KanbanConfigurationResponseModel.cs`:

```csharp
namespace Umbraco.Community.Kanban.Models.Api;

public enum KanbanConfigurationKind
{
    Board,
    Calendar,
}

/// <summary>
/// A named Kanban configuration, as seen by the backoffice entry point that
/// registers one content app per configuration.
/// </summary>
public sealed class KanbanConfigurationResponseModel
{
    public required Guid Key { get; init; }

    public required string Name { get; init; }

    public required KanbanConfigurationKind Kind { get; init; }

    public Guid[] AppliesTo { get; init; } = [];

    public string? TabName { get; init; }

    public string? TabIcon { get; init; }
}
```

`Services/KanbanConfigurationService.cs` — the mapper lives here alongside the service that uses it, because they change together:

```csharp
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.PropertyEditors;
using Umbraco.Cms.Core.Serialization;
using Umbraco.Cms.Core.Services;
using Umbraco.Community.Kanban.Models;
using Umbraco.Community.Kanban.Models.Api;

namespace Umbraco.Community.Kanban.Services;

/// <summary>
/// Maps a data type onto a configuration response model. Pure, so it is tested directly.
/// </summary>
public static class KanbanConfigurationMapper
{
    public static KanbanConfigurationResponseModel? Map(
        Guid key,
        string name,
        string editorAlias,
        object? configurationObject)
    {
        if (string.Equals(editorAlias, Constants.BoardEditorAlias, StringComparison.OrdinalIgnoreCase))
        {
            var board = configurationObject as KanbanBoardConfiguration;
            return new KanbanConfigurationResponseModel
            {
                Key = key,
                Name = name,
                Kind = KanbanConfigurationKind.Board,
                AppliesTo = board?.AppliesTo ?? [],
                TabName = board?.TabName,
                TabIcon = board?.TabIcon,
            };
        }

        if (string.Equals(editorAlias, Constants.CalendarEditorAlias, StringComparison.OrdinalIgnoreCase))
        {
            var calendar = configurationObject as KanbanCalendarConfiguration;
            return new KanbanConfigurationResponseModel
            {
                Key = key,
                Name = name,
                Kind = KanbanConfigurationKind.Calendar,
                AppliesTo = calendar?.AppliesTo ?? [],
                TabName = calendar?.TabName,
                TabIcon = calendar?.TabIcon,
            };
        }

        return null;
    }
}

/// <inheritdoc />
public sealed class KanbanConfigurationService(
    IDataTypeService dataTypeService,
    IConfigurationEditorJsonSerializer configurationEditorJsonSerializer,
    PropertyEditorCollection propertyEditors) : IKanbanConfigurationService
{
    public async Task<IReadOnlyList<KanbanConfigurationResponseModel>> GetAllAsync()
    {
        IEnumerable<IDataType> dataTypes = await dataTypeService.GetByEditorAliasAsync(
            [Constants.BoardEditorAlias, Constants.CalendarEditorAlias]);

        return dataTypes
            .Select(dataType => KanbanConfigurationMapper.Map(
                dataType.Key,
                dataType.Name ?? string.Empty,
                dataType.EditorAlias,
                GetConfigurationObject(dataType)))
            .OfType<KanbanConfigurationResponseModel>()
            .OrderBy(model => model.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public async Task<KanbanBoardConfiguration?> GetBoardConfigurationAsync(Guid key)
    {
        IDataType? dataType = await dataTypeService.GetAsync(key);

        return dataType is null || string.Equals(dataType.EditorAlias, Constants.BoardEditorAlias, StringComparison.OrdinalIgnoreCase) == false
            ? null
            : GetConfigurationObject(dataType) as KanbanBoardConfiguration;
    }

    private object? GetConfigurationObject(IDataType dataType)
    {
        if (propertyEditors.TryGet(dataType.EditorAlias, out var editor) == false)
        {
            return null;
        }

        return editor
            .GetConfigurationEditor()
            .ToConfigurationObject(dataType.ConfigurationData, configurationEditorJsonSerializer);
    }
}
```

`Services/IKanbanConfigurationService.cs`:

```csharp
using Umbraco.Community.Kanban.Models;
using Umbraco.Community.Kanban.Models.Api;

namespace Umbraco.Community.Kanban.Services;

public interface IKanbanConfigurationService
{
    /// <summary>Every Kanban Board and Kanban Calendar data type, ordered by name.</summary>
    Task<IReadOnlyList<KanbanConfigurationResponseModel>> GetAllAsync();

    /// <summary>The board configuration stored on a data type, or null if that data type is not a board.</summary>
    Task<KanbanBoardConfiguration?> GetBoardConfigurationAsync(Guid key);
}
```

- [ ] **Step 4: Write the controller**

`Controllers/ConfigurationsController.cs`:

```csharp
using Asp.Versioning;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Umbraco.Community.Kanban.Models.Api;
using Umbraco.Community.Kanban.Services;

namespace Umbraco.Community.Kanban.Controllers;

[ApiVersion("1.0")]
[ApiExplorerSettings(GroupName = "Configurations")]
public sealed class ConfigurationsController(IKanbanConfigurationService configurationService)
    : KanbanControllerBase
{
    /// <summary>
    /// Lists every Kanban configuration. Called by the backoffice entry point on startup,
    /// so it is available to any backoffice user rather than Settings users only.
    /// </summary>
    [HttpGet("configurations")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(IEnumerable<KanbanConfigurationResponseModel>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll() => Ok(await configurationService.GetAllAsync());
}
```

- [ ] **Step 5: Register the service**

In `Extensions/UmbracoBuilderExtensions.cs`, inside `AddKanban()`, after the resolver registration:

```csharp
builder.Services.AddSingleton<IKanbanConfigurationService, KanbanConfigurationService>();
```

Add `using Umbraco.Community.Kanban.Services;` to the file.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `dotnet test --filter FullyQualifiedName~KanbanConfigurationMappingTests`
Expected: PASS, 4 tests.

- [ ] **Step 7: Commit**

```bash
git add src tests
git commit -m "feat: add the configurations endpoint"
```

---

### Task 13: POST /lanes/preview endpoint

**Files:**
- Create: `src/Umbraco.Community.Kanban/Models/Api/KanbanLanePreviewRequestModel.cs`
- Create: `src/Umbraco.Community.Kanban/Models/Api/KanbanLanePreviewResponseModel.cs`
- Create: `src/Umbraco.Community.Kanban/Controllers/LanesController.cs`
- Test: `tests/Umbraco.Community.Kanban.Tests/Models/KanbanLanePreviewResponseModelTests.cs`

**Interfaces:**
- Consumes: `IKanbanLaneResolver`, `KanbanLaneResolution` from Task 10; `KanbanControllerBase` from Task 11.
- Produces:
  - `KanbanLanePreviewRequestModel` — `Guid ContentTypeKey`, `KanbanBoardConfiguration Configuration`.
  - `KanbanLanePreviewResponseModel` — `KanbanLaneModel[] Lanes`, `string[] UnmatchedOverrides`.
  - `KanbanLaneModel` — `string Value`, `string Name`, `string? Colour`, `string? Icon`, `bool IsUnassigned`, `bool AcceptsDrops`.
  - `KanbanLanePreviewResponseModel.From(KanbanLaneResolution)`.

This endpoint drives the lane override editor: it resolves lanes for a configuration that has not been saved yet, so the editor picks real lane values instead of typing them.

- [ ] **Step 1: Write the failing test**

`tests/Umbraco.Community.Kanban.Tests/Models/KanbanLanePreviewResponseModelTests.cs`:

```csharp
using Umbraco.Community.Kanban.Lanes;
using Umbraco.Community.Kanban.Models;
using Umbraco.Community.Kanban.Models.Api;

namespace Umbraco.Community.Kanban.Tests.Models;

public class KanbanLanePreviewResponseModelTests
{
    [Fact]
    public void From_CopiesEveryLaneField()
    {
        var resolution = new KanbanLaneResolution(
            [new KanbanLane { Value = "open", Name = "Open", Colour = "yellow", Icon = "icon-box", AcceptsDrops = true }],
            []);

        var model = KanbanLanePreviewResponseModel.From(resolution);

        var lane = model.Lanes.Should().ContainSingle().Subject;
        lane.Value.Should().Be("open");
        lane.Name.Should().Be("Open");
        lane.Colour.Should().Be("yellow");
        lane.Icon.Should().Be("icon-box");
        lane.IsUnassigned.Should().BeFalse();
        lane.AcceptsDrops.Should().BeTrue();
    }

    [Fact]
    public void From_ReportsUnmatchedOverridesByValue()
    {
        var resolution = new KanbanLaneResolution(
            [],
            [new KanbanLaneOverride { Value = "archived" }]);

        var model = KanbanLanePreviewResponseModel.From(resolution);

        model.UnmatchedOverrides.Should().Equal("archived");
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test --filter FullyQualifiedName~KanbanLanePreviewResponseModelTests`
Expected: compile error — the models do not exist.

- [ ] **Step 3: Write the request and response models**

`Models/Api/KanbanLanePreviewRequestModel.cs`:

```csharp
namespace Umbraco.Community.Kanban.Models.Api;

/// <summary>
/// A request to resolve lanes for a configuration that may not be saved yet.
/// </summary>
public sealed class KanbanLanePreviewRequestModel
{
    /// <summary>The content type whose children the board will show.</summary>
    public required Guid ContentTypeKey { get; init; }

    public required KanbanBoardConfiguration Configuration { get; init; }
}
```

`Models/Api/KanbanLanePreviewResponseModel.cs`:

```csharp
using Umbraco.Community.Kanban.Lanes;

namespace Umbraco.Community.Kanban.Models.Api;

public sealed class KanbanLaneModel
{
    public required string Value { get; init; }

    public required string Name { get; init; }

    public string? Colour { get; init; }

    public string? Icon { get; init; }

    public bool IsUnassigned { get; init; }

    public bool AcceptsDrops { get; init; }
}

public sealed class KanbanLanePreviewResponseModel
{
    public KanbanLaneModel[] Lanes { get; init; } = [];

    /// <summary>
    /// Override values that matched no lane. Surfaced so the configuration UI can flag
    /// them rather than silently discarding the editor's styling.
    /// </summary>
    public string[] UnmatchedOverrides { get; init; } = [];

    public static KanbanLanePreviewResponseModel From(KanbanLaneResolution resolution) => new()
    {
        Lanes = resolution.Lanes
            .Select(lane => new KanbanLaneModel
            {
                Value = lane.Value,
                Name = lane.Name,
                Colour = lane.Colour,
                Icon = lane.Icon,
                IsUnassigned = lane.IsUnassigned,
                AcceptsDrops = lane.AcceptsDrops,
            })
            .ToArray(),
        UnmatchedOverrides = resolution.UnmatchedOverrides.Select(x => x.Value).ToArray(),
    };
}
```

- [ ] **Step 4: Write the controller**

`Controllers/LanesController.cs`:

```csharp
using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Umbraco.Cms.Web.Common.Authorization;
using Umbraco.Community.Kanban.Lanes;
using Umbraco.Community.Kanban.Models.Api;

namespace Umbraco.Community.Kanban.Controllers;

[ApiVersion("1.0")]
[ApiExplorerSettings(GroupName = "Lanes")]
public sealed class LanesController(IKanbanLaneResolver laneResolver) : KanbanControllerBase
{
    /// <summary>
    /// Resolves the lanes a configuration would produce, without requiring it to be saved.
    /// Used by the lane override editor. Requires Settings access, because it is only
    /// reachable from the data type editor.
    /// </summary>
    [HttpPost("lanes/preview")]
    [MapToApiVersion("1.0")]
    [Authorize(Policy = AuthorizationPolicies.SectionAccessSettings)]
    [ProducesResponseType(typeof(KanbanLanePreviewResponseModel), StatusCodes.Status200OK)]
    public async Task<IActionResult> Preview(KanbanLanePreviewRequestModel request)
    {
        var resolution = await laneResolver.ResolveAsync(request.ContentTypeKey, request.Configuration);

        return Ok(KanbanLanePreviewResponseModel.From(resolution));
    }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `dotnet test --filter FullyQualifiedName~KanbanLanePreviewResponseModelTests`
Expected: PASS, 2 tests.

- [ ] **Step 6: Run the whole suite**

Run: `dotnet build && dotnet test`
Expected: build succeeds, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src tests
git commit -m "feat: add the lane preview endpoint"
```

---

### Task 14: Board configuration property editor UI

**Files:**
- Create: `src/Umbraco.Community.Kanban/Client/src/property-editors/board/manifests.ts`
- Create: `src/Umbraco.Community.Kanban/Client/src/property-editors/board/board-config.element.ts`
- Modify: `src/Umbraco.Community.Kanban/Client/src/bundle.manifests.ts`
- Test: `src/Umbraco.Community.Kanban/Client/src/property-editors/board/manifests.test.ts`

**Interfaces:**
- Consumes: `KANBAN_BOARD_EDITOR_ALIAS`, `KANBAN_BOARD_EDITOR_UI_ALIAS` from Task 2.
- Produces: a `propertyEditorSchema` manifest for `Umbraco.Community.Kanban.Board`, a `propertyEditorUi` manifest declaring the settings, and `<umb-community-kanban-board-config>` — the element shown when a board property is placed on a document.

The schema manifest is what tells the backoffice this server-side editor exists. Without it the data type cannot be created.

- [ ] **Step 1: Write the failing test**

`src/property-editors/board/manifests.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { manifests } from './manifests.js';

describe('board property editor manifests', () => {
  it('registers a schema and a ui', () => {
    expect(manifests.map((m) => m.type).sort()).toEqual(['propertyEditorSchema', 'propertyEditorUi']);
  });

  it('binds the ui to the schema', () => {
    const schema = manifests.find((m) => m.type === 'propertyEditorSchema') as any;
    const ui = manifests.find((m) => m.type === 'propertyEditorUi') as any;

    expect(schema.alias).toBe('Umbraco.Community.Kanban.Board');
    expect(schema.meta.defaultPropertyEditorUiAlias).toBe(ui.alias);
    expect(ui.meta.propertyEditorSchemaAlias).toBe(schema.alias);
  });

  it('exposes every setting the server configuration model declares', () => {
    const ui = manifests.find((m) => m.type === 'propertyEditorUi') as any;
    const aliases = ui.meta.settings.properties.map((p: { alias: string }) => p.alias).sort();

    expect(aliases).toEqual([
      'allowDrag',
      'appliesTo',
      'cardProperties',
      'laneOverrides',
      'lanePageSize',
      'laneProperty',
      'laneSource',
      'manualLanes',
      'tabIcon',
      'tabName',
    ]);
  });

  it('defaults the lane page size to 25 and drag to on', () => {
    const ui = manifests.find((m) => m.type === 'propertyEditorUi') as any;
    const defaults = Object.fromEntries(
      ui.meta.settings.defaultData.map((d: { alias: string; value: unknown }) => [d.alias, d.value]),
    );

    expect(defaults.lanePageSize).toBe(25);
    expect(defaults.allowDrag).toBe(true);
  });
});
```

The third test is the one that catches drift: add a `ConfigurationField` on the server without a matching client setting and the field becomes uneditable, silently.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd src/Umbraco.Community.Kanban/Client && npm test`
Expected: FAIL — cannot resolve `./manifests.js`.

- [ ] **Step 3: Write the element**

`src/property-editors/board/board-config.element.ts`:

```ts
import { html, customElement } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/**
 * Rendered where a Kanban Board property sits on a document.
 *
 * The board itself arrives in a later milestone. Until then this is a placeholder,
 * deliberately rendering nothing that writes a value — the server-side value editor
 * is read-only and this element must not fight that.
 */
@customElement('umb-community-kanban-board-config')
export class UmbCommunityKanbanBoardConfigElement extends UmbLitElement {
  override render() {
    return html`<uui-box headline="Kanban board">
      <p>This board renders here once the board view ships. Its settings are configured on the data type.</p>
    </uui-box>`;
  }
}

export { UmbCommunityKanbanBoardConfigElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-board-config': UmbCommunityKanbanBoardConfigElement;
  }
}
```

- [ ] **Step 4: Write the manifests**

`src/property-editors/board/manifests.ts`:

```ts
import { KANBAN_BOARD_EDITOR_ALIAS, KANBAN_BOARD_EDITOR_UI_ALIAS } from '@/constants.js';

export const manifests: Array<UmbExtensionManifest> = [
  {
    type: 'propertyEditorSchema',
    name: 'Kanban Board',
    alias: KANBAN_BOARD_EDITOR_ALIAS,
    meta: {
      defaultPropertyEditorUiAlias: KANBAN_BOARD_EDITOR_UI_ALIAS,
    },
  },
  {
    type: 'propertyEditorUi',
    alias: KANBAN_BOARD_EDITOR_UI_ALIAS,
    name: 'Kanban Board Property Editor UI',
    element: () => import('./board-config.element.js'),
    meta: {
      label: 'Kanban Board',
      propertyEditorSchemaAlias: KANBAN_BOARD_EDITOR_ALIAS,
      icon: 'icon-grid',
      group: 'lists',
      settings: {
        properties: [
          {
            alias: 'laneProperty',
            label: 'Lane property',
            description: 'The child property whose value decides which lane a card sits in.',
            propertyEditorUiAlias: 'Umb.PropertyEditorUi.TextBox',
          },
          {
            alias: 'laneSource',
            label: 'Lane source',
            description: 'Leave empty to detect from the lane property. Set to "manual" to use the lanes below.',
            propertyEditorUiAlias: 'Umb.PropertyEditorUi.TextBox',
          },
          {
            alias: 'manualLanes',
            label: 'Manual lanes',
            description: 'Used only when the lane source is "manual".',
            propertyEditorUiAlias: 'Umb.Community.Kanban.PropertyEditorUi.ManualLanes',
          },
          {
            alias: 'laneOverrides',
            label: 'Lane appearance',
            description: 'Override the colour, icon or label of individual lanes.',
            propertyEditorUiAlias: 'Umb.Community.Kanban.PropertyEditorUi.LaneOverrides',
          },
          {
            alias: 'cardProperties',
            label: 'Card properties',
            description: 'Properties shown as summary items on each card.',
            propertyEditorUiAlias: 'Umb.PropertyEditorUi.MultipleTextString',
          },
          {
            alias: 'lanePageSize',
            label: 'Cards per lane',
            description: 'How many cards load in a lane before "Show more".',
            propertyEditorUiAlias: 'Umb.PropertyEditorUi.Integer',
            config: [{ alias: 'min', value: 1 }],
          },
          {
            alias: 'allowDrag',
            label: 'Allow drag',
            description: 'Let editors move cards between lanes.',
            propertyEditorUiAlias: 'Umb.PropertyEditorUi.Toggle',
          },
          {
            alias: 'appliesTo',
            label: 'Applies to content types',
            description: 'Content types that get this board as a content app.',
            propertyEditorUiAlias: 'Umb.PropertyEditorUi.DocumentTypePicker',
          },
          {
            alias: 'tabName',
            label: 'Content app name',
            propertyEditorUiAlias: 'Umb.PropertyEditorUi.TextBox',
          },
          {
            alias: 'tabIcon',
            label: 'Content app icon',
            propertyEditorUiAlias: 'Umb.PropertyEditorUi.IconPicker',
          },
        ],
        defaultData: [
          { alias: 'lanePageSize', value: 25 },
          { alias: 'allowDrag', value: true },
        ],
      },
    },
  },
];
```

Two settings point at UI aliases this plan creates later — `laneOverrides` at Task 16 and
`manualLanes` at Task 17. Between this task and those, both fields render as unknown editors. That is
expected; it is a manifest string, not a compile error, and the rest of the settings work meanwhile.

`laneProperty` and `cardProperties` use text inputs. A property-alias picker is a later refinement,
and building one here would block this task on UI work that is not its point.

- [ ] **Step 5: Register the manifests in the bundle**

`src/bundle.manifests.ts`:

```ts
import { manifests as boardManifests } from './property-editors/board/manifests.js';

export const manifests: Array<UmbExtensionManifest> = [...boardManifests];
```

- [ ] **Step 6: Run the tests and build to verify they pass**

Run: `npm test && npm run build`
Expected: tests PASS, 4 new tests; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/Umbraco.Community.Kanban/Client
git commit -m "feat: add the board configuration property editor UI"
```

---

### Task 15: Calendar configuration property editor UI

**Files:**
- Create: `src/Umbraco.Community.Kanban/Client/src/property-editors/calendar/manifests.ts`
- Create: `src/Umbraco.Community.Kanban/Client/src/property-editors/calendar/calendar-config.element.ts`
- Modify: `src/Umbraco.Community.Kanban/Client/src/bundle.manifests.ts`
- Test: `src/Umbraco.Community.Kanban/Client/src/property-editors/calendar/manifests.test.ts`

**Interfaces:**
- Consumes: `KANBAN_CALENDAR_EDITOR_ALIAS`, `KANBAN_CALENDAR_EDITOR_UI_ALIAS` from Task 2.
- Produces: `propertyEditorSchema` and `propertyEditorUi` manifests for the calendar, and `<umb-community-kanban-calendar-config>`.

- [ ] **Step 1: Write the failing test**

`src/property-editors/calendar/manifests.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { manifests } from './manifests.js';

describe('calendar property editor manifests', () => {
  it('binds the ui to the schema', () => {
    const schema = manifests.find((m) => m.type === 'propertyEditorSchema') as any;
    const ui = manifests.find((m) => m.type === 'propertyEditorUi') as any;

    expect(schema.alias).toBe('Umbraco.Community.Kanban.Calendar');
    expect(schema.meta.defaultPropertyEditorUiAlias).toBe(ui.alias);
    expect(ui.meta.propertyEditorSchemaAlias).toBe(schema.alias);
  });

  it('exposes every setting the server configuration model declares', () => {
    const ui = manifests.find((m) => m.type === 'propertyEditorUi') as any;
    const aliases = ui.meta.settings.properties.map((p: { alias: string }) => p.alias).sort();

    expect(aliases).toEqual([
      'allowDrag',
      'appliesTo',
      'cardProperties',
      'dateProperty',
      'showAgenda',
      'tabIcon',
      'tabName',
    ]);
  });

  it('defaults the date property to updateDate and shows the agenda', () => {
    const ui = manifests.find((m) => m.type === 'propertyEditorUi') as any;
    const defaults = Object.fromEntries(
      ui.meta.settings.defaultData.map((d: { alias: string; value: unknown }) => [d.alias, d.value]),
    );

    expect(defaults.dateProperty).toBe('updateDate');
    expect(defaults.showAgenda).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./manifests.js`.

- [ ] **Step 3: Write the element**

`src/property-editors/calendar/calendar-config.element.ts`:

```ts
import { html, customElement } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/**
 * Rendered where a Kanban Calendar property sits on a document.
 * The calendar itself arrives in a later milestone.
 */
@customElement('umb-community-kanban-calendar-config')
export class UmbCommunityKanbanCalendarConfigElement extends UmbLitElement {
  override render() {
    return html`<uui-box headline="Kanban calendar">
      <p>This calendar renders here once the calendar view ships. Its settings are configured on the data type.</p>
    </uui-box>`;
  }
}

export { UmbCommunityKanbanCalendarConfigElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-calendar-config': UmbCommunityKanbanCalendarConfigElement;
  }
}
```

- [ ] **Step 4: Write the manifests**

`src/property-editors/calendar/manifests.ts`:

```ts
import { KANBAN_CALENDAR_EDITOR_ALIAS, KANBAN_CALENDAR_EDITOR_UI_ALIAS } from '@/constants.js';

export const manifests: Array<UmbExtensionManifest> = [
  {
    type: 'propertyEditorSchema',
    name: 'Kanban Calendar',
    alias: KANBAN_CALENDAR_EDITOR_ALIAS,
    meta: {
      defaultPropertyEditorUiAlias: KANBAN_CALENDAR_EDITOR_UI_ALIAS,
    },
  },
  {
    type: 'propertyEditorUi',
    alias: KANBAN_CALENDAR_EDITOR_UI_ALIAS,
    name: 'Kanban Calendar Property Editor UI',
    element: () => import('./calendar-config.element.js'),
    meta: {
      label: 'Kanban Calendar',
      propertyEditorSchemaAlias: KANBAN_CALENDAR_EDITOR_ALIAS,
      icon: 'icon-calendar',
      group: 'lists',
      settings: {
        properties: [
          {
            alias: 'dateProperty',
            label: 'Date property',
            description: 'The child property that places a card on a day. Leave as updateDate for last-updated, which makes the calendar read-only.',
            propertyEditorUiAlias: 'Umb.PropertyEditorUi.TextBox',
          },
          {
            alias: 'cardProperties',
            label: 'Card properties',
            description: 'Properties shown as summary items on each card.',
            propertyEditorUiAlias: 'Umb.PropertyEditorUi.MultipleTextString',
          },
          {
            alias: 'showAgenda',
            label: 'Show agenda list',
            propertyEditorUiAlias: 'Umb.PropertyEditorUi.Toggle',
          },
          {
            alias: 'allowDrag',
            label: 'Allow drag',
            description: 'Ignored when the date property is updateDate, which cannot be written to.',
            propertyEditorUiAlias: 'Umb.PropertyEditorUi.Toggle',
          },
          {
            alias: 'appliesTo',
            label: 'Applies to content types',
            propertyEditorUiAlias: 'Umb.PropertyEditorUi.DocumentTypePicker',
          },
          {
            alias: 'tabName',
            label: 'Content app name',
            propertyEditorUiAlias: 'Umb.PropertyEditorUi.TextBox',
          },
          {
            alias: 'tabIcon',
            label: 'Content app icon',
            propertyEditorUiAlias: 'Umb.PropertyEditorUi.IconPicker',
          },
        ],
        defaultData: [
          { alias: 'dateProperty', value: 'updateDate' },
          { alias: 'showAgenda', value: true },
          { alias: 'allowDrag', value: true },
        ],
      },
    },
  },
];
```

- [ ] **Step 5: Register the manifests in the bundle**

`src/bundle.manifests.ts`:

```ts
import { manifests as boardManifests } from './property-editors/board/manifests.js';
import { manifests as calendarManifests } from './property-editors/calendar/manifests.js';

export const manifests: Array<UmbExtensionManifest> = [...boardManifests, ...calendarManifests];
```

- [ ] **Step 6: Run the tests and build to verify they pass**

Run: `npm test && npm run build`
Expected: tests PASS, 3 new tests; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/Umbraco.Community.Kanban/Client
git commit -m "feat: add the calendar configuration property editor UI"
```

---

### Task 16: Lane override editor

**Files:**
- Create: `src/Umbraco.Community.Kanban/Client/src/property-editors/lane-overrides/lane-override.model.ts`
- Create: `src/Umbraco.Community.Kanban/Client/src/property-editors/lane-overrides/lane-overrides.element.ts`
- Create: `src/Umbraco.Community.Kanban/Client/src/property-editors/lane-overrides/manifests.ts`
- Modify: `src/Umbraco.Community.Kanban/Client/src/bundle.manifests.ts`
- Test: `src/Umbraco.Community.Kanban/Client/src/property-editors/lane-overrides/lane-override.model.test.ts`

**Interfaces:**
- Consumes: `KANBAN_API_PATH` from Task 2; the `POST /lanes/preview` response shape from Task 13.
- Produces:
  - `KanbanLaneOverrideValue` — `{ value: string; colour?: string; icon?: string; label?: string }`.
  - `KANBAN_LANE_PALETTE` — the eight colour aliases, matching `KanbanLanePalette.Cycle` on the server.
  - `mergeOverridesWithLanes(lanes, overrides)` — pairs resolved lanes with their overrides and flags orphans.
  - Property editor UI alias `Umb.Community.Kanban.PropertyEditorUi.LaneOverrides`, referenced by Task 14's board manifest.

- [ ] **Step 1: Write the failing test**

`src/property-editors/lane-overrides/lane-override.model.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { KANBAN_LANE_PALETTE, mergeOverridesWithLanes } from './lane-override.model.js';

describe('lane override model', () => {
  it('matches the server palette exactly', () => {
    expect(KANBAN_LANE_PALETTE).toEqual([
      'yellow',
      'pink',
      'blue',
      'light-blue',
      'red',
      'green',
      'brown',
      'grey',
    ]);
  });

  it('pairs each resolved lane with its override', () => {
    const rows = mergeOverridesWithLanes(
      [
        { value: 'open', name: 'Open', isUnassigned: false },
        { value: 'done', name: 'Done', isUnassigned: false },
      ],
      [{ value: 'done', colour: 'green' }],
    );

    expect(rows.map((r) => r.value)).toEqual(['open', 'done']);
    expect(rows[0].override).toBeUndefined();
    expect(rows[1].override?.colour).toBe('green');
    expect(rows.every((r) => r.orphaned === false)).toBe(true);
  });

  it('keeps an override whose lane no longer resolves and flags it', () => {
    const rows = mergeOverridesWithLanes(
      [{ value: 'open', name: 'Open', isUnassigned: false }],
      [{ value: 'archived', colour: 'grey' }],
    );

    const orphan = rows.find((r) => r.value === 'archived');
    expect(orphan).toBeDefined();
    expect(orphan!.orphaned).toBe(true);
  });

  it('excludes the unassigned lane, which is always neutral', () => {
    const rows = mergeOverridesWithLanes(
      [
        { value: 'open', name: 'Open', isUnassigned: false },
        { value: '', name: '(Unassigned)', isUnassigned: true },
      ],
      [],
    );

    expect(rows.map((r) => r.value)).toEqual(['open']);
  });

  it('matches override values case-insensitively, as the server does', () => {
    const rows = mergeOverridesWithLanes(
      [{ value: 'open', name: 'Open', isUnassigned: false }],
      [{ value: 'OPEN', colour: 'red' }],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].override?.colour).toBe('red');
  });
});
```

The case-insensitivity test guards a real mismatch risk: `KanbanLaneOverrideApplier` matches with `OrdinalIgnoreCase`, so a client that matched case-sensitively would show an override as orphaned while the server applied it.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./lane-override.model.js`.

- [ ] **Step 3: Write the model**

`src/property-editors/lane-overrides/lane-override.model.ts`:

```ts
/** Mirrors KanbanLanePalette.Cycle on the server. Keep the two in step. */
export const KANBAN_LANE_PALETTE = [
  'yellow',
  'pink',
  'blue',
  'light-blue',
  'red',
  'green',
  'brown',
  'grey',
] as const;

export interface KanbanLaneOverrideValue {
  value: string;
  colour?: string;
  icon?: string;
  label?: string;
}

export interface KanbanResolvedLane {
  value: string;
  name: string;
  isUnassigned: boolean;
}

export interface KanbanLaneOverrideRow {
  value: string;
  name: string;
  override?: KanbanLaneOverrideValue;
  /** True when the override targets a lane the configuration no longer resolves. */
  orphaned: boolean;
}

/**
 * Pairs resolved lanes with their overrides, keeping overrides whose lane has gone
 * so the editor can flag them instead of silently losing the styling.
 */
export function mergeOverridesWithLanes(
  lanes: KanbanResolvedLane[],
  overrides: KanbanLaneOverrideValue[],
): KanbanLaneOverrideRow[] {
  const byValue = new Map(overrides.map((o) => [o.value.toLowerCase(), o]));

  const rows: KanbanLaneOverrideRow[] = lanes
    .filter((lane) => lane.isUnassigned === false)
    .map((lane) => {
      const key = lane.value.toLowerCase();
      const override = byValue.get(key);
      byValue.delete(key);
      return { value: lane.value, name: lane.name, override, orphaned: false };
    });

  for (const orphan of byValue.values()) {
    rows.push({ value: orphan.value, name: orphan.value, override: orphan, orphaned: true });
  }

  return rows;
}
```

- [ ] **Step 4: Write the element**

`src/property-editors/lane-overrides/lane-overrides.element.ts`:

```ts
import { html, css, customElement, property, state, repeat } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbPropertyValueChangeEvent } from '@umbraco-cms/backoffice/property-editor';
import { umbOpenModal } from '@umbraco-cms/backoffice/modal';
import { UMB_ICON_PICKER_MODAL } from '@umbraco-cms/backoffice/icon';
import {
  KANBAN_LANE_PALETTE,
  mergeOverridesWithLanes,
  type KanbanLaneOverrideRow,
  type KanbanLaneOverrideValue,
  type KanbanResolvedLane,
} from './lane-override.model.js';

/**
 * Edits per-lane appearance overrides.
 *
 * Lanes come from the server rather than being typed by hand, so the editor
 * cannot mistype a lane value and silently lose the styling.
 */
@customElement('umb-community-kanban-lane-overrides')
export class UmbCommunityKanbanLaneOverridesElement extends UmbLitElement {
  @property({ type: Array })
  value: KanbanLaneOverrideValue[] = [];

  @state()
  private _rows: KanbanLaneOverrideRow[] = [];

  /**
   * Resolved lanes, set by the host once it has called POST /lanes/preview.
   * Kept as an input rather than fetched here so this element stays testable
   * and has no opinion about how the configuration is assembled.
   */
  @property({ type: Array, attribute: false })
  set lanes(lanes: KanbanResolvedLane[]) {
    this._lanes = lanes;
    this._rows = mergeOverridesWithLanes(lanes, this.value ?? []);
  }
  get lanes(): KanbanResolvedLane[] {
    return this._lanes;
  }
  private _lanes: KanbanResolvedLane[] = [];

  /**
   * Writes one field of one lane's override, dropping the override entirely once
   * every field is empty so an untouched lane leaves no residue in the stored value.
   */
  #onFieldChange(row: KanbanLaneOverrideRow, field: 'colour' | 'icon' | 'label', fieldValue: string) {
    const rest = (this.value ?? []).filter((o) => o.value.toLowerCase() !== row.value.toLowerCase());
    const updated: KanbanLaneOverrideValue = {
      ...row.override,
      value: row.value,
      [field]: fieldValue || undefined,
    };

    const isEmpty = !updated.colour && !updated.icon && !updated.label;
    const next = isEmpty ? rest : [...rest, updated];

    this.value = next;
    this._rows = mergeOverridesWithLanes(this._lanes, next);
    this.dispatchEvent(new UmbPropertyValueChangeEvent());
  }

  /**
   * Opens Umbraco's own icon picker. The modal returns a colour too, which is ignored —
   * lane colour is chosen by the swatches beside this button, so honouring both would
   * give one lane two competing colours.
   */
  async #pickIcon(row: KanbanLaneOverrideRow) {
    const result = await umbOpenModal(this, UMB_ICON_PICKER_MODAL, {
      value: { icon: row.override?.icon ?? '', color: '' },
      data: { showEmptyOption: true, hideColors: true },
    }).catch(() => undefined);

    if (result === undefined) return;

    this.#onFieldChange(row, 'icon', (result.icon as string) ?? '');
  }

  override render() {
    if (this._rows.length === 0) {
      return html`<uui-box>
        <p>Choose a lane property first, then lanes will appear here.</p>
      </uui-box>`;
    }

    return html`${repeat(
      this._rows,
      (row) => row.value,
      (row) => this.#renderRow(row),
    )}`;
  }

  #renderRow(row: KanbanLaneOverrideRow) {
    return html`
      <div class="row" ?data-orphaned=${row.orphaned}>
        <span class="name">
          ${row.name}
          ${row.orphaned
            ? html`<uui-tag color="warning" look="secondary">no longer resolves</uui-tag>`
            : ''}
        </span>
        <uui-input
          label="Label"
          placeholder=${row.name}
          .value=${row.override?.label ?? ''}
          @change=${(e: Event) =>
            this.#onFieldChange(row, 'label', (e.target as HTMLInputElement).value)}></uui-input>
        <uui-button
          compact
          look="outline"
          label="Choose icon"
          @click=${() => this.#pickIcon(row)}>
          ${row.override?.icon
            ? html`<uui-icon name=${row.override.icon}></uui-icon>`
            : html`<uui-icon name="icon-add" style="opacity:.35"></uui-icon>`}
        </uui-button>
        <uui-color-swatches
          .value=${row.override?.colour ?? ''}
          @change=${(e: Event) =>
            this.#onFieldChange(row, 'colour', (e.target as HTMLInputElement).value)}>
          ${KANBAN_LANE_PALETTE.map(
            (colour) => html`<uui-color-swatch label=${colour} value=${colour}></uui-color-swatch>`,
          )}
        </uui-color-swatches>
      </div>
    `;
  }

  static override styles = [
    css`
      .row {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-4);
        padding: var(--uui-size-space-2) 0;
        border-bottom: 1px solid var(--uui-color-divider);
      }
      .row[data-orphaned] .name {
        color: var(--uui-color-warning-emphasis);
      }
      .name {
        flex: 1;
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-2);
      }
    `,
  ];
}

export { UmbCommunityKanbanLaneOverridesElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-lane-overrides': UmbCommunityKanbanLaneOverridesElement;
  }
}
```

- [ ] **Step 5: Write the manifest and register it**

`src/property-editors/lane-overrides/manifests.ts`:

```ts
export const manifests: Array<UmbExtensionManifest> = [
  {
    type: 'propertyEditorUi',
    alias: 'Umb.Community.Kanban.PropertyEditorUi.LaneOverrides',
    name: 'Kanban Lane Overrides Property Editor UI',
    element: () => import('./lane-overrides.element.js'),
    meta: {
      label: 'Kanban Lane Overrides',
      icon: 'icon-colorpicker',
      group: 'lists',
    },
  },
];
```

`src/bundle.manifests.ts`:

```ts
import { manifests as boardManifests } from './property-editors/board/manifests.js';
import { manifests as calendarManifests } from './property-editors/calendar/manifests.js';
import { manifests as laneOverrideManifests } from './property-editors/lane-overrides/manifests.js';

export const manifests: Array<UmbExtensionManifest> = [
  ...boardManifests,
  ...calendarManifests,
  ...laneOverrideManifests,
];
```

- [ ] **Step 6: Run the tests and build to verify they pass**

Run: `npm test && npm run build`
Expected: tests PASS, 5 new tests; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/Umbraco.Community.Kanban/Client
git commit -m "feat: add the lane override editor"
```

---

### Task 17: Manual lanes editor

**Files:**
- Create: `src/Umbraco.Community.Kanban/Client/src/property-editors/manual-lanes/manual-lane.model.ts`
- Create: `src/Umbraco.Community.Kanban/Client/src/property-editors/manual-lanes/manual-lanes.element.ts`
- Create: `src/Umbraco.Community.Kanban/Client/src/property-editors/manual-lanes/manifests.ts`
- Modify: `src/Umbraco.Community.Kanban/Client/src/bundle.manifests.ts`
- Test: `src/Umbraco.Community.Kanban/Client/src/property-editors/manual-lanes/manual-lane.model.test.ts`

**Interfaces:**
- Consumes: `KANBAN_LANE_PALETTE` from Task 16.
- Produces:
  - `KanbanManualLaneValue` — `{ value: string; label?: string; colour?: string; icon?: string }`, matching `KanbanManualLane` on the server.
  - `addLane`, `removeLaneAt`, `moveLane` — pure list operations, tested directly.
  - Property editor UI alias `Umb.Community.Kanban.PropertyEditorUi.ManualLanes`, referenced by Task 14's board manifest.

Unlike lane overrides, the rows here are created by the editor rather than resolved from the server, so the element owns adding, removing and reordering.

- [ ] **Step 1: Write the failing test**

`src/property-editors/manual-lanes/manual-lane.model.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { addLane, moveLane, removeLaneAt, type KanbanManualLaneValue } from './manual-lane.model.js';

const lanes = (): KanbanManualLaneValue[] => [
  { value: 'todo', label: 'To do' },
  { value: 'doing', label: 'Doing' },
  { value: 'done', label: 'Done' },
];

describe('manual lane list operations', () => {
  it('appends a blank lane', () => {
    const next = addLane(lanes());

    expect(next).toHaveLength(4);
    expect(next[3]).toEqual({ value: '' });
  });

  it('does not mutate the input', () => {
    const original = lanes();
    addLane(original);

    expect(original).toHaveLength(3);
  });

  it('removes by index', () => {
    const next = removeLaneAt(lanes(), 1);

    expect(next.map((l) => l.value)).toEqual(['todo', 'done']);
  });

  it('ignores a remove at an out-of-range index', () => {
    const next = removeLaneAt(lanes(), 9);

    expect(next.map((l) => l.value)).toEqual(['todo', 'doing', 'done']);
  });

  it('moves a lane later', () => {
    const next = moveLane(lanes(), 0, 2);

    expect(next.map((l) => l.value)).toEqual(['doing', 'done', 'todo']);
  });

  it('moves a lane earlier', () => {
    const next = moveLane(lanes(), 2, 0);

    expect(next.map((l) => l.value)).toEqual(['done', 'todo', 'doing']);
  });

  it('ignores a move to the same index', () => {
    const next = moveLane(lanes(), 1, 1);

    expect(next.map((l) => l.value)).toEqual(['todo', 'doing', 'done']);
  });

  it('ignores a move with an out-of-range index', () => {
    const next = moveLane(lanes(), 0, 9);

    expect(next.map((l) => l.value)).toEqual(['todo', 'doing', 'done']);
  });
});
```

Lane order matters beyond presentation — it drives the colour cycle in Task 6, so reordering has to be exact.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd src/Umbraco.Community.Kanban/Client && npm test`
Expected: FAIL — cannot resolve `./manual-lane.model.js`.

- [ ] **Step 3: Write the model**

`src/property-editors/manual-lanes/manual-lane.model.ts`:

```ts
/** Mirrors KanbanManualLane on the server. */
export interface KanbanManualLaneValue {
  value: string;
  label?: string;
  colour?: string;
  icon?: string;
}

/** Appends a blank lane. Returns a new array; never mutates the input. */
export function addLane(lanes: KanbanManualLaneValue[]): KanbanManualLaneValue[] {
  return [...lanes, { value: '' }];
}

export function removeLaneAt(lanes: KanbanManualLaneValue[], index: number): KanbanManualLaneValue[] {
  if (index < 0 || index >= lanes.length) return [...lanes];

  return lanes.filter((_, i) => i !== index);
}

/**
 * Moves a lane. Order is not cosmetic — it decides which palette colour each
 * uncoloured lane gets, so this has to be exact.
 */
export function moveLane(
  lanes: KanbanManualLaneValue[],
  from: number,
  to: number,
): KanbanManualLaneValue[] {
  if (from === to) return [...lanes];
  if (from < 0 || from >= lanes.length) return [...lanes];
  if (to < 0 || to >= lanes.length) return [...lanes];

  const next = [...lanes];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);

  return next;
}
```

- [ ] **Step 4: Write the element**

`src/property-editors/manual-lanes/manual-lanes.element.ts`:

```ts
import { html, css, customElement, property, repeat } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbPropertyValueChangeEvent } from '@umbraco-cms/backoffice/property-editor';
import { KANBAN_LANE_PALETTE } from '../lane-overrides/lane-override.model.js';
import {
  addLane,
  moveLane,
  removeLaneAt,
  type KanbanManualLaneValue,
} from './manual-lane.model.js';

/**
 * Edits hand-defined lanes, used when the board's lane source is "manual".
 */
@customElement('umb-community-kanban-manual-lanes')
export class UmbCommunityKanbanManualLanesElement extends UmbLitElement {
  @property({ type: Array })
  value: KanbanManualLaneValue[] = [];

  #commit(next: KanbanManualLaneValue[]) {
    this.value = next;
    this.dispatchEvent(new UmbPropertyValueChangeEvent());
  }

  #onFieldChange(index: number, field: keyof KanbanManualLaneValue, fieldValue: string) {
    const next = this.value.map((lane, i) =>
      i === index ? { ...lane, [field]: fieldValue || undefined } : lane,
    );

    // `value` is required, so keep it a string rather than letting it go undefined.
    next[index] = { ...next[index], value: next[index].value ?? '' };

    this.#commit(next);
  }

  override render() {
    return html`
      ${repeat(
        this.value ?? [],
        (_, index) => index,
        (lane, index) => this.#renderRow(lane, index),
      )}
      <uui-button
        look="placeholder"
        label="Add lane"
        @click=${() => this.#commit(addLane(this.value ?? []))}></uui-button>
    `;
  }

  #renderRow(lane: KanbanManualLaneValue, index: number) {
    return html`
      <div class="row">
        <uui-input
          label="Value"
          placeholder="Stored value"
          .value=${lane.value ?? ''}
          @change=${(e: Event) =>
            this.#onFieldChange(index, 'value', (e.target as HTMLInputElement).value)}></uui-input>
        <uui-input
          label="Label"
          placeholder=${lane.value || 'Lane header'}
          .value=${lane.label ?? ''}
          @change=${(e: Event) =>
            this.#onFieldChange(index, 'label', (e.target as HTMLInputElement).value)}></uui-input>
        <uui-color-swatches
          .value=${lane.colour ?? ''}
          @change=${(e: Event) =>
            this.#onFieldChange(index, 'colour', (e.target as HTMLInputElement).value)}>
          ${KANBAN_LANE_PALETTE.map(
            (colour) => html`<uui-color-swatch label=${colour} value=${colour}></uui-color-swatch>`,
          )}
        </uui-color-swatches>
        <uui-button
          compact
          look="outline"
          label="Move up"
          ?disabled=${index === 0}
          @click=${() => this.#commit(moveLane(this.value, index, index - 1))}>↑</uui-button>
        <uui-button
          compact
          look="outline"
          label="Move down"
          ?disabled=${index === this.value.length - 1}
          @click=${() => this.#commit(moveLane(this.value, index, index + 1))}>↓</uui-button>
        <uui-button
          compact
          look="outline"
          color="danger"
          label="Remove"
          @click=${() => this.#commit(removeLaneAt(this.value, index))}>✕</uui-button>
      </div>
    `;
  }

  static override styles = [
    css`
      .row {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-3);
        padding: var(--uui-size-space-2) 0;
        border-bottom: 1px solid var(--uui-color-divider);
      }
    `,
  ];
}

export { UmbCommunityKanbanManualLanesElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-manual-lanes': UmbCommunityKanbanManualLanesElement;
  }
}
```

Rows are keyed by index rather than by lane value, because the value is the very field being edited — keying on it would tear down and rebuild the input on every keystroke and lose focus.

- [ ] **Step 5: Write the manifest and register it**

`src/property-editors/manual-lanes/manifests.ts`:

```ts
export const manifests: Array<UmbExtensionManifest> = [
  {
    type: 'propertyEditorUi',
    alias: 'Umb.Community.Kanban.PropertyEditorUi.ManualLanes',
    name: 'Kanban Manual Lanes Property Editor UI',
    element: () => import('./manual-lanes.element.js'),
    meta: {
      label: 'Kanban Manual Lanes',
      icon: 'icon-ordered-list',
      group: 'lists',
    },
  },
];
```

`src/bundle.manifests.ts`:

```ts
import { manifests as boardManifests } from './property-editors/board/manifests.js';
import { manifests as calendarManifests } from './property-editors/calendar/manifests.js';
import { manifests as laneOverrideManifests } from './property-editors/lane-overrides/manifests.js';
import { manifests as manualLaneManifests } from './property-editors/manual-lanes/manifests.js';

export const manifests: Array<UmbExtensionManifest> = [
  ...boardManifests,
  ...calendarManifests,
  ...laneOverrideManifests,
  ...manualLaneManifests,
];
```

- [ ] **Step 6: Run the tests and build to verify they pass**

Run: `npm test && npm run build`
Expected: tests PASS, 8 new tests; build succeeds.

- [ ] **Step 7: Run the full suite one last time**

Run: `dotnet build && dotnet test && cd src/Umbraco.Community.Kanban/Client && npm test && npm run build`
Expected: everything passes.

- [ ] **Step 8: Commit**

```bash
git add src/Umbraco.Community.Kanban/Client
git commit -m "feat: add the manual lanes editor"
```

---

## Manual verification

After Task 17, wire the package into a running site and confirm the foundation actually works:

1. Add a `ProjectReference` to `Umbraco.Community.Kanban` from `src/YourITTeam/YourITTeam.csproj` in the your-it-team-cloud repo.
2. Build and start the site.
3. Settings → Data Types → Create → **Kanban Board**. The settings from Task 14 should render.
4. Set the lane property to a document property backed by a dropdown, save, and reopen. The value must persist — this proves configuration round-trips.
5. Hit `GET /umbraco/kanban/api/v1/configurations` in the browser with a backoffice session. The new data type should be listed with `kind: "Board"`.
6. `POST /umbraco/kanban/api/v1/lanes/preview` with `{ contentTypeKey, configuration }` should return the dropdown's options as lanes, each with a palette colour, ending with the unassigned lane.

## What this plan deliberately leaves out

These belong to later milestones and must not be built here:

- Board and calendar rendering, cards, drag, publish-pending — milestones 2 to 4
- The collection view and content app hosts, the data type workspace Kanban tab, real-time sync — milestones 2 and 5
- The Contentment lane source package — milestone 6
- Property-alias pickers for `laneProperty`, `dateProperty` and `cardProperties`, which currently use text inputs
- Wiring `POST /lanes/preview` (Task 13) into the lane override editor's `lanes` input (Task 16): both were built to spec but nothing in this plan specifies the settings-host component that would watch the sibling `laneProperty`/`laneSource`/`manualLanes` fields and call the endpoint. Until milestone 2 builds that host, the lane-appearance settings field on a Kanban Board data type always renders "Choose a lane property first, then lanes will appear here." — a known, deliberately deferred gap, not a bug in either task's implementation.
