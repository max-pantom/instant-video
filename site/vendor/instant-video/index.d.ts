import { C as Config, S as Size, I as InstantSource, K as Kind, R as Rendition } from './element-DSN8kbDx.js';
export { F as FullQuality, a as FullRendition, b as FullSource, c as InstantVideoElement, T as ThumbnailSprite } from './element-DSN8kbDx.js';

declare const config: Config;
declare function configure(patch: Partial<Config>): void;

/** 'off' = posters only (reduced motion, Save-Data, 2g); 's' = small rendition on slow links. */
declare function quality(): Size | 'off';

interface Pick {
    size: Size;
    kind: Kind;
    r: Rendition;
    /** true when MSE can play this rendition, false when only the progressive file will do */
    mse: boolean;
}
declare function pick(src: InstantSource): Pick | null;

export { Config, InstantSource, Kind, Rendition, Size, config, configure, pick, quality };
