-- Compare SQL keywords, identifiers, functions, strings, and numeric literals.
CREATE TABLE themes (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    accent TEXT NOT NULL DEFAULT '#297aa0',
    minimum_contrast REAL NOT NULL CHECK (minimum_contrast >= 1.0),
    description TEXT
);

INSERT INTO themes (id, name, accent, minimum_contrast, description)
VALUES
    (1, 'Themer Lab', '#297aa0', 7.0, NULL),
    (2, 'Forest at night', '#27934d', 4.5, 'A quiet editor');

WITH ranked_themes AS (
    SELECT
        id,
        name,
        UPPER(accent) AS accent,
        minimum_contrast,
        COALESCE(description, 'No description') AS description,
        ROW_NUMBER() OVER (ORDER BY minimum_contrast DESC) AS rank
    FROM themes
    WHERE accent LIKE '#%'
)
SELECT
    name,
    accent,
    description,
    CASE
        WHEN minimum_contrast >= 7 THEN 'High contrast'
        ELSE 'Standard contrast'
    END AS contrast_label
FROM ranked_themes
WHERE rank <= 10
ORDER BY name ASC;
