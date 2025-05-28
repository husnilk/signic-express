const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding ...');
  for (let i = 1; i <= 10; i++) {
    await prisma.user.create({
      data: {
        email: `user${i}@example.com`,
        // In a real application, passwords should be hashed.
        // For this seed script, we'll use a plain text password.
        password: 'password123',
      },
    });
  }
  console.log('Created 10 users');
  console.log('Seeding finished.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
