// src/app/api/debug/servers/route.ts
// ⚠️ TEMPORARY DEBUG ENDPOINT - ลบออกหลังเสร็จ

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';

export async function GET(request: NextRequest) {
  try {
    // ตรวจสอบ authorization
    const token = request.headers.get('authorization');
    if (!token || !token.includes('Bearer')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

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
        userId: s.userId
      }))
    });

  } catch (error) {
    console.error('Debug error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}