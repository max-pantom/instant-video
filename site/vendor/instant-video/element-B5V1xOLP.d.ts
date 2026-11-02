type Size = 'm' | 's';
type Kind = 'avc' | 'av1';
/** One encoded rendition: fMP4 init+head, the remaining fragments, and a progressive fallback (H.264 only). */
interface Rendition {
    codec: string;
    head: string;
    tail: string;
    full?: string;
    headDur: number;
    dur: number;
    headBytes: number;
    tailBytes: number;
    fullBytes?: number;
}
/** The manifest written by `instant-video encode` (stored on whatever record owns the clip). */
interface InstantSource {
    v: number;
    dur: number;
    fps?: number;
    gop?: number;
    w: number;
    h: number;
    poster?: {
        avif?: string;
        webp?: string;
        jpg?: string;
    };
    r: Partial<Record<Size, Partial<Record<Kind, Rendition>>>>;
}
interface Config {
    /** Warm the card the pointer is heading to before it arrives. */
    predict: boolean;
    /** Fetch heads of cards near the viewport while idle. */
    prefetch: boolean;
    /** Warm players kept alive (elements with a MediaSource at frame 0). 0 disables warming. */
    poolSize: number;
    /** How far ahead (ms) the pointer is projected. */
    lookaheadMs: number;
    /** Force a rendition size; 'auto' follows Save-Data / connection. */
    size: 'auto' | Size;
    /** Force a codec; 'auto' uses MediaCapabilities. */
    codec: 'auto' | Kind;
    /** Use MediaSource when available; false forces the progressive fallback. */
    mse: boolean;
}

/** What the registry needs from an element. */
interface Registered {
    source: InstantSource | null;
    /** The element whose rect/hover/focus/touch counts as intent (the card). */
    hitTarget: Element;
    warm(): void;
}

/**
 * <instant-video>  (fires a `playing` event when the clip is playing)
 *   .source  InstantSource (the ad's `iv`)      attr/prop `active`: play (loop, muted)
 *   .target  element that counts as the hit area (default: the parent)      attr/prop `warm`: get ready, don't play
 * Layout: fills its positioned parent, sits above the poster image; hidden until a frame is showing.
 */
declare const Base: typeof HTMLElement;
declare class InstantVideoElement extends Base implements Registered {
    static observedAttributes: string[];
    private _src;
    private _target;
    private player?;
    private root;
    private on;
    private scrubRaf;
    private scrubProgress;
    private boundTarget?;
    private readonly onPointerMove;
    get source(): InstantSource | null;
    set source(s: InstantSource | null);
    get target(): Element | null;
    set target(t: Element | null);
    get hitTarget(): Element;
    get active(): boolean;
    set active(v: boolean);
    get warmed(): boolean;
    set warmed(v: boolean);
    /** `play` loops normally; `scrub` maps horizontal pointer position to the clip timeline. */
    get mode(): 'play' | 'scrub';
    set mode(v: 'play' | 'scrub');
    connectedCallback(): void;
    disconnectedCallback(): void;
    attributeChangedCallback(): void;
    private sync;
    private bindTarget;
    private unbindTarget;
    /** Get a decoded frame 0 ready without playing (idempotent; counts against the pool). */
    warm(): void;
    private ensure;
    private play;
    private pause;
    /** Release the player (MediaSource, decoder). */
    cool(): void;
}

export { type Config as C, type InstantSource as I, type Kind as K, type Rendition as R, type Size as S, InstantVideoElement as a };
