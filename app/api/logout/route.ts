import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
    // Clear the session cookie by setting it to an empty value and past date
    const response = new Response(null, {
        status: 200,
        headers: {
            "Set-Cookie": "session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Strict",
        },
    });

    // Redirect to the home page after logout
    response.headers.set("Location", "/");

    return response;
}