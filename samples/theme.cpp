#include <array>
#include <iostream>
#include <optional>
#include <string_view>
#include <utility>

// Compare namespaces, templates, structured bindings, and lambda captures.
namespace themer {
using Color = std::pair<std::string_view, std::string_view>;

template <std::size_t Count>
class Palette {
public:
    constexpr explicit Palette(std::array<Color, Count> colors) : colors_(colors) {}

    [[nodiscard]] std::optional<std::string_view> find(std::string_view role) const {
        for (const auto& [name, value] : colors_) {
            if (name == role) return value;
        }
        return std::nullopt;
    }

    template <typename Visitor>
    void visit(Visitor visitor) const {
        for (const auto& color : colors_) visitor(color);
    }

private:
    std::array<Color, Count> colors_;
};
}

int main() {
    constexpr std::array<themer::Color, 3> colors{{
        {"background", "#121314"},
        {"foreground", "#bfbfbf"},
        {"accent", "#297aa0"}
    }};
    const themer::Palette<3> palette{colors};
    const auto print = [](const themer::Color& color) {
        std::cout << color.first << " = " << color.second << '\n';
    };
    palette.visit(print);
    if (const auto accent = palette.find("accent")) {
        std::cout << "Selected: " << *accent << '\n';
    }
}
