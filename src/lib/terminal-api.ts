// src/lib/terminal-api.ts
/**
 * Terminal REST API wrapper - FIXED version
 * ✅ Fixed: URL encoding issues
 * ✅ Fixed: Session ID handling
 * ✅ Fixed: Poll response handling
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
      console.log(`[terminalAPI] Executing command in session ${sessionId.substring(0, 20)}...`);
      
      const response = await fetch(`${this.baseUrl}/${encodeURIComponent(sessionId)}`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ command })
      });

      if (response.status === 404) {
        console.error(`[terminalAPI] Session not found: ${sessionId}`);
        return {
          success: false,
          error: `Session not found`
        };
      }

      if (!response.ok) {
        const error = await response.text();
        console.error(`[terminalAPI] Execute command failed:`, error);
        return {
          success: false,
          error: `Request failed: ${response.status}`
        };
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('[terminalAPI] executeCommand error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to execute command'
      };
    }
  }

  /**
   * Poll for new output
   * ✅ FIXED: Proper URL encoding and parameter handling
   */
  async pollOutput(
    sessionId: string,
    lastOutputTime?: string
  ): Promise<ApiResponse<TerminalOutput>> {
    try {
      // Build URL with proper encoding
      const encodedSessionId = encodeURIComponent(sessionId);
      let url = `${this.baseUrl}/${encodedSessionId}`;
      
      if (lastOutputTime) {
        const encodedTime = encodeURIComponent(lastOutputTime);
        url += `?since=${encodedTime}`;
      }

      console.log(`[terminalAPI] Polling: ${url.substring(0, 80)}...`);

      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders()
      });

      if (response.status === 404) {
        console.error(`[terminalAPI] Poll: Session not found`);
        return {
          success: false,
          error: `Session not found`
        };
      }

      if (!response.ok) {
        console.error(`[terminalAPI] Poll failed: Status ${response.status}`);
        return {
          success: false,
          error: `Request failed: ${response.status}`
        };
      }

      const data = await response.json();
      
      // ✅ Handle success properly
      if (data.success) {
        return data;
      } else {
        // Don't log every poll error - too noisy
        if (data.error && !data.error.includes('Session not found')) {
          console.warn(`[terminalAPI] Poll response error:`, data.error);
        }
        return data;
      }
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
      const encodedSessionId = encodeURIComponent(sessionId);
      
      const response = await fetch(
        `${this.baseUrl}/${encodedSessionId}/completions`,
        {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({ partial, currentDir })
        }
      );

      if (!response.ok) {
        return {
          success: false,
          error: `Request failed: ${response.status}`
        };
      }

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
      const encodedSessionId = encodeURIComponent(sessionId);
      
      const response = await fetch(
        `${this.baseUrl}/${encodedSessionId}/status`,
        {
          method: 'GET',
          headers: this.getHeaders()
        }
      );

      if (!response.ok) {
        return {
          success: false,
          error: `Request failed: ${response.status}`
        };
      }

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
      const encodedSessionId = encodeURIComponent(sessionId);
      
      console.log(`[terminalAPI] Closing session: ${sessionId.substring(0, 20)}...`);
      
      const response = await fetch(
        `${this.baseUrl}/${encodedSessionId}`,
        {
          method: 'DELETE',
          headers: this.getHeaders()
        }
      );

      if (!response.ok && response.status !== 404) {
        console.error(`[terminalAPI] Close failed: Status ${response.status}`);
        return {
          success: false,
          error: `Request failed: ${response.status}`
        };
      }

      // Always return success, even if session doesn't exist
      return {
        success: true
      };
    } catch (error) {
      console.error('[terminalAPI] closeSession error:', error);
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