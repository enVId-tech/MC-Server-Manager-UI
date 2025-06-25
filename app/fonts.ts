import { Inter, Press_Start_2P, Pixelify_Sans, Poppins } from 'next/font/google';

// --- NON-BLOCKY FONT OPTIONS ---
export const inter = Inter({
    subsets: ['latin'],
    variable: '--font-inter',
});

export const poppins = Poppins({
    weight: ['400', '600', '700'],
    subsets: ['latin'],
    variable: '--font-poppins',
});

// --- BLOCKY / THEMATIC FONT OPTIONS ---
export const pressStart2P = Press_Start_2P({
    weight: '400',
    subsets: ['latin'],
    variable: '--font-press-start',
});

export const pixelifySans = Pixelify_Sans({
    subsets: ['latin'],
    variable: '--font-pixelify',
});