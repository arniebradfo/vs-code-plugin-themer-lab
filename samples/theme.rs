//! Compare Rust lifetimes, macros, attributes, patterns, and ownership.
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq)]
enum Role {
    Background,
    Foreground,
    Accent,
}

#[derive(Debug)]
struct Theme<'a> {
    name: &'a str,
    colors: Vec<(Role, &'a str)>,
}

impl fmt::Display for Theme<'_> {
    fn fmt(&self, output: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(output, "{} ({} colors)", self.name, self.colors.len())
    }
}

impl<'a> Theme<'a> {
    fn color(&self, role: Role) -> Option<&'a str> {
        self.colors.iter().find_map(|(candidate, color)| {
            if *candidate == role { Some(*color) } else { None }
        })
    }

    fn describe(&self) -> Result<String, &'static str> {
        let accent = self.color(Role::Accent).ok_or("Missing accent")?;
        Ok(format!("{}: {}", self.name, accent.to_uppercase()))
    }
}

fn main() {
    let theme = Theme {
        name: "Themer Lab",
        colors: vec![
            (Role::Background, "#121314"),
            (Role::Foreground, "#bfbfbf"),
            (Role::Accent, "#297aa0"),
        ],
    };
    match theme.describe() {
        Ok(label) => println!("{theme}\n{label}"),
        Err(message) => eprintln!("Preview unavailable: {message}"),
    }
}
