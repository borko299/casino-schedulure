-- Add fine-related columns to dealer_reports table
ALTER TABLE dealer_reports 
ADD COLUMN IF NOT EXISTS fine_amount DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS fine_reason TEXT,
ADD COLUMN IF NOT EXISTS fine_applied BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS fine_applied_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS fine_applied_by VARCHAR(100);

-- Create index for fine queries
CREATE INDEX IF NOT EXISTS idx_dealer_reports_fine_applied ON dealer_reports(fine_applied);
CREATE INDEX IF NOT EXISTS idx_dealer_reports_fine_amount ON dealer_reports(fine_amount) WHERE fine_amount > 0;

-- Add comment
COMMENT ON COLUMN dealer_reports.fine_amount IS 'Amount of fine in BGN';
COMMENT ON COLUMN dealer_reports.fine_reason IS 'Reason for the fine';
COMMENT ON COLUMN dealer_reports.fine_applied IS 'Whether the fine has been applied';
COMMENT ON COLUMN dealer_reports.fine_applied_at IS 'When the fine was applied';
COMMENT ON COLUMN dealer_reports.fine_applied_by IS 'Who applied the fine';
