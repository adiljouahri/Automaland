export interface LogEntry {
  id: string;
  timestamp: string;
  source: 'SYSTEM' | 'NODE' | 'ADOBE' | 'UI';
  message: string;
  type: 'info' | 'error' | 'success';
}

export interface AutomationFlow {
  id: string; // React Key (e.g. private-5, flow-123)
  strapiId?: number; // DB ID (Unreliable for identity, used only for specific PUT ops found via lookup)
  flowId: string; // Stable UUID - The Source of Truth
  name: string;
  uiSchema: string;
  nodeCode: string;
  adobeCode: string;
  targetApp: string;
  targetAppPath?: string;
  simulatedLogs?: string[];
  chatHistory: ChatMessage[];
  createdAt: number;
  isPublic?: boolean;
  ownerId?: number;
}

export interface User {
  id: number;
  username: string;
  email: string;
}

export interface AuthResponse {
  jwt: string;
  user: User;
}

export interface AdobeAppConfig {
  id: string;
  name: string;
  path?: string;
  specifier?: string;
  version?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}

export enum AppStatus {
  IDLE = 'IDLE',
  GENERATING = 'GENERATING',
  RUNNING = 'RUNNING',
}

export type AIProvider = 'gemini' | 'openai' | 'claude' | 'custom';

export interface AppSettings {
  aiApiKey: string;
  aiProvider: AIProvider;
  aiBaseUrl?: string;
  aiModel: string;
  serverUrl: string;
  strapiUrl: string;
  theme: 'dark' | 'light';
}

export interface EnvVariable {
  key: string;
  value: string;
  encrypted: boolean;
}

export interface WatcherConfig {
  id: string;
  type: 'FOLDER' | 'API';
  target: string;
  flowId: string; // The flow to trigger
  interval?: number;
  active: boolean;
}

export interface NpmPackage {
  name: string;
  version: string;
  installed: boolean;
}

export interface JSONSchema {
  title?: string;
  description?: string;
  type: string;
  properties?: Record<string, any>;
  required?: string[];
}