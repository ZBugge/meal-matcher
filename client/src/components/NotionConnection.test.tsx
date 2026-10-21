import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NotionConnection from './NotionConnection';
import { notionApi, type NotionConnectionStatus, type NotionRefreshResult } from '../api/client';

vi.mock('../api/client', () => ({ notionApi: { status: vi.fn(), connect: vi.fn(), refresh: vi.fn(), disconnect: vi.fn() } }));
const status: NotionConnectionStatus = { connected: true, sourceUrl: 'https://www.notion.so/123', lastRefreshedAt: '2026-10-19T16:00:00Z', lastError: null, recipeCount: 3 };
const refreshed: NotionRefreshResult = { ...status, added: 0, updated: 1, removed: 0 };
beforeEach(() => { vi.resetAllMocks(); vi.mocked(notionApi.status).mockResolvedValue(status); });

describe('Notion connection controls', () => {
  it('connects explicitly with private token input, clears it on success and reloads recipes', async () => {
    vi.mocked(notionApi.status).mockResolvedValue({ ...status, connected: false, sourceUrl: null });
    vi.mocked(notionApi.connect).mockResolvedValue({ ...refreshed, added: 3, updated: 0 });
    const changed = vi.fn().mockResolvedValue(undefined);
    render(<NotionConnection onRefreshed={changed} />);
    const token = await screen.findByLabelText('Notion connection token');
    expect(token).toHaveAttribute('type', 'password');
    fireEvent.change(token, { target: { value: 'private-test-token' } });
    fireEvent.change(screen.getByLabelText('Recipe database link'), { target: { value: status.sourceUrl } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect and refresh' }));
    expect(await screen.findByText('3 added · 0 updated · 0 removed')).toBeVisible();
    expect(notionApi.connect).toHaveBeenCalledWith('private-test-token', status.sourceUrl);
    expect(changed).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Connection settings' }));
    expect(screen.getByLabelText('Notion connection token')).toHaveValue('');
    expect(localStorage.getItem('private-test-token')).toBeNull();
  });

  it('blocks duplicate refreshes, preserves the last successful status on failure and requires explicit retry', async () => {
    let reject!: (error: Error) => void;
    vi.mocked(notionApi.refresh).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    const changed = vi.fn().mockResolvedValue(undefined);
    render(<NotionConnection onRefreshed={changed} />);
    const refresh = await screen.findByRole('button', { name: 'Refresh' });
    fireEvent.click(refresh); fireEvent.click(refresh);
    expect(notionApi.refresh).toHaveBeenCalledTimes(1); expect(refresh).toBeDisabled();
    await act(async () => reject(new Error('Notion access failed.')));
    expect(await screen.findByRole('alert')).toHaveTextContent('Notion access failed.');
    expect(screen.getByText(/Last refreshed/)).toBeVisible(); expect(changed).not.toHaveBeenCalled();
    expect(notionApi.refresh).toHaveBeenCalledTimes(1);
    vi.mocked(notionApi.refresh).mockResolvedValue(refreshed);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText('0 added · 1 updated · 0 removed')).toBeVisible();
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('disconnects access while retaining recipe copies and offers reconnect', async () => {
    vi.mocked(notionApi.disconnect).mockResolvedValue({ ...status, connected: false, sourceUrl: null });
    render(<NotionConnection onRefreshed={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect' }));
    expect(await screen.findByText('Disconnected. Your saved recipe copies are still available.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Connect and refresh' })).toBeVisible();
    expect(notionApi.disconnect).toHaveBeenCalledTimes(1);
  });
});
