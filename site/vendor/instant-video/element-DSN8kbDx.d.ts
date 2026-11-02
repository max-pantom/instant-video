type Size = 'm' | 's';
type Kind = 'avc' | 'av1';
type FullQuality = 720 | 1080;
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
/** A high-quality player rendition. `src` is fMP4; H.264 also carries a progressive fallback. */
interface FullRendition {
    codec: string;
    src: string;
    fallback?: string;
    w: number;
    h: number;
    dur: number;
    bytes: number;
    fallbackBytes?: number;
}
/** Contact sheet used by the player's scrub tooltip. */
interface ThumbnailSprite {
    src: string;
    width: number;
    height: number;
    columns: number;
    rows: number;
    count: number;
    interval: number;
}
interface FullSource {
    r: Partial<Record<FullQuality, Partial<Record<Kind, FullRendition>>>>;
    sprite?: ThumbnailSprite;
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
    /** Optional high-quality player renditions produced with `instant-video encode --full …`. */
    full?: FullSource;
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

declare const Base: typeof HTMLElement;
declare class InstantVideoElement extends Base implements Registered {
    static observedAttributes: string[];
    private _src;
    private _target;
    private player?;
    private root;
    private playerUi?;
    private controlsUi?;
    private on;
    private boundTarget?;
    private state;
    private hideTimer;
    private touchStart?;
    private lastTap?;
    private tapTimer;
    private trackObserver?;
    get source(): InstantSource | null;
    set source(source: InstantSource | null);
    get target(): Element | null;
    set target(target: Element | null);
    get hitTarget(): Element;
    get active(): boolean;
    set active(value: boolean);
    get warmed(): boolean;
    set warmed(value: boolean);
    get mode(): 'preview' | 'player';
    set mode(value: 'preview' | 'player');
    get controls(): boolean;
    set controls(value: boolean);
    get startAt(): number;
    set startAt(value: number);
    get autoPlay(): boolean;
    set autoPlay(value: boolean);
    get muted(): boolean;
    set muted(value: boolean);
    get loop(): boolean;
    set loop(value: boolean);
    get poster(): string;
    set poster(value: string);
    get download(): boolean;
    set download(value: boolean);
    connectedCallback(): void;
    disconnectedCallback(): void;
    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void;
    private build;
    private sync;
    private bindTarget;
    private unbindTarget;
    warm(): void;
    private ensure;
    private playPreview;
    private pausePreview;
    private enterPlayer;
    private act;
    private render;
    private renderTime;
    private renderQualityOptions;
    private resolveQuality;
    private selectQuality;
    private updateDownload;
    private syncTracks;
    private applyCaptions;
    private togglePlay;
    private seekBy;
    private readonly onControlClick;
    private readonly onSeek;
    private readonly onVolume;
    private readonly onSpeed;
    private readonly onQuality;
    private readonly onTimelineHover;
    private readonly onKeyDown;
    private showControls;
    private readonly onActivity;
    private readonly onTouchDown;
    private readonly onTouchUp;
    cool(): void;
}

export { type Config as C, type FullQuality as F, type InstantSource as I, type Kind as K, type Rendition as R, type Size as S, type ThumbnailSprite as T, type FullRendition as a, type FullSource as b, InstantVideoElement as c };
