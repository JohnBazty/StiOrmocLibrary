-- Rename the public library profile while preserving customized campus names.

ALTER TABLE `library_profiles`
  MODIFY COLUMN `library_name` VARCHAR(150) NOT NULL
    DEFAULT 'STI College Ormoc Integrated Library Management System';

UPDATE `library_profiles`
SET `library_name` = 'STI College Ormoc Integrated Library Management System'
WHERE `library_name` = 'STI Ormoc Smart Library';
