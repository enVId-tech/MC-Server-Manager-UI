import type { Metadata } from "next";
import { poppins, pixelifySans, inter, pressStart2P } from './fonts';
import "./globals.scss";

export const metadata: Metadata = {
    title: "Minecraft Server Automation",
    description: "Create, manage, and deploy Minecraft servers automatically.",
};

export default function RootLayout({
                                       children,
                                   }: {
    children: React.ReactNode;
}) {
    // --- FONT COMBINATIONS ---
    // To use a different combination, comment out the active line
    // and uncomment one of the options below.

    // Option 1 (Default): Modern Body, Pixel Heading
    // const fontClasses = `${poppins.variable} ${pixelifySans.variable}`;

    // Option 2: Classic Sans-Serif Body, 8-Bit Heading
    const fontClasses = `${inter.variable} ${poppins.variable}`;

    return (
        <html lang="en">
        <body className={fontClasses}>{children}</body>
        </html>
    );
}