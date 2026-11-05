[CmdletBinding()]
param(
    [ValidatePattern('^#[0-9a-fA-F]{6}$')]
    [string] $Accent = '#297aa0',
    [switch] $Paused
)

# Compare attributes, types, variables, pipelines, and expandable strings.
function New-ThemePreview {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $Name,
        [string] $Color,
        [double] $MinimumContrast = 4.5
    )

    [pscustomobject]@{
        Name = $Name
        Accent = $Color.ToUpperInvariant()
        Contrast = $MinimumContrast
        Enabled = -not $Paused
        Description = $null
    }
}

$theme = New-ThemePreview -Name 'Themer Lab' -Color $Accent -MinimumContrast 7.0
$roles = @('background', 'foreground', 'accent')

@"
Theme: $($theme.Name)
Accent: $($theme.Accent)
Enabled: $($theme.Enabled)
"@

$roles |
    Where-Object { $theme.Enabled -eq $true } |
    Sort-Object |
    ForEach-Object {
        $color = if ($_ -eq 'accent') { $theme.Accent } else { '#bfbfbf' }
        '{0,-10} = {1}' -f $_, $color
    }
