import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FakeParam = {
  value: number;
  setValueAtTime: ReturnType<typeof vi.fn>;
  exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
  cancelScheduledValues: ReturnType<typeof vi.fn>;
  setTargetAtTime: ReturnType<typeof vi.fn>;
};

class FakeAudioNode {
  type = "sine";
  gain: FakeParam = {
    value: 0,
    setValueAtTime: vi.fn((value: number) => { this.gain.value = value; }),
    exponentialRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
    setTargetAtTime: vi.fn(),
  };
  frequency: FakeParam = {
    value: 0,
    setValueAtTime: vi.fn((value: number) => { this.frequency.value = value; }),
    exponentialRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
    setTargetAtTime: vi.fn(),
  };
  onended: (() => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state = "running";
  currentTime = 1;
  destination = new FakeAudioNode();
  gains: FakeAudioNode[] = [];
  oscillators: FakeAudioNode[] = [];
  resume = vi.fn(async () => undefined);

  constructor() { FakeAudioContext.instances.push(this); }
  createGain() {
    const node = new FakeAudioNode();
    this.gains.push(node);
    return node;
  }
  createOscillator() {
    const node = new FakeAudioNode();
    this.oscillators.push(node);
    return node;
  }
}

describe("Attention Guard siren audio", () => {
  beforeEach(() => {
    vi.resetModules();
    FakeAudioContext.instances = [];
    vi.stubGlobal("window", {
      AudioContext: FakeAudioContext,
      setTimeout: vi.fn(() => 0),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("starts one loud siren, keeps it running, then fades and stops it", async () => {
    const sound = await import("../sound");
    sound.prepareFocusAlarmAudio();
    sound.startFocusAlarm();
    sound.startFocusAlarm();

    const context = FakeAudioContext.instances[0];
    expect(context).toBeDefined();
    expect(context?.oscillators).toHaveLength(2);
    expect(context?.oscillators[0]?.type).toBe("sawtooth");
    expect(context?.oscillators[0]?.start).toHaveBeenCalledOnce();
    expect(context?.gains[1]?.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.17, 1.1);
    expect(context?.gains[1]?.connect).toHaveBeenCalledWith(context?.destination);

    sound.stopFocusAlarm();
    expect(context?.oscillators[0]?.stop).toHaveBeenCalledWith(1.12);
    expect(context?.gains[1]?.gain.setTargetAtTime).toHaveBeenCalledWith(0.0001, 1, 0.025);
  });
});
