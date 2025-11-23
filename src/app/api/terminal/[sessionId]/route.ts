// src/app/api/terminal/[sessionId]/route.ts
/**
 * Terminal session route - GET (poll), POST (execute), DELETE (close)
 * ✅ Fixed: Proper route handling for dynamic sessionId
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/auth';
import { executeShellCommand, getShellSessionInfo, closeShellSession } from '@/lib/ssh';
import { terminalSessions } from '../sessions/route';
import type { ApiResponse } from '@/types';

interface RouteParams {
  params: { sessionId: string };
}

/**
 * GET - Poll for terminal output
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
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
      console.log(`[Terminal] GET: Session not found or inactive: ${sessionId}`);
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

    session.lastActivity = new Date();

    return NextResponse.json({
      success: true,
      data: {
        stdout,
        stderr,
        exitCode: 0,
        currentDir: getShellSessionInfo(session.shellSessionId)?.cwd || '/',
        timestamp: new Date().toISOString(),
        hasNewOutput: newOutputs.length > 0
      }
    });

  } catch (error) {
    console.error('[Terminal] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get output' },
      { status: 500 }
    );
  }
}

/**
 * POST - Execute command in session
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
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
      console.log(`[Terminal] POST: Session not found or inactive: ${sessionId}`);
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

    const { command } = await request.json();

    if (!command || !command.trim()) {
      return NextResponse.json({
        success: true,
        data: {
          stdout: '',
          stderr: '',
          exitCode: 0,
          currentDir: getShellSessionInfo(session.shellSessionId)?.cwd || '/',
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
        currentDir: result.cwd || '/',
        timestamp: new Date().toISOString(),
        hasNewOutput: !!result.stdout || !!result.stderr
      }
    });

  } catch (error) {
    console.error('[Terminal] POST error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to execute command' 
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Close session
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
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
      // ✅ Return 200 OK even if session doesn't exist
      console.log(`[Terminal] DELETE: Session already closed or doesn't exist: ${sessionId}`);
      return NextResponse.json({
        success: true,
        data: { message: 'Session closed' }
      });
    }

    if (session.userId !== user.id) {
      return NextResponse.json(
        { success: false, error: 'Access denied' },
        { status: 403 }
      );
    }

    console.log(`[Terminal] DELETE: Closing session: ${sessionId}`);

    // Close SSH shell session
    closeShellSession(session.shellSessionId);

    // Mark session as inactive and remove
    session.isActive = false;
    terminalSessions.delete(sessionId);

    return NextResponse.json({
      success: true,
      data: { message: 'Session closed' }
    });

  } catch (error) {
    console.error('[Terminal] DELETE error:', error);
    // Still return 200 even on error
    return NextResponse.json({
      success: true,
      data: { message: 'Session close attempted' }
    });
  }
}