// Compare Go packages, receivers, interfaces, and short declarations.
package main

import (
	"fmt"
	"sort"
	"strings"
)

type Role string

const (
	Background Role = "background"
	Foreground Role = "foreground"
	Accent     Role = "accent"
)

type Describer interface {
	Describe() string
}

type Theme struct {
	Name   string
	Colors map[Role]string
}

func (theme Theme) Describe() string {
	return fmt.Sprintf("%s: %s", theme.Name, theme.Colors[Accent])
}

func (theme Theme) Rows(enabled bool) []string {
	if !enabled || theme.Colors == nil {
		return nil
	}
	rows := make([]string, 0, len(theme.Colors))
	for role, color := range theme.Colors {
		rows = append(rows, fmt.Sprintf("%s = %s", role, strings.ToUpper(color)))
	}
	sort.Strings(rows)
	return rows
}

func main() {
	theme := Theme{
		Name: "Themer Lab",
		Colors: map[Role]string{
			Background: "#121314",
			Foreground: "#bfbfbf",
			Accent:     "#297aa0",
		},
	}
	var preview Describer = theme
	fmt.Println(preview.Describe())
	fmt.Println(strings.Join(theme.Rows(true), "\n"))
}
