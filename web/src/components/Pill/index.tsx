import styles from './Pill.module.css';

// Status / file-type pill. Always carries a text label — never colour-only,
// per web-accessibility.md and web-branding.md ("status pills carry text
// labels in addition to colour").

export type PillTone = 'info' | 'success' | 'warning' | 'error' | 'neutral';

export interface PillProps {
  tone: PillTone;
  label: string;
}

export const Pill = ({ tone, label }: PillProps) => {
  return <span className={`${styles.pill} ${styles[tone]}`}>{label}</span>;
};
