const request = require('supertest');
const app = require('../index'); // Path to your Express app
const { resetTestDB, clearUserTable, prisma, disconnectPrisma } = require('./testUtils');

describe('User API', () => {
  beforeAll(async () => {
    // Reset the test database and apply schema before any tests run
    // This ensures 'test.db' is created and schema is applied via 'prisma db push'
    await resetTestDB(); 
  });

  beforeEach(async () => {
    // Clear the user table before each test to ensure isolation
    // This uses the prisma client connected to 'test.db'
    await clearUserTable();
  });

  afterAll(async () => {
    // Disconnect Prisma client after all tests are done
    await disconnectPrisma();
    // If your app instance or server needs explicit closing:
    // if (app && app.server && typeof app.server.close === 'function') {
    //   app.server.close(); // Assuming index.js exports an object like { app, server }
    // }
  });

  describe('POST /api/users - Create User', () => {
    it('should create a new user successfully', async () => {
      const newUser = {
        email: 'test@example.com',
        password: 'password123',
      };
      const response = await request(app)
        .post('/api/users')
        .send(newUser);

      expect(response.statusCode).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.email).toBe(newUser.email);
      expect(response.body).not.toHaveProperty('password'); // Ensure password is not returned

      // Optionally, verify the user is in the database
      const dbUser = await prisma.user.findUnique({ where: { email: newUser.email } });
      expect(dbUser).toBeTruthy();
      expect(dbUser.email).toBe(newUser.email);
    });

    it('should return 409 if email already exists', async () => {
      const existingUser = {
        email: 'existing@example.com',
        password: 'password123',
      };
      // Create the user first
      await request(app).post('/api/users').send(existingUser);

      // Attempt to create again with the same email
      const response = await request(app)
        .post('/api/users')
        .send(existingUser);

      expect(response.statusCode).toBe(409);
      expect(response.body.message).toBe('Email already exists');
    });

    it('should return 400 if email is missing', async () => {
      const response = await request(app)
        .post('/api/users')
        .send({ password: 'password123' });

      expect(response.statusCode).toBe(400);
      expect(response.body.message).toBe('Email and password are required');
    });

    it('should return 400 if password is missing', async () => {
      const response = await request(app)
        .post('/api/users')
        .send({ email: 'test@example.com' });

      expect(response.statusCode).toBe(400);
      expect(response.body.message).toBe('Email and password are required');
    });
  });

  describe('GET /api/users - Get All Users', () => {
    it('should return an empty array if no users exist', async () => {
      const response = await request(app).get('/api/users');
      expect(response.statusCode).toBe(200);
      expect(response.body.data).toEqual([]);
      expect(response.body.totalUsers).toBe(0);
    });

    it('should return all users', async () => {
      // Create a couple of users
      await prisma.user.createMany({
        data: [
          { email: 'user1@example.com', password: 'hashedpassword1' }, // Passwords should be hashed if your controller expects them, but for direct DB seeding for GET tests, it's simpler. Or use the API to create.
          { email: 'user2@example.com', password: 'hashedpassword2' },
        ],
      });
      // For simplicity in this test, we are directly inserting.
      // In a more complex scenario, you might use your POST /api/users endpoint to create users.

      const response = await request(app).get('/api/users');
      expect(response.statusCode).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].email).toBe('user1@example.com');
      expect(response.body.data[1].email).toBe('user2@example.com');
      expect(response.body.data[0]).not.toHaveProperty('password');
      expect(response.body.totalUsers).toBe(2);
    });

    it('should return users with pagination', async () => {
      // Create 3 users
      const usersData = [
        { email: 'paginate1@example.com', password: 'password' },
        { email: 'paginate2@example.com', password: 'password' },
        { email: 'paginate3@example.com', password: 'password' },
      ];
      // Use API to create users to ensure passwords are hashed correctly if that matters for other logic
      // For this GET test, direct insertion is fine if we only care about retrieval.
      // Let's use the API to be more robust to changes in create logic.
      // Note: This relies on the POST endpoint working correctly.
      await request(app).post('/api/users').send(usersData[0]);
      await request(app).post('/api/users').send(usersData[1]);
      await request(app).post('/api/users').send(usersData[2]);


      // Test page 1, limit 2
      let response = await request(app).get('/api/users?page=1&limit=2');
      expect(response.statusCode).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].email).toBe(usersData[0].email);
      expect(response.body.data[1].email).toBe(usersData[1].email);
      expect(response.body.currentPage).toBe(1);
      expect(response.body.totalPages).toBe(2); // 3 users, limit 2 -> 2 pages
      expect(response.body.totalUsers).toBe(3);

      // Test page 2, limit 2
      response = await request(app).get('/api/users?page=2&limit=2');
      expect(response.statusCode).toBe(200);
      expect(response.body.data).toHaveLength(1); // Last page has 1 user
      expect(response.body.data[0].email).toBe(usersData[2].email);
      expect(response.body.currentPage).toBe(2);
      expect(response.body.totalPages).toBe(2);
      expect(response.body.totalUsers).toBe(3);
    });
  });

  describe('GET /api/users/:id - Get User By ID', () => {
    let testUser;

    beforeEach(async () => {
      // Create a user to be used in these tests
      // Using direct prisma create for simplicity as we are testing GET by ID.
      // Password hashing isn't critical for the GET by ID retrieval part itself.
      testUser = await prisma.user.create({
        data: {
          email: 'getbyid@example.com',
          password: 'password123', // Actual password for POST, but for prisma.create just a string
        },
      });
    });

    it('should return a user if ID is valid and exists', async () => {
      const response = await request(app).get(`/api/users/${testUser.id}`);
      expect(response.statusCode).toBe(200);
      expect(response.body.id).toBe(testUser.id);
      expect(response.body.email).toBe(testUser.email);
      expect(response.body).not.toHaveProperty('password');
    });

    it('should return 404 if user ID does not exist', async () => {
      const nonExistentId = testUser.id + 999; // An ID that likely doesn't exist
      const response = await request(app).get(`/api/users/${nonExistentId}`);
      expect(response.statusCode).toBe(404);
      expect(response.body.message).toBe('User not found');
    });

    it('should return 400 if user ID is not a valid number', async () => {
      const invalidId = 'abc';
      const response = await request(app).get(`/api/users/${invalidId}`);
      // The controller's parseInt(id) will result in NaN.
      // The controller was updated to check for isNaN(userId) and return 400.
      expect(response.statusCode).toBe(400); 
      expect(response.body.message).toBe('Invalid user ID format'); // Matching controller's actual message
    });
  });

  describe('PUT /api/users/:id - Update User', () => {
    let userToUpdate;

    beforeEach(async () => {
      // Create a user to be updated in these tests
      // Using the API to create ensures password is hashed as per endpoint logic
      const response = await request(app)
        .post('/api/users')
        .send({ email: 'update@example.com', password: 'oldpassword123' });
      userToUpdate = response.body;
    });

    it('should update user email successfully', async () => {
      const newEmail = 'updated@example.com';
      const response = await request(app)
        .put(`/api/users/${userToUpdate.id}`)
        .send({ email: newEmail });

      expect(response.statusCode).toBe(200);
      expect(response.body.email).toBe(newEmail);
      expect(response.body.id).toBe(userToUpdate.id);

      // Verify in DB
      const dbUser = await prisma.user.findUnique({ where: { id: userToUpdate.id } });
      expect(dbUser.email).toBe(newEmail);
    });

    it('should update user password successfully', async () => {
      const newPassword = 'newpassword456';
      const response = await request(app)
        .put(`/api/users/${userToUpdate.id}`)
        .send({ password: newPassword });

      expect(response.statusCode).toBe(200);
      // Password itself is not returned, so we check the success status
      // And then verify the hash in the DB
      const dbUser = await prisma.user.findUnique({ where: { id: userToUpdate.id } });
      // We need the comparePassword utility here
      const { comparePassword } = require('../utils/hash'); // Assuming hash.js is in utils
      const passwordMatches = await comparePassword(newPassword, dbUser.password);
      expect(passwordMatches).toBe(true);
    });

    it('should return 409 if updating email to an already existing one', async () => {
      // Create another user
      await request(app)
        .post('/api/users')
        .send({ email: 'anotheruser@example.com', password: 'password123' });

      const response = await request(app)
        .put(`/api/users/${userToUpdate.id}`)
        .send({ email: 'anotheruser@example.com' }); // Try to update to anotheruser's email

      expect(response.statusCode).toBe(409);
      expect(response.body.message).toBe('Email already exists');
    });

    it('should return 404 if user ID does not exist', async () => {
      const nonExistentId = userToUpdate.id + 999;
      const response = await request(app)
        .put(`/api/users/${nonExistentId}`)
        .send({ email: 'newemail@example.com' });

      expect(response.statusCode).toBe(404);
      expect(response.body.message).toBe('User not found');
    });
    
    it('should return 400 if no data provided for update', async () => {
      const response = await request(app)
        .put(`/api/users/${userToUpdate.id}`)
        .send({}); // Empty data

      expect(response.statusCode).toBe(400);
      expect(response.body.message).toBe('No data provided for update');
    });
  });

  describe('DELETE /api/users/:id - Delete User', () => {
    let userToDelete;

    beforeEach(async () => {
      // Create a user to be deleted in these tests via API
      const response = await request(app)
        .post('/api/users')
        .send({ email: 'delete@example.com', password: 'password123' });
      userToDelete = response.body;
    });

    it('should delete a user successfully', async () => {
      const response = await request(app)
        .delete(`/api/users/${userToDelete.id}`);

      expect(response.statusCode).toBe(204); // No content

      // Verify user is removed from the database
      const dbUser = await prisma.user.findUnique({ where: { id: userToDelete.id } });
      expect(dbUser).toBeNull();
    });

    it('should return 404 if user ID does not exist', async () => {
      const nonExistentId = userToDelete.id + 999; // An ID that likely doesn't exist after the first user is deleted by clearUserTable or another test
      
      // First, ensure the user is actually deleted if a previous test in this block ran.
      // The main beforeEach(clearUserTable) runs *before* this block's beforeEach.
      // So, userToDelete is created fresh.
      
      const response = await request(app)
        .delete(`/api/users/${nonExistentId}`);
        
      expect(response.statusCode).toBe(404);
      expect(response.body.message).toBe('User not found');
    });

    it('should return 400 if user ID is not a valid number', async () => {
      const invalidId = 'abc';
      const response = await request(app).delete(`/api/users/${invalidId}`);
      expect(response.statusCode).toBe(400); 
      expect(response.body.message).toBe('Invalid user ID format'); // Adjusted to match actual controller output
    });
  });

  describe('GET /api/users/search - Search Users', () => {
    beforeEach(async () => {
      // Create some users for search tests using the API
      await request(app).post('/api/users').send({ email: 'searchme@example.com', password: 'password123' });
      await request(app).post('/api/users').send({ email: 'another@example.com', password: 'password123' });
      await request(app).post('/api/users').send({ email: 'SEARCHME.TOO@example.com', password: 'password123' }); // For case-insensitivity test
    });

    it('should return users matching the full email query (case-insensitive)', async () => {
      const response = await request(app).get('/api/users/search?email=searchme@example.com');
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveLength(1); // Should find 'searchme@example.com'
      expect(response.body[0].email).toBe('searchme@example.com');
      expect(response.body[0]).not.toHaveProperty('password');
    });

    it('should return users matching a partial email query (case-insensitive)', async () => {
      const response = await request(app).get('/api/users/search?email=searchme');
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveLength(2); // Should find 'searchme@example.com' and 'SEARCHME.TOO@example.com'
      // Check if both expected emails are in the results, order might not be guaranteed
      const emails = response.body.map(user => user.email.toLowerCase());
      expect(emails).toContain('searchme@example.com');
      expect(emails).toContain('searchme.too@example.com');
    });

    it('should return an empty array if no users match the email query', async () => {
      const response = await request(app).get('/api/users/search?email=nomatch');
      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('should return 400 if email query parameter is missing', async () => {
      const response = await request(app).get('/api/users/search');
      expect(response.statusCode).toBe(400);
      expect(response.body.message).toBe('Email query parameter is required for search');
    });
  });
});
