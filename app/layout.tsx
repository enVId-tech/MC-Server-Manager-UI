import type { Metadata } from "next";
import { poppins, pressStart2P } from './fonts';
import "./globals.scss";
import Navbar from "@/app/_components/Navbar/Navbar";
import { NotificationProvider } from "@/lib/contexts/NotificationContext";
import NotificationSystem from "@/app/_components/NotificationSystem/NotificationSystem";
import MinecraftServer from "@/public/minecraft-server.svg"

export const metadata: Metadata = {
    title: "Minecraft Server Automation",
    description: "Create, manage, and deploy Minecraft servers automatically.",
    icons: {
        icon: MinecraftServer.src,
        apple: "/apple-touch-icon.png",
        other: [
            {
                rel: "icon",
                url: MinecraftServer.src,
                sizes: "32x32",
            },
            {
                rel: "icon",
                url: MinecraftServer.src,
                sizes: "16x16",
            },
        ],
    }
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
        <NotificationProvider>
            <Navbar />
            {children}
            <NotificationSystem />
        </NotificationProvider>
        </body>
        </html>
    );
}