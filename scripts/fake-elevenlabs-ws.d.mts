export type FakeConnection = {
  url: string;
  query: Record<string, string>;
  messages: Record<string, unknown>[];
  closedByClient: boolean;
  closeCode: number | null;
};

export function silentMp3(frames: number): Buffer;

export function startFakeElevenLabs(port?: number): Promise<{
  url: string;
  connections: FakeConnection[];
  close: () => Promise<void>;
}>;
