"""Compare Python annotations, decorators, strings, and comprehensions."""

from dataclasses import dataclass
from enum import Enum
import re


class Role(Enum):
    BACKGROUND = "background"
    FOREGROUND = "foreground"
    ACCENT = "accent"


@dataclass(frozen=True)
class Theme:
    name: str
    accent: str
    minimum_contrast: float = 4.5
    description: str | None = None

    @property
    def label(self) -> str:
        return f"{self.name}: {self.accent.upper()}"

    def colors(self, enabled: bool = True) -> dict[str, str]:
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", self.accent):
            raise ValueError(f"Invalid accent: {self.accent!r}")
        if not enabled:
            return {}
        return {
            role.value: self.accent if role is Role.ACCENT else "#bfbfbf"
            for role in Role
        }


async def describe(theme: Theme) -> str:
    # Async declarations and format specifiers have distinct token roles.
    return f"{theme.label} (contrast {theme.minimum_contrast:.1f})"


if __name__ == "__main__":
    theme = Theme("Themer Lab", "#297aa0", minimum_contrast=7.0)
    for role, color in theme.colors().items():
        print(f"{role:>10} = {color}")
