# Compare Ruby symbols, blocks, regular expressions, and string interpolation.
module Themer
  class Theme
    DEFAULT_CONTRAST = 4.5
    attr_reader :name, :colors

    def initialize(name:, accent:, enabled: true)
      raise ArgumentError, "Invalid accent: #{accent}" unless accent.match?(/\A#[0-9a-f]{6}\z/i)

      @name = name
      @enabled = enabled
      @colors = {
        background: "#121314",
        foreground: "#bfbfbf",
        accent: accent
      }.freeze
    end

    def describe(contrast: DEFAULT_CONTRAST)
      return nil unless @enabled

      rows = colors.map.with_index do |(role, color), index|
        "#{index + 1}. #{role.to_s.ljust(10)} = #{color.upcase}"
      end
      "#{name} (contrast #{contrast})\n#{rows.join("\n")}"
    end
  end
end

theme = Themer::Theme.new(name: "Themer Lab", accent: "#297aa0")
puts theme.describe(contrast: 7.0)
