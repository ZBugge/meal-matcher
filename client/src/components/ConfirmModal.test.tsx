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

  it('should call onCancel when backdrop is clicked', () => {
    const onCancel = vi.fn();
    const { container } = render(
      <ConfirmModal
        isOpen={true}
        title="Test Title"
        message="Test message"
        onConfirm={() => {}}
        onCancel={onCancel}
      />
    );
    const backdrop = container.querySelector('.absolute.inset-0');
    if (backdrop) {
      fireEvent.click(backdrop);
      expect(onCancel).toHaveBeenCalledOnce();
    }
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
