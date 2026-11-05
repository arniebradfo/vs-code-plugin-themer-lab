#include <stdbool.h>
#include <stddef.h>
#include <stdio.h>

#define COLOR_COUNT 3

/* Compare macros, typedefs, pointers, character literals, and format strings. */
typedef enum {
    ROLE_BACKGROUND,
    ROLE_FOREGROUND,
    ROLE_ACCENT
} ColorRole;

typedef struct {
    ColorRole role;
    const char *name;
    const char *value;
} Color;

static bool print_palette(const Color *colors, size_t count) {
    if (colors == NULL || count == 0) {
        return false;
    }
    for (size_t index = 0; index < count; ++index) {
        const Color *color = &colors[index];
        printf("%zu. %-10s = %s%c", index + 1, color->name, color->value, '\n');
    }
    return true;
}

int main(void) {
    const Color colors[COLOR_COUNT] = {
        {ROLE_BACKGROUND, "background", "#121314"},
        {ROLE_FOREGROUND, "foreground", "#bfbfbf"},
        {ROLE_ACCENT, "accent", "#297aa0"}
    };
    return print_palette(colors, COLOR_COUNT) ? 0 : 1;
}
