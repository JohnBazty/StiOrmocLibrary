# MySQL Server and Workbench Setup on Windows

This tutorial prepares a local MySQL database for the STI Ormoc Smart Library project. It covers installing MySQL Server and MySQL Workbench, configuring the server, creating the project database and application account, testing permissions, and preparing the future Prisma connection.

> MySQL Workbench is the graphical client used to manage a database. MySQL Server is the service that stores the data. You need both.

## 1. Install the required software

### Recommended versions

- MySQL Server 8.4 LTS, 64-bit Windows MSI
- Latest MySQL Workbench Windows MSI
- Microsoft Visual C++ 2015-2022 Redistributable

### Download links

1. Download MySQL Server from [MySQL Community Downloads](https://dev.mysql.com/downloads/).
2. Download MySQL Workbench from [MySQL Workbench Downloads](https://dev.mysql.com/downloads/workbench/).
3. If Windows reports a missing runtime, install the Microsoft Visual C++ 2015-2022 Redistributable and restart the installer.

Oracle may show a sign-in or registration page before a download. Choose **No thanks, just start my download** if you do not want to create an Oracle account.

## 2. Install MySQL Server

1. Run the MySQL Server MSI as an administrator.
2. Keep the default installation directory unless you have a reason to change it.
3. When installation finishes, leave **Run MySQL Configurator** selected.
4. Open MySQL Configurator.

The server is not usable until configuration is completed.

## 3. Configure MySQL Server

Use the following values in MySQL Configurator. The exact screen names can vary slightly by installer version.

### Server type and networking

1. Choose a standalone MySQL Server configuration.
2. Keep **TCP/IP** enabled.
3. Use port `3306`.
4. Keep the X Protocol port at its default if shown.
5. You do not need to open the Windows Firewall port when the database will only be used on this computer.

### Authentication

1. Use the recommended strong-password authentication option.
2. Create a strong password for the MySQL `root` administrator.
3. Save this password in a password manager. Do not put it in source code, documentation, screenshots, chat messages, or Git.

The `root` account is for database administration. The application will receive a separate account later.

### Windows service

1. Configure MySQL as a Windows service.
2. Use the suggested service name, commonly `MySQL84` for MySQL 8.4.
3. Enable **Start the MySQL Server at System Startup**.
4. Use the standard Windows system account unless your school environment requires another account.
5. Apply the configuration and confirm that every configuration step succeeds.

## 4. Install and open MySQL Workbench

1. Run the MySQL Workbench MSI.
2. Choose **Complete** installation.
3. Finish the installation.
4. Open the Windows Start menu, search for **MySQL Workbench**, and launch it.

## 5. Create the administrator connection

From the Workbench home screen:

1. Click the **+** button beside **MySQL Connections**.
2. Enter these values:

| Setting | Value |
| --- | --- |
| Connection Name | `Local MySQL Administrator` |
| Connection Method | `Standard (TCP/IP)` |
| Hostname | `127.0.0.1` |
| Port | `3306` |
| Username | `root` |
| Default Schema | Leave blank |

3. Click **Store in Vault** if you want Workbench to remember the root password on this computer.
4. Click **Test Connection**.
5. Enter the root password created in MySQL Configurator.
6. Confirm that Workbench reports a successful connection.
7. Click **OK** to save the connection.

Open the new connection tile. A SQL editor tab should appear.

## 6. Create the project database and application user

Open a new SQL tab under the root connection. Paste the script below.

Before running it, replace `CHANGE_ME_STRONG_PASSWORD` with a new strong password used only by this application.

```sql
CREATE DATABASE IF NOT EXISTS `sti_ormoc_library`
  CHARACTER SET utf8
  COLLATE utf8_general_ci;

CREATE USER IF NOT EXISTS 'sti_library_app'@'localhost'
  IDENTIFIED BY 'CHANGE_ME_STRONG_PASSWORD';

GRANT ALL PRIVILEGES
  ON `sti_ormoc_library`.*
  TO 'sti_library_app'@'localhost';

SHOW GRANTS FOR 'sti_library_app'@'localhost';
```

Run the script by clicking the lightning-bolt button or pressing `Ctrl+Shift+Enter`.

Expected result:

- The output panel shows successful statements.
- The final result shows privileges for `sti_ormoc_library`.
- The **Schemas** panel displays `sti_ormoc_library` after clicking its refresh button.

`ALL PRIVILEGES` is acceptable for a local development account because it is restricted to one schema. A production account should later receive only the permissions required by the deployed application.

## 7. Create the application connection in Workbench

Return to the Workbench home screen and create another connection:

| Setting | Value |
| --- | --- |
| Connection Name | `STI Ormoc Library - App` |
| Connection Method | `Standard (TCP/IP)` |
| Hostname | `127.0.0.1` |
| Port | `3306` |
| Username | `sti_library_app` |
| Default Schema | `sti_ormoc_library` |

1. Store the application password in the Workbench vault if appropriate.
2. Click **Test Connection**.
3. Save the connection.
4. Open it and confirm that `sti_ormoc_library` is shown in bold in the Schemas panel.

Use this connection for normal project work. Use the root connection only for server-level administration and account recovery.

## 8. Verify database permissions

In the `STI Ormoc Library - App` connection, open a SQL tab and execute:

```sql
SELECT
  DATABASE() AS active_database,
  CURRENT_USER() AS authenticated_account,
  VERSION() AS mysql_version,
  @@character_set_database AS database_character_set,
  @@collation_database AS database_collation;
```

Expected values include:

- `active_database`: `sti_ormoc_library`
- `authenticated_account`: `sti_library_app@localhost`
- `database_character_set`: `utf8`
- `database_collation`: `utf8_general_ci`

Optionally verify create, insert, select, and drop permissions:

```sql
CREATE TABLE setup_check (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  message VARCHAR(100) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE = InnoDB;

INSERT INTO setup_check (message)
VALUES ('MySQL connection works');

SELECT * FROM setup_check;

DROP TABLE setup_check;
```

The table is intentionally deleted after the test and is not part of the library schema.

## 9. Execute the project schema

1. Open the `STI Ormoc Library - App` Workbench connection.
2. Choose **File > Open SQL Script**.
3. Select `database/mysql56-schema.sql` from this repository.
4. Review that the script selects `sti_ormoc_library`.
5. Click the lightning-bolt button to execute the complete script.
6. Refresh the Schemas panel.
7. Expand `sti_ormoc_library > Tables` and confirm that 16 tables are present.
8. Expand `sti_ormoc_library > Triggers` and confirm that 8 triggers are present.

The script is compatible with MySQL 5.6 syntax and can also be executed on the recommended newer MySQL server.

## 10. Prepare the project connection string

When Prisma is added to the backend, create `apps/api/.env` from `apps/api/.env.example` and add:

```env
DATABASE_URL="mysql://sti_library_app:YOUR_URL_ENCODED_PASSWORD@127.0.0.1:3306/sti_ormoc_library"
```

Important rules:

- Replace `YOUR_URL_ENCODED_PASSWORD` with the application account password.
- URL-encode special characters in the password. For example, `@` becomes `%40` and `#` becomes `%23`.
- Never commit `apps/api/.env`. The repository already ignores `.env` files.
- Do not use the root account in `DATABASE_URL`.
- The current prototype does not use `DATABASE_URL` yet; it continues to run with mock data until Prisma integration is implemented.

## 11. Planned Prisma integration

Database integration should happen in this order:

1. Install Prisma in `apps/api`.
2. Create Prisma models from `database/mysql56-schema.sql` and `docs/schema-context.md`.
3. Generate and inspect the initial migration.
4. Apply the migration to `sti_ormoc_library`.
5. Add seed data for roles, demo users, categories, books, and physical copies.
6. Replace mock repositories one module at a time.
7. Keep the current API paths and frontend response shapes stable.

The current SQL script is the schema authority. If Prisma later becomes the migration authority, baseline it against the existing schema instead of recreating tables destructively.

## 12. Workbench tasks you will use frequently

### Refresh the schema

Click the refresh icon beside **Schemas** after applying a migration or running a schema script.

### Set the active schema

Double-click `sti_ormoc_library`. Its name becomes bold. You can also run:

```sql
USE `sti_ormoc_library`;
```

### Inspect table data

Right-click a table and choose **Select Rows - Limit 1000**.

### Inspect the table definition

Right-click a table and choose **Table Inspector**, or run:

```sql
SHOW CREATE TABLE table_name;
```

### Export a development backup

1. Open **Server > Data Export**.
2. Select `sti_ormoc_library`.
3. Choose **Export to Self-Contained File**.
4. Select **Dump Structure and Data**.
5. Choose a safe backup location outside the Git repository.
6. Click **Start Export**.

Do not store backups containing real student data in the repository.

## 13. Troubleshooting

### Cannot connect to `127.0.0.1:3306`

1. Press `Win+R`.
2. Run `services.msc`.
3. Find the MySQL service, commonly `MySQL84`.
4. Confirm its status is **Running**.
5. Start or restart the service if necessary.

### Access denied for user

- Confirm that the username is `sti_library_app`.
- Confirm the hostname is `127.0.0.1` and the account was created as `'sti_library_app'@'localhost'`.
- Re-enter the correct password instead of reusing the root password.
- From the root connection, run:

```sql
SHOW GRANTS FOR 'sti_library_app'@'localhost';
```

### Reset the application password

From the root connection:

```sql
ALTER USER 'sti_library_app'@'localhost'
  IDENTIFIED BY 'NEW_STRONG_PASSWORD';
```

Update the local `DATABASE_URL` afterward.

### The schema does not appear

- Click the refresh icon in the Schemas panel.
- Reconnect to the server.
- Run `SHOW DATABASES;` to confirm the schema exists.

### Port 3306 is already in use

In PowerShell:

```powershell
netstat -ano | findstr :3306
```

Do not change the port until you identify the other process. If you intentionally configure another port, update both Workbench connections and the project's future `DATABASE_URL`.

## Setup completion checklist

- [ ] MySQL Server is installed and configured as a running Windows service.
- [ ] MySQL Workbench is installed.
- [ ] The root administrator connection succeeds.
- [ ] Database `sti_ormoc_library` exists with `utf8` encoding.
- [ ] User `sti_library_app@localhost` exists.
- [ ] The application-user connection succeeds.
- [ ] The permission-verification SQL succeeds.
- [ ] The project schema script creates 16 tables and 8 triggers.
- [ ] The application password is stored securely and is not committed to Git.
- [ ] The mock frontend still starts with `npm run dev`.
