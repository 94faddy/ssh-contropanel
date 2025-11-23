// lib/terminal-config.ts

import type { TerminalConfig, SecurityPolicy } from '@/types';

// Default terminal configuration
export const DEFAULT_TERMINAL_CONFIG: TerminalConfig = {
  fontSize: 14,
  fontFamily: 'JetBrains Mono, Fira Code, Monaco, Cascadia Code, Courier New, monospace',
  theme: 'dark',
  cursorBlink: true,
  scrollback: 1000,
  bellSound: false,
  tabCompletion: true,
  commandHistory: true,
  copyOnSelect: false,
  pasteWithMiddleClick: false
};

// Default security policy
export const DEFAULT_SECURITY_POLICY: SecurityPolicy = {
  allowDangerousCommands: true,
  blockedCommands: [
    'rm -rf /',
    'rm -rf /*',
    'rm -rf .*',
    'mkfs',
    'dd if=/dev/zero of=/dev/',
    'format',
    ':(){ :|:& };:', // Fork bomb
    'chmod 777 /',
    'chown root:root /',
  ],
  requireSudoConfirmation: true,
  maxCommandLength: 1000,
  enableCommandLogging: true
};

// Terminal themes
export const TERMINAL_THEMES = {
  dark: {
    name: 'Dark',
    background: 'linear-gradient(135deg, #1a202c 0%, #2d3748 100%)',
    foreground: '#e2e8f0',
    cursor: '#10b981',
    selection: 'rgba(59, 130, 246, 0.3)',
    black: '#1a202c',
    red: '#ef4444',
    green: '#10b981',
    yellow: '#f59e0b',
    blue: '#3b82f6',
    magenta: '#8b5cf6',
    cyan: '#06b6d4',
    white: '#f1f5f9',
    brightBlack: '#4a5568',
    brightRed: '#f87171',
    brightGreen: '#34d399',
    brightYellow: '#fbbf24',
    brightBlue: '#60a5fa',
    brightMagenta: '#a78bfa',
    brightCyan: '#22d3ee',
    brightWhite: '#ffffff'
  },
  light: {
    name: 'Light',
    background: 'linear-gradient(135deg, #f6f8fa 0%, #ffffff 100%)',
    foreground: '#24292f',
    cursor: '#0969da',
    selection: 'rgba(0, 123, 255, 0.3)',
    black: '#24292f',
    red: '#d73a49',
    green: '#28a745',
    yellow: '#ffd33d',
    blue: '#0366d6',
    magenta: '#6f42c1',
    cyan: '#17a2b8',
    white: '#f6f8fa',
    brightBlack: '#6a737d',
    brightRed: '#ea4a5a',
    brightGreen: '#34d058',
    brightYellow: '#ffdf5d',
    brightBlue: '#2188ff',
    brightMagenta: '#8a63d2',
    brightCyan: '#39c5cf',
    brightWhite: '#ffffff'
  },
  matrix: {
    name: 'Matrix',
    background: 'linear-gradient(135deg, #000000 0%, #0d1b2a 100%)',
    foreground: '#00ff41',
    cursor: '#00ff41',
    selection: 'rgba(0, 255, 65, 0.3)',
    black: '#000000',
    red: '#ff0000',
    green: '#00ff41',
    yellow: '#ffff00',
    blue: '#0000ff',
    magenta: '#ff00ff',
    cyan: '#00ffff',
    white: '#ffffff',
    brightBlack: '#333333',
    brightRed: '#ff6666',
    brightGreen: '#66ff66',
    brightYellow: '#ffff66',
    brightBlue: '#6666ff',
    brightMagenta: '#ff66ff',
    brightCyan: '#66ffff',
    brightWhite: '#ffffff'
  },
  retro: {
    name: 'Retro',
    background: 'linear-gradient(135deg, #2e3440 0%, #3b4252 100%)',
    foreground: '#d8dee9',
    cursor: '#88c0d0',
    selection: 'rgba(136, 192, 208, 0.3)',
    black: '#3b4252',
    red: '#bf616a',
    green: '#a3be8c',
    yellow: '#ebcb8b',
    blue: '#81a1c1',
    magenta: '#b48ead',
    cyan: '#88c0d0',
    white: '#e5e9f0',
    brightBlack: '#4c566a',
    brightRed: '#bf616a',
    brightGreen: '#a3be8c',
    brightYellow: '#ebcb8b',
    brightBlue: '#81a1c1',
    brightMagenta: '#b48ead',
    brightCyan: '#8fbcbb',
    brightWhite: '#eceff4'
  }
} as const;

// Font configurations
export const TERMINAL_FONTS = [
  'JetBrains Mono',
  'Fira Code',
  'Monaco',
  'Cascadia Code',
  'Menlo',
  'Consolas',
  'DejaVu Sans Mono',
  'Liberation Mono',
  'Courier New',
  'monospace'
];

// Font size options
export const FONT_SIZES = [10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24];

// Terminal configuration manager
export class TerminalConfigManager {
  private static readonly STORAGE_KEY = 'terminal_config';
  private static readonly SECURITY_POLICY_KEY = 'terminal_security_policy';
  
  private config: TerminalConfig;
  private securityPolicy: SecurityPolicy;

  constructor() {
    this.config = this.loadConfig();
    this.securityPolicy = this.loadSecurityPolicy();
  }

  // Check if we're in browser environment
  private isClient(): boolean {
    return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
  }

  // Load configuration from localStorage
  private loadConfig(): TerminalConfig {
    if (!this.isClient()) {
      return { ...DEFAULT_TERMINAL_CONFIG };
    }

    try {
      const stored = localStorage.getItem(TerminalConfigManager.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...DEFAULT_TERMINAL_CONFIG, ...parsed };
      }
    } catch (error) {
      console.warn('Failed to load terminal config from localStorage:', error);
    }
    return { ...DEFAULT_TERMINAL_CONFIG };
  }

  // Load security policy from localStorage
  private loadSecurityPolicy(): SecurityPolicy {
    if (!this.isClient()) {
      return { ...DEFAULT_SECURITY_POLICY };
    }

    try {
      const stored = localStorage.getItem(TerminalConfigManager.SECURITY_POLICY_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...DEFAULT_SECURITY_POLICY, ...parsed };
      }
    } catch (error) {
      console.warn('Failed to load security policy from localStorage:', error);
    }
    return { ...DEFAULT_SECURITY_POLICY };
  }

  // Save configuration to localStorage
  private saveConfig(): void {
    if (!this.isClient()) {
      return;
    }

    try {
      localStorage.setItem(
        TerminalConfigManager.STORAGE_KEY, 
        JSON.stringify(this.config)
      );
    } catch (error) {
      console.warn('Failed to save terminal config to localStorage:', error);
    }
  }

  // Save security policy to localStorage
  private saveSecurityPolicy(): void {
    if (!this.isClient()) {
      return;
    }

    try {
      localStorage.setItem(
        TerminalConfigManager.SECURITY_POLICY_KEY, 
        JSON.stringify(this.securityPolicy)
      );
    } catch (error) {
      console.warn('Failed to save security policy to localStorage:', error);
    }
  }

  // Get current configuration
  getConfig(): TerminalConfig {
    return { ...this.config };
  }

  // Get current security policy
  getSecurityPolicy(): SecurityPolicy {
    return { ...this.securityPolicy };
  }

  // Update configuration
  updateConfig(updates: Partial<TerminalConfig>): void {
    this.config = { ...this.config, ...updates };
    this.saveConfig();
  }

  // Update security policy
  updateSecurityPolicy(updates: Partial<SecurityPolicy>): void {
    this.securityPolicy = { ...this.securityPolicy, ...updates };
    this.saveSecurityPolicy();
  }

  // Reset configuration to defaults
  resetConfig(): void {
    this.config = { ...DEFAULT_TERMINAL_CONFIG };
    this.saveConfig();
  }

  // Reset security policy to defaults
  resetSecurityPolicy(): void {
    this.securityPolicy = { ...DEFAULT_SECURITY_POLICY };
    this.saveSecurityPolicy();
  }

  // Get theme by name
  getTheme(themeName: string) {
    return TERMINAL_THEMES[themeName as keyof typeof TERMINAL_THEMES] || TERMINAL_THEMES.dark;
  }

  // Get available themes
  getAvailableThemes() {
    return Object.keys(TERMINAL_THEMES).map(key => ({
      key,
      name: TERMINAL_THEMES[key as keyof typeof TERMINAL_THEMES].name
    }));
  }

  // Validate font family
  validateFontFamily(fontFamily: string): boolean {
    return TERMINAL_FONTS.includes(fontFamily) || fontFamily.includes('monospace');
  }

  // Validate font size
  validateFontSize(fontSize: number): boolean {
    return fontSize >= 8 && fontSize <= 32;
  }

  // Get CSS variables for current theme
  getThemeCSS(): string {
    const theme = this.getTheme(this.config.theme);
    return `
      :root {
        --terminal-bg: ${theme.background};
        --terminal-fg: ${theme.foreground};
        --terminal-cursor: ${theme.cursor};
        --terminal-selection: ${theme.selection};
        --terminal-black: ${theme.black};
        --terminal-red: ${theme.red};
        --terminal-green: ${theme.green};
        --terminal-yellow: ${theme.yellow};
        --terminal-blue: ${theme.blue};
        --terminal-magenta: ${theme.magenta};
        --terminal-cyan: ${theme.cyan};
        --terminal-white: ${theme.white};
        --terminal-bright-black: ${theme.brightBlack};
        --terminal-bright-red: ${theme.brightRed};
        --terminal-bright-green: ${theme.brightGreen};
        --terminal-bright-yellow: ${theme.brightYellow};
        --terminal-bright-blue: ${theme.brightBlue};
        --terminal-bright-magenta: ${theme.brightMagenta};
        --terminal-bright-cyan: ${theme.brightCyan};
        --terminal-bright-white: ${theme.brightWhite};
        --terminal-font-family: ${this.config.fontFamily};
        --terminal-font-size: ${this.config.fontSize}px;
      }
    `;
  }

  // Export configuration
  exportConfig(): string {
    return JSON.stringify({
      config: this.config,
      securityPolicy: this.securityPolicy
    }, null, 2);
  }

  // Import configuration
  importConfig(configString: string): boolean {
    try {
      const imported = JSON.parse(configString);
      
      if (imported.config) {
        this.config = { ...DEFAULT_TERMINAL_CONFIG, ...imported.config };
        this.saveConfig();
      }
      
      if (imported.securityPolicy) {
        this.securityPolicy = { ...DEFAULT_SECURITY_POLICY, ...imported.securityPolicy };
        this.saveSecurityPolicy();
      }
      
      return true;
    } catch (error) {
      console.error('Failed to import configuration:', error);
      return false;
    }
  }
}

// Global configuration manager instance
export const terminalConfigManager = new TerminalConfigManager();

// Utility functions
export function applyTerminalTheme(element: HTMLElement, theme: string): void {
  const themeConfig = TERMINAL_THEMES[theme as keyof typeof TERMINAL_THEMES] || TERMINAL_THEMES.dark;
  
  element.style.background = themeConfig.background;
  element.style.color = themeConfig.foreground;
  
  // Apply CSS custom properties
  const style = document.createElement('style');
  style.textContent = terminalConfigManager.getThemeCSS();
  document.head.appendChild(style);
}

export function getOptimalFontSize(containerWidth: number, containerHeight: number): number {
  // Calculate optimal font size based on container dimensions
  const baseSize = Math.min(containerWidth / 80, containerHeight / 25);
  return Math.max(10, Math.min(20, Math.round(baseSize)));
}

export function validateTerminalConfig(config: Partial<TerminalConfig>): string[] {
  const errors: string[] = [];
  
  if (config.fontSize !== undefined) {
    if (!terminalConfigManager.validateFontSize(config.fontSize)) {
      errors.push('Font size must be between 8 and 32 pixels');
    }
  }
  
  if (config.fontFamily !== undefined) {
    if (!terminalConfigManager.validateFontFamily(config.fontFamily)) {
      errors.push('Font family must be a monospace font');
    }
  }
  
  if (config.scrollback !== undefined) {
    if (config.scrollback < 100 || config.scrollback > 10000) {
      errors.push('Scrollback must be between 100 and 10000 lines');
    }
  }
  
  if (config.theme !== undefined) {
    if (!(config.theme in TERMINAL_THEMES)) {
      errors.push('Invalid theme selected');
    }
  }
  
  return errors;
}