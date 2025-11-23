// src/app/api/terminal/sessions/route.ts
// ✅ WORKING FIX: Prevent ALL duplicate sessions

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { createShellSession, getShellSessionInfo, closeShellSession } from '@/lib/ssh';
import { prisma } from '@/lib/database';
import type { User, ApiResponse } from '@/types';

// ✅ Simple, clean session storage
const terminalSessions = new Map<string, {
  userId: number;
  serverId: number;
  shellSessionId: string;
  isActive: boolean;
  lastActivity: Date;
  outputs: Array<{ type: string; content: string; timestamp: Date }>;
}>();

// POST - Create new terminal session
export const POST = withAuth(async (request: NextRequest & { user: User }) => {
  try {
    const body = await request.json();
    const { serverId } = body;

    // Validate input
    if (!serverId || typeof serverId !== 'number') {
      return NextResponse.json(
        { success: false, error: 'Invalid serverId provided' },
        { status: 400 }
      );
    }

    console.log(`[Terminal Sessions] POST: User ${request.user.id}, Server ${serverId}`);

    // ✅ FIX: Check if active session already exists
    const existingSession = Array.from(terminalSessions.entries()).find(
      ([_, session]) => 
        session.userId === request.user.id && 
        session.serverId === serverId && 
        session.isActive
    );

    if (existingSession) {
      const [sessionId, session] = existingSession;
      console.log(`[Terminal Sessions] Reusing existing session: ${sessionId}`);
      
      return NextResponse.json({
        success: true,
        data: {
          sessionId,
          serverId,
          serverName: 'dedicated',
          currentDir: getShellSessionInfo(session.shellSessionId)?.cwd || '/',
          isActive: true,
          createdAt: new Date().toISOString(),
          lastActivity: session.lastActivity.toISOString()
        }
      });
    }

    // Check server exists
    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: {
        id: true,
        name: true,
        host: true,
        port: true,
        username: true,
        password: true,
        userId: true,
        status: true
      }
    });

    if (!server) {
      return NextResponse.json(
        { success: false, error: `Server with id ${serverId} not found` },
        { status: 404 }
      );
    }

    // Check access
    if (server.userId !== request.user.id && request.user.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Access denied to this server' },
        { status: 403 }
      );
    }

    // Check credentials
    if (!server.password) {
      return NextResponse.json(
        { success: false, error: 'Server credentials are incomplete' },
        { status: 400 }
      );
    }

    // ✅ Create unique session ID
    const sessionId = `${request.user.id}-${serverId}-${Date.now()}`;
    const shellSessionId = `shell-${sessionId}`;

    console.log(`[Terminal Sessions] Creating new session: ${sessionId}`);

    // Create SSH shell session
    const created = await createShellSession(serverId, request.user.id, shellSessionId);
    
    if (!created) {
      return NextResponse.json(
        { success: false, error: 'Failed to create SSH connection to server' },
        { status: 500 }
      );
    }

    const sessionInfo = getShellSessionInfo(shellSessionId);
    const currentDir = sessionInfo?.cwd || '/';

    // ✅ Store session
    terminalSessions.set(sessionId, {
      userId: request.user.id,
      serverId,
      shellSessionId,
      isActive: true,
      lastActivity: new Date(),
      outputs: []
    });

    console.log(`[Terminal Sessions] Session registered: ${sessionId}`);

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
});

// GET - Get all sessions for user
export const GET = withAuth(async (request: NextRequest & { user: User }) => {
  try {
    const userSessions = Array.from(terminalSessions.entries())
      .filter(([, session]) => session.userId === request.user.id && session.isActive)
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
});

export { terminalSessions };