-- Актуализиране на статуса на глобите за по-добро управление
ALTER TABLE dealer_reports 
ADD COLUMN IF NOT EXISTS fine_status VARCHAR(20) DEFAULT 'pending' CHECK (fine_status IN ('pending', 'approved', 'rejected', 'paid'));

-- Актуализиране на съществуващите записи
UPDATE dealer_reports 
SET fine_status = CASE 
  WHEN fine_applied = true THEN 'approved'
  WHEN fine_amount IS NOT NULL AND fine_applied = false THEN 'pending'
  ELSE 'pending'
END
WHERE fine_amount IS NOT NULL;

-- Добавяне на индекс за по-бърза заявка
CREATE INDEX IF NOT EXISTS idx_dealer_reports_fine_status ON dealer_reports(fine_status);

-- Коментари
COMMENT ON COLUMN dealer_reports.fine_status IS 'Статус на глобата: pending (чака), approved (одобрена), rejected (отхвърлена), paid (платена)';
