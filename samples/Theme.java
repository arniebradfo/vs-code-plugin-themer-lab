import java.util.List;
import java.util.Map;
import java.util.Optional;

/** Compare Java records, annotations, generics, streams, and method references. */
public final class Theme {
    public enum Role { BACKGROUND, FOREGROUND, ACCENT }

    public record Palette(String name, Map<Role, String> colors) {
        public Palette {
            colors = Map.copyOf(colors);
        }

        public Optional<String> color(Role role) {
            return Optional.ofNullable(colors.get(role));
        }
    }

    @FunctionalInterface
    public interface Preview {
        String describe(Palette palette);
    }

    public static void main(String[] args) {
        final var palette = new Palette("Themer Lab", Map.of(
            Role.BACKGROUND, "#121314",
            Role.FOREGROUND, "#bfbfbf",
            Role.ACCENT, "#297aa0"
        ));
        Preview preview = value -> "%s: %s".formatted(
            value.name(),
            value.color(Role.ACCENT).orElse("unset")
        );

        List<String> rows = palette.colors().entrySet().stream()
            .map(entry -> entry.getKey() + " = " + entry.getValue())
            .sorted()
            .toList();

        System.out.println(preview.describe(palette));
        rows.forEach(System.out::println);
    }
}
