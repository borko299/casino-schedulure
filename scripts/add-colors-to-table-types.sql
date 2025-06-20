ALTER TABLE table_types
ADD COLUMN color VARCHAR(7) DEFAULT '#E5E7EB', -- Default to a light gray
ADD COLUMN text_color VARCHAR(7) DEFAULT '#1F2937'; -- Default to a dark gray for text

COMMENT ON COLUMN table_types.color IS 'Background color for the table type in HEX format (e.g., #FF0000)';
COMMENT ON COLUMN table_types.text_color IS 'Text color for the table type in HEX format (e.g., #FFFFFF)';

-- Update existing rows with default values if you want to ensure they are not NULL
-- This is optional if your application handles NULL values for colors gracefully
UPDATE table_types
SET color = '#E5E7EB'
WHERE color IS NULL;

UPDATE table_types
SET text_color = '#1F2937'
WHERE text_color IS NULL;
