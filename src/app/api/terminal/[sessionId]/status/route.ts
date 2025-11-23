// src/app/api/terminal/[sessionId]/status/route.ts
/**
 * Terminal session status endpoint
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/auth';
import { getShellSessionInfo } from '@/lib/ssh';
import { terminalSessions } from '../../sessions/route';

interface RouteParams {
  params: { sessionId: string };
}

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
    console.error('[Terminal] Status error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get status' },
      { status: 500 }
    );
  }
}