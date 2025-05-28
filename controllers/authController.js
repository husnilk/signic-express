const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken"); // Added import

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function register(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
      },
    });
    // Exclude password from the response
    const { password: _, ...userWithoutPassword } = user;
    res.status(201).json(userWithoutPassword);
  } catch (error) {
    // Check for unique constraint violation (email already exists)
    if (error.code === "P2002" && error.meta?.target?.includes("email")) {
      return res.status(409).json({ error: "Email already exists" });
    }
    console.error("Registration error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Use a strong secret key and consider environment variables for production
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      "YOUR_SECRET_KEY", // IMPORTANT: Replace with a strong secret, preferably from env variables
      { expiresIn: "1h" }
    );

    res.status(200).json({ token });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

module.exports = {
  register,
  login,
};
