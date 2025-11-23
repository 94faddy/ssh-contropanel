// src/lib/terminal-api.ts
/**
 * Terminal REST API wrapper - FIXED version
 * ✅ Fixed: Polling URL construction
 * ✅ Fixed: Session ID handling
 */

import { ApiResponse } from '@/types';

export interface TerminalSession {
  sessionId: string;
  serverId: number;
  serverName: string;
  currentDir: string;
  isActive: boolean;
  createdAt: string;
  lastActivity: string;
}

export interface TerminalOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
  currentDir: string;
  timestamp: string;
  hasNewOutput: boolean;
}

export interface SessionStatus {
  sessionId: string;
  isActive: boolean;
  currentDir: string;
  isExecuting: boolean;
  lastPollTime: string;
}

class TerminalAPI {
  private baseUrl: string = '/api/terminal';
  private token: string = '';

  constructor() {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      this.token = localStorage.getItem('auth_token') || '';
    }
  }

  private getHeaders(): HeadersInit {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.token}`
    };
  }

  /**
   * Create a new terminal session
   */
  async createSession(serverId: number): Promise<ApiResponse<TerminalSession>> {
    try {
      console.log(`[terminalAPI] Creating session for server ${serverId}`);
      
      const response = await fetch(`${this.baseUrl}/sessions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ serverId })
      });

      const data = await response.json();
      
      if (data.success) {
        console.log(`[terminalAPI] Session created: ${data.data.sessionId}`);
      } else {
        console.error(`[terminalAPI] Session creation failed: ${data.error}`);
      }
      
      return data;
    } catch (error) {
      console.error('[terminalAPI] createSession error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create session'
      };
    }
  }

  /**
   * Execute command in session
   */
  async executeCommand(
    sessionId: string,
    command: string
  ): Promise<ApiResponse<TerminalOutput>> {
    try {
      // ✅ FIX: Ensure clean session ID (no :1 or other suffixes)
      const cleanSessionId = sessionId.split(':')[0];
      
      console.log(`[terminalAPI] Executing command: ${command.substring(0, 50)}...`);
      
      const response = await fetch(`${this.baseUrl}/${cleanSessionId}`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ command })
      });

      if (response.status === 404) {
        console.error(`[terminalAPI] Session not found: ${cleanSessionId}`);
        return {
          success: false,
          error: `Session not found: ${cleanSessionId}`
        };
      }

      return await response.json();
    } catch (error) {
      console.error('[terminalAPI] executeCommand error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to execute command'
      };
    }
  }

  /**
   * Poll for new output (replaces WebSocket messages)
   * ✅ FIXED: Proper URL construction without :1 suffix
   */
  async pollOutput(
    sessionId: string,
    lastOutputTime?: string
  ): Promise<ApiResponse<TerminalOutput>> {
    try {
      // ✅ FIX: Ensure clean session ID (remove :1 if present)
      const cleanSessionId = sessionId.split(':')[0];
      
      const params = new URLSearchParams();
      if (lastOutputTime) {
        params.append('since', lastOutputTime);
      }

      const queryString = params.toString();
      const url = queryString 
        ? `${this.baseUrl}/${cleanSessionId}?${queryString}`
        : `${this.baseUrl}/${cleanSessionId}`;

      // Log first poll only
      if (!lastOutputTime) {
        console.log(`[terminalAPI] Starting polling: ${url}`);
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders()
      });

      if (response.status === 404) {
        console.error(`[terminalAPI] Poll failed - Session not found: ${cleanSessionId}`);
        return {
          success: false,
          error: `Session not found: ${cleanSessionId}`
        };
      }

      return await response.json();
    } catch (error) {
      console.error('[terminalAPI] pollOutput error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to poll output'
      };
    }
  }

  /**
   * Get tab completions
   */
  async getCompletions(
    sessionId: string,
    partial: string,
    currentDir: string
  ): Promise<ApiResponse<{ completions: string[] }>> {
    try {
      const cleanSessionId = sessionId.split(':')[0];
      
      const response = await fetch(`${this.baseUrl}/${cleanSessionId}/completions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ partial, currentDir })
      });

      return await response.json();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get completions'
      };
    }
  }

  /**
   * Get session status
   */
  async getSessionStatus(sessionId: string): Promise<ApiResponse<SessionStatus>> {
    try {
      const cleanSessionId = sessionId.split(':')[0];
      
      const response = await fetch(`${this.baseUrl}/${cleanSessionId}/status`, {
        method: 'GET',
        headers: this.getHeaders()
      });

      return await response.json();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get session status'
      };
    }
  }

  /**
   * Close session
   */
  async closeSession(sessionId: string): Promise<ApiResponse<{ success: boolean }>> {
    try {
      const cleanSessionId = sessionId.split(':')[0];
      
      console.log(`[terminalAPI] Closing session: ${cleanSessionId}`);
      
      const response = await fetch(`${this.baseUrl}/${cleanSessionId}`, {
        method: 'DELETE',
        headers: this.getHeaders()
      });

      return await response.json();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to close session'
      };
    }
  }

  /**
   * Execute script on multiple servers
   */
  async executeScript(
    scriptName: string,
    command: string,
    serverIds: number[]
  ): Promise<ApiResponse<{ executionId: string }>> {
    try {
      const response = await fetch('/api/scripts/execute', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ scriptName, command, serverIds })
      });

      return await response.json();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to execute script'
      };
    }
  }

  /**
   * Poll script execution status
   */
  async pollScriptStatus(
    executionId: string
  ): Promise<ApiResponse<any>> {
    try {
      const response = await fetch(`/api/scripts/execution/${executionId}`, {
        method: 'GET',
        headers: this.getHeaders()
      });

      return await response.json();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get script status'
      };
    }
  }

  /**
   * Update token (call this when logging in)
   */
  setToken(token: string): void {
    this.token = token;
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      localStorage.setItem('auth_token', token);
    }
  }
}

export const terminalAPI = new TerminalAPI();
export default terminalAPI;