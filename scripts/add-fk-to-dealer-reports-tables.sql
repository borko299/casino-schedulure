-- Този скрипт добавя външен ключ (foreign key) към таблицата 'dealer_reports'.
-- Той свързва колоната 'table_id' с колоната 'id' в таблицата 'tables'.
-- Това позволява на Supabase автоматично да свързва таблиците и да извлича името на масата за даден репорт.

-- Преди да изпълните командата, е добре да проверите дали има репорти със table_id,
-- което не съществува в таблицата 'tables'. Можете да ги намерите с тази заявка:
-- SELECT id, table_id FROM dealer_reports WHERE table_id IS NOT NULL AND table_id NOT IN (SELECT id FROM tables);
-- Ако има такива, трябва да ги изтриете или да зададете table_id = NULL.

-- Добавяне на външния ключ
ALTER TABLE public.dealer_reports
ADD CONSTRAINT fk_dealer_reports_table_id
FOREIGN KEY (table_id) REFERENCES public.tables(id) ON DELETE SET NULL;
