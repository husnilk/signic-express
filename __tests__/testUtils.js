const { execSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient(); // This will use the DATABASE_URL set by the test script

async function resetTestDB() {
  // Ensure the schema is pushed to the test database.
  // This command will create test.db if it doesn't exist and apply schema.
  // It's synchronous, which is fine for a setup step.
  try {
    console.log('Resetting test database...');
    // Using --force-reset as db push alone might not reset if schema is same
    // Forcing reset ensures a clean state.
    // The command in instructions was "prisma db push --force-reset --accept-data-loss"
    // However, --force-reset is deprecated and now db push --force is the way if you want to skip the prompt
    // but --force-reset implies a schema reset + data loss.
    // The most robust way to ensure a clean schema and empty db is:
    // 1. Potentially delete the db file (though push should handle it)
    // 2. Run db push --accept-data-loss (or --force to skip prompt)
    // The original command seems fine for this context of creating a fresh test.db
    execSync("npx prisma db push --force-reset --accept-data-loss", { stdio: 'inherit' });
    console.log('Test database reset complete.');
  } catch (error) {
    console.error('Failed to reset test database:', error);
    throw error; // Propagate error to fail tests if DB setup fails
  }
}

async function clearUserTable() {
  // It's often better to reset the whole DB for true isolation,
  // but if clearing specific tables is needed:
  await prisma.user.deleteMany({});
}

// Function to disconnect prisma client, useful for afterAll
async function disconnectPrisma() {
  await prisma.$disconnect();
}

module.exports = {
  prisma, // Export prisma instance for use in tests
  resetTestDB,
  clearUserTable,
  disconnectPrisma,
};
