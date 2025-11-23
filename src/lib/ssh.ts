import { NodeSSH, SSHExecCommandResponse } from 'node-ssh';
import { prisma } from './database';
import type { Server, SystemInfo, DiskUsage } from '@/types';
import bcrypt from 'bcryptjs';
import { postprocessOutput } from './command-middleware';

// SSH connection pool
const sshConnections = new Map<string, NodeSSH>();

// Active shell sessions - ไม่ใช้ interactive shell
const shellSessions = new Map<string, {
  ssh: NodeSSH;
  cwd: string;
  env: Record<string, string>;
  userId: number;
  serverId: number;
}>();

// Create SSH connection key
function getConnectionKey(serverId: number, userId: number): string {
  return `${serverId}-${userId}`;
}

// Test SSH connection
export async function testSSHConnection(
  host: string,
  port: number,
  username: string,
  password: string
): Promise<{ success: boolean; error?: string; systemInfo?: SystemInfo }> {
  const ssh = new NodeSSH();
  
  try {
    await ssh.connect({
      host,
      port,
      username,
      password,
      readyTimeout: 15000,
      algorithms: {
        kex: ['diffie-hellman-group14-sha256', 'diffie-hellman-group14-sha1'],
        cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr'],
        hmac: ['hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha1'],
        serverHostKey: ['ssh-rsa', 'ssh-ed25519']
      }
    });

    // Get system information
    const systemInfo = await getSystemInfo(ssh);
    
    await ssh.dispose();
    
    return { success: true, systemInfo };
  } catch (error) {
    await ssh.dispose();
    console.error('SSH connection test failed:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Connection failed' 
    };
  }
}

// Get or create SSH connection
export async function getSSHConnection(
  serverId: number,
  userId: number,
  forceNew: boolean = false
): Promise<NodeSSH | null> {
  const connectionKey = getConnectionKey(serverId, userId);
  
  // Return existing connection if available and not forcing new
  if (!forceNew && sshConnections.has(connectionKey)) {
    const existingConnection = sshConnections.get(connectionKey)!;
    try {
      // Test if connection is still alive
      await existingConnection.execCommand('echo "test"', [], { execOptions: { timeout: 5000 } });
      return existingConnection;
    } catch {
      // Connection is dead, remove it
      sshConnections.delete(connectionKey);
      try {
        await existingConnection.dispose();
      } catch { /* ignore */ }
    }
  }

  try {
    // Get server details
    const server = await prisma.server.findUnique({
      where: { id: serverId },
    });

    if (!server || server.userId !== userId) {
      throw new Error('Server not found or access denied');
    }

    const ssh = new NodeSSH();
    
    console.log(`[SSH] Connecting to ${server.host}:${server.port} as ${server.username}...`);

    await ssh.connect({
      host: server.host,
      port: server.port,
      username: server.username,
      password: server.password,
      readyTimeout: 15000,
      algorithms: {
        kex: ['diffie-hellman-group14-sha256', 'diffie-hellman-group14-sha1'],
        cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr'],
        hmac: ['hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha1'],
        serverHostKey: ['ssh-rsa', 'ssh-ed25519']
      }
    });

    console.log(`[SSH] Connected to server ${serverId}`);

    // Store connection
    sshConnections.set(connectionKey, ssh);

    // Update server status
    await prisma.server.update({
      where: { id: serverId },
      data: {
        status: 'CONNECTED',
        lastChecked: new Date(),
      },
    });

    return ssh;
  } catch (error) {
    console.error('SSH connection failed:', error);
    
    // Update server status to error
    await prisma.server.update({
      where: { id: serverId },
      data: {
        status: 'ERROR',
        lastChecked: new Date(),
      },
    }).catch(err => console.error('Failed to update server status:', err));

    return null;
  }
}

// ✅ FIXED: Create shell session WITHOUT allocating interactive PTY
export async function createShellSession(
  serverId: number,
  userId: number,
  sessionId: string
): Promise<boolean> {
  try {
    const ssh = await getSSHConnection(serverId, userId);
    if (!ssh) {
      console.error(`[SSH] Failed to get SSH connection for server ${serverId}`);
      return false;
    }

    console.log(`[SSH] Got SSH connection for server ${serverId}`);

    // ✅ STEP 1: Test SSH connection capability first
    try {
      const testResult = await ssh.execCommand('echo "SSH_OK"', [], {
        execOptions: { timeout: 5000 }
      });
      
      if (testResult.code !== 0) {
        console.error('[SSH] SSH test command failed:', testResult.stderr);
        return false;
      }
      console.log('[SSH] ✓ SSH connection test passed');
    } catch (testError) {
      console.error('[SSH] SSH test error:', testError);
      return false;
    }

    // ✅ STEP 2: Get initial working directory
    let cwd = '/';
    try {
      const pwdResult = await ssh.execCommand('pwd', [], {
        execOptions: { timeout: 5000 }
      });
      
      if (pwdResult.code === 0) {
        const trimmedCwd = pwdResult.stdout.trim();
        cwd = trimmedCwd || '/';
        console.log(`[SSH] ✓ Current directory: ${cwd}`);
      } else {
        console.warn(`[SSH] pwd command failed with code ${pwdResult.code}`);
      }
    } catch (pwdError) {
      console.warn(`[SSH] Failed to get pwd:`, pwdError);
      cwd = '/';
    }

    // ✅ STEP 3: Setup environment
    const env: Record<string, string> = {
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      LANG: 'en_US.UTF-8',
      LC_ALL: 'en_US.UTF-8',
      DEBIAN_FRONTEND: 'noninteractive'
    };

    console.log(`[SSH] ✓ Environment variables configured`);

    // ✅ STEP 4: Store shell session (WITHOUT PTY allocation)
    shellSessions.set(sessionId, {
      ssh,
      cwd,
      env,
      userId,
      serverId
    });

    console.log(`[SSH] ✓ Shell session created successfully: ${sessionId}`);
    return true;
  } catch (error) {
    console.error('[SSH] Failed to create shell session:', error);
    return false;
  }
}

// ✅ FIXED: Execute command WITHOUT PTY allocation
export async function executeShellCommand(
  sessionId: string,
  command: string,
  options: { timeout?: number } = {}
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
  cwd?: string;
}> {
  const session = shellSessions.get(sessionId);
  if (!session) {
    throw new Error('Shell session not found');
  }

  try {
    // Handle built-in commands
    if (command.trim().startsWith('cd ')) {
      return await handleCdCommand(sessionId, command);
    }

    // Handle clear command specially
    if (command.trim() === 'clear') {
      return {
        stdout: '\x1b[2J\x1b[H', // ANSI clear screen sequence
        stderr: '',
        exitCode: 0,
        cwd: session.cwd
      };
    }

    // ✅ Setup environment variables
    const envVars = {
      ...session.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      LANG: 'en_US.UTF-8',
      LC_ALL: 'en_US.UTF-8',
      DEBIAN_FRONTEND: 'noninteractive',
      COLUMNS: '120',
      LINES: '30'
    };

    // ✅ Build export environment commands
    const envString = Object.entries(envVars)
      .map(([key, value]) => `${key}="${value}"`)
      .join(' ');

    // ✅ Prepare command: cd to directory + set environment + run command
    // NOT using PTY allocation (reason: channel open failure)
    const fullCommand = `cd "${session.cwd}" && export ${envString} && ${command}`;
    
    console.log(`[SSH] Executing: ${fullCommand.substring(0, 100)}...`);

    // ✅ Use execCommand instead of requestShell (NO PTY!)
    const result = await session.ssh.execCommand(fullCommand, [], {
      execOptions: {
        timeout: options.timeout || 30000
        // NO pty option - this was causing "Channel open failure"
      }
    });

    console.log(`[SSH] Command exited with code: ${result.code}`);

    // ✅ Try to update current working directory if command changed it
    if (command.includes('cd ') || command.includes('pushd ') || command.includes('popd ')) {
      try {
        const pwdResult = await session.ssh.execCommand(
          `cd "${session.cwd}" && pwd`,
          [],
          { execOptions: { timeout: 5000 } }
        );
        
        if (pwdResult.code === 0) {
          const newCwd = pwdResult.stdout.trim();
          if (newCwd) {
            session.cwd = newCwd;
            console.log(`[SSH] Updated cwd to: ${newCwd}`);
          }
        }
      } catch (pwdError) {
        console.warn('[SSH] Failed to update pwd:', pwdError);
      }
    }

    // ✅ Post-process output
    const processedStdout = postprocessOutput(result.stdout, command);
    const processedStderr = postprocessOutput(result.stderr, command);

    return {
      stdout: processedStdout,
      stderr: processedStderr,
      exitCode: result.code || 0,
      cwd: session.cwd
    };
  } catch (error) {
    console.error('[SSH] Command execution error:', error);
    throw error;
  }
}

// Handle cd command
async function handleCdCommand(sessionId: string, command: string): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
  cwd?: string;
}> {
  const session = shellSessions.get(sessionId);
  if (!session) {
    throw new Error('Shell session not found');
  }

  const args = command.trim().split(/\s+/);
  let targetDir = args[1] || session.env.HOME || '/';

  // Handle special cases
  if (targetDir === '~') {
    targetDir = session.env.HOME || '/';
  } else if (targetDir.startsWith('~/')) {
    targetDir = (session.env.HOME || '/') + targetDir.substring(1);
  } else if (!targetDir.startsWith('/')) {
    // Relative path
    targetDir = `${session.cwd}/${targetDir}`;
  }

  try {
    // Test if directory exists and is accessible
    const result = await session.ssh.execCommand(`cd "${targetDir}" && pwd`);
    
    if (result.code === 0) {
      session.cwd = result.stdout.trim();
      return {
        stdout: '',
        stderr: '',
        exitCode: 0,
        cwd: session.cwd
      };
    } else {
      return {
        stdout: '',
        stderr: result.stderr || `cd: ${targetDir}: No such file or directory`,
        exitCode: 1,
        cwd: session.cwd
      };
    }
  } catch (error) {
    return {
      stdout: '',
      stderr: `cd: ${targetDir}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      exitCode: 1,
      cwd: session.cwd
    };
  }
}

// Close shell session
export function closeShellSession(sessionId: string): void {
  shellSessions.delete(sessionId);
}

// Get shell session info
export function getShellSessionInfo(sessionId: string): { cwd: string; env: Record<string, string> } | null {
  const session = shellSessions.get(sessionId);
  if (!session) return null;
  
  return {
    cwd: session.cwd,
    env: session.env
  };
}

// Close SSH connection
export async function closeSSHConnection(serverId: number, userId: number): Promise<void> {
  const connectionKey = getConnectionKey(serverId, userId);
  const connection = sshConnections.get(connectionKey);
  
  if (connection) {
    try {
      await connection.dispose();
    } catch (error) {
      console.error('Error disposing SSH connection:', error);
    }
    sshConnections.delete(connectionKey);
  }

  // Close all shell sessions for this connection
  for (const [sessionId, session] of shellSessions.entries()) {
    if (session.serverId === serverId && session.userId === userId) {
      shellSessions.delete(sessionId);
    }
  }

  // Update server status
  await prisma.server.update({
    where: { id: serverId },
    data: {
      status: 'DISCONNECTED',
      lastChecked: new Date(),
    },
  }).catch(err => console.error('Failed to update server status:', err));
}

// Execute command on server (legacy function for backward compatibility)
export async function executeCommand(
  serverId: number,
  userId: number,
  command: string,
  options: { timeout?: number; cwd?: string } = {}
): Promise<SSHExecCommandResponse> {
  const ssh = await getSSHConnection(serverId, userId);
  
  if (!ssh) {
    throw new Error('Failed to establish SSH connection');
  }

  try {
    // Set environment variables to avoid interactive prompts
    const envVars = {
      DEBIAN_FRONTEND: 'noninteractive',
      TERM: 'xterm-256color',
      LANG: 'en_US.UTF-8',
      LC_ALL: 'en_US.UTF-8'
    };

    const result = await ssh.execCommand(command, [], {
      execOptions: {
        timeout: options.timeout || 30000,
        env: envVars
      },
      cwd: options.cwd,
    });

    // Post-process output to remove warnings
    const processedStdout = postprocessOutput(result.stdout, command);
    const processedStderr = postprocessOutput(result.stderr, command);

    return {
      ...result,
      stdout: processedStdout,
      stderr: processedStderr
    };
  } catch (error) {
    throw error;
  }
}

// Get system information
export async function getSystemInfo(ssh: NodeSSH): Promise<SystemInfo> {
  try {
    const [
      osInfo,
      uptime,
      loadAvg,
      memoryInfo,
      cpuInfo,
      diskInfo
    ] = await Promise.all([
      ssh.execCommand('uname -s -r -m'),
      ssh.execCommand('uptime -s && uptime'),
      ssh.execCommand('cat /proc/loadavg'),
      ssh.execCommand('free | awk \'/Mem:/ {print $2, $7}\''),
      ssh.execCommand('nproc'),
      ssh.execCommand('df -h --type=ext4 --type=ext3 --type=ext2 --type=xfs')
    ]);

    // Parse OS info
    const osData = osInfo.stdout.split(' ');
    const os = osData[0] || 'Unknown';
    const arch = osData[2] || 'Unknown';
    
    // Parse uptime
    const uptimeLines = uptime.stdout.split('\n');
    const uptimeSeconds = uptimeLines.length > 1 ? 
      parseUptimeFromString(uptimeLines[1]) : 0;

    // Parse load average
    const loadData = loadAvg.stdout.split(' ');
    const loadAverage = [
      parseFloat(loadData[0]) || 0,
      parseFloat(loadData[1]) || 0,
      parseFloat(loadData[2]) || 0
    ];

    // Parse memory info
    let totalMemory = 0;
    let availableMemory = 0;
    
    if (memoryInfo.stdout) {
      const memData = memoryInfo.stdout.trim().split(' ');
      if (memData.length >= 2) {
        totalMemory = parseInt(memData[0]) * 1024;
        availableMemory = parseInt(memData[1]) * 1024;
      }
    }

    // Parse CPU count
    const cpuCount = parseInt(cpuInfo.stdout.trim()) || 1;

    // Parse disk usage
    const diskUsage = parseDiskUsage(diskInfo.stdout);

    return {
      os,
      arch,
      platform: 'linux',
      uptime: uptimeSeconds,
      loadAverage,
      totalMemory,
      freeMemory: availableMemory,
      cpuCount,
      diskUsage
    };
  } catch (error) {
    console.error('Failed to get system info:', error);
    throw error;
  }
}

// Helper function to parse uptime string
function parseUptimeFromString(uptimeStr: string): number {
  const match = uptimeStr.match(/up\s+(.+?),\s+\d+\s+user/);
  if (!match) return 0;

  const uptimeText = match[1];
  let seconds = 0;

  // Parse days
  const dayMatch = uptimeText.match(/(\d+)\s+day/);
  if (dayMatch) seconds += parseInt(dayMatch[1]) * 86400;

  // Parse hours and minutes
  const timeMatch = uptimeText.match(/(\d+):(\d+)/);
  if (timeMatch) {
    seconds += parseInt(timeMatch[1]) * 3600;
    seconds += parseInt(timeMatch[2]) * 60;
  }

  return seconds;
}

// Helper function to parse disk usage
function parseDiskUsage(diskOutput: string): DiskUsage[] {
  const lines = diskOutput.trim().split('\n');
  const diskUsage: DiskUsage[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].trim().split(/\s+/);
    if (parts.length >= 6) {
      diskUsage.push({
        filesystem: parts[0],
        size: parts[1],
        used: parts[2],
        available: parts[3],
        usePercent: parts[4],
        mountPoint: parts[5]
      });
    }
  }

  return diskUsage;
}

// Update server system info
export async function updateServerSystemInfo(serverId: number, userId: number): Promise<SystemInfo | null> {
  try {
    const ssh = await getSSHConnection(serverId, userId);
    if (!ssh) return null;

    const systemInfo = await getSystemInfo(ssh);

    await prisma.server.update({
      where: { id: serverId },
      data: {
        systemInfo: systemInfo as any,
        lastChecked: new Date(),
      },
    });

    return systemInfo;
  } catch (error) {
    console.error('Failed to update system info:', error);
    return null;
  }
}

// Cleanup inactive connections
export function cleanupSSHConnections(): void {
  console.log(`Cleaning up SSH connections. Active: ${sshConnections.size}`);
  console.log(`Active shell sessions: ${shellSessions.size}`);
}

// Cleanup all connections on shutdown
export async function disposeAllSSHConnections(): Promise<void> {
  const promises = Array.from(sshConnections.values()).map(ssh => {
    return ssh.dispose().catch(err => {
      console.error('Error disposing SSH connection:', err);
    });
  });

  await Promise.all(promises);
  sshConnections.clear();
  shellSessions.clear();
}

// Auto cleanup every 10 minutes
setInterval(cleanupSSHConnections, 600000);