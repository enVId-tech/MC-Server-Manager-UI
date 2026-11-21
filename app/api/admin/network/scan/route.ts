import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/dbConnect';
import { requireAdmin } from '@/lib/server/auth';
import Server from '@/lib/objects/Server';
import serverStorage from '@/lib/server/storage';
import { getImportRoots, getParentRoot } from '@/lib/server/importPaths';
import { getUnreachableProxies, inspectFolder, scanForProxies } from '@/lib/server/network/discovery';
import { adoptExistingProxies } from '@/lib/server/network/proxyManagement';
import { getEnvironmentId } from '@/lib/server/network/service';

/**
 * GET  /api/admin/network/scan              looks for proxies everywhere and says what it found and why
 * POST /api/admin/network/scan              adds everything that was found to the dashboard
 * POST /api/admin/network/scan { path }     adds the proxy in this folder (or velocity.toml / config.yml), wherever it is
 */
export async function GET(request: NextRequest) {
    const auth = await requireAdmin(request);
    if (auth.response) return auth.response;
    await dbConnect();

    let environmentId: number | undefined;
    try { environmentId = await getEnvironmentId(); } catch { /* folders are still searched */ }

    const findings = await scanForProxies(environmentId, { force: true });
    const known = new Set((await Server.find({ kind: 'proxy' }, 'proxy.configPath').lean<Array<{ proxy?: { configPath?: string } }>>()).map(record => record.proxy?.configPath));
    const parent = getParentRoot();
    return NextResponse.json({
        success: true,
        searched: ['The storage folder', ...getImportRoots().map(root => root.appPath), ...(parent ? [`${parent.appPath} (the folder above the storage folder)`] : [])],
        containersChecked: environmentId !== undefined,
        unreachable: getUnreachableProxies().filter(item => !findings.some(finding => finding.containerName === item.containerName)),
        findings: findings.map(finding => ({ ...finding, added: known.has(finding.configPath) })),
    });
}

export async function POST(request: NextRequest) {
    const auth = await requireAdmin(request);
    if (auth.response) return auth.response;
    await dbConnect();

    const body = await request.json().catch(() => ({}));
    const extra = [];

    if (typeof body.path === 'string' && body.path.trim()) {
        const given = body.path.trim().replace(/\/+$/, '') || '/';
        const isFile = /\.(toml|yml)$/i.test(given);
        const folder = isFile ? given.slice(0, given.lastIndexOf('/')) || '/' : given;
        let names: string[];
        try {
            names = (await serverStorage.getDirectoryContents(folder)).filter(entry => entry.type === 'file').map(entry => entry.basename);
        } catch {
            return NextResponse.json({ success: false, message: `The folder ${folder} cannot be read by this app. It has to be inside the storage folder or one of the import folders.` }, { status: 400 });
        }
        const finding = await inspectFolder(folder, names);
        if (!finding) return NextResponse.json({ success: false, message: `No Velocity, BungeeCord or Waterfall configuration was found in ${folder}.` }, { status: 404 });
        extra.push({ ...finding, evidence: [...finding.evidence, 'added by hand'] });
    }

    const details = await adoptExistingProxies(auth.user.email, extra);
    return NextResponse.json({ success: true, details });
}
