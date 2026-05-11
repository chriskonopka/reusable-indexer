import { PublicClientApplication, type AccountInfo } from '@azure/msal-browser';
import type { IndexerAppProps, IndexerEvent } from '@shared/types';

// What belongs here: a real-MSAL-backed host implementation used to shake
// the indexer down against the live GlobalIndexer API. Standalone dev only —
// production Module Federation consumers supply their own host contract.
//
// Activated by visiting `npm run dev` with `?real=1` in the URL. The
// clientId is read from `process.env.MSAL_CLIENT_ID` at build time via
// webpack's DefinePlugin. Tenant ID, scope, and API URL default to the
// MWE Test deployment but can be overridden via env vars.

const DEFAULT_TENANT_ID = '57c9b80f-2ee9-4a3e-b9fe-08afef16be27';
const DEFAULT_API_BASE_URL =
  'https://globalapi-test-dcfad7eka5b0gkhk.z01.azurefd.net';
const SCOPE = 'api://898a6200-9258-4a42-8d75-4d6c6384e2af/Access';

export interface RealHostOptions {
  clientId: string;
  redirectUri?: string;
  apiBaseUrl?: string;
  tenantId?: string;
}

export const createRealHost = async (
  options: RealHostOptions,
): Promise<IndexerAppProps> => {
  if (!options.clientId) {
    throw new Error(
      'MSAL_CLIENT_ID is not set. Run with `MSAL_CLIENT_ID=<spa-app-id> npm run dev` ' +
        'and open http://localhost:5174/?real=1',
    );
  }

  const redirectUri = options.redirectUri ?? window.location.origin + '/';
  const tenantId = options.tenantId ?? DEFAULT_TENANT_ID;
  const apiBaseUrl = options.apiBaseUrl ?? DEFAULT_API_BASE_URL;

  const msalInstance = new PublicClientApplication({
    auth: {
      clientId: options.clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      redirectUri,
    },
    cache: {
      cacheLocation: 'sessionStorage',
      storeAuthStateInCookie: false,
    },
  });

  await msalInstance.initialize();
  await msalInstance.handleRedirectPromise();

  const accounts: AccountInfo[] = msalInstance.getAllAccounts();
  if (accounts.length === 0) {
    await msalInstance.loginRedirect({ scopes: [SCOPE] });
    return new Promise<IndexerAppProps>(() => {
      // Browser navigates to login.microsoftonline.com; never resolves here.
    });
  }

  msalInstance.setActiveAccount(accounts[0]);

  const getAccessToken = async (): Promise<string> => {
    const account = msalInstance.getActiveAccount();
    if (!account) {
      throw new Error('No active MSAL account');
    }
    try {
      const result = await msalInstance.acquireTokenSilent({
        scopes: [SCOPE],
        account,
      });
      return result.accessToken;
    } catch {
      await msalInstance.acquireTokenRedirect({ scopes: [SCOPE] });
      throw new Error('Interactive token acquisition required');
    }
  };

  return {
    apiBaseUrl,
    getAccessToken,
    onEvent: (event: IndexerEvent) => {
      // eslint-disable-next-line no-console
      console.info('[realHost] IndexerEvent', event);
      if (event.type === 'auth/expired') {
        void msalInstance.acquireTokenRedirect({ scopes: [SCOPE] });
      }
    },
  };
};
