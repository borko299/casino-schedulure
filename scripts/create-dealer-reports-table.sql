-- Create dealer_reports table
CREATE TABLE IF NOT EXISTS dealer_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  dealer_id UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  table_name VARCHAR(100),
  incident_type VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  severity VARCHAR(20) DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'dismissed')),
  reported_by VARCHAR(100) NOT NULL,
  reported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolution_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_dealer_reports_dealer_id ON dealer_reports(dealer_id);
CREATE INDEX IF NOT EXISTS idx_dealer_reports_status ON dealer_reports(status);
CREATE INDEX IF NOT EXISTS idx_dealer_reports_reported_at ON dealer_reports(reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_dealer_reports_severity ON dealer_reports(severity);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_dealer_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_dealer_reports_updated_at
  BEFORE UPDATE ON dealer_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_dealer_reports_updated_at();
