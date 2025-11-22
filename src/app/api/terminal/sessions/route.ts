// src/app/api/terminal/sessions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/auth';
import { createShellSession, getShellSessionInfo } from '@/lib/ssh';
import { prisma } from '@/lib/database';

// Store active terminal sessions (in production, use Redis)
const terminalSessions = new Map<string, {
  userId: number;
  serverId: number;
  shellSessionId: string;
  isActive: boolean;
  lastActivity: Date;
  outputs: Array<{ type: string; content: string; timestamp: Date }>;
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

    const { serverId } = await request.json();

    // Check server access
    const server = await prisma.server.findUnique({
      where: { id: serverId }
    });

    if (!server || (server.userId !== user.id && user.role !== 'ADMIN')) {
      return NextResponse.json(
        { success: false, error: 'Access denied' },
        { status: 403 }
      );
    }

    // Create shell session
    const sessionId = `${user.id}-${serverId}-${Date.now()}`;
    const shellSessionId = `shell-${sessionId}`;

    const created = await createShellSession(serverId, user.id, shellSessionId);
    
    if (!created) {
      return NextResponse.json(
        { success: false, error: 'Failed to create shell session' },
        { status: 500 }
      );
    }

    const sessionInfo = getShellSessionInfo(shellSessionId);
    const currentDir = sessionInfo?.cwd || '/';

    // Store session
    terminalSessions.set(sessionId, {
      userId: user.id,
      serverId,
      shellSessionId,
      isActive: true,
      lastActivity: new Date(),
      outputs: []
    });

    return NextResponse.json({
      success: true,
      data: {
        sessionId,
        serverId,
        serverName: server.name,
        currentDir,
        isActive: true,
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Create session error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET all sessions for user
export async function GET(request: NextRequest) {
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

    const userSessions = Array.from(terminalSessions.entries())
      .filter(([, session]) => session.userId === user.id)
      .map(([sessionId, session]) => ({
        sessionId,
        serverId: session.serverId,
        isActive: session.isActive,
        lastActivity: session.lastActivity.toISOString(),
        outputCount: session.outputs.length
      }));

    return NextResponse.json({
      success: true,
      data: userSessions
    });

  } catch (error) {
    console.error('Get sessions error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Cleanup sessions globally (call periodically)
export function cleanupTerminalSessions() {
  const now = new Date();
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

  for (const [sessionId, session] of terminalSessions.entries()) {
    if (session.lastActivity < fiveMinutesAgo) {
      session.isActive = false;
      terminalSessions.delete(sessionId);
    }
  }
}

// Export for use in command route
export { terminalSessions };