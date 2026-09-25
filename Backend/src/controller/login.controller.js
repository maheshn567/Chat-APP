import prisma from '../../db/index.js'
import createJWT from '../../utilities/jwtCreate.js';

export default async function login(req, res) {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }

        // Check if the user exists
        const user = await prisma.user.findUnique({
            where: {
                email
            }
        });
        if (!user) {
            return res.status(400).json({ message: "User does not exist" });
        }

        // Verify password
        if (user.password !== password) {
            return res.status(400).json({ message: "Invalid password" });
        }

        // Assign JWT token to cookie for the user
        createJWT({ id: user.id, email: user.email, name: user.username }, res);

        return res.status(200).json({ message: "login successful", result: user });
    } catch (err) {
        console.log(`error at login ${err}`);
        res.status(500).json({ message: "Internal server error", err });
    }
}

export async function logout(req,res){
    res.clearCookie("token");
    return res.status(200).json({ success: true, message: "Logged out successfully" });
}
