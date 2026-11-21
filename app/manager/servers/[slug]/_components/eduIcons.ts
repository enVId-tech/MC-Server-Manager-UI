/** The icons of an Education Edition join code, as emoji. The game uses its own pictures, these are the closest matches */
const ICONS: Record<string, string> = {
    book: '📖', balloon: '🎈', rail: '🛤️', alex: '👩', cookie: '🍪', fish: '🐟', agent: '🤖', cake: '🎂',
    pickaxe: '⛏️', 'water bucket': '🪣', steve: '🧑', apple: '🍎', carrot: '🥕', panda: '🐼', sign: '🪧',
    potion: '🧪', map: '🗺️', llama: '🦙',
};

export function eduIcon(name: string): string {
    return ICONS[name.trim().toLowerCase()] ?? '🟩';
}
