using System.Text.Json;
using Umbraco.Community.Kanban.Serialization;

namespace Umbraco.Community.Kanban.Tests.Serialization;

public class SingleSelectDropdownJsonConverterTests
{
    private static readonly JsonSerializerOptions Options = new()
    {
        Converters = { new SingleSelectDropdownJsonConverter() },
    };

    private static string? Read(string json) => JsonSerializer.Deserialize<string?>(json, Options);

    [Fact]
    public void Read_AcceptsABareString_WhatANeverTouchedDefaultStores()
    {
        Read("\"sortOrder\"").Should().Be("sortOrder");
    }

    [Fact]
    public void Read_AcceptsAOneElementArray_WhatTheDropdownEditorActuallyPersists()
    {
        Read("""["sortOrder"]""").Should().Be("sortOrder");
    }

    [Fact]
    public void Read_TakesTheFirstElementOfALongerArray()
    {
        Read("""["name","sortOrder"]""").Should().Be("name");
    }

    [Fact]
    public void Read_TreatsAnEmptyArrayAsNull()
    {
        Read("[]").Should().BeNull();
    }

    [Fact]
    public void Read_PassesNullThrough()
    {
        Read("null").Should().BeNull();
    }

    [Fact]
    public void Write_EmitsABareString()
    {
        JsonSerializer.Serialize("sortOrder", Options).Should().Be("\"sortOrder\"");
    }

    [Fact]
    public void Write_EmitsNullForNull()
    {
        JsonSerializer.Serialize((string?)null, Options).Should().Be("null");
    }
}
