// src/lib/terminal-api.ts
/**
 * Terminal REST API wrapper - replaces WebSocket with polling
 * Works perfectly with Cloudflare Proxy
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
    if (typeof window !== 'undefined') {
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
      const response = await fetch(`${this.baseUrl}/sessions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ serverId })
      });

      return await response.json();
    } catch (error) {
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
      const response = await fetch(`${this.baseUrl}/${sessionId}/command`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ command })
      });

      return await response.json();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to execute command'
      };
    }
  }

  /**
   * Poll for new output (replaces WebSocket messages)
   */
  async pollOutput(
    sessionId: string,
    lastOutputTime?: string
  ): Promise<ApiResponse<TerminalOutput>> {
    try {
      const params = new URLSearchParams();
      if (lastOutputTime) {
        params.append('since', lastOutputTime);
      }

      const response = await fetch(
        `${this.baseUrl}/${sessionId}/output?${params}`,
        {
          method: 'GET',
          headers: this.getHeaders()
        }
      );

      return await response.json();
    } catch (error) {
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
      const response = await fetch(`${this.baseUrl}/${sessionId}/completions`, {
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
      const response = await fetch(`${this.baseUrl}/${sessionId}/status`, {
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
      const response = await fetch(`${this.baseUrl}/${sessionId}`, {
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
  }
}

export const terminalAPI = new TerminalAPI();
export default terminalAPI;