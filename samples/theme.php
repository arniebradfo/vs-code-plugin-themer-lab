<?php
declare(strict_types=1);

namespace Themer\Samples;

// Compare PHP enums, promoted properties, variables, and interpolated strings.
enum Role: string
{
    case Background = 'background';
    case Foreground = 'foreground';
    case Accent = 'accent';
}

final class Theme
{
    public function __construct(
        public readonly string $name,
        public readonly string $accent,
        private readonly bool $enabled = true,
    ) {}

    /** @return array<string, string> */
    public function colors(): array
    {
        if (!$this->enabled) {
            return [];
        }
        return [
            Role::Background->value => '#121314',
            Role::Foreground->value => '#bfbfbf',
            Role::Accent->value => $this->accent,
        ];
    }
}

$theme = new Theme(name: 'Themer Lab', accent: '#297aa0');
foreach ($theme->colors() as $role => $color) {
    echo "{$theme->name}: {$role} = {$color}\n";
}
