// src/app/api/debug/servers/route.ts
// ✅ FIXED: Allow debug endpoint in development mode

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';

export async function GET(request: NextRequest) {
  try {
    // ✅ FIX: Allow in development mode without token
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const token = request.headers.get('authorization');
    
    if (!isDevelopment && (!token || !token.includes('Bearer'))) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log(`[DEBUG] Fetching all servers (${isDevelopment ? 'development mode' : 'production mode'})`);

    // ดึงทุก servers
    const servers = await prisma.server.findMany({
      select: {
        id: true,
        name: true,
        host: true,
        port: true,
        username: true,
        password: true,
        isActive: true,
        status: true,
        userId: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { id: 'asc' }
    });

    console.log('=== All Servers ===');
    servers.forEach(server => {
      console.log({
        id: server.id,
        name: server.name,
        host: server.host,
        port: server.port,
        username: server.username,
        hasPassword: !!server.password,
        isActive: server.isActive,
        status: server.status,
        userId: server.userId
      });
    });

    return NextResponse.json({
      success: true,
      mode: isDevelopment ? 'development' : 'production',
      total: servers.length,
      servers: servers.map(s => ({
        id: s.id,
        name: s.name,
        host: s.host,
        port: s.port,
        username: s.username,
        hasPassword: !!s.password,
        isActive: s.isActive,
        status: s.status,
        userId: s.userId,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt
      }))
    });

  } catch (error) {
    console.error('Debug error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}