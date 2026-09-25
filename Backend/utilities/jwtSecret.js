// Single source for the JWT signing secret. Fails loudly instead of
// falling back to a guessable default that would let anyone forge tokens.
export default function getJwtSecret() {
    // jwt_screct_key is the legacy (misspelled) name some local .env files use
    const secret = process.env.JWT_SECRET || process.env.jwt_screct_key;
    if (!secret) {
        throw new Error("JWT_SECRET is not set. Add it to Backend/.env");
    }
    return secret;
}
