-- Добавяне на колони за глоби към таблицата dealer_reports
ALTER TABLE dealer_reports 
ADD COLUMN IF NOT EXISTS fine_amount DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS fine_reason TEXT,
ADD COLUMN IF NOT EXISTS fine_applied BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS fine_applied_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS fine_applied_by TEXT;

-- Добавяне на индекс за по-бърза заявка на глоби
CREATE INDEX IF NOT EXISTS idx_dealer_reports_fine_amount ON dealer_reports(fine_amount) WHERE fine_amount IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dealer_reports_fine_applied ON dealer_reports(fine_applied) WHERE fine_applied = FALSE;

-- Добавяне на коментари за документация
COMMENT ON COLUMN dealer_reports.fine_amount IS 'Сума на глобата в лева';
COMMENT ON COLUMN dealer_reports.fine_reason IS 'Причина за налагане на глобата';
COMMENT ON COLUMN dealer_reports.fine_applied IS 'Дали глобата е приложена';
COMMENT ON COLUMN dealer_reports.fine_applied_at IS 'Кога е приложена глобата';
COMMENT ON COLUMN dealer_reports.fine_applied_by IS 'Кой е приложил глобата';
