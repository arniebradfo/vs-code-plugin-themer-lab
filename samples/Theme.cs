using System;
using System.Collections.Generic;
using System.Linq;

namespace Themer.Samples;

// Compare records, nullable types, attributes, interpolation, and LINQ.
public enum ColorRole { Background, Foreground, Accent }

public sealed record Theme(
    string Name,
    IReadOnlyDictionary<ColorRole, string> Colors,
    double MinimumContrast = 4.5,
    string? Description = null)
{
    public string Label => $"{Name}: {Colors[ColorRole.Accent]}";

    public IEnumerable<string> Rows(bool enabled = true)
    {
        if (!enabled) yield break;

        foreach (var (role, color) in Colors.OrderBy(entry => entry.Key))
        {
            yield return $"{role,-10} = {color.ToUpperInvariant()}";
        }
    }
}

public static class Preview
{
    [Obsolete("Use Theme.Label instead.")]
    public static string Describe(Theme theme) => theme.Label;

    public static void Main()
    {
        var theme = new Theme("Themer Lab", new Dictionary<ColorRole, string>
        {
            [ColorRole.Background] = "#121314",
            [ColorRole.Foreground] = "#bfbfbf",
            [ColorRole.Accent] = "#297aa0"
        });
        Console.WriteLine(theme.Description ?? theme.Label);
        foreach (var row in theme.Rows()) Console.WriteLine(row);
    }
}
