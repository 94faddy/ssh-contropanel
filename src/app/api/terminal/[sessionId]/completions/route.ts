import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/auth';
import { executeShellCommand } from '@/lib/ssh';
import { terminalSessions } from '../../sessions/route';

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

    const { partial, currentDir } = await request.json();

    if (!partial || !currentDir) {
      return NextResponse.json({
        success: true,
        data: { completions: [] }
      });
    }

    // Try command completions first
    const completionCommand = `cd "${currentDir}" && compgen -c "${partial}" 2>/dev/null | head -20`;
    
    try {
      const result = await executeShellCommand(session.shellSessionId, completionCommand);
      
      let completions = result.stdout
        .split('\n')
        .filter(line => line.trim() && line.startsWith(partial))
        .slice(0, 15);

      // If no command completions, try file completions
      if (completions.length === 0) {
        const fileCompletionCommand = `cd "${currentDir}" && compgen -f "${partial}" 2>/dev/null | head -15`;
        const fileResult = await executeShellCommand(session.shellSessionId, fileCompletionCommand);
        
        completions = fileResult.stdout
          .split('\n')
          .filter(line => line.trim() && line.startsWith(partial))
          .slice(0, 15);
      }

      session.lastActivity = new Date();

      return NextResponse.json({
        success: true,
        data: { completions }
      });

    } catch (error) {
      // Fallback to basic file completion
      const basicCommand = `cd "${currentDir}" && ls -1 | grep "^${partial}" 2>/dev/null | head -10`;
      try {
        const basicResult = await executeShellCommand(session.shellSessionId, basicCommand);
        const completions = basicResult.stdout
          .split('\n')
          .filter(line => line.trim())
          .slice(0, 10);

        return NextResponse.json({
          success: true,
          data: { completions }
        });
      } catch {
        return NextResponse.json({
          success: true,
          data: { completions: [] }
        });
      }
    }

  } catch (error) {
    console.error('Tab completion error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get completions' },
      { status: 500 }
    );
  }
}