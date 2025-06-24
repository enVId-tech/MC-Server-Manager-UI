import type { Metadata } from "next";
import { poppins, pressStart2P } from './fonts';
import "./globals.scss";
import Navbar from "@/app/_components/Navbar/Navbar";

export const metadata: Metadata = {
    title: "Minecraft Server Automation",
    description: "Create, manage, and deploy Minecraft servers automatically.",
};

export default function RootLayout({
                                       children,
                                   }: {
    children: React.ReactNode;
}) {
    const fontClasses = `${poppins.variable} ${pressStart2P.variable}`;

    return (
        <html lang="en">
        <body className={fontClasses}>
        <Navbar />
        {children}
        </body>
        </html>
    );
}