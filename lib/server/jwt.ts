/**
 * Returns the secret used to sign and verify session tokens.
 * Throws instead of falling back to a well-known default, so a missing JWT_SECRET can never
 * result in tokens that anyone could forge.
 */
export function getJwtSecret(): string {
    const secret = process.env.JWT_SECRET;

    if (!secret || secret.trim() === '') {
        throw new Error('JWT_SECRET is not defined in the environment variables.');
    }

    return secret;
}
