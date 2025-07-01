import { NextRequest, NextResponse } from 'next/server';
import portainer from '../../../../lib/server/portainer';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { action, stackData, environmentId } = body;

        console.log('Debug API endpoint called with action:', action);

        // Test connection first
        const connectionTest = await portainer.testConnection();
        if (!connectionTest) {
            return NextResponse.json({ 
                success: false, 
                error: 'Failed to connect to Portainer' 
            }, { status: 500 });
        }

        switch (action) {
            case 'test-connection':
                return NextResponse.json({ 
                    success: true, 
                    message: 'Connection successful' 
                });

            case 'list-environments':
                const environments = await portainer.getEnvironments();
                return NextResponse.json({ 
                    success: true, 
                    environments 
                });

            case 'create-stack':
                if (!stackData || !environmentId) {
                    return NextResponse.json({ 
                        success: false, 
                        error: 'stackData and environmentId are required' 
                    }, { status: 400 });
                }

                console.log('Creating stack with data:', JSON.stringify(stackData, null, 2));
                const result = await portainer.createStack(stackData, environmentId);
                return NextResponse.json({ 
                    success: true, 
                    result 
                });

            case 'list-stacks':
                const stacks = await portainer.getStacks();
                return NextResponse.json({ 
                    success: true, 
                    stacks 
                });

            default:
                return NextResponse.json({ 
                    success: false, 
                    error: 'Unknown action' 
                }, { status: 400 });
        }

    } catch (error) {
        console.error('Debug API error:', error);
        return NextResponse.json({ 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error' 
        }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({ 
        message: 'Portainer Debug API',
        actions: [
            'test-connection',
            'list-environments', 
            'create-stack',
            'list-stacks'
        ]
    });
}
