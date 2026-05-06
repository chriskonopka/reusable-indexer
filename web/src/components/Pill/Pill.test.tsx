import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { Pill, PillTone } from './index';

const tones: PillTone[] = ['info', 'success', 'warning', 'error', 'neutral'];

describe('Pill', () => {
  it('renders the label as visible text', () => {
    render(<Pill tone="info" label="Indexed" />);
    expect(screen.getByText('Indexed')).toBeInTheDocument();
  });

  it.each(tones)('has no axe violations in the %s tone', async (tone) => {
    const { container } = render(<Pill tone={tone} label="status" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
