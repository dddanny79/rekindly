-- Birthdays synced from iOS as 1604-MM-DD (Apple's placeholder for "no year") were
-- stored with that year when iOS left out X-APPLE-OMIT-YEAR. Make them yearless.
UPDATE `people` SET `birthday` = '--' || substr(`birthday`, 6) WHERE `birthday` LIKE '1604-__-__';
