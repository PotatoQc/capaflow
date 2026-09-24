// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { AlertProvider } from '../alerts/AlertProvider';
import { MemoryProvider } from '../test/MemoryProvider';
import Tableau from './Tableau';

const renderAs = (role: 'admin' | 'viewer') =>
  render(
    <MemoryRouter>
      <MemoryProvider role={role}>
        <AlertProvider>
          <Tableau />
        </AlertProvider>
      </MemoryProvider>
    </MemoryRouter>,
  );

afterEach(cleanup);

describe('Tableau', () => {
  it('Admin : tuile Staff à côté des billets', () => {
    renderAs('admin');
    expect(screen.getByText('Staff')).toBeTruthy();
    expect(screen.getByText('Billets étudiants')).toBeTruthy();
  });

  it('Viewer : vitrine Neon Party avec staff, sans prix ni places vendables', () => {
    const { container } = renderAs('viewer');
    expect(screen.getByRole('heading', { name: 'Neon Party' })).toBeTruthy();
    expect(screen.getByText('Staff')).toBeTruthy();
    expect(container.textContent).not.toMatch(/\$|VOUS POUVEZ VENDRE/);
  });
});
