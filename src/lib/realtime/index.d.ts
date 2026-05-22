// Type declarations for the vendored realtime library.
//
// The upstream JS library ships no .d.ts. Layouts only need ItemType.
// We declare it permissively (any-shaped) — no consumer relies on
// strict typing today and the vendored JS code has no static contract
// to extract types from. If stricter typing is desired later, generate
// types from the JS via `tsc --allowJs --declaration`.

export interface ItemType {
  id: string;
  type: string;
  role?: string;
  status?: string;
  content?: any[];
  formatted?: {
    audio?: Int16Array;
    text?: string;
    transcript?: string;
    tool?: { type: string; name: string; call_id: string; arguments: string };
    output?: string;
    file?: any;
  };
  // Permit any additional fields the underlying library populates.
  [key: string]: any;
}

export class RealtimeClient {
  constructor(options?: { url?: string; apiKey?: string; dangerouslyAllowAPIKeyInBrowser?: boolean; debug?: boolean });
  realtime: any;
  conversation: any;
  tools: any;
  sessionConfig: any;
  connect(): Promise<true>;
  disconnect(): true;
  isConnected(): boolean;
  reset(): true;
  on(eventName: string, handler: (...args: any[]) => any): any;
  off(eventName: string, handler?: (...args: any[]) => any): any;
  updateSession(session?: Record<string, any>): true;
  sendUserMessageContent(content: any[]): true;
  appendInputAudio(arrayBuffer: ArrayBuffer | Int16Array): true;
  createResponse(): true;
  cancelResponse(id: string, sampleCount?: number): { item?: ItemType };
  deleteItem(id: string): true;
  addTool(definition: any, handler: (...args: any[]) => any): { definition: any; handler: any };
  removeTool(name: string): true;
  waitForNextItem(): Promise<{ item: ItemType }>;
  waitForNextCompletedItem(): Promise<{ item: ItemType }>;
}

export class RealtimeAPI {}
export class RealtimeConversation {}
export class RealtimeUtils {}
export class RealtimeEventHandler {}
