import 'dotenv/config';
import httpServer from "./app.js";
import getJwtSecret from "./utilities/jwtSecret.js";

getJwtSecret(); // fail fast at startup if the secret is missing

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
// Trigger nodemon reload for new Prisma client schema

