import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ConfirmModal from './ConfirmModal';

describe('ConfirmModal', () => {
  it('should not render when isOpen is false', () => {
    const { container } = render(
      <ConfirmModal
        isOpen={false}
        title="Test Title"
        message="Test message"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('should render when isOpen is true', () => {
    render(
      <ConfirmModal
        isOpen={true}
        title="Test Title"
        message="Test message"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByText('Test Title')).toBeDefined();
    expect(screen.getByText('Test message')).toBeDefined();
  });

  it('should call onConfirm when Confirm button is clicked', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmModal
        isOpen={true}
        title="Test Title"
        message="Test message"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    );
    const confirmButton = screen.getByText('Confirm');
    fireEvent.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('should call onCancel when cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(
      <ConfirmModal
        isOpen={true}
        title="Test Title"
        message="Test message"
        onConfirm={() => {}}
        onCancel={onCancel}
      />
    );
    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('handles native Escape dismissal through the cancel event', () => {
    const onCancel = vi.fn();
    render(<ConfirmModal isOpen title="Test Title" message="Test message" onConfirm={() => {}} onCancel={onCancel} />);
    const dialog = screen.getByRole('dialog', { name: 'Test Title' });
    expect(dialog.tagName).toBe('DIALOG');
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('blocks dismissal and repeat confirmation while saving', () => {
    const onCancel = vi.fn(); const onConfirm = vi.fn();
    render(<ConfirmModal isOpen busy title="Saving dinner" message="Keep this open" onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Saving…' }));
    expect(onCancel).not.toHaveBeenCalled(); expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('should display multiline messages correctly', () => {
    render(
      <ConfirmModal
        isOpen={true}
        title="Delete Items"
        message="Line 1\nLine 2\nLine 3"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    const message = screen.getByText(/Line 1/);
    expect(message.className).toContain('whitespace-pre-line');
  });
});
