// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { AlertProvider } from '../alerts/AlertProvider';
import { useApp } from '../data/AppContext';
import { MemoryProvider } from '../test/MemoryProvider';
import Journal from './Journal';

function AddStaff() {
  const { record } = useApp();
  return <button onClick={() => record('staff')}>staff-test</button>;
}

const renderJournal = () =>
  render(
    <MemoryRouter>
      <MemoryProvider>
        <AlertProvider>
          <Journal />
          <AddStaff />
        </AlertProvider>
      </MemoryProvider>
    </MemoryRouter>,
  );

afterEach(cleanup);

describe('Page Journal', () => {
  it('vide au départ, puis liste une action qu’on peut annuler', () => {
    renderJournal();
    expect(screen.getByText("Aucune action pour l'instant.")).toBeTruthy();
    fireEvent.click(screen.getByText('staff-test'));
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.getByText('Annulé')).toBeTruthy();
  });
});
