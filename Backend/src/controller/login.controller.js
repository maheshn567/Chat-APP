import prisma from '../../db/index.js'
import bcrypt from 'bcryptjs';
import createJWT from '../../utilities/jwtCreate.js';

const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", 10);

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
            },
            omit: { password: false }
        });
        // Compare against a dummy hash when the user is missing so response time
        // doesn't reveal which emails are registered. Same message for both cases.
        const passwordMatches = await bcrypt.compare(password, user?.password ?? DUMMY_HASH);
        if (!user || !passwordMatches) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        // Assign JWT token to cookie for the user
        createJWT({ id: user.id, email: user.email, name: user.username }, res);

        const { password: _password, ...safeUser } = user;
        return res.status(200).json({ message: "login successful", result: safeUser });
    } catch (err) {
        console.log(`error at login ${err}`);
        res.status(500).json({ message: "Internal server error" });
    }
}

export async function logout(req,res){
    res.clearCookie("token");
    return res.status(200).json({ success: true, message: "Logged out successfully" });
}
