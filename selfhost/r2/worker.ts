// The `r2` service: the account service's SAVES bucket. `R2_BACKEND` picks where the bytes live: "disk" (the default),
// a workerd disk service with the key index in one SQLite Durable Object; or "s3", any S3-compatible bucket.
import { AwsClient } from 'aws4fetch';
import { handleR2, type R2Backend } from './protocol.ts';
import { diskBackend, type Disk } from './disk-backend.ts';
import { s3Backend } from './s3-backend.ts';
import type { SqlStore } from '../d1/protocol.ts';

type Stub = { fetch(request: Request): Promise<Response> };
type Namespace = { idFromName(name: string): unknown; get(id: unknown): Stub };
type Env = {
  R2_BACKEND?: string;
  INDEX: Namespace;
  DISK: Disk;
  S3_ENDPOINT?: string | null;
  S3_BUCKET?: string | null;
  S3_REGION?: string | null;
  S3_ACCESS_KEY_ID?: string | null;
  S3_SECRET_ACCESS_KEY?: string | null;
};

export class BucketIndex {
  backend: R2Backend;

  constructor(state: { storage: SqlStore }, env: Env) {
    this.backend = diskBackend(state.storage, env.DISK);
  }

  fetch(request: Request): Promise<Response> {
    return handleR2(this.backend, request);
  }
}

function s3Of(env: Env): ReturnType<typeof s3Backend> {
  const { S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = env;
  if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
    throw new Error('R2_BACKEND is "s3" but S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID or S3_SECRET_ACCESS_KEY is unset');
  }
  const client = new AwsClient({
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
    service: 's3',
    region: env.S3_REGION || 'us-east-1',
  });
  return s3Backend({ endpoint: S3_ENDPOINT, bucket: S3_BUCKET }, (url, init) => client.fetch(url, init));
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    if (env.R2_BACKEND === 's3') return handleR2(s3Of(env), request);
    return env.INDEX.get(env.INDEX.idFromName('saves')).fetch(request);
  },
};
