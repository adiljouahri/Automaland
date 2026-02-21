
export interface LogEntry {
  id: string;
  timestamp: string;
  source: 'SYSTEM' | 'NODE' | 'HOST' | 'UI';
  message: string;
  type: 'info' | 'error' | 'success';
}

export interface FlowVersion {
  timestamp: number;
  name: string;
  uiSchema: string;
  nodeCode: string;
  appCode: string;
}

export interface AutomationFlow {
  id: string; // React Key (e.g. private-5, flow-123)
  strapiId?: number; // DB ID (Unreliable for identity in v5, used for keys)
  documentId?: string; // Strapi 5 Document ID (Required for Content API calls)
  flowId: string; // Stable UUID - The Source of Truth
  name: string;
  uiSchema: string;
  nodeCode: string;
  appCode: string;
  targetApp: string;
  targetAppPath?: string;
  simulatedLogs?: string[];
  chatHistory: ChatMessage[];
  createdAt: number;
  isPublic?: boolean;
  ownerId?: number;
  history?: FlowVersion[]; // Version control
  executionTimeout?: number; // Timeout in seconds
  savedFormData?: Record<string, any>; // Persisted UI values
}

export interface Report {
  id: number;
  flowId: string;
  reason: string;
  description: string;
  reportStatus: string;
  adminFeedback?: string;
  createdAt: string;
}

export interface Announcement {
  id: number;
  title: string;
  message: string;
  announcementType: string;
  link?: string;
  createdAt: string;
}

export interface User {
  id: number;
  username: string;
  email: string;
  createdAt: string; // ISO Date string from Strapi
}

export interface AuthResponse {
  jwt: string;
  user: User;
}

export interface HostAppConfig {
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
  systemInstruction?: string;
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
  type: 'FOLDER' | 'API' | 'SCHEDULE';
  target: string; // Folder path OR Description for schedule
  interval?: number; // Seconds for schedule
  flowId: string; // The flow to trigger
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
