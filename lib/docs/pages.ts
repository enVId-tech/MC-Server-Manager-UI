/** The wiki: sections and pages in reading order. Every page is a markdown file in /docs named after its slug. */
export interface DocPage {
    slug: string;
    title: string;
    summary: string;
}

export interface DocSection {
    title: string;
    pages: DocPage[];
}

export const DOC_SECTIONS: DocSection[] = [
    {
        title: 'Getting started',
        pages: [
            { slug: 'introduction', title: 'Introduction', summary: 'What the manager does, how it fits together and who can do what.' },
            { slug: 'quick-start', title: 'Quick start', summary: 'Create an account, make a server and join it in a few minutes.' },
            { slug: 'installation', title: 'Installation', summary: 'Run the manager yourself with Docker Compose or from source.' },
        ],
    },
    {
        title: 'Using the manager',
        pages: [
            { slug: 'dashboard', title: 'The dashboard', summary: 'Your servers, their status and the power buttons.' },
            { slug: 'creating-servers', title: 'Creating a server', summary: 'Server types, versions, memory and folder names.' },
            { slug: 'joining', title: 'Joining a server', summary: 'Java, Bedrock and Education Edition addresses.' },
            { slug: 'console', title: 'Console and commands', summary: 'Live output, sending commands, auto refresh and RCON.' },
            { slug: 'files-and-backups', title: 'Files and backups', summary: 'Browse, edit, upload and download server files.' },
            { slug: 'backups', title: 'Automatic backups', summary: 'Scheduled backups, rules per server and downloads, without proxy secrets.' },
            { slug: 'plugins-and-mods', title: 'Plugins and mods', summary: 'Install from links, upload jars and keep them updated.' },
            { slug: 'worlds', title: 'Worlds', summary: 'Upload a world and what version changes are safe.' },
            { slug: 'server-settings', title: 'Server settings', summary: 'server.properties and container options, and what is locked.' },
        ],
    },
    {
        title: 'Administration',
        pages: [
            { slug: 'admin-panel', title: 'The admin panel', summary: 'A tour of every admin section.' },
            { slug: 'users', title: 'Users and impersonation', summary: 'Roles, quotas, deactivating accounts and previewing as a user.' },
            { slug: 'proxies', title: 'Proxies and the network', summary: 'Velocity, BungeeCord and Waterfall, forwarding and load balancing.' },
            { slug: 'existing-servers', title: 'Existing servers', summary: 'Import servers and proxies that already run on the host.' },
            { slug: 'platform-settings', title: 'Platform settings', summary: 'Memory rules, folder names, command limits and background jobs.' },
            { slug: 'docker-and-updates', title: 'Docker, Portainer and updates', summary: 'The Docker-first model and automatic image updates.' },
        ],
    },
    {
        title: 'Reference',
        pages: [
            { slug: 'configuration', title: 'Configuration reference', summary: 'Every environment variable.' },
            { slug: 'storage-and-permissions', title: 'Storage and permissions', summary: 'Local and WebDAV storage, user ids and TrueNAS.' },
            { slug: 'security', title: 'Security model', summary: 'What users can and cannot see or change.' },
            { slug: 'troubleshooting', title: 'Troubleshooting', summary: 'Errors you may meet and how to fix them.' },
            { slug: 'faq', title: 'FAQ', summary: 'Short answers to common questions.' },
        ],
    },
];

export const ALL_DOC_PAGES: DocPage[] = DOC_SECTIONS.flatMap(section => section.pages);

export function findDocPage(slug: string): { page: DocPage; section: DocSection; previous?: DocPage; next?: DocPage } | null {
    const index = ALL_DOC_PAGES.findIndex(page => page.slug === slug);
    if (index === -1) return null;
    const page = ALL_DOC_PAGES[index];
    const section = DOC_SECTIONS.find(candidate => candidate.pages.includes(page))!;
    return { page, section, previous: ALL_DOC_PAGES[index - 1], next: ALL_DOC_PAGES[index + 1] };
}
