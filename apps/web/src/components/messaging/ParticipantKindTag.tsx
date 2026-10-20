import React from 'react';
import { Tag } from 'antd';
import type { MessagingParticipant } from '../../services/messaging-service';
import { participantKindLabel } from './messaging-utils';

/** Distinction visuelle équipe / client. */
export function ParticipantKindTag({ kind }: { kind: MessagingParticipant['kind'] }) {
  return (
    <Tag color={kind === 'STAFF' ? 'blue' : 'gold'} style={{ marginInlineEnd: 0 }}>
      {participantKindLabel(kind)}
    </Tag>
  );
}
