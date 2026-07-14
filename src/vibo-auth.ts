import type { ConnectorAuth } from '@chrischall/mcp-connector';
import { ViboClient } from './client.js';
import { GET_ME } from './gql.js';

/**
 * OAuth props stored per user by the Cloudflare connector's OAuth provider.
 *
 * Vibo's `signIn` mutation mints short-lived access tokens and there is no
 * long-lived refresh token we can store on its own, so — like the OFW connector
 * — we store the user's email + password and re-run the server-side `signIn`
 * from a per-user `ViboClient` on each session. They are encrypted at rest in
 * `OAUTH_KV` by the OAuth provider and turned back into a per-user client by
 * `worker.ts`'s `buildClient`.
 *
 * The index signature satisfies `createConnector`'s
 * `Props extends Record<string, unknown>` constraint.
 */
export interface ViboProps {
  email: string;
  password: string;
  [key: string]: unknown;
}

/**
 * `ConnectorAuth` for the Vibo remote connector: the login page collects the
 * user's Vibo email + password, VERIFIES them by constructing a `ViboClient`
 * with the injected creds and forcing a `signIn` + `me` read (a bad
 * email/password makes the mutation throw here, surfaced back on the login
 * page), and stores `{ email, password }` as the OAuth props that `worker.ts`'s
 * `buildClient` turns into a per-user client.
 *
 * SSO-only accounts (Apple/Google/Facebook, no password) are NOT supported on
 * the hosted connector — they have no password to sign in with. Use a Vibo
 * account with an email + password, or the local stdio server's
 * `vibo_capture_session` browser-capture flow instead.
 */
export const viboAuth: ConnectorAuth<ViboProps> = {
  service: 'Vibo',
  accent: '#5B2AE0',
  privacyNote:
    'Your Vibo email and password are stored encrypted and used only to sign into Vibo (vibodj.com) on your behalf to mint short-lived access tokens. SSO-only Apple/Google/Facebook accounts are not supported — use an account with a password.',
  fields: [
    { name: 'email', label: 'Vibo email', type: 'text' },
    { name: 'password', label: 'Vibo password', type: 'password' },
  ],
  async login(fields) {
    // Verify the creds up front: build a client with the injected email +
    // password and force a server-side signIn by hitting a cheap authenticated
    // read. Bad creds make `signIn` (and thus this call) throw here — surfaced
    // back on the login page. The response is discarded; the per-user client is
    // built fresh from the stored props by buildClient.
    const client = new ViboClient({ email: fields.email, password: fields.password });
    await client.gql<{ me: { _id: string } }>(GET_ME);
    return { email: fields.email, password: fields.password };
  },
};
