# Express App with CORS

This is a simple Express.js application with CORS (Cross-Origin Resource Sharing) enabled.

## Prerequisites

- Node.js and npm (or yarn) installed on your machine.

## Installation

1. Clone the repository (if applicable).
2. Navigate to the project directory.
3. Install the dependencies:
   ```bash
   npm install
   ```

## Running the Application

To start the server, run the following command:

```bash
npm start
```

The server will start on `http://localhost:3000` (or the port specified by the `PORT` environment variable). You can access the default route at `http://localhost:3000/`.

## Seeding Data

The project includes a seed script to populate the database with initial sample data, including users and documents. This is useful for development and testing purposes.

To run the seed script, use the following command:

```bash
npm run seed
```

This command will execute the `prisma/seed.js` script, which connects to the database, creates sample records, and then disconnects. Make sure your database server is running and accessible before executing the seed command.

## CORS Configuration

CORS is enabled for all routes by default using the `cors` middleware.

## Migrations

This project uses SQL-based migrations to manage database schema changes.

- **Location:** Migration files are located in the `migrations` directory in the root of the project. Each file typically contains SQL statements to apply a specific schema change.
- **Applying Migrations:** To apply migrations, you will need to run the SQL statements within these files against your database. This can be done using a database management tool (like phpMyAdmin, pgAdmin, DBeaver, etc.) or via the command line interface for your specific database (e.g., `psql` for PostgreSQL, `mysql` for MySQL). Execute the files in chronological order based on their filenames if there are multiple pending migrations.
- **Creating Migrations:** When making schema changes, create a new SQL file in the `migrations` directory. It's a good practice to name the file with a timestamp prefix to ensure correct ordering (e.g., `YYYYMMDDHHMMSS-descriptive-name.sql`).

As the project evolves, a dedicated migration tool might be introduced to automate this process. For now, manual execution of the SQL files is required.
