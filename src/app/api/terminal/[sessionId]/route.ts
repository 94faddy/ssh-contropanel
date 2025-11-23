import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/auth';
import { executeShellCommand } from '@/lib/ssh';
import { terminalSessions } from '../sessions/route';

export async function POST(
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

    if (!session || !session.isActive) {
      return NextResponse.json(
        { success: false, error: 'Session not found or inactive' },
        { status: 404 }
      );
    }

    if (session.userId !== user.id) {
      return NextResponse.json(
        { success: false, error: 'Access denied' },
        { status: 403 }
      );
    }

    const { command } = await request.json();

    if (!command || !command.trim()) {
      return NextResponse.json({
        success: true,
        data: {
          stdout: '',
          stderr: '',
          exitCode: 0,
          currentDir: session.outputs[session.outputs.length - 1]?.content || '/',
          timestamp: new Date().toISOString(),
          hasNewOutput: false
        }
      });
    }

    // Execute command
    const result = await executeShellCommand(session.shellSessionId, command.trim());

    // Store output
    if (result.stdout) {
      session.outputs.push({
        type: 'stdout',
        content: result.stdout,
        timestamp: new Date()
      });
    }
    if (result.stderr) {
      session.outputs.push({
        type: 'stderr',
        content: result.stderr,
        timestamp: new Date()
      });
    }

    session.lastActivity = new Date();

    return NextResponse.json({
      success: true,
      data: {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        currentDir: result.cwd || session.outputs[session.outputs.length - 1]?.content || '/',
        timestamp: new Date().toISOString(),
        hasNewOutput: !!result.stdout || !!result.stderr
      }
    });

  } catch (error) {
    console.error('Execute command error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to execute command' },
      { status: 500 }
    );
  }
}

// GET output (polling)
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

    if (!session || !session.isActive) {
      return NextResponse.json(
        { success: false, error: 'Session not found or inactive' },
        { status: 404 }
      );
    }

    if (session.userId !== user.id) {
      return NextResponse.json(
        { success: false, error: 'Access denied' },
        { status: 403 }
      );
    }

    // Get outputs since last poll
    const since = request.nextUrl.searchParams.get('since');
    const sinceTime = since ? new Date(since) : new Date(Date.now() - 2000);

    const newOutputs = session.outputs.filter(o => o.timestamp > sinceTime);

    const stdout = newOutputs
      .filter(o => o.type === 'stdout')
      .map(o => o.content)
      .join('\n');

    const stderr = newOutputs
      .filter(o => o.type === 'stderr')
      .map(o => o.content)
      .join('\n');

    const sessionInfo = { cwd: '/' };
    const currentDir = sessionInfo?.cwd || '/';

    session.lastActivity = new Date();

    return NextResponse.json({
      success: true,
      data: {
        stdout,
        stderr,
        exitCode: 0,
        currentDir,
        timestamp: new Date().toISOString(),
        hasNewOutput: newOutputs.length > 0
      }
    });

  } catch (error) {
    console.error('Poll output error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to poll output' },
      { status: 500 }
    );
  }
}

// DELETE - Close session
export async function DELETE(
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

    // Close shell session
    // (implementation in ssh.ts)
    session.isActive = false;
    terminalSessions.delete(sessionId);

    return NextResponse.json({
      success: true,
      data: { message: 'Session closed' }
    });

  } catch (error) {
    console.error('Close session error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to close session' },
      { status: 500 }
    );
  }
}