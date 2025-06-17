-- Добавяне на колона за телефонен номер в таблицата dealers
ALTER TABLE dealers ADD COLUMN IF NOT EXISTS phone_number TEXT;
