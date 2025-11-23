'use client';

import { useState, useEffect } from 'react';
import { X, Maximize2, Minimize2, RotateCcw, Copy, Settings } from 'lucide-react';
import { useTerminal } from '@/hooks/useTerminalREST';
import TerminalSettings from './TerminalSettings';
import type { TerminalProps, TerminalOutputLine } from '@/types';

export default function TerminalREST({ serverId, serverName, onClose }: TerminalProps) {
  const terminal = useTerminal({
    serverId,
    serverName,
    pollInterval: 1000,
    onError: (error) => {
      console.error('Terminal error:', error);
    }
  });

  const [isMaximized, setIsMaximized] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [autoConnect, setAutoConnect] = useState(true);

  useEffect(() => {
    if (autoConnect && !terminal.state.isConnected && !terminal.state.isConnecting) {
      terminal.connect();
    }
  }, [autoConnect, terminal.state.isConnected, terminal.state.isConnecting, terminal]);

  const formatOutput = (output: TerminalOutputLine) => {
    const timestamp = output.timestamp.toLocaleTimeString();
    
    switch (output.type) {
      case 'input':
        return (
          <div key={output.id} className="text-green-400 font-mono flex items-center group hover:bg-gray-800/30 px-1 rounded">
            <span className="select-none">{output.content}</span>
            <button
              onClick={() => terminal.copyToClipboard(output.content)}
              className="ml-2 opacity-0 group-hover:opacity-50 hover:opacity-100 transition-opacity p-1"
              title="Copy command"
              type="button"
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>
        );

      case 'output':
        return (
          <div key={output.id} className="text-gray-100 font-mono whitespace-pre-wrap break-words group relative hover:bg-gray-800/30 px-1 rounded">
            {output.content}
            <button
              onClick={() => terminal.copyToClipboard(output.content)}
              className="absolute top-0 right-0 opacity-0 group-hover:opacity-50 hover:opacity-100 transition-opacity p-1"
              title="Copy output"
              type="button"
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>
        );

      case 'error':
        return (
          <div key={output.id} className="text-red-400 font-mono whitespace-pre-wrap break-words group relative hover:bg-gray-800/30 px-1 rounded">
            {output.content}
            <button
              onClick={() => terminal.copyToClipboard(output.content)}
              className="absolute top-0 right-0 opacity-0 group-hover:opacity-50 hover:opacity-100 transition-opacity p-1"
              title="Copy error"
              type="button"
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>
        );

      case 'system':
        return (
          <div key={output.id} className="text-blue-400 font-mono italic px-1">
            [{timestamp}] {output.content}
          </div>
        );

      default:
        return (
          <div key={output.id} className="text-gray-300 font-mono px-1">
            {output.content}
          </div>
        );
    }
  };

  const getPrompt = (): string => {
    const shortDir = terminal.state.currentDirectory.length > 20 
      ? '...' + terminal.state.currentDirectory.slice(-17) 
      : terminal.state.currentDirectory;
    return `${serverName}:${shortDir}$ `;
  };

  const handleConnect = () => {
    terminal.connect();
  };

  const handleDisconnect = () => {
    terminal.disconnect();
    setAutoConnect(false);
  };

  return (
    <>
      <div className={`bg-white shadow-xl rounded-lg overflow-hidden transition-all duration-200 ${
        isMaximized ? 'fixed inset-4 z-40 flex flex-col' : 'relative'
      }`}>
        {/* Header */}
        <div className="bg-gray-800 px-4 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="flex space-x-2">
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            </div>
            <div className="text-white font-medium text-sm">
              Terminal - {serverName}
              {terminal.state.isConnected && (
                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                  Connected
                </span>
              )}
              {terminal.state.isConnecting && (
                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                  Connecting...
                </span>
              )}
              {terminal.state.isCommandRunning && (
                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                  Running...
                </span>
              )}
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => terminal.clearTerminal()}
              className="p-1 text-gray-400 hover:text-white rounded transition-colors"
              title="Clear terminal"
              type="button"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            
            <button
              onClick={() => setShowSettings(true)}
              className="p-1 text-gray-400 hover:text-white rounded transition-colors"
              title="Terminal settings"
              type="button"
            >
              <Settings className="h-4 w-4" />
            </button>

            <button
              onClick={() => setIsMaximized(!isMaximized)}
              className="p-1 text-gray-400 hover:text-white rounded transition-colors"
              title={isMaximized ? "Restore" : "Maximize"}
              type="button"
            >
              {isMaximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>

            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-white rounded transition-colors"
              title="Close terminal"
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Terminal Content */}
        <div className="bg-gray-900 flex-1 flex flex-col min-h-96 relative">
          {/* Output Area */}
          <div
            ref={terminal.terminalRef}
            className="flex-1 overflow-y-auto p-4 space-y-1 custom-scrollbar"
          >
            {terminal.state.isConnecting && (
              <div className="text-yellow-400 font-mono text-sm">
                Connecting to {serverName}...
              </div>
            )}
            
            {terminal.state.outputs.map((output) => formatOutput(output))}
            
            {!terminal.state.isConnected && !terminal.state.isConnecting && (
              <div className="text-center py-8">
                <div className="text-gray-400 mb-4">Not connected</div>
                <button
                  onClick={handleConnect}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm"
                  type="button"
                >
                  Connect
                </button>
              </div>
            )}
          </div>

          {/* Tab Completions */}
          {terminal.showCompletions && terminal.tabCompletions.length > 0 && (
            <div className="bg-gray-800 border border-gray-600 rounded-md shadow-lg max-h-32 overflow-y-auto z-10 mx-4 mb-2">
              {terminal.tabCompletions.map((completion, index) => {
                const isSelected = index === -1;
                return (
                  <div
                    key={`${completion}-${index}`}
                    className={`px-3 py-1 font-mono text-xs cursor-pointer ${
                      isSelected 
                        ? 'bg-blue-600 text-white' 
                        : 'text-gray-300 hover:bg-gray-700'
                    }`}
                    onClick={() => terminal.applyCompletion(completion)}
                    role="option"
                    aria-selected={isSelected}
                  >
                    {completion}
                  </div>
                );
              })}
            </div>
          )}

          {/* Input Area */}
          {terminal.state.isConnected && (
            <div className="border-t border-gray-700 p-4 flex-shrink-0">
              <div className="flex items-center space-x-2">
                <span className="text-green-400 font-mono font-bold select-none text-sm">
                  {getPrompt()}
                </span>
                <input
                  ref={terminal.inputRef}
                  type="text"
                  value={terminal.currentCommand}
                  onChange={(e) => terminal.setCurrentCommand(e.target.value)}
                  onKeyDown={terminal.handleKeyDown}
                  className="flex-1 bg-transparent text-green-400 font-mono outline-none text-sm"
                  placeholder={terminal.state.isCommandRunning ? "Command is running..." : "Type your command here..."}
                  disabled={terminal.state.isCommandRunning}
                  autoComplete="off"
                  spellCheck={false}
                />
                {terminal.state.isCommandRunning && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-400"></div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {terminal.state.isConnected && (
          <div className="bg-gray-800 px-4 py-2 text-xs text-gray-400 border-t border-gray-700 flex-shrink-0">
            <div className="flex justify-between items-center">
              <span>
                Session: {terminal.state.sessionId?.substring(0, 8)}... | Dir: {terminal.state.currentDirectory}
              </span>
              <button
                onClick={handleDisconnect}
                className="text-red-400 hover:text-red-300 transition-colors"
                type="button"
              >
                Disconnect
              </button>
            </div>
          </div>
        )}

        {/* Keyboard Help */}
        {terminal.state.isConnected && (
          <div className="bg-gray-700/30 px-4 py-1 text-xs text-gray-400 flex-shrink-0">
            ↑↓ history | Tab completion | Ctrl+C interrupt | Ctrl+L clear
          </div>
        )}
      </div>

      {/* Terminal Settings Modal */}
      {showSettings && (
        <TerminalSettings
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </>
  );
}