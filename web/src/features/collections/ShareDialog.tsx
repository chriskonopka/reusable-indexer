import { useState } from 'react';
import type { DocumentSetSummary, ShareResponse } from '@shared/types';
import { Button } from '../../components/Button';
import { Modal, ModalBody, ModalFooter, ModalHeader } from '../../components/Modal';
import { Skeleton } from '../../components/Skeleton';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useToast } from '../../hooks/useToast';
import { ApiClientError } from '../../api/client';
import {
  useDocumentSetShares,
  useGrantShare,
  useRevokeShare,
  useUserLookup,
} from './queries';

// Debounce window applied to the email-lookup input. Keeps us under the
// `UsersLookup` rate-limit policy on the API while still feeling immediate.
const EMAIL_LOOKUP_DEBOUNCE_MS = 400;

interface ShareDialogProps {
  target: DocumentSetSummary | null;
  onClose: () => void;
}

export const ShareDialog = ({ target, onClose }: ShareDialogProps) => {
  const [emailInput, setEmailInput] = useState('');
  const debouncedEmail = useDebouncedValue(emailInput, EMAIL_LOOKUP_DEBOUNCE_MS);
  const lookup = useUserLookup(target ? debouncedEmail : '');
  const shares = useDocumentSetShares(target?.documentSetId ?? null);
  const grant = useGrantShare();
  const revoke = useRevokeShare();
  const toast = useToast();

  if (!target) {
    return <Modal isOpen={false} ariaLabel="Share collection" onClose={onClose}>{null}</Modal>;
  }

  const onGrant = async () => {
    if (!lookup.data) return;
    try {
      await grant.mutateAsync({
        documentSetId: target.documentSetId,
        body: { granteeUserId: lookup.data.userId },
      });
      setEmailInput('');
    } catch (error) {
      const detail =
        error instanceof ApiClientError ? error.normalized.detail : 'Could not grant access.';
      toast.push(detail, 'error');
    }
  };

  const onRevoke = async (share: ShareResponse) => {
    try {
      await revoke.mutateAsync({
        documentSetId: target.documentSetId,
        granteeUserId: share.granteeUserId,
      });
    } catch (error) {
      const detail =
        error instanceof ApiClientError ? error.normalized.detail : 'Could not revoke access.';
      toast.push(detail, 'error');
    }
  };

  const lookupHint = (() => {
    if (!debouncedEmail || debouncedEmail.length <= 3) return 'Enter an email address.';
    if (lookup.isFetching) return 'Looking up…';
    if (lookup.data) return `Found: ${lookup.data.displayName}`;
    if (lookup.isError) return 'Could not look up that user.';
    if (lookup.data === null) return 'No user with that email.';
    return null;
  })();

  return (
    <Modal isOpen ariaLabel={`Share ${target.name}`} onClose={onClose}>
      <ModalHeader>Share {target.name}</ModalHeader>
      <ModalBody>
        <p style={{ marginBottom: 12, fontSize: 13 }}>
          People you share with can search and chat against this collection. They cannot
          add, modify, or delete its contents.
        </p>

        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Email</span>
          <input
            type="email"
            aria-label="Email"
            value={emailInput}
            onChange={(event) => setEmailInput(event.target.value)}
            placeholder="person@example.com"
            style={{
              width: '100%',
              padding: '8px 10px',
              border: '1px solid var(--border-light)',
              borderRadius: 2,
              font: 'inherit',
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-primary)',
            }}
            aria-describedby="share-hint"
          />
          <span id="share-hint" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {lookupHint}
          </span>
        </label>

        <Button
          onClick={onGrant}
          disabled={!lookup.data || grant.isPending}
          loading={grant.isPending}
        >
          Add viewer
        </Button>

        <h3 style={{ fontSize: 14, fontWeight: 500, marginTop: 24, marginBottom: 8 }}>
          Current viewers
        </h3>
        {shares.isLoading && <Skeleton variant="row" ariaLabel="Loading viewers" />}
        {shares.data && shares.data.items.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No viewers yet.</p>
        )}
        {shares.data && shares.data.items.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {shares.data.items.map((share) => (
              <li
                key={share.granteeUserId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 0',
                  borderBottom: '1px solid var(--border-light)',
                  fontSize: 14,
                }}
              >
                <span>{share.granteeDisplayName}</span>
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => onRevoke(share)}
                  disabled={revoke.isPending}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Done
        </Button>
      </ModalFooter>
    </Modal>
  );
};
