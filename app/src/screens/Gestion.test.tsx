// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { AlertProvider } from '../alerts/AlertProvider';
import { DemoProvider, useDemo } from '../demo/DemoContext';
import Gestion from './Gestion';

function Probe() {
  const { state, setRole } = useDemo();
  return (
    <>
      <span data-testid="cap">{state.capacity}</span>
      <button onClick={() => setRole('admin')}>admin-test</button>
    </>
  );
}

const renderGestion = () =>
  render(
    <MemoryRouter>
      <DemoProvider>
        <AlertProvider>
          <Gestion />
          <Probe />
        </AlertProvider>
      </DemoProvider>
    </MemoryRouter>,
  );

afterEach(cleanup);

describe('Écran Gestion', () => {
  it('capacité : rien pendant la saisie, confirmation au-delà de 255', () => {
    renderGestion();
    const input = screen.getByLabelText('Capacité');
    fireEvent.change(input, { target: { value: '28' } });
    expect(screen.getByTestId('cap').textContent).toBe('255');
    fireEvent.change(input, { target: { value: '280' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('cap').textContent).toBe('255');
    fireEvent.click(screen.getByRole('button', { name: 'Monter à 280' }));
    expect(screen.getByTestId('cap').textContent).toBe('280');
  });

  it('fermer les ventes demande une confirmation', () => {
    renderGestion();
    const toggle = screen.getByLabelText('Ventes ouvertes') as HTMLInputElement;
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Fermer les ventes' }));
    expect(toggle.checked).toBe(false);
  });

  it('prix : un multiplicateur à 0 bloque l’enregistrement', () => {
    renderGestion();
    fireEvent.change(screen.getByLabelText('Multiplicateur du palier 1'), { target: { value: '0' } });
    expect(screen.getByText('Multiplicateurs de palier : entre 0,05 et 5.')).toBeTruthy();
    expect((screen.getAllByRole('button', { name: 'Enregistrer' })[1] as HTMLButtonElement).disabled).toBe(true);
  });

  it('prix : passage en mode figé', () => {
    renderGestion();
    expect(screen.getByText(/\(automatique\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Figé' }));
    expect(screen.getByText(/\(figé\)/)).toBeTruthy();
  });

  it('liens de check-in : seuls les liens Hi.Events sont acceptés', () => {
    renderGestion();
    fireEvent.click(screen.getByText('admin-test'));
    const field = screen.getByLabelText('Lien check-in étudiant');
    const save = screen.getByRole('button', { name: 'Enregistrer les liens' }) as HTMLButtonElement;
    for (const bad of ['javascript:alert(1)', 'https://evil.example/check-in/cil_x', 'http://app.hi.events/check-in/cil_x']) {
      fireEvent.change(field, { target: { value: bad } });
      expect(save.disabled).toBe(true);
    }
    fireEvent.change(field, { target: { value: 'https://app.hi.events/check-in/cil_Exemple123#scan' } });
    expect(save.disabled).toBe(false);
  });

  it('le dernier Admin ne peut pas être désactivé', () => {
    renderGestion();
    fireEvent.click(screen.getByText('admin-test'));
    const buttons = screen.getAllByRole('button', { name: 'Désactiver' }) as HTMLButtonElement[];
    expect(buttons[0].disabled).toBe(true);
    expect(buttons[1].disabled).toBe(false);
  });
});
