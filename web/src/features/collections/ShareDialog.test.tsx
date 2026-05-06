import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { DocumentSetSummary, Paged, ShareResponse } from '@shared/types';
import { __resetIndexerDbForTests } from '../../utils/idb';
import { ShareDialog } from './ShareDialog';
import { Harness } from './test-utils';

const target: DocumentSetSummary = {
  documentSetId: 'ds-1',
  name: 'Acme matter',
  accessRole: 'Owner',
  updatedAt: '2026-05-04T12:00:00Z',
};

const buildResponse = (status: number, body: unknown): Response => {
  const init: ResponseInit = {
    status,
    headers: { 'content-type': 'application/json', 'X-Operation-Id': 'op' },
  };
  return new Response(body === undefined ? null : JSON.stringify(body), init);
};

const installFetch = (
  initialShares: Paged<ShareResponse> = { items: [], totalCount: 0, page: 1, pageSize: 100 },
) => {
  let shares: Paged<ShareResponse> = initialShares;

  global.fetch = jest.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';

    if (url.endsWith('/users/lookup') && method === 'POST') {
      const body = JSON.parse(init?.body as string) as { email: string };
      if (body.email === 'missing@example.com') {
        return buildResponse(404, {
          type: 'https://problems.api/not-found',
          title: 'Not found',
          status: 404,
          detail: 'no user',
        });
      }
      return buildResponse(200, {
        userId: `user-${body.email}`,
        displayName: body.email.split('@')[0],
      });
    }
    if (url.endsWith('/shares/list') && method === 'POST') {
      return buildResponse(200, shares);
    }
    if (url.endsWith('/shares') && method === 'POST') {
      const body = JSON.parse(init?.body as string) as { granteeUserId: string };
      const local = body.granteeUserId.replace('user-', '').split('@')[0];
      const row: ShareResponse = {
        documentSetId: 'ds-1',
        granteeUserId: body.granteeUserId,
        granteeDisplayName: local,
        grantedByUserId: 'me',
        grantedAt: new Date().toISOString(),
      };
      shares = { ...shares, items: [...shares.items, row], totalCount: shares.totalCount + 1 };
      return buildResponse(201, row);
    }
    if (url.includes('/shares/') && method === 'DELETE') {
      const id = decodeURIComponent(url.split('/').pop()!);
      shares = {
        ...shares,
        items: shares.items.filter((row) => row.granteeUserId !== id),
        totalCount: Math.max(0, shares.totalCount - 1),
      };
      return buildResponse(204, undefined);
    }
    return buildResponse(404, { type: 'about:blank', title: 'not found', status: 404 });
  }) as unknown as typeof fetch;
};

describe('ShareDialog', () => {
  beforeEach(() => {
    __resetIndexerDbForTests();
    installFetch();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders nothing when target is null', () => {
    render(
      <Harness>
        <ShareDialog target={null} onClose={() => {}} />
      </Harness>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens with the collection name in the title', () => {
    render(
      <Harness>
        <ShareDialog target={target} onClose={() => {}} />
      </Harness>,
    );
    expect(screen.getByRole('dialog', { name: /Share Acme matter/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Share Acme matter/ })).toBeInTheDocument();
  });

  it('shows a hint asking for an email and disables the button until lookup resolves', async () => {
    render(
      <Harness>
        <ShareDialog target={target} onClose={() => {}} />
      </Harness>,
    );
    expect(screen.getByText('Enter an email address.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add viewer' })).toBeDisabled();
  });

  it('looks up a user after debounced input and enables the grant button', async () => {
    const user = userEvent.setup();
    render(
      <Harness>
        <ShareDialog target={target} onClose={() => {}} />
      </Harness>,
    );
    await user.type(screen.getByLabelText('Email'), 'jane@example.com');

    await waitFor(() => {
      expect(screen.getByText(/Found: jane/)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Add viewer' })).toBeEnabled();
  });

  it('reports "no user" for an unknown email', async () => {
    const user = userEvent.setup();
    render(
      <Harness>
        <ShareDialog target={target} onClose={() => {}} />
      </Harness>,
    );
    await user.type(screen.getByLabelText('Email'), 'missing@example.com');

    await waitFor(() => {
      expect(screen.getByText(/No user with that email/)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Add viewer' })).toBeDisabled();
  });

  it('grants then revokes a viewer through the dialog', async () => {
    const user = userEvent.setup();
    render(
      <Harness>
        <ShareDialog target={target} onClose={() => {}} />
      </Harness>,
    );

    expect(await screen.findByText('No viewers yet.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Email'), 'jane@example.com');
    await waitFor(() => {
      expect(screen.getByText(/Found: jane/)).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Add viewer' }));

    expect(await screen.findByText('jane')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    // The Remove button only exists when a share is listed.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    });
  });

  it('closes via the Done button', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(
      <Harness>
        <ShareDialog target={target} onClose={onClose} />
      </Harness>,
    );

    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('has no axe violations in the open empty state', async () => {
    const { container } = render(
      <Harness>
        <ShareDialog target={target} onClose={() => {}} />
      </Harness>,
    );
    await screen.findByText('No viewers yet.');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations after a grant', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <Harness>
        <ShareDialog target={target} onClose={() => {}} />
      </Harness>,
    );
    await user.type(screen.getByLabelText('Email'), 'jane@example.com');
    await waitFor(() => {
      expect(screen.getByText(/Found: jane/)).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Add viewer' }));
    await screen.findByText('jane');
    expect(await axe(container)).toHaveNoViolations();
  });
});
