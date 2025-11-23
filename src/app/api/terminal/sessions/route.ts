// src/app/api/terminal/sessions/route.ts
// ✅ COMPLETE FIX: Prevent ALL duplicate sessions with request deduplication

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

// ✅ Track pending session creation requests to prevent duplicates
const pendingCreations = new Map<string, Promise<any>>();
const creationTimeouts = new Map<string, NodeJS.Timeout>();

// ✅ Helper: Create creation key
function getCreationKey(userId: number, serverId: number): string {
  return `${userId}:${serverId}`;
}

// ✅ Helper: Clean up pending creation after timeout
function scheduleCleanup(creationKey: string) {
  // Clear existing timeout
  const existingTimeout = creationTimeouts.get(creationKey);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  // Set new timeout to clean up after 30 seconds
  const timeout = setTimeout(() => {
    console.log(`[Terminal Sessions] Cleaning up pending creation: ${creationKey}`);
    pendingCreations.delete(creationKey);
    creationTimeouts.delete(creationKey);
  }, 30000);

  creationTimeouts.set(creationKey, timeout);
}

// POST - Create new terminal session
export const POST = withAuth(async (request: NextRequest & { user: User }) => {
  const creationKey = getCreationKey(request.user.id, 0); // Will be updated with serverId
  
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

    const actualCreationKey = getCreationKey(request.user.id, serverId);
    console.log(`[Terminal Sessions] POST request: User ${request.user.id}, Server ${serverId}`);

    // ✅ FIX 1: Check if there's already a pending creation for this user+server
    if (pendingCreations.has(actualCreationKey)) {
      console.log(`[Terminal Sessions] Duplicate request detected - waiting for pending creation...`);
      try {
        const result = await pendingCreations.get(actualCreationKey);
        console.log(`[Terminal Sessions] Returning result from pending creation`);
        return NextResponse.json(result);
      } catch (error) {
        console.error(`[Terminal Sessions] Pending creation failed:`, error);
        pendingCreations.delete(actualCreationKey);
        // Fall through to create new session
      }
    }

    // ✅ FIX 2: Check if active session already exists
    const existingSessionEntry = Array.from(terminalSessions.entries()).find(
      ([_, session]) => 
        session.userId === request.user.id && 
        session.serverId === serverId && 
        session.isActive
    );

    if (existingSessionEntry) {
      const [sessionId, session] = existingSessionEntry;
      console.log(`[Terminal Sessions] Reusing existing session: ${sessionId}`);
      
      const responseData = {
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
      };

      return NextResponse.json(responseData);
    }

    // ✅ FIX 3: Create promise for this creation and store it
    const creationPromise = (async () => {
      try {
        // Check server exists and is accessible
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
          throw new Error(`Server with id ${serverId} not found`);
        }

        // Check access
        if (server.userId !== request.user.id && request.user.role !== 'ADMIN') {
          throw new Error('Access denied to this server');
        }

        // Check credentials
        if (!server.password) {
          throw new Error('Server credentials are incomplete');
        }

        // ✅ Create unique session ID with timestamp to prevent collisions
        const sessionId = `${request.user.id}-${serverId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const shellSessionId = `shell-${sessionId}`;

        console.log(`[Terminal Sessions] Creating new session: ${sessionId}`);

        // Create SSH shell session
        const created = await createShellSession(serverId, request.user.id, shellSessionId);
        
        if (!created) {
          throw new Error('Failed to create SSH connection to server');
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

        console.log(`[Terminal Sessions] Session created successfully: ${sessionId}`);

        const responseData = {
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
        };

        return responseData;

      } catch (error) {
        console.error('[Terminal Sessions] Creation error:', error);
        const errorMsg = error instanceof Error ? error.message : 'Failed to create session';
        
        return {
          success: false,
          error: errorMsg
        };
      }
    })();

    // ✅ Store pending creation
    pendingCreations.set(actualCreationKey, creationPromise);
    scheduleCleanup(actualCreationKey);

    try {
      const result = await creationPromise;
      return NextResponse.json(result);
    } finally {
      // ✅ Clean up after completion
      pendingCreations.delete(actualCreationKey);
      const timeout = creationTimeouts.get(actualCreationKey);
      if (timeout) {
        clearTimeout(timeout);
        creationTimeouts.delete(actualCreationKey);
      }
    }

  } catch (error) {
    console.error('[Terminal Sessions] POST error:', error);
    
    // Clean up pending creation on error
    pendingCreations.delete(creationKey);
    const timeout = creationTimeouts.get(creationKey);
    if (timeout) {
      clearTimeout(timeout);
      creationTimeouts.delete(creationKey);
    }

    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      },
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

    console.log(`[Terminal Sessions] GET: Found ${userSessions.length} active sessions for user ${request.user.id}`);

    return NextResponse.json({
      success: true,
      data: userSessions
    });

  } catch (error) {
    console.error('[Terminal Sessions] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
});

export { terminalSessions };