import prisma from '../../db/index.js'
import createJWT from '../../utilities/jwtCreate.js';

export default async function register(req, res) {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const user = await prisma.user.findUnique({
            where: {
                email
            }
        });
        if (user) {
            return res.status(400).json({ message: "user already exists" });
        }

        const result = await prisma.user.create({
            data: {
                username,
                email,
                password
            }
        });

        // Generate and assign the JWT token cookie for the new user
        createJWT({ id: result.id, email: result.email, name: result.username }, res);

        res.status(201).json({ message: "user created successfully", result });
    } catch (err) {
        console.log(`error at register ${err}`);
        res.status(500).json({ message: "Internal server error", err });
    }
}
