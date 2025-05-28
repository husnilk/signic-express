const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto'); // For original_hash and unique stored_filename
const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding ...');

  // Create users
  const users = [];
  for (let i = 1; i <= 10; i++) {
    const user = await prisma.user.create({
      data: {
        email: `user${i}@example.com`,
        // In a real application, passwords should be hashed.
        // For this seed script, we'll use a plain text password.
        password: 'password123',
      },
    });
    users.push(user);
  }
  console.log(`Created ${users.length} users`);

  // Create documents
  const documents = [];
  for (let i = 1; i <= 10; i++) {
    // Use the created users for uploader_id and owner_id
    // For simplicity, user i uploads and owns document i, or you can randomize
    const uploader = users[i - 1]; // user[0] for doc 1, user[1] for doc 2, etc.
    const owner = users[Math.floor(Math.random() * users.length)]; // Assign a random owner from the created users

    const document = await prisma.document.create({
      data: {
        title: `Sample Document ${i}`,
        description: `This is a sample document description for document ${i}.`,
        uploader_id: uploader.id,
        owner_id: owner.id,
        original_filename: `sample_doc_${i}.pdf`,
        // Ensure stored_filename is unique
        stored_filename: `fake-stored-doc-${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${i}.pdf`,
        storage_path: 'uploads/', // This is a logical path, not a file system operation during seed
        filesize: Math.floor(Math.random() * (500000 - 1000 + 1)) + 1000, // Random filesize between 1KB and 500KB
        status: 'uploaded',
        original_hash: crypto.randomBytes(32).toString('hex'), // Generate a fake SHA256 hash
        // uploaded_at, created_at, and updated_at have default values in the schema
      },
    });
    documents.push(document);
  }
  console.log(`Created ${documents.length} documents`);

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
