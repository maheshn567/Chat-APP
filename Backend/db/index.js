import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

// Create the PostgreSQL adapter using the connection string from .env
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

// Singleton pattern — in development, nodemon restarts create new module
// instances. Storing prisma on `global` prevents exhausting DB connections.
const globalForPrisma = global;

const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}

export default prisma;
