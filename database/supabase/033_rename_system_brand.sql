-- Rename the public library profile while preserving customized campus names.

ALTER TABLE library_profile_settings
  ALTER COLUMN library_name
  SET DEFAULT 'STI College Ormoc Integrated Library Management System';

UPDATE library_profile_settings
SET library_name = 'STI College Ormoc Integrated Library Management System'
WHERE library_name = 'STI Ormoc Smart Library';
