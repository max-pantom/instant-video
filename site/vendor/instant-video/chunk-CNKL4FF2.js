// src/node/storage.ts
import { mkdir, writeFile } from "fs/promises";
import { dirname, join } from "path";
var CACHE = "public, max-age=31536000, immutable";
var join_ = (base, key) => base ? `${base.replace(/\/+$/, "")}/${key}` : key;
function fsStorage({ dir, baseUrl = "" }) {
  return {
    async put(key, data) {
      const file = join(dir, key);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, data);
      return join_(baseUrl, key);
    }
  };
}
var load = async (name) => {
  try {
    return await import(
      /* @vite-ignore */
      name
    );
  } catch {
    throw new Error(`The "${name}" package is required for this storage adapter. Install it: npm i ${name}`);
  }
};
function blobStorage({ token, prefix = "instant/" } = {}) {
  return {
    async put(key, data, contentType) {
      const { put } = await load("@vercel/blob");
      const r = await put(prefix + key, data, {
        access: "public",
        contentType,
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 31536e3,
        ...token ? { token } : {}
      });
      return r.url;
    }
  };
}
function s3Storage({ bucket, region, endpoint, prefix = "instant/", publicUrl, client }) {
  let c = client;
  return {
    async put(key, data, contentType) {
      const sdk = await load("@aws-sdk/client-s3");
      c ??= new sdk.S3Client({ ...region ? { region } : {}, ...endpoint ? { endpoint, forcePathStyle: true } : {} });
      await c.send(new sdk.PutObjectCommand({ Bucket: bucket, Key: prefix + key, Body: data, ContentType: contentType, CacheControl: CACHE }));
      if (publicUrl) return join_(publicUrl, prefix + key);
      if (endpoint) return join_(`${endpoint.replace(/\/+$/, "")}/${bucket}`, prefix + key);
      return `https://${bucket}.s3.${region ?? "us-east-1"}.amazonaws.com/${prefix + key}`;
    }
  };
}

export {
  CACHE,
  fsStorage,
  blobStorage,
  s3Storage
};
//# sourceMappingURL=chunk-CNKL4FF2.js.map