import { createServer, type Server } from 'node:http';
import { type JWTPayload, SignJWT, exportJWK, generateKeyPair } from 'jose';

/**
 * Supabase Auth giả cho integration test: một JWKS server ES256 dựng tại chỗ + hàm ký token.
 * Cùng cơ chế Supabase dùng khi bật JWT signing keys, nên AuthGuard/JWKS/claims được kiểm thật mà không cần mạng.
 * Cách dùng (TRƯỚC khi import AppModule, vì ConfigModule chụp process.env lúc import):
 *   const supabase = await startFakeSupabase(); supabase.applyEnv();
 *   const { AppModule } = await import('../../src/app.module.js');
 */
export interface FakeSupabase {
  baseUrl: string;
  issuer: string;
  signToken: (payload: JWTPayload & { sub: string }, overrides?: { kid?: string }) => Promise<string>;
  /** Ghi SUPABASE_URL vào process.env (app tự suy JWKS = SUPABASE_URL/auth/v1/.well-known/jwks.json). */
  applyEnv: () => void;
  close: () => Promise<void>;
}

export async function startFakeSupabase(): Promise<FakeSupabase> {
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'ES256', use: 'sig' };

  const server: Server = createServer((req, res) => {
    if (req.url?.startsWith('/auth/v1/.well-known/jwks.json')) {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ keys: [jwk] }));
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const issuer = `${baseUrl}/auth/v1`;

  return {
    baseUrl,
    issuer,
    signToken: (payload, overrides) =>
      new SignJWT(payload)
        .setProtectedHeader({ alg: 'ES256', kid: overrides?.kid ?? 'test-key' })
        .setIssuer(issuer)
        .setAudience('authenticated')
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(privateKey),
    applyEnv: () => {
      process.env.SUPABASE_URL = baseUrl;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
