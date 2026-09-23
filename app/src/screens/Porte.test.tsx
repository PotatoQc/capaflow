// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { useApp } from '../data/AppContext';
import { MemoryProvider } from '../test/MemoryProvider';
import Porte from './Porte';

const STUDENT_LINK = 'https://app.hi.events/check-in/cil_test123#scan';

function LockPrices() {
  const { lockDoorPrices, setCheckinLinks } = useApp();
  return (
    <>
      <button onClick={() => lockDoorPrices(10, 30)}>figer-test</button>
      <button onClick={() => setCheckinLinks({ student: STUDENT_LINK, regular: '' })}>liens-test</button>
    </>
  );
}

const renderPorte = () =>
  render(
    <MemoryRouter>
      <MemoryProvider>
        <Porte />
        <LockPrices />
      </MemoryProvider>
    </MemoryRouter>,
  );

afterEach(cleanup);

describe('Écran Porte (scénario 23:00, 195 personnes, prix automatiques 8 $ / 23 $)', () => {
  it('vente mixte (2 étudiants + 1 autre) puis annulation du groupe entier', () => {
    renderPorte();
    fireEvent.click(screen.getByRole('button', { name: /VENTE/ }));
    const addStudent = screen.getByRole('button', { name: 'Ajouter un billet Étudiant' });
    fireEvent.click(addStudent);
    fireEvent.click(addStudent);
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un billet Autre' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer 3 billets · 39 $' }));
    expect(screen.getByText('198')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Annuler dernier/ }));
    expect(screen.getByText('195')).toBeTruthy();
  });

  it('quantité plafonnée aux places vendables (V = 8)', () => {
    renderPorte();
    fireEvent.click(screen.getByRole('button', { name: /VENTE/ }));
    const add = screen.getByRole('button', { name: 'Ajouter un billet Étudiant' }) as HTMLButtonElement;
    for (let i = 0; i < 12; i++) fireEvent.click(add);
    expect(screen.getByLabelText('Billets Étudiant').textContent).toBe('8');
    expect(add.disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Confirmer 8 billets · 64 $' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('le bouton Vente affiche les billets encore disponibles (V = 8)', () => {
    renderPorte();
    expect(screen.getByText('8 billets disponibles')).toBeTruthy();
  });

  it('sortie puis réentrée', () => {
    renderPorte();
    fireEvent.click(screen.getByRole('button', { name: /SORTIE/ }));
    expect(screen.getByText('194')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /RÉENTRÉE/ }));
    expect(screen.getByText('195')).toBeTruthy();
  });

  it('dates limites d’âge au 25 septembre', () => {
    renderPorte();
    expect(screen.getByText(/né\(e\) le 25\/09\/2008 ou avant/)).toBeTruthy();
    expect(screen.getByText(/né\(e\) le 25\/09\/2009 ou avant/)).toBeTruthy();
  });

  it('boutons de check-in toujours visibles, actifs une fois les liens configurés', () => {
    renderPorte();
    expect(screen.queryByRole('link', { name: /Check-in/ })).toBeNull();
    expect((screen.getByRole('button', { name: /Check-in étudiant/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText('liens-test'));
    const link = screen.getByRole('link', { name: /Check-in étudiant/ }) as HTMLAnchorElement;
    expect(link.href).toBe(STUDENT_LINK);
    expect(link.rel).toBe('noopener noreferrer');
    expect((screen.getByRole('button', { name: /Check-in régulier/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('bandeau « Nouveau prix » quand les prix changent', () => {
    renderPorte();
    expect(screen.queryByText(/NOUVEAU PRIX/)).toBeNull();
    fireEvent.click(screen.getByText('figer-test'));
    expect(screen.getByText('NOUVEAU PRIX : 10 $ · 30 $')).toBeTruthy();
  });
});
