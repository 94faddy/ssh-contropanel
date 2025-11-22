// src/app/api/terminal/[sessionId]/status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/auth';
import { getShellSessionInfo } from '@/lib/ssh';
import { terminalSessions } from '../../sessions/route';

export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'No token provided' },
        { status: 401 }
      );
    }

    const user = await getUserFromToken(token);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Invalid token' },
        { status: 401 }
      );
    }

    const sessionId = params.sessionId;
    const session = terminalSessions.get(sessionId);

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    if (session.userId !== user.id) {
      return NextResponse.json(
        { success: false, error: 'Access denied' },
        { status: 403 }
      );
    }

    const sessionInfo = getShellSessionInfo(session.shellSessionId);

    return NextResponse.json({
      success: true,
      data: {
        sessionId,
        isActive: session.isActive,
        currentDir: sessionInfo?.cwd || '/',
        isExecuting: false,
        lastPollTime: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Get status error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get status' },
      { status: 500 }
    );
  }
}

// ============================================================================

// src/app/api/scripts/execute/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken, canAccessServer } from '@/lib/auth';
import { executeCommand } from '@/lib/ssh';
import { prisma } from '@/lib/database';

const scriptExecutions = new Map<string, {
  userId: number;
  serverIds: number[];
  status: 'running' | 'completed' | 'failed';
  startTime: Date;
  results: Map<number, { stdout: string; stderr: string; exitCode: number }>;
}>();

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'No token provided' },
        { status: 401 }
      );
    }

    const user = await getUserFromToken(token);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Invalid token' },
        { status: 401 }
      );
    }

    const { scriptName, command, serverIds } = await request.json();

    if (!scriptName || !command || !serverIds || serverIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate server access
    const servers = await prisma.server.findMany({
      where: {
        id: { in: serverIds },
        ...(user.role !== 'ADMIN' ? { userId: user.id } : {})
      }
    });

    if (servers.length !== serverIds.length) {
      return NextResponse.json(
        { success: false, error: 'Access denied to some servers' },
        { status: 403 }
      );
    }

    const executionId = `exec-${user.id}-${Date.now()}`;

    // Store execution
    scriptExecutions.set(executionId, {
      userId: user.id,
      serverIds,
      status: 'running',
      startTime: new Date(),
      results: new Map()
    });

    // Create script logs
    const scriptLogs = await Promise.all(
      servers.map(server =>
        prisma.scriptLog.create({
          data: {
            scriptName,
            command,
            status: 'RUNNING',
            userId: user.id,
            serverId: server.id,
            startTime: new Date()
          }
        })
      )
    );

    // Execute script on all servers asynchronously
    (async () => {
      const execution = scriptExecutions.get(executionId)!;

      for (let i = 0; i < servers.length; i++) {
        const server = servers[i];
        try {
          const result = await executeCommand(server.id, user.id, command, {
            timeout: 300000
          });

          execution.results.set(server.id, {
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.code || 0
          });

          // Update script log
          await prisma.scriptLog.update({
            where: { id: scriptLogs[i].id },
            data: {
              status: result.code === 0 ? 'SUCCESS' : 'FAILED',
              output: result.stdout,
              error: result.stderr,
              endTime: new Date(),
              duration: Math.floor(
                (Date.now() - scriptLogs[i].startTime.getTime()) / 1000
              )
            }
          });

        } catch (error) {
          execution.results.set(server.id, {
            stdout: '',
            stderr: error instanceof Error ? error.message : 'Unknown error',
            exitCode: 1
          });

          await prisma.scriptLog.update({
            where: { id: scriptLogs[i].id },
            data: {
              status: 'FAILED',
              error: error instanceof Error ? error.message : 'Unknown error',
              endTime: new Date(),
              duration: Math.floor(
                (Date.now() - scriptLogs[i].startTime.getTime()) / 1000
              )
            }
          });
        }
      }

      execution.status = 'completed';
    })();

    return NextResponse.json({
      success: true,
      data: { executionId }
    });

  } catch (error) {
    console.error('Execute script error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to execute script' },
      { status: 500 }
    );
  }
}

// ============================================================================

// src/app/api/scripts/execution/[executionId]/route.ts
export async function GET(
  request: NextRequest,
  { params }: { params: { executionId: string } }
) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'No token provided' },
        { status: 401 }
      );
    }

    const user = await getUserFromToken(token);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Invalid token' },
        { status: 401 }
      );
    }

    const execution = scriptExecutions.get(params.executionId);

    if (!execution) {
      return NextResponse.json(
        { success: false, error: 'Execution not found' },
        { status: 404 }
      );
    }

    if (execution.userId !== user.id) {
      return NextResponse.json(
        { success: false, error: 'Access denied' },
        { status: 403 }
      );
    }

    const results = Array.from(execution.results.entries()).map(([serverId, result]) => ({
      serverId,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode
    }));

    return NextResponse.json({
      success: true,
      data: {
        executionId: params.executionId,
        status: execution.status,
        startTime: execution.startTime.toISOString(),
        results,
        totalServers: execution.serverIds.length,
        completedServers: execution.results.size
      }
    });

  } catch (error) {
    console.error('Get execution status error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get execution status' },
      { status: 500 }
    );
  }
}

export { scriptExecutions };