import { useState, useEffect, useRef, useCallback } from 'react';
import { terminalAPI } from '@/lib/terminal-api';
import type { 
  TerminalState, 
  TerminalOutputLine, 
  CommandValidation,
  TerminalConfig 
} from '@/types';

export interface UseTerminalOptions {
  serverId: number;
  serverName: string;
  config?: Partial<TerminalConfig>;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: string) => void;
  pollInterval?: number;
}

export interface UseTerminalReturn {
  state: TerminalState;
  connect: () => void;
  disconnect: () => void;
  executeCommand: (command: string) => void;
  clearTerminal: () => void;
  currentCommand: string;
  setCurrentCommand: (command: string) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  tabCompletions: string[];
  showCompletions: boolean;
  applyCompletion: (completion: string) => void;
  copyToClipboard: (text: string) => void;
  validateCommand: (command: string) => CommandValidation;
  terminalRef: React.RefObject<HTMLDivElement>;
  inputRef: React.RefObject<HTMLInputElement>;
}

const defaultConfig: TerminalConfig = {
  fontSize: 14,
  fontFamily: 'JetBrains Mono, Monaco, Consolas, monospace',
  theme: 'dark',
  cursorBlink: true,
  scrollback: 1000,
  bellSound: false,
  tabCompletion: true,
  commandHistory: true,
  copyOnSelect: false,
  pasteWithMiddleClick: false
};

export function useTerminal({ 
  serverId, 
  serverName, 
  config = {},
  onConnect,
  onDisconnect,
  onError,
  pollInterval = 1000
}: UseTerminalOptions): UseTerminalReturn {
  const [state, setState] = useState<TerminalState>({
    isConnected: false,
    isConnecting: false,
    sessionId: null,
    currentDirectory: '/',
    commandHistory: [],
    historyIndex: -1,
    currentCommand: '',
    isCommandRunning: false,
    outputs: []
  });
  
  const [currentCommand, setCurrentCommand] = useState('');
  const [tabCompletions, setTabCompletions] = useState<string[]>([]);
  const [showCompletions, setShowCompletions] = useState(false);
  const [completionIndex, setCompletionIndex] = useState(-1);
  
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const configRef = useRef<TerminalConfig>({ ...defaultConfig, ...config });
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastOutputTimeRef = useRef<string>(new Date().toISOString());

  useEffect(() => {
    configRef.current = { ...defaultConfig, ...config };
  }, [config]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [state.outputs]);

  useEffect(() => {
    if (state.isConnected && !state.isCommandRunning && inputRef.current) {
      inputRef.current.focus();
    }
  }, [state.isConnected, state.isCommandRunning]);

  const addOutput = useCallback((
    type: TerminalOutputLine['type'], 
    content: string, 
    options: Partial<TerminalOutputLine> = {}
  ) => {
    const output: TerminalOutputLine = {
      id: `${Date.now()}-${Math.random()}`,
      type,
      content,
      timestamp: new Date(),
      copyable: true,
      ...options
    };
    
    setState(prev => ({
      ...prev,
      outputs: [
        ...prev.outputs.slice(-(configRef.current.scrollback - 1)),
        output
      ]
    }));

    lastOutputTimeRef.current = new Date().toISOString();
  }, []);

  const startPolling = useCallback((sessionId: string) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    pollIntervalRef.current = setInterval(async () => {
      const result = await terminalAPI.pollOutput(sessionId, lastOutputTimeRef.current);
      
      if (result.success && result.data) {
        const output = result.data;
        
        if (output.hasNewOutput) {
          if (output.stdout) {
            addOutput('output', output.stdout);
          }
          if (output.stderr) {
            addOutput('error', output.stderr);
          }
          if (output.exitCode !== 0) {
            addOutput('system', `Command exited with code: ${output.exitCode}`);
          }

          if (output.currentDir) {
            setState(prev => ({
              ...prev,
              currentDirectory: output.currentDir,
              isCommandRunning: false
            }));
          }
        }
      }
    }, pollInterval);
  }, [pollInterval, addOutput]);

  const connect = useCallback(async () => {
    if (state.isConnecting || state.isConnected) return;
    
    setState(prev => ({ ...prev, isConnecting: true }));
    
    const result = await terminalAPI.createSession(serverId);
    
    if (result.success && result.data) {
      const session = result.data;
      
      setState(prev => ({
        ...prev,
        isConnected: true,
        isConnecting: false,
        sessionId: session.sessionId,
        currentDirectory: session.currentDir
      }));

      addOutput('system', `Connected to ${session.serverName}`);
      addOutput('system', 'Welcome to SSH Terminal! Type your commands below.');
      addOutput('system', `Working directory: ${session.currentDir}`);
      
      startPolling(session.sessionId);
      onConnect?.();
    } else {
      addOutput('error', result.error || 'Failed to create session');
      setState(prev => ({ ...prev, isConnecting: false }));
      onError?.(result.error || 'Connection failed');
    }
  }, [serverId, state.isConnecting, state.isConnected, addOutput, onConnect, onError, startPolling]);

  const disconnect = useCallback(async () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    if (state.sessionId) {
      await terminalAPI.closeSession(state.sessionId);
    }
    
    setState(prev => ({
      ...prev,
      isConnected: false,
      isConnecting: false,
      sessionId: null,
      isCommandRunning: false
    }));

    onDisconnect?.();
  }, [state.sessionId, onDisconnect]);

  const executeCommand = useCallback(async (command: string) => {
    if (!command.trim() || !state.sessionId || state.isCommandRunning) return;

    setState(prev => ({ 
      ...prev, 
      isCommandRunning: true,
      commandHistory: command.trim() !== prev.commandHistory[prev.commandHistory.length - 1] 
        ? [...prev.commandHistory, command.trim()]
        : prev.commandHistory,
      historyIndex: -1
    }));

    setShowCompletions(false);
    setTabCompletions([]);

    const prompt = `${serverName}:${state.currentDirectory}$ `;
    addOutput('input', `${prompt}${command}`);

    const result = await terminalAPI.executeCommand(state.sessionId, command.trim());

    if (!result.success) {
      addOutput('error', result.error || 'Failed to execute command');
      setState(prev => ({ ...prev, isCommandRunning: false }));
    }

    setCurrentCommand('');
  }, [state.sessionId, state.isCommandRunning, state.currentDirectory, serverName, addOutput]);

  const clearTerminal = useCallback(() => {
    setState(prev => ({ ...prev, outputs: [] }));
    addOutput('system', `Connected to ${serverName}`);
    addOutput('system', 'Terminal cleared');
    addOutput('system', `Working directory: ${state.currentDirectory}`);
  }, [serverName, state.currentDirectory, addOutput]);

  const navigateHistory = useCallback((direction: 'up' | 'down') => {
    if (!configRef.current.commandHistory) return;
    
    setState(prev => {
      if (prev.commandHistory.length === 0) return prev;
      
      let newIndex = prev.historyIndex;
      
      if (direction === 'up') {
        newIndex = prev.historyIndex < 0 
          ? prev.commandHistory.length - 1 
          : Math.max(0, prev.historyIndex - 1);
      } else {
        newIndex = prev.historyIndex + 1;
        if (newIndex >= prev.commandHistory.length) {
          newIndex = -1;
          setCurrentCommand('');
          return { ...prev, historyIndex: newIndex };
        }
      }
      
      setCurrentCommand(prev.commandHistory[newIndex]);
      return { ...prev, historyIndex: newIndex };
    });
  }, []);

  const requestTabCompletion = useCallback(async () => {
    if (!configRef.current.tabCompletion || !state.sessionId || state.isCommandRunning) return;

    const words = currentCommand.split(' ');
    const lastWord = words[words.length - 1] || '';
    
    if (lastWord.length > 0) {
      const result = await terminalAPI.getCompletions(
        state.sessionId,
        lastWord,
        state.currentDirectory
      );

      if (result.success && result.data) {
        setTabCompletions(result.data.completions);
        setShowCompletions(result.data.completions.length > 0);
        setCompletionIndex(-1);
      }
    }
  }, [state.sessionId, state.isCommandRunning, state.currentDirectory, currentCommand]);

  const applyCompletion = useCallback((completion: string) => {
    const words = currentCommand.split(' ');
    const lastWord = words[words.length - 1] || '';
    
    if (lastWord.length > 0) {
      words[words.length - 1] = completion;
    } else {
      words.push(completion);
    }
    
    setCurrentCommand(words.join(' '));
    setShowCompletions(false);
    
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [currentCommand]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (state.isCommandRunning && e.key !== 'c' && !e.ctrlKey) {
      return;
    }

    if (showCompletions && tabCompletions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCompletionIndex(prev => (prev + 1) % tabCompletions.length);
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCompletionIndex(prev => prev <= 0 ? tabCompletions.length - 1 : prev - 1);
        return;
      } else if (e.key === 'Enter' && completionIndex >= 0) {
        e.preventDefault();
        applyCompletion(tabCompletions[completionIndex]);
        return;
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowCompletions(false);
        return;
      }
    }

    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        executeCommand(currentCommand);
        break;
        
      case 'ArrowUp':
        e.preventDefault();
        navigateHistory('up');
        break;
        
      case 'ArrowDown':
        e.preventDefault();
        navigateHistory('down');
        break;
        
      case 'Tab':
        e.preventDefault();
        requestTabCompletion();
        break;
        
      default:
        if (showCompletions && e.key !== 'Tab') {
          setShowCompletions(false);
        }
        break;
    }
  }, [
    state.isCommandRunning, 
    showCompletions, 
    tabCompletions, 
    completionIndex,
    currentCommand,
    executeCommand,
    navigateHistory,
    requestTabCompletion,
    applyCompletion
  ]);

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      addOutput('system', 'Copied to clipboard');
    } catch (error) {
      addOutput('system', 'Failed to copy to clipboard');
    }
  }, [addOutput]);

  const validateCommand = useCallback((command: string): CommandValidation => {
    const trimmedCommand = command.trim();
    
    if (!trimmedCommand) {
      return { allowed: false, dangerous: false, requiresConfirmation: false };
    }

    const dangerousPatterns = [
      /rm\s+-rf\s+\/\s*$/,
      /rm\s+-rf\s+\*\s*$/,
      /mkfs/,
      /dd\s+if=\/dev\/zero/,
      /:\(\)\{\s*:\|\:&\s*\};\:/
    ];

    const isDangerous = dangerousPatterns.some(pattern => pattern.test(trimmedCommand));
    
    if (isDangerous) {
      return {
        allowed: false,
        dangerous: true,
        requiresConfirmation: true,
        warning: '⚠️ This command is extremely dangerous and could damage your system!'
      };
    }

    if (trimmedCommand.startsWith('sudo ')) {
      return {
        allowed: true,
        dangerous: false,
        requiresConfirmation: true,
        warning: '🔐 This command requires administrator privileges'
      };
    }

    return { allowed: true, dangerous: false, requiresConfirmation: false };
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    state,
    connect,
    disconnect,
    executeCommand,
    clearTerminal,
    currentCommand,
    setCurrentCommand,
    handleKeyDown,
    tabCompletions,
    showCompletions,
    applyCompletion,
    copyToClipboard,
    validateCommand,
    terminalRef,
    inputRef
  };
}