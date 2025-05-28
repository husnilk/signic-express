const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { hashPassword } = require('./utils/hash'); // Adjusted path, utils is in root.

async function createUser(req, res, next) {
  const { email, password } = req.body;

  // Basic validation
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const hashedPassword = await hashPassword(password);

    const newUser = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
      },
      select: {
        id: true,
        email: true,
        // Add other fields you want to return, e.g., createdAt, updatedAt if they exist in your model
      },
    });

    res.status(201).json(newUser);
  } catch (e) {
    if (e.code === 'P2002' && e.meta && e.meta.target && e.meta.target.includes('email')) {
      // Unique constraint violation (email already exists)
      return res.status(409).json({ message: 'Email already exists' });
    }
    // For other errors, pass them to the error handling middleware
    next(e);
  }
}

async function getAllUsers(req, res, next) {
  let { page, limit } = req.query;

  page = parseInt(page, 10) || 1;
  limit = parseInt(limit, 10) || 10;

  // Ensure limit is not excessively large if needed, e.g., max 100
  // limit = Math.min(limit, 100); 

  const skip = (page - 1) * limit;

  try {
    const users = await prisma.user.findMany({
      skip: skip,
      take: limit,
      select: {
        id: true,
        email: true,
        // Add any other non-sensitive fields here if they exist in your model
        // e.g., name, createdAt
      },
    });

    const totalUsers = await prisma.user.count();

    res.status(200).json({
      data: users,
      currentPage: page,
      totalPages: Math.ceil(totalUsers / limit),
      totalUsers: totalUsers,
    });
  } catch (e) {
    next(e);
  }
}

async function getUserById(req, res, next) {
  const id = parseInt(req.params.id, 10);

  // Check if id is a valid number after parsing
  if (isNaN(id)) {
    return res.status(400).json({ message: 'Invalid user ID format' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: id },
      select: {
        id: true,
        email: true,
        // Add any other non-sensitive fields you want to return
      },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json(user);
  } catch (e) {
    next(e);
  }
}

async function updateUser(req, res, next) {
  const id = parseInt(req.params.id, 10);
  const { email, password } = req.body;
  const dataToUpdate = {};

  if (isNaN(id)) {
    return res.status(400).json({ message: 'Invalid user ID format' });
  }

  if (email) {
    dataToUpdate.email = email;
  }

  if (password) {
    try {
      dataToUpdate.password = await hashPassword(password);
    } catch (hashError) {
      return next(hashError); // Pass hashing errors to error handler
    }
  }

  if (Object.keys(dataToUpdate).length === 0) {
    return res.status(400).json({ message: 'No data provided for update' });
  }

  try {
    const updatedUser = await prisma.user.update({
      where: { id: id },
      data: dataToUpdate,
      select: {
        id: true,
        email: true,
        // Add any other non-sensitive fields
      },
    });
    res.status(200).json(updatedUser);
  } catch (e) {
    if (e.code === 'P2025') {
      return res.status(404).json({ message: 'User not found' });
    } else if (e.code === 'P2002') {
      return res.status(409).json({ message: 'Email already exists' });
    }
    next(e);
  }
}

async function deleteUser(req, res, next) {
  const id = parseInt(req.params.id, 10);

  if (isNaN(id)) {
    return res.status(400).json({ message: 'Invalid user ID format' });
  }

  try {
    await prisma.user.delete({
      where: { id: id },
    });
    res.status(204).send();
  } catch (e) {
    if (e.code === 'P2025') {
      return res.status(404).json({ message: 'User not found' });
    }
    next(e);
  }
}

async function searchUsers(req, res, next) {
  const { email } = req.query;

  if (!email || typeof email !== 'string' || email.trim() === '') {
    return res.status(400).json({ message: 'Email query parameter is required for search' });
  }

  try {
    const users = await prisma.user.findMany({
      where: {
        email: {
          contains: email,
          // mode: 'insensitive', // Removed for SQLite compatibility
        },
      },
      select: {
        id: true,
        email: true,
        // Add any other non-sensitive fields
      },
    });
    res.status(200).json(users);
  } catch (e) {
    next(e);
  }
}

module.exports = {
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  searchUsers,
};
